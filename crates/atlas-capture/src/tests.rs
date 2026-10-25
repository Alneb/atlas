//! The box driven headless: frames run with synthetic keys and text (`egui::Context::run`), as the
//! window runs them, and what it asks of the window (its size, closing) read from the output.
use crate::app::{Capture, Popup, Theme, Vault, FLOAT_HEIGHT, FLOAT_WIDTH, HEIGHT, WIDTH};
use crate::complete::Names;
use egui::{self, Event, Key, Modifiers, ViewportCommand, ViewportId};
use std::path::PathBuf;

struct Harness {
    ctx: egui::Context,
    cap: Capture,
    focused: Option<bool>,
    /// what the box asked of the window, frame after frame
    commands: Vec<ViewportCommand>,
    /// device pixels per point (the desktop's scale: 1.25, 1.5 on a fractional one)
    ppp: f32,
    /// the last frame's output, for `paint`; the textures of every frame so far (the font atlas)
    last: Option<egui::FullOutput>,
    canvas: crate::raster::Canvas,
}

impl Harness {
    fn new(vaults: Vec<Vault>, text: &str) -> Self {
        Self::focused(vaults, text, Some(true))
    }

    fn focused(vaults: Vec<Vault>, text: &str, focused: Option<bool>) -> Self {
        let mut cap = Capture::new(vaults, text.into(), Theme::Light);
        let ctx = egui::Context::default();
        cap.prepare(&ctx);
        cap.set_names(Names {
            notes: ["Hamiltonian", "Holstein", "Hubbard model", "Kondo effect", "GW notes"].map(String::from).to_vec(),
            tags: ["physics", "dmft"].map(String::from).to_vec(),
            ..Default::default()
        });
        let mut h = Self { ctx, cap, focused, commands: vec![], ppp: 1.0, last: None, canvas: Default::default() };
        h.frame(vec![]);
        h
    }

    /// One frame. The window is as tall as the box last asked, and — as on Wayland — it does not
    /// report where it is (`inner_rect: None`), so the box must not depend on that.
    fn frame(&mut self, events: Vec<Event>) {
        let w = if self.cap.floating { FLOAT_WIDTH } else { WIDTH };
        let mut raw = egui::RawInput { screen_rect: Some(egui::Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(w, self.cap.asked))), events, ..Default::default() };
        raw.viewports.insert(ViewportId::ROOT, egui::ViewportInfo { focused: self.focused, inner_rect: None, native_pixels_per_point: Some(self.ppp), ..Default::default() });
        let out = self.ctx.run(raw, |ctx| self.cap.frame(ctx));
        if let Some(v) = out.viewport_output.get(&ViewportId::ROOT) {
            self.commands.extend(v.commands.iter().cloned());
        }
        self.canvas.update(&out.textures_delta);
        self.last = Some(out);
    }

    /// The last frame painted as the window paints it: (pixels, width, height, how long the painting took).
    fn paint(&mut self) -> (Vec<u32>, usize, usize, std::time::Duration) {
        let out = self.last.take().expect("a frame was run");
        let w = if self.cap.floating { FLOAT_WIDTH } else { WIDTH };
        let (pw, ph) = ((w * self.ppp).round() as usize, (self.cap.asked * self.ppp).round() as usize);
        let t = std::time::Instant::now();
        let prims = self.ctx.tessellate(out.shapes, out.pixels_per_point);
        if std::env::var_os("ATLAS_PAINT_SPLIT").is_some() {
            let n: usize = prims.iter().map(|p| if let egui::epaint::Primitive::Mesh(m) = &p.primitive { m.indices.len() / 3 } else { 0 }).sum();
            println!("[paint] tessellated in {:.1} ms: {n} triangles", t.elapsed().as_secs_f64() * 1000.0);
        }
        let mut buf = vec![0; pw * ph];
        let clear = if self.cap.floating { egui::Color32::TRANSPARENT } else { crate::look::palette(&self.ctx).bg };
        self.canvas.paint(&mut buf, pw, ph, out.pixels_per_point, clear, &prims);
        (buf, pw, ph, t.elapsed())
    }

    fn typed(&mut self, text: &str) {
        self.frame(vec![Event::Text(text.into())]);
        self.frame(vec![]); // the list is drawn from the text of the frame before
    }

    fn key(&mut self, key: Key, modifiers: Modifiers) {
        self.frame(vec![Event::Key { key, physical_key: None, pressed: true, repeat: false, modifiers }]);
        self.frame(vec![]);
    }

    fn closed(&self) -> bool {
        self.commands.contains(&ViewportCommand::Close)
    }

    fn last_size(&self) -> Option<f32> {
        self.commands.iter().rev().find_map(|c| if let ViewportCommand::InnerSize(s) = c { Some(s.y) } else { None })
    }

    fn rows(&self) -> Vec<String> {
        match &self.cap.popup {
            Popup::Complete { items, .. } => items.iter().map(|s| s.label.clone()).collect(),
            _ => vec![],
        }
    }
}

fn two_vaults() -> Vec<Vault> {
    let dir = |n: &str| {
        let p = std::env::temp_dir().join(format!("atlas-capture-test-{}-{n}", std::process::id()));
        std::fs::create_dir_all(&p).unwrap();
        p
    };
    vec![Vault { name: "Work".into(), path: dir("work") }, Vault { name: "Personal".into(), path: dir("personal") }]
}

#[test]
fn empty_box_is_as_tall_as_the_window_opens() {
    let mut h = Harness::new(two_vaults(), "");
    h.frame(vec![]);
    assert_eq!(h.last_size(), None, "no resize at start: HEIGHT is the empty box's height (else a jump on the first frame)");
    assert_eq!(h.cap.popup, Popup::Closed);
}

#[test]
fn a_task_list_grows_the_window_and_shrinks_it_back() {
    let mut h = Harness::new(two_vaults(), "");
    h.typed("[] pay the rent d");
    let rows = h.rows();
    assert_eq!(rows.first().map(String::as_str), Some("new line"), "Enter stays the box's own first");
    assert!(rows.iter().any(|r| r == "due date"), "the task fields: {rows:?}");
    let grown = h.last_size().expect("the window was asked to grow");
    let shown = rows.len().min(8) as f32;
    assert!(grown >= HEIGHT + shown * crate::look::ROW, "tall enough for {shown} rows: {grown}");
    h.key(Key::Escape, Modifiers::NONE);
    assert_eq!(h.cap.popup, Popup::Closed, "Esc closes the list");
    assert!(!h.closed(), "…and only the list");
    assert_eq!(h.last_size(), Some(HEIGHT), "the window back to its size");
    h.typed("ue");
    assert_eq!(h.cap.text, "[] pay the rent due", "the box keeps the keys after Esc (egui's Esc would drop the focus)");
    h.key(Key::Escape, Modifiers::NONE);
    h.key(Key::Escape, Modifiers::NONE);
    assert!(h.closed(), "a second Esc closes the box");
}

#[test]
fn a_task_field_then_its_date_by_keys() {
    let mut h = Harness::new(two_vaults(), "");
    h.typed("[] pay rent due");
    h.key(Key::Tab, Modifiers::NONE); // from "new line" to "due date"
    h.key(Key::Enter, Modifiers::NONE);
    assert!(h.cap.text.ends_with("📅 "), "the field taken: {:?}", h.cap.text);
    assert_eq!(h.rows().first().map(String::as_str), Some("today"), "then the dates");
    h.key(Key::Enter, Modifiers::NONE);
    let today = chrono::Local::now().date_naive().format("%Y-%m-%d").to_string();
    assert_eq!(h.cap.text, format!("[] pay rent 📅 {today} "));
    h.typed("x");
    assert!(h.cap.text.ends_with(" x"), "the caret after what was taken: {:?}", h.cap.text);
}

#[test]
fn a_link_is_completed_and_the_caret_follows() {
    let mut h = Harness::new(two_vaults(), "");
    h.typed("see [[ha");
    assert_eq!(h.rows(), vec!["Hamiltonian"]);
    h.key(Key::Enter, Modifiers::NONE);
    assert_eq!(h.cap.text, "see [[Hamiltonian]] ");
    h.typed("now");
    assert_eq!(h.cap.text, "see [[Hamiltonian]] now");
    assert!(!h.closed());
}

#[test]
fn the_vault_menu_by_keys() {
    let mut h = Harness::new(two_vaults(), "");
    // as the window system sends it: the key, and the letter as text
    let alt_v = Event::Key { key: Key::V, physical_key: None, pressed: true, repeat: false, modifiers: Modifiers::ALT };
    h.frame(vec![alt_v, Event::Text("v".into())]);
    h.frame(vec![]);
    assert_eq!(h.cap.text, "", "Alt+V types nothing");
    assert_eq!(h.cap.popup, Popup::Vaults { sel: 0 });
    assert!(h.last_size().unwrap() >= HEIGHT + 2.0 * crate::look::ROW, "the menu fits in the window");
    h.key(Key::ArrowDown, Modifiers::NONE);
    h.key(Key::Enter, Modifiers::NONE);
    assert_eq!(h.cap.vault().unwrap().name, "Personal");
    assert_eq!(h.cap.popup, Popup::Closed);
    h.key(Key::ArrowDown, Modifiers::ALT);
    assert_eq!(h.cap.vault().unwrap().name, "Work", "Alt+↓ goes round");
}

#[test]
fn super_is_the_vault_key() {
    // Super is Atlas's key (docs/guides/KEYS.md); egui does not see it on Linux, the window tells the box it is held
    let mut h = Harness::new(two_vaults(), "");
    h.cap.super_key = true;
    let super_v = || vec![Event::Key { key: Key::V, physical_key: None, pressed: true, repeat: false, modifiers: Modifiers::NONE }, Event::Text("v".into())];
    let first = h.cap.vault().unwrap().name.clone();
    h.frame(super_v());
    // each Super+V the next vault, nothing typed, no list
    assert_eq!((h.cap.text.as_str(), &h.cap.popup), ("", &Popup::Closed), "Super+V types nothing");
    assert_ne!(h.cap.vault().unwrap().name, first, "Super+V: the next vault");
    h.frame(super_v());
    assert_eq!(h.cap.vault().unwrap().name, first, "and round again");
    h.key(Key::ArrowDown, Modifiers::NONE);
    assert_ne!(h.cap.vault().unwrap().name, first, "Super+↓: the next vault");
    h.cap.super_key = false;
}

#[test]
fn closes_when_another_window_takes_the_focus() {
    let mut h = Harness::new(two_vaults(), "");
    h.focused = Some(false);
    h.frame(vec![]);
    assert!(h.closed(), "it had the focus, then lost it");
    let mut never = Harness::focused(two_vaults(), "", Some(false));
    never.frame(vec![]);
    assert!(!never.closed(), "a window that never had the focus stays (a new window may start unfocused)");
}

#[test]
fn enter_on_the_new_line_row_saves_into_the_vault() {
    let vaults = two_vaults();
    let root: PathBuf = vaults[0].path.clone();
    let mut h = Harness::new(vaults, "");
    h.typed("[] water the plants d");
    assert_eq!(h.rows().first().map(String::as_str), Some("new line"));
    h.key(Key::Enter, Modifiers::NONE);
    let log = today_log(&root);
    let mut text = String::new();
    for _ in 0..100 {
        text = std::fs::read_to_string(&log).unwrap_or_default();
        if text.contains("water the plants d") {
            // its own line: the tests share a vault, so another test's capture may be there first
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    assert!(text.contains("water the plants d"), "written: {text:?}");
}

// "in the desktop capture app also add the option for a screenshot or the clipboard" · "automatically copy the url"
// (2026-10-16): the chosen chips go with the text — the page on its line, the picture beside today's note, embedded.
#[test]
fn the_page_and_a_picture_go_with_the_capture() {
    use crate::extras::{Kind, Offer, What};
    let vaults = two_vaults();
    let root: PathBuf = vaults[0].path.clone();
    let shot = std::env::temp_dir().join(format!("atlas-shot-{}.png", std::process::id()));
    {
        let mut enc = png::Encoder::new(std::io::BufWriter::new(std::fs::File::create(&shot).unwrap()), 4, 2);
        enc.set_color(png::ColorType::Rgba);
        enc.write_header().unwrap().write_image_data(&[200; 4 * 4 * 2]).unwrap();
    }
    let mut h = Harness::new(vaults, "");
    let page = crate::context::Page { url: "https://example.org/a".into(), title: "A page".into() };
    h.cap.extras.offer(Offer { kind: Kind::Link, what: What::Link(page), on: true });
    h.cap.extras.offer(Offer { kind: Kind::Screen, what: What::Picture(shot.clone()), on: false });
    h.cap.extras.offer(Offer { kind: Kind::Clipboard, what: What::Text("copied words".into()), on: false });
    h.cap.super_key = true;
    h.key(Key::S, Modifiers::NONE); // the screen exists already: Super+S turns it on
    h.cap.super_key = false;
    h.typed("read later");
    h.key(Key::Enter, Modifiers::NONE);
    let log = today_log(&root);
    let mut text = String::new();
    for _ in 0..100 {
        text = std::fs::read_to_string(&log).unwrap_or_default();
        if text.contains("![[") {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    let name = shot.file_name().unwrap().to_string_lossy().into_owned();
    assert!(text.contains("read later [A page](https://example.org/a)"), "the page on the capture's line: {text:?}");
    assert!(text.contains(&format!("![[{name}|160]]")), "the picture embedded as a thumbnail: {text:?}");
    assert!(!text.contains("copied words"), "the clipboard was left off: {text:?}");
    let beside = walk_find(&root, &name);
    assert!(beside.is_some(), "the picture copied into the vault");
    std::fs::remove_file(&shot).unwrap();
}

// The screen is taken with the box drawn empty (so the box is not in the picture), then its chip is on.
#[test]
fn super_s_takes_the_screen_without_the_box_in_it() {
    use crate::extras::{Kind, Part};
    let mut h = Harness::new(two_vaults(), "");
    h.cap.floating = true;
    h.cap.asked = FLOAT_HEIGHT;
    h.cap.extras.take_screen = || Ok(PathBuf::from("/nowhere/Screen 2026-10-16 101010.png"));
    h.frame(vec![]);
    assert!(!h.cap.hit.is_empty(), "the card is drawn");
    h.cap.super_key = true;
    h.key(Key::S, Modifiers::NONE);
    h.cap.super_key = false;
    assert!(h.cap.hit.is_empty(), "nothing drawn while the screen is taken");
    for _ in 0..100 {
        std::thread::sleep(std::time::Duration::from_millis(10));
        h.frame(vec![]);
        if !h.cap.extras.hidden() {
            break;
        }
    }
    assert!(!h.cap.hit.is_empty(), "the card is back");
    assert_eq!(h.cap.extras.parts(), [Part::File { path: "/nowhere/Screen 2026-10-16 101010.png".into(), label: "Screen" }]);
    assert!(h.cap.extras.offers().iter().any(|o| o.kind == Kind::Screen && o.on));
    assert_eq!(h.cap.text, "", "Super+S typed nothing");
}

/// Where today's captures go in `root`, as the core files them (its log folder and the vault's own settings).
fn today_log(root: &std::path::Path) -> PathBuf {
    let cfg = atlas_core::Workspace::open(root).unwrap().config().unwrap();
    root.join(atlas_core::capture::day_log(&cfg, chrono::Local::now().date_naive()))
}

fn walk_find(dir: &std::path::Path, name: &str) -> Option<PathBuf> {
    for e in std::fs::read_dir(dir).ok()?.flatten() {
        let p = e.path();
        if p.file_name().is_some_and(|n| n == name) {
            return Some(p);
        }
        if p.is_dir() {
            if let Some(f) = walk_find(&p, name) {
                return Some(f);
            }
        }
    }
    None
}

#[test]
fn a_click_on_the_vault_opens_the_menu() {
    let mut h = Harness::new(two_vaults(), "");
    let at = h.cap.pill().expect("the pill is drawn").center();
    let click = |pressed| Event::PointerButton { pos: at, button: egui::PointerButton::Primary, pressed, modifiers: Modifiers::NONE };
    h.frame(vec![Event::PointerMoved(at)]);
    h.frame(vec![click(true)]);
    h.frame(vec![click(false)]);
    h.frame(vec![]);
    assert_eq!(h.cap.popup, Popup::Vaults { sel: 0 });
    h.typed("x");
    assert_eq!((h.cap.text.as_str(), &h.cap.popup), ("x", &Popup::Closed), "the keys still go to the text; typing closes the menu");
}

// "when the autocomplete modal appears, y resizes, it show draw that modal floating without resizing the app"
// (2026-10-15): floating (Wayland), the window keeps its size whatever opens; the list hangs under the card,
// and only the card and the list take the pointer.
#[test]
fn floating_a_list_opens_under_the_card_and_the_window_keeps_its_size() {
    let mut h = Harness::new(two_vaults(), "");
    h.cap.floating = true;
    h.cap.asked = FLOAT_HEIGHT;
    h.commands.clear();
    h.frame(vec![]);
    assert_eq!(h.cap.hit.len(), 1, "the card alone");
    let card = h.cap.hit[0];
    assert!(card.top() > 0.0 && card.left() > 0.0, "a margin for the shadow: {card:?}");
    h.typed("[] pay the rent d");
    assert!(!h.rows().is_empty(), "the task fields are offered");
    assert_eq!(h.cap.hit.len(), 2, "the card and the list");
    let list = h.cap.hit[1];
    assert!(list.top() >= card.bottom() - 12.0, "the list hangs under the card: {list:?} / {card:?}");
    assert!(list.bottom() <= FLOAT_HEIGHT, "inside the room the window has: {list:?}");
    assert_eq!(h.last_size(), None, "nothing asked of the window: it does not resize");
    h.key(Key::Escape, Modifiers::NONE);
    assert_eq!(h.cap.hit.len(), 1, "the list closed: the card alone takes the pointer again");
}

/// How long one frame takes to paint, floating with the task list open, at the scales a desktop uses.
/// `cargo test --release -p atlas-capture -- --ignored --nocapture paint_speed` (debug builds are ~20× slower).
#[test]
#[ignore]
fn paint_speed() {
    for ppp in [1.0, 1.25, 1.5, 2.0] {
        let mut h = Harness::new(two_vaults(), "");
        h.ppp = ppp;
        h.cap.floating = true;
        h.cap.asked = FLOAT_HEIGHT;
        h.typed("[] pay the rent d");
        let (mut times, mut digest) = (vec![], 0u64);
        for _ in 0..15 {
            h.frame(vec![]);
            let (buf, _, _, took) = h.paint();
            times.push(took.as_secs_f64() * 1000.0);
            if let Some(dir) = std::env::var_os("ATLAS_PAINT_DUMP") {
                let bytes: Vec<u8> = buf.iter().flat_map(|p| p.to_le_bytes()).collect();
                std::fs::write(std::path::Path::new(&dir).join(format!("{ppp}-{}x{}.bgra", (FLOAT_WIDTH * ppp).round(), (FLOAT_HEIGHT * ppp).round())), bytes).unwrap();
            }
            digest = buf.iter().fold(0xcbf29ce484222325, |d, &p| (d ^ u64::from(p)).wrapping_mul(0x100000001b3)); // FNV-1a: same pixels, same digest
        }
        times.sort_by(f64::total_cmp);
        println!("[paint] scale {ppp}: median {:.1} ms (min {:.1}, max {:.1}), pixels {digest:016x}", times[7], times[0], times[14]);
    }
}

// "the atlas capture for desktop needs feature parity with the android one" (2026-10-17): what is playing, as the
// phone offers it — "Artist – Title", linked when the player gives a web address (a YouTube video in the browser).
#[test]
fn what_is_playing_is_offered_by_artist_and_title_with_its_web_address() {
    use crate::context::playing_page;
    let yt = playing_page("Never Gonna Give You Up", &["Rick Astley".into()], "https://www.youtube.com/watch?v=dQw4w9WgXcQ").unwrap();
    assert_eq!(yt.markdown(), "[Rick Astley – Never Gonna Give You Up](https://www.youtube.com/watch?v=dQw4w9WgXcQ)");
    let local = playing_page("Paranoid Android", &["Radiohead".into()], "file:///music/02.flac").unwrap();
    assert_eq!(local.markdown(), "Radiohead – Paranoid Android", "a local file's path is not offered");
    assert_eq!(playing_page("Queen - Bohemian Rhapsody", &["Queen".into()], "").unwrap().title, "Queen - Bohemian Rhapsody");
    assert_eq!(playing_page("", &[], ""), None);
}

// "the desktop capture: tooltips with keyboard shortcuts and suggestions like in the android app" (2026-10-17): a guide
// (`@fri`, `[[`…) is a click, as a tap on the phone: the text starts with it and its suggestions open.
#[test]
fn a_guide_clicked_starts_the_text_and_opens_its_suggestions() {
    let mut h = Harness::new(two_vaults(), "");
    h.frame(vec![]);
    h.cap.start_with("@");
    h.frame(vec![]);
    assert_eq!(h.cap.text, "@");
    let rows = h.rows();
    assert!(rows.iter().any(|r| r == "@today") && rows.iter().any(|r| r == "@tomorrow"), "the days: {rows:?}");
    h.cap.start_with("[] ");
    assert_eq!(h.cap.text, "[] ");
}

// An Atlas listed as serving the vault that takes no connection (it crashed, or is closing): the capture is written
// to the files directly, never lost.
#[test]
fn a_capture_goes_to_the_files_when_the_listed_atlas_does_not_answer() {
    let root = std::env::temp_dir().join(format!("atlas-capture-unreachable-{}", std::process::id()));
    std::fs::create_dir_all(root.join(".atlas/cache")).unwrap();
    // a port nothing listens on: bound, then let go
    let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let file = serde_json::json!({ "port": port, "pid": std::process::id(), "root": root.to_string_lossy(), "path": "" });
    std::fs::write(root.join(".atlas/cache/server.json"), file.to_string()).unwrap();
    assert!(atlas_core::vaults::running_server(&root).is_some(), "listed as served by a live process");
    let (path, _) = crate::send::capture(&root, "kept anyway").expect("written to the files");
    let text = std::fs::read_to_string(root.join(&path)).unwrap();
    assert!(text.contains("kept anyway"), "{text:?}");
    std::fs::remove_dir_all(&root).unwrap();
}
