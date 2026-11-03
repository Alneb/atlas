//! Web pages as tabs on Linux: a library preloaded into WebKitGTK's network process (main.rs `frames_preload`) that
//! wraps three libsoup calls WebKit makes for every request, so a site framed by Atlas's own page (the core, on a
//! loopback address) shows and stays signed in, as on Windows (webview2/frame-any) and in Electron apps:
//! - `soup_message_get_response_headers`: for a load inside Atlas's page (its first party) that is not a top-level
//!   navigation, `X-Frame-Options` goes and the CSP loses its `frame-ancestors` directive (the rest of the site's policy stays);
//! - `soup_cookie_jar_get_cookie_list_with_same_site_info` / `soup_cookie_jar_add_cookie_full`: a request or a cookie
//!   whose first party is Atlas's page counts as first-party for its own site, so `SameSite` session cookies flow.
//!
//! Nothing changes for any other page. Inactive (a pass-through) in every process but `WebKitNetworkProcess`; in each
//! process it is loaded into, it takes itself out of `LD_PRELOAD`, so what that process starts never loads it.
//! Built by build.rs with plain rustc (no crates), embedded in atlas-app. docs/guides/DEVELOPING.md, "Web pages as tabs".
#![allow(clippy::missing_safety_doc)]
use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::sync::atomic::{AtomicBool, Ordering};

extern "C" {
    fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
    fn getenv(name: *const c_char) -> *const c_char;
    fn setenv(name: *const c_char, value: *const c_char, overwrite: c_int) -> c_int;
    fn unsetenv(name: *const c_char) -> c_int;
}
const RTLD_NEXT: *mut c_void = -1isize as *mut c_void;
const RTLD_DEFAULT: *mut c_void = std::ptr::null_mut();
/// The file's name, as main.rs writes it: what is taken out of LD_PRELOAD.
const NAME: &str = "atlas-webkit-frames";

static ACTIVE: AtomicBool = AtomicBool::new(false);
/// `ATLAS_FRAMES_DEBUG=1`: each decision on stderr (the network process writes to the app's).
static DEBUG: AtomicBool = AtomicBool::new(false);

#[used]
#[link_section = ".init_array"]
static INIT: extern "C" fn() = init;

extern "C" fn init() {
    let exe = std::fs::read_link("/proc/self/exe").ok();
    let network = exe.as_ref().and_then(|p| p.file_name()).is_some_and(|n| n == "WebKitNetworkProcess");
    ACTIVE.store(network, Ordering::Relaxed);
    DEBUG.store(std::env::var_os("ATLAS_FRAMES_DEBUG").is_some(), Ordering::Relaxed);
    if network && DEBUG.load(Ordering::Relaxed) {
        eprintln!("[frames] active in the network process");
    }
    unsafe { leave_preload() };
}

/// Takes this library out of LD_PRELOAD (before main: one thread).
unsafe fn leave_preload() {
    let key = c"LD_PRELOAD";
    let v = getenv(key.as_ptr());
    if v.is_null() {
        return;
    }
    let rest: Vec<&str> = CStr::from_ptr(v).to_str().unwrap_or("").split([':', ' ']).filter(|p| !p.is_empty() && !p.contains(NAME)).collect();
    if rest.is_empty() {
        unsetenv(key.as_ptr());
    } else if let Ok(c) = CString::new(rest.join(":")) {
        setenv(key.as_ptr(), c.as_ptr(), 1);
    }
}

/// A libsoup or GLib function, looked up once (`next`: the one this library wraps).
macro_rules! sym {
    ($cache:ident, $handle:expr, $name:literal, $ty:ty) => {{
        static $cache: std::sync::OnceLock<usize> = std::sync::OnceLock::new();
        let p = *$cache.get_or_init(|| unsafe { dlsym($handle, concat!($name, "\0").as_ptr().cast()) } as usize);
        if p == 0 { None } else { Some(unsafe { std::mem::transmute::<usize, $ty>(p) }) }
    }};
}

type Ptr = *mut c_void;

/// Atlas's own page: the desktop core serves it on a loopback address.
fn loopback(host: &str) -> bool {
    matches!(host, "127.0.0.1" | "localhost" | "::1" | "[::1]")
}

/// The host of a URL string (`http://127.0.0.1:8080/x` → `127.0.0.1`).
fn host_of(url: &str) -> &str {
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    let authority = authority.rsplit_once('@').map_or(authority, |(_, a)| a);
    if let Some(v6) = authority.strip_prefix('[') {
        return v6.split(']').next().unwrap_or("");
    }
    authority.split(':').next().unwrap_or("")
}

unsafe fn cstr<'a>(p: *const c_char) -> Option<&'a str> {
    (!p.is_null()).then(|| CStr::from_ptr(p).to_str().ok()).flatten()
}

/// A GUri's host, None for no URI.
unsafe fn uri_host<'a>(uri: Ptr) -> Option<&'a str> {
    if uri.is_null() {
        return None;
    }
    let get = sym!(GET_HOST, RTLD_DEFAULT, "g_uri_get_host", unsafe extern "C" fn(Ptr) -> *const c_char)?;
    cstr(get(uri))
}

/// Is this URI Atlas's page (the first party a framed site gets treated as its own)?
unsafe fn is_atlas(uri: Ptr) -> bool {
    uri_host(uri).is_some_and(loopback)
}

/// A policy (one of a header's comma-separated policies) without its `frame-ancestors` directive.
fn without_frame_ancestors(csp: &str) -> String {
    csp.split(',')
        .map(|policy| policy.split(';').filter(|d| !d.trim().to_ascii_lowercase().starts_with("frame-ancestors")).collect::<Vec<_>>().join(";"))
        .filter(|p| !p.trim().is_empty())
        .collect::<Vec<_>>()
        .join(",")
}

#[no_mangle]
pub unsafe extern "C" fn soup_message_get_response_headers(msg: Ptr) -> Ptr {
    let Some(real) = sym!(REAL_RESPONSE, RTLD_NEXT, "soup_message_get_response_headers", unsafe extern "C" fn(Ptr) -> Ptr) else {
        return std::ptr::null_mut();
    };
    let headers = real(msg);
    if !headers.is_null() && ACTIVE.load(Ordering::Relaxed) {
        let _ = std::panic::catch_unwind(|| unframe(msg, headers));
    }
    headers
}

/// Lets Atlas's page frame this response, nothing else: a load inside Atlas's page (WebKit's first party for it is
/// the page, on loopback), not a top-level navigation, for another site. `Sec-Fetch-Dest` and `Referer` would say the
/// same but WebKit sends neither to a plain-http site. X-Frame-Options and `frame-ancestors` only matter on a document,
/// so a subresource losing them changes nothing.
unsafe fn unframe(msg: Ptr, headers: Ptr) {
    type GetOne = unsafe extern "C" fn(Ptr, *const c_char) -> *const c_char;
    let (Some(first_party), Some(top_level), Some(uri), Some(get_list), Some(remove), Some(replace)) = (
        sym!(FIRST_PARTY, RTLD_DEFAULT, "soup_message_get_first_party", unsafe extern "C" fn(Ptr) -> Ptr),
        sym!(TOP_LEVEL, RTLD_DEFAULT, "soup_message_get_is_top_level_navigation", unsafe extern "C" fn(Ptr) -> c_int),
        sym!(URI, RTLD_DEFAULT, "soup_message_get_uri", unsafe extern "C" fn(Ptr) -> Ptr),
        sym!(GET_LIST, RTLD_DEFAULT, "soup_message_headers_get_list", GetOne),
        sym!(REMOVE, RTLD_DEFAULT, "soup_message_headers_remove", unsafe extern "C" fn(Ptr, *const c_char)),
        sym!(REPLACE, RTLD_DEFAULT, "soup_message_headers_replace", unsafe extern "C" fn(Ptr, *const c_char, *const c_char)),
    ) else {
        return;
    };
    let (fp, u, top) = (first_party(msg), uri(msg), top_level(msg) != 0);
    if DEBUG.load(Ordering::Relaxed) {
        eprintln!("[frames] {:?} first party {:?} top-level {top}", uri_host(u), uri_host(fp));
    }
    if top || !is_atlas(fp) || is_atlas(u) {
        return;
    }
    remove(headers, c"X-Frame-Options".as_ptr());
    let csp = c"Content-Security-Policy";
    // libsoup 3: the headers keep the string (transfer none) — never freed here (a free crashed the network process)
    if let Some(policy) = cstr(get_list(headers, csp.as_ptr())).filter(|p| p.to_ascii_lowercase().contains("frame-ancestors")) {
        match CString::new(without_frame_ancestors(policy)) {
            Ok(rest) if !rest.as_bytes().is_empty() => replace(headers, csp.as_ptr(), rest.as_ptr()),
            _ => remove(headers, csp.as_ptr()),
        }
    }
}

#[no_mangle]
pub unsafe extern "C" fn soup_cookie_jar_get_cookie_list_with_same_site_info(
    jar: Ptr,
    uri: Ptr,
    top_level: Ptr,
    site_for_cookies: Ptr,
    for_http: c_int,
    is_safe_method: c_int,
    is_top_level_navigation: c_int,
) -> Ptr {
    type F = unsafe extern "C" fn(Ptr, Ptr, Ptr, Ptr, c_int, c_int, c_int) -> Ptr;
    let Some(real) = sym!(REAL_LIST, RTLD_NEXT, "soup_cookie_jar_get_cookie_list_with_same_site_info", F) else {
        return std::ptr::null_mut();
    };
    // a site inside Atlas's page is its own first party: its SameSite cookies come along, as in its own tab
    if ACTIVE.load(Ordering::Relaxed) && (is_atlas(site_for_cookies) || is_atlas(top_level)) && !is_atlas(uri) {
        return real(jar, uri, uri, uri, for_http, is_safe_method, is_top_level_navigation);
    }
    real(jar, uri, top_level, site_for_cookies, for_http, is_safe_method, is_top_level_navigation)
}

#[no_mangle]
pub unsafe extern "C" fn soup_cookie_jar_add_cookie_full(jar: Ptr, cookie: Ptr, uri: Ptr, first_party: Ptr) {
    let Some(real) = sym!(REAL_ADD, RTLD_NEXT, "soup_cookie_jar_add_cookie_full", unsafe extern "C" fn(Ptr, Ptr, Ptr, Ptr)) else {
        return;
    };
    // a cookie set from inside Atlas's page is kept as the site's own (else the third-party policy drops it)
    if ACTIVE.load(Ordering::Relaxed) && is_atlas(first_party) && !uri.is_null() && !is_atlas(uri) {
        return real(jar, cookie, uri, uri);
    }
    real(jar, cookie, uri, first_party)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_frame_ancestors_directive_goes() {
        assert_eq!(without_frame_ancestors("default-src 'self'; frame-ancestors 'none'; img-src *"), "default-src 'self'; img-src *");
        assert_eq!(without_frame_ancestors("frame-ancestors 'self'"), "");
        assert_eq!(without_frame_ancestors("script-src 'self', frame-ancestors https://a.example"), "script-src 'self'");
    }

    #[test]
    fn atlas_is_the_loopback_page() {
        assert_eq!(host_of("http://127.0.0.1:4317/v/notes/"), "127.0.0.1");
        assert_eq!(host_of("http://[::1]:80/"), "::1");
        assert_eq!(host_of("https://user@github.com/x"), "github.com");
        assert!(loopback(host_of("http://localhost:9/")) && !loopback(host_of("https://127.0.0.1.example.org/")));
    }
}
