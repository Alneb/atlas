//! End-to-end: a real server on port 0 over a temp workspace seeded from real-shaped files (`ATLAS_TEST_VAULT`, when set).
#![allow(clippy::disallowed_methods)] // a test writes its fixtures directly
use atlas_core::api::*;
use futures_util::{SinkExt, StreamExt};
use reqwest::StatusCode;
use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, Message};

/// A real vault to take real-shaped files from: `ATLAS_TEST_VAULT` (unset: the stand-ins below). Only ever read.
fn real_vault() -> Option<std::path::PathBuf> {
    std::env::var_os("ATLAS_TEST_VAULT").map(std::path::PathBuf::from)
}

/// Copy (never write) a few real files from that vault; fall back to a stand-in when absent.
fn seed(root: &Path) {
    let copy = |rel: &str, fallback: &str| {
        let dst = root.join(rel);
        std::fs::create_dir_all(dst.parent().unwrap()).unwrap();
        let text = real_vault().and_then(|v| std::fs::read_to_string(v.join(rel)).ok()).unwrap_or_else(|| fallback.into());
        std::fs::write(dst, text).unwrap();
    };
    copy("FOCUS.md", "# Focus\n");
    copy("log/2026-10-05.md", "# 2026-10-05\n\nReorganized ~/Notes.\n");
    copy("docs/SYSTEM.md", "# System\n");
    copy("docs/INDEX.md", "# Index\n");
    // `log_dir` set explicitly: the stand-in has a legacy `log/` folder, which an unset `log_dir` would pick
    copy(".atlas/config.toml", "log_dir = \"notes/log\"\nignore = [\"runs\", \"refs/zotero\"]\n");
    // a real vault's list may differ; the folders this test hides are always in it
    let cfg = root.join(".atlas/config.toml");
    let mut table: toml::Table = std::fs::read_to_string(&cfg).unwrap().parse().unwrap();
    let ignore = table.entry("ignore").or_insert_with(|| toml::Value::Array(vec![])).as_array_mut().unwrap();
    for must in ["runs", "refs/zotero"] {
        if !ignore.iter().any(|p| p.as_str().is_some_and(|p| p.trim_start_matches('/') == must)) {
            ignore.push(must.into());
        }
    }
    std::fs::write(&cfg, toml::to_string(&table).unwrap()).unwrap();
    std::fs::create_dir_all(root.join("notes")).unwrap();
    std::fs::write(root.join("notes/plan.md"), "# Plan\n- [ ] fit the subbath hybridization\n- [x] done\n").unwrap();
    std::fs::create_dir_all(root.join("runs")).unwrap();
    std::fs::write(root.join("runs/ignored.md"), "- [ ] must not show up\nsubbath\n").unwrap();
    std::fs::create_dir_all(root.join("refs/zotero")).unwrap();
    std::fs::write(root.join("refs/zotero/z.md"), "- [ ] nested ignore\n").unwrap();
    std::fs::create_dir_all(root.join(".atlas/commands")).unwrap();
    std::fs::write(
        root.join(".atlas/commands/sum.toml"),
        "title = \"Sum\"\ndescription = \"adds args.a + args.b\"\nrun = \"python3 -c 'import json,sys; a=json.load(sys.stdin); print(json.dumps({\\\"sum\\\": a[\\\"a\\\"]+a[\\\"b\\\"]}))'\"\n",
    )
    .unwrap();
    std::fs::write(root.join("image.png"), [0x89, b'P', b'N', b'G']).unwrap();
}

struct T {
    _dir: tempfile::TempDir,
    handle: Option<atlas_core::ServerHandle>,
    base: String,
    http: reqwest::Client,
}

impl T {
    async fn start() -> Self {
        let dir = tempfile::tempdir().unwrap();
        seed(dir.path());
        let handle = atlas_core::serve(dir.path().to_path_buf(), 0).await.unwrap();
        let base = format!("http://127.0.0.1:{}", handle.port());
        Self { _dir: dir, handle: Some(handle), base, http: reqwest::Client::new() }
    }
    fn root(&self) -> &Path {
        self._dir.path()
    }
    fn port(&self) -> u16 {
        self.handle.as_ref().unwrap().port()
    }
    async fn get(&self, path: &str) -> (StatusCode, Value) {
        let r = self.http.get(format!("{}{path}", self.base)).header("x-atlas", "1").send().await.unwrap();
        let s = r.status();
        (s, r.json().await.unwrap_or(Value::Null))
    }
    async fn send(&self, method: reqwest::Method, path: &str, body: Value) -> (StatusCode, Value) {
        let r = self
            .http
            .request(method, format!("{}{path}", self.base))
            .header("x-atlas", "1")
            .json(&body)
            .send()
            .await
            .unwrap();
        let s = r.status();
        (s, r.json().await.unwrap_or(Value::Null))
    }
    async fn stop(mut self) {
        self.handle.take().unwrap().shutdown().await.unwrap();
        assert!(!self.root().join(".atlas/cache/server.json").exists(), "server.json removed on shutdown");
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn http_api_end_to_end() {
    let t = T::start().await;

    // Discovery file.
    let sf: ServerFile =
        serde_json::from_str(&std::fs::read_to_string(t.root().join(".atlas/cache/server.json")).unwrap()).unwrap();
    assert_eq!(sf.port, t.port());
    assert_eq!(sf.pid, std::process::id());

    // Header guard: no x-atlas → 403, also for unknown routes and preflights.
    let r = t.http.get(format!("{}/api/workspace", t.base)).send().await.unwrap();
    assert_eq!(r.status(), StatusCode::FORBIDDEN);
    let r = t
        .http
        .request(reqwest::Method::OPTIONS, format!("{}/api/capture", t.base))
        .header("origin", "https://evil.example")
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), StatusCode::FORBIDDEN);
    assert!(r.headers().get("access-control-allow-origin").is_none());
    let r = t
        .http
        .get(format!("{}/api/workspace", t.base))
        .header("x-atlas", "1")
        .header("host", "evil.example")
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), StatusCode::FORBIDDEN, "DNS-rebinding Host refused");

    // Workspace.
    let (s, v) = t.get("/api/workspace").await;
    assert_eq!(s, StatusCode::OK);
    let info: WorkspaceInfo = serde_json::from_value(v).unwrap();
    assert_eq!(Path::new(&info.root), atlas_core::paths::real(t.root()).unwrap());
    assert_eq!(info.config.log_dir, "notes/log"); // the default since 958d51e
    // the real vault's config is what is copied (with `runs` added): it may anchor the entry at the root (`/runs`)
    assert!(info.config.ignore.iter().any(|p| p.trim_start_matches('/') == "runs"));

    // Tree: dirs first, dotfiles hidden except .atlas, ignored dirs shown but flagged.
    let (_, v) = t.get("/api/tree").await;
    let names: Vec<String> = v.as_array().unwrap().iter().map(|e| e["name"].as_str().unwrap().to_string()).collect();
    assert_eq!(&names[..4], [".atlas", "docs", "log", "notes"]);
    let runs = v.as_array().unwrap().iter().find(|e| e["name"] == "runs").expect("ignored dir listed");
    assert_eq!(runs["ignored"], true);
    assert_eq!(v[0]["kind"], "dir");
    assert_eq!(v[0]["ignored"], false);
    let (_, v) = t.get("/api/tree?path=refs").await;
    assert_eq!(v[0]["ignored"], true, "refs/zotero ignored by nested path");
    // Exists: a file, a folder, a missing one — never a 404 (the UI's optional files)
    for (path, there) in [("FOCUS.md", true), (".atlas", true), ("notes/none.md", false)] {
        assert_eq!(t.get(&format!("/api/exists?path={path}")).await, (StatusCode::OK, Value::Bool(there)), "{path}");
    }
    assert_eq!(t.get("/api/exists?path=../etc").await.0, StatusCode::BAD_REQUEST);

    // File GET / PUT / 409.
    let (s, v) = t.get("/api/file?path=FOCUS.md").await;
    assert_eq!(s, StatusCode::OK);
    let f: FileText = serde_json::from_value(v).unwrap();
    assert!(f.text.starts_with("# Focus"));
    let (s, v) = t
        .send(
            reqwest::Method::PUT,
            "/api/file",
            json!({"path": "notes/new.md", "text": "hello", "base_mtime": f.mtime}),
        )
        .await;
    assert_eq!(s, StatusCode::CONFLICT, "base_mtime of another file must not match a missing one: {v}");
    let (s, v) = t
        .send(
            reqwest::Method::PUT,
            "/api/file",
            json!({"path": "FOCUS.md", "text": "# Focus\n\nedited\n", "base_mtime": f.mtime}),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let new_mtime = v["mtime"].as_u64().unwrap();
    let (s, v) = t
        .send(
            reqwest::Method::PUT,
            "/api/file",
            json!({"path": "FOCUS.md", "text": "stale write", "base_mtime": f.mtime.0 - 5000}),
        )
        .await;
    assert_eq!(s, StatusCode::CONFLICT);
    assert_eq!(v["mtime"].as_u64(), Some(new_mtime));
    assert_eq!(std::fs::read_to_string(t.root().join("FOCUS.md")).unwrap(), "# Focus\n\nedited\n");
    let (s, _) = t.send(reqwest::Method::PUT, "/api/file", json!({"path": "notes/sub/created.md", "text": "x"})).await;
    assert_eq!(s, StatusCode::OK);
    assert!(t.root().join("notes/sub/created.md").exists());
    let (s, v) = t.get("/api/file?path=../etc/passwd").await;
    assert_eq!(s, StatusCode::BAD_REQUEST, "{v}");
    let (s, _) = t.get("/api/file?path=nope.md").await;
    assert_eq!(s, StatusCode::NOT_FOUND);

    // Raw.
    let r = t.http.get(format!("{}/api/raw?path=image.png", t.base)).header("x-atlas", "1").send().await.unwrap();
    assert_eq!(r.headers()["content-type"], "image/png");
    assert_eq!(r.bytes().await.unwrap().len(), 4);

    // Capture → today's log.
    let (s, v) =
        t.send(reqwest::Method::POST, "/api/capture", json!({"text": "Idea: $G(i\\omega_n)$\nsecond line"})).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let cap: CaptureResult = serde_json::from_value(v).unwrap();
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    assert_eq!(cap.path, atlas_core::capture::day_log(&info.config, chrono::Local::now().date_naive())); // one place builds the path
    let log = std::fs::read_to_string(t.root().join(&cap.path)).unwrap();
    let bullet = log.lines().nth(cap.line as usize - 1).unwrap();
    assert!(bullet.starts_with("- ") && bullet.ends_with(" Idea: $G(i\\omega_n)$"), "{bullet}");
    assert!(log.ends_with("\n  second line\n"));
    let (s, _) = t.send(reqwest::Method::POST, "/api/capture", json!({"text": "  "})).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);

    // Today.
    let (s, v) = t.get("/api/today").await;
    assert_eq!(s, StatusCode::OK);
    let today: Today = serde_json::from_value(v).unwrap();
    assert_eq!(today.date, date);
    assert_eq!(today.focus.text.as_deref(), Some("# Focus\n\nedited\n"));
    assert!(today.log.text.unwrap().contains("Idea"));
    assert_eq!(
        today.tasks,
        vec![LineHit { path: "notes/plan.md".into(), line: 2, text: "fit the subbath hybridization".into() }]
    );
    assert!(today.activity.changed.iter().any(|c| c.path == "FOCUS.md"));
    assert!(!today.activity.changed.iter().any(|c| c.path.starts_with("runs/") || c.path.starts_with(".atlas")));

    // Lectures are a workspace plugin now (docs/refactor/REFACTOR-plugins-v3.md): the core has no route.
    let (s, _) = t.send(reqwest::Method::POST, "/api/lecture", json!({"course": "x"})).await;
    assert_ne!(s, StatusCode::OK);

    // Search: filenames + content, ignore honored.
    let (s, v) = t.get("/api/search?q=subbath").await;
    assert_eq!(s, StatusCode::OK);
    let res: SearchResults = serde_json::from_value(v).unwrap();
    assert!(res.lines.iter().any(|l| l.path == "notes/plan.md" && l.line == 2), "{res:?}");
    assert!(!res.lines.iter().any(|l| l.path.starts_with("runs/")));
    let (_, v) = t.get("/api/search?q=plan").await;
    assert_eq!(v["files"], json!(["notes/plan.md"]));

    // Commands: builtins + script; run both kinds.
    let (_, v) = t.get("/api/commands").await;
    let cmds: Vec<CommandInfo> = serde_json::from_value(v).unwrap();
    assert!(cmds
        .iter()
        .any(|c| c.id == "capture" && c.source == CommandSource::Builtin && c.keys.as_deref() == Some("Super+C")));
    assert!(cmds.iter().any(|c| c.id == "sum" && c.source == CommandSource::Script));
    let (s, v) = t.send(reqwest::Method::POST, "/api/cmd/sum", json!({"args": {"a": 2, "b": 40}})).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v, json!({"ok": true, "result": {"sum": 42}}));
    let (s, v) = t.send(reqwest::Method::POST, "/api/cmd/today", json!({"args": {}})).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(v["result"]["date"], date);
    let (s, v) = t.send(reqwest::Method::POST, "/api/cmd/nope", json!({})).await;
    assert_eq!(s, StatusCode::OK, "outcome is in the envelope");
    assert_eq!(v["ok"], false);
    let (s, v) = t.send(reqwest::Method::POST, "/api/cmd/capture", json!({"args": {"wrong": 1}})).await;
    assert_eq!((s, &v["ok"]), (StatusCode::OK, &json!(false)));
    assert!(v["error"].as_str().unwrap().contains("text"));

    // SPA fallback serves the UI (or its placeholder) for non-API paths; unknown /api is a 404.
    let r = t.http.get(format!("{}/some/route", t.base)).send().await.unwrap();
    assert_eq!(r.status(), StatusCode::OK);
    assert!(r.headers()["content-type"].to_str().unwrap().starts_with("text/html"));
    let (s, _) = t.get("/api/nope").await;
    assert_eq!(s, StatusCode::NOT_FOUND);

    t.stop().await;
}

async fn ws_connect(
    port: u16,
    path: &str,
    origin: Option<&str>,
) -> Result<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    tokio_tungstenite::tungstenite::Error,
> {
    let mut req = format!("ws://127.0.0.1:{port}{path}").into_client_request().unwrap();
    if let Some(o) = origin {
        req.headers_mut().insert("origin", o.parse().unwrap());
    }
    tokio_tungstenite::connect_async(req).await.map(|(s, _)| s)
}

#[tokio::test(flavor = "multi_thread")]
async fn events_and_origin_check() {
    let t = T::start().await;
    assert!(ws_connect(t.port(), "/api/events", Some("https://evil.example")).await.is_err());
    let mut ev = ws_connect(t.port(), "/api/events", Some(&format!("http://127.0.0.1:{}", t.port()))).await.unwrap();
    let (s, v) = t
        .send(reqwest::Method::POST, "/api/cmd/notify", json!({"args": {"title": "run finished", "body": "U=8"}}))
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["result"]["delivered"], 1);
    let msg = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Some(Ok(Message::Text(t))) = ev.next().await {
                let e: Event = serde_json::from_str(&t).unwrap();
                if matches!(e, Event::Notify { .. }) {
                    return e;
                }
            }
        }
    })
    .await
    .unwrap();
    assert_eq!(msg, Event::Notify { title: "run finished".into(), body: Some("U=8".into()) });

    // The desktop app's sign-in window hands back the address it ended on; the page hears it.
    let back = "https://localhost/?code=abc&state=s1";
    let (s, v) = t.send(reqwest::Method::POST, "/api/signin", json!({"url": back})).await;
    assert_eq!((s, &v["delivered"]), (StatusCode::OK, &json!(1)), "{v}");
    let got = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Some(Ok(Message::Text(t))) = ev.next().await {
                if let Event::Signin { url } = serde_json::from_str(&t).unwrap() {
                    return url;
                }
            }
        }
    })
    .await
    .unwrap();
    assert_eq!(got, back);

    // The fs watcher reports external edits.
    std::fs::write(t.root().join("notes/plan.md"), "# Plan\nchanged outside\n").unwrap();
    let paths = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Some(Ok(Message::Text(t))) = ev.next().await {
                if let Event::Fs { paths } = serde_json::from_str(&t).unwrap() {
                    if paths.contains(&"notes/plan.md".to_string()) {
                        return paths;
                    }
                }
            }
        }
    })
    .await
    .expect("fs event for notes/plan.md");
    assert!(paths.iter().all(|p| !p.starts_with(".atlas/cache")));
    t.stop().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn pty_shell_session() {
    // A plain POSIX shell keeps the test independent of the user's zsh config.
    std::env::set_var("SHELL", "/bin/sh");
    let t = T::start().await;
    let mut ws = ws_connect(t.port(), "/api/pty?preset=shell&cols=100&rows=30", None).await.unwrap();
    ws.send(Message::Text(r#"{"resize":[120,40]}"#.into())).await.unwrap();
    // `$((6*7))` makes the output differ from the echoed input.
    ws.send(Message::Binary(b"echo hi atlas$((6*7)); pwd\r".to_vec().into())).await.unwrap();
    let out = tokio::time::timeout(Duration::from_secs(10), async {
        let mut out = String::new();
        while let Some(Ok(m)) = ws.next().await {
            if let Message::Binary(b) = m {
                out.push_str(&String::from_utf8_lossy(&b));
                if out.contains("hi atlas42") && out.contains(&*atlas_core::paths::real(t.root()).unwrap().to_string_lossy()) {
                    break;
                }
            }
        }
        out
    })
    .await
    .expect("pty output within 10 s");
    assert!(out.contains("hi atlas42"), "{out}");
    ws.close(None).await.unwrap();
    t.stop().await;
}

/// Reads binary frames until `want` shows up (10 s at most); returns everything read.
async fn read_until<S: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin>(ws: &mut S, want: &str) -> String {
    tokio::time::timeout(Duration::from_secs(10), async {
        let mut out = String::new();
        while let Some(Ok(m)) = ws.next().await {
            if let Message::Binary(b) = m {
                out.push_str(&String::from_utf8_lossy(&b));
                if out.contains(want) {
                    break;
                }
            }
        }
        out
    })
    .await
    .unwrap_or_else(|_| panic!("{want:?} within 10 s"))
}

/// "it reset": every new interface reloads the window, and a reload closed every terminal's socket,
/// which killed the shells and Claude sessions in them. A socket with the tab's key now takes over
/// the terminal still running, with its recent output; only "end" (the tab closed) kills it.
#[tokio::test(flavor = "multi_thread")]
async fn a_terminal_outlives_a_page_reload_and_ends_when_its_tab_closes() {
    std::env::set_var("SHELL", "/bin/sh");
    let t = T::start().await;
    let url = "/api/pty?preset=shell&cols=100&rows=30&key=terminal:shell:1";
    let mut ws = ws_connect(t.port(), url, None).await.unwrap();
    ws.send(Message::Binary(b"echo pid=$$=; echo before$((6*7))\r".to_vec().into())).await.unwrap();
    let out = read_until(&mut ws, "before42").await;
    let pid = out.split("pid=").filter_map(|s| s.split('=').next()).find(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit())).expect("the shell's pid").to_string();
    drop(ws); // the page reloads: the socket goes without a word

    let mut ws = ws_connect(t.port(), url, None).await.unwrap();
    let replay = read_until(&mut ws, "before42").await;
    assert!(replay.contains("before42"), "the recent output comes back: {replay}");
    ws.send(Message::Binary(b"echo again=$$=\r".to_vec().into())).await.unwrap();
    let again = read_until(&mut ws, &format!("again={pid}=")).await;
    assert!(again.contains(&format!("again={pid}=")), "the same shell: {again}");

    // the tab is closed: "end" kills it, and the key starts a new shell next time
    ws.send(Message::Text(r#""end""#.into())).await.unwrap();
    let _ = tokio::time::timeout(Duration::from_secs(5), async { while let Some(Ok(m)) = ws.next().await { if matches!(m, Message::Close(_)) { break } } }).await;
    let gone = tokio::time::timeout(Duration::from_secs(5), async {
        while std::path::Path::new(&format!("/proc/{pid}")).exists() {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await;
    assert!(gone.is_ok(), "the shell {pid} was killed");
    let mut ws = ws_connect(t.port(), url, None).await.unwrap();
    ws.send(Message::Binary(b"echo new=$$=\r".to_vec().into())).await.unwrap();
    let fresh = read_until(&mut ws, "new=").await;
    assert!(!fresh.contains(&format!("new={pid}=")) && !fresh.contains("before42"), "a new shell: {fresh}");
    ws.send(Message::Text(r#""end""#.into())).await.unwrap();
    t.stop().await;
}

/// A plugin's command tab: the command runs without an interactive shell, and its end closes the
/// socket with 1000 "exited" (the page closes the tab), not a bare close.
#[tokio::test(flavor = "multi_thread")]
async fn pty_command_runs_directly_and_says_when_it_exited() {
    let t = T::start().await;
    let mut ws = ws_connect(t.port(), "/api/pty?command=echo%20done%24((6*7))&cols=80&rows=24", None).await.unwrap();
    let (out, close) = tokio::time::timeout(Duration::from_secs(10), async {
        let mut out = String::new();
        while let Some(Ok(m)) = ws.next().await {
            match m {
                Message::Binary(b) => out.push_str(&String::from_utf8_lossy(&b)),
                Message::Close(f) => return (out, f),
                _ => {}
            }
        }
        (out, None)
    })
    .await
    .expect("the command ends within 10 s");
    assert!(out.contains("done42"), "{out}");
    let close = close.expect("a close frame");
    assert_eq!((u16::from(close.code), close.reason.as_str()), (1000, "exited"));
    t.stop().await;
}

/// Annotated-PDF saves: binary PUT past the JSON body limit, 409 on a stale copy, original kept once.
#[tokio::test(flavor = "multi_thread")]
async fn raw_put_keeps_original_and_checks_mtime() {
    let t = T::start().await;
    let rel = "refs/papers/x/paper.pdf";
    std::fs::create_dir_all(t.root().join("refs/papers/x")).unwrap();
    std::fs::write(t.root().join(rel), b"%PDF-1.7 original").unwrap();
    let (_, f) = t.get("/api/tree?path=refs/papers/x").await;
    assert_eq!(f[0]["name"], "paper.pdf");
    let mtime = Mtime::of(&std::fs::metadata(t.root().join(rel)).unwrap()).unwrap().0;
    let r = t.http.head(format!("{}/api/raw?path={rel}", t.base)).header("x-atlas", "1").send().await.unwrap();
    assert_eq!(r.headers()["x-atlas-mtime"].to_str().unwrap(), mtime.to_string(), "HEAD exposes the mtime");

    let put = |body: Vec<u8>, base: Option<u64>| {
        let mut url = format!("{}/api/raw?path={rel}", t.base);
        if let Some(b) = base {
            url.push_str(&format!("&base_mtime={b}"));
        }
        t.http.put(url).header("x-atlas", "1").body(body).send()
    };
    // 13 MB: above the 12 MB global limit, so the route's own limit must apply.
    let big: Vec<u8> = b"%PDF-1.7 annotated ".iter().copied().cycle().take(13 << 20).collect();
    let r = put(big.clone(), Some(mtime)).await.unwrap();
    assert_eq!(r.status(), StatusCode::OK, "{:?}", r.text().await);
    assert_eq!(std::fs::read(t.root().join(rel)).unwrap(), big);
    assert_eq!(std::fs::read(t.root().join(".atlas/originals").join(rel)).unwrap(), b"%PDF-1.7 original");

    let r = put(b"%PDF stale".to_vec(), Some(mtime)).await.unwrap();
    assert_eq!(r.status(), StatusCode::CONFLICT, "stale base_mtime must not clobber");
    // A second save never replaces the kept original.
    let r = put(b"%PDF-1.7 v3".to_vec(), None).await.unwrap();
    assert_eq!(r.status(), StatusCode::OK);
    assert_eq!(std::fs::read(t.root().join(".atlas/originals").join(rel)).unwrap(), b"%PDF-1.7 original");
    let r = t.http.put(format!("{}/api/raw?path={rel}", t.base)).body("x").send().await.unwrap();
    assert_eq!(r.status(), StatusCode::FORBIDDEN, "guard applies to raw PUT too");
    t.stop().await;
}

/// A companion note (`POST /api/companion`): an entry folder's legacy `notes.md` becomes `<folder>.md` on the first
/// ask, then is found; a PDF in the entry's folder has the entry's note; a path is needed.
#[tokio::test(flavor = "multi_thread")]
async fn companion_notes_are_made_once_and_found() {
    let t = T::start().await;
    let dir = t.root().join("refs/papers/hubbard1963");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("notes.md"), "old words\n").unwrap();
    let ask = serde_json::json!({ "path": "refs/papers/hubbard1963", "title": "Electron correlations", "properties": { "citekey": "hubbard1963" }, "block": "library.paper" });
    let (s, v) = t.send(reqwest::Method::POST, "/api/companion", ask.clone()).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["path"], "refs/papers/hubbard1963/hubbard1963.md");
    assert_eq!(v["migrated_from"], "refs/papers/hubbard1963/notes.md");
    assert!(std::fs::read_to_string(dir.join("hubbard1963.md")).unwrap().ends_with("old words\n"));
    let (_, v) = t.send(reqwest::Method::POST, "/api/companion", ask).await;
    assert_eq!((v["created"].as_bool(), v["migrated_from"].is_null()), (Some(false), true));
    std::fs::write(dir.join("Hubbard 1963.pdf"), b"%PDF").unwrap();
    let (_, v) = t.send(reqwest::Method::POST, "/api/companion", serde_json::json!({ "path": "refs/papers/hubbard1963/Hubbard 1963.pdf" })).await;
    assert_eq!(v["path"], "refs/papers/hubbard1963/hubbard1963.md");
    let (s, _) = t.send(reqwest::Method::POST, "/api/companion", serde_json::json!({ "path": "" })).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    t.stop().await;
}

/// The properties panel: the vault's spec is served, and an edit comes back as the note's new text
/// with only the frontmatter changed (nothing is written: the editor owns the open note).
#[tokio::test(flavor = "multi_thread")]
async fn properties_spec_and_frontmatter_edits() {
    let t = T::start().await;
    std::fs::create_dir_all(t.root().join("templates")).unwrap();
    std::fs::write(t.root().join("templates/properties.yaml"), "properties:\n  date: {kind: datetime, format: \"YYYY-MM-DD HH:mm\"}\n  tags: list\n").unwrap();
    let (s, v) = t.get("/api/properties/spec").await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!((v["found"].as_bool(), v["properties"]["date"]["kind"].as_str()), (Some(true), Some("datetime")));
    let note = "---\n# mine\ndate: 2026-10-01 09:00\ntags:\n  - a\n---\n# Body\n\nText.\n";
    let edit = |e: Value| serde_json::json!({ "text": note, "edit": e });
    let (s, v) = t.send(reqwest::Method::POST, "/api/frontmatter/edit", edit(serde_json::json!({ "op": "set", "key": "date", "value": "2026-10-14 10:30" }))).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["text"], note.replace("2026-10-01 09:00", "2026-10-14 10:30"));
    let (_, v) = t.send(reqwest::Method::POST, "/api/frontmatter/edit", edit(serde_json::json!({ "op": "set", "key": "tags", "value": ["a", "b"] }))).await;
    assert_eq!(v["text"], note.replace("  - a\n", "  - a\n  - b\n"));
    let (s, _) = t.send(reqwest::Method::POST, "/api/frontmatter/edit", edit(serde_json::json!({ "op": "set", "key": "a: b", "value": 1 }))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    t.stop().await;
}

/// The note editor's checkbox goes through the same tick as Home: the line comes back dated, and opened again without the date.
#[tokio::test(flavor = "multi_thread")]
async fn a_task_line_is_ticked_and_opened_again_as_text() {
    let t = T::start().await;
    let day = chrono::Local::now().date_naive().format("%Y-%m-%d").to_string();
    let (s, v) = t.send(reqwest::Method::POST, "/api/task/line", serde_json::json!({ "text": "- [ ] pay 📅 2026-10-20", "done": true })).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(v["lines"], serde_json::json!([format!("- [x] pay 📅 2026-10-20 ✅ {day}")]));
    let (_, v) = t.send(reqwest::Method::POST, "/api/task/line", serde_json::json!({ "text": "- [ ] water 🔁 every day", "done": true })).await;
    assert_eq!(v["lines"].as_array().unwrap().len(), 2, "a recurring task leaves its next occurrence: {v}");
    let (_, v) = t.send(reqwest::Method::POST, "/api/task/line", serde_json::json!({ "text": format!("- [x] pay ✅ {day}"), "done": false })).await;
    assert_eq!(v["lines"], serde_json::json!(["- [ ] pay"]));
    let (s, _) = t.send(reqwest::Method::POST, "/api/task/line", serde_json::json!({ "text": "just text", "done": true })).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    t.stop().await;
}
