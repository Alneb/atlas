//! Server mode end to end (docs/guides/SERVER.md): a real server on a free port with the password sign-in; every request
//! is checked over HTTP — the redirect to the sign-in page, wrong and right passwords, the session cookie, a
//! capture-only device token, a WebSocket from another site, and that the desktop mode is unchanged.
#![allow(clippy::disallowed_methods)] // a test writes its fixtures directly
use atlas_core::auth::{hash_password, Auth, AuthMode, Scope, ServerSettings};
use atlas_core::server::{serve_on, Listen};
use reqwest::{redirect, StatusCode};

#[tokio::test]
async fn a_served_vault_lets_in_only_who_signed_in() {
    let vault = tempfile::tempdir().unwrap();
    std::fs::write(vault.path().join("note.md"), "# Note\n").unwrap();
    let keys = tempfile::tempdir().unwrap();
    let settings = ServerSettings { auth: AuthMode::Password, password_hash: Some(hash_password("a long password").unwrap()), ..Default::default() };
    let auth = Auth::new(settings, keys.path().join("server.json"));
    let phone = auth.add_token("phone", Scope::Capture).unwrap();
    let srv = serve_on(vault.path().to_path_buf(), Listen::Server { addr: "127.0.0.1:0".parse().unwrap(), auth: Box::new(auth) }).await.unwrap();
    let base = format!("http://127.0.0.1:{}", srv.port());
    let http = reqwest::Client::builder().redirect(redirect::Policy::none()).build().unwrap();
    let get = |path: &str| http.get(format!("{base}{path}")).header("x-atlas", "1");

    // nobody yet: pages go to the sign-in page (coming back here after), the API says 401
    let r = get("/notes?x=1").send().await.unwrap();
    assert_eq!(r.status(), StatusCode::SEE_OTHER);
    assert_eq!(r.headers()["location"], "/login?next=/notes%3Fx%3D1");
    assert_eq!(get("/api/file?path=note.md").send().await.unwrap().status(), StatusCode::UNAUTHORIZED);
    let page = get("/login").send().await.unwrap().text().await.unwrap();
    assert!(page.contains("type=\"password\"") && page.contains("Sign in"), "{page}");

    // a wrong password, then (after the wait) the right one: a session cookie, HttpOnly, SameSite=Strict
    let login = |pw: &str, origin: &str| http.post(format!("{base}/login")).header("origin", origin).form(&[("password", pw), ("next", "/notes")]);
    assert_eq!(login("nope", &base).send().await.unwrap().status(), StatusCode::UNAUTHORIZED);
    assert_eq!(login("a long password", &base).send().await.unwrap().status(), StatusCode::TOO_MANY_REQUESTS, "the second try waits");
    // a form posted from another site is refused whatever the password
    tokio::time::sleep(std::time::Duration::from_millis(1100)).await;
    assert_eq!(login("a long password", "https://evil.example").send().await.unwrap().status(), StatusCode::FORBIDDEN);
    let ok = login("a long password", &base).send().await.unwrap();
    assert_eq!((ok.status(), ok.headers()["location"].to_str().unwrap()), (StatusCode::SEE_OTHER, "/notes"));
    let cookie = ok.headers()["set-cookie"].to_str().unwrap().to_string();
    assert!(cookie.contains("HttpOnly") && cookie.contains("SameSite=Strict"), "{cookie}");
    let session = cookie.split(';').next().unwrap().to_string();
    let me: serde_json::Value = get("/api/auth/me").header("cookie", &session).send().await.unwrap().json().await.unwrap();
    assert_eq!((me["server"].as_bool(), me["via"].as_str()), (Some(true), Some("password")));
    let file: serde_json::Value = get("/api/file?path=note.md").header("cookie", &session).send().await.unwrap().json().await.unwrap();
    assert_eq!(file["text"], "# Note\n");

    // the phone's token: a capture goes in; reading a file does not
    let bearer = format!("Bearer {phone}");
    let cap = http.post(format!("{base}/api/capture")).header("x-atlas", "1").header("authorization", &bearer).json(&serde_json::json!({ "text": "from the phone" })).send().await.unwrap();
    assert!(cap.status().is_success(), "{:?}", cap.text().await);
    assert_eq!(get("/api/file?path=note.md").header("authorization", &bearer).send().await.unwrap().status(), StatusCode::FORBIDDEN);

    // signing a phone in (the browser, signed in, opens /auth/app): asked once, then a token handed to the app's address
    let ask = get("/auth/app?app=capture&name=Pixel").header("cookie", &session).send().await.unwrap();
    let page = ask.text().await.unwrap();
    assert!(page.contains("Let it in") && page.contains("Pixel") && page.contains("Atlas capture"), "{page}");
    assert_eq!(get("/auth/app?app=capture").send().await.unwrap().status(), StatusCode::SEE_OTHER, "not signed in: the sign-in first");
    assert_eq!(get("/auth/app?app=capture").header("authorization", &bearer).send().await.unwrap().status(), StatusCode::FORBIDDEN, "a device cannot let a device in");
    let post = |origin: &str, app: &str| http.post(format!("{base}/auth/app?app={app}&name=Pixel")).header("cookie", &session).header("origin", origin).form(&[("confirm", "1")]);
    assert_eq!(post("https://evil.example", "capture").send().await.unwrap().status(), StatusCode::FORBIDDEN);
    assert_eq!(post(&base, "elsewhere").send().await.unwrap().status(), StatusCode::BAD_REQUEST, "only the apps' own addresses");
    let given = post(&base, "capture").send().await.unwrap();
    assert_eq!(given.status(), StatusCode::SEE_OTHER);
    let to = given.headers()["location"].to_str().unwrap().to_string();
    let token = to.strip_prefix("org.atlas.capture://signed-in?token=").and_then(|r| r.split('&').next()).unwrap_or_else(|| panic!("{to}")).to_string();
    // the token in x-atlas-token, Authorization left to the sign-in in front (a token that is not Atlas's is passed over)
    let cap = http.post(format!("{base}/api/capture")).header("x-atlas", "1").header("x-atlas-token", &token).header("authorization", "Bearer eyJhbGciOi.from-the-proxy")
        .json(&serde_json::json!({ "text": "signed in from the phone" })).send().await.unwrap();
    assert!(cap.status().is_success(), "{:?}", cap.text().await);
    let me: serde_json::Value = get("/api/auth/me").header("cookie", &session).header("authorization", "Bearer eyJhbGciOi.from-the-proxy").send().await.unwrap().json().await.unwrap();
    assert_eq!(me["via"], "password", "a foreign bearer does not hide the session");

    // a WebSocket opened by another site's page is refused even with the cookie
    let ws = get("/api/events").header("cookie", &session).header("origin", "https://evil.example").header("connection", "upgrade").header("upgrade", "websocket")
        .header("sec-websocket-version", "13").header("sec-websocket-key", "dGhlIHNhbXBsZSBub25jZQ==").send().await.unwrap();
    assert_eq!(ws.status(), StatusCode::FORBIDDEN);

    // AI agents (atlas mcp) are kept out by default, even signed in
    assert_eq!(get("/api/auth/me").header("cookie", &session).header("x-atlas-client", "mcp").send().await.unwrap().status(), StatusCode::FORBIDDEN);

    // signing out ends the session
    http.post(format!("{base}/api/auth/logout")).header("x-atlas", "1").header("cookie", &session).send().await.unwrap();
    assert_eq!(get("/api/file?path=note.md").header("cookie", &session).send().await.unwrap().status(), StatusCode::UNAUTHORIZED);
    srv.shutdown().await.unwrap();

    // the desktop mode is unchanged: no sign-in, /login does not exist
    let local = atlas_core::serve(vault.path().to_path_buf(), 0).await.unwrap();
    let lbase = format!("http://127.0.0.1:{}", local.port());
    assert_eq!(http.get(format!("{lbase}/api/file?path=note.md")).header("x-atlas", "1").send().await.unwrap().status(), StatusCode::OK);
    assert_eq!(http.get(format!("{lbase}/login")).send().await.unwrap().status(), StatusCode::NOT_FOUND);
    local.shutdown().await.unwrap();
}

/// Several vaults on one server: each at /v/<name>/,
/// one sign-in for all, the vault list giving each one's address, the page told where its API is.
#[tokio::test]
async fn one_server_several_vaults_one_sign_in() {
    use atlas_core::server::{serve_vaults, Served, Vaults};
    let (a, b) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    std::fs::write(a.path().join("a.md"), "# In A\n").unwrap();
    std::fs::write(b.path().join("b.md"), "# In B\n").unwrap();
    let keys = tempfile::tempdir().unwrap();
    let settings = ServerSettings { auth: AuthMode::Password, password_hash: Some(hash_password("a long password").unwrap()), ..Default::default() };
    let auth = Auth::new(settings, keys.path().join("server.json"));
    let phone = auth.add_token("phone", Scope::Capture).unwrap();
    let vaults = Vaults::Many(vec![Served { name: "notes".into(), root: a.path().into() }, Served { name: "work".into(), root: b.path().into() }]);
    let srv = serve_vaults(vaults, Listen::Server { addr: "127.0.0.1:0".parse().unwrap(), auth: Box::new(auth) }).await.unwrap();
    let base = format!("http://127.0.0.1:{}", srv.port());
    let http = reqwest::Client::builder().redirect(redirect::Policy::none()).build().unwrap();

    // not signed in: a vault's page sends to the shared sign-in, coming back to that vault
    let r = http.get(format!("{base}/v/work/notes")).send().await.unwrap();
    assert_eq!((r.status(), r.headers()["location"].to_str().unwrap()), (StatusCode::SEE_OTHER, "/login?next=/v/work/notes"));
    let ok = http.post(format!("{base}/login")).header("origin", &base).form(&[("password", "a long password"), ("next", "/v/work/")]).send().await.unwrap();
    assert_eq!(ok.status(), StatusCode::SEE_OTHER);
    let session = ok.headers()["set-cookie"].to_str().unwrap().split(';').next().unwrap().to_string();
    let get = |path: String| http.get(format!("{base}{path}")).header("x-atlas", "1").header("cookie", &session);

    // one session opens both; each vault's API reads its own files
    let fa: serde_json::Value = get("/v/notes/api/file?path=a.md".into()).send().await.unwrap().json().await.unwrap();
    let fb: serde_json::Value = get("/v/work/api/file?path=b.md".into()).send().await.unwrap().json().await.unwrap();
    assert_eq!((fa["text"].as_str(), fb["text"].as_str()), (Some("# In A\n"), Some("# In B\n")));
    assert_eq!(get("/v/notes/api/file?path=b.md".into()).send().await.unwrap().status(), StatusCode::NOT_FOUND);
    // `/` goes to the first; a vault's page knows where its API is
    assert_eq!(get("/".into()).send().await.unwrap().headers()["location"], "/v/notes/");
    let page = get("/v/work/".into()).send().await.unwrap().text().await.unwrap();
    assert!(page.contains(r#"window.__ATLAS_API__="/v/work""#), "{page}");
    // an address naming no vault here (an old one, `/v/obsidian/…`): a page of the vaults that are, never the app
    for gone in ["/v/obsidian/", "/v/obsidian/notes/x.md", "/v/obsidian"] {
        let r = get(gone.into()).send().await.unwrap();
        assert_eq!(r.status(), StatusCode::NOT_FOUND, "{gone}");
        let page = r.text().await.unwrap();
        assert!(page.contains(r#"href="/v/notes/""#) && page.contains(r#"href="/v/work/""#), "{gone}: {page}");
        assert!(!page.contains("__ATLAS_API__"), "{gone}: {page}");
    }
    // the asked name is shown, escaped
    let page = get("/v/%3Cscript%3E/".into()).send().await.unwrap().text().await.unwrap();
    assert!(!page.contains("<script>"), "{page}");
    // the picker: the server's vaults with their addresses; opening a folder is refused
    let list: serde_json::Value = get("/v/work/api/vaults".into()).send().await.unwrap().json().await.unwrap();
    let urls: Vec<_> = list["vaults"].as_array().unwrap().iter().map(|v| v["url"].as_str().unwrap().to_string()).collect();
    assert_eq!(urls, ["/v/notes/", "/v/work/"]);
    assert_eq!(list["current"].as_str().unwrap(), b.path().to_string_lossy());
    let open = http.post(format!("{base}/v/work/api/vaults/open")).header("x-atlas", "1").header("cookie", &session).json(&serde_json::json!({ "path": "/etc" })).send().await.unwrap();
    assert_eq!(open.status(), StatusCode::BAD_REQUEST);
    // the phone's capture-only token reaches a vault's capture, and nothing else of it
    let bearer = format!("Bearer {phone}");
    let cap = http.post(format!("{base}/v/work/api/capture")).header("x-atlas", "1").header("authorization", &bearer).json(&serde_json::json!({ "text": "from the phone" })).send().await.unwrap();
    assert!(cap.status().is_success(), "{:?}", cap.text().await);
    assert_eq!(http.get(format!("{base}/v/work/api/file?path=b.md")).header("x-atlas", "1").header("authorization", &bearer).send().await.unwrap().status(), StatusCode::FORBIDDEN);
    // this machine's CLI finds each vault at its prefix
    let sf: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(b.path().join(".atlas/cache/server.json")).unwrap()).unwrap();
    assert_eq!(sf["path"], "/v/work");
    srv.shutdown().await.unwrap();
    assert!(!b.path().join(".atlas/cache/server.json").exists(), "removed on shutdown");
}

// Behind a gate (Authelia, Authentik…: Remote-User from a trusted proxy): signing a phone in hands it the gate's cookies
// too — the browser passed the gate with the security key, the phone then passes it the same way. Never Atlas's own.
#[tokio::test]
async fn behind_a_gate_the_phone_gets_the_gates_cookies() {
    let vault = tempfile::tempdir().unwrap();
    let keys = tempfile::tempdir().unwrap();
    let settings = ServerSettings { auth: AuthMode::Proxy, trusted_proxies: vec!["127.0.0.1".parse().unwrap()], ..Default::default() };
    let auth = Auth::new(settings, keys.path().join("server.json"));
    let srv = serve_on(vault.path().to_path_buf(), Listen::Server { addr: "127.0.0.1:0".parse().unwrap(), auth: Box::new(auth) }).await.unwrap();
    let base = format!("http://127.0.0.1:{}", srv.port());
    let http = reqwest::Client::builder().redirect(redirect::Policy::none()).build().unwrap();
    let r = http.post(format!("{base}/auth/app?app=atlas&name=Pixel")).header("remote-user", "alice").header("origin", &base)
        .header("cookie", "authelia_session=s3cret; atlas_session=ours").form(&[("confirm", "1")]).send().await.unwrap();
    assert_eq!(r.status(), StatusCode::SEE_OTHER);
    let to = r.headers()["location"].to_str().unwrap().to_string();
    assert!(to.starts_with("org.atlas.app://signed-in?token=atl_"), "{to}");
    assert!(to.contains("&gate=authelia_session%3Ds3cret"), "the gate's cookie: {to}");
    assert!(!to.contains("ours"), "never Atlas's own session: {to}");
    // each app gets its token at its own package's address (the Boox app is not the plain Atlas app)
    for (app, scheme) in [("boox", "org.atlas.boox"), ("capture", "org.atlas.capture")] {
        let r = http.post(format!("{base}/auth/app?app={app}&name=Boox")).header("remote-user", "alice").header("origin", &base).form(&[("confirm", "1")]).send().await.unwrap();
        let to = r.headers()["location"].to_str().unwrap().to_string();
        assert!(to.starts_with(&format!("{scheme}://signed-in?token=atl_")), "{app}: {to}");
    }
}

// The phone app shows its own interface for a server's vault (AtlasActivity.ownUi): the same lookup the server uses,
// the page told its prefix; and the version both sides compare.
#[test]
fn the_interface_and_its_version_for_the_phone_app() {
    let (page, mime) = atlas_core::server::ui_file("", "/v/work").expect("the app's page");
    assert!(mime.starts_with("text/html"), "{mime}");
    assert!(String::from_utf8_lossy(&page).contains(r#"window.__ATLAS_API__="/v/work""#));
    let (deep, _) = atlas_core::server::ui_file("notes/x", "/v/work").expect("a page address is the app");
    assert_eq!(deep, page);
    assert!(atlas_core::server::ui_file("assets/missing-file.js", "/v/work").is_none(), "a missing file is not the page");
    let v = atlas_core::server::version_info();
    assert_eq!(v["api"], atlas_core::server::API_LEVEL);
    assert_eq!(v["ui"].as_str().unwrap().len(), 12);
}

/// The desktop's one core (server_desktop.rs): the window's vault at /v/<name>/ at once, another vault of the list only when first asked for, each
/// with its own files, `/` going to the window's own, and a vault another Atlas runs never started twice.
#[tokio::test(flavor = "multi_thread")]
async fn the_desktop_core_serves_every_vault_of_its_list_each_started_when_first_opened() {
    use atlas_core::server::{serve_vaults, Vaults};
    let home = tempfile::tempdir().unwrap();
    let (a, b, c) = (home.path().join("Work"), home.path().join("My Notes"), home.path().join("Busy"));
    for (v, note) in [(&a, "a.md"), (&b, "b.md"), (&c, "c.md")] {
        std::fs::create_dir_all(v.join(".atlas/cache")).unwrap();
        std::fs::write(v.join(note), "# here\n").unwrap();
    }
    // Busy is open in another Atlas (a live process that is not this one: pid 1)
    std::fs::write(c.join(".atlas/cache/server.json"), r#"{"port": 1, "pid": 1, "root": "ROOT", "path": ""}"#.replace("ROOT", &c.canonicalize().unwrap().to_string_lossy())).unwrap();
    let list = home.path().join("vaults.toml");
    std::fs::write(&list, format!("[[vault]]\nname = \"My Notes\"\npath = {:?}\nlast_opened = 2\n\n[[vault]]\nname = \"Busy\"\npath = {:?}\nlast_opened = 1\n", b, c)).unwrap();
    let srv = serve_vaults(Vaults::Desktop { first: a.clone(), list }, Listen::Local(0, atlas_core::local_lock::Lock::Open)).await.unwrap();
    let base = format!("http://127.0.0.1:{}", srv.port());
    let http = reqwest::Client::builder().redirect(redirect::Policy::none()).build().unwrap();
    let get = |p: &str| http.get(format!("{base}{p}")).header("x-atlas", "1").send();

    let to = get("/?k=x").await.unwrap();
    assert_eq!(to.headers()["location"], "/v/Work/?k=x", "the window's own vault, the one-time code kept");
    assert!(a.join(".atlas/cache/server.json").is_file(), "started with the window");
    assert!(!b.join(".atlas/cache/server.json").exists(), "the other one waits until it is opened");

    assert_eq!(get("/v/Work/api/file?path=a.md").await.unwrap().status(), StatusCode::OK);
    let other = get("/v/My-Notes/api/file?path=b.md").await.unwrap();
    assert_eq!(other.status(), StatusCode::OK, "a folder name with a space has a clean address");
    assert_eq!(get("/v/My-Notes/api/file?path=a.md").await.unwrap().status(), StatusCode::NOT_FOUND, "each vault its own files");
    let sf: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(b.join(".atlas/cache/server.json")).unwrap()).unwrap();
    assert_eq!(sf["path"], "/v/My-Notes", "the CLI and agents find it at its place");
    let page = get("/v/My-Notes/").await.unwrap().text().await.unwrap();
    assert!(page.contains(r#"__ATLAS_API__="/v/My-Notes""#), "the page is told where its API is");

    assert_eq!(get("/v/Busy/").await.unwrap().status(), StatusCode::CONFLICT, "open in another Atlas: not started twice");
    assert_eq!(get("/v/Nowhere/").await.unwrap().status(), StatusCode::NOT_FOUND);
    srv.shutdown().await.unwrap();
    assert!(!b.join(".atlas/cache/server.json").exists(), "a vault started on demand is cleaned up too");
}

/// A plugin's own files by URL (plugin_files.rs; PLUGIN-API.md "A plugin's own files"): no `x-atlas` header (an `<img>`,
/// a font, an `import()` cannot send one), but the sign-in still holds; under a vault's `/v/<name>/` too; the right type,
/// a 304 for an unchanged file, nothing outside the plugin's folder.
#[tokio::test]
async fn a_plugins_own_files_by_url_signed_in_and_inside_its_folder() {
    use atlas_core::server::{serve_vaults, Served, Vaults};
    let v = tempfile::tempdir().unwrap();
    let books = v.path().join(".atlas/plugins/books");
    std::fs::create_dir_all(books.join("fonts")).unwrap();
    std::fs::write(books.join("view.js"), "import { zipIndex } from \"../zip/zip.js\";\n").unwrap();
    std::fs::write(books.join("fonts/serif.woff2"), [0x77, 0x4f, 0x46, 0x32]).unwrap();
    std::fs::write(v.path().join("note.md"), "# Mine\n").unwrap();
    let keys = tempfile::tempdir().unwrap();
    let settings = ServerSettings { auth: AuthMode::Password, password_hash: Some(hash_password("a long password").unwrap()), ..Default::default() };
    let auth = Auth::new(settings, keys.path().join("server.json"));
    let srv = serve_vaults(Vaults::Many(vec![Served { name: "work".into(), root: v.path().into() }]), Listen::Server { addr: "127.0.0.1:0".parse().unwrap(), auth: Box::new(auth) }).await.unwrap();
    let base = format!("http://127.0.0.1:{}", srv.port());
    let http = reqwest::Client::builder().redirect(redirect::Policy::none()).build().unwrap();
    let url = |rest: &str| format!("{base}/v/work/plugin-files/{rest}");

    // not signed in: the sign-in page, never the file
    let r = http.get(url("0/.atlas/plugins/books/view.js")).send().await.unwrap();
    assert_eq!(r.status(), StatusCode::SEE_OTHER);
    let ok = http.post(format!("{base}/login")).header("origin", &base).form(&[("password", "a long password"), ("next", "/v/work/")]).send().await.unwrap();
    let session = ok.headers()["set-cookie"].to_str().unwrap().split(';').next().unwrap().to_string();
    let get = |rest: &str| http.get(url(rest)).header("cookie", &session); // no x-atlas: as a browser's <img> / import()

    let js = get("0/.atlas/plugins/books/view.js").send().await.unwrap();
    assert_eq!(js.status(), StatusCode::OK);
    assert_eq!(js.headers()["content-type"], "text/javascript; charset=utf-8");
    assert_eq!((js.headers()["cache-control"].to_str().unwrap(), js.headers()["x-content-type-options"].to_str().unwrap()), ("no-cache", "nosniff"));
    let etag = js.headers()["etag"].to_str().unwrap().to_string();
    assert!(js.text().await.unwrap().contains("../zip/zip.js"));
    let again = get("7/.atlas/plugins/books/view.js").header("if-none-match", &etag).send().await.unwrap();
    assert_eq!(again.status(), StatusCode::NOT_MODIFIED, "unchanged: no body again, whatever the page's revision");
    let font = get("0/.atlas/plugins/books/fonts/serif.woff2").send().await.unwrap();
    assert_eq!((font.status(), font.headers()["content-type"].to_str().unwrap()), (StatusCode::OK, "font/woff2"));
    assert_eq!(font.bytes().await.unwrap().as_ref(), [0x77, 0x4f, 0x46, 0x32]);

    // outside the plugin's folder: refused (the URL's own `..` the client folds away, so it is sent escaped)
    for rest in ["0/note.md", "0/.atlas/plugins/books/%2e%2e/%2e%2e/%2e%2e/note.md", "0/.atlas/plugins/books/..%2f..%2f..%2fnote.md", "0/.atlas/config.toml", "BAD/.atlas/plugins/books/view.js"] {
        let r = get(rest).send().await.unwrap();
        assert_eq!(r.status(), StatusCode::BAD_REQUEST, "{rest}");
    }
    assert_eq!(get("0/.atlas/plugins/books/none.js").send().await.unwrap().status(), StatusCode::NOT_FOUND);
    srv.shutdown().await.unwrap();

    // the desktop's core: the same, at its top, no header needed
    let local = atlas_core::serve(v.path().to_path_buf(), 0).await.unwrap();
    let r = http.get(format!("http://127.0.0.1:{}/plugin-files/0/.atlas/plugins/books/view.js", local.port())).send().await.unwrap();
    assert_eq!(r.status(), StatusCode::OK);
    local.shutdown().await.unwrap();
}
