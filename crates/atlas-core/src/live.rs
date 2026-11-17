//! Live rooms (docs/design/DESIGN-shared-notes.md §3). The devices with a file open join its room (`/api/live?path=…&name=…`) and
//! what each sends reaches the others, stamped with who sent it: `{"from": <peer>, "m": <its message>}`. The server
//! only relays — what a message means (a drawing's changed elements, a pen's pointer) is the clients' (ui lib/live.ts).
//! A joiner is told its own id (`{"t":"hello","peer":n,"writer":w}`); the others hear `{"t":"join"}` and `{"t":"leave"}`
//! from it. One device saves for the room, its **writer** (docs/design/DESIGN-mirror-v2.md §3): the earliest still there;
//! when it leaves, everyone hears `{"t":"writer","peer":w}` (unstamped, from the room itself).
//! One room is read as well as relayed: [`WHERE`], where each device says what it shows (`{"t":"at",…}`, ui
//! lib/where.svelte.ts). Its devices' last places are kept ([`Rooms::places`]), so a client with no socket — the phone
//! app's native screens — asks `GET /api/where` who is where.
use axum::extract::ws::{Message, WebSocket};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tokio::sync::broadcast;

/// A message larger than this is dropped (a drawing's change with a picture is sent through the file instead).
const MAX_MESSAGE: usize = 4 << 20;

/// A message from the room itself, not from a device: every device hears it.
const ROOM: u64 = 0;

/// What a room carries: who said it (a peer, or [`ROOM`]) and the message.
type Said = (u64, String);

/// The room where the devices say what they show: never a file, only a room's name.
pub const WHERE: &str = ".atlas/cache/where";

/// A device's place, as it last said in the [`WHERE`] room: the file it shows and where in it.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Place {
    /// its number in the room (a new one each time it joins)
    pub peer: u64,
    /// what it calls itself (`desktop`, `phone`, `Boox`)
    pub name: String,
    /// a stable id of the device (the phone app's, a browser's), when it said one: how a device knows itself in the list
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
    pub path: String,
    /// a PDF's page
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
    /// a note's line (1-based), where its caret is
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
}

impl Place {
    /// `{"t":"at","path":…,"page"?,"line"?,"device"?}` from `peer`, else `None` (another message, or a malformed one).
    fn of(peer: u64, name: &str, message: &str) -> Option<Self> {
        #[derive(serde::Deserialize)]
        struct At {
            t: String,
            path: String,
            page: Option<u32>,
            line: Option<u32>,
            device: Option<String>,
        }
        let at: At = serde_json::from_str(message).ok()?;
        let fits = |s: &str, n: usize| !s.is_empty() && s.len() <= n;
        (at.t == "at" && fits(&at.path, 4096)).then(|| Place {
            peer,
            name: name.to_string(),
            device: at.device.filter(|d| fits(d, 128)),
            path: at.path,
            page: at.page.filter(|&p| p > 0),
            line: at.line.filter(|&l| l > 0),
        })
    }
}

struct Room {
    tx: broadcast::Sender<Said>,
    /// in the order they came: the first is the writer
    members: Vec<u64>,
    /// the [`WHERE`] room only: each member's last place
    places: HashMap<u64, Place>,
}

#[derive(Default)]
pub struct Rooms {
    rooms: Mutex<HashMap<String, Room>>,
    next: AtomicU64,
}

impl Rooms {
    /// A new device in `path`'s room: its id, the room's channel, already listening, and who writes. Subscribed under
    /// the rooms' lock, so a writer leaving right after is heard (else the room would wait on a writer that is gone).
    fn join(&self, path: &str) -> (u64, broadcast::Sender<Said>, broadcast::Receiver<Said>, u64) {
        let peer = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        let mut rooms = self.rooms.lock().expect("rooms");
        let room = rooms.entry(path.to_string()).or_insert_with(|| Room { tx: broadcast::channel(256).0, members: Vec::new(), places: HashMap::new() });
        room.members.push(peer);
        (peer, room.tx.clone(), room.tx.subscribe(), room.members[0])
    }

    /// `peer` left: the room goes with its last device; the writer leaving hands the room to the next.
    fn leave(&self, path: &str, peer: u64) {
        let mut rooms = self.rooms.lock().expect("rooms");
        let Some(room) = rooms.get_mut(path) else { return };
        let was = room.members.first().copied();
        room.members.retain(|&p| p != peer);
        room.places.remove(&peer);
        match room.members.first().copied() {
            None => {
                rooms.remove(path);
            }
            Some(w) if Some(w) != was => {
                let _ = room.tx.send((ROOM, serde_json::json!({ "t": "writer", "peer": w }).to_string()));
            }
            Some(_) => {}
        }
    }

    /// How many devices have `path` open.
    pub fn count(&self, path: &str) -> usize {
        self.rooms.lock().expect("rooms").get(path).map_or(0, |r| r.members.len())
    }

    /// Where each device in the [`WHERE`] room is, as it last said, in the order they joined; a device that has said
    /// nothing yet is not listed.
    pub fn places(&self) -> Vec<Place> {
        let rooms = self.rooms.lock().expect("rooms");
        let Some(room) = rooms.get(WHERE) else { return Vec::new() };
        room.members.iter().filter_map(|p| room.places.get(p).cloned()).collect()
    }

    /// `peer` said `message` in `path`'s room: kept when it is a place in the [`WHERE`] room; `{"t":"nowhere"}` (it
    /// stopped sharing its place) forgets it.
    fn heard(&self, path: &str, peer: u64, name: &str, message: &str) {
        if path != WHERE {
            return;
        }
        let place = Place::of(peer, name, message);
        let nowhere = place.is_none() && serde_json::from_str::<serde_json::Value>(message).is_ok_and(|m| m["t"] == "nowhere");
        if place.is_none() && !nowhere {
            return;
        }
        if let Some(room) = self.rooms.lock().expect("rooms").get_mut(path) {
            match place {
                Some(p) if room.members.contains(&peer) => {
                    room.places.insert(peer, p);
                }
                Some(_) => {}
                None => {
                    room.places.remove(&peer);
                }
            }
        }
    }

    /// Who saves `path` for its room (`None`: nobody has it open).
    pub fn writer(&self, path: &str) -> Option<u64> {
        self.rooms.lock().expect("rooms").get(path).and_then(|r| r.members.first().copied())
    }
}

/// `{"from":peer,"m":<message>}` — the message is JSON already (checked), so it goes in as it came.
fn stamped(peer: u64, message: &str) -> String {
    format!(r#"{{"from":{peer},"m":{message}}}"#)
}

/// One device in `path`'s room until its socket closes or `until` ends (then the socket is closed and the page, which
/// reconnects, joins again: how a pane that fell back to this room moves to the server's).
pub async fn session(mut socket: WebSocket, rooms: std::sync::Arc<Rooms>, path: String, name: String, until: impl std::future::Future<Output = ()>) {
    tokio::pin!(until);
    let (peer, tx, mut rx, writer) = rooms.join(&path);
    let hello = serde_json::json!({ "t": "hello", "peer": peer, "others": tx.receiver_count() - 1, "writer": writer }).to_string();
    let _ = tx.send((peer, stamped(peer, &serde_json::json!({ "t": "join", "name": name }).to_string())));
    if socket.send(Message::Text(hello.into())).await.is_ok() {
        loop {
            tokio::select! {
                got = rx.recv() => match got {
                    Ok((from, text)) if from != peer => if socket.send(Message::Text(text.into())).await.is_err() { break },
                    Ok(_) => {}
                    Err(broadcast::error::RecvError::Lagged(_)) => continue, // a slow device misses pointers, not the file
                    Err(broadcast::error::RecvError::Closed) => break,
                },
                msg = socket.recv() => match msg {
                    Some(Ok(Message::Text(t))) => {
                        if t.len() <= MAX_MESSAGE && serde_json::from_str::<serde::de::IgnoredAny>(&t).is_ok() {
                            rooms.heard(&path, peer, &name, &t);
                            let _ = tx.send((peer, stamped(peer, &t)));
                        }
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    Some(Ok(_)) => {}
                },
                () = &mut until => {
                    let _ = socket.send(Message::Close(None)).await;
                    break;
                }
            }
        }
    }
    drop(rx);
    let _ = tx.send((peer, stamped(peer, r#"{"t":"leave"}"#)));
    drop(tx);
    rooms.leave(&path, peer);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_room_lives_while_a_device_is_in_it_and_its_first_device_writes() {
        let rooms = Rooms::default();
        let (a, _tx, mut rx, w) = rooms.join("d.excalidraw");
        assert_eq!(w, a, "alone: the writer");
        let (b, _, _, w) = rooms.join("d.excalidraw");
        assert_ne!(a, b);
        assert_eq!((w, rooms.count("d.excalidraw")), (a, 2), "the first stays the writer");
        rooms.leave("d.excalidraw", b);
        assert!(rx.try_recv().is_err(), "a reader leaving changes nothing");
        let (c, _, mut heard, _) = rooms.join("d.excalidraw");
        rooms.leave("d.excalidraw", a);
        // c joined before a left: it hears the handover even though its session had not started listening yet
        assert_eq!(heard.try_recv().unwrap().0, ROOM, "the newcomer hears it is the writer");
        let (from, said) = rx.try_recv().unwrap();
        let said: serde_json::Value = serde_json::from_str(&said).unwrap();
        assert_eq!((from, said), (ROOM, serde_json::json!({ "t": "writer", "peer": c })), "the writer left: the next one");
        assert_eq!(rooms.writer("d.excalidraw"), Some(c));
        drop(rx);
        rooms.leave("d.excalidraw", c);
        assert_eq!((rooms.count("d.excalidraw"), rooms.writer("d.excalidraw")), (0, None));
        assert_eq!(stamped(3, r#"{"t":"pointer","x":1}"#), r#"{"from":3,"m":{"t":"pointer","x":1}}"#);
    }

    #[test]
    fn the_where_room_keeps_each_devices_last_place_until_it_leaves() {
        let rooms = Rooms::default();
        let (a, ..) = rooms.join(WHERE);
        let (b, ..) = rooms.join(WHERE);
        assert!(rooms.places().is_empty(), "nobody said anything yet");
        rooms.heard(WHERE, a, "desktop", r#"{"t":"at","path":"notes/a.md","line":12,"device":"d-1"}"#);
        rooms.heard(WHERE, b, "phone", r#"{"t":"at","path":"x.pdf","page":3}"#);
        rooms.heard(WHERE, b, "phone", r#"{"t":"at","path":"y.pdf","page":4}"#);
        rooms.heard(WHERE, a, "desktop", r#"{"t":"pointer","x":1}"#); // not a place: the last one stays
        rooms.heard(WHERE, a, "desktop", r#"{"t":"at","path":""}"#); // no file: ignored
        let places = rooms.places();
        assert_eq!(places.len(), 2);
        assert_eq!((places[0].peer, places[0].path.as_str(), places[0].line, places[0].device.as_deref()), (a, "notes/a.md", Some(12), Some("d-1")));
        assert_eq!((places[1].name.as_str(), places[1].path.as_str(), places[1].page, places[1].line), ("phone", "y.pdf", Some(4), None));
        let json = serde_json::to_value(&places[1]).unwrap();
        assert_eq!(json, serde_json::json!({ "peer": b, "name": "phone", "path": "y.pdf", "page": 4 }), "nothing unsaid on the wire");
        // another room's messages are relayed only, never kept
        let (c, ..) = rooms.join("n.md");
        rooms.heard("n.md", c, "Boox", r#"{"t":"at","path":"n.md"}"#);
        assert_eq!(rooms.places().len(), 2);
        rooms.leave(WHERE, a);
        assert_eq!(rooms.places().iter().map(|p| p.peer).collect::<Vec<_>>(), vec![b], "a device that left is nowhere");
        rooms.heard(WHERE, a, "desktop", r#"{"t":"at","path":"late.md"}"#);
        assert_eq!(rooms.places().len(), 1, "a message after leaving is not kept");
        rooms.heard(WHERE, b, "phone", r#"{"t":"nowhere"}"#);
        assert!(rooms.places().is_empty(), "a device that stopped sharing its place is not listed");
    }
}
