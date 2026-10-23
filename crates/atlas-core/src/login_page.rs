//! The sign-in page of server mode (`GET /login`): served by the core itself, before the app is allowed to load,
//! so it is plain HTML with its own small stylesheet (the app's colours, both themes) and no script.
//! docs/SERVER.md.

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// `next`: where to go once signed in (a path of this server); `problem`: what went wrong last time.
pub fn page(vault: &str, next: &str, problem: Option<&str>) -> String {
    let problem = problem.map(|p| format!(r#"<p class="problem" role="alert">{}</p>"#, esc(p))).unwrap_or_default();
    let body = format!(
        r#"{problem}<form method="post" action="/login">
<input type="hidden" name="next" value="{next}">
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
<button type="submit">Sign in</button>
</form>
<p class="foot">Signed in on this browser for 30 days of use. Sign out from Atlas's command bar.</p>"#,
        next = esc(next),
    );
    shell("Sign in", vault, &body)
}

/// The phone app asking in (server.rs `/auth/app`): reached signed in — through whatever sign-in is in front, or this
/// server's own — it asks once, then hands the app a device token through the app's own address.
pub fn app_page(vault: &str, app: &str, who: &str, name: &str, scope: &str) -> String {
    let reach = if scope == "capture" { "capture into it (nothing else)" } else { "read and edit its notes" };
    let body = format!(
        r#"<p>Let <b>{app}</b> on <b>{name}</b> {reach}, as <b>{who}</b>?</p>
<form method="post">
<input type="hidden" name="confirm" value="1">
<button type="submit">Let it in</button>
</form>
<p class="foot">The phone gets a device token of its own: Settings → Server lists it, and revoking it signs the phone out.</p>"#,
        app = esc(app),
        name = esc(name),
        who = esc(who),
    );
    shell("Sign in the phone", vault, &body)
}

/// A locked local core (local_lock.rs) reached without its key: say where Atlas is opened from instead.
pub fn locked_page() -> String {
    let body = r#"<p>This Atlas answers only its own apps, so other programs on this machine (or other apps on this phone) cannot read your notes.</p>
<p class="foot">Open it from the Atlas app. For a browser tab, use the app's command “Open in browser”: it gives a link that works once.</p>"#;
    shell("Atlas is locked", "this computer", body)
}

fn shell(title: &str, vault: &str, body: &str) -> String {
    format!(
        r#"<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><title>{title} · {vault}</title>
<style>
:root {{ --bg: #f6f7f9; --card: #ffffff; --text: #1d2026; --muted: #5f6672; --border: #dfe2e7; --accent: #3d6fe0; --accent-fg: #fff; --red: #c73b3b; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg: #141518; --card: #1c1e23; --text: #e6e8ec; --muted: #9aa1ad; --border: #2c2f36; --accent: #6b93f0; --accent-fg: #0d1220; --red: #ef7b7b; }} }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--text);
  font: 15px/1.45 Inter, "Segoe UI", system-ui, sans-serif; }}
main {{ width: 100%; max-width: 360px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 28px 26px 24px;
  box-shadow: 0 10px 30px rgb(0 0 0 / .08); }}
h1 {{ font-size: 19px; margin: 0 0 2px; letter-spacing: -.01em; }}
.vault {{ color: var(--muted); margin: 0 0 20px; font-size: 14px; overflow-wrap: anywhere; }}
label {{ display: block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }}
input {{ width: 100%; font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; outline: none; }}
input:focus {{ border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }}
button {{ margin-top: 16px; width: 100%; font: inherit; font-weight: 600; color: var(--accent-fg); background: var(--accent); border: 0; border-radius: 8px; padding: 10px; cursor: pointer; }}
button:focus-visible {{ outline: 2px solid var(--accent); outline-offset: 2px; }}
.problem {{ color: var(--red); font-size: 14px; margin: 0 0 14px; }}
p b {{ font-weight: 600; }}
.foot {{ color: var(--muted); font-size: 12px; margin: 18px 0 0; }}
</style>
<body><main>
<h1>Atlas</h1>
<p class="vault">{vault}</p>
{body}
</main></body></html>
"#,
        title = esc(title),
        vault = esc(vault),
    )
}
