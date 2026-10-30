//! The HTTP/WS server: one router for UI, CLI and scripts, bound to 127.0.0.1 only.
use crate::api::*;
use crate::commands::{self, blocking, Command};
use crate::events::{spawn_watcher, EventBus, WatcherGuard};
use crate::config::BuiltinPlugin;
use crate::{capture, files, git, pty, search, today, vault_write, Error, Result, Workspace};
use axum::body::Bytes;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{DefaultBodyLimit, Path as UrlPath, Query, Request, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode, Uri};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use rust_embed::RustEmbed;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::oneshot;

#[path = "server_desktop.rs"]
mod desktop;

/// The built UI (placeholder page until `ui/` is built; see build.rs).
#[derive(RustEmbed)]
#[folder = "../../ui/dist"]
// on a phone, not Excalidraw's Chinese handwriting font (12.8 MB of the 35 MB bundle; a drawing's CJK text falls back
// to a system font there) — the user chose it to make the APK smaller (2026-10-16)
#[cfg_attr(target_os = "android", exclude = "excalidraw/fonts/Xiaolai/*")]
struct Dist;

const VITE_DEV_PORT: u16 = 5173;

struct AppState {
    ws: Workspace,
    bus: EventBus,
    port: u16,
    /// Last state reported by the UI; in memory only (it describes this session, not the files).
    ui: std::sync::RwLock<UiState>,
    /// The plugins' long-lived helper processes (stopped with the server: they die with this state).
    helpers: crate::helper::Helpers,
    /// The terminals, kept across a page reload (pty.rs).
    ptys: pty::Sessions,
    /// Server mode's sign-in (auth.rs); None on the desktop (127.0.0.1, no sign-in).
    auth: Option<Arc<crate::auth::Auth>>,
    /// A local core's key (local_lock.rs): Some when it is closed to other programs.
    lock: Option<Arc<crate::local_lock::LocalLock>>,
    /// Where this vault is on a server of several (`/v/<name>`); "" when it is the only one, at `/`.
    prefix: String,
    /// A server's vaults (the vault picker lists them); None on the desktop, whose picker lists folders.
    served: Option<Arc<Vec<Served>>>,
    /// The devices with a file open, relaying to each other (live.rs).
    live: Arc<crate::live::Rooms>,
    /// The plugins' media addresses, their secrets filled in and kept here (plugin_media.rs).
    media: crate::plugin_media::Media,
    /// The desktop's one core for every local vault (server_desktop.rs), when this vault is served by it.
    desktop: desktop::DesktopLink,
    /// A server's write leases for the devices mirroring this vault (mirror_guard.rs); its own writes take them once a
    /// device has asked (`leasing`), so a vault nobody mirrors is not hashed on every write.
    leases: Arc<crate::lease::Leases<vault_write::ContentHash>>,
    leasing: std::sync::Once,
}

/// A vault of a server: its name in the address (`/v/<name>/`) and its folder.
#[derive(Debug, Clone)]
pub struct Served {
    pub name: String,
    pub root: PathBuf,
}

type S = State<Arc<AppState>>;

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let status = status_of(&self);
        if status.is_server_error() {
            eprintln!("atlas: {self}");
        }
        let mtime = match &self {
            Error::Conflict { current } => *current,
            _ => None,
        };
        (status, Json(ApiError { error: self.to_string(), mtime })).into_response()
    }
}

fn status_of(e: &Error) -> StatusCode {
    match e {
        Error::NotFound(_) => StatusCode::NOT_FOUND,
        Error::BadPath(_) | Error::BadRequest(_) => StatusCode::BAD_REQUEST,
        Error::Conflict { .. } => StatusCode::CONFLICT,
        Error::TooLarge(_) => StatusCode::PAYLOAD_TOO_LARGE,
        Error::NotText(_) => StatusCode::UNSUPPORTED_MEDIA_TYPE,
        Error::CommandFailed(_) | Error::Io(_) | Error::Other(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

/// Runs a blocking closure with a clone of the workspace.
async fn with_ws<T: Send + 'static>(
    st: &AppState,
    f: impl FnOnce(Workspace) -> Result<T> + Send + 'static,
) -> Result<T> {
    let ws = st.ws.clone();
    blocking(move || f(ws)).await
}

async fn workspace(State(st): S) -> Result<Json<WorkspaceInfo>> {
    Ok(Json(with_ws(&st, |ws| ws.info()).await?))
}

#[derive(serde::Deserialize)]
struct TreeQuery {
    path: Option<String>,
    /// dotfiles listed whatever `[files] show_hidden` says
    #[serde(default)]
    hidden: bool,
}

async fn tree(State(st): S, Query(q): Query<TreeQuery>) -> Result<Json<Vec<TreeEntry>>> {
    let rel = q.path.unwrap_or_default();
    Ok(Json(with_ws(&st, move |ws| files::tree(&ws, &rel, q.hidden)).await?))
}

/// Every workspace file (ignore rules applied): the UI resolves links and embeds against it.
#[derive(serde::Deserialize)]
struct FilesQuery {
    /// Only the user's own files: the agent's (`editor.index_exclude`) left out, as in `[[` completion.
    #[serde(default)]
    index: bool,
    /// Only what is at or under this file or folder: the UI keeps its list current from file events with it.
    under: Option<String>,
}

async fn files_get(State(st): S, Query(q): Query<FilesQuery>) -> Result<Json<Vec<String>>> {
    Ok(Json(
        with_ws(&st, move |ws| {
            let cfg = ws.config()?;
            let listed: Vec<String> = match &q.under {
                Some(under) => crate::walk::files_under(ws.root(), &ws.resolve(under)?, &cfg).into_iter().map(|(_, rel)| rel).collect(),
                None => crate::walk::files(ws.root(), &cfg).map(|(_, rel)| rel).collect(),
            };
            Ok(listed.into_iter().filter(|rel| !q.index || !cfg.is_agent_file(rel)).collect())
        })
        .await?,
    ))
}

/// Whether a file or folder is there: the UI's optional files (bookmarks, workspaces, the sidebar) are asked for this
/// way, not read and answered 404 (a line in the browser's log) nor found by listing every parent folder.
async fn exists_get(State(st): S, Query(q): Query<PathQuery>) -> Result<Json<bool>> {
    let rel = required_path(q)?;
    Ok(Json(with_ws(&st, move |ws| Ok(ws.resolve(&rel)?.exists())).await?))
}

fn required_path(q: PathQuery) -> Result<String> {
    q.path.filter(|p| !p.is_empty()).ok_or_else(|| Error::BadRequest("missing ?path=".into()))
}

async fn file_get(State(st): S, Query(q): Query<PathQuery>) -> Result<Json<FileText>> {
    let rel = required_path(q)?;
    Ok(Json(with_ws(&st, move |ws| files::read_text(&ws, &rel)).await?))
}

async fn file_put(State(st): S, Json(req): Json<FileWrite>) -> Result<Json<FileWritten>> {
    let path = req.path.clone();
    let (written, note) = with_ws(&st, move |ws| {
        // what it was, for a property that this save sets (template_apply.rs); notes only
        let before = req.path.ends_with(".md").then(|| ws.resolve(&req.path).ok().and_then(|p| std::fs::read_to_string(p).ok())).flatten();
        let mut written = files::write_text(&ws, &req)?;
        if written.written {
            written = apply_template(&ws, &req, before.as_deref(), written)?;
        }
        // a drawing's companion note follows each save (drawing_note.rs); a failure there never fails the save
        let note = crate::drawing_note::update(&ws, &req.path, &req.text).unwrap_or_else(|e| {
            eprintln!("atlas: the companion note of {} was not written: {e}", req.path);
            None
        });
        Ok((written, note))
    })
    .await?;
    st.bus.publish(Event::Fs { paths: std::iter::once(path).chain(note).collect() });
    Ok(Json(written))
}

/// A template the save brings (template_apply.rs): answered as text to an editor that applies it itself, else written
/// here, the answer's mtime then the merged file's. A failure never fails the save.
fn apply_template(ws: &Workspace, req: &FileWrite, before: Option<&str>, written: FileWritten) -> Result<FileWritten> {
    let Ok(cfg) = ws.config() else { return Ok(written) };
    let now = chrono::Local::now().naive_local();
    let Some(a) = crate::template_apply::on_save(ws.root(), &cfg, &req.path, before, &req.text, now) else { return Ok(written) };
    if req.apply_here {
        return Ok(FileWritten { template: Some(TemplateMerged { template: a.template, added: a.added, text: Some(a.text), body: None }), ..written });
    }
    let merged = files::write_text(ws, &FileWrite { path: req.path.clone(), text: a.text, base_mtime: Some(written.mtime), only_new: false, apply_here: false })?;
    Ok(FileWritten { template: Some(TemplateMerged { template: a.template, added: a.added, text: None, body: None }), ..merged })
}

/// `POST /api/note/merge-template`: a template merged into a note's text as an editor holds it (its retry when it
/// was typed in meanwhile; "Insert template").
async fn merge_template_post(State(st): S, Json(r): Json<MergeTemplate>) -> Result<Json<TemplateMerged>> {
    Ok(Json(with_ws(&st, move |ws| {
        let a = crate::template_apply::merge_into(ws.root(), &ws.config()?, &r.path, &r.template, &r.text, r.at_cursor, chrono::Local::now().naive_local())?;
        Ok(TemplateMerged { template: a.template, added: a.added, text: Some(a.text), body: a.body })
    })
    .await?))
}

/// `Range: bytes=a-b` (or `a-`): the one range a PDF viewer asks for; anything else is served whole.
fn byte_range(headers: &HeaderMap) -> Option<(u64, u64)> {
    let spec = headers.get(header::RANGE)?.to_str().ok()?.strip_prefix("bytes=")?;
    let (a, b) = spec.split_once('-')?;
    let start = a.trim().parse().ok()?;
    let end = if b.trim().is_empty() { u64::MAX } else { b.trim().parse().ok()? };
    (start <= end).then_some((start, end))
}

async fn raw(State(st): S, headers: HeaderMap, Query(q): Query<PathQuery>) -> Result<Response> {
    let rel = required_path(q)?;
    let ranges = (header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    if let Some((start, end)) = byte_range(&headers) {
        let (bytes, len, mime) = with_ws(&st, move |ws| files::read_raw_range(&ws, &rel, start, end)).await?;
        let range = format!("bytes {start}-{}/{len}", start + bytes.len() as u64 - 1);
        return Ok((StatusCode::PARTIAL_CONTENT, [(header::CONTENT_TYPE, mime), (header::CONTENT_RANGE, range)], [ranges], bytes)
            .into_response());
    }
    // the whole file streamed, not read into memory first: a viewer's first GET (and a HEAD) only wants the headers
    let (path, mime, mtime, len) = with_ws(&st, move |ws| {
        let path = ws.resolve(&rel)?;
        let meta = std::fs::metadata(&path).map_err(|_| Error::NotFound(rel.clone()))?;
        if !meta.is_file() {
            return Err(Error::NotFound(rel));
        }
        let mime = mime_guess::from_path(&path).first_or_octet_stream().essence_str().to_string();
        Ok((path, mime, Mtime::of(&meta)?, meta.len()))
    })
    .await?;
    let body = axum::body::Body::from_stream(tokio_util::io::ReaderStream::new(tokio::fs::File::open(path).await?));
    // The mtime lets binary editors (PDF annotation) save with the same 409 check as text.
    Ok((
        [(header::CONTENT_TYPE, mime), (header::HeaderName::from_static("x-atlas-mtime"), mtime.0.to_string())],
        [ranges, (header::CONTENT_LENGTH, HeaderValue::from(len))],
        body,
    )
        .into_response())
}

#[derive(serde::Deserialize)]
struct ThumbQuery {
    path: String,
    w: Option<u32>,
}

/// One decode at a time: each full-size figure can take ~40 MB while it is shrunk.
static THUMB_GATE: std::sync::LazyLock<tokio::sync::Semaphore> = std::sync::LazyLock::new(|| tokio::sync::Semaphore::new(2));

async fn thumb(State(st): S, Query(q): Query<ThumbQuery>) -> Result<Response> {
    let _slot = THUMB_GATE.acquire().await.map_err(|e| Error::BadRequest(e.to_string()))?;
    let (bytes, mime) = with_ws(&st, move |ws| crate::thumbs::thumbnail(&ws, &q.path, q.w.unwrap_or(320))).await?;
    Ok(([(header::CONTENT_TYPE, mime), (header::CACHE_CONTROL, "private, max-age=60")], bytes).into_response())
}

#[derive(serde::Deserialize)]
struct RawPut {
    path: String,
    base_mtime: Option<Mtime>,
}

/// Binary body (an annotated PDF from pdf.js `saveDocument`); same 409 contract as text PUT.
async fn raw_put(State(st): S, Query(q): Query<RawPut>, body: Bytes) -> Result<Json<FileWritten>> {
    let path = q.path.clone();
    let written = with_ws(&st, move |ws| files::write_raw(&ws, &q.path, &body, q.base_mtime)).await?;
    st.bus.publish(Event::Fs { paths: vec![path] });
    Ok(Json(written))
}

#[derive(serde::Deserialize)]
struct PluginsQuery {
    /// `android`: each plugin's `not_here` and `blocked` as the phone app sees them (it runs a server vault's plugins
    /// itself). None: as this core's own platform sees them.
    platform: Option<crate::platform::Platform>,
}

async fn plugins_get(State(st): S, Query(q): Query<PluginsQuery>) -> Result<Json<Vec<crate::plugins::Plugin>>> {
    Ok(Json(
        with_ws(&st, move |ws| {
            // `blocked` always filled: the core's rule is the only one (the page and the phone read it, never redo it)
            let list = crate::plugins::list(ws.root());
            Ok(crate::plugins::as_seen_from(list, &ws.config()?.plugins.off, q.platform.unwrap_or_else(crate::platform::Platform::current)))
        })
        .await?,
    ))
}

/// What the plugins that can run contribute to plugin `id` (`[contributes.<id>]`), by contributing plugin.
async fn plugin_contributions_get(State(st): S, UrlPath(id): UrlPath<String>) -> Result<Json<serde_json::Map<String, serde_json::Value>>> {
    Ok(Json(with_ws(&st, move |ws| crate::plugins::contributions(ws.root(), &ws.config()?.plugins.off, &id)).await?))
}

/// A plugin's data script; the body (any JSON, or empty) is passed as `args`.
async fn plugin_data_post(State(st): S, UrlPath(id): UrlPath<String>, body: Bytes) -> Result<Json<serde_json::Value>> {
    let args = if body.iter().all(u8::is_ascii_whitespace) {
        serde_json::Value::Null
    } else {
        serde_json::from_slice(&body).map_err(|e| Error::BadRequest(format!("body: {e}")))?
    };
    Ok(Json(crate::plugins::data(st.ws.root(), &id, args).await?))
}

/// The plugin's settings form: `{ key: value }` for its declared `[[setting]]` fields.
/// A card renamed is told to the plugin (`settings:renamed` { key, from, to }), to move what it keeps under the name.
async fn plugin_settings_put(State(st): S, UrlPath(id): UrlPath<String>, Json(values): Json<serde_json::Map<String, serde_json::Value>>) -> Result<()> {
    let plugin = id.clone();
    let renamed = with_ws(&st, move |ws| crate::plugins::save_settings(ws.root(), &crate::secrets::Store::for_vault(ws.root()), &id, &values)).await?;
    for (key, from, to) in renamed {
        st.bus.publish(Event::Plugin { plugin: plugin.clone(), event: "settings:renamed".into(), data: serde_json::json!({ "key": key, "from": from, "to": to }) });
    }
    Ok(())
}

/// `atlas.fetch`: a request made by the core for a plugin, to a host its manifest lists.
/// A sign-in met on the way is also told to the page, which offers it — a helper's fetch too.
/// A plugin's media to play (plugin_media.rs): the page's address for it, the secret kept here.
async fn plugin_media_post(State(st): S, UrlPath(id): UrlPath<String>, Json(req): Json<crate::plugin_media::MediaRequest>) -> Result<Json<crate::plugin_media::MediaAddress>> {
    let st2 = st.clone();
    let ticket = with_ws(&st, move |ws| st2.media.prepare(ws.root(), &crate::secrets::Store::for_vault(ws.root()), &id, &req)).await?;
    Ok(Json(crate::plugin_media::MediaAddress { src: format!("{}/media/{ticket}", st.prefix), ticket }))
}

/// `<audio src>`'s request (no `x-atlas` header can be set there: outside /api, the ticket its own key), streamed.
async fn media_get(State(st): S, UrlPath(ticket): UrlPath<String>, headers: axum::http::HeaderMap) -> Response {
    st.media.play(&ticket, &headers).await
}

/// A plugin's own file by URL (plugin_files.rs): streamed, revalidated by its ETag (`no-cache`: a changed file is seen
/// on the page's next load; within a page a change is a new `<rev>`).
async fn plugin_file_get(State(st): S, UrlPath((rev, path)): UrlPath<(String, String)>, headers: HeaderMap) -> Result<Response> {
    if !crate::plugin_files::valid_rev(&rev) {
        return Err(Error::BadPath(format!("{rev:?}: not a revision")));
    }
    let found = with_ws(&st, move |ws| crate::plugin_files::locate(ws.root(), &path)).await?;
    let common = [
        (header::CACHE_CONTROL, HeaderValue::from_static("no-cache")),
        (header::ETAG, HeaderValue::from_str(&found.etag).map_err(|e| Error::BadRequest(e.to_string()))?),
        (header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff")),
    ];
    if headers.get(header::IF_NONE_MATCH).is_some_and(|v| v.as_bytes() == found.etag.as_bytes()) {
        return Ok((StatusCode::NOT_MODIFIED, common).into_response());
    }
    let body = axum::body::Body::from_stream(tokio_util::io::ReaderStream::new(tokio::fs::File::open(&found.path).await?));
    Ok((common, [(header::CONTENT_TYPE, HeaderValue::from_static(found.mime)), (header::CONTENT_LENGTH, HeaderValue::from(found.len))], body).into_response())
}

async fn plugin_fetch_post(State(st): S, UrlPath(id): UrlPath<String>, Json(req): Json<crate::plugin_net::FetchRequest>) -> Result<Json<crate::plugin_net::FetchResponse>> {
    let (plugin, quiet) = (id.clone(), req.quiet == Some(true));
    let r = with_ws(&st, move |ws| crate::plugin_net::fetch(ws.root(), &crate::secrets::Store::for_vault(ws.root()), &id, &req)).await?;
    if let Some(signin) = r.signin.as_ref().filter(|_| !quiet) {
        let _ = st.bus.emit(Event::SigninNeeded { plugin, signin: signin.clone() });
    }
    Ok(Json(r))
}

/// The desktop's sign-in window came back to the service with the gate's cookies (crates/atlas-app `door_window`).
#[derive(serde::Deserialize)]
struct DoorReturn {
    host: String,
    cookies: Vec<crate::service_signin::Cookie>,
}

async fn signin_door_post(State(st): S, Json(r): Json<DoorReturn>) -> Result<()> {
    let host = r.host.trim().to_ascii_lowercase();
    if host.is_empty() || r.cookies.is_empty() {
        return Err(Error::BadRequest("a sign-in needs a host and at least one cookie".into()));
    }
    let h = host.clone();
    with_ws(&st, move |ws| crate::service_signin::keep(&crate::secrets::Store::for_vault(ws.root()), &h, r.cookies)).await?;
    let _ = st.bus.emit(Event::SignedIn { host });
    Ok(())
}

/// The kept sign-ins, for Settings (hosts and dates, never a cookie's value).
async fn signin_doors_get(State(st): S) -> Result<Json<Vec<crate::service_signin::Kept>>> {
    Ok(Json(with_ws(&st, |ws| {
        let plugins: Vec<(String, Vec<String>)> = crate::plugins::list(ws.root()).into_iter().map(|p| (p.id, p.permissions.net)).collect();
        crate::service_signin::with_users(&crate::secrets::Store::for_vault(ws.root()), &plugins)
    })
    .await?))
}

async fn signin_door_delete(State(st): S, UrlPath(host): UrlPath<String>) -> Result<Json<bool>> {
    Ok(Json(with_ws(&st, move |ws| crate::service_signin::forget(&crate::secrets::Store::for_vault(ws.root()), &host)).await?))
}

/// The OpenID providers signed in (plugin_oauth.rs), shared by the plugins: which, until when, used by whom.
async fn signin_tokens_get(State(st): S) -> Result<Json<Vec<crate::plugin_oauth::OidcSignin>>> {
    Ok(Json(with_ws(&st, |ws| {
        let ids: Vec<String> = crate::plugins::list(ws.root()).into_iter().map(|p| p.id).collect();
        crate::plugin_oauth::providers(&crate::secrets::Store::for_vault(ws.root()), &ids)
    })
    .await?))
}

async fn signin_token_delete(State(st): S, UrlPath(key): UrlPath<String>) -> Result<Json<bool>> {
    Ok(Json(with_ws(&st, move |ws| crate::plugin_oauth::forget(&crate::secrets::Store::for_vault(ws.root()), &key)).await?))
}

/// Where the page sends a service sign-in: the desktop app catches this address and opens the gate's page in a
/// window of its own (crates/atlas-app `door_target`). A browser lands here, and is told why nothing more happens.
async fn signin_door_page() -> Response {
    axum::response::Html(concat!(
        "<!doctype html><meta charset=utf-8><title>Sign in — Atlas</title>",
        "<body style=\"font:15px system-ui;max-width:34em;margin:4em auto;padding:0 1em\">",
        "<h1 style=\"font-size:1.3em\">Signing in for plugins needs the desktop app</h1>",
        "<p>A plugin reached a service with a sign-in in front of it. Atlas keeps that sign-in for its plugins, ",
        "but only the desktop app's sign-in window can hand it over — a browser tab keeps it to itself. ",
        "Open this vault in the Atlas app and sign in from there.</p></body>"
    ))
    .into_response()
}

#[derive(serde::Deserialize)]
struct PluginFrom {
    from: String,
    #[serde(default)]
    id: Option<String>,
}

/// What the configured release offers ([plugins] release_index), for "Install a plugin".
async fn plugins_available_get(State(st): S) -> Result<Json<Vec<crate::plugin_install::Available>>> {
    Ok(Json(with_ws(&st, move |ws| crate::plugin_install::available(ws.root(), &ws.config()?.plugins.release_index)).await?))
}

/// Copies a plugin into the vault (a folder, a git address or an archive); it arrives switched off.
async fn plugin_install_post(State(st): S, Json(req): Json<PluginFrom>) -> Result<Json<crate::plugin_install::Installed>> {
    Ok(Json(with_ws(&st, move |ws| crate::plugin_install::install(ws.root(), &crate::plugin_install::Source::parse(&req.from), req.id.as_deref(), false)).await?))
}

async fn plugin_update_post(State(st): S, UrlPath(id): UrlPath<String>) -> Result<Json<crate::plugin_install::Installed>> {
    st.helpers.stop(&id); // its program is replaced with the rest
    Ok(Json(with_ws(&st, move |ws| crate::plugin_install::update(ws.root(), &id)).await?))
}

/// To the vault's trash; the answer says where.
async fn plugin_remove_post(State(st): S, UrlPath(id): UrlPath<String>) -> Result<Json<serde_json::Value>> {
    st.helpers.stop(&id);
    let to = with_ws(&st, move |ws| crate::plugin_install::remove(ws.root(), &id)).await?;
    Ok(Json(serde_json::json!({ "to": to })))
}

#[derive(serde::Deserialize)]
struct HelperCall {
    method: String,
    #[serde(default)]
    params: serde_json::Value,
    #[serde(default)]
    timeout_secs: Option<u64>,
}

/// `atlas.helper.call`: asks the plugin's helper (started now if it is not running) and waits.
/// `{id}` of a plugin route that acts: an id, or `@role` (plugins::resolve).
async fn plugin_named(st: &AppState, named: String) -> Result<String> {
    with_ws(st, move |ws| crate::plugins::resolve(ws.root(), &ws.config()?.plugins.off, &named)).await
}

async fn plugin_helper_post(State(st): S, UrlPath(id): UrlPath<String>, Json(c): Json<HelperCall>) -> Result<Json<serde_json::Value>> {
    let id = plugin_named(&st, id).await?;
    let timeout = c.timeout_secs.map(std::time::Duration::from_secs).unwrap_or(crate::helper::CALL_TIMEOUT);
    // settings and secrets go with the call from the core (as with a tool's), so a page never holds the secrets
    let params = {
        let (ws, id) = (st.ws.clone(), id.clone());
        blocking(move || crate::plugin_tools::page_call_params(ws.root(), &ws.config()?, &crate::secrets::Store::for_vault(ws.root()), &id, c.params)).await?
    };
    let answer = st.helpers.call(&id, &c.method, params, timeout).await?;
    let kept = answer.get("_secrets").is_some_and(|s| s.as_object().is_some_and(|m| !m.is_empty()));
    let (ws, plugin) = (st.ws.clone(), id.clone());
    let answer = blocking(move || {
        let allowed = crate::plugins::permissions(ws.root(), &id)?.secrets;
        crate::plugin_tools::keep_secrets(&crate::secrets::Store::for_vault(ws.root()), &id, allowed, answer)
    })
    .await?;
    // a sign-in kept (or dropped) a secret: Settings shows which ones are set, so it is told
    if kept {
        st.bus.publish(Event::Plugin { plugin, event: "secrets".into(), data: serde_json::Value::Null });
    }
    Ok(Json(answer))
}

/// Runs a plugin's tool in the window's helper — the one the page uses, so sessions are shared.
async fn plugin_tool_post(State(st): S, UrlPath((id, name)): UrlPath<(String, String)>, body: Bytes) -> Result<Json<serde_json::Value>> {
    let id = plugin_named(&st, id).await?;
    let args = if body.is_empty() { serde_json::Value::Null } else { serde_json::from_slice(&body).map_err(|e| Error::BadRequest(e.to_string()))? };
    let cfg = with_ws(&st, |ws| ws.config()).await?;
    let store = crate::secrets::Store::for_vault(st.ws.root());
    Ok(Json(crate::plugin_tools::call(st.ws.root(), &cfg, &st.helpers, &store, &id, &name, args).await?))
}

async fn plugin_helper_get(State(st): S, UrlPath(id): UrlPath<String>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "state": st.helpers.state(&id) }))
}

/// Stops the helper (a plugin switched off; "restart": the next call starts it again).
async fn plugin_helper_stop(State(st): S, UrlPath(id): UrlPath<String>) -> Json<serde_json::Value> {
    st.helpers.stop(&id);
    Json(serde_json::json!({ "state": st.helpers.state(&id) }))
}

/// The vault's secret store, for a plugin that declared `[permissions] secrets = true`.
fn plugin_secrets(ws: &Workspace, id: &str) -> Result<crate::secrets::Store> {
    if !crate::plugins::permissions(ws.root(), id)?.secrets {
        return Err(Error::BadRequest(format!("plugin {id} keeps no secrets: add [permissions] secrets = true to its plugin.toml")));
    }
    Ok(crate::secrets::Store::for_vault(ws.root()))
}

/// The names of a plugin's secrets (never their values).
async fn plugin_secrets_get(State(st): S, UrlPath(id): UrlPath<String>) -> Result<Json<Vec<String>>> {
    Ok(Json(with_ws(&st, move |ws| plugin_secrets(&ws, &id)?.names(&id)).await?))
}

/// A secret's value: only to the plugin's own helper (over its pipe, `helper_api::Caller`), never to a page — a page
/// lets the core fill it in (`atlas.fetch` headers and form fields) or asks the helper, which gets it with each call
/// (docs/guides/PLUGIN-API.md).
async fn plugin_secret_get(State(st): S, helper: Option<axum::Extension<crate::helper_api::Caller>>, UrlPath((id, name)): UrlPath<(String, String)>) -> Response {
    if helper.is_none() {
        return forbidden("a plugin's secret stays on the server: let atlas.fetch fill it in ({ secret: name } in a header or a form field), or read it in the plugin's helper (it comes with each call as params.secrets)");
    }
    match with_ws(&st, move |ws| plugin_secrets(&ws, &id)?.get(&id, &name)).await {
        Ok(value) => Json(serde_json::json!({ "value": value })).into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(serde::Deserialize)]
struct SecretValue {
    value: String,
}

async fn plugin_secret_put(State(st): S, UrlPath((id, name)): UrlPath<(String, String)>, Json(v): Json<SecretValue>) -> Result<()> {
    with_ws(&st, move |ws| plugin_secrets(&ws, &id)?.set(&id, &name, &v.value)).await
}

async fn plugin_secret_delete(State(st): S, UrlPath((id, name)): UrlPath<(String, String)>) -> Result<Json<bool>> {
    Ok(Json(with_ws(&st, move |ws| plugin_secrets(&ws, &id)?.delete(&id, &name)).await?))
}

// A plugin's OpenID sign-ins (plugin_oauth.rs): the page starts one and hands back where the provider sent the
// browser; the tokens stay here, and atlas.fetch fills them in ({ oauth: name }).
async fn plugin_oauth_start(State(st): S, UrlPath(id): UrlPath<String>, Json(req): Json<crate::plugin_oauth::OauthStart>) -> Result<Json<crate::plugin_oauth::OauthStarted>> {
    Ok(Json(with_ws(&st, move |ws| crate::plugin_oauth::start(ws.root(), &id, &req, &ws.config()?.plugins)).await?))
}

#[derive(serde::Deserialize)]
struct OauthReturn {
    address: String,
}

async fn plugin_oauth_finish(State(st): S, UrlPath(id): UrlPath<String>, Json(r): Json<OauthReturn>) -> Result<Json<serde_json::Value>> {
    let name = with_ws(&st, move |ws| crate::plugin_oauth::finish(&plugin_secrets(&ws, &id)?, &id, &r.address)).await?;
    Ok(Json(serde_json::json!({ "name": name })))
}

async fn plugin_oauth_status(State(st): S, UrlPath((id, name)): UrlPath<(String, String)>) -> Result<Json<crate::plugin_oauth::OauthStatus>> {
    Ok(Json(with_ws(&st, move |ws| crate::plugin_oauth::status(&plugin_secrets(&ws, &id)?, &id, &name)).await?))
}

async fn plugin_oauth_delete(State(st): S, UrlPath((id, name)): UrlPath<(String, String)>) -> Result<Json<bool>> {
    Ok(Json(with_ws(&st, move |ws| crate::plugin_oauth::sign_out(&plugin_secrets(&ws, &id)?, &id, &name)).await?))
}

async fn today_get(State(st): S) -> Result<Json<Today>> {
    Ok(Json(with_ws(&st, |ws| today::today(ws.root(), &ws.config()?)).await?))
}

#[derive(serde::Deserialize)]
struct DayQuery {
    /// `YYYY-MM-DD`; default today
    day: Option<String>,
}

/// What was made on a day and what else changed (the Activity card's days, a day's log).
async fn activity_get(State(st): S, Query(q): Query<DayQuery>) -> Result<Json<crate::api::DayActivity>> {
    let day = match q.day.as_deref() {
        Some(d) => chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").map_err(|_| Error::BadRequest(format!("{d}: a day is YYYY-MM-DD")))?,
        None => chrono::Local::now().date_naive(),
    };
    Ok(Json(with_ws(&st, move |ws| Ok(today::day_activity(ws.root(), &ws.config()?, day))).await?))
}

/// Today's log, made from the template if it is not there yet (the log card's one button).
async fn today_log_post(State(st): S) -> Result<Json<crate::api::TodayLog>> {
    let r = with_ws(&st, |ws| capture::today_log(ws.root(), &ws.config()?, chrono::Local::now().naive_local())).await?;
    if r.created {
        st.bus.publish(Event::Fs { paths: vec![r.path.clone()] });
        crate::capture_hooks::log_made(st.ws.clone(), st.helpers.clone(), r.path.clone());
    }
    Ok(Json(r))
}

#[derive(serde::Deserialize)]
struct DescribeRequest {
    text: String,
    /// The vault the capture goes to, when it is not this one (the capture window's choice, as `POST /api/capture`).
    #[serde(default)]
    vault: Option<String>,
}

/// Every capture box's hint as it is typed (`capture::describe`), with the settings of the vault it goes to.
async fn capture_describe(State(st): S, Json(req): Json<DescribeRequest>) -> Result<Json<crate::api::CaptureHint>> {
    let today = chrono::Local::now().date_naive();
    let here = st.ws.root().to_path_buf();
    let other = req.vault.as_deref().map(std::path::PathBuf::from).filter(|v| *v != here);
    let Some(other) = other else {
        return Ok(Json(with_ws(&st, move |ws| Ok(capture::describe(Some((ws.root(), &ws.config()?)), &req.text, today))).await?));
    };
    blocking(move || {
        let ws = known_vault(&other)?;
        Ok(capture::describe(Some((ws.root(), &ws.config()?)), &req.text, today))
    })
    .await
    .map(Json)
}

/// Another vault a capture names: only one the user has opened before (the list).
fn known_vault(path: &std::path::Path) -> Result<Workspace> {
    if !crate::vaults::list(&crate::vaults::list_file()).iter().any(|v| std::path::Path::new(&v.path) == path && !v.missing) {
        return Err(Error::BadRequest(format!("{} is not one of the known vaults", path.display())));
    }
    Workspace::open(path)
}

/// The day words offered after `@`, each with the day it names today.
async fn capture_days() -> Json<Vec<crate::api::CaptureDay>> {
    Json(capture::days(chrono::Local::now().date_naive()))
}

async fn capture_post(State(st): S, Json(req): Json<CaptureRequest>) -> Result<Json<CaptureResult>> {
    let here = st.ws.root().to_path_buf();
    let other = req.vault.as_deref().map(std::path::PathBuf::from).filter(|v| *v != here);
    let Some(other) = other else {
        let text = req.text.clone();
        let r = with_ws(&st, move |ws| capture::capture(ws.root(), &ws.config()?, &req.text)).await?;
        st.bus.captured(crate::events::Captured { text, path: r.path.clone(), line: r.line });
        return Ok(Json(r));
    };
    // another vault: written as that vault's own settings say
    Ok(Json(
        blocking(move || {
            let ws = known_vault(&other)?;
            capture::capture_unserved(ws.root(), &ws.config()?, &req.text)
        })
        .await?,
    ))
}

/// A capture just made, taken back (captures.rs `undo`); open editors are told.
async fn capture_undo(State(st): S, Json(req): Json<crate::api::CaptureUndo>) -> Result<StatusCode> {
    let paths = with_ws(&st, move |ws| crate::captures::undo(&ws, &req)).await?;
    st.bus.publish(Event::Fs { paths });
    Ok(StatusCode::NO_CONTENT)
}

/// Every capture and its state (captures.rs): the Captures block, the untriaged count on Home.
async fn captures_get(State(st): S) -> Result<Json<crate::api::CaptureList>> {
    Ok(Json(with_ws(&st, |ws| Ok(crate::captures::list(ws.root(), &ws.config()?))).await?))
}

/// One triage answer, written into the capture's file (and the note it is filed into); open editors are told.
async fn captures_triage(State(st): S, Json(req): Json<crate::api::TriageRequest>) -> Result<StatusCode> {
    let paths = with_ws(&st, move |ws| crate::captures::triage(ws.root(), &ws.config()?, &req, chrono::Local::now().naive_local())).await?;
    st.bus.publish(Event::Fs { paths });
    Ok(StatusCode::NO_CONTENT)
}

async fn note_new(State(st): S, Json(mut req): Json<NewNote>) -> Result<Json<NewNoteResult>> {
    crate::template_values::add_provided(&st.ws, &st.helpers, &mut req).await;
    let r = with_ws(&st, move |ws| crate::notes::new_note(ws.root(), &ws.config()?, &req)).await?;
    st.bus.publish(Event::Fs { paths: vec![r.path.clone()] });
    Ok(Json(r))
}

async fn note_templates(State(st): S) -> Result<Json<Vec<crate::notes::TemplateInfo>>> {
    Ok(Json(with_ws(&st, move |ws| crate::notes::templates(ws.root(), &ws.config()?)).await?))
}

async fn replace_post(State(st): S, Json(r): Json<ReplaceRequest>) -> Result<Json<ReplaceResult>> {
    let o = search::Opts { case: r.case, word: r.word, regex: r.regex, agent: r.agent };
    Ok(Json(with_ws(&st, move |ws| search::replace(&ws, &r.q, o, &r.with, r.only.as_deref())).await?))
}

async fn search_get(State(st): S, Query(q): Query<SearchQuery>) -> Result<Json<SearchResults>> {
    let o = search::Opts { case: q.case, word: q.word, regex: q.regex, agent: q.agent };
    Ok(Json(with_ws(&st, move |ws| Ok(search::search_with(ws.root(), &ws.config()?, &q.q, o))).await?))
}

/// Append-only, capped at ~1 MB (then restarted), so a looping error cannot fill the disk.
async fn ui_log_post(State(st): S, Json(entry): Json<UiLog>) -> Result<StatusCode> {
    with_ws(&st, move |ws| {
        let path = ws.cache_dir().join("ui.log");
        let big = std::fs::metadata(&path).map(|m| m.len() > 1 << 20).unwrap_or(false);
        let msg: String = entry.message.chars().take(4000).collect();
        let line = format!("{} [{}] {}\n", chrono::Local::now().format("%F %T"), entry.level, msg.replace('\n', "\n  "));
        if big { vault_write::cache::write(&path, line.as_bytes()) } else { vault_write::cache::append(&path, line.as_bytes()) }
    })
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn ui_state_get(State(st): S) -> Json<UiState> {
    Json(st.ui.read().map(|g| g.clone()).unwrap_or_default())
}

async fn ui_state_put(State(st): S, Json(state): Json<UiState>) -> StatusCode {
    if let Ok(mut g) = st.ui.write() {
        *g = state;
    }
    StatusCode::NO_CONTENT
}

async fn config_get(State(st): S) -> Result<Json<ConfigDoc>> {
    Ok(Json(
        with_ws(&st, |ws| {
            Ok(ConfigDoc {
                config: ws.config()?,
                schema: crate::config::Config::schema(),
                defaults: crate::config::Config::default(),
                path: crate::config::CONFIG_FILE.into(),
            })
        })
        .await?,
    ))
}

async fn config_suggestions_get(State(st): S) -> Result<Json<Suggestions>> {
    Ok(Json(with_ws(&st, |_| Ok(crate::detect::suggestions_cached())).await?))
}

/// The configured VS Code theme as plain JSON (404 when none is set).
async fn vscode_theme_get(State(st): S) -> Result<Json<serde_json::Value>> {
    Ok(Json(with_ws(&st, |ws| crate::vscode_theme::load(ws.root(), &ws.config()?.ui.vscode_theme)).await?))
}

async fn attach_post(State(st): S, Query(q): Query<AttachQuery>, body: Bytes) -> Result<Json<Attached>> {
    let a = with_ws(&st, move |ws| {
        ws.resolve(&q.note)?; // the note must be a workspace path
        files::attach(&ws, &q.note, &q.name, &body)
    })
    .await?;
    st.bus.publish(Event::Fs { paths: vec![a.path.clone()] });
    Ok(Json(a))
}

/// The companion note of a file or a folder entry, made when missing (companion.rs): what the readers keep about a PDF
/// goes there; catalog-papers asks it for a new reference (the phone app asks here for a server's vault).
async fn companion_post(State(st): S, Json(req): Json<crate::api::CompanionRequest>) -> Result<Json<crate::api::CompanionNote>> {
    let now = chrono::Local::now().naive_local();
    let r = with_ws(&st, move |ws| crate::companion::ensure(ws.root(), &ws.config()?, &req, now)).await?;
    if r.created || r.migrated_from.is_some() {
        st.bus.publish(Event::Fs { paths: [Some(r.path.clone()), r.migrated_from.clone()].into_iter().flatten().collect() });
    }
    Ok(Json(r))
}

#[derive(serde::Deserialize)]
struct PdfQuery {
    pdf: String,
}

/// The marks of a PDF, from its note's `pdf-marks` block (crate::pdf_marks).
async fn pdf_marks_get(State(st): S, Query(q): Query<PdfQuery>) -> Result<Json<crate::pdf_marks::Marks>> {
    Ok(Json(with_ws(&st, move |ws| crate::pdf_marks::marks_of(ws.root(), &ws.config()?, &q.pdf)).await?))
}

#[derive(serde::Deserialize)]
struct NoteQuery {
    note: String,
}

/// The PDF a note holds the marks of (companion::pdf_of_note): `{pdf}`, null when it is no PDF's note.
async fn pdf_of_note_get(State(st): S, Query(q): Query<NoteQuery>) -> Result<Json<serde_json::Value>> {
    let pdf = with_ws(&st, move |ws| Ok(crate::companion::pdf_of_note(ws.root(), &q.note))).await?;
    Ok(Json(serde_json::json!({ "pdf": pdf })))
}

async fn pdf_marks_post(State(st): S, Query(q): Query<PdfQuery>, Json(ops): Json<Vec<crate::pdf_marks::Op>>) -> Result<Json<crate::pdf_marks::Marks>> {
    let now = chrono::Local::now().naive_local();
    let (marks, _) = with_ws(&st, move |ws| crate::pdf_marks::change(ws.root(), &ws.config()?, &q.pdf, ops, now)).await?;
    if let Some(n) = &marks.note {
        st.bus.publish(Event::Fs { paths: vec![n.clone()] });
    }
    Ok(Json(marks))
}

#[derive(serde::Deserialize)]
struct TypstFence {
    /// the note it is in: pictures are named from its folder
    #[serde(default)]
    path: String,
    source: String,
}

/// A ```typst fence drawn by the core's Typst (typst_doc.rs): its pages as SVG, or Typst's errors.
async fn typst_svg_post(State(st): S, Json(f): Json<TypstFence>) -> Result<Json<crate::typst_doc::TypstDrawn>> {
    Ok(Json(with_ws(&st, move |ws| Ok(crate::typst_doc::draw(ws.root(), &f.path, &f.source))).await?))
}

#[derive(serde::Deserialize)]
struct PdfExportQuery {
    pdf: String,
    #[serde(default)]
    mode: crate::pdf_export::Mode,
}

/// "Export with marks": a copy beside the PDF, its marks as real annotations or (`mode=flat`) drawn into the pages
/// (crate::pdf_export).
async fn pdf_export_post(State(st): S, Query(q): Query<PdfExportQuery>) -> Result<Json<crate::pdf_export::Exported>> {
    let r = with_ws(&st, move |ws| crate::pdf_export::export(&ws, &q.pdf, q.mode)).await?;
    st.bus.publish(Event::Fs { paths: vec![r.path.clone()] });
    Ok(Json(r))
}

async fn link_targets_get(State(st): S, Query(q): Query<LinkTargetsQuery>) -> Result<Json<Vec<LinkTarget>>> {
    Ok(Json(with_ws(&st, move |ws| Ok(crate::link_targets::targets(ws.root(), &ws.config()?, &q.q, q.from.as_deref()))).await?))
}

async fn backlinks_get(State(st): S, Query(q): Query<PathQuery>) -> Result<Json<Backlinks>> {
    let path = required_path(q)?;
    Ok(Json(with_ws(&st, move |ws| Ok(crate::links::backlinks(ws.root(), &ws.config()?, &path))).await?))
}

async fn property_put(State(st): S, Json(e): Json<PropertyEdit>) -> Result<StatusCode> {
    with_ws(&st, move |ws| {
        if !e.path.ends_with(".md") || e.key.trim().is_empty() || e.key.contains([':', '\n']) {
            return Err(Error::BadRequest("a property edit needs a note and a plain key".into()));
        }
        let path = ws.resolve(&e.path)?;
        let text = std::fs::read_to_string(&path)?;
        let value = match &e.value {
            Some(v) => serde_yaml::to_value(v).map_err(|x| Error::BadRequest(x.to_string()))?,
            None => crate::frontmatter::parse_cell(&e.text, e.list),
        };
        let next = crate::frontmatter::set_property(&text, e.key.trim(), &value);
        vault_write::write(&path, next.as_bytes())
    })
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// A properties-panel edit, applied to the text the editor holds (pure: nothing is written).
async fn frontmatter_edit_post(Json(r): Json<FrontmatterEditRequest>) -> Result<Json<FrontmatterText>> {
    Ok(Json(FrontmatterText { text: crate::frontmatter::apply(&r.text, &r.edit)? }))
}

async fn properties_spec_get(State(st): S) -> Result<Json<PropertySpecs>> {
    Ok(Json(with_ws(&st, |ws| Ok(crate::property_spec::load(ws.root(), &ws.config()?.editor.properties_spec))).await?))
}

/// The properties the vault's notes use, with their commonest values (property_spec.rs `known`): the panel's completion.
async fn properties_known_get(State(st): S) -> Result<Json<Vec<crate::property_spec::KnownProperty>>> {
    Ok(Json(with_ws(&st, |ws| Ok(crate::property_spec::known(ws.root(), &ws.config()?))).await?))
}

async fn link_mention_post(State(st): S, Json(m): Json<LinkMention>) -> Result<StatusCode> {
    let src = m.source.clone();
    with_ws(&st, move |ws| {
        let path = ws.resolve(&m.source)?;
        let text = std::fs::read_to_string(&path)?;
        let next =
            crate::links::link_mention(&text, m.line, &m.target).ok_or_else(|| Error::Conflict { current: None })?; // the line changed since it was listed
        vault_write::write(&path, next.as_bytes())
    })
    .await?;
    st.bus.publish(Event::Fs { paths: vec![src] });
    Ok(StatusCode::NO_CONTENT)
}

async fn fs_mkdir(State(st): S, Query(q): Query<PathQuery>) -> Result<StatusCode> {
    let path = required_path(q)?;
    let p2 = path.clone();
    with_ws(&st, move |ws| files::mkdir(&ws, &p2)).await?;
    st.bus.publish(Event::Fs { paths: vec![path] });
    Ok(StatusCode::NO_CONTENT)
}

async fn fs_upload(State(st): S, Query(q): Query<UploadQuery>, body: Bytes) -> Result<StatusCode> {
    let path = q.path.clone();
    with_ws(&st, move |ws| files::put_bytes(&ws, &q.path, &body, q.replace)).await?;
    st.bus.publish(Event::Fs { paths: vec![path] });
    Ok(StatusCode::NO_CONTENT)
}

/// A move, and every link to what moved rewritten for its new place (relink.rs; the user's choice, 2026-10-21:
/// "Always, then say what changed").
async fn fs_move(State(st): S, Json(m): Json<MoveRequest>) -> Result<Json<Moved>> {
    let mut paths = vec![m.from.clone(), m.to.clone()];
    let relinked = with_ws(&st, move |ws| {
        let plan = crate::relink::plan(ws.root(), &ws.config()?, &m.from, &m.to);
        files::move_path(&ws, &m.from, &m.to)?;
        crate::relink::apply(&ws, &plan)
    })
    .await?;
    paths.extend(relinked.notes.iter().cloned());
    st.bus.publish(Event::Fs { paths });
    Ok(Json(Moved { links: relinked.links as u32, notes: relinked.notes }))
}

/// A tag renamed across the vault.
async fn tags_rename(State(st): S, Json(r): Json<TagRename>) -> Result<Json<TagRenamed>> {
    let (tags, notes) = with_ws(&st, move |ws| crate::tags::rename(&ws, &r.from, &r.to)).await?;
    st.bus.publish(Event::Fs { paths: notes.clone() });
    Ok(Json(TagRenamed { tags: tags as u32, notes }))
}

async fn fs_trash(State(st): S, Query(q): Query<PathQuery>) -> Result<Json<Trashed>> {
    let path = required_path(q)?;
    let p2 = path.clone();
    let to = with_ws(&st, move |ws| files::trash(&ws, &p2)).await?;
    st.bus.publish(Event::Fs { paths: vec![path.clone()] });
    Ok(Json(Trashed { path, to }))
}

/// Shows a vault file in the desktop's own file manager, selected (beside the internal explorer): only for the desktop's core (no sign-in) asked from this machine — a server
/// would open a window nobody sees, and its nginx makes every visitor look local, hence both checks.
async fn fs_reveal_outside(State(st): S, axum::extract::ConnectInfo(peer): axum::extract::ConnectInfo<std::net::SocketAddr>, Query(q): Query<PathQuery>) -> Response {
    if !may_reveal_outside(st.auth.is_some(), peer.ip()) {
        return forbidden("the system's file manager opens only on the desktop's own core");
    }
    let path = match required_path(q) { Ok(p) => p, Err(e) => return e.into_response() };
    let abs = match with_ws(&st, move |ws| ws.resolve(&path)).await { Ok(a) => a, Err(e) => return e.into_response() };
    // the file manager may be waited for (dbus-send, open -R): off the async threads
    match tokio::task::spawn_blocking(move || crate::platform::open::reveal(&abs)).await {
        Ok(Err(why)) => Error::CommandFailed(why).into_response(),
        _ => StatusCode::NO_CONTENT.into_response(),
    }
}

/// The desktop's core (no sign-in), asked from this machine: never a server (its nginx makes visitors look local).
fn may_reveal_outside(signed_in_server: bool, peer: std::net::IpAddr) -> bool {
    !signed_in_server && peer.is_loopback()
}


async fn task_tick(State(st): S, Json(t): Json<TaskRef>) -> Result<StatusCode> {
    let path = t.path.clone();
    with_ws(&st, move |ws| {
        let p = ws.resolve(&t.path)?;
        let text = std::fs::read_to_string(&p)?;
        let next = crate::today::tick_task(&text, t.line).ok_or(Error::Conflict { current: None })?;
        vault_write::write(&p, next.as_bytes())
    })
    .await?;
    st.bus.publish(Event::Fs { paths: vec![path] });
    Ok(StatusCode::NO_CONTENT)
}

async fn task_line(Json(t): Json<TaskTick>) -> Result<Json<TaskTicked>> {
    let lines = if t.done {
        crate::today::tick_line(&t.text, chrono::Local::now().date_naive())
    } else {
        crate::today::untick_line(&t.text).map(|l| vec![l])
    };
    let lines = lines.ok_or_else(|| Error::BadRequest(format!("not a {} task line: {}", if t.done { "open" } else { "done" }, t.text)))?;
    Ok(Json(TaskTicked { lines }))
}

async fn graph_get(State(st): S) -> Result<Json<Graph>> {
    Ok(Json(with_ws(&st, |ws| Ok(crate::links::graph(ws.root(), &ws.config()?))).await?))
}

async fn tags_get(State(st): S) -> Result<Json<Vec<crate::api::TagCount>>> {
    Ok(Json(with_ws(&st, |ws| Ok(crate::tags::all(ws.root(), &ws.config()?))).await?))
}

async fn home_get(State(st): S) -> Result<Json<HomeDoc>> {
    Ok(Json(with_ws(&st, |ws| {
        let path = crate::home::ensure(&ws)?;
        let title = path.as_deref().filter(|p| p.ends_with(".page"))
            .and_then(|p| files::read_text(&ws, p).ok())
            .and_then(|f| crate::page::parse(&f.text).ok()?.title);
        Ok(HomeDoc { path, title })
    }).await?))
}

#[derive(serde::Deserialize)]
struct RecentQuery {
    limit: Option<usize>,
}

/// The files to come back to (the palette's recent files, the phone's Home): opened lately, then changed lately (`usage::recent`).
async fn recent_get(State(st): S, Query(q): Query<RecentQuery>) -> Result<Json<Vec<String>>> {
    let limit = q.limit.unwrap_or(30).min(200);
    Ok(Json(with_ws(&st, move |ws| crate::usage::recent(&ws, limit)).await?))
}

/// The usage journal (`usage.rs`): the UI reports file opens, acted-on searches and commands.
async fn usage_post(State(st): S, Json(e): Json<crate::usage::UsageEvent>) -> Result<StatusCode> {
    with_ws(&st, move |ws| crate::usage::record(&ws, e)).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn tools_suggestions_get(State(st): S) -> Result<Json<Vec<ToolDraft>>> {
    Ok(Json(with_ws(&st, |ws| crate::suggest::suggestions(&ws)).await?))
}

async fn tools_keep_post(State(st): S, Json(q): Json<ToolId>) -> Result<Json<Vec<String>>> {
    let paths = with_ws(&st, move |ws| crate::suggest::keep(&ws, &q.id)).await?;
    st.bus.publish(Event::Fs { paths: paths.clone() });
    Ok(Json(paths))
}

async fn tools_dismiss_post(State(st): S, Json(q): Json<ToolId>) -> Result<StatusCode> {
    with_ws(&st, move |ws| crate::suggest::dismiss(&ws, &q.id)).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Vaults (`vaults.rs`): the list, opening one in its own window, forgetting one.
async fn vaults_get(State(st): S) -> Result<Json<crate::vaults::VaultList>> {
    if let Some(served) = &st.served {
        // a server: its own vaults, each at its address (the picker goes there)
        let url = |name: &str| if served.len() == 1 { "/".to_string() } else { format!("/v/{name}/") };
        let vaults = served.iter().map(|v| crate::vaults::Vault { name: v.name.clone(), path: v.root.to_string_lossy().into_owned(), last_opened: 0, missing: false, url: Some(url(&v.name)), mirror: None, warm: true }).collect();
        return Ok(Json(crate::vaults::VaultList { current: st.ws.root().to_string_lossy().into_owned(), vaults, manage: false }));
    }
    let current = st.ws.root().to_string_lossy().into_owned();
    let one_core = desktop::of(&st);
    Ok(Json(
        blocking(move || {
            let mut vaults = crate::vaults::list(&crate::vaults::list_file());
            // the desktop's one core: a folder is a page of this window (`/v/<name>/`), not a window of its own
            if let Some(d) = &one_core {
                for v in vaults.iter_mut().filter(|v| v.url.is_none() && !v.missing) {
                    v.url = Some(d.url_of(std::path::Path::new(&v.path)));
                    v.warm = d.warm(std::path::Path::new(&v.path));
                }
            }
            Ok(crate::vaults::VaultList { current, vaults, manage: true })
        })
        .await?,
    ))
}

/// `{ url }`: where this window goes for that vault (the desktop's one core); `{}`: it opened in a window of its own.
async fn vaults_open_post(State(st): S, Json(q): Json<crate::vaults::VaultRequest>) -> Result<Json<serde_json::Value>> {
    if st.served.is_some() {
        return Err(Error::BadRequest("this server serves its own vaults only: choose one from the list (a new one is a folder in its vaults)".into()));
    }
    let one_core = desktop::of(&st);
    let answer = blocking(move || {
        // a server's address: remembered beside the folders; the window itself goes there, through the bridge
        // (remote_bridge.rs)
        if let Some(url) = crate::vaults::server_address(&q.path) {
            crate::vaults::remember_server(&crate::vaults::list_file(), &url, chrono::Utc::now().timestamp_millis())?;
            return Ok(serde_json::json!({}));
        }
        let fresh = q.create && !std::path::Path::new(&crate::pty::expand_home(q.path.trim())).exists();
        let root = crate::vaults::resolve(&q.path, q.create)?;
        if fresh {
            crate::vaults::start_plain(&root)?;
        }
        crate::vaults::remember_now(&root)?;
        Ok(match &one_core {
            Some(d) => serde_json::json!({ "url": d.url_of(&root) }),
            None => {
                crate::vaults::open_window(&root)?;
                serde_json::json!({})
            }
        })
    })
    .await?;
    Ok(Json(answer))
}

async fn vaults_mirror_post(State(st): S, Json(q): Json<crate::vaults::MirrorRequest>) -> Result<StatusCode> {
    if st.served.is_some() {
        return Err(Error::BadRequest("a server's vaults are its folders: a mirror is set on the desktop".into()));
    }
    blocking(move || {
        crate::vaults::set_mirror(&crate::vaults::list_file(), &q.path, q.mirror.as_deref())?;
        crate::mirror_guard::install_for_mirror(&Workspace::open(std::path::Path::new(&q.path))?);
        Ok(())
    })
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/lease/ask` (DESIGN-mirror-v2.md §2): may a device mirroring this server vault write `path` now?
async fn lease_ask(State(st): S, Json(q): Json<crate::mirror_guard::AskBody>) -> Result<Json<crate::mirror_guard::AnswerBody>> {
    let (root, path) = leased_path(&st, &q.path, &q.holder)?;
    // off the async runtime: hashing the server's copy (a PDF, say) reads the whole file
    let leases = st.leases.clone();
    let answer = blocking(move || {
        let disk = move || std::fs::read(&root).ok().map(|b| vault_write::ContentHash::of(&b));
        Ok(leases.ask(&path, &q.holder, q.have, disk, crate::mirror_guard::HOLD, std::time::Instant::now()))
    })
    .await?;
    Ok(Json(answer.into()))
}

/// `POST /api/lease/done`: the device wrote `path` (now `version`) and lets it go.
async fn lease_done(State(st): S, Json(q): Json<crate::mirror_guard::DoneBody>) -> Result<StatusCode> {
    let (_, path) = leased_path(&st, &q.path, &q.holder)?;
    let leases = st.leases.clone();
    blocking(move || Ok(leases.done(&path, &q.holder, q.version))).await?; // it keeps the table on disk
    Ok(StatusCode::NO_CONTENT)
}

/// A lease is asked of a server only, for a path inside the vault, by a device other than the server's own core; the
/// first ask makes this core's own writes take leases too.
fn leased_path(st: &AppState, path: &str, holder: &str) -> Result<(PathBuf, String)> {
    if st.served.is_none() {
        return Err(Error::BadRequest("leases are kept by a server's core".into()));
    }
    if holder.is_empty() || holder == crate::mirror_guard::SERVER {
        return Err(Error::BadRequest(format!("{holder:?} is not a device's name")));
    }
    let abs = st.ws.resolve(path)?;
    st.leasing.call_once(|| crate::mirror_guard::install_on_server(&st.ws, st.leases.clone()));
    // the table's key is the path as the server's own writes name it (`./a.md`, `a//b.md` would be a second, unheld entry)
    let key = st.ws.rel(&abs);
    Ok((abs, key))
}

/// A window of this vault took the focus: it is the one opened last, so the capture box starts on it.
async fn vaults_active_post(State(st): S) -> Result<StatusCode> {
    if st.served.is_none() {
        let root = st.ws.root().to_path_buf();
        blocking(move || crate::vaults::remember_now(&root)).await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn vaults_forget_post(State(st): S, Json(q): Json<crate::vaults::VaultRequest>) -> Result<StatusCode> {
    if st.served.is_some() {
        return Err(Error::BadRequest("a server's vaults are its folders: nothing to forget here".into()));
    }
    blocking(move || crate::vaults::forget(&crate::vaults::list_file(), &q.path)).await?;
    Ok(StatusCode::NO_CONTENT)
}


async fn css_snippets_get(State(st): S) -> Result<Json<Vec<CssSnippet>>> {
    Ok(Json(with_ws(&st, |ws| Ok(crate::style::css_snippets(ws.root()))).await?))
}

async fn view_post(State(st): S, Json(q): Json<ViewBlock>) -> Result<Json<ViewResult>> {
    // A plugin's rows (`from: plugin:dav/events`) need its tool, called here; every other source reads files.
    if let Some(r) = crate::views::from_plugin(&st.ws, &st.helpers, &q.src).await {
        return Ok(Json(r?));
    }
    Ok(Json(with_ws(&st, move |ws| crate::views::evaluate(&ws, &q.path, &q.src)).await?))
}

async fn base_query_post(State(st): S, Json(q): Json<BaseInline>) -> Result<Json<BaseResult>> {
    Ok(Json(with_ws(&st, move |ws| Ok(crate::bases::evaluate(ws.root(), &ws.config()?, &q.src, q.this.as_deref()))).await?))
}

async fn base_row_post(State(st): S, Json(q): Json<BaseNewRow>) -> Result<Json<BaseRowCreated>> {
    let r = with_ws(&st, move |ws| {
        let src = files::read_text(&ws, &q.path)?.text;
        crate::bases::new_row(ws.root(), &ws.config()?, &q.path, &src, q.view.as_deref())
    })
    .await?;
    st.bus.publish(Event::Fs { paths: vec![r.path.clone()] });
    Ok(Json(r))
}

async fn base_view_post(State(st): S, Json(q): Json<BaseViewEdit>) -> Result<StatusCode> {
    let path = q.path.clone();
    with_ws(&st, move |ws| {
        let doc = files::read_text(&ws, &q.path)?;
        let text = crate::bases::edit_view(&doc.text, &q.view, &q.edit)?;
        files::write_text(&ws, &FileWrite { path: q.path, text, base_mtime: Some(doc.mtime), only_new: false, apply_here: false }).map(drop)
    })
    .await?;
    st.bus.publish(Event::Fs { paths: vec![path] });
    Ok(StatusCode::NO_CONTENT)
}

async fn base_get(State(st): S, Query(q): Query<BaseQuery>) -> Result<Json<BaseResult>> {
    Ok(Json(
        with_ws(&st, move |ws| {
            let src = std::fs::read_to_string(ws.resolve(&q.path)?)?;
            Ok(crate::bases::evaluate(ws.root(), &ws.config()?, &src, q.this.as_deref()))
        })
        .await?,
    ))
}

async fn snippets_get(State(st): S) -> Result<Json<Snippets>> {
    Ok(Json(
        with_ws(&st, |ws| {
            let l = ws.config()?.latex;
            crate::snippets::load(ws.root(), &l.snippets_file, &l.variables_file)
        })
        .await?,
    ))
}

/// A pen stroke's points: `x, y, t` triples, `null` triples between two strokes (JSON has no NaN).
#[derive(serde::Deserialize)]
struct PenStroke {
    xyt: Vec<Option<f32>>,
    #[serde(default = "yes")]
    openink: bool,
}
fn yes() -> bool { true }

/// What a stroke was meant as (atlas_pen::recognize, the phone's Notepad's own reading): `{ wire }`, `[0]` for none.
/// The web drawing asks here, so a shape snaps alike on the phone, the desktop and a server's vault.
async fn pen_shape(Json(s): Json<PenStroke>) -> Json<serde_json::Value> {
    let xyt: Vec<f32> = s.xyt.iter().map(|v| v.unwrap_or(f32::NAN)).collect();
    Json(serde_json::json!({ "wire": atlas_pen::recognize(&xyt, s.openink) }))
}

async fn config_put(State(st): S, Json(body): Json<serde_json::Value>) -> Result<StatusCode> {
    // GET's whole answer sent back ({config, schema, …}) would read as a config of defaults (unknown keys are ignored):
    // refused, never written over the vault's settings (the phone app's plugin switch did that, 2026-10-18)
    if body.get("config").is_some() && body.get("schema").is_some() {
        return Err(Error::BadRequest("send the config itself, not the {config, schema} answer of GET /api/config".into()));
    }
    let cfg: crate::config::Config = serde_json::from_value(body).map_err(|e| Error::BadRequest(format!("not a config: {e}")))?;
    with_ws(&st, move |ws| {
        crate::config::Config::save(ws.root(), &cfg).map_err(|e| Error::BadRequest(format!("{e:#}")))
    })
    .await?;
    st.bus.publish(Event::Fs { paths: vec![crate::config::CONFIG_FILE.into()] });
    Ok(StatusCode::NO_CONTENT)
}

async fn git_log_get(State(st): S, Query(q): Query<GitLogQuery>) -> Result<Json<Vec<Commit>>> {
    let (skip, limit) = (q.skip.unwrap_or(0), q.limit.unwrap_or(100).min(1000));
    Ok(Json(with_ws(&st, move |ws| Ok(git::log(ws.root(), None, skip, limit))).await?))
}

async fn git_commit_get(State(st): S, Query(q): Query<HashQuery>) -> Result<Json<CommitDetail>> {
    Ok(Json(with_ws(&st, move |ws| git::commit_detail(ws.root(), &q.hash)).await?))
}

async fn git_status_get(State(st): S) -> Result<Json<GitStatus>> {
    Ok(Json(with_ws(&st, |ws| git::status(ws.root())).await?))
}

async fn git_blame_get(State(st): S, Query(q): Query<PathQuery>) -> Result<Json<crate::api::Blame>> {
    let rel = required_path(q)?;
    Ok(Json(
        with_ws(&st, move |ws| {
            ws.resolve(&rel)?; // rejects absolute and `..` paths
            git::blame(ws.root(), &rel)
        })
        .await?,
    ))
}

async fn git_diff_get(State(st): S, Query(q): Query<GitDiffQuery>) -> Result<Json<Patch>> {
    Ok(Json(
        with_ws(&st, move |ws| {
            ws.resolve(&q.path)?; // rejects absolute and `..` paths
            git::diff(ws.root(), &q.path, q.staged.unwrap_or(false))
        })
        .await?,
    ))
}

async fn git_stage_post(State(st): S, Json(req): Json<GitStageRequest>) -> Result<StatusCode> {
    let paths = req.paths.clone();
    with_ws(&st, move |ws| {
        for p in &req.paths {
            ws.resolve(p)?;
        }
        git::stage(ws.root(), &req.paths, req.stage)
    })
    .await?;
    git::forget_status(st.ws.root());
    st.bus.publish(Event::Fs { paths });
    Ok(StatusCode::NO_CONTENT)
}

async fn git_discard_post(State(st): S, Json(req): Json<GitDiscardRequest>) -> Result<Json<GitDiscarded>> {
    let paths = req.paths.clone();
    let kept = with_ws(&st, move |ws| git::discard(&ws, &req.paths)).await?;
    git::forget_status(st.ws.root());
    st.bus.publish(Event::Fs { paths });
    Ok(Json(GitDiscarded { kept }))
}

async fn git_apply_post(State(st): S, Json(req): Json<GitApplyRequest>) -> Result<StatusCode> {
    with_ws(&st, move |ws| git::apply(ws.root(), &req.patch, req.cached, req.reverse)).await?;
    git::forget_status(st.ws.root());
    st.bus.publish(Event::Fs { paths: vec![] });
    Ok(StatusCode::NO_CONTENT)
}

async fn git_sync(st: Arc<AppState>, way: git::Sync) -> Result<Json<GitSynced>> {
    let message = with_ws(&st, move |ws| git::sync(ws.root(), way)).await?;
    git::forget_status(st.ws.root());
    st.bus.publish(Event::Fs { paths: vec![] });
    Ok(Json(GitSynced { message }))
}

async fn git_commit_post(State(st): S, Json(req): Json<GitCommitRequest>) -> Result<Json<GitCommitted>> {
    let hash = with_ws(&st, move |ws| git::commit(ws.root(), &req.message)).await?;
    git::forget_status(st.ws.root());
    st.bus.publish(Event::Fs { paths: vec![] });
    Ok(Json(GitCommitted { hash }))
}

async fn commands_post(State(st): S, Json(c): Json<NewCommand>) -> Result<Json<CommandInfo>> {
    Ok(Json(with_ws(&st, move |ws| commands::create(ws.root(), &c)).await?))
}

async fn keys_get(State(st): S) -> Result<Json<Keymap>> {
    Ok(Json(with_ws(&st, |ws| crate::keys::load(ws.root())).await?))
}

async fn keys_put(State(st): S, Json(b): Json<KeyBinding>) -> Result<Json<Keymap>> {
    Ok(Json(with_ws(&st, move |ws| crate::keys::set(ws.root(), &b.id, b.keys.as_deref())).await?))
}

async fn commands_get(State(st): S) -> Result<Json<Vec<CommandInfo>>> {
    Ok(Json(with_ws(&st, |ws| Ok(commands::list(ws.root()))).await?))
}

/// Body is optional (`{}` args). Always 200: the `CmdResponse` envelope carries the outcome, so
/// clients have one place to look (failures are logged server-side).
async fn cmd_post(State(st): S, UrlPath(id): UrlPath<String>, body: Bytes) -> Response {
    let result = async {
        let req: CmdRequest = if body.iter().all(u8::is_ascii_whitespace) {
            serde_json::from_str("{}").expect("empty request")
        } else {
            serde_json::from_slice(&body).map_err(|e| Error::BadRequest(format!("body: {e}")))?
        };
        let cmd = Command::resolve(st.ws.root(), &id, req.args)?;
        commands::run(&st.ws, &st.bus, cmd).await
    }
    .await;
    if let Err(e) = &result {
        eprintln!("atlas: cmd {id}: {e}");
    }
    Json(CmdResponse::from_result(&result)).into_response()
}

/// The desktop app's sign-in window hands back the address it ended on (crates/atlas-app, `signin_window`);
/// the page waiting in `atlas.signIn` takes it from the event.
#[derive(serde::Deserialize)]
struct SigninReturn {
    url: String,
}

async fn signin_post(State(st): S, Json(r): Json<SigninReturn>) -> Response {
    match st.bus.emit(Event::Signin { url: r.url }) {
        Ok(n) => Json(serde_json::json!({ "delivered": n })).into_response(),
        Err(e) => e.into_response(),
    }
}

/// The desktop's bridge to a vault on a server (remote_bridge.rs): a desktop core only (locked to this computer), to the
/// server vaults on the vault list only.
async fn remote_any(
    State(st): S,
    UrlPath((host, rest)): UrlPath<(String, String)>,
    axum::extract::RawQuery(query): axum::extract::RawQuery,
    upgrade: std::result::Result<WebSocketUpgrade, axum::extract::ws::rejection::WebSocketUpgradeRejection>,
    method: axum::http::Method,
    headers: axum::http::HeaderMap,
    body: axum::body::Bytes,
) -> Response {
    if st.lock.is_none() || st.served.is_some() {
        return Error::BadRequest("the bridge to a server is the desktop app's".into()).into_response();
    }
    let h = host.clone();
    let Some(base) = blocking(move || Ok(crate::remote_bridge::base(&h))).await.ok().flatten() else {
        return Error::BadRequest(format!("{host} is not a server vault on the vault list")).into_response();
    };
    let store = crate::secrets::Store::for_vault(st.ws.root());
    match upgrade {
        Ok(up) => up.on_upgrade(move |s| crate::remote_bridge::pipe(s, store, base, rest, query)),
        Err(_) => crate::remote_bridge::forward(&store, &base, &rest, query.as_deref(), method, &headers, body).await,
    }
}

#[derive(serde::Deserialize)]
struct FrameQuery {
    url: String,
}

/// Whether `url` lets itself be shown as a tab of Atlas (web_frame.rs).
async fn web_frameable_get(Query(q): Query<FrameQuery>) -> Json<bool> {
    Json(crate::web_frame::check(&q.url).await)
}

#[derive(serde::Deserialize)]
struct LiveQuery {
    path: String,
    #[serde(default)]
    name: String,
}

/// A file's live room (live.rs): the devices with it open see each other's changes and pointers as they happen.
async fn live_ws(State(st): S, Query(q): Query<LiveQuery>, upgrade: WebSocketUpgrade) -> Result<Response> {
    st.ws.resolve(&q.path)?; // a file of this vault, nothing else
    let rooms = st.live.clone();
    let name = if q.name.trim().is_empty() { "another device".to_string() } else { q.name.chars().take(60).collect() };
    // a local vault with a copy on a server: its room is the server's (DESIGN-mirror-v2.md §3), so every pane of every
    // device is in one room with one writer; the server not answering, the room here
    let mirror = st.served.is_none().then(|| crate::mirror_guard::mirror_of(st.ws.root())).flatten();
    let store = crate::secrets::Store::for_vault(st.ws.root());
    Ok(upgrade.on_upgrade(move |socket| async move {
        if let Some(m) = mirror {
            let url = reqwest::Url::parse_with_params(&format!("{m}api/live"), [("path", q.path.as_str()), ("name", name.as_str())]);
            if let Some(up) = match url { Ok(u) => crate::remote_bridge::connect(&store, u.as_str()).await, Err(_) => None } {
                return crate::remote_bridge::splice(socket, up).await;
            }
        }
        crate::live::session(socket, rooms, q.path, name).await
    }))
}

async fn events_ws(State(st): S, upgrade: WebSocketUpgrade) -> Response {
    let rx = st.bus.subscribe();
    upgrade.on_upgrade(move |socket| forward_events(socket, rx))
}

/// The bus to one page; the page says on it whether it is looked at (`{"seen": …}`, notify.rs).
async fn forward_events(mut socket: WebSocket, mut rx: tokio::sync::broadcast::Receiver<Event>) {
    use tokio::sync::broadcast::error::RecvError;
    let page = crate::notify::Presence::global().join();
    loop {
        tokio::select! {
            ev = rx.recv() => match ev {
                Ok(ev) => {
                    let text = serde_json::to_string(&ev).expect("events serialize");
                    if socket.send(Message::Text(text.into())).await.is_err() { break }
                }
                Err(RecvError::Lagged(_)) => continue, // slow client: drop old events, keep going
                Err(RecvError::Closed) => break,
            },
            msg = socket.recv() => match msg {
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                Some(Ok(Message::Text(t))) => {
                    if let Ok(s) = serde_json::from_str::<crate::notify::Seen>(&t) {
                        page.seen(s.seen);
                    }
                }
                Some(Ok(_)) => {}
            },
        }
    }
}

async fn python_envs_get(State(st): S) -> Result<Json<crate::api::PythonEnvs>> {
    Ok(Json(with_ws(&st, |ws| Ok(crate::python_env::list(&ws.config()?, ws.root()))).await?))
}

async fn lsp_get(State(st): S) -> Result<Json<Vec<LspServerInfo>>> {
    Ok(Json(
        with_ws(&st, |ws| {
            let uri = crate::lsp::root_uri(ws.root());
            Ok(crate::lsp::servers(&ws.config()?, ws.root())
                .into_iter()
                .map(|s| LspServerInfo { root_uri: uri.clone(), ..s })
                .collect())
        })
        .await?,
    ))
}

async fn lsp_ws(State(st): S, UrlPath(lang): UrlPath<crate::lsp::LspLang>, upgrade: WebSocketUpgrade) -> Response {
    let ws = st.ws.clone();
    upgrade.on_upgrade(move |socket| crate::lsp::session(socket, ws, lang))
}

#[derive(serde::Deserialize)]
struct TaskSuggestQuery {
    /// The task's text up to the caret.
    before: String,
    #[serde(default)]
    explicit: bool,
    #[serde(default)]
    at: bool,
    #[serde(default)]
    browse: bool,
    #[serde(default)]
    keep_enter: bool,
}

/// What to offer while a task is typed (task_suggest.rs); null when nothing.
async fn tasks_suggest(Query(q): Query<TaskSuggestQuery>) -> Json<Option<crate::task_suggest::TaskSuggest>> {
    let ask = crate::task_suggest::Ask { explicit: q.explicit, at: q.at, browse: q.browse, keep_enter: q.keep_enter };
    Json(crate::task_suggest::suggest(&q.before, chrono::Local::now().date_naive(), ask))
}

async fn pty_ws(State(st): S, Query(q): Query<PtyQuery>, upgrade: WebSocketUpgrade) -> Response {
    let ws = st.ws.clone();
    let ptys = st.ptys.clone();
    upgrade.on_upgrade(move |socket| pty::session(socket, ws, q, ptys))
}

/// SPA: real asset if it exists, else index.html; unknown `/api/*` stays a JSON 404.
/// The app's page for a vault at `prefix` ("/v/work"): its API is there, which the page learns from `__ATLAS_API__`
/// (the desktop window sets the same to its core's address).
fn with_base(html: Vec<u8>, prefix: &str) -> Vec<u8> {
    if prefix.is_empty() {
        return html;
    }
    let tag = format!("<script>window.__ATLAS_API__={}</script>", serde_json::to_string(prefix).unwrap_or_default());
    let text = String::from_utf8_lossy(&html);
    match text.find("<head>") {
        Some(i) => format!("{}{tag}{}", &text[..i + 6], &text[i + 6..]).into_bytes(),
        None => format!("{tag}{text}").into_bytes(),
    }
}

async fn static_files(uri: Uri, prefix: String) -> Response {
    let path = uri.path().trim_start_matches('/');
    if let Some(back) = crate::signin_return::page(&uri) {
        return back.into_response();
    }
    if path == "api" || path.starts_with("api/") {
        return Error::NotFound(uri.path().into()).into_response();
    }
    // a vault on a server, in the desktop's own page: its API through the bridge (remote_bridge.rs)
    if let Some(at) = path.strip_prefix("r/").filter(|p| !p.rsplit('/').next().unwrap_or(p).contains('.')) {
        let base = format!("/remote/{}", at.trim_end_matches('/'));
        return match ui_file("index.html", &base) {
            Some((data, mime)) => ([(header::CONTENT_TYPE, mime), (header::CACHE_CONTROL, "no-cache".to_string())], data).into_response(),
            None => StatusCode::NOT_FOUND.into_response(),
        };
    }
    match ui_file(path, &prefix) {
        Some((data, mime)) => {
            // `assets/` names carry their content's hash (Vite): a new build is a new name
            let cache = if mime.starts_with("text/html") { "no-cache" } else if path.starts_with("assets/") { "public, max-age=31536000, immutable" } else { "public, max-age=3600" };
            ([(header::CONTENT_TYPE, mime), (header::CACHE_CONTROL, cache.into())], data).into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

/// The interface's file at `path` (no leading `/`) and its type, as this program serves it for a vault at `prefix`: the
/// installed UI first (ui_files.rs: a new interface without a new program), then the built-in one; a page address is the
/// app (`index.html`, told its prefix). Public for the phone app, which shows its own interface for a server's vault
///.
pub fn ui_file(path: &str, prefix: &str) -> Option<(Vec<u8>, String)> {
    let name = if path.is_empty() { "index.html" } else { path };
    // a page address falls back to the app (index.html); a missing file (a.js) is a 404, not HTML
    let page = !name.rsplit('/').next().unwrap_or(name).contains('.');
    let found = crate::ui_files::dir()
        .and_then(|dir| crate::ui_files::get(&dir, name).or_else(|| page.then(|| crate::ui_files::get(&dir, "index.html")).flatten().map(|(d, _)| (d, "text/html".to_string()))))
        .or_else(|| {
            let f = Dist::get(name).or_else(|| page.then(|| Dist::get("index.html")).flatten())?;
            Some((f.data.to_vec(), f.metadata.mimetype().to_string()))
        })?;
    let (data, mime) = found;
    Some(if mime.starts_with("text/html") { (with_base(data, prefix), mime) } else { (data, mime) })
}

/// Bumped whenever the interface starts relying on a server call or answer that an older server lacks: the phone app
/// (its own interface on a server's vault) compares it with the server's and warns when they differ.
/// 2: plugin modules load from `/plugin-files/` (plugin_files.rs).
pub const API_LEVEL: u32 = 2;

/// `{version, api, ui}`: this program's version, its API_LEVEL and an id of its interface build (the hash of its index).
pub fn version_info() -> serde_json::Value {
    let ui = ui_file("index.html", "").map(|(d, _)| crate::auth::sha256(&String::from_utf8_lossy(&d))[..12].to_string()).unwrap_or_default();
    serde_json::json!({ "version": env!("CARGO_PKG_VERSION"), "api": API_LEVEL, "ui": ui, "shell": crate::pty::shell_kind() })
}

fn host_ok(headers: &HeaderMap) -> bool {
    // A DNS-rebinding page would arrive with its own hostname; only loopback names are ours.
    let Some(host) = headers.get(header::HOST).and_then(|h| h.to_str().ok()) else { return true };
    let name = host.rsplit_once(':').map_or(host, |(n, _)| n);
    matches!(name, "127.0.0.1" | "localhost" | "[::1]" | "tauri.localhost")
}

fn origin_ok(headers: &HeaderMap, port: u16) -> bool {
    let Some(origin) = headers.get(header::ORIGIN) else { return true };
    let Ok(origin) = origin.to_str() else { return false };
    let allowed = [
        "tauri://localhost".to_string(),
        "http://tauri.localhost".to_string(),
        format!("http://127.0.0.1:{port}"),
        format!("http://localhost:{port}"),
        format!("http://localhost:{VITE_DEV_PORT}"),
        format!("http://127.0.0.1:{VITE_DEV_PORT}"),
    ];
    allowed.iter().any(|a| a == origin)
}

fn forbidden(why: &str) -> Response {
    (StatusCode::FORBIDDEN, Json(ApiError { error: why.into(), mtime: None })).into_response()
}

/// `/api` HTTP needs `x-atlas: 1` (a custom header forces a CORS preflight, which we never
/// answer); WS upgrades cannot set headers, so they are checked by Origin instead.
async fn guard(State(st): S, mut req: Request, next: Next) -> Response {
    // a plugin's helper, over its pipe (helper_api.rs): no network request carries this extension
    if let Some(crate::helper_api::Caller(id)) = req.extensions().get::<crate::helper_api::Caller>().cloned() {
        if !crate::helper_api::may(&id, req.uri().path()) {
            return forbidden(&format!("plugin {id} may read only its own secrets"));
        }
        if st.auth.is_some() {
            req.extensions_mut().insert(crate::auth::Who::Device { name: format!("plugin {id}"), scope: crate::auth::Scope::Full });
        }
        return next.run(req).await;
    }
    if let Some(auth) = st.auth.clone() {
        return guard_server(&auth, req, next).await;
    }
    if let Some(lock) = &st.lock {
        if let Some(refused) = locked(lock, &req) {
            return refused;
        }
    }
    let h = req.headers();
    if !host_ok(h) {
        return forbidden("unexpected Host header");
    }
    if req.uri().path().starts_with("/api/") {
        let is_ws = h.get(header::UPGRADE).is_some_and(|v| v.as_bytes().eq_ignore_ascii_case(b"websocket"));
        if is_ws {
            if !origin_ok(h, st.port) {
                return forbidden("websocket origin not allowed");
            }
        } else if h.get("x-atlas") != Some(&HeaderValue::from_static("1")) {
            return forbidden("missing header x-atlas: 1");
        }
    }
    next.run(req).await
}

/// A locked local core: a page opened by its one-time link sets the key's cookie and goes on without the code; any
/// other request without the key is refused (None = let it through).
fn locked(lock: &crate::local_lock::LocalLock, req: &Request) -> Option<Response> {
    let path = vault_path(req.uri().path());
    let api = path.starts_with("/api/");
    if !api {
        let code = req.uri().query().into_iter().flat_map(|q| q.split('&')).find_map(|kv| kv.strip_prefix("k="));
        if let Some(code) = code {
            if lock.redeem(code) {
                let full = req.extensions().get::<axum::extract::OriginalUri>().map_or_else(|| req.uri().clone(), |o| o.0.clone());
                let rest: Vec<&str> = full.query().into_iter().flat_map(|q| q.split('&')).filter(|kv| !kv.starts_with("k=")).collect();
                let to = if rest.is_empty() { full.path().to_string() } else { format!("{}?{}", full.path(), rest.join("&")) };
                return Some(([(header::SET_COOKIE, lock.cookie())], axum::response::Redirect::to(&to)).into_response());
            }
        }
    }
    // `atlas mcp` comes in only with its agent's own token (agents.rs), never this machine's key, so a revoke shuts it out
    let mcp = req.headers().get(crate::auth::CLIENT_HEADER).is_some_and(|v| v == "mcp");
    if !mcp && lock.admits(req.headers()) {
        return None;
    }
    if let Some(agent) = crate::agents::Agents::here().who(req.headers()) {
        return path.starts_with("/api/agents").then(|| forbidden(&format!("the agent “{agent}” may not allow or revoke agents")));
    }
    let why = if mcp {
        "this AI agent is not allowed in: Settings → Agents → Allow an agent, then give it the token (ATLAS_AGENT_TOKEN in its MCP config)"
    } else {
        "this Atlas answers only its own apps: open it from the Atlas app (or its \"Open in browser\" link)"
    };
    Some(if api {
        (StatusCode::UNAUTHORIZED, Json(ApiError { error: why.into(), mtime: None })).into_response()
    } else {
        (StatusCode::UNAUTHORIZED, axum::response::Html(crate::login_page::locked_page())).into_response()
    })
}

/// A locked core's one-time link for a new window — the browser, or a window of a program holding the key.
async fn local_link(State(st): S) -> Result<Json<serde_json::Value>> {
    let lock = st.lock.as_ref().ok_or_else(|| Error::BadRequest("this core is not locked: open it at its address".into()))?;
    Ok(Json(serde_json::json!({ "url": format!("http://127.0.0.1:{}{}/?k={}", st.port, st.prefix, lock.code()) })))
}

/// Settings → Agents (agents.rs): this machine's agents, for a local core; a server's agents use device tokens.
fn agents_of(st: &AppState) -> Result<crate::agents::Agents> {
    if st.auth.is_some() {
        return Err(Error::BadRequest("on a server, an agent signs in with a device token (Settings → Server)".into()));
    }
    Ok(crate::agents::Agents::here())
}

async fn agents_get(State(st): S) -> Result<Json<AgentsState>> {
    let a = agents_of(&st)?;
    Ok(Json(AgentsState {
        agents: a.list().iter().map(|t| IssuedToken::of(t, false)).collect(),
        locked: st.lock.is_some(),
        file: crate::agents::agents_file().display().to_string(),
        terminals: a.terminals_on(),
        terminal_agent: crate::agents::TERMINAL_AGENT.into(),
    }))
}

#[derive(serde::Deserialize)]
struct TerminalsSwitch {
    on: bool,
}

async fn agents_terminals_put(State(st): S, Json(t): Json<TerminalsSwitch>) -> Result<StatusCode> {
    agents_of(&st)?.set_terminals(t.on).map_err(|e| Error::BadRequest(e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
struct NewAgent {
    name: String,
}

async fn agents_post(State(st): S, Json(a): Json<NewAgent>) -> Result<Json<serde_json::Value>> {
    let token = agents_of(&st)?.allow(&a.name).map_err(|e| Error::BadRequest(e.to_string()))?;
    Ok(Json(serde_json::json!({ "token": token, "mcp": crate::agents::mcp_server(&token) })))
}

async fn agents_delete(State(st): S, UrlPath(name): UrlPath<String>) -> Result<StatusCode> {
    let gone = agents_of(&st)?.revoke(&name).map_err(|e| Error::BadRequest(e.to_string()))?;
    Ok(if gone { StatusCode::NO_CONTENT } else { StatusCode::NOT_FOUND })
}

/// Server mode: the request must come from someone signed in (a session, a trusted proxy, a device token within its
/// scope); else the sign-in page (a page) or 401 (the API). The Host may be any name here (the server's own), so
/// the DNS-rebinding check gives way to the sign-in; a WebSocket must come from a page of this same server.
async fn guard_server(auth: &crate::auth::Auth, mut req: Request, next: Next) -> Response {
    let peer = req.extensions().get::<axum::extract::ConnectInfo<std::net::SocketAddr>>().map_or(([127, 0, 0, 1], 0).into(), |c| c.0);
    // judged without a vault's `/v/<name>`: the top router's guard and the vault's own see the same path
    let path = vault_path(req.uri().path()).to_string();
    if path == "/login" {
        return next.run(req).await;
    }
    let h = req.headers();
    if h.get(crate::auth::CLIENT_HEADER).is_some_and(|v| v == "mcp") && !auth.settings().mcp {
        return forbidden("AI agents (atlas mcp) are off on this server: Settings → Server");
    }
    let Some(who) = auth.identify(peer, h) else {
        if path.starts_with("/api/") {
            return (StatusCode::UNAUTHORIZED, Json(ApiError { error: "sign in first".into(), mtime: None })).into_response();
        }
        // the address as the browser asked for it (a vault's router sees it without its /v/<name>)
        let full = req.extensions().get::<axum::extract::OriginalUri>().map_or_else(|| req.uri().clone(), |o| o.0.clone());
        let back = full.path_and_query().map_or("/", |p| p.as_str());
        return axum::response::Redirect::to(&format!("/login?next={}", percent(back))).into_response();
    };
    if !who.may(&path) {
        return forbidden(&format!("this device's token does not reach {path}"));
    }
    if path.starts_with("/api/") {
        let is_ws = h.get(header::UPGRADE).is_some_and(|v| v.as_bytes().eq_ignore_ascii_case(b"websocket"));
        if is_ws {
            if !same_origin(h) {
                return forbidden("websocket origin not allowed");
            }
        } else if h.get("x-atlas") != Some(&HeaderValue::from_static("1")) {
            return forbidden("missing header x-atlas: 1");
        }
    }
    req.extensions_mut().insert(who);
    next.run(req).await
}

/// A path inside its vault: `/v/work/api/capture` → `/api/capture`; any other path as it is.
fn vault_path(path: &str) -> &str {
    path.strip_prefix("/v/").and_then(|rest| rest.find('/').map(|i| &rest[i..])).unwrap_or(path)
}

fn compressed(app: Router) -> Router {
    app.layer(tower_http::compression::CompressionLayer::new()).layer(middleware::from_fn(compress_gate))
}

/// Which responses the compression layer inside may gzip: only those leaving the machine (a server's browsers; the
/// desktop and the phone's own core are loopback, where it costs time and saves nothing), and only the UI's own files and
/// the path listings — no response that may carry a secret beside text a page chose (BREACH).
async fn compress_gate(mut req: Request, next: Next) -> Response {
    let remote = req.extensions().get::<axum::extract::ConnectInfo<std::net::SocketAddr>>().is_some_and(|c| !c.0.ip().is_loopback());
    let path = vault_path(req.uri().path());
    if !(remote && (!path.starts_with("/api/") || matches!(path, "/api/files" | "/api/tree"))) {
        req.headers_mut().remove(header::ACCEPT_ENCODING);
    }
    next.run(req).await
}

/// An Origin naming this same server (by its Host), or none (not a browser).
fn same_origin(h: &HeaderMap) -> bool {
    let Some(origin) = h.get(header::ORIGIN).and_then(|o| o.to_str().ok()) else { return h.get(header::ORIGIN).is_none() };
    let host = h.get("x-forwarded-host").or_else(|| h.get(header::HOST)).and_then(|v| v.to_str().ok()).unwrap_or("");
    origin.split_once("://").is_some_and(|(_, o)| !host.is_empty() && o == host)
}

fn percent(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-._~/".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

/// Only a path of this server is a place to go after signing in (never `//elsewhere` or a full address).
fn local_next(next: Option<&str>) -> String {
    next.filter(|n| n.starts_with('/') && !n.starts_with("//") && !n.contains('\\')).unwrap_or("/").to_string()
}

#[derive(serde::Deserialize)]
struct LoginQuery {
    next: Option<String>,
}

#[derive(serde::Deserialize)]
struct LoginForm {
    password: String,
    next: Option<String>,
}

async fn login_get(State(st): S, Query(q): Query<LoginQuery>) -> Response {
    if st.auth.is_none() {
        return Error::NotFound("/login".into()).into_response();
    }
    login_page(&st, &local_next(q.next.as_deref()), None, StatusCode::OK)
}

fn login_page(st: &AppState, next: &str, problem: Option<&str>, status: StatusCode) -> Response {
    // one vault: its name; a server of several: one sign-in for all of them
    let name = match st.served.as_deref() {
        Some(v) if v.len() > 1 => v.iter().map(|v| v.name.as_str()).collect::<Vec<_>>().join(" · "),
        _ => dir_name(st.ws.root()),
    };
    (status, [(header::CACHE_CONTROL, "no-store")], axum::response::Html(crate::login_page::page(&name, next, problem))).into_response()
}

async fn login_post(State(st): S, axum::extract::ConnectInfo(peer): axum::extract::ConnectInfo<std::net::SocketAddr>, h: HeaderMap, axum::Form(f): axum::Form<LoginForm>) -> Response {
    let Some(auth) = st.auth.clone() else { return Error::NotFound("/login".into()).into_response() };
    let next = local_next(f.next.as_deref());
    // a form posted from another site's page is not a sign-in
    if !same_origin(&h) {
        return login_page(&st, &next, Some("That form did not come from this server."), StatusCode::FORBIDDEN);
    }
    use crate::auth::Refused;
    let secure = auth.https(peer, &h);
    match tokio::task::spawn_blocking(move || auth.sign_in(peer, &h, &f.password).map(|t| auth.session_cookie(&t, secure))).await {
        Ok(Ok(cookie)) => ([(header::SET_COOKIE, cookie)], axum::response::Redirect::to(&next)).into_response(),
        Ok(Err(Refused::Wrong)) => login_page(&st, &next, Some("Wrong password."), StatusCode::UNAUTHORIZED),
        Ok(Err(Refused::Wait(d))) => {
            let secs = d.as_secs().max(1);
            let mut r = login_page(&st, &next, Some(&format!("Too many wrong passwords: try again in {secs} s.")), StatusCode::TOO_MANY_REQUESTS);
            r.headers_mut().insert(header::RETRY_AFTER, HeaderValue::from(secs));
            r
        }
        Ok(Err(Refused::NoPassword)) => login_page(&st, &next, Some("This server signs in through its proxy only."), StatusCode::FORBIDDEN),
        Ok(Err(Refused::PlainHttp)) => login_page(&st, &next, Some("Not over plain HTTP: open this server through HTTPS (allow_plain_http in its server.toml allows it on a trusted network)."), StatusCode::FORBIDDEN),
        Err(e) => login_page(&st, &next, Some(&e.to_string()), StatusCode::INTERNAL_SERVER_ERROR),
    }
}

/// Who this is, for the UI: `{ server: false }` on the desktop; in server mode how it is signed in, and whether
/// signing out here means anything (a proxy's sign-in ends at the proxy).
async fn auth_me(State(st): S, req: Request) -> Json<Me> {
    use crate::auth::Who;
    let who = req.extensions().get::<Who>().cloned();
    let on = Me { server: true, ..Me::default() };
    Json(match (st.auth.is_some(), who) {
        (false, _) => Me::default(),
        (true, Some(Who::Session)) => Me { via: Some(Via::Password), sign_out: Some(true), ..on },
        (true, Some(Who::Proxy(user))) => Me { via: Some(Via::Proxy), user: Some(user), sign_out: Some(false), ..on },
        (true, Some(Who::Device { name, scope })) => Me { via: Some(Via::Token), device: Some(name), scope: Some(scope), sign_out: Some(false), ..on },
        (true, None) => on,
    })
}

async fn auth_logout(State(st): S, h: HeaderMap) -> Response {
    if let Some(auth) = &st.auth {
        auth.sign_out(&h);
    }
    ([(header::SET_COOKIE, format!("{}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0", crate::auth::SESSION_COOKIE))], StatusCode::NO_CONTENT).into_response()
}

// ---- Settings → Server (docs/guides/SERVER.md): the running server's sign-in when serving, else the files it will start
// from (setting up `atlas serve --listen` from the desktop)
fn auth_of(st: &AppState) -> Result<Arc<crate::auth::Auth>> {
    match &st.auth {
        Some(a) => Ok(a.clone()),
        None => crate::auth::Auth::load().map(Arc::new).map_err(Error::Other),
    }
}

async fn server_get(State(st): S) -> Result<Json<ServerState>> {
    let a = auth_of(&st)?;
    let s = a.settings();
    Ok(Json(ServerState {
        serving: st.auth.is_some(),
        port: st.port,
        options: ServerOptions {
            auth: s.auth,
            trusted_proxies: s.trusted_proxies.iter().map(ToString::to_string).collect(),
            remote_user_header: s.remote_user_header().into(),
            allow_plain_http: s.allow_plain_http,
            mcp: s.mcp,
        },
        has_password: s.password_hash.is_some(),
        tokens: a.tokens().iter().map(|t| IssuedToken::of(t, true)).collect(),
        sessions: a.session_count(),
        files: ServerFiles { settings: crate::auth::settings_file().display().to_string(), state: crate::auth::state_file().display().to_string() },
        not_ready: a.not_ready(),
    }))
}

async fn server_options_put(State(st): S, Json(o): Json<ServerOptions>) -> Result<StatusCode> {
    let proxies = o.trusted_proxies.iter().map(|p| p.trim()).filter(|p| !p.is_empty()).map(|p| p.parse().map_err(Error::BadRequest)).collect::<Result<Vec<_>>>()?;
    let header = Some(o.remote_user_header.trim().to_string()).filter(|h| !h.is_empty() && h != "Remote-User");
    let a = auth_of(&st)?;
    let new = crate::auth::ServerSettings { auth: o.auth, trusted_proxies: proxies, remote_user_header: header, allow_plain_http: o.allow_plain_http, mcp: o.mcp, password_hash: None };
    tokio::task::spawn_blocking(move || a.set_options(new)).await.map_err(|e| Error::Other(e.into()))?.map_err(Error::Other)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
struct PasswordChange {
    current: Option<String>,
    new: String,
}

async fn server_password_post(State(st): S, Json(p): Json<PasswordChange>) -> Result<StatusCode> {
    let a = auth_of(&st)?;
    tokio::task::spawn_blocking(move || a.set_password(p.current.as_deref(), &p.new))
        .await
        .map_err(|e| Error::Other(e.into()))?
        .map_err(|e| Error::BadRequest(e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
struct NewToken {
    name: String,
    scope: crate::auth::Scope,
}

async fn server_token_post(State(st): S, Json(t): Json<NewToken>) -> Result<Json<serde_json::Value>> {
    let token = auth_of(&st)?.add_token(&t.name, t.scope).map_err(|e| Error::BadRequest(e.to_string()))?;
    Ok(Json(serde_json::json!({ "token": token })))
}

async fn server_token_delete(State(st): S, UrlPath(name): UrlPath<String>) -> Result<StatusCode> {
    Ok(if auth_of(&st)?.revoke_token(&name) { StatusCode::NO_CONTENT } else { StatusCode::NOT_FOUND })
}

/// The apps a device token may be handed to, by `app=`: each by its own address (scheme), so a token never leaves for a
/// web address. The phone opens `/auth/app?app=…&name=…` in the browser, where the sign-in in front (Authelia, Authentik…,
/// security keys included) or this server's own runs first (docs/guides/SERVER.md, "Signing in a phone").
const APPS: [(&str, &str, &str, crate::auth::Scope); 3] = [
    ("capture", "Atlas capture", "org.atlas.capture", crate::auth::Scope::Capture),
    ("atlas", "Atlas", "org.atlas.app", crate::auth::Scope::Full),
    ("boox", "Atlas for Boox", "org.atlas.boox", crate::auth::Scope::Full),
];

#[derive(serde::Deserialize)]
struct AppQuery {
    app: String,
    #[serde(default)]
    name: String,
}

/// A refusal of the sign-in step: its status and why.
type Refused = (StatusCode, String);

fn refused(r: Refused) -> Response {
    (r.0, Json(ApiError { error: r.1, mtime: None })).into_response()
}

fn app_of(q: &AppQuery) -> std::result::Result<(&'static str, &'static str, crate::auth::Scope), Refused> {
    APPS.iter().find(|a| a.0 == q.app).map(|a| (a.1, a.2, a.3)).ok_or_else(|| (StatusCode::BAD_REQUEST, format!("no app called {}", q.app)))
}

/// Who may hand a phone a token: someone signed in by a person's means (here or by the proxy), never a device token.
fn person(who: &Option<axum::Extension<crate::auth::Who>>) -> std::result::Result<String, Refused> {
    use crate::auth::Who;
    match who.as_ref().map(|w| &w.0) {
        Some(Who::Proxy(user)) => Ok(user.clone()),
        Some(Who::Session) => Ok("you".into()),
        Some(Who::Device { .. }) | None => Err((StatusCode::FORBIDDEN, "sign in on this browser first (a device token cannot let a device in)".into())),
    }
}

/// The request's cookies but Atlas's own session: the gate's (Authelia's, Authentik's…), whatever their names.
fn gate_cookies(h: &HeaderMap) -> String {
    h.get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .map(str::trim)
        .filter(|kv| kv.split_once('=').is_some_and(|(k, _)| k != crate::auth::SESSION_COOKIE))
        .collect::<Vec<_>>()
        .join("; ")
}

fn scope_word(s: crate::auth::Scope) -> &'static str {
    if s == crate::auth::Scope::Capture { "capture" } else { "full" }
}

async fn app_signin_get(State(st): S, who: Option<axum::Extension<crate::auth::Who>>, Query(q): Query<AppQuery>) -> Response {
    let run = || -> std::result::Result<Response, Refused> {
        let (label, _, scope) = app_of(&q)?;
        let user = person(&who)?;
        let name = if q.name.trim().is_empty() { "a phone" } else { q.name.trim() };
        let page = crate::login_page::app_page(&dir_name(st.ws.root()), label, &user, name, scope_word(scope));
        Ok(([(header::CACHE_CONTROL, "no-store")], axum::response::Html(page)).into_response())
    };
    run().unwrap_or_else(refused)
}

async fn app_signin_post(State(st): S, who: Option<axum::Extension<crate::auth::Who>>, h: HeaderMap, Query(q): Query<AppQuery>) -> Response {
    if !same_origin(&h) {
        return forbidden("that form did not come from this server");
    }
    let run = || -> std::result::Result<Response, Refused> {
        let (label, scheme, scope) = app_of(&q)?;
        person(&who)?;
        // through a gate in front (Remote-User): its session cookies go to the app too, so the phone passes the gate as this
        // browser does — where the security key was used (WebAuthn works in the browser, not in an app's WebView)
        let via_gate = matches!(who.as_ref().map(|w| &w.0), Some(crate::auth::Who::Proxy(_)));
        let gate = if via_gate { gate_cookies(&h) } else { String::new() };
        let auth = st.auth.as_ref().ok_or((StatusCode::NOT_FOUND, "not a server".to_string()))?;
        // one token per sign-in, named for the phone and the moment: signing in again never collides
        let base = if q.name.trim().is_empty() { label.to_string() } else { format!("{} ({label})", q.name.trim()) };
        let name = format!("{base} · {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"));
        let token = auth.add_token(&name, scope).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
        let mut to = format!("{scheme}://signed-in?token={}&scope={}", percent(&token), scope_word(scope));
        if !gate.is_empty() {
            to.push_str(&format!("&gate={}", percent(&gate)));
        }
        Ok((StatusCode::SEE_OTHER, [(header::LOCATION, to), (header::CACHE_CONTROL, "no-store".to_string())]).into_response())
    };
    run().unwrap_or_else(refused)
}

async fn server_signout_all(State(st): S) -> Result<Json<serde_json::Value>> {
    Ok(Json(serde_json::json!({ "ended": auth_of(&st)?.sign_out_everywhere() })))
}

fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/workspace", get(workspace))
        .route("/api/tree", get(tree))
        .route("/api/files", get(files_get))
        .route("/api/exists", get(exists_get))
        // a drawing's pictures travel inside it: files.rs `text_limit` says what each kind may be
        .route("/api/file", get(file_get).put(file_put).layer(DefaultBodyLimit::max(files::MAX_DRAWING_BYTES as usize + 1024 * 1024)))
        // PDFs can exceed the global JSON limit; 512 MB covers scanned books.
        .route("/api/thumb", get(thumb))
        .route("/api/raw", get(raw).put(raw_put).layer(DefaultBodyLimit::max(512 * 1024 * 1024)))
        .route("/api/today", get(today_get))
        .route("/api/activity", get(activity_get))
        .route("/api/pen/shape", post(pen_shape))
        .route("/api/plugins", get(plugins_get))
        .route("/api/plugins/{id}/data", post(plugin_data_post))
        .route("/api/plugins/{id}/settings", put(plugin_settings_put))
        .route("/api/plugins/install", post(plugin_install_post))
        .route("/api/plugins/available", get(plugins_available_get))
        .route("/api/plugins/{id}/update", post(plugin_update_post))
        .route("/api/plugins/{id}/remove", post(plugin_remove_post))
        .route("/api/plugins/{id}/fetch", post(plugin_fetch_post))
        .route("/api/plugins/{id}/media", post(plugin_media_post))
        .route("/media/{ticket}", get(media_get))
        .route("/plugin-files/{rev}/{*path}", get(plugin_file_get))
        .route("/api/plugins/{id}/contributions", get(plugin_contributions_get))
        .route("/api/plugins/{id}/helper", get(plugin_helper_get).post(plugin_helper_post))
        // `terminals_survive`: this core keeps a terminal running across a page reload (pty.rs);
        // an older one killed them, and the page then asks before reloading
        .route("/api/ui/build", get(|| async { Json(serde_json::json!({ "build": crate::ui_files::build(), "terminals_survive": true })) }))
        .route("/api/plugins/{id}/tools/{name}", post(plugin_tool_post))
        .route("/api/plugins/{id}/helper/stop", post(plugin_helper_stop))
        .route("/api/plugins/{id}/secrets", get(plugin_secrets_get))
        .route("/api/plugins/{id}/secrets/{name}", get(plugin_secret_get).put(plugin_secret_put).delete(plugin_secret_delete))
        .route("/api/plugins/{id}/oauth/start", post(plugin_oauth_start))
        .route("/api/plugins/{id}/oauth/finish", post(plugin_oauth_finish))
        .route("/api/plugins/{id}/oauth/{name}", get(plugin_oauth_status).delete(plugin_oauth_delete))
        .route("/api/tasks/suggest", get(tasks_suggest))
        .route("/api/capture", post(capture_post))
        .route("/api/capture/undo", post(capture_undo))
        .route("/api/capture/describe", post(capture_describe))
        .route("/api/capture/days", get(capture_days))
        .route("/api/captures", get(captures_get))
        .route("/api/captures/triage", post(captures_triage))
        .route("/api/log/today", post(today_log_post))
        .route("/api/note/new", post(note_new))
        .route("/api/note/templates", get(note_templates))
        .route("/api/search", get(search_get))
        .route("/api/replace", post(replace_post))
        .route("/api/commands", get(commands_get).post(commands_post))
        .route("/api/keys", get(keys_get).put(keys_put))
        .route("/api/cmd/{id}", post(cmd_post))
        .route("/api/signin", post(signin_post))
        .route("/api/signin/door", post(signin_door_post))
        .route("/api/signin/doors", get(signin_doors_get))
        .route("/api/signin/doors/{host}", delete(signin_door_delete))
        .route("/api/signin/tokens", get(signin_tokens_get))
        .route("/api/signin/tokens/{key}", delete(signin_token_delete))
        .route("/signin/door", get(signin_door_page))
        .route("/api/events", get(events_ws))
        .route("/api/live", get(live_ws))
        .route("/api/lease/ask", post(lease_ask))
        .route("/api/lease/done", post(lease_done))
        .route("/api/web/frameable", get(web_frameable_get))
        .route("/remote/{host}/{*rest}", axum::routing::any(remote_any))
        .route("/api/pty", get(pty_ws))
        .route("/api/lsp", get(lsp_get))
        .route("/api/python-envs", get(python_envs_get))
        .route("/api/lsp/{lang}", get(lsp_ws))
        .route("/api/config", get(config_get).put(config_put))
        .route("/api/config/suggestions", get(config_suggestions_get))
        .route("/api/theme/vscode", get(vscode_theme_get))
        .route("/api/attach", post(attach_post).layer(DefaultBodyLimit::max(100 * 1024 * 1024)))
        .route("/api/companion", post(companion_post))
        .route("/api/pdf-marks", get(pdf_marks_get).post(pdf_marks_post))
        .route("/api/pdf-of-note", get(pdf_of_note_get))
        .route("/api/pdf-export", post(pdf_export_post))
        .route("/api/typst/svg", post(typst_svg_post))
        .route("/api/backlinks", get(backlinks_get))
        .route("/api/link-targets", get(link_targets_get))
        .route("/api/base", get(base_get))
        .route("/api/base/row", post(base_row_post))
        .route("/api/base/query", post(base_query_post))
        .route("/api/view", post(view_post))
        .route("/api/css-snippets", get(css_snippets_get))
        .route("/api/home", get(home_get))
        .route("/api/recent", get(recent_get))
        .route("/api/vaults", get(vaults_get))
        .route("/api/vaults/open", post(vaults_open_post))
        .route("/api/vaults/forget", post(vaults_forget_post))
        .route("/api/vaults/mirror", post(vaults_mirror_post))
        .route("/api/vaults/active", post(vaults_active_post))
        .route("/api/usage", post(usage_post))
        .route("/api/tools/suggestions", get(tools_suggestions_get))
        .route("/api/tools/keep", post(tools_keep_post))
        .route("/api/tools/dismiss", post(tools_dismiss_post))
        .route("/api/base/view", post(base_view_post))
        .route("/api/graph", get(graph_get))
        .route("/api/tags", get(tags_get))
        .route("/api/tags/rename", post(tags_rename))
        .route("/api/task/tick", post(task_tick))
        .route("/api/task/line", post(task_line))
        .route("/api/fs/mkdir", post(fs_mkdir))
        .route("/api/fs/upload", post(fs_upload).layer(DefaultBodyLimit::max(1024 * 1024 * 1024)))
        .route("/api/fs/move", post(fs_move))
        .route("/api/fs/trash", post(fs_trash))
        .route("/api/fs/reveal-outside", post(fs_reveal_outside))
        .route("/api/link-mention", post(link_mention_post))
        .route("/api/property", put(property_put))
        .route("/api/frontmatter/edit", post(frontmatter_edit_post))
        .route("/api/note/merge-template", post(merge_template_post))
        .route("/api/properties/spec", get(properties_spec_get))
        .route("/api/properties/known", get(properties_known_get))
        .route("/api/git/log", get(git_log_get))
        .route("/api/git/commit", get(git_commit_get).post(git_commit_post))
        .route("/api/git/status", get(git_status_get))
        .route("/api/git/diff", get(git_diff_get))
        .route("/api/git/blame", get(git_blame_get))
        .route("/api/git/stage", post(git_stage_post))
        .route("/api/git/discard", post(git_discard_post))
        .route("/api/git/apply", post(git_apply_post))
        .route("/api/git/pull", post(|State(st): S| git_sync(st, git::Sync::Pull)))
        .route("/api/git/push", post(|State(st): S| git_sync(st, git::Sync::Push)))
        .route("/api/ui/state", get(ui_state_get).put(ui_state_put))
        .route("/api/ui/log", post(ui_log_post))
        .route("/login", get(login_get).post(login_post))
        .route("/api/auth/me", get(auth_me))
        .route("/api/version", get(|| async { Json(version_info()) }))
        .route("/api/local/link", post(local_link))
        .route("/api/agents", get(agents_get).post(agents_post))
        .route("/api/agents/terminals", put(agents_terminals_put))
        .route("/api/agents/{name}", axum::routing::delete(agents_delete))
        .route("/auth/app", get(app_signin_get).post(app_signin_post))
        .route("/api/auth/logout", post(auth_logout))
        .route("/api/server", get(server_get))
        .route("/api/server/options", put(server_options_put))
        .route("/api/server/password", post(server_password_post))
        .route("/api/server/tokens", post(server_token_post))
        .route("/api/server/tokens/{name}", axum::routing::delete(server_token_delete))
        .route("/api/server/signout-all", post(server_signout_all))
        .merge(builtin_routes(&state, BuiltinPlugin::Latex, Router::new().route("/api/snippets", get(snippets_get))))
        .fallback({
            let prefix = state.prefix.clone();
            move |uri: Uri| static_files(uri, prefix.clone())
        })
        // Text files may be up to 5 MB; JSON escaping can roughly double that.
        .layer(DefaultBodyLimit::max(12 * 1024 * 1024))
        .layer(middleware::from_fn_with_state(state.clone(), guard))
        .with_state(state)
}

/// A built-in plugin's routes: while the vault has it switched off they answer 404 saying so, so no handler of it has
/// to check (config.rs `BuiltinPlugin`).
fn builtin_routes(state: &Arc<AppState>, plugin: BuiltinPlugin, routes: Router<Arc<AppState>>) -> Router<Arc<AppState>> {
    routes.layer(middleware::from_fn_with_state((state.clone(), plugin), builtin_on))
}

async fn builtin_on(State((st, plugin)): State<(Arc<AppState>, BuiltinPlugin)>, req: Request, next: Next) -> Response {
    let on = with_ws(&st, move |ws| Ok(ws.config()?.plugins.is_on(plugin))).await;
    match on {
        Ok(true) => next.run(req).await,
        Ok(false) => (StatusCode::NOT_FOUND, format!("the {} plugin is switched off in this vault", plugin.title())).into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Debug, Clone)]
pub struct ServerInfo {
    pub port: u16,
    pub root: PathBuf,
}

/// A running server. Dropping it without [`ServerHandle::shutdown`] leaves the task running
/// until the runtime ends.
pub struct ServerHandle {
    info: ServerInfo,
    shutdown: Option<oneshot::Sender<()>>,
    task: tokio::task::JoinHandle<std::io::Result<()>>,
    vaults: Vec<VaultRun>,
    lock: Option<Arc<crate::local_lock::LocalLock>>,
    /// The desktop's vaults started on demand (their runs live there).
    desktop: Option<Arc<desktop::DesktopVaults>>,
}

/// What runs for one vault besides its routes: the file watcher, the schedules, `server.json`.
struct VaultRun {
    server_file: PathBuf,
    _watcher: Option<WatcherGuard>,
    scheduler: tokio::task::JoinHandle<()>,
    hooks: tokio::task::JoinHandle<()>,
    merges: tokio::task::JoinHandle<()>,
    /// A local vault's notices to the system (notify.rs); a server's reach devices through the notifications plugin.
    notices: Option<tokio::task::JoinHandle<()>>,
}

impl ServerHandle {
    pub fn port(&self) -> u16 {
        self.info.port
    }

    pub fn info(&self) -> &ServerInfo {
        &self.info
    }

    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}/", self.info.port)
    }

    /// The address a window of this program opens: with a one-time code when the core is locked (it becomes the cookie).
    pub fn open_url(&self) -> String {
        match &self.lock {
            Some(l) => format!("{}?k={}", self.url(), l.code()),
            None => self.url(),
        }
    }

    /// The locked core's key, for this program's own requests (`Authorization: Bearer`); None when it is open.
    pub fn key(&self) -> Option<&str> {
        self.lock.as_deref().map(|l| l.key())
    }

    /// Graceful stop; removes `server.json` if it is still ours.
    pub async fn shutdown(mut self) -> anyhow::Result<()> {
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
        }
        let lazy = match &self.desktop {
            Some(d) => d.runs().await,
            None => Vec::new(),
        };
        for v in self.vaults.iter().chain(lazy.iter().map(|s| s.run())) {
            v.scheduler.abort();
            v.hooks.abort();
            v.merges.abort();
            if let Some(n) = &v.notices {
                n.abort();
            }
        }
        let r = (&mut self.task).await;
        self.remove_server_file();
        r??;
        Ok(())
    }

    /// Run until the server stops on its own (it normally does not).
    pub async fn wait(mut self) -> anyhow::Result<()> {
        let r = (&mut self.task).await;
        self.remove_server_file();
        r??;
        Ok(())
    }

    fn remove_server_file(&self) {
        let lazy: Vec<_> = self.desktop.as_ref().and_then(|d| d.runs_now()).unwrap_or_default();
        for v in self.vaults.iter().chain(lazy.iter().map(|s| s.run())) {
            let ours = std::fs::read_to_string(&v.server_file)
                .ok()
                .and_then(|t| serde_json::from_str::<ServerFile>(&t).ok())
                .is_some_and(|f| f.pid == std::process::id() && f.port == self.info.port);
            if ours {
                let _ = vault_write::cache::remove_file(&v.server_file);
            }
        }
    }
}

/// Where a core listens, and whether it asks who is there.
pub enum Listen {
    /// The desktop and the phone: 127.0.0.1 only, no sign-in (`port` 0 = any free port); locked or not (local_lock.rs).
    Local(u16, crate::local_lock::Lock),
    /// Server mode (`atlas serve --listen`): any address, everyone signed in (auth.rs).
    Server { addr: std::net::SocketAddr, auth: Box<crate::auth::Auth> },
}

/// Start serving `root` on 127.0.0.1:`port` (0 = any free port) and return once bound.
/// Usable in-process (Tauri) or from the CLI.
pub async fn serve(root: PathBuf, port: u16) -> anyhow::Result<ServerHandle> {
    serve_on(root, Listen::Local(port, crate::local_lock::Lock::from_env())).await
}

pub async fn serve_on(root: PathBuf, listen: Listen) -> anyhow::Result<ServerHandle> {
    serve_vaults(Vaults::One(root), listen).await
}

/// What a core serves: one vault at `/` (the desktop, `atlas serve <dir>`), or a server's several, each at
/// `/v/<name>/` with one sign-in for all (`atlas serve --vaults-in`, `--vault name=path`; docs/guides/SERVER.md).
pub enum Vaults {
    One(PathBuf),
    Many(Vec<Served>),
    /// The desktop: `first` at `/v/<name>/` and every folder of the vault list `list` beside it, each started when first
    /// asked for (server_desktop.rs).
    Desktop { first: PathBuf, list: PathBuf },
}

/// A vault's name as it appears in an address: letters, digits, `-` and `_`.
pub fn vault_name_ok(name: &str) -> bool {
    !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub async fn serve_vaults(vaults: Vaults, listen: Listen) -> anyhow::Result<ServerHandle> {
    crate::mem_trim::spawn(); // freed memory back to the system once a minute (mem_trim.rs)
    let (listener, auth, lock) = match listen {
        Listen::Local(port, lock) => (tokio::net::TcpListener::bind(("127.0.0.1", port)).await?, None::<Arc<crate::auth::Auth>>, lock),
        Listen::Server { addr, auth } => {
            if let Some(why) = auth.not_ready() {
                anyhow::bail!("server mode: {why}");
            }
            crate::platform::Platform::mark_server(); // plugins that say `server = "no"` stop here
            (tokio::net::TcpListener::bind(addr).await?, Some(Arc::from(auth)), crate::local_lock::Lock::Open)
        }
    };
    let port = listener.local_addr()?.port();
    let lock = match lock {
        crate::local_lock::Lock::Open => None,
        crate::local_lock::Lock::Locked { fixed } => Some(Arc::new(crate::local_lock::LocalLock::new(port, fixed)?)),
    };
    if let Some(a) = &auth {
        a.make_local_key(port)?; // this machine's `atlas` CLI signs in with it
    }
    let mut lazy = None;
    let (app, runs, first) = match vaults {
        Vaults::Desktop { first, list } => {
            let d = desktop::DesktopVaults::new(&first, port, lock.clone(), list);
            // the window's own vault at once: its server.json is what the CLI, the capture box and agents look for
            let name = d.name_for(&first);
            let warm = d.clone();
            let _ = warm.dispatch(Request::builder().uri(format!("/v/{name}/api/workspace")).header("x-atlas", "1").body(axum::body::Body::empty())?).await;
            lazy = Some(d.clone());
            let app = Router::new().fallback(move |req: Request| d.clone().dispatch(req));
            (app, Vec::new(), first)
        }
        Vaults::One(root) => {
            let served = auth.as_ref().map(|_| Arc::new(vec![Served { name: dir_name(&root), root: root.clone() }]));
            let (app, run, _) = start_vault(&root, port, auth.clone(), lock.clone(), served, "")?;
            (app, vec![run], root)
        }
        Vaults::Many(list) => {
            anyhow::ensure!(!list.is_empty(), "no vaults to serve");
            for (i, v) in list.iter().enumerate() {
                anyhow::ensure!(vault_name_ok(&v.name), "“{}”: a vault's name in the address takes letters, digits, - and _", v.name);
                anyhow::ensure!(!list[..i].iter().any(|o| o.name == v.name), "two vaults named “{}”", v.name);
            }
            let served = Arc::new(list.clone());
            let mut top = Router::new();
            let (mut runs, mut first_state) = (Vec::new(), None);
            for v in &list {
                let (app, run, state) = start_vault(&v.root, port, auth.clone(), lock.clone(), Some(served.clone()), &format!("/v/{}", v.name))?;
                top = top.nest(&format!("/v/{}", v.name), app);
                runs.push(run);
                first_state.get_or_insert(state);
            }
            let first = list[0].name.clone();
            let names: Vec<String> = list.iter().map(|v| v.name.clone()).collect();
            let st = first_state.expect("at least one vault");
            // `/` → the first vault; the sign-in and the app's files (scripts, styles) are shared by all
            let signin = Router::new().route("/login", get(login_get).post(login_post)).with_state(st.clone());
            let top = top
                .route("/", get(move || async move { axum::response::Redirect::to(&format!("/v/{first}/")) }))
                .merge(signin)
                // a page address under a vault the nested router let through (`/v/work/`): the app, told its prefix
                .fallback(move |uri: Uri| {
                    let names = names.clone();
                    async move {
                        let prefix = names.iter().map(|n| format!("/v/{n}")).find(|p| uri.path() == p || uri.path().starts_with(&format!("{p}/"))).unwrap_or_default();
                        // a vault that is not here (an old address, a renamed vault): the list of those that are
                        if prefix.is_empty() {
                            if let Some(asked) = uri.path().strip_prefix("/v/").map(|r| r.split('/').next().unwrap_or("")) {
                                return vault_picker(&names, asked).into_response();
                            }
                        }
                        static_files(uri, prefix).await.into_response()
                    }
                })
                .layer(middleware::from_fn_with_state(st, guard));
            (top, runs, list[0].root.clone())
        }
    };
    let app = compressed(app);
    let info = ServerInfo { port, root: first };
    let (tx, rx) = oneshot::channel::<()>();
    let task = tokio::spawn(async move {
        axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>())
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await
    });
    Ok(ServerHandle { info, shutdown: Some(tx), task, vaults: runs, lock, desktop: lazy })
}

/// The vaults of a server as a page, for an address under `/v/` that names none of them. Plain HTML in the app's colours, light or dark as the system is.
fn vault_picker(names: &[String], asked: &str) -> (StatusCode, axum::response::Html<String>) {
    let esc = |t: &str| t.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;");
    let rows: String = names.iter().map(|n| format!(r#"<a href="/v/{n}/">{n}</a>"#, n = esc(n))).collect();
    let said = if asked.is_empty() { String::new() } else { format!("<p>There is no vault called <b>{}</b> here.</p>", esc(asked)) };
    (StatusCode::NOT_FOUND, axum::response::Html(format!(r#"<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas — vaults</title>
<style>:root{{color-scheme:light dark;--bg:#f7f8fa;--card:#fff;--text:#1f2329;--muted:#5d6470;--line:#e3e6eb;--accent:#4864dd}}
@media (prefers-color-scheme:dark){{:root{{--bg:#17191e;--card:#1f2128;--text:#dcdfe5;--muted:#9aa1ad;--line:#2c2f37;--accent:#8aa4ff}}}}
body{{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.5 Inter,system-ui,sans-serif}}
main{{width:min(360px,calc(100vw - 32px));background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px}}
h1{{font-size:17px;margin:0 0 4px}}p{{color:var(--muted);margin:0 0 14px}}a{{display:block;padding:10px 12px;margin-top:6px;border:1px solid var(--line);border-radius:8px;color:var(--text);text-decoration:none;font-weight:500}}
a:hover{{border-color:var(--accent);color:var(--accent)}}</style></head><body><main><h1>Choose a vault</h1>{said}{rows}</main></body></html>"#)))
}

fn dir_name(root: &std::path::Path) -> String {
    root.file_name().map_or_else(|| "vault".into(), |n| n.to_string_lossy().into_owned())
}

/// One vault's state, background work and routes (at `prefix` on a server of several).
fn start_vault(root: &std::path::Path, port: u16, auth: Option<Arc<crate::auth::Auth>>, lock: Option<Arc<crate::local_lock::LocalLock>>, served: Option<Arc<Vec<Served>>>, prefix: &str) -> anyhow::Result<(Router, VaultRun, Arc<AppState>)> {
    let ws = Workspace::open(root)?;
    let cfg = ws.config()?; // fail loudly on a malformed config instead of serving defaults
    let off = cfg.plugins.off.clone();
    let bus = EventBus::default();
    let watcher = match spawn_watcher(ws.root(), cfg, bus.clone()) {
        Ok(w) => Some(w),
        Err(e) => {
            eprintln!("atlas: file watching disabled for {}: {e}", ws.root().display());
            None
        }
    };
    // the caches are rebuilt from the vault: git and the Git pane leave them out
    if let Err(e) = crate::vault_write::ignored_folder(&ws.cache_dir(), "Atlas's caches, rebuilt from the vault") {
        eprintln!("atlas: {}: {e}", ws.cache_dir().display());
    }
    let server_file = ws.cache_dir().join("server.json");
    let sf = ServerFile { port, pid: std::process::id(), root: ws.root().to_string_lossy().into_owned(), path: prefix.to_string() };
    vault_write::cache::write(&server_file, serde_json::to_string_pretty(&sf)?.as_bytes())?;
    if let Ok(cfg) = ws.config() {
        crate::pdf_text::refresh_in_background(ws.root(), &cfg); // PDFs searchable soon after start
    }
    // a PDF that arrives (a download, Syncthing, Zotero) gets its text and its cover at once, not when first shown
    let mut fs_events = bus.on_fs();
    let pdf_ws = ws.clone();
    tokio::spawn(async move {
        while let Ok(paths) = fs_events.recv().await {
            if paths.iter().any(|p| p.to_ascii_lowercase().ends_with(".pdf")) {
                if let Ok(cfg) = pdf_ws.config() {
                    crate::pdf_text::refresh_in_background(pdf_ws.root(), &cfg);
                }
            }
        }
    });
    // the scheduler shares the helpers the routes answer through: a plugin's scheduled tool (a sync) runs in them
    let helpers = crate::helper::Helpers::new(ws.root(), bus.clone());
    let scheduler = crate::schedule::spawn(ws.clone(), bus.clone(), helpers.clone());
    let hooks = crate::capture_hooks::spawn(ws.clone(), bus.clone(), helpers.clone());
    let merges = crate::sync_merge::spawn(ws.clone(), bus.clone()); // Syncthing's conflict copies merged (DESIGN-mirror-v2 §4)
    let notices = served.is_none().then(|| crate::notify::spawn(ws.clone(), bus.clone(), crate::notify::Presence::global(), crate::notify::platform(&bus)));
    // a server's lease table outlives a restart (lease.rs `kept_in`); a desktop's core keeps none
    let leases = Arc::new(if served.is_some() { crate::lease::Leases::kept_in(ws.cache_dir().join("leases.json")) } else { Default::default() });
    // the sign-ins kept for plugins visited now and then, so a gate's idle limit never ends them between uses
    let _keep_alive = crate::service_signin::spawn_keep_alive(ws.root().to_path_buf());
    let state = Arc::new(AppState {
        helpers,
        ws,
        bus,
        port,
        ui: Default::default(),
        ptys: Default::default(),
        auth,
        lock,
        prefix: prefix.to_string(),
        served,
        live: Default::default(),
        media: Default::default(),
        desktop: Default::default(),
        leases,
        leasing: std::sync::Once::new(),
    });
    if state.served.is_none() {
        crate::mirror_guard::install_for_mirror(&state.ws); // a local vault with a copy on a server asks it before writing
    }
    let routes = router(state.clone());
    state.helpers.answer_with(routes.clone()); // helpers' calls back (helper_api.rs); a cycle that lives as long as the vault
    // the vault's former [refs] settings become catalog-papers' (REFACTOR-references-plugin.md), keys it has win
    if let Err(e) = crate::plugins::adopt_config_section(state.ws.root(), "refs", "catalog-papers") {
        eprintln!("atlas: [refs] → catalog-papers settings: {e}");
    }
    // settings values never live in a manifest: an older vault's `[settings]` move to .atlas/plugin-settings/ (once)
    crate::plugins::move_all_settings_out(state.ws.root());
    // a merged plugin copied in by hand takes over the settings of the plugins it replaces (plugin_install.rs)
    crate::plugin_install::adopt_all_replaced(state.ws.root());
    crate::plugins::hide_legacy_rails(state.ws.root());
    for id in crate::plugins::helpers_started_with_vault(state.ws.root(), &off) {
        if let Err(e) = state.helpers.start(&id) {
            eprintln!("atlas: plugin {id}: its helper did not start with the vault: {e}");
        }
    }
    Ok((routes, VaultRun { server_file, _watcher: watcher, scheduler, hooks, merges, notices }, state))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_path_is_judged_inside_its_vault() {
        assert_eq!(vault_path("/v/work/api/capture"), "/api/capture");
        assert_eq!(vault_path("/api/capture"), "/api/capture");
        assert_eq!(vault_path("/v/work"), "/v/work");
        assert_eq!(vault_path("/login"), "/login");
    }

    #[test]
    fn the_system_file_manager_opens_only_for_the_desktop_asked_from_this_machine() {
        let local: std::net::IpAddr = [127, 0, 0, 1].into();
        let lan: std::net::IpAddr = [10, 88, 0, 2].into();
        assert!(may_reveal_outside(false, local));
        assert!(!may_reveal_outside(false, lan));
        assert!(!may_reveal_outside(true, local)); // a server behind nginx: every visitor is loopback
    }

    /// gzip only for a peer off this machine, and only the UI's files and the path listings.
    #[tokio::test]
    async fn only_what_leaves_the_machine_is_gzipped() {
        use tower::ServiceExt;
        let big = || async { "x".repeat(4096) };
        let app = compressed(Router::new().route("/assets/a.js", get(big)).route("/v/work/api/files", get(big)).route("/api/settings", get(big)));
        let gz = |path: &str, ip: [u8; 4]| {
            let mut req = Request::builder().uri(path).header(header::ACCEPT_ENCODING, "gzip").body(axum::body::Body::empty()).unwrap();
            req.extensions_mut().insert(axum::extract::ConnectInfo(std::net::SocketAddr::from((ip, 1))));
            let app = app.clone();
            async move { app.oneshot(req).await.unwrap().headers().get(header::CONTENT_ENCODING).is_some() }
        };
        assert!(gz("/assets/a.js", [10, 88, 0, 2]).await);
        assert!(gz("/v/work/api/files", [10, 88, 0, 2]).await);
        assert!(!gz("/api/settings", [10, 88, 0, 2]).await); // may carry a secret
        assert!(!gz("/assets/a.js", [127, 0, 0, 1]).await); // the desktop, the phone's own core
    }

    #[test]
        fn a_viewers_byte_range_is_read_and_others_are_served_whole() {
        let h = |v: &str| HeaderMap::from_iter([(header::RANGE, HeaderValue::from_str(v).unwrap())]);
        assert_eq!(byte_range(&h("bytes=0-65535")), Some((0, 65535)));
        assert_eq!(byte_range(&h("bytes=100-")), Some((100, u64::MAX)));
        assert_eq!(byte_range(&h("bytes=5-1")), None);
        assert_eq!(byte_range(&h("bytes=0-1,4-5")), None); // several ranges: the whole file
        assert_eq!(byte_range(&HeaderMap::new()), None);
    }

    /// The user's ask, end to end: a Python helper using `atlas_plugin` writes and reads a note through the vault's own
    /// API over its pipe (helper_api.rs), and may not read another plugin's secrets.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_python_helper_calls_the_core_back_over_its_pipe() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        let plug = root.join(".atlas/plugins/pyback");
        std::fs::create_dir_all(&plug).unwrap();
        std::fs::write(plug.join("plugin.toml"), "title = \"Back\"\n[helper]\nrun = \"python3 -u \\\"$ATLAS_PLUGIN_DIR/helper.py\\\"\"\n").unwrap();
        std::fs::write(
            plug.join("helper.py"),
            r##"import atlas_plugin as atlas

@atlas.method
def roundtrip(params):
    atlas.write("notes/From helper.md", "# Hi\n" + params["word"] + "\n")
    back = atlas.read("notes/From helper.md")
    names = [p for p in atlas.files() if p.endswith(".md")]
    try:
        atlas.get("/api/plugins/other/secrets/token")
        other = "read"
    except atlas.AtlasError as e:
        other = e.status
    return {"back": back, "names": names, "other": other}

atlas.serve()
"##,
        )
        .unwrap();
        let (_routes, _run, state) = start_vault(&root, 0, None, None, None, "").unwrap();
        let got = state.helpers.call("pyback", "roundtrip", serde_json::json!({ "word": "pipe" }), std::time::Duration::from_secs(20)).await.unwrap();
        assert_eq!(got["back"], "# Hi\npipe\n");
        assert!(got["names"].as_array().unwrap().iter().any(|p| p == "notes/From helper.md"), "{got}");
        assert_eq!(got["other"], 403, "another plugin's secrets stay closed: {got}");
        assert_eq!(std::fs::read_to_string(root.join("notes/From helper.md")).unwrap(), "# Hi\npipe\n");
        state.helpers.stop_all();
    }

    /// The same through a JavaScript helper run in the core (js_helper.rs): the API, another plugin's secrets closed, and
    /// `fetch` refused a host its manifest does not list (plugin_net.rs, the one check every helper goes through).
    #[tokio::test(flavor = "multi_thread")]
    async fn a_js_helper_calls_the_core_back_and_reaches_only_its_hosts() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        let plug = root.join(".atlas/plugins/jsback");
        std::fs::create_dir_all(&plug).unwrap();
        std::fs::write(plug.join("plugin.toml"), "title = \"Back\"\n[permissions]\nnet = [\"api.example.org\"]\n[helper]\njs = \"helper.js\"\n").unwrap();
        std::fs::write(
            plug.join("helper.js"),
            r##"atlas.method("roundtrip", async (p) => {
  await atlas.write("notes/From js.md", "# Hi\n" + p.word + "\n");
  const back = await atlas.read("notes/From js.md");
  const other = await atlas.get("/api/plugins/other/secrets/token").then(() => "read", (e) => e.status);
  const web = await atlas.fetch("https://elsewhere.example.net/", { waits: [] }).then(() => "fetched", (e) => e.message);
  return { back, other, web };
});
"##,
        )
        .unwrap();
        let (_routes, _run, state) = start_vault(&root, 0, None, None, None, "").unwrap();
        let got = state.helpers.call("jsback", "roundtrip", serde_json::json!({ "word": "js" }), std::time::Duration::from_secs(20)).await.unwrap();
        assert_eq!(got["back"], "# Hi\njs\n");
        assert_eq!(got["other"], 403, "another plugin's secrets stay closed: {got}");
        assert!(got["web"].as_str().unwrap().contains("may not reach elsewhere.example.net"), "{got}");
        assert_eq!(state.helpers.state("jsback"), "running");
        state.helpers.stop_all();
    }
    /// The catalog end to end with its real helpers: the compiled engine (plugins/beta/catalog) and the Python
    /// Linkwarden helper, a page served here, read by the engine (its clip.rs, the page fetched through the core) for
    /// its own clip source (`engine = "clip"`, the "read_pages" setting), written as a note,
    /// saved to a stand-in Linkwarden in the library's collection; the same link again finds the same note.
    #[tokio::test(flavor = "multi_thread")]
    async fn the_catalog_turns_a_link_into_a_note_and_a_linkwarden_link_with_its_real_helpers() {
        // the engine binary, built by the cargo running this test (the build lock is free while tests run)
        let ws = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let built = std::process::Command::new(env!("CARGO")).args(["build", "-q", "-p", "atlas-catalog", "--bin", "catalog"]).current_dir(&ws).status().unwrap();
        assert!(built.success(), "cargo build -p atlas-catalog failed");
        let target = std::env::var_os("CARGO_TARGET_DIR").map(std::path::PathBuf::from).unwrap_or_else(|| ws.join("target"));
        let engine = crate::paths::real(&target.join(format!("debug/catalog{}", std::env::consts::EXE_SUFFIX))).unwrap();

        // a web page and a stand-in Linkwarden that remembers what it was given
        let saved: Arc<std::sync::Mutex<Vec<serde_json::Value>>> = Arc::default();
        let keep = saved.clone();
        let site = Router::new()
            .route("/post", get(|| async { axum::response::Html(r#"<html><head><meta property="og:title" content="A post: on things"><meta property="og:type" content="article"></head><body><article><p>First paragraph.</p></article></body></html>"#) }))
            .route("/api/v1/links", post(move |Json(b): Json<serde_json::Value>| async move { keep.lock().unwrap().push(b); Json(serde_json::json!({ "response": { "id": 7 } })) }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, site).await.unwrap() });

        // the vault: the two plugins as shipped, the engine run from where cargo built it
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        let plugins = ws.join("plugins/beta"); // the catalog and its subplugins are beta
        for id in ["catalog", "catalog-linkwarden"] {
            let to = root.join(".atlas/plugins").join(id);
            std::fs::create_dir_all(&to).unwrap();
            let mut manifest = std::fs::read_to_string(plugins.join(id).join("plugin.toml")).unwrap();
            if id == "catalog" {
                // a run line reads an unquoted `\` as an escape, as sh does: a Windows path goes in single quotes
                let line = toml::Value::String(format!("'{}'", engine.to_string_lossy()));
                manifest = manifest.replace("run = \"\\\"${ATLAS_PLUGIN_BIN:-$ATLAS_PLUGIN_DIR/bin/$ATLAS_PLUGIN_TARGET}/catalog\\\"\"", &format!("run = {line}"));
                assert!(!manifest.contains("$ATLAS_PLUGIN_TARGET}/catalog"), "the helper line moved: {manifest}");
            }
            if id == "catalog-linkwarden" {
                // its helper runs in the core (helper.js); the vault's value in its own settings file
                std::fs::create_dir_all(root.join(".atlas/plugin-settings")).unwrap();
                std::fs::write(root.join(".atlas/plugin-settings/catalog-linkwarden.toml"), format!("address = \"http://{addr}\"\n")).unwrap();
                std::fs::copy(plugins.join(id).join("helper.js"), to.join("helper.js")).unwrap();
            }
            std::fs::write(to.join("plugin.toml"), manifest).unwrap();
        }
        let (_routes, _run, state) = start_vault(&root, 0, None, None, None, "").unwrap();
        let cfg = state.ws.config().unwrap();
        let store = crate::secrets::Store::for_vault(&root);
        let add = |text: String| crate::plugin_tools::call(&root, &cfg, &state.helpers, &store, "catalog", "add", serde_json::json!({ "text": text }));

        let first = add(format!("look at http://{addr}/post?utm_source=feed")).await.unwrap();
        assert_eq!(first["outcome"], "created", "{first:#}");
        let path = first["path"].as_str().unwrap().to_string();
        assert_eq!(path, "notes/clips/A post on things.md");
        let note = std::fs::read_to_string(root.join(&path)).unwrap();
        assert!(note.contains(&format!("source: http://{addr}/post")), "{note}");
        assert!(note.contains("```view\ntype: catalog.item\n```\n\nFirst paragraph.\n"), "{note}");
        assert!(note.contains(&format!("linkwarden: http://{addr}/links/7")), "{note}");
        let links = saved.lock().unwrap().clone();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0]["collection"]["name"], "Web page", "the library's collection: {links:?}");

        let again = add(format!("http://{addr}/post")).await.unwrap();
        assert_eq!((again["path"].as_str(), again["outcome"].as_str()), (Some(path.as_str()), Some("unchanged")), "{again:#}");
        state.helpers.stop_all();
    }
}
