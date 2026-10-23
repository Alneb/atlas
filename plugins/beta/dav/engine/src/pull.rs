//! Filling the cache from the servers (DESIGN-calendar §3): CalDAV calendars by getctag → sync-collection → ETag
//! listing, changed objects fetched with calendar-multiget; ICS subscriptions by a conditional GET when due; the
//! address books whole. Each step narrates itself in the plugin's log.
use crate::caldav::{Client, DavError};
use crate::conf::Sub;
use crate::store::{calendar_id, Kind, Source, Store};
use crate::subs::{self, Fetched};
use chrono::Utc;
use std::collections::HashMap;
use url::Url;

/// What a pull did: whether anything shown changed, and what failed (per calendar, worded for the user).
#[derive(Debug, Default)]
pub struct Pulled {
    pub changed: bool,
    pub errors: Vec<String>,
}

impl Pulled {
    fn add(&mut self, other: Pulled) {
        self.changed |= other.changed;
        self.errors.extend(other.errors);
    }
}

/// One account's calendars listed again, then each brought up to date. Only that account's sources are touched.
pub fn caldav(store: &Store, client: &Client, account: &str) -> Result<Pulled, DavError> {
    let cals = client.discover()?;
    let mut out = Pulled::default();
    let known = store.of_account(account);
    let urls: Vec<&str> = cals.iter().filter(|c| c.takes_events()).map(|c| c.url.as_str()).collect();
    let ids: Vec<String> = urls.iter().map(|u| calendar_id(account, u, &urls)).collect();
    for (c, id) in cals.iter().filter(|c| c.takes_events()).zip(ids.iter().cloned()) {
        let old = known.iter().find(|s| s.id == id);
        let src = Source {
            id,
            kind: Kind::Caldav,
            account: Some(account.to_string()),
            url: c.url.clone(),
            name: c.name.clone(),
            color: c.color.clone().map(|x| x.chars().take(7).collect()), // #RRGGBBAA → #RRGGBB
            writable: c.writable,
            ctag: old.and_then(|o| o.ctag.clone()),
            token: old.and_then(|o| o.token.clone()),
            synced: old.map_or(0, |o| o.synced),
            error: None,
        };
        if old.is_none_or(|o| o.name != src.name || o.color != src.color || o.writable != src.writable) {
            out.changed = true;
        }
        let _ = store.put_source(&src);
        match calendar(store, client, &src) {
            Ok(ch) => {
                out.changed |= ch;
                store.set_error(&src.id, None);
            }
            Err(e @ DavError::Auth { .. }) | Err(e @ DavError::Network { .. }) => return Err(e),
            Err(e) => {
                eprintln!("dav: {}: {e}", src.id);
                store.set_error(&src.id, Some(&e.to_string()));
                out.errors.push(format!("{}: {e}", src.id));
            }
        }
    }
    for gone in known.iter().filter(|s| !ids.contains(&s.id)) {
        eprintln!("dav: the calendar {} is no longer on the server; its cache goes", gone.id);
        store.remove_source(&gone.id);
        out.changed = true;
    }
    Ok(out)
}

/// One calendar: nothing when its ctag did not move; else what changed since its sync-token, or by ETags.
pub fn calendar(store: &Store, client: &Client, src: &Source) -> Result<bool, DavError> {
    let url = Url::parse(&src.url).map_err(|e| DavError::Setup(e.to_string()))?;
    let (ctag, token) = client.state(&url).unwrap_or((None, None));
    if src.synced > 0 && ctag.is_some() && ctag == src.ctag {
        return Ok(false);
    }
    let now = Utc::now().timestamp();
    if let (Some(old), true) = (&src.token, src.synced > 0) {
        match client.changes(&url, old) {
            Ok(d) => {
                let mut changed = !d.removed.is_empty();
                for h in &d.removed {
                    store.delete(&src.id, h);
                }
                let have: HashMap<String, Option<String>> = store.etags(&src.id).into_iter().collect();
                let want: Vec<String> = d.changed.iter().filter(|(h, e)| e.is_none() || have.get(h) != Some(e)).map(|(h, _)| h.clone()).collect();
                changed |= fetch(store, client, &url, &src.id, &want)?;
                store.set_state(&src.id, ctag.as_deref(), d.token.as_deref().or(token.as_deref()), now, None);
                eprintln!("dav: {}: {} changed, {} removed (sync-token)", src.id, want.len(), d.removed.len());
                return Ok(changed);
            }
            Err(e) => eprintln!("dav: {}: the sync-token was not taken ({e}); listing the calendar", src.id),
        }
    }
    let listed = client.listing(&url)?;
    let have: HashMap<String, Option<String>> = store.etags(&src.id).into_iter().collect();
    let want: Vec<String> = listed.iter().filter(|(h, e)| e.is_none() || have.get(h) != Some(e)).map(|(h, _)| h.clone()).collect();
    let gone: Vec<&String> = have.keys().filter(|h| !listed.iter().any(|(l, _)| l == *h)).collect();
    for h in &gone {
        store.delete(&src.id, h);
    }
    let changed = fetch(store, client, &url, &src.id, &want)? || !gone.is_empty();
    store.set_state(&src.id, ctag.as_deref(), token.as_deref(), now, None);
    eprintln!("dav: {}: {} listed, {} fetched, {} gone", src.id, listed.len(), want.len(), gone.len());
    Ok(changed)
}

fn fetch(store: &Store, client: &Client, url: &Url, id: &str, hrefs: &[String]) -> Result<bool, DavError> {
    if hrefs.is_empty() {
        return Ok(false);
    }
    for (h, etag, text) in client.multiget(url, hrefs, false)? {
        if let Err(e) = store.put(id, &h, etag.as_deref(), &text) {
            eprintln!("dav: {h}: left out of the cache ({e})");
        }
    }
    Ok(true)
}

/// The subscriptions of the settings: due ones (or all, `force`) fetched; ones taken out of Settings forgotten.
pub fn subscriptions(store: &Store, subs: &[Sub], force: bool) -> Pulled {
    let mut out = Pulled::default();
    let now = Utc::now().timestamp();
    for gone in store.sources().iter().filter(|s| s.kind == Kind::Ics && !subs.iter().any(|x| x.id() == s.id)) {
        store.remove_source(&gone.id);
        out.changed = true;
    }
    for sub in subs {
        let old = store.source(&sub.id());
        let src = Source {
            id: sub.id(),
            kind: Kind::Ics,
            account: None,
            url: sub.url.clone(),
            name: sub.name.clone(),
            color: sub.color.clone(),
            writable: false,
            ctag: None,
            token: None,
            synced: 0,
            error: None,
        };
        let moved = old.as_ref().is_some_and(|o| o.url != sub.url);
        let _ = store.put_source(&src);
        let last = if moved { 0 } else { old.as_ref().map_or(0, |o| o.synced) };
        if !force && last > 0 && now - last < sub.refresh * 60 {
            continue;
        }
        let (etag, modified) = if moved { (None, None) } else { (old.as_ref().and_then(|o| o.ctag.clone()), old.as_ref().and_then(|o| o.token.clone())) };
        out.add(subscription(store, &src, etag.as_deref(), modified.as_deref()));
    }
    out
}

fn subscription(store: &Store, src: &Source, etag: Option<&str>, modified: Option<&str>) -> Pulled {
    let now = Utc::now().timestamp();
    let mut out = Pulled::default();
    match subs::fetch(&src.url, etag, modified).and_then(|f| match f {
        Fetched::Same => Ok(None),
        Fetched::Body { text, etag, modified } => subs::objects(&text).map(|o| Some((o, etag, modified))),
    }) {
        Ok(None) => store.set_state(&src.id, etag, modified, now, None),
        Ok(Some((objects, etag, modified))) => {
            let n = store.replace(&src.id, &objects).unwrap_or(0);
            store.set_state(&src.id, etag.as_deref(), modified.as_deref(), now, None);
            eprintln!("dav: subscription {}: {n} event(s)", src.name);
            out.changed = true;
        }
        Err(e) => {
            eprintln!("dav: subscription {}: {e}", src.name);
            store.set_state(&src.id, etag, modified, 0, Some(&e));
            out.errors.push(format!("{}: {e}", src.name));
        }
    }
    out
}

/// One account's address books, whole (they are small and change rarely).
pub fn books(store: &Store, client: &Client) -> Result<usize, DavError> {
    let mut n = 0;
    for b in client.books()? {
        let cards = client.cards(&b.url)?;
        n += cards.len();
        if let Err(e) = store.put_contacts(b.url.as_str(), &cards) {
            eprintln!("dav: {}: {e}", b.name);
        }
    }
    eprintln!("dav: {n} contact(s) from {}", client.base());
    Ok(n)
}
