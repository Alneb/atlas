//! A vault's notices on every device (docs/design/DESIGN-vaults-together.md §3): a notice raised on one core — its
//! job ran there, as `background` says — is shown on the person's other devices too, and taken away on all of them
//! when it is withdrawn on one. The vault's mirror server is the meeting place: a device hands it the notices and
//! withdrawals it raised and takes back everyone else's, with the presence report it already makes once a minute
//! (mirror_guard.rs `report_now_and_then`); the server's own notices (its feeds, its schedules) go straight into its
//! ring. Kept in memory only, as the devices table is: a notice is news, not vault data.
//!
//! Never twice: a notice taken from the relay is published on the local bus marked as relayed, so the hook that hands
//! a core's notices to the relay ([`raised`]) lets it pass; a device never gets its own back (`origin`).
use crate::api::Notice;
use crate::api::Event;
use crate::events::EventBus;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Condvar, LazyLock, Mutex};
use std::time::Duration;

/// What travels: a notice to show, or the id/subject whose notices are no longer news.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Item {
    Show(Notice),
    Withdraw(String),
}

/// An item as the server keeps it: its place in the vault's ring and the device that raised it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Relayed {
    pub seq: u64,
    pub origin: String,
    pub item: Item,
}

/// `POST /api/lease/notices`: what a device raised since its last exchange, and the last item it has.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Exchange {
    pub holder: String,
    /// The last item it has; None: it never asked (it starts at the end, no backlog of old news).
    #[serde(default)]
    pub since: Option<u64>,
    #[serde(default)]
    pub out: Vec<Item>,
}

/// The server's answer: the others' items after `since`, and the ring's last seq (the device's next `since`).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Answer {
    pub last: u64,
    pub items: Vec<Relayed>,
}

/// How many items a vault's ring keeps: a day of a busy vault; a device away longer gets the newest.
const RING: usize = 200;
/// How many a device keeps to send while its server does not answer.
const OUTBOX: usize = 100;

#[derive(Default)]
struct Vault {
    /// This core is the vault's server: what it raises goes into the ring, not an outbox.
    serving: bool,
    ring: VecDeque<Relayed>,
    next: u64,
    outbox: VecDeque<Item>,
    /// The last item taken from the server (a device's `since`); None before its first exchange.
    seen: Option<u64>,
    /// Notices published here from the relay, by their key, so [`raised`] does not send them on.
    relayed: HashSet<String>,
    bus: Option<EventBus>,
}

static VAULTS: LazyLock<Mutex<HashMap<PathBuf, Vault>>> = LazyLock::new(Default::default);
/// Rung when a device's outbox gets an item: the exchange goes at once, not at its next turn ([`wait`]).
static WAKE: LazyLock<(Mutex<u64>, Condvar)> = LazyLock::new(|| (Mutex::new(0), Condvar::new()));

/// A device's exchange loop waits here: until `timeout`, or sooner when a notice of this device waits to be sent.
pub fn wait(timeout: Duration) {
    let (lock, ring) = &*WAKE;
    let rung = *lock.lock().unwrap_or_else(|e| e.into_inner());
    let _ = ring.wait_timeout_while(lock.lock().unwrap_or_else(|e| e.into_inner()), timeout, |n| *n == rung);
}

fn ring_wake() {
    let (lock, ring) = &*WAKE;
    *lock.lock().unwrap_or_else(|e| e.into_inner()) += 1;
    ring.notify_all();
}

fn with<T>(root: &Path, f: impl FnOnce(&mut Vault) -> T) -> T {
    let mut all = VAULTS.lock().unwrap_or_else(|e| e.into_inner());
    f(all.entry(root.to_path_buf()).or_default())
}

/// A notice's key for "seen here already": its id, else its source, title and body.
fn key(n: &Notice) -> String {
    n.id.clone().unwrap_or_else(|| format!("{}\u{1f}{}\u{1f}{}", n.source.as_deref().unwrap_or(""), n.title, n.body.as_deref().unwrap_or("")))
}

/// An item's key for "came from the relay": a withdrawal's apart from a notice's of the same id.
fn item_key(item: &Item) -> String {
    match item {
        Item::Show(n) => key(n),
        Item::Withdraw(id) => format!("withdraw\u{1f}{id}"),
    }
}

/// The vault's bus, where notices taken from the relay are published (set where its notices are delivered).
pub fn attach(root: &Path, bus: EventBus) {
    with(root, |v| v.bus = Some(bus));
}

/// This core serves `root` to devices mirroring it: its own notices go into the ring.
pub fn serve(root: &Path) {
    with(root, |v| v.serving = true);
}

/// A notice or a withdrawal this core raised (notify.rs hears every one): into the ring when this core is the
/// vault's server, else into the outbox for the next exchange — unless it came from the relay.
pub fn raised(root: &Path, item: Item) {
    with(root, |v| {
        if v.relayed.remove(&item_key(&item)) {
            return;
        }
        if v.serving {
            push(v, "server", item);
        } else {
            v.outbox.push_back(item);
            while v.outbox.len() > OUTBOX {
                v.outbox.pop_front();
            }
            ring_wake();
        }
    });
}

fn push(v: &mut Vault, origin: &str, item: Item) {
    v.next += 1;
    v.ring.push_back(Relayed { seq: v.next, origin: origin.to_string(), item });
    while v.ring.len() > RING {
        v.ring.pop_front();
    }
}

/// The server's side of an exchange: the device's items into the ring, everyone else's after its `since` back.
pub fn exchange(root: &Path, q: Exchange) -> Answer {
    with(root, |v| {
        for item in q.out {
            push(v, &q.holder, item);
        }
        // a device that has never asked starts at the end: no backlog of old news rings on a new device
        let since = q.since.unwrap_or(v.next);
        let items = v.ring.iter().filter(|r| r.seq > since && r.origin != q.holder).cloned().collect();
        Answer { last: v.next, items }
    })
}

/// A device's side, before an exchange: what to send and its `since`. The outbox is emptied; [`failed`] puts it back.
pub fn outgoing(root: &Path) -> (Vec<Item>, Option<u64>) {
    with(root, |v| (v.outbox.drain(..).collect(), v.seen))
}

/// The exchange did not reach the server: its items wait for the next one.
pub fn failed(root: &Path, out: Vec<Item>) {
    with(root, |v| {
        for item in out.into_iter().rev() {
            v.outbox.push_front(item);
        }
        while v.outbox.len() > OUTBOX {
            v.outbox.pop_back();
        }
    });
}

/// A device's side, after an exchange: the others' notices shown and withdrawals made here, through the vault's bus.
pub fn received(root: &Path, a: Answer) {
    let bus = with(root, |v| {
        v.seen = Some(a.last);
        for r in &a.items {
            v.relayed.insert(item_key(&r.item));
        }
        v.bus.clone()
    });
    let Some(bus) = bus else { return };
    for r in a.items {
        match r.item {
            Item::Show(n) => bus.publish(Event::Notify(n)),
            Item::Withdraw(id) => bus.publish(Event::Withdraw { id }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notice(id: &str) -> Notice {
        Notice { title: format!("t {id}"), id: Some(id.into()), ..Default::default() }
    }

    #[test]
    fn a_notice_raised_on_one_device_reaches_the_others_once_and_its_withdrawal_too() {
        let (server, a, b) = (Path::new("/relay-test/server"), Path::new("/relay-test/a"), Path::new("/relay-test/b"));
        serve(server);
        // both devices have asked once (a new device starts at the end, no old news)
        for (d, root) in [("a", a), ("b", b)] {
            let (out, since) = outgoing(root);
            received(root, exchange(server, Exchange { holder: d.into(), since, out }));
        }
        raised(a, Item::Show(notice("n1")));
        let (out, since) = outgoing(a);
        let to_a = exchange(server, Exchange { holder: "a".into(), since, out });
        assert!(to_a.items.is_empty(), "a device never gets its own back");
        received(a, to_a);
        let (out, since) = outgoing(b);
        let to_b = exchange(server, Exchange { holder: "b".into(), since, out });
        assert_eq!(to_b.items.len(), 1);
        assert_eq!(to_b.items[0].item, Item::Show(notice("n1")));
        received(b, to_b);
        // b's core hears the relayed notice as one of its own (notify.rs): not sent on again
        raised(b, Item::Show(notice("n1")));
        assert!(outgoing(b).0.is_empty(), "a relayed notice is not relayed back");
        // dismissed on b: withdrawn on a
        raised(b, Item::Withdraw("n1".into()));
        let (out, since) = outgoing(b);
        received(b, exchange(server, Exchange { holder: "b".into(), since, out }));
        let (out, since) = outgoing(a);
        let to_a = exchange(server, Exchange { holder: "a".into(), since, out });
        assert_eq!(to_a.items.iter().map(|r| r.item.clone()).collect::<Vec<_>>(), vec![Item::Withdraw("n1".into())]);
    }

    #[test]
    fn a_relayed_withdrawal_is_not_sent_back() {
        let (server, a, b) = (Path::new("/relay-test3/server"), Path::new("/relay-test3/a"), Path::new("/relay-test3/b"));
        serve(server);
        for (d, root) in [("a", a), ("b", b)] {
            received(root, exchange(server, Exchange { holder: d.into(), since: None, out: vec![] }));
        }
        raised(a, Item::Withdraw("x".into()));
        let (out, since) = outgoing(a);
        received(a, exchange(server, Exchange { holder: "a".into(), since, out }));
        let (out, since) = outgoing(b);
        received(b, exchange(server, Exchange { holder: "b".into(), since, out }));
        raised(b, Item::Withdraw("x".into())); // b's core hears the withdrawal it was just told of
        assert!(outgoing(b).0.is_empty(), "no ping-pong between the devices");
    }

    #[test]
    fn the_servers_own_notices_go_into_its_ring_and_an_unanswered_exchange_keeps_what_waited() {
        let (server, d) = (Path::new("/relay-test2/server"), Path::new("/relay-test2/d"));
        serve(server);
        received(d, exchange(server, Exchange { holder: "d".into(), since: None, out: vec![] }));
        raised(server, Item::Show(notice("feed")));
        let (out, since) = outgoing(d);
        let a = exchange(server, Exchange { holder: "d".into(), since, out });
        assert_eq!(a.items.len(), 1, "the server's feed notice reaches the device");
        received(d, a);
        raised(d, Item::Show(notice("local")));
        let (out, _) = outgoing(d);
        failed(d, out);
        assert_eq!(outgoing(d).0, vec![Item::Show(notice("local"))], "kept for the next exchange");
    }
}
