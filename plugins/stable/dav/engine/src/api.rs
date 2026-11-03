//! The helper's methods: what the pane (ui/), the blocks, Email and Claude's tools call (README.md). Each takes the
//! call's params (with `settings`, `secrets`, and the page's `tz`) and answers JSON.
use crate::caldav::{as_dir, Client, Existing};
use crate::remote::Remote;
use crate::conf::{self, Card, Sub};
use crate::edit::{self, Change, Scope};
use crate::ics::{self, Event, When};
use crate::invite;
use crate::pull;
use crate::push;
use crate::quick;
use crate::recur::{self, Instance, Range};
use crate::store::{Kind, Object, Source, Store};
use crate::sync::{self, Scope as SyncScope};
use crate::uid;
use crate::zone::Zone;
use atlas_plugin::error;
use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Instant, SystemTime};
use url::Url;

pub type Res = atlas_plugin::Result<Value>;
pub type Method = fn(Value) -> Res;

fn fail(e: impl std::fmt::Display) -> atlas_plugin::Error {
    error(e.to_string())
}

/// Every method by name.
pub fn table() -> Vec<(&'static str, Method)> {
    vec![
        // the first tools (README.md)
        ("calendars", calendars),
        ("suggest_calendars", suggest_calendars),
        // Settings: each account's state, a card's Test, the 0.1 settings moved into a card
        ("account_status", account_status),
        ("test_account", test_account),
        ("migrate", migrate),
        ("events", events),
        ("add_event", add_event),
        ("remove_event", remove_event),
        ("sync", sync_method),
        // the pane
        ("watch", watch),
        ("sources", sources),
        ("range", range),
        ("refresh", refresh),
        ("create", create),
        ("update", update),
        ("delete", delete),
        ("respond", respond),
        ("undo", undo),
        ("quick", quick_parse),
        ("search", search),
        ("test_subscription", test_subscription),
        // Email's side
        ("import_invite", import_invite),
        ("invite_status", invite_status),
        ("contacts", contacts),
        ("agenda", agenda),
    ]
}

// ----- the engine's state: the cache, the undo list, the background sync

struct Engine {
    store: Store,
    /// one pull at a time
    pulling: Mutex<()>,
    /// each account's sync, by card name (account_status reads it)
    accounts: Mutex<HashMap<String, AcctState>>,
    last_books: Mutex<Option<Instant>>,
    undo: Mutex<Vec<(u64, Vec<Step>)>>,
    next_undo: AtomicU64,
    watching: AtomicBool,
    /// the vault's important notes, by path: (mtime, events)
    notes: Mutex<HashMap<String, (SystemTime, Vec<Event>)>>,
}

/// How an account's last sync went.
#[derive(Debug, Clone, Default)]
struct AcctState {
    /// the last attempt (the next is due `refresh` minutes later)
    tried: Option<Instant>,
    /// the last good sync
    synced: Option<SystemTime>,
    error: Option<String>,
    busy: bool,
}

/// What Settings shows on an account's card (`account_status`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum State {
    Ok,
    Warn,
    Error,
    Busy,
}

#[derive(Debug, Clone, Serialize)]
struct Status {
    state: State,
    text: String,
}

/// One write to undo: put `before` back at `href` (None: remove what is there).
#[derive(Debug, Clone)]
struct Step {
    source: String,
    href: String,
    before: Option<String>,
}

fn engine() -> &'static Engine {
    static E: OnceLock<Engine> = OnceLock::new();
    E.get_or_init(|| {
        let path = conf::cache_dir().join("calendar.sqlite");
        let store = Store::open(&path).unwrap_or_else(|e| {
            eprintln!("dav: {e}; the cache is kept in memory");
            Store::memory()
        });
        Engine {
            store,
            pulling: Mutex::new(()),
            accounts: Mutex::new(HashMap::new()),
            last_books: Mutex::new(None),
            undo: Mutex::new(Vec::new()),
            next_undo: AtomicU64::new(1),
            watching: AtomicBool::new(false),
            notes: Mutex::new(HashMap::new()),
        }
    })
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|p| p.into_inner())
}

/// Tells the page (when serving) that the cache changed.
fn changed() {
    if conf::serving() {
        atlas_plugin::event("changed", json!({}));
    }
}

/// The account card of a calendar (its source's `account`).
fn card_named(s: &Value, p: &Value, name: &str) -> atlas_plugin::Result<Card> {
    conf::accounts(s, p).into_iter().find(|c| c.name == name).ok_or_else(|| error(format!("no account {name:?} in Settings (Calendar → Accounts)")))
}

/// A cached calendar and the client of its account.
fn client_for(s: &Value, p: &Value, source: &str) -> atlas_plugin::Result<(Source, Remote)> {
    let src = engine().store.source(source).ok_or_else(|| error(format!("no calendar {source:?} (refresh the calendars)")))?;
    let account = src.account.clone().ok_or_else(|| error(format!("{} is a subscription: read-only", src.name)))?;
    let c = Remote::of(&card_named(s, p, &account)?).map_err(|e| error(format!("{account}: {e}")))?;
    Ok((src, c))
}

fn dir_of(src: &Source) -> atlas_plugin::Result<Url> {
    Url::parse(&src.url).map(as_dir).map_err(fail)
}

fn param<'a>(p: &'a Value, k: &str) -> Option<&'a str> {
    p[k].as_str().map(str::trim).filter(|x| !x.is_empty())
}

// ----- pulling

/// Brings the cache up to date: each account when due (or `force`), the subscriptions that are due. Errors per
/// account and per calendar, each named. Calendars of an account taken out of Settings are forgotten.
fn pull_all(p: &Value, force: bool) -> (bool, Vec<String>) {
    let e = engine();
    let _one = lock(&e.pulling);
    // unread settings are not "no accounts": nothing is pulled or forgotten until they can be read
    let Some(s) = conf::read_settings(p) else {
        eprintln!("dav: the settings could not be read; this round is skipped");
        return (false, Vec::new());
    };
    let cards = conf::accounts(&s, p);
    let mut changed_any = false;
    let mut errors = Vec::new();
    for gone in e.store.sources().iter().filter(|x| x.account.as_ref().is_some_and(|a| !cards.iter().any(|c| &c.name == a))) {
        eprintln!("dav: {}: its account is no longer in Settings; its cache goes", gone.id);
        e.store.remove_source(&gone.id);
        changed_any = true;
    }
    lock(&e.accounts).retain(|k, _| cards.iter().any(|c| &c.name == k));
    let every = conf::refresh_minutes(&s) * 60;
    for card in cards.iter().filter(|c| c.filled()) {
        let due = force || lock(&e.accounts).get(&card.name).and_then(|a| a.tried).is_none_or(|t| t.elapsed().as_secs() as i64 >= every);
        if due {
            let (changed, errs) = pull_card(card);
            changed_any |= changed;
            errors.extend(errs);
        }
    }
    let r = pull::subscriptions(&e.store, &conf::subscriptions(&s), force);
    changed_any |= r.changed;
    errors.extend(r.errors);
    if changed_any {
        changed();
    }
    (changed_any, errors)
}

/// One account's calendars brought up to date now; its state kept for Settings. Errors named by the account.
fn pull_card(card: &Card) -> (bool, Vec<String>) {
    let e = engine();
    lock(&e.accounts).entry(card.name.clone()).or_default().busy = true;
    let r = Remote::of(card).and_then(|c| pull::caldav(&e.store, &c, &card.name));
    let mut st = lock(&e.accounts);
    let a = st.entry(card.name.clone()).or_default();
    a.busy = false;
    a.tried = Some(Instant::now()); // a failure waits for the next interval too
    match r {
        Ok(r) => {
            a.synced = Some(SystemTime::now());
            a.error = r.errors.first().cloned();
            (r.changed, r.errors.iter().map(|x| format!("{}: {x}", card.name)).collect())
        }
        Err(err) => {
            eprintln!("dav: {}: sync: {err}", card.name);
            a.error = Some(err.to_string());
            (false, vec![format!("{}: {err}", card.name)])
        }
    }
}

/// WebDAV Push's round (push.rs), after each regular one: the calendars subscribed through the ntfy server Settings
/// names, and the stream from it kept open; a message syncs that calendar's account at once.
fn push_round() {
    let p = json!({});
    let s = conf::settings(&p);
    let server = conf::push_server(&s);
    let e = engine();
    let cards: Vec<Card> = conf::accounts(&s, &p).into_iter().filter(|c| c.filled()).collect();
    // WebDAV Push is CalDAV's: an Exchange account is checked on the regular round only
    let clients: Vec<(String, Client)> = cards.iter().filter(|c| c.server == conf::Server::Caldav).filter_map(|c| Client::new(&c.account).ok().map(|cl| (c.name.clone(), cl))).collect();
    let calendars: Vec<(String, &Client, Url)> = e
        .store
        .sources()
        .into_iter()
        .filter_map(|src| {
            let (_, client) = clients.iter().find(|(n, _)| src.account.as_deref() == Some(n.as_str()))?;
            Some((src.id.clone(), client, dir_of(&src).ok()?))
        })
        .collect();
    let topics = push::keep(&e.store, &server, &calendars);
    let login = push::Login::of(&conf::text(&s, "push_user"), &conf::secret(&p, "push_password").unwrap_or_default(), &conf::secret(&p, "push_token").unwrap_or_default());
    push::listen(&server, login, topics.into_iter().map(|(t, _)| t).collect(), |topic| {
        let e = engine();
        let Some(account) = e.store.push_source(topic).and_then(|id| e.store.source(&id)).and_then(|s| s.account) else { return };
        let p = json!({});
        let Some(card) = conf::accounts(&conf::settings(&p), &p).into_iter().find(|c| c.name == account) else { return };
        let _one = lock(&e.pulling);
        if pull_card(&card).0 {
            changed();
        }
    });
}

fn watch(p: Value) -> Res {
    let e = engine();
    if !e.watching.swap(true, Ordering::SeqCst) {
        std::thread::spawn(|| loop {
            // settings asked of Atlas each time: a change in Settings reaches the next round
            let _ = pull_all(&json!({}), false);
            push_round();
            std::thread::sleep(std::time::Duration::from_secs(60));
        });
    }
    sources(p)
}

fn refresh(p: Value) -> Res {
    let (changed, errors) = pull_all(&p, p["force"].as_bool().unwrap_or(true));
    Ok(json!({ "changed": changed, "errors": errors }))
}

/// Refreshes when the cache is older than a few minutes (for a tool called with no pane open).
fn fresh_enough(p: &Value) {
    let e = engine();
    let s = conf::settings(p);
    let st = lock(&e.accounts).clone();
    let stale = conf::cards(&s).iter().filter(|c| c.filled()).any(|c| st.get(&c.name).and_then(|a| a.tried).is_none_or(|t| t.elapsed().as_secs() > 300));
    if stale {
        let _ = pull_all(p, false);
    }
}

// ----- calendars as the pane lists them

#[derive(Serialize)]
struct Listed {
    #[serde(flatten)]
    src: Source,
    visible: bool,
    /// the pane's colour: chosen in the pane, else the server's, else the account's, else none (the pane picks one)
    #[serde(skip_serializing_if = "Option::is_none")]
    shown_color: Option<String>,
}

/// A calendar a call or a setting names, among `list`: its id (`home/personal`), its address, `account/Name`, or its
/// name when only one calendar has it (else the error lists the ids to choose from). None: nothing named.
fn find_source(want: &str, list: &[Source]) -> Result<Option<Source>, String> {
    let w = want.trim();
    if w.is_empty() {
        return Ok(None);
    }
    if let Some(x) = list.iter().find(|x| x.id == w) {
        return Ok(Some(x.clone()));
    }
    if let Ok(u) = Url::parse(w) {
        let d = as_dir(u).to_string();
        return Ok(list.iter().find(|x| x.url == d || x.url == w).cloned());
    }
    let (acct, name) = match w.split_once('/') {
        Some((a, n)) if list.iter().any(|x| x.account.as_deref() == Some(a)) => (Some(a), n),
        _ => (None, w),
    };
    let named: Vec<&Source> = list
        .iter()
        .filter(|x| acct.is_none_or(|a| x.account.as_deref() == Some(a)))
        .filter(|x| x.name.eq_ignore_ascii_case(name) || x.url.trim_end_matches('/').ends_with(&format!("/{name}")))
        .collect();
    match named.as_slice() {
        [] => Ok(None),
        [one] => Ok(Some((*one).clone())),
        many => Err(format!("several calendars are called {want:?}: say which by its id ({})", many.iter().map(|x| x.id.as_str()).collect::<Vec<_>>().join(", "))),
    }
}

/// The calendar new events go to: the setting's (`calendar`), else the first writable one of the first account.
fn write_id(s: &Value, list: &[Source]) -> Option<String> {
    let ok = |x: &Source| x.kind == Kind::Caldav && x.writable;
    if let Ok(Some(x)) = find_source(&conf::default_calendar(s), list) {
        if ok(&x) {
            return Some(x.id);
        }
    }
    let order: Vec<String> = s["accounts"].as_array().map(|a| a.iter().map(|c| conf::text(c, "name")).collect()).unwrap_or_default();
    let rank = |x: &&Source| order.iter().position(|n| Some(n.as_str()) == x.account.as_deref()).unwrap_or(usize::MAX);
    list.iter().filter(|x| ok(x)).min_by_key(rank).map(|x| x.id.clone())
}

/// A calendar's colour: chosen in the pane, else the server's, else its account card's.
fn color_of(s: &Value, src: &Source) -> Option<String> {
    let card = || src.account.as_ref().and_then(|a| s["accounts"].as_array()?.iter().find(|c| conf::text(c, "name") == *a).map(|c| conf::text(c, "color")).filter(|c| c.starts_with('#')));
    conf::color_for(s, &src.name, &src.id).or(src.color.clone()).or_else(card)
}

fn sources(p: Value) -> Res {
    let s = conf::settings(&p);
    let hidden = conf::hidden(&s);
    let list = engine().store.sources();
    let write = write_id(&s, &list);
    let shown: Vec<Listed> = list
        .into_iter()
        .map(|src| Listed { visible: !hidden.iter().any(|h| h == &src.name || h == &src.id), shown_color: color_of(&s, &src), src })
        .collect();
    let st = lock(&engine().accounts).clone();
    let accounts: Vec<Value> = conf::cards(&s)
        .iter()
        .map(|c| json!({ "name": c.name, "user": c.account.user, "color": c.color, "error": st.get(&c.name).and_then(|a| a.error.clone()) }))
        .collect();
    Ok(json!({ "sources": shown, "write": write, "accounts": accounts, "configured": conf::filled(&s) }))
}

fn visible(s: &Value) -> Vec<Source> {
    let hidden = conf::hidden(s);
    engine().store.sources().into_iter().filter(|x| !hidden.iter().any(|h| h == &x.name || h == &x.id)).collect()
}

/// An instance with its calendar.
#[derive(Serialize, Clone)]
struct Shown {
    #[serde(flatten)]
    i: Instance,
    calendar: String,
    calendar_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<String>,
    href: String,
    writable: bool,
    /// the user's answer (NEEDS-ACTION, ACCEPTED, TENTATIVE, DECLINED) to a meeting they are invited to in an Exchange
    /// calendar: the card then offers Yes / Maybe / No (`respond`), which Exchange tells the organiser
    #[serde(skip_serializing_if = "Option::is_none")]
    answer: Option<String>,
}

fn shown(o: &Object, src: &Source, s: &Value, range: Range, user: &Zone) -> Vec<Shown> {
    let Some(cal) = ics::parse(&o.ics).ok().and_then(|c| c.into_iter().find(|c| c.name == "VCALENDAR")) else { return vec![] };
    let color = color_of(s, src);
    let me = exchange_user(s, src);
    recur::expand(&cal, range, user)
        .into_iter()
        .map(|i| {
            let answer = me.as_deref().and_then(|m| invited_answer(&i, m));
            Shown { i, calendar: src.id.clone(), calendar_name: src.name.clone(), color: color.clone(), href: o.href.clone(), writable: src.writable, answer }
        })
        .collect()
}

/// The mailbox of the Exchange account a calendar belongs to; None for CalDAV and subscriptions.
fn exchange_user(s: &Value, src: &Source) -> Option<String> {
    let account = src.account.as_deref()?;
    conf::cards(s).into_iter().find(|c| c.name == account && c.server == conf::Server::Exchange).map(|c| c.account.user)
}

/// `me`'s answer when they are a guest of the meeting (not its organiser).
fn invited_answer(i: &Instance, me: &str) -> Option<String> {
    if i.organizer.as_ref().is_some_and(|o| invite::same_address(&o.email, me)) {
        return None;
    }
    i.attendees.iter().find(|a| invite::same_address(&a.email, me)).map(|a| a.partstat.clone().unwrap_or_else(|| "NEEDS-ACTION".into()))
}

fn instances(srcs: &[Source], s: &Value, range: Range, user: &Zone) -> Vec<Shown> {
    let ids: Vec<String> = srcs.iter().map(|x| x.id.clone()).collect();
    let mut out: Vec<Shown> = engine()
        .store
        .in_range(&ids, range.from.timestamp(), range.to.timestamp())
        .iter()
        .flat_map(|o| srcs.iter().find(|x| x.id == o.source).map(|src| shown(o, src, s, range, user)).unwrap_or_default())
        .collect();
    out.sort_by_key(|x| (x.i.from, x.i.to));
    out
}

fn day_param(p: &Value, key: &str, default: NaiveDate) -> atlas_plugin::Result<NaiveDate> {
    match param(p, key) {
        None => Ok(default),
        Some(s) => When::parse(s).map(|w| w.date()).map_err(|e| error(format!("{key}: {e}"))),
    }
}

/// The instances of the visible calendars (or `sources`) between two days, from the cache; with `notes: true` the
/// vault's important notes too (README "The property convention"), each once.
fn range(p: Value) -> Res {
    let s = conf::settings(&p);
    let user = conf::user_zone(&p);
    let today = user.wall(Utc::now()).date();
    let from = day_param(&p, "from", today)?;
    let to = day_param(&p, "to", from + Duration::days(30))?;
    let srcs: Vec<Source> = match p["sources"].as_array() {
        Some(ids) => {
            let ids: Vec<&str> = ids.iter().filter_map(Value::as_str).collect();
            engine().store.sources().into_iter().filter(|x| ids.contains(&x.id.as_str())).collect()
        }
        None => visible(&s),
    };
    let r = Range::days(from, to, &user);
    let mut evs: Vec<Value> = instances(&srcs, &s, r, &user).into_iter().map(|x| json!(x)).collect();
    if p["notes"].as_bool() == Some(true) {
        let have: Vec<String> = evs.iter().filter_map(|e| e["uid"].as_str().map(str::to_string)).collect();
        evs.extend(note_events(r, &user).into_iter().filter(|n| !have.iter().any(|h| Some(h.as_str()) == n["uid"].as_str())));
    }
    Ok(json!({ "from": from.to_string(), "to": to.to_string(), "tz": user.name(), "events": evs }))
}

// ----- the vault's important notes, as a calendar of their own

/// Every Markdown note of the vault (hidden folders skipped).
fn md_files(root: &Path) -> Vec<(String, SystemTime)> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let Ok(meta) = e.metadata() else { continue };
            if meta.is_dir() {
                stack.push(e.path());
            } else if name.ends_with(".md") {
                if let (Ok(rel), Ok(m)) = (e.path().strip_prefix(root), meta.modified()) {
                    out.push((rel.to_string_lossy().replace('\\', "/"), m));
                }
            }
        }
    }
    out
}

fn note_events(r: Range, user: &Zone) -> Vec<Value> {
    let root = conf::vault_root();
    let e = engine();
    let mut cache = lock(&e.notes);
    let files = md_files(&root);
    let present: std::collections::HashSet<&str> = files.iter().map(|(f, _)| f.as_str()).collect(); // a vault's notes: not a scan each
    cache.retain(|k, _| present.contains(k.as_str()));
    let mut out = Vec::new();
    for (path, mtime) in files {
        let fresh = cache.get(&path).is_some_and(|(m, _)| *m == mtime);
        if !fresh {
            // the frontmatter is at the top: the first 16 KB say whether it is an important note
            let text = std::fs::File::open(root.join(&path)).ok().map(|f| {
                let mut buf = Vec::new();
                let _ = std::io::Read::read_to_end(&mut std::io::Read::take(f, 16 * 1024), &mut buf);
                String::from_utf8_lossy(&buf).into_owned()
            });
            let evs = text.filter(|t| atlas_text::frontmatter::yaml_head(t).is_some_and(|y| y.contains("important"))).map(|t| sync::dated_events(&path, &t).0).unwrap_or_default();
            cache.insert(path.clone(), (mtime, evs));
        }
        for ev in &cache[&path].1 {
            let (all_day, s, en, a, b) = match (ev.start, ev.end()) {
                (When::Day(d), w) => {
                    let e2 = w.date().max(d + Duration::days(1));
                    let mid = |x: NaiveDate| user.instant(x.and_hms_opt(0, 0, 0).unwrap_or_default());
                    (true, d.to_string(), e2.to_string(), mid(d), mid(e2))
                }
                (st, w) => {
                    let inst = |x: When| match x {
                        When::Utc(t) => t,
                        other => user.instant(other.naive()),
                    };
                    let (a, b) = (inst(st), inst(w));
                    (false, user.rfc3339(a), user.rfc3339(b), a, b)
                }
            };
            if a < r.to && b > r.from {
                out.push(json!({ "uid": ev.uid, "summary": ev.summary, "start": s, "end": en, "all_day": all_day, "location": ev.location, "source": path, "calendar": "notes", "calendar_name": "Notes", "writable": false, "recurring": false, "free": true }));
            }
        }
    }
    out
}

// ----- writing: create, update, delete, undo

fn remember(steps: Vec<Step>) -> u64 {
    let e = engine();
    let id = e.next_undo.fetch_add(1, Ordering::SeqCst);
    let mut u = lock(&e.undo);
    u.push((id, steps));
    if u.len() > 50 {
        u.remove(0);
    }
    id
}

/// The calendar to write to and its account's client: the call's `calendar` (an id, `account/Name`, a name, an
/// address), else the default (Settings), else the first writable one. The calendars are read first when the cache
/// has none yet.
fn target(p: &Value, s: &Value) -> atlas_plugin::Result<(Source, Remote)> {
    if engine().store.sources().iter().all(|x| x.kind != Kind::Caldav) && conf::filled(s) {
        let _ = pull_all(p, true);
    }
    let list: Vec<Source> = engine().store.sources().into_iter().filter(|x| x.kind == Kind::Caldav).collect();
    let id = match param(p, "calendar") {
        Some(want) => find_source(want, &list).map_err(error)?.map(|x| x.id).ok_or_else(|| error(format!("no calendar {want:?}; the calendars: {}", ids_of(&list))))?,
        None => write_id(s, &list).ok_or_else(|| error(if conf::filled(s) { "no calendar of the accounts takes new events (all read-only?)".to_string() } else { "no calendar account yet: add one in Settings → Calendar → Accounts".to_string() }))?,
    };
    let (src, c) = client_for(s, p, &id)?;
    if !src.writable {
        return Err(error(format!("{} ({}) is read-only", src.name, src.id)));
    }
    Ok((src, c))
}

fn ids_of(list: &[Source]) -> String {
    if list.is_empty() {
        return "none (is an account set up and reachable?)".into();
    }
    list.iter().map(|x| x.id.as_str()).collect::<Vec<_>>().join(", ")
}

fn change_of(p: &Value) -> Change {
    serde_json::from_value(p.clone()).unwrap_or_default()
}

/// The change with its organiser: the address of the calendar's account (a meeting it makes is sent from there).
fn change_for(p: &Value, s: &Value, src: &Source) -> Change {
    let mut ch = change_of(p);
    ch.organizer = src.account.as_deref().and_then(|a| conf::cards(s).into_iter().find(|c| c.name == a)).map(|c| c.account.user).filter(|u| u.contains('@'));
    ch
}

fn create(p: Value) -> Res {
    let s = conf::settings(&p);
    let user = conf::user_zone(&p);
    let (dst, c) = target(&p, &s)?;
    let cal = dir_of(&dst)?;
    let ch = change_for(&p, &s, &dst);
    let stamp = Utc::now();
    let uid = uid::derive(&format!("atlas-calendar:{}", stamp.timestamp_nanos_opt().unwrap_or_default()), ch.summary.as_deref().unwrap_or(""));
    let text = edit::create(&uid, &ch, &user, stamp).map_err(error)?;
    let href = cal.join(&uid::resource_name(&uid)).map_err(fail)?;
    let etag = c.write(&href, &text, None).map_err(fail)?;
    let src = dst.id.clone();
    let _ = engine().store.put(&src, href.as_str(), etag.as_deref(), &text);
    eprintln!("dav: created \"{}\" in {src}", ch.summary.as_deref().unwrap_or(""));
    let undo = remember(vec![Step { source: src.clone(), href: href.to_string(), before: None }]);
    changed();
    Ok(json!({ "uid": uid, "href": href.as_str(), "calendar": src, "undo": undo }))
}

/// The cached object, else the server's (a calendar not synced yet).
fn object(c: &Remote, source: &str, href: &str) -> atlas_plugin::Result<Object> {
    if let Some(o) = engine().store.object(source, href) {
        return Ok(o);
    }
    let u = Url::parse(href).map_err(fail)?;
    match c.fetch(&u).map_err(fail)? {
        Some((etag, ics)) => Ok(Object { source: source.into(), href: href.into(), etag, uid: String::new(), ics }),
        None => Err(error("the event is no longer on the server (refresh the calendar)")),
    }
}

/// Writes `text` over the object read (If-Match its ETag); the cache follows.
fn put_over(c: &Remote, o: &Object, text: Option<&str>) -> atlas_plugin::Result<()> {
    let u = Url::parse(&o.href).map_err(fail)?;
    match text {
        Some(t) => {
            let etag = c.write(&u, t, o.etag.as_deref().or(Some("*"))).map_err(fail)?;
            let _ = engine().store.put(&o.source, &o.href, etag.as_deref(), t);
        }
        None => {
            c.erase(&u, o.etag.as_deref()).map_err(fail)?;
            engine().store.delete(&o.source, &o.href);
        }
    }
    Ok(())
}

/// Runs an edit on the object; when the server had a newer version (412), once more on that one.
fn edit_object<F>(c: &Remote, source: &str, href: &str, mut f: F) -> atlas_plugin::Result<(Object, edit::Written)>
where
    F: FnMut(&str) -> Result<edit::Written, String>,
{
    let mut o = object(c, source, href)?;
    for attempt in 0..2 {
        let w = f(&o.ics).map_err(error)?;
        match put_over(c, &o, w.object.as_deref()) {
            Ok(()) => return Ok((o, w)),
            Err(e) if attempt == 0 && e.to_string().contains("412") => {
                let u = Url::parse(href).map_err(fail)?;
                let (etag, ics) = c.fetch(&u).map_err(fail)?.ok_or_else(|| error("the event was removed on the server meanwhile"))?;
                eprintln!("dav: {href} changed on the server meanwhile; the change is made on its new version");
                o = Object { etag, ics, ..o };
            }
            Err(e) => return Err(e),
        }
    }
    Err(error("the event keeps changing on the server; try again"))
}

fn scope_of(p: &Value) -> Scope {
    serde_json::from_value(p["scope"].clone()).unwrap_or_default()
}

fn update(p: Value) -> Res {
    let s = conf::settings(&p);
    let user = conf::user_zone(&p);
    let (source, href, uid) = (param(&p, "calendar").ok_or_else(|| error("calendar: required"))?, param(&p, "href").ok_or_else(|| error("href: required"))?, param(&p, "uid").ok_or_else(|| error("uid: required"))?);
    let (rid, scope) = (param(&p, "rid"), scope_of(&p));
    let now = Utc::now();
    let (src, c) = client_for(&s, &p, source)?;
    let ch = change_for(&p, &s, &src);
    // to another calendar, of this account or another: the whole event moves (written there first, then removed here)
    if let Some(dest) = param(&p, "move_to").filter(|d| *d != source) {
        let (to, c2) = client_for(&s, &p, dest)?;
        if !to.writable {
            return Err(error(format!("{} is read-only", to.name)));
        }
        let o = object(&c, source, href)?;
        let w = edit::update(&o.ics, uid, None, Scope::All, &ch, &user, now).map_err(error)?;
        let text = w.object.ok_or_else(|| error("nothing to move"))?;
        let nhref = dir_of(&to)?.join(&uid::resource_name(uid)).map_err(fail)?;
        let etag = c2.write(&nhref, &text, None).map_err(fail)?;
        let _ = engine().store.put(&to.id, nhref.as_str(), etag.as_deref(), &text);
        if let Err(e) = put_over(&c, &o, None) {
            // never two copies: the new one goes again when the old one cannot be removed
            let _ = c2.erase(&nhref, etag.as_deref());
            engine().store.delete(&to.id, nhref.as_str());
            return Err(e);
        }
        let undo = remember(vec![
            Step { source: to.id.clone(), href: nhref.to_string(), before: None },
            Step { source: source.into(), href: href.into(), before: Some(o.ics.clone()) },
        ]);
        eprintln!("dav: moved {uid} from {source} to {}", to.id);
        changed();
        return Ok(json!({ "undo": undo, "calendar": to.id, "href": nhref.as_str() }));
    }
    let (o, w) = edit_object(&c, source, href, |text| edit::update(text, uid, rid, scope, &ch, &user, now))?;
    let mut steps = vec![Step { source: source.into(), href: href.into(), before: Some(o.ics.clone()) }];
    if let Some((nuid, text)) = &w.split {
        let cal = dir_of(&src)?;
        let nhref = cal.join(&uid::resource_name(nuid)).map_err(fail)?;
        let etag = c.write(&nhref, text, None).map_err(fail)?;
        let _ = engine().store.put(source, nhref.as_str(), etag.as_deref(), text);
        steps.push(Step { source: source.into(), href: nhref.to_string(), before: None });
    }
    let undo = remember(steps);
    changed();
    Ok(json!({ "undo": undo }))
}

fn delete(p: Value) -> Res {
    let s = conf::settings(&p);
    let user = conf::user_zone(&p);
    let (source, href, uid) = (param(&p, "calendar").ok_or_else(|| error("calendar: required"))?, param(&p, "href").ok_or_else(|| error("href: required"))?, param(&p, "uid").ok_or_else(|| error("uid: required"))?);
    let (_, c) = client_for(&s, &p, source)?;
    let (rid, scope) = (param(&p, "rid"), scope_of(&p));
    let now = Utc::now();
    let (o, _) = edit_object(&c, source, href, |text| edit::delete(text, uid, rid, scope, &user, now).map(|object| edit::Written { object, split: None }))?;
    let undo = remember(vec![Step { source: source.into(), href: href.into(), before: Some(o.ics) }]);
    changed();
    Ok(json!({ "undo": undo }))
}

fn undo(p: Value) -> Res {
    let id = p["id"].as_u64().ok_or_else(|| error("id: required"))?;
    let steps = {
        let mut u = lock(&engine().undo);
        let i = u.iter().position(|(x, _)| *x == id).ok_or_else(|| error("nothing to undo (Atlas was restarted since?)"))?;
        u.remove(i).1
    };
    let s = conf::settings(&p);
    for st in steps.iter().rev() {
        let (_, c) = client_for(&s, &p, &st.source)?;
        let u = Url::parse(&st.href).map_err(fail)?;
        let now = c.fetch(&u).map_err(fail)?;
        match (&st.before, now) {
            (Some(text), Some((etag, _))) => {
                let e = c.write(&u, text, etag.as_deref().or(Some("*"))).map_err(fail)?;
                let _ = engine().store.put(&st.source, &st.href, e.as_deref(), text);
            }
            (Some(text), None) => {
                let e = c.write(&u, text, None).map_err(fail)?;
                let _ = engine().store.put(&st.source, &st.href, e.as_deref(), text);
            }
            (None, Some((etag, _))) => {
                c.erase(&u, etag.as_deref()).map_err(fail)?;
                engine().store.delete(&st.source, &st.href);
            }
            (None, None) => {}
        }
    }
    changed();
    Ok(json!({ "undone": steps.len() }))
}

// ----- quick add, search

fn quick_parse(p: Value) -> Res {
    let user = conf::user_zone(&p);
    let now = param(&p, "now").and_then(|n| chrono::NaiveDateTime::parse_from_str(n, "%Y-%m-%dT%H:%M").ok()).unwrap_or_else(|| user.wall(Utc::now()));
    Ok(json!(quick::parse(p["text"].as_str().unwrap_or_default(), now)))
}

/// Events whose title, place or description has every word: each once, at its next occurrence (else its last).
fn search(p: Value) -> Res {
    let s = conf::settings(&p);
    let user = conf::user_zone(&p);
    let q = p["q"].as_str().unwrap_or_default();
    let limit = p["limit"].as_u64().unwrap_or(50) as usize;
    let srcs = visible(&s);
    let ids: Vec<String> = srcs.iter().map(|x| x.id.clone()).collect();
    let now = Utc::now();
    let r = Range { from: now - Duration::days(3 * 365), to: now + Duration::days(2 * 365) };
    let mut out: Vec<Shown> = Vec::new();
    for o in engine().store.search(&ids, q, limit) {
        let Some(src) = srcs.iter().find(|x| x.id == o.source) else { continue };
        let all = shown(&o, src, &s, r, &user);
        let pick = all.iter().find(|x| x.i.to >= now.timestamp()).or(all.last());
        if let Some(x) = pick {
            out.push(x.clone());
        }
    }
    out.sort_by_key(|x| (x.i.to < now.timestamp(), (x.i.from - now.timestamp()).abs()));
    Ok(json!({ "events": out }))
}

fn test_subscription(p: Value) -> Res {
    let card = if p["record"].is_object() { &p["record"] } else { &p };
    let sub = Sub::of(card).ok_or_else(|| error("give the subscription a name and an address"))?;
    match crate::subs::fetch(&sub.url, None, None).map_err(error)? {
        crate::subs::Fetched::Body { text, .. } => {
            let objects = crate::subs::objects(&text).map_err(error)?;
            let name = ics::parse(&text).ok().and_then(|c| c.into_iter().next()).and_then(|c| c.text("X-WR-CALNAME"));
            Ok(json!({ "name": sub.name, "events": objects.len(), "calendar": name, "summary": format!("{}: {} event{} read{}", sub.name, objects.len(), if objects.len() == 1 { "" } else { "s" }, name.map(|n| format!(" from “{n}”")).unwrap_or_default()) }))
        }
        crate::subs::Fetched::Same => Ok(json!({ "name": sub.name, "summary": "unchanged" })),
    }
}

// ----- Email's side: invitations, contacts, the agenda

/// A stamp (an invitation's start) as the pane writes times: a day, or an instant in the user's zone.
fn said(st: recur::Stamp, user: &Zone) -> String {
    match st {
        recur::Stamp::Day(d) => d.to_string(),
        recur::Stamp::Floating(t) => user.rfc3339(user.instant(t)),
        recur::Stamp::At(t, _) => user.rfc3339(t),
    }
}

/// An invitation's first event, and its first occurrence in the user's zone.
struct Invitation {
    inv: ics::Invite,
    start: String,
    end: String,
    /// the first occurrence's instants (unix seconds)
    span: Option<(i64, i64)>,
}

fn first_invite(p: &Value) -> atlas_plugin::Result<Invitation> {
    let text = p["ics"].as_str().ok_or_else(|| error("ics: required (the invitation's calendar text)"))?;
    let inv = ics::split_invite(text).map_err(error)?.into_iter().next().ok_or_else(|| error("the invitation has no event"))?;
    let user = conf::user_zone(p);
    let cal = ics::parse(&inv.ics).map_err(error)?.remove(0);
    let zones: Vec<_> = cal.subs.iter().filter(|c| c.name == "VTIMEZONE").cloned().collect();
    let ev = cal.subs.iter().find(|c| c.name == "VEVENT" && c.prop("RECURRENCE-ID").is_none()).or(cal.subs.iter().find(|c| c.name == "VEVENT"));
    let st = ev.and_then(|e| e.prop("DTSTART")).and_then(|l| recur::stamp(l, &zones));
    // the first occurrence's span, from the expansion (its end from DTEND / DURATION / the default)
    let first = st.and_then(|s| {
        let at = match s {
            recur::Stamp::Day(d) => user.instant(d.and_hms_opt(0, 0, 0).unwrap_or_default()),
            recur::Stamp::Floating(t) => user.instant(t),
            recur::Stamp::At(t, _) => t,
        };
        recur::expand(&cal, Range { from: at - Duration::seconds(1), to: at + Duration::days(400) }, &user).into_iter().next()
    });
    let (start, end) = match (&first, st) {
        (Some(i), _) => (i.start.clone(), i.end.clone()),
        (None, Some(s)) => (said(s, &user), said(s, &user)),
        (None, None) => (String::new(), String::new()),
    };
    Ok(Invitation { inv, start, end, span: first.map(|i| (i.from, i.to)) })
}

fn caldav_copies(uid: &str) -> Vec<Object> {
    let srcs = engine().store.sources();
    engine().store.by_uid(uid).into_iter().filter(|o| srcs.iter().any(|s| s.id == o.source && s.kind == Kind::Caldav)).collect()
}

/// The copy of a meeting in an Exchange mailbox's calendar (the cache's, else asked of each Exchange calendar) and
/// that account's client.
fn exchange_copy(s: &Value, p: &Value, uid: &str) -> Option<(Object, Remote)> {
    let cards = conf::accounts(s, p);
    let exchange = |src: &Source| src.account.as_ref().is_some_and(|a| cards.iter().any(|c| &c.name == a && c.server == conf::Server::Exchange));
    let srcs: Vec<Source> = engine().store.sources().into_iter().filter(|x| exchange(x)).collect();
    if let Some(o) = engine().store.by_uid(uid).into_iter().find(|o| srcs.iter().any(|x| x.id == o.source)) {
        let (_, c) = client_for(s, p, &o.source).ok()?;
        return Some((o, c));
    }
    for src in &srcs {
        let Ok((_, c)) = client_for(s, p, &src.id) else { continue };
        let Ok(Some((u, etag, ics))) = c.find_uid(&Url::parse(&src.url).ok()?, uid) else { continue };
        return Some((Object { source: src.id.clone(), href: u.to_string(), etag, uid: uid.into(), ics }, c));
    }
    None
}

/// Files an invitation the user answered (README "Email"): the user's PARTSTAT on their ATTENDEE line, METHOD
/// dropped, the mail as X-ATLAS-SOURCE; a cancellation marks the copy cancelled.
fn import_invite(p: Value) -> Res {
    let s = conf::settings(&p);
    let Invitation { inv, start, end, .. } = first_invite(&p)?;
    let cancel = inv.method.as_deref() == Some("CANCEL");
    if !inv.is_entry() && !cancel {
        return Err(error(format!("this calendar file is a {} (an answer), not an invitation to file", inv.method.unwrap_or_default())));
    }
    // an Exchange mailbox's copy is a meeting Exchange keeps: answered there (the organiser told by Exchange), never
    // rewritten (a rewrite would cut it from the meeting's updates); a cancellation Exchange applies by itself
    if let Some((o, c)) = exchange_copy(&s, &p, &inv.uid) {
        let calendar = o.source.clone();
        let Some(partstat) = param(&p, "partstat").map(str::to_uppercase).filter(|_| !cancel) else {
            return Ok(json!({ "uid": inv.uid, "calendar": calendar, "status": "unchanged", "start": start, "end": end }));
        };
        let Remote::Ews(ex) = &c else { unreachable!("exchange_copy answers Exchange clients only") };
        ex.respond(&Url::parse(&o.href).map_err(fail)?, &partstat).map_err(fail)?;
        if let Some(card) = conf::accounts(&s, &p).into_iter().find(|x| engine().store.source(&calendar).and_then(|src| src.account).as_deref() == Some(x.name.as_str())) {
            let _ = pull_card(&card);
        }
        changed();
        eprintln!("dav: invitation {} \"{}\": answered {partstat} through Exchange in {calendar}", inv.uid, inv.summary);
        return Ok(json!({ "uid": inv.uid, "calendar": calendar, "status": "answered", "sent": true, "start": start, "end": end }));
    }
    // declined elsewhere: nothing to file
    if param(&p, "partstat").is_some_and(|x| x.eq_ignore_ascii_case("DECLINED")) && !cancel {
        return Ok(json!({ "uid": inv.uid, "calendar": null, "status": "unchanged", "start": start, "end": end }));
    }
    let text = invite::prepare(&inv.ics, param(&p, "attendee"), param(&p, "partstat"), param(&p, "source"), cancel).map_err(error)?;
    let (dst, c) = target(&p, &s)?;
    let cal = dir_of(&dst)?;
    // the copy already in any account's calendar is answered there; else the target's server is asked by UID
    let existing = match caldav_copies(&inv.uid).into_iter().next() {
        Some(o) => Some(o),
        None => c.find_uid(&cal, &inv.uid).map_err(fail)?.map(|(u, etag, ics)| Object { source: dst.id.clone(), href: u.to_string(), etag, uid: inv.uid.clone(), ics }),
    };
    let named = |o: &Object| engine().store.source(&o.source).map(|x| x.id).unwrap_or_else(|| o.source.clone());
    let status = match existing {
        Some(o) if invite::canonical(&o.ics) == invite::canonical(&text) => {
            return Ok(json!({ "uid": inv.uid, "calendar": named(&o), "status": "unchanged", "start": start, "end": end }));
        }
        Some(o) => {
            // the invitation as answered replaces the calendar's copy (If-Match: never over a newer edit)
            let (_, oc) = client_for(&s, &p, &o.source)?;
            put_over(&oc, &o, Some(&text))?;
            changed();
            return Ok(json!({ "uid": inv.uid, "calendar": named(&o), "status": "updated", "start": start, "end": end }));
        }
        None if cancel => "unchanged",
        None => {
            let href = cal.join(&uid::resource_name(&inv.uid)).map_err(fail)?;
            let etag = c.write(&href, &text, None).map_err(fail)?;
            let _ = engine().store.put(&dst.id, href.as_str(), etag.as_deref(), &text);
            changed();
            "added"
        }
    };
    eprintln!("dav: invitation {} \"{}\": {status} in {}", inv.uid, inv.summary, dst.id);
    Ok(json!({ "uid": inv.uid, "calendar": dst.id, "status": status, "start": start, "end": end }))
}

/// Answers, from the event's card, a meeting the user is invited to (`partstat`: ACCEPTED, TENTATIVE, DECLINED):
/// through Exchange, which tells the organiser and keeps the meeting linked to its later updates. A series is answered
/// as a whole (the card's href is the series'). CalDAV invitations are answered from their mail (Email).
fn respond(p: Value) -> Res {
    let s = conf::settings(&p);
    let need = |k: &str| param(&p, k).ok_or_else(|| error(format!("{k}: missing")));
    let (calendar, href, partstat) = (need("calendar")?, need("href")?, need("partstat")?.to_ascii_uppercase());
    let (src, c) = client_for(&s, &p, calendar)?;
    let Remote::Ews(ex) = &c else {
        return Err(error(format!("{}: a meeting here is answered from its invitation mail (only Exchange calendars answer from the card)", src.name)));
    };
    ex.respond(&Url::parse(href).map_err(fail)?, &partstat).map_err(fail)?;
    if let Some(card) = src.account.as_deref().and_then(|a| card_named(&s, &p, a).ok()) {
        let _ = pull_card(&card);
    }
    changed();
    eprintln!("dav: meeting {href} in {}: answered {partstat} through Exchange", src.id);
    Ok(json!({ "calendar": src.id, "partstat": partstat }))
}

/// Whether an invitation is in the calendar, the user's answer there, and what else overlaps it.
fn invite_status(p: Value) -> Res {
    let s = conf::settings(&p);
    if engine().store.sources().is_empty() && conf::filled(&s) {
        let _ = pull_all(&p, true);
    }
    let user = conf::user_zone(&p);
    let Invitation { inv, start, end, span } = first_invite(&p)?;
    let copies = caldav_copies(&inv.uid);
    let me = param(&p, "attendee")
        .map(str::to_string)
        .or_else(|| copies.first().and_then(|o| invite::me(&o.ics)))
        .or_else(|| conf::cards(&s).into_iter().map(|c| c.account.user).find(|u| u.contains('@')));
    let partstat = me.as_deref().and_then(|m| copies.first().and_then(|o| invite::partstat(&o.ics, m)).or_else(|| invite::partstat(&inv.ics, m)));
    let all_day = start.len() == 10;
    let conflicts: Vec<Value> = match span {
        Some((a, b)) => {
            let r = Range { from: DateTime::from_timestamp(a, 0).unwrap_or_default(), to: DateTime::from_timestamp(b.max(a + 1), 0).unwrap_or_default() };
            instances(&visible(&s), &s, r, &user)
                .into_iter()
                .filter(|x| x.i.uid != inv.uid && !x.i.free && x.i.all_day == all_day && x.i.status.as_deref() != Some("CANCELLED"))
                .map(|x| json!({ "summary": x.i.summary, "start": x.i.start, "end": x.i.end, "calendar": x.calendar_name }))
                .collect()
        }
        None => vec![],
    };
    Ok(json!({ "uid": inv.uid, "in_calendar": !copies.is_empty(), "partstat": partstat, "start": start, "end": end, "conflicts": conflicts }))
}

/// The address book (CardDAV), for Email's address autocomplete: [{ name, emails, org? }].
fn contacts(p: Value) -> Res {
    let s = conf::settings(&p);
    let e = engine();
    let stale = lock(&e.last_books).is_none_or(|t| t.elapsed().as_secs() > 6 * 3600);
    if stale && conf::filled(&s) {
        *lock(&e.last_books) = Some(Instant::now());
        // the first time it waits for the server; after that the cache answers and the refresh runs behind
        let empty = e.store.contact_count() == 0;
        let p2 = p.clone();
        let work = move || {
            let s = conf::settings(&p2);
            // address books are CalDAV servers' (CardDAV); an Exchange mailbox's contacts are not read yet
            for card in conf::accounts(&s, &p2).iter().filter(|c| c.filled() && c.server == conf::Server::Caldav) {
                if let Err(err) = Client::new(&card.account).and_then(|c| pull::books(&engine().store, &c)) {
                    eprintln!("dav: {}: contacts: {err}", card.name);
                }
            }
        };
        if empty {
            work();
        } else {
            std::thread::spawn(work);
        }
    }
    let limit = p["limit"].as_u64().unwrap_or(20) as usize;
    Ok(json!(e.store.contacts(p["q"].as_str().unwrap_or_default(), limit)))
}

/// Today's and the next days' instances, for Email's Home card ("today: 10:00 Group meeting").
fn agenda(p: Value) -> Res {
    let s = conf::settings(&p);
    fresh_enough(&p);
    let user = conf::user_zone(&p);
    let days = p["days"].as_i64().unwrap_or(1).clamp(1, 60);
    let today = user.wall(Utc::now()).date();
    let to = today + Duration::days(days - 1);
    let r = Range::days(today, to, &user);
    let evs: Vec<Value> = instances(&visible(&s), &s, r, &user)
        .into_iter()
        .map(|x| {
            let day = x.i.start.get(..10).unwrap_or_default().to_string();
            let time = if x.i.all_day { "all day".to_string() } else { x.i.start.get(11..16).unwrap_or_default().to_string() };
            let mut v = json!(x);
            v["day"] = json!(day);
            v["time"] = json!(time);
            v["line"] = json!(format!("{time} {}", x.i.summary));
            v
        })
        .collect();
    Ok(json!({ "from": today.to_string(), "to": to.to_string(), "tz": user.name(), "events": evs }))
}

// ----- the first tools

/// Every account's calendars from the cache (read first when stale): ids to pass as `calendar`, which take new
/// events, the default; the subscriptions; each account's state.
fn calendars(p: Value) -> Res {
    let s = conf::settings(&p);
    fresh_enough(&p);
    let list = engine().store.sources();
    let st = account_states(&s, &p);
    let accounts: Vec<Value> = conf::cards(&s)
        .iter()
        .map(|c| {
            let cals: Vec<Value> = list
                .iter()
                .filter(|x| x.account.as_deref() == Some(c.name.as_str()))
                .map(|x| json!({ "id": x.id, "name": x.name, "writable": x.writable, "color": color_of(&s, x), "error": x.error }))
                .collect();
            json!({ "account": c.name, "server": c.account.url, "status": st.get(&c.name), "calendars": cals })
        })
        .collect();
    let subs: Vec<Value> = list.iter().filter(|x| x.kind == Kind::Ics).map(|x| json!({ "id": x.id, "name": x.name, "url": x.url, "error": x.error })).collect();
    Ok(json!({ "accounts": accounts, "default": write_id(&s, &list), "subscriptions": subs }))
}

/// For Settings' "Default calendar for new events": every writable calendar of every account, `[{value, label}]`
/// (empty, never an error, while no account is reachable).
fn suggest_calendars(p: Value) -> Res {
    let s = conf::settings(&p);
    if !conf::filled(&s) {
        return Ok(json!([]));
    }
    fresh_enough(&p);
    Ok(Value::Array(
        engine().store.sources().iter().filter(|x| x.kind == Kind::Caldav && x.writable).map(|x| json!({ "value": x.id, "label": format!("{} · {}", x.account.as_deref().unwrap_or(""), x.name) })).collect(),
    ))
}

// ----- Settings: each account's state, a card's Test, the 0.1 settings moved

/// "2 min ago", "3 h ago", "yesterday".
fn ago(t: SystemTime) -> String {
    let s = t.elapsed().map(|d| d.as_secs()).unwrap_or(0);
    match s {
        0..=59 => "just now".into(),
        60..=3599 => format!("{} min ago", s / 60),
        3600..=86_399 => format!("{} h ago", s / 3600),
        _ => format!("{} days ago", s / 86_400),
    }
}

fn plural(n: usize, one: &str) -> String {
    format!("{n} {one}{}", if n == 1 { "" } else { "s" })
}

/// What each account's card says: busy, refused, not set up, or "3 calendars · synced 2 min ago".
fn account_states(s: &Value, p: &Value) -> HashMap<String, Status> {
    let st = lock(&engine().accounts).clone();
    conf::accounts(s, p)
        .into_iter()
        .map(|c| {
            let a = st.get(&c.name).cloned().unwrap_or_default();
            let n = engine().store.of_account(&c.name).len();
            let say = |state, text: String| Status { state, text };
            let status = if !c.filled() {
                say(State::Warn, "give the server address and the user name".into())
            } else if c.lacks_password() {
                say(State::Warn, "no app password yet".into())
            } else if a.busy {
                say(State::Busy, "syncing…".into())
            } else if let Some(e) = &a.error {
                say(State::Error, e.clone())
            } else if let Some(t) = a.synced {
                // calendars of this account subscribed for WebDAV Push (push.rs)
                let pushed = engine().store.of_account(&c.name).iter().filter(|x| engine().store.push_row(&x.id).is_some_and(|r| !r.topic.is_empty())).count();
                let instant = if pushed > 0 { format!(" · instant updates for {}", plural(pushed, "calendar")) } else { String::new() };
                say(State::Ok, format!("{} · synced {}{instant}", plural(n, "calendar"), ago(t)))
            } else {
                say(State::Warn, "not synced yet".into())
            };
            (c.name, status)
        })
        .collect()
}

fn account_status(p: Value) -> Res {
    let s = conf::settings(&p);
    Ok(json!(account_states(&s, &p)))
}

/// A card's Test (also an unsaved one: `record`, its password typed there or kept): what the server says.
fn test_account(p: Value) -> Res {
    let record = if p["record"].is_object() { &p["record"] } else { &p };
    let Some(card) = conf::card_of(record, &p) else {
        return Ok(json!({ "ok": false, "text": "give the server address and the user name" }));
    };
    if card.lacks_password() {
        return Ok(json!({ "ok": false, "text": "no app password yet" }));
    }
    let answer = match Remote::of(&card).and_then(|c| c.discover()) {
        Ok(cals) => {
            let evs: Vec<String> = cals.iter().filter(|c| c.takes_events()).map(|c| if c.writable { c.name.clone() } else { format!("{} (read-only)", c.name) }).collect();
            if evs.is_empty() {
                json!({ "ok": false, "text": "connected, but the account has no calendar that takes events" })
            } else {
                json!({ "ok": true, "text": format!("connected: {}: {}", plural(evs.len(), "calendar"), evs.join(", ")) })
            }
        }
        Err(e) => json!({ "ok": false, "text": e.to_string() }),
    };
    eprintln!("dav: test {}: {}", card.name, answer["text"].as_str().unwrap_or_default());
    Ok(answer)
}

/// The 0.1 settings (one account: url, user, the `password` secret) as a card: its secret copied to the card's name
/// (the old one is kept), and the values the page saves (`accounts`, the old keys taken out). Nothing when there is
/// nothing to move.
fn migrate(p: Value) -> Res {
    let s = conf::settings(&p);
    let Some(card) = conf::legacy_card(&s) else { return Ok(json!({})) };
    let name = conf::text(&card, "name");
    let key = conf::password_key(&name);
    if conf::secret(&p, &key).is_none() {
        if let (Some(pw), true) = (conf::secret(&p, "password"), conf::serving()) {
            atlas_plugin::Atlas::new().set_secret(&key, &pw).map_err(|e| error(format!("the app password could not be moved to the card {name}: {e}")))?;
        }
    }
    eprintln!("dav: the 0.1 settings become the account card {name}");
    Ok(json!({ "values": { "accounts": [card], "url": null, "user": null }, "name": name }))
}

/// Events between two days, every recurrence expanded, in the user's zone: every visible calendar and subscription,
/// or the one `calendar` names. (The core's calendar view reads this: `from: plugin:dav/events`.)
fn events(p: Value) -> Res {
    let s = conf::settings(&p);
    let _ = pull_all(&p, false);
    let user = conf::user_zone(&p);
    let today = user.wall(Utc::now()).date();
    let from = day_param(&p, "from", today)?;
    let to = day_param(&p, "to", from + Duration::days(30))?;
    if to < from {
        return Err(error("to: is before from:"));
    }
    let mut srcs = visible(&s);
    if let Some(want) = param(&p, "calendar") {
        let all = engine().store.sources();
        let one = find_source(want, &all).map_err(error)?.ok_or_else(|| error(format!("no calendar {want:?}; the calendars: {}", ids_of(&all))))?;
        srcs = vec![one];
    }
    let evs = instances(&srcs, &s, Range::days(from, to, &user), &user);
    Ok(json!({ "from": from.to_string(), "to": to.to_string(), "tz": user.name(), "events": evs }))
}

fn add_event(p: Value) -> Res {
    let title = param(&p, "title").ok_or_else(|| error("title: required"))?.to_string();
    let raw_start = param(&p, "start").or(param(&p, "date")).ok_or_else(|| error("start: required (2026-11-03, or 2026-11-03T14:00)"))?;
    let mut start = When::parse(raw_start).map_err(|e| error(format!("start: {e}")))?;
    if p["all_day"].as_bool() == Some(true) {
        start = When::Day(start.date());
    }
    let end = match param(&p, "end") {
        None => None,
        Some(e) => {
            let e = When::parse(e).map_err(|x| error(format!("end: {x}")))?;
            let e = match (start, e) {
                // an all-day event's end is its last day (inclusive): DTEND is the day after
                (When::Day(_), w) => When::Day(w.date() + Duration::days(1)),
                (_, w) => w,
            };
            if e.naive() <= start.naive() {
                return Err(error("end: must be after start"));
            }
            Some(e)
        }
    };
    let source = param(&p, "source").map(str::to_string);
    let key = p["key"].as_str().unwrap_or_default();
    // an explicit UID updates that event; else one from the source (+ key), so the same date added again is one event
    let uid = match (param(&p, "uid"), &source) {
        (Some(u), _) => u.to_string(),
        (None, Some(s)) => uid::derive(s, key),
        (None, None) => uid::derive(&format!("agent:{}", title.to_lowercase()), &start.date().to_string()),
    };
    let event = Event { uid: uid.clone(), summary: title, start, end, description: p["description"].as_str().map(str::to_string), location: p["location"].as_str().map(str::to_string), source: source.clone() };
    let s = conf::settings(&p);
    let (dst, c) = target(&p, &s)?;
    let cal = dir_of(&dst)?;
    let text = event.to_ics(Utc::now());
    let (outcome, href) = c.upsert(&cal, &uid, &text, Some(&event.hash()), Existing::Update).map_err(fail)?;
    let _ = engine().store.put(&dst.id, href.as_str(), None, &text);
    changed();
    eprintln!("dav: add_event: {outcome:?} \"{}\" ({}) uid {uid} in {}", event.summary, event.start.human(), dst.id);
    Ok(json!({ "uid": uid, "outcome": outcome, "href": href.as_str(), "calendar": dst.id, "start": event.start.human(), "end": event.end().human(), "all_day": event.start.is_day() }))
}

fn remove_event(p: Value) -> Res {
    let uid = param(&p, "uid").ok_or_else(|| error("uid: required (from dav_events or dav_add_event)"))?.to_string();
    let s = conf::settings(&p);
    // the calendar named, else the one the cache holds it in, else the default
    let (dst, c) = match (param(&p, "calendar"), caldav_copies(&uid).first()) {
        (None, Some(o)) => client_for(&s, &p, &o.source)?,
        _ => target(&p, &s)?,
    };
    let removed = c.remove(&dir_of(&dst)?, &uid).map_err(fail)?;
    for o in engine().store.by_uid(&uid).into_iter().filter(|o| o.source == dst.id) {
        engine().store.delete(&o.source, &o.href);
    }
    changed();
    eprintln!("dav: remove_event {uid} in {}: {}", dst.id, if removed { "removed" } else { "not in the calendar" });
    Ok(json!({ "uid": uid, "removed": removed, "calendar": dst.id }))
}

/// The vault's important notes into the default calendar (opt-in: `push_notes`; never mail, never .ics files —
/// invitations come from Email's `import_invite`). With `paths` (Atlas, after files changed: `on = "fs"`) only those,
/// and only while it is on and an account is filled in (an empty list: every note, on the same terms); without, every
/// note in the folders.
fn sync_method(p: Value) -> Res {
    let s = conf::settings(&p);
    let folders: Vec<String> = s["folders"].as_array().map(|a| a.iter().filter_map(|f| f.as_str().map(str::to_string)).collect()).unwrap_or_default();
    let scope = SyncScope { folders, past_days: s["past_days"].as_i64().unwrap_or(30) };
    // `paths` given: Atlas after files changed; an empty list there means anything may have changed (every note read)
    let hooked = p["paths"].as_array();
    let only: Option<Vec<String>> = hooked.filter(|a| !a.is_empty()).map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect());
    if hooked.is_some() {
        // after every change in the vault: quiet and cheap unless it is on and a note in the folders changed
        if s["push_notes"] != json!(true) {
            return Ok(json!({ "skipped": "important notes are not put on the server (Settings → Calendar → Sync)" }));
        }
        if only.as_ref().is_some_and(|paths| !paths.iter().any(|x| x.ends_with(".md") && sync::in_scope(x, &scope.folders))) {
            return Ok(json!({ "skipped": "no changed note in the folders" }));
        }
        if !conf::filled(&s) {
            return Ok(json!({ "skipped": "no account set up" }));
        }
    }
    let root = conf::vault_root();
    let scan = sync::scan(&root, &scope, only.as_deref(), chrono::Local::now().date_naive());
    for k in &scan.problems {
        eprintln!("dav: {}: {}", k.path, k.why);
    }
    if scan.found.is_empty() {
        let summary = sync::summary(&[], scan.skipped.len(), scan.problems.len());
        return Ok(json!({ "summary": summary, "events": [], "skipped": scan.skipped, "problems": scan.problems }));
    }
    let (dst, c) = target(&p, &s)?;
    let serving = conf::serving();
    let told = |r: &sync::Report| {
        if serving {
            atlas_plugin::event("added", json!({ "title": r.title, "start": r.start, "path": r.path, "outcome": r.outcome }));
        }
    };
    let reports = sync::push(&c, &dir_of(&dst)?, &scan.found, &told);
    let summary = sync::summary(&reports, scan.skipped.len(), scan.problems.len());
    eprintln!("dav: sync{} into {}: {summary}", if only.is_some() { " (changed files)" } else { "" }, dst.id);
    if reports.iter().any(|r| r.outcome == "added" || r.outcome == "updated") {
        let _ = pull::calendar(&engine().store, &c, &Source { ctag: None, ..dst.clone() });
        changed();
    }
    Ok(json!({ "summary": summary, "calendar": dst.id, "events": reports, "skipped": scan.skipped, "problems": scan.problems }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cal(account: &str, path: &str, name: &str, writable: bool) -> Source {
        let url = format!("https://{account}.example/dav/{path}/");
        Source { id: crate::store::calendar_id(account, &url, &[&url]), kind: Kind::Caldav, account: Some(account.into()), url, name: name.into(), color: None, writable, ctag: None, token: None, synced: 0, error: None }
    }

    #[test]
    fn a_meeting_in_an_exchange_calendar_offers_its_guest_an_answer_never_its_organiser() {
        let s = json!({ "accounts": [{ "name": "Uni", "server": "exchange", "user": "Me@Uni.example" }, { "name": "home", "url": "https://home.example/dav/", "user": "me" }] });
        let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:m1\r\nSUMMARY:Group meeting\r\nDTSTART:20261104T140000Z\r\nDTEND:20261104T150000Z\r\nORGANIZER;CN=Dee:mailto:dee@uni.example\r\nATTENDEE;CN=Dee:mailto:dee@uni.example\r\nATTENDEE;CN=Me;PARTSTAT=NEEDS-ACTION:mailto:me@uni.example\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let range = Range { from: DateTime::from_timestamp(1_793_000_000, 0).unwrap(), to: DateTime::from_timestamp(1_795_000_000, 0).unwrap() };
        let object = |source: &Source| Object { source: source.id.clone(), href: format!("{}m1.ics", source.url), etag: None, uid: "m1".into(), ics: ics.into() };
        let zone = conf::user_zone(&json!({ "tz": "UTC" }));
        let answers = |src: &Source| shown(&object(src), src, &s, range, &zone).into_iter().map(|x| x.answer).collect::<Vec<_>>();
        assert_eq!(answers(&cal("Uni", "calendar", "Calendar", true)), vec![Some("NEEDS-ACTION".to_string())]);
        assert_eq!(answers(&cal("home", "personal", "Personal", true)), vec![None], "a CalDAV meeting is answered from its mail");
        let mut organised = s.clone();
        organised["accounts"][0]["user"] = json!("dee@uni.example");
        let src = cal("Uni", "calendar", "Calendar", true);
        assert_eq!(shown(&object(&src), &src, &organised, range, &zone)[0].answer, None, "the organiser does not answer");
        // Exchange's own shape: METHOD:PUBLISH, folded ATTENDEE lines, PARTSTAT before CN, the domain in capitals
        let exchange = "BEGIN:VCALENDAR\r\nMETHOD:PUBLISH\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:m2\r\nSUMMARY:Weekly\r\nDTSTART:20261104T140000Z\r\nDTEND:20261104T150000Z\r\nORGANIZER;CN=Dée Ö:mailto:Dee@UNI.example\r\nATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Dée Ö:mailto:Dee@UNI.example\r\nATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Mé Rosa\r\n do:mailto:Me@UNI.example\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let o = Object { source: src.id.clone(), href: format!("{}m2.ics", src.url), etag: None, uid: "m2".into(), ics: exchange.into() };
        assert_eq!(shown(&o, &src, &s, range, &zone)[0].answer.as_deref(), Some("NEEDS-ACTION"));
    }

    #[test]
    fn a_calendar_is_named_by_id_address_account_and_name_or_a_unique_name() {
        let list = vec![cal("home", "personal", "Personal", true), cal("work", "personal", "Personal", true), cal("work", "team", "Team", false)];
        let id = |w: &str| find_source(w, &list).unwrap().map(|x| x.id);
        assert_eq!(id("work/personal"), Some("work/personal".into()));
        assert_eq!(id("https://home.example/dav/personal"), Some("home/personal".into()), "an address, with or without its /");
        assert_eq!(id("team"), Some("work/team".into()), "a name only one calendar has");
        assert_eq!(id("work/Personal"), Some("work/personal".into()));
        assert_eq!(id("nope"), None);
        let both = find_source("personal", &list).unwrap_err();
        assert!(both.contains("home/personal") && both.contains("work/personal"), "{both}");
    }

    #[test]
    fn new_events_go_to_the_default_else_the_first_accounts_first_writable_calendar() {
        let list = vec![cal("home", "personal", "Personal", true), cal("work", "personal", "Personal", true), cal("work", "team", "Team", false)];
        let s = |default: &str| json!({ "calendar": default, "accounts": [{ "name": "work" }, { "name": "home" }] });
        assert_eq!(write_id(&s("home/personal"), &list).as_deref(), Some("home/personal"));
        assert_eq!(write_id(&s(""), &list).as_deref(), Some("work/personal"), "the first card is the main one");
        assert_eq!(write_id(&s("work/team"), &list).as_deref(), Some("work/personal"), "a read-only default is passed over");
    }
}
