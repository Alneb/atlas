//! A plugin's hook (hooks.rs) called from outside, in a real core: the plugin signs a token through
//! `POST /api/plugins/<id>/hooks/sign`, and `POST /api/plugins/<id>/hook/<name>?t=…` — with none of the headers a page
//! sends — reaches its `on = "hook"` tool with the token's data; a changed token, another hook's token and a tool that
//! is not a hook are refused.
#![allow(clippy::disallowed_methods)] // a test writes its fixtures directly
use serde_json::{json, Value};

fn vault(root: &std::path::Path) {
    let p = root.join(".atlas/plugins/demo");
    std::fs::create_dir_all(&p).unwrap();
    std::fs::write(
        p.join("plugin.toml"),
        "title = \"Demo\"\n[helper]\njs = \"helper.js\"\n\
         [[tool]]\nname = \"press\"\ndescription = \"a button pressed far away\"\non = \"hook\"\n\
         [[tool]]\nname = \"plain\"\ndescription = \"not a hook\"\n",
    )
    .unwrap();
    std::fs::write(
        p.join("helper.js"),
        "atlas.method(\"press\", async (a) => { await atlas.write(\"pressed.md\", JSON.stringify({ data: a.data, body: a.body })); return { withdraw: [a.data.notice] }; });\n\
         atlas.method(\"plain\", () => ({}));\n",
    )
    .unwrap();
}

#[tokio::test(flavor = "multi_thread")]
async fn a_signed_hook_reaches_its_plugin_without_a_sign_in_and_nothing_else_does() {
    std::env::set_var("ATLAS_NO_SCHEDULE", "1");
    std::env::set_var("ATLAS_NO_NOTIFY", "1");
    std::env::set_var("ATLAS_NO_BROWSER", "1");
    let secrets = tempfile::tempdir().unwrap();
    std::env::set_var("ATLAS_SECRETS_DIR", secrets.path()); // the signing key, never in the real store
    let dir = tempfile::tempdir().unwrap();
    vault(dir.path());
    let handle = atlas_core::serve(dir.path().to_path_buf(), 0).await.unwrap();
    let base = format!("http://127.0.0.1:{}", handle.port());
    let http = reqwest::Client::new();

    let signed: Value = http
        .post(format!("{base}/api/plugins/demo/hooks/sign"))
        .header("x-atlas", "1")
        .json(&json!({ "hook": "press", "data": { "notice": "demo:1", "action": "done" }, "ttl_secs": 3600 }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let path = signed["path"].as_str().unwrap();
    assert!(path.starts_with("/api/plugins/demo/hook/press?t="), "{signed}");
    assert_eq!(signed["origin"], Value::Null, "called on a loopback address: no outside address known");

    // what an ntfy button sends: a bare POST, no x-atlas
    let r = http.post(format!("{base}{path}")).body("from the phone").send().await.unwrap();
    assert_eq!(r.status(), 200, "{:?}", r.text().await);
    let seen: Value = serde_json::from_str(&std::fs::read_to_string(dir.path().join("pressed.md")).unwrap()).unwrap();
    assert_eq!(seen, json!({ "data": { "notice": "demo:1", "action": "done" }, "body": "from the phone" }));

    // a token changed by a letter, one for another hook, a tool that is not a hook, no token
    let token = signed["token"].as_str().unwrap();
    let flipped = format!("{}{}", &token[..token.len() - 1], if token.ends_with('A') { 'B' } else { 'A' });
    let status = |url: String| {
        let http = http.clone();
        async move { http.post(url).send().await.unwrap().status().as_u16() }
    };
    assert_eq!(status(format!("{base}/api/plugins/demo/hook/press?t={flipped}")).await, 403);
    assert_eq!(status(format!("{base}/api/plugins/demo/hook/other?t={token}")).await, 403, "signed for press only");
    let plain: Value = http
        .post(format!("{base}/api/plugins/demo/hooks/sign"))
        .header("x-atlas", "1")
        .json(&json!({ "hook": "plain", "ttl_secs": 60 }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(status(format!("{base}{}", plain["path"].as_str().unwrap())).await, 404, "a tool with no on = \"hook\" is not reachable this way");
    assert_eq!(status(format!("{base}/api/plugins/demo/hook/press")).await, 403);
    // the rest of the API still wants its header
    assert_eq!(status(format!("{base}/api/plugins/demo/tools/plain")).await, 403);
}
