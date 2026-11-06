//! TLS for every HTTP client of the core: the usual web roots, and a server that leaves its intermediate certificate
//! out of the handshake is still reached, as a browser reaches it. A browser fetches the missing intermediate from the
//! address the server's own certificate names (its Authority Information Access `caIssuers`, an `http://` URL by RFC
//! 5280) and checks the whole chain against its roots; curl and rustls do not, and fail with "unknown issuer". Here
//! the verifier does what the browser does: on `UnknownIssuer` it fetches the intermediate (at most three hops, each
//! kept for the process), adds it to what the server sent and verifies again — so nothing is trusted that does not
//! chain to a root, and a fetched certificate is only ever an intermediate, never an anchor.
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::client::WebPkiServerVerifier;
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{CertificateError, ClientConfig, DigitallySignedStruct, RootCertStore, SignatureScheme};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

/// How many missing certificates are fetched one after another (leaf → intermediate → another intermediate).
const HOPS: usize = 3;
/// An intermediate is a few kilobytes; anything much larger is not one.
const MAX_CERT: usize = 64 * 1024;
const FETCH_TIMEOUT: Duration = Duration::from_secs(5);

/// The TLS settings every client of the core is built with (`ClientBuilder::use_preconfigured_tls`).
pub fn config() -> ClientConfig {
    static CONFIG: LazyLock<ClientConfig> = LazyLock::new(|| {
        let roots = RootCertStore { roots: webpki_roots::TLS_SERVER_ROOTS.to_vec() };
        with_verifier(Arc::new(Verifier::new(roots).expect("the web roots build a verifier")))
    });
    CONFIG.clone()
}

fn provider() -> Arc<rustls::crypto::CryptoProvider> {
    Arc::new(rustls::crypto::ring::default_provider())
}

fn with_verifier(v: Arc<Verifier>) -> ClientConfig {
    let mut c = ClientConfig::builder_with_provider(provider())
        .with_safe_default_protocol_versions()
        .expect("ring offers TLS 1.2 and 1.3")
        .dangerous() // a verifier of our own, which still verifies everything through webpki
        .with_custom_certificate_verifier(v)
        .with_no_client_auth();
    c.alpn_protocols = vec![b"http/1.1".to_vec()];
    c
}

/// webpki's verifier, then the missing intermediates fetched by their `caIssuers` address.
#[derive(Debug)]
pub struct Verifier {
    inner: Arc<WebPkiServerVerifier>,
    /// `caIssuers` URL → the certificate found there (`None`: nothing usable, not asked again).
    found: Mutex<HashMap<String, Option<CertificateDer<'static>>>>,
}

impl Verifier {
    pub fn new(roots: RootCertStore) -> Result<Self, rustls::client::VerifierBuilderError> {
        let inner = WebPkiServerVerifier::builder_with_provider(Arc::new(roots), provider()).build()?;
        Ok(Self { inner, found: Mutex::default() })
    }

    /// The certificate at `url`, fetched once per process.
    fn intermediate(&self, url: &str) -> Option<CertificateDer<'static>> {
        if let Some(known) = self.found.lock().unwrap_or_else(|e| e.into_inner()).get(url) {
            return known.clone();
        }
        let got = fetch_http(url).and_then(|body| certificate(&body));
        match &got {
            Some(_) => eprintln!("atlas: tls: a server left out its intermediate certificate; fetched it from {url}"),
            None => eprintln!("atlas: tls: a server left out its intermediate certificate and {url} gave none"),
        }
        self.found.lock().unwrap_or_else(|e| e.into_inner()).insert(url.to_string(), got.clone());
        got
    }
}

impl ServerCertVerifier for Verifier {
    fn verify_server_cert(&self, end_entity: &CertificateDer<'_>, intermediates: &[CertificateDer<'_>], server_name: &ServerName<'_>, ocsp: &[u8], now: UnixTime) -> Result<ServerCertVerified, rustls::Error> {
        let mut chain: Vec<CertificateDer<'_>> = intermediates.to_vec();
        let mut tried = 0;
        loop {
            match self.inner.verify_server_cert(end_entity, &chain, server_name, ocsp, now) {
                Err(rustls::Error::InvalidCertificate(CertificateError::UnknownIssuer)) if tried < HOPS => {
                    tried += 1;
                    // the last certificate of the chain so far names where its issuer is published
                    let last = chain.last().unwrap_or(end_entity);
                    let Some(next) = ca_issuers(last).and_then(|url| self.intermediate(&url)) else {
                        return Err(rustls::Error::InvalidCertificate(CertificateError::UnknownIssuer));
                    };
                    if chain.iter().any(|c| c.as_ref() == next.as_ref()) {
                        return Err(rustls::Error::InvalidCertificate(CertificateError::UnknownIssuer)); // a loop
                    }
                    chain.push(next);
                }
                other => return other,
            }
        }
    }

    fn verify_tls12_signature(&self, message: &[u8], cert: &CertificateDer<'_>, dss: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, rustls::Error> {
        self.inner.verify_tls12_signature(message, cert, dss)
    }

    fn verify_tls13_signature(&self, message: &[u8], cert: &CertificateDer<'_>, dss: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, rustls::Error> {
        self.inner.verify_tls13_signature(message, cert, dss)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.inner.supported_verify_schemes()
    }
}

/// The `caIssuers` address in a certificate's Authority Information Access: the access method's OID
/// (1.3.6.1.5.5.7.48.2) followed by a URI general name (`[6]`), read straight from the DER.
pub fn ca_issuers(der: &[u8]) -> Option<String> {
    const CA_ISSUERS: &[u8] = &[0x06, 0x08, 0x2b, 0x06, 0x01, 0x05, 0x05, 0x07, 0x30, 0x02];
    let mut from = 0;
    while let Some(at) = der[from..].windows(CA_ISSUERS.len()).position(|w| w == CA_ISSUERS) {
        let rest = &der[from + at + CA_ISSUERS.len()..];
        from += at + 1;
        let (len, body) = match rest {
            [0x86, 0x81, n, body @ ..] => (*n as usize, body),
            [0x86, n, body @ ..] if *n < 0x80 => (*n as usize, body),
            _ => continue,
        };
        let url = std::str::from_utf8(body.get(..len)?).ok()?;
        if url.starts_with("http://") {
            return Some(url.to_string());
        }
    }
    None
}

/// A certificate as published at a `caIssuers` address: DER, or PEM (the first certificate).
fn certificate(body: &[u8]) -> Option<CertificateDer<'static>> {
    if body.first() == Some(&0x30) {
        return Some(CertificateDer::from(body.to_vec()));
    }
    let text = std::str::from_utf8(body).ok()?;
    let b64: String = text.split("-----BEGIN CERTIFICATE-----").nth(1)?.split("-----END CERTIFICATE-----").next()?.split_whitespace().collect();
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD.decode(b64).ok().map(CertificateDer::from)
}

/// A plain `GET` of an `http://` address over a socket: the verifier runs inside a TLS handshake, where neither an
/// async client nor reqwest's blocking one may be started. A certificate is static and small: no redirects, no
/// chunks (HTTP/1.0), a short timeout.
fn fetch_http(url: &str) -> Option<Vec<u8>> {
    let rest = url.strip_prefix("http://")?;
    let (authority, path) = rest.split_once('/').map_or((rest, "/".to_string()), |(a, p)| (a, format!("/{p}")));
    let addr = if authority.contains(':') { authority.to_string() } else { format!("{authority}:80") };
    let host = authority.rsplit_once(':').map_or(authority, |(h, _)| h);
    let target = std::net::ToSocketAddrs::to_socket_addrs(&addr).ok()?.next()?;
    let mut s = std::net::TcpStream::connect_timeout(&target, FETCH_TIMEOUT).ok()?;
    s.set_read_timeout(Some(FETCH_TIMEOUT)).ok()?;
    s.set_write_timeout(Some(FETCH_TIMEOUT)).ok()?;
    let ask = format!("GET {path} HTTP/1.0\r\nHost: {host}\r\nUser-Agent: Atlas/{}\r\nAccept: */*\r\n\r\n", env!("CARGO_PKG_VERSION"));
    s.write_all(ask.as_bytes()).ok()?; // one write: a server may read the request in one go
    // what arrived counts even if the connection is then reset (a server closing with bytes it did not read)
    let mut raw = Vec::new();
    let _ = s.take((MAX_CERT + 8192) as u64).read_to_end(&mut raw);
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n")?;
    let status = std::str::from_utf8(&raw[..split]).ok()?.lines().next()?.to_string();
    if status.split_whitespace().nth(1) != Some("200") {
        return None;
    }
    let body = raw[split + 4..].to_vec();
    (!body.is_empty() && body.len() <= MAX_CERT).then_some(body)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::process::Command;

    fn openssl(dir: &Path, args: &[&str]) {
        let out = Command::new("openssl").args(args).current_dir(dir).output().unwrap();
        assert!(out.status.success(), "openssl {args:?}: {}", String::from_utf8_lossy(&out.stderr));
    }

    /// root → intermediate (published at `aia`) → leaf for `site.example`, made with the openssl CLI.
    fn chain(dir: &Path, aia: &str) -> (Vec<u8>, Vec<u8>, Vec<u8>) {
        std::fs::write(dir.join("int.ext"), "basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n").unwrap();
        std::fs::write(dir.join("leaf.ext"), format!("basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:site.example\nauthorityInfoAccess=caIssuers;URI:{aia}\n")).unwrap();
        for k in ["root", "int", "leaf"] {
            openssl(dir, &["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", &format!("{k}.key")]);
        }
        openssl(dir, &["req", "-x509", "-new", "-key", "root.key", "-subj", "/CN=Test Root", "-days", "3", "-out", "root.pem", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign"]);
        openssl(dir, &["req", "-new", "-key", "int.key", "-subj", "/CN=Test Intermediate", "-out", "int.csr"]);
        openssl(dir, &["x509", "-req", "-in", "int.csr", "-CA", "root.pem", "-CAkey", "root.key", "-CAcreateserial", "-days", "2", "-extfile", "int.ext", "-out", "int.pem"]);
        openssl(dir, &["req", "-new", "-key", "leaf.key", "-subj", "/CN=site.example", "-out", "leaf.csr"]);
        openssl(dir, &["x509", "-req", "-in", "leaf.csr", "-CA", "int.pem", "-CAkey", "int.key", "-CAcreateserial", "-days", "1", "-extfile", "leaf.ext", "-out", "leaf.pem"]);
        let der = |k: &str| {
            openssl(dir, &["x509", "-in", &format!("{k}.pem"), "-outform", "DER", "-out", &format!("{k}.der")]);
            std::fs::read(dir.join(format!("{k}.der"))).unwrap()
        };
        (der("root"), der("int"), der("leaf"))
    }

    /// Serves `body` to every request on `l`.
    fn serve(l: std::net::TcpListener, body: Vec<u8>) {
        std::thread::spawn(move || {
            for mut s in l.incoming().flatten() {
                let (mut got, mut buf) = (Vec::new(), [0u8; 512]);
                while !got.windows(4).any(|w| w == b"\r\n\r\n") {
                    match s.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => got.extend_from_slice(&buf[..n]),
                    }
                }
                let _ = write!(s, "HTTP/1.0 200 OK\r\nContent-Type: application/pkix-cert\r\nContent-Length: {}\r\n\r\n", body.len());
                let _ = s.write_all(&body);
            }
        });
    }

    #[test]
    fn a_missing_intermediate_is_fetched_from_the_leaf_and_must_still_chain_to_a_root() {
        if Command::new("openssl").arg("version").output().is_err() {
            eprintln!("skipped: no openssl CLI to make a test chain");
            return;
        }
        let (dir, other_dir) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let aia = format!("http://127.0.0.1:{}/int.der", listener.local_addr().unwrap().port());
        let (root, int, leaf) = chain(dir.path(), &aia);
        let (stranger, _, _) = chain(other_dir.path(), &aia);
        assert_eq!(ca_issuers(&leaf).as_deref(), Some(aia.as_str()), "the leaf names where its issuer is");
        assert_eq!(ca_issuers(&root), None);
        serve(listener, int);

        let store = |der: Vec<u8>| {
            let mut r = RootCertStore::empty();
            r.add(CertificateDer::from(der)).unwrap();
            r
        };
        let name = ServerName::try_from("site.example").unwrap();
        let (leaf, now) = (CertificateDer::from(leaf), UnixTime::now());

        // the server sent the leaf alone: its intermediate fetched once, the chain verified, the find kept
        let v = Verifier::new(store(root)).unwrap();
        v.verify_server_cert(&leaf, &[], &name, &[], now).expect("verified through the fetched intermediate");
        assert!(v.found.lock().unwrap().get(&aia).is_some_and(Option::is_some), "kept for the next handshake");
        v.verify_server_cert(&leaf, &[], &name, &[], now).expect("and again from what was kept");

        // what was fetched must still chain to a trusted root: a fetched certificate is never an anchor
        let v = Verifier::new(store(stranger)).unwrap();
        assert!(v.verify_server_cert(&leaf, &[], &name, &[], now).is_err(), "a root of the same name but another key");
        assert_eq!(ca_issuers(&[]), None);
    }

    /// On the network (`cargo test -p atlas-core tls_chain -- --ignored`): badssl's server that sends no intermediate.
    #[test]
    #[ignore = "reaches the network"]
    fn a_real_server_without_its_intermediate_is_reached() {
        let plain = reqwest::blocking::Client::builder().build().unwrap();
        assert!(plain.get("https://incomplete-chain.badssl.com/").send().is_err(), "refused without the fetch");
        let ours = reqwest::blocking::Client::builder().use_preconfigured_tls(config()).build().unwrap();
        let r = ours.get("https://incomplete-chain.badssl.com/").send().expect("reached with it");
        assert!(r.status().is_success());
        assert!(ours.get("https://untrusted-root.badssl.com/").send().is_err(), "an untrusted root is still refused");
        assert!(ours.get("https://wrong.host.badssl.com/").send().is_err(), "and a wrong name");
    }

    #[test]
    fn a_pem_intermediate_is_read_too() {
        assert!(certificate(b"<html>no</html>").is_none());
        assert_eq!(certificate(&[0x30, 0x03, 1, 2, 3]).map(|c| c.as_ref().to_vec()), Some(vec![0x30, 0x03, 1, 2, 3]));
        let pem = "-----BEGIN CERTIFICATE-----\nMAMBAgM=\n-----END CERTIFICATE-----\n";
        assert_eq!(certificate(pem.as_bytes()).map(|c| c.as_ref().to_vec()), Some(vec![0x30, 0x03, 1, 2, 3]));
    }
}
