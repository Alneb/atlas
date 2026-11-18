//! Opening a TCP connection to a host with several addresses, the way browsers do (Happy Eyeballs, RFC 8305).
//!
//! `TcpStream::connect("host:port")` tries the addresses one after another: on a network whose IPv6 is broken (an
//! address handed out, no route behind it) the first IPv6 attempt hangs in SYN-SENT for minutes, the caller's timeout
//! fires first, and IPv4 is never tried — every sync fails while a browser on the same machine works. Here the
//! attempts are raced: families interleaved, a new one started every [`STAGGER`] or as soon as one fails, the first
//! connection up wins and the others are dropped.

use std::io;
use std::net::SocketAddr;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::task::JoinSet;

/// How long an attempt has alone before the next address is tried beside it (RFC 8305 recommends 250 ms).
pub const STAGGER: Duration = Duration::from_millis(250);

/// The addresses of `host:port`, raced; the error of the last attempt to fail when none connects.
pub async fn connect(host: &str, port: u16) -> io::Result<TcpStream> {
    let addrs: Vec<SocketAddr> = tokio::net::lookup_host((host, port)).await?.collect();
    race(addrs).await
}

/// The first of `addrs` to connect, attempts started [`STAGGER`] apart in [`interleave`]d order.
pub async fn race(addrs: Vec<SocketAddr>) -> io::Result<TcpStream> {
    let mut waiting = interleave(addrs).into_iter();
    let mut running = JoinSet::new();
    let mut last: Option<io::Error> = None;
    loop {
        if let Some(a) = waiting.next() {
            running.spawn(TcpStream::connect(a));
        }
        if running.is_empty() {
            return Err(last.unwrap_or_else(|| io::Error::new(io::ErrorKind::NotFound, "the name has no address")));
        }
        let more = waiting.len() > 0;
        tokio::select! {
            Some(done) = running.join_next() => match done {
                Ok(Ok(tcp)) => return Ok(tcp), // dropping `running` aborts the other attempts
                Ok(Err(e)) => last = Some(e),  // failed: the next address starts at once
                Err(e) => last = Some(io::Error::other(e)),
            },
            _ = tokio::time::sleep(STAGGER), if more => {}
        }
    }
}

/// The resolver's order kept within each family, the families alternated starting with the resolver's first choice
/// (RFC 8305 §4): one dead family costs one [`STAGGER`], not all of its addresses.
pub fn interleave(addrs: Vec<SocketAddr>) -> Vec<SocketAddr> {
    let Some(first) = addrs.first().copied() else { return addrs };
    let (mut a, mut b): (Vec<_>, Vec<_>) = addrs.into_iter().partition(|x| x.is_ipv6() == first.is_ipv6());
    let mut out = Vec::with_capacity(a.len() + b.len());
    let (mut a, mut b) = (a.drain(..), b.drain(..));
    loop {
        match (a.next(), b.next()) {
            (None, None) => return out,
            (x, y) => out.extend(x.into_iter().chain(y)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn sa(s: &str) -> SocketAddr {
        s.parse().unwrap()
    }

    #[test]
    fn families_alternate_from_the_resolvers_first() {
        let got = interleave(vec![sa("[2001:db8::1]:993"), sa("[2001:db8::2]:993"), sa("192.0.2.1:993"), sa("192.0.2.2:993"), sa("192.0.2.3:993")]);
        assert_eq!(got, vec![sa("[2001:db8::1]:993"), sa("192.0.2.1:993"), sa("[2001:db8::2]:993"), sa("192.0.2.2:993"), sa("192.0.2.3:993")]);
        assert_eq!(interleave(vec![sa("192.0.2.1:1")]), vec![sa("192.0.2.1:1")]);
        assert!(interleave(vec![]).is_empty());
    }

    /// The case that broke mail: the first address never answers (a blackholed one: TEST-NET-1, no SYN-ACK ever), a
    /// later one does — connected within a few staggers, not after the system's minutes of SYN retries.
    #[tokio::test]
    async fn a_dead_first_address_does_not_hold_the_live_one() {
        let live = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = live.local_addr().unwrap().port();
        let t = Instant::now();
        let tcp = race(vec![sa("[2001:db8::1]:993"), sa("192.0.2.1:993"), sa(&format!("127.0.0.1:{port}"))]).await.unwrap();
        assert_eq!(tcp.peer_addr().unwrap().port(), port);
        assert!(t.elapsed() < Duration::from_secs(3), "took {:?}", t.elapsed());
    }

    #[tokio::test]
    async fn every_address_refused_says_why() {
        // a port bound then freed: nothing listens there, the connection is refused at once
        let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let e = race(vec![sa(&format!("127.0.0.1:{port}"))]).await.unwrap_err();
        assert_eq!(e.kind(), io::ErrorKind::ConnectionRefused);
        assert_eq!(race(vec![]).await.unwrap_err().kind(), io::ErrorKind::NotFound);
    }
}
