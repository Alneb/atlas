//! The box itself: its state, its keys, and one frame of drawing — independent of the window, so
//! the tests drive it with synthetic input (`egui::Context::run`) exactly as the window does.
use crate::complete::{self, suggest, Names, Suggestion};
use crate::extras::{Extras, Kind, Part};
use crate::icons::Icon;
use crate::look::{self, Palette, POP_PAD, ROW};
use crate::send;
use egui::{self, vec2, FontId, Key, Modifiers, Rect};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// The window's width, and its height with nothing open (measured: `empty_box_is_as_tall_as_the_window_opens`).
pub const WIDTH: f32 = 620.0;
pub const HEIGHT: f32 = 111.0;
/// Rows a list shows at once; the chosen row is kept in view.
const MOST_ROWS: usize = 8;
/// Floating (Wayland): room around the card for its shadow, and under it for a list — the window has this
/// size from the start and never resizes when a list opens.
pub const SHADOW: f32 = 14.0;
pub const LIST_ROOM: f32 = MOST_ROWS as f32 * ROW + 2.0 * POP_PAD + 10.0;
pub const FLOAT_WIDTH: f32 = WIDTH + 2.0 * SHADOW;
pub const FLOAT_HEIGHT: f32 = SHADOW + HEIGHT + LIST_ROOM + SHADOW;
const MARGIN: egui::Margin = egui::Margin { left: 14.0, right: 14.0, top: 12.0, bottom: 10.0 };
const TILE: f32 = 22.0;
/// Where the text starts: past the tile (the footer and the lists line up with it).
const TEXT_X: f32 = TILE + 10.0;

#[derive(Clone, Debug, PartialEq)]
pub struct Vault {
    pub name: String,
    pub path: PathBuf,
}

pub enum Phase {
    Typing,
    Sending,
    Saved(String, Instant),
    Failed(String),
}

/// What hangs under the text: nothing, the completions, or the vault menu — never two at once.
#[derive(Debug, PartialEq)]
pub enum Popup {
    Closed,
    Complete { items: Vec<Suggestion>, sel: usize },
    Vaults { sel: usize },
}

/// The theme: the vault's `ui.theme`, or the desktop's when it says "system".
#[derive(Clone, Copy, PartialEq)]
pub enum Theme {
    Dark,
    Light,
    System,
}

pub struct Capture {
    pub text: String,
    /// What the text will become, for the vault chosen: (text, vault, words), remembered until either changes
    said: std::cell::RefCell<Option<(String, Option<PathBuf>, String)>>,
    /// The Super key is held (set by the window from winit: egui does not report Super on Linux). Super is Atlas's key
    /// for its own actions, Ctrl the text's (docs/guides/KEYS.md).
    pub super_key: bool,
    vaults: Vec<Vault>,
    vault: usize,
    phase: Arc<Mutex<Phase>>,
    /// (generation, names): the generation moves on each load, so the open list is asked again
    names: Arc<Mutex<(u64, Names)>>,
    names_seen: u64,
    pub popup: Popup,
    theme: Theme,
    dark: Option<bool>,
    /// set the caret here (in characters) on the next frame: after a completion is taken
    caret_to: Option<usize>,
    caret: usize,
    had_focus: bool,
    first: bool,
    /// the window height last asked for (on Wayland the window's own size is not reported back)
    pub asked: f32,
    asks: u8,
    pill: Option<Rect>,
    started: Instant,
    timing: bool,
    /// The card drawn in a transparent window that keeps its size, lists floating under the card (Wayland,
    /// where the compositor takes the alpha); else the window is the box and grows for a list (X11).
    pub floating: bool,
    /// Where a list starts, left edge (floating: drawn after the card, under it).
    list_x: Option<f32>,
    /// The parts that take the pointer (floating): the card, and the open list. Elsewhere clicks go
    /// through to the windows under the box (window.rs sets the surface's input region from these).
    pub hit: Vec<Rect>,
    /// Besides the text: the page you were on, the clipboard, the screenshots (extras.rs).
    pub extras: Extras,
}

impl Capture {
    pub fn new(vaults: Vec<Vault>, text: String, theme: Theme) -> Self {
        Self {
            super_key: false,
            caret: text.chars().count(),
            text,
            vaults,
            vault: 0,
            phase: Arc::new(Mutex::new(Phase::Typing)),
            names: Default::default(),
            names_seen: 0,
            popup: Popup::Closed,
            theme,
            dark: None,
            caret_to: None,
            had_focus: false,
            first: true,
            asked: HEIGHT,
            asks: 0,
            pill: None,
            started: Instant::now(),
            timing: std::env::var_os("ATLAS_CAPTURE_TIMING").is_some(),
            floating: false,
            list_x: None,
            hit: Vec::new(),
            extras: Extras::default(),
            said: Default::default(),
        }
    }

    /// "a line in today's log · catalogued as a film": the core's words for the chosen vault, asked again only when
    /// the text or the vault changes (it reads the vault's settings and the catalog's patterns).
    fn becomes(&self) -> String {
        let root = self.vault().map(|v| v.path.clone());
        let mut memo = self.said.borrow_mut();
        if memo.as_ref().is_none_or(|(t, r, _)| *t != self.text || *r != root) {
            let cfg = root.as_ref().and_then(|r| atlas_core::Workspace::open(r).and_then(|ws| ws.config()).ok());
            let says = complete::what_it_becomes(root.as_deref().zip(cfg.as_ref()), &self.text);
            *memo = Some((self.text.clone(), root, says));
        }
        memo.as_ref().map(|(_, _, s)| s.clone()).unwrap_or_default()
    }

    pub fn started_at(mut self, t: Instant) -> Self {
        self.started = t;
        self
    }

    pub fn vault(&self) -> Option<&Vault> {
        self.vaults.get(self.vault)
    }

    /// Note names and tags for the completions, read in the background: typing never waits for them.
    pub fn load_names(&self) {
        let Some(root) = self.vault().map(|v| v.path.clone()) else { return };
        let names = self.names.clone();
        std::thread::spawn(move || {
            if let Some(n) = Names::load(&root) {
                Self::put_names(&names, n);
            }
        });
    }

    fn put_names(names: &Mutex<(u64, Names)>, n: Names) {
        let mut g = names.lock().unwrap();
        *g = (g.0 + 1, n);
    }

    /// For tests: the names as if read from the vault.
    #[cfg(test)]
    pub fn set_names(&self, n: Names) {
        Self::put_names(&self.names, n);
    }

    /// Where the vault pill was last drawn (tests click it).
    #[cfg(test)]
    pub fn pill(&self) -> Option<Rect> {
        self.pill
    }

    pub fn open_vault_menu(&mut self) {
        if self.vaults.len() > 1 {
            self.popup = Popup::Vaults { sel: self.vault };
        }
    }

    fn choose_vault(&mut self, i: usize) {
        if i != self.vault {
            self.vault = i;
            self.load_names();
        }
        self.popup = Popup::Closed;
    }

    fn send(&mut self, ctx: &egui::Context) {
        let typed = self.text.trim().to_string();
        let parts = self.extras.parts();
        if (typed.is_empty() && parts.is_empty()) || !matches!(*self.phase.lock().unwrap(), Phase::Typing | Phase::Failed(_)) {
            return;
        }
        let Some(Vault { name, path }) = self.vault().cloned() else { return };
        *self.phase.lock().unwrap() = Phase::Sending;
        let (phase, ctx) = (self.phase.clone(), ctx.clone());
        std::thread::spawn(move || {
            let next = match compose(&path, typed, parts).and_then(|text| send::capture(&path, &text)) {
                Ok((file, line)) => Phase::Saved(format!("{name} · {file}:{line}"), Instant::now()),
                Err(e) => Phase::Failed(e.to_string()),
            };
            *phase.lock().unwrap() = next;
            ctx.request_repaint();
        });
    }

    /// The completions for the text as it is now, at the caret.
    fn refresh(&mut self) {
        let byte = self.text.char_indices().nth(self.caret).map_or(self.text.len(), |(b, _)| b);
        let items = {
            let names = self.names.lock().unwrap();
            suggest(&self.text, byte, &names.1)
        };
        self.popup = if items.is_empty() { Popup::Closed } else { Popup::Complete { items, sel: 0 } };
    }

    fn take(&mut self) {
        let Popup::Complete { items, sel } = &self.popup else { return };
        let Some(s) = items.get(*sel).cloned() else { return };
        self.text.replace_range(s.replace.clone(), &s.insert);
        self.caret = self.text[..s.replace.start + s.insert.len()].chars().count();
        self.caret_to = Some(self.caret);
        self.popup = Popup::Closed;
        if s.more {
            self.refresh(); // after a date field, the dates
        }
    }

    fn step(&mut self, by: isize) {
        let n = match &self.popup {
            Popup::Complete { items, .. } => items.len(),
            Popup::Vaults { .. } => self.vaults.len(),
            Popup::Closed => return,
        };
        if let Popup::Complete { sel, .. } | Popup::Vaults { sel } = &mut self.popup {
            *sel = (*sel as isize + by).rem_euclid(n as isize) as usize;
        }
    }

    /// The keys, before the text box sees them: the open list's first, then the box's own.
    fn keys(&mut self, ctx: &egui::Context) {
        let pressed = |m: Modifiers, k: Key| ctx.input_mut(|i| i.consume_key(m, k));
        let sup = self.super_key;
        if self.popup != Popup::Closed && !sup {
            if pressed(Modifiers::NONE, Key::ArrowDown) || pressed(Modifiers::NONE, Key::Tab) {
                self.step(1); // Tab walks the list, as in the editor; Enter takes
            } else if pressed(Modifiers::NONE, Key::ArrowUp) || pressed(Modifiers::SHIFT, Key::Tab) {
                self.step(-1);
            } else if pressed(Modifiers::NONE, Key::Escape) {
                self.popup = Popup::Closed;
            } else if pressed(Modifiers::NONE, Key::Enter) {
                match &self.popup {
                    // the "new line" row: Enter is the box's own
                    Popup::Complete { items, sel } if items[*sel].new_line => {
                        self.popup = Popup::Closed;
                        self.send(ctx);
                    }
                    Popup::Complete { .. } => self.take(),
                    Popup::Vaults { sel } => self.choose_vault(*sel),
                    Popup::Closed => {}
                }
            }
        }
        if self.popup == Popup::Closed && !sup {
            // no list to walk: Tab does nothing (it would type a tab, or move the keys away from the text)
            let _ = pressed(Modifiers::NONE, Key::Tab) || pressed(Modifiers::SHIFT, Key::Tab);
            if pressed(Modifiers::NONE, Key::Escape) {
                close(ctx, "Esc");
            } else if pressed(Modifiers::NONE, Key::Enter) {
                self.send(ctx);
            }
        }
        // besides the text: Super+S the screen, Super+Shift+S the last screenshot, Super+C the clipboard, Super+U the page,
        // Super+M what is playing
        let extra = if !sup {
            None
        } else if pressed(Modifiers::SHIFT, Key::S) {
            Some(Kind::Last)
        } else if pressed(Modifiers::NONE, Key::S) {
            Some(Kind::Screen)
        } else if pressed(Modifiers::NONE, Key::C) {
            Some(Kind::Clipboard)
        } else if pressed(Modifiers::NONE, Key::U) {
            Some(Kind::Link)
        } else if pressed(Modifiers::NONE, Key::M) {
            Some(Kind::Playing)
        } else {
            None
        };
        if let Some(k) = extra {
            self.extras.toggle(k);
            ctx.input_mut(|i| i.events.retain(|e| !matches!(e, egui::Event::Text(_))));
        }
        // the vault: Super+V the next one (Super+Shift+V the one before), Super+Up / Super+Down as well (Alt too, the keys
        // it had first); a click on it the list
        let n = self.vaults.len();
        let vault_key = |k: Key| (sup && pressed(Modifiers::NONE, k)) || pressed(Modifiers::ALT, k);
        let alt = if n < 2 {
            false
        } else if vault_key(Key::ArrowDown) {
            self.choose_vault((self.vault + 1) % n);
            true
        } else if vault_key(Key::ArrowUp) {
            self.choose_vault((self.vault + n - 1) % n);
            true
        } else if sup && pressed(Modifiers::SHIFT, Key::V) {
            self.choose_vault((self.vault + n - 1) % n); // the one before
            true
        } else if sup && pressed(Modifiers::NONE, Key::V) {
            // each Super+V the next vault, as Alt+Tab goes through windows; the list is a click away
            self.popup = Popup::Closed;
            self.choose_vault((self.vault + 1) % n);
            true
        } else if pressed(Modifiers::ALT, Key::V) {
            if matches!(self.popup, Popup::Vaults { .. }) {
                self.popup = Popup::Closed;
            } else {
                self.open_vault_menu();
            }
            true
        } else {
            false
        };
        if alt {
            // the window system also sends the letter as text: it is not typed
            ctx.input_mut(|i| i.events.retain(|e| !matches!(e, egui::Event::Text(_))));
        }
    }

    /// Before the first frame: the colours and the font, so the first frame is already the right one.
    pub fn prepare(&mut self, ctx: &egui::Context) {
        self.theme(ctx);
    }

    fn theme(&mut self, ctx: &egui::Context) {
        let dark = match self.theme {
            Theme::Dark => true,
            Theme::Light => false,
            Theme::System => ctx.system_theme() != Some(egui::Theme::Light),
        };
        if self.dark != Some(dark) {
            let font = if self.dark.is_none() { look::ui_font() } else { None };
            ctx.set_theme(if dark { egui::Theme::Dark } else { egui::Theme::Light }); // egui must not swap in its own
            look::apply(ctx, if dark { look::DARK } else { look::LIGHT }, font);
            self.dark = Some(dark);
        }
    }

    /// One frame: the keys, the drawing, and the window's size.
    pub fn frame(&mut self, ctx: &egui::Context) {
        self.theme(ctx);
        self.extras.tick(ctx);
        // gone when another window takes the focus — once it had it (a new window may start unfocused)
        match ctx.input(|i| i.viewport().focused) {
            Some(true) => self.had_focus = true,
            Some(false) if self.had_focus => close(ctx, "another window took the focus"),
            _ => {}
        }
        if let Phase::Saved(_, at) = &*self.phase.lock().unwrap() {
            let left = Duration::from_millis(650).saturating_sub(at.elapsed()); // long enough to read where it went
            if left.is_zero() {
                close(ctx, "saved");
            }
            ctx.request_repaint_after(left);
        }
        self.keys(ctx);
        let p = look::palette(ctx);
        if self.floating {
            return self.floating_frame(ctx, p);
        }
        let bottom = egui::CentralPanel::default()
            .frame(egui::Frame::none().fill(p.bg).inner_margin(MARGIN))
            .show(ctx, |ui| self.body(ui, p))
            .inner;
        look::edge(&ctx.layer_painter(egui::LayerId::new(egui::Order::Foreground, egui::Id::new("edge"))), ctx.screen_rect(), p);
        // the window as tall as what it holds: it grows for a list and shrinks back
        // Asked again while the window is not that size yet: an ask made before the compositor's first
        // configure is overridden by it (Wayland) — a few times only, should the compositor refuse.
        // never under HEIGHT, the size it opens at: a smaller font (no Inter, no Noto) would jump on the first frame
        let want = (bottom + MARGIN.bottom).ceil().max(HEIGHT);
        let have = ctx.screen_rect().height();
        if (want - self.asked).abs() > 0.5 {
            self.asked = want;
            self.asks = 0;
        }
        if (want - have).abs() > 0.5 && self.asks < 5 {
            self.asks += 1;
            if self.timing {
                eprintln!("atlas-capture: asking for {want} pt (the window is {have})");
            }
            ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(vec2(WIDTH, want)));
            ctx.request_repaint_after(Duration::from_millis(30)); // to see whether it took
        }
        if self.first && self.timing {
            eprintln!("atlas-capture: first frame drawn {} ms after start", self.started.elapsed().as_millis());
        }
        self.first = false;
    }

    /// Floating: the card at the top of a transparent window — rounded, its border the app's focused capture
    /// box (accent, with the soft ring), a shadow under it — and the open list floating below the card, as the
    /// web box's list hangs under it. The window keeps its size unless the text grows past the room.
    fn floating_frame(&mut self, ctx: &egui::Context, p: Palette) {
        if self.extras.hidden() {
            // the screen is being taken: nothing drawn, so the picture is what was under the box
            egui::CentralPanel::default().frame(egui::Frame::none()).show(ctx, |_| {});
            self.hit.clear();
            return;
        }
        let card = egui::Frame::none()
            .fill(p.bg)
            .rounding(egui::Rounding::same(12.0))
            .stroke(egui::Stroke::new(1.0_f32, look::with_alpha(p.accent, 0.55)))
            .inner_margin(MARGIN);
        let mut hit = Vec::new();
        egui::CentralPanel::default().frame(egui::Frame::none().inner_margin(SHADOW)).show(ctx, |ui| {
            let inner = ui.max_rect();
            let shape = ui.painter().add(egui::Shape::Noop); // the ring and the shadow, under the card once its size is known
            let r = card.show(ui, |ui| self.body(ui, p)).response.rect;
            ui.painter().set(shape, look::card_halo(r, p));
            hit.push(r.expand(4.0));
            if let Some(x) = self.list_x.take() {
                let at = self.list(ui, p, x, inner.x_range(), Some(r.bottom() - 4.0));
                hit.extend(at);
            }
        });
        self.hit = hit;
        // the text grown past the room the window was made with: then (only then) the window grows
        let need = self.hit.iter().map(|r| r.bottom()).fold(FLOAT_HEIGHT - SHADOW, f32::max) + SHADOW;
        let want = need.max(FLOAT_HEIGHT).ceil();
        if (want - self.asked).abs() > 0.5 {
            self.asked = want;
            ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(vec2(FLOAT_WIDTH, want)));
        }
        if self.first && self.timing {
            eprintln!("atlas-capture: first frame drawn {} ms after start", self.started.elapsed().as_millis());
        }
        self.first = false;
    }

    /// Draws the box; → where its content ends (the panel itself always fills the window).
    fn body(&mut self, ui: &mut egui::Ui, p: Palette) -> f32 {
        let id = egui::Id::new("capture-text");
        let row = ui.horizontal_top(|ui| {
            ui.add_space(0.0);
            ui.vertical(|ui| {
                ui.add_space(1.0);
                look::brand(ui, p, TILE);
            });
            ui.add_space(2.0);
            egui::TextEdit::multiline(&mut self.text)
                .id(id)
                .desired_rows(1)
                .desired_width(f32::INFINITY)
                .frame(false)
                .margin(egui::Margin::symmetric(0.0, 2.0))
                .font(FontId::proportional(look::TEXT))
                .hint_text(egui::RichText::new("Capture a thought, a to-do, a link…").color(p.faint))
                .lock_focus(true)
                .show(ui)
        });
        let edit = row.inner;
        // the one field: the keys always go to it (a click on the vault pill must not take them), and
        // Esc is the box's — it closes a list, or the box — where egui would drop the field's focus on it
        if !edit.response.has_focus() {
            edit.response.request_focus();
        }
        let keep = egui::EventFilter { tab: true, horizontal_arrows: true, vertical_arrows: true, escape: true };
        ui.memory_mut(|m| m.set_focus_lock_filter(id, keep));
        if let Some(at) = self.caret_to.take() {
            let mut state = egui::text_edit::TextEditState::load(ui.ctx(), id).unwrap_or_default();
            let c = egui::text::CCursor::new(at);
            state.cursor.set_char_range(Some(egui::text::CCursorRange::one(c)));
            state.store(ui.ctx(), id);
        } else if let Some(r) = edit.cursor_range {
            self.caret = r.primary.ccursor.index;
        }
        let names_now = self.names.lock().unwrap().0;
        let fresh_names = names_now != self.names_seen && !matches!(self.popup, Popup::Vaults { .. });
        self.names_seen = names_now;
        if edit.response.changed() || fresh_names || (self.first && !self.text.is_empty()) {
            self.refresh();
        }

        // the list under the text, lined up with the word it completes; the window grows to hold it
        let anchor = match &self.popup {
            Popup::Complete { items, sel } => {
                let start = self.text.get(..items[*sel].replace.start).map_or(0, |s| s.chars().count());
                let at = edit.galley.pos_from_ccursor(egui::text::CCursor::new(start));
                Some((edit.galley_pos.x + at.min.x - (8.0 + 15.0 + 8.0), edit.galley_pos.y + at.max.y))
            }
            Popup::Vaults { .. } => self.pill.map(|r| (r.right(), 0.0)),
            Popup::Closed => None,
        };
        if let Some((x, _)) = anchor {
            if self.floating {
                self.list_x = Some(x); // drawn under the card once the card is drawn (floating_frame)
            } else {
                ui.add_space(6.0);
                let room = ui.max_rect().x_range();
                self.list(ui, p, x, room, None);
            }
        }
        // the chips: what can go with the text
        ui.add_space(6.0);
        ui.horizontal(|ui| {
            ui.add_space(TEXT_X);
            if let Some(k) = self.extras.draw(ui, p) {
                self.extras.toggle(k);
            }
        });
        // a hairline, then the footer
        ui.add_space(8.0);
        let y = ui.cursor().top();
        let full = ui.max_rect().x_range();
        look::hline(ui.painter(), egui::Rangef::new(full.min - 2.0, full.max + 2.0), y, p.border); // on whole pixels: crisp at any scale
        ui.add_space(8.0);
        self.footer(ui, p)
    }

    /// The open list (completions or vaults): a card of rows, at most MOST_ROWS of them at once, within
    /// `room`; at `top` when floating (drawn over whatever is there, nothing allocated), else in the flow.
    /// → the list's rectangle.
    fn list(&mut self, ui: &mut egui::Ui, p: Palette, anchor_x: f32, room: egui::Rangef, top: Option<f32>) -> Option<Rect> {
        let ctx = ui.ctx().clone();
        let home = atlas_core::platform::dirs::home().unwrap_or_default().to_string_lossy().into_owned();
        let rows: Vec<(Icon, String, String)> = match &self.popup {
            Popup::Complete { items, .. } => items.iter().map(|s| (s.icon, s.label.clone(), s.detail.clone())).collect(),
            Popup::Vaults { .. } => self
                .vaults
                .iter()
                .map(|v| {
                    let path = v.path.display().to_string();
                    let short = if !home.is_empty() && path.starts_with(&home) { format!("~{}", &path[home.len()..]) } else { path };
                    (Icon::Vault, v.name.clone(), short)
                })
                .collect(),
            Popup::Closed => return None,
        };
        let sel = match self.popup {
            Popup::Complete { sel, .. } | Popup::Vaults { sel } => sel,
            Popup::Closed => 0,
        };
        let shown = rows.len().min(MOST_ROWS);
        let first = (sel + 1).saturating_sub(shown).min(rows.len() - shown);
        let width = rows.iter().map(|(_, l, d)| look::row_width(&ctx, l, d)).fold(220.0_f32, f32::max).min(room.span()) + 2.0 * POP_PAD;
        let width = width.min(room.span());
        let left = match self.popup {
            Popup::Vaults { .. } => anchor_x - width, // right-aligned with the vault pill below it
            _ => anchor_x - POP_PAD,
        }
        .clamp(room.min, room.max - width);
        let height = shown as f32 * ROW + 2.0 * POP_PAD;
        let y = match top {
            Some(y) => y,
            None => ui.allocate_exact_size(vec2(ui.available_width(), height), egui::Sense::hover()).0.top(),
        };
        let card = Rect::from_min_size(egui::pos2(left, y), vec2(width, height));
        look::card(ui.painter(), card, p);
        let mut clicked = None;
        for (i, (icon, label, detail)) in rows.iter().enumerate().skip(first).take(shown) {
            let top = card.top() + POP_PAD + (i - first) as f32 * ROW;
            let r = Rect::from_min_size(egui::pos2(card.left() + POP_PAD, top), vec2(width - 2.0 * POP_PAD, ROW));
            if look::row(ui, r, p, *icon, label, detail, i == sel).clicked() {
                clicked = Some(i);
            }
        }
        if rows.len() > shown {
            // more than fit: a thin bar says where the shown rows are
            let track = card.shrink2(vec2(2.0, POP_PAD + 2.0));
            let h = track.height() * shown as f32 / rows.len() as f32;
            let y = track.top() + track.height() * first as f32 / rows.len() as f32;
            ui.painter().rect_filled(Rect::from_min_size(egui::pos2(card.right() - 4.0, y), vec2(2.0, h)), 1.0, p.border_strong);
        }
        if let Some(i) = clicked {
            match self.popup {
                Popup::Vaults { .. } => self.choose_vault(i),
                Popup::Complete { ref mut sel, .. } => {
                    *sel = i;
                    self.take();
                }
                Popup::Closed => {}
            }
        }
        Some(card)
    }

    /// The line under the text: what it becomes (or the guides), the keys, the vault.
    fn footer(&mut self, ui: &mut egui::Ui, p: Palette) -> f32 {
        let row = ui.horizontal(|ui| {
            ui.set_height(19.0);
            ui.spacing_mut().item_spacing.x = 5.0;
            ui.add_space(TEXT_X);
            if let Some(form) = self.status(ui, p) {
                self.start_with(form);
            }
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.spacing_mut().item_spacing.x = 5.0;
                let listing = matches!(self.popup, Popup::Complete { .. } | Popup::Vaults { .. });
                if listing {
                    look::note(ui, p, "back");
                    look::key(ui, p, "Esc").on_hover_text("Close the list, keep the text");
                    ui.add_space(3.0);
                    look::note(ui, p, "take");
                    look::key(ui, p, "Enter").on_hover_text("Put the chosen entry in the text");
                    ui.add_space(3.0);
                    look::note(ui, p, "move");
                    look::key(ui, p, "Tab").on_hover_text("Next entry (Shift+Tab: the one before); ↑ / ↓ as well");
                    look::arrows(ui, p);
                } else {
                    look::note(ui, p, "close");
                    look::key(ui, p, "Esc").on_hover_text("Close the box without saving");
                    ui.add_space(3.0);
                    look::note(ui, p, "save");
                    look::key(ui, p, "Enter").on_hover_text("Save the capture (Shift+Enter: a new line)");
                }
                ui.add_space(10.0);
                self.vault_pill(ui, p, true);
            });
        });
        row.response.rect.bottom()
    }

    /// Starts the text with a guide's short form, as a tap on the phone does, and opens its suggestions (`[[`: the
    /// notes, `@`: the days).
    pub(crate) fn start_with(&mut self, form: &str) {
        self.text = form.to_string();
        self.caret = self.text.chars().count();
        self.caret_to = Some(self.caret);
        self.refresh();
    }

    /// Where the capture stands: saved, failed, saving, what the text becomes — or, with nothing typed, the guides,
    /// each a click that starts the text with it (→ the form clicked).
    fn status(&self, ui: &mut egui::Ui, p: Palette) -> Option<&'static str> {
        match &*self.phase.lock().unwrap() {
            Phase::Saved(to, _) => drop(ui.label(egui::RichText::new(format!("Saved to {to}")).size(look::SMALL).color(p.green))),
            Phase::Failed(why) => drop(ui.label(egui::RichText::new(format!("Not saved: {why}")).size(look::SMALL).color(p.red))),
            Phase::Sending => look::note(ui, p, "Saving…"),
            Phase::Typing if self.extras.failed().is_some() => {
                drop(ui.label(egui::RichText::new(self.extras.failed().unwrap_or_default()).size(look::SMALL).color(p.red)))
            }
            // the little guides: what the short forms do, while there is nothing typed — and no list open, whose own keys
            // (move, take, back) need the row (the vault list's hints ran over them)
            Phase::Typing if self.text.trim().is_empty() && matches!(self.popup, Popup::Complete { .. } | Popup::Vaults { .. }) => {}
            Phase::Typing if self.text.trim().is_empty() => {
                // (shown, what it starts the text with, what it is, an example)
                const GUIDES: [(&str, &str, &str, &str); 4] = [
                    ("[]", "[] ", "to-do", "A to-do — [] pay the rent @fri · todo: call Ada"),
                    ("@fri", "@", "date", "A date — @today, @tomorrow, @fri, @+3d, @2026-11-02 (on a to-do: when it is due)"),
                    ("[[", "[[", "link", "A link to a note — [[ then a few letters of its name"),
                    ("#", "#", "tag", "A tag — #idea, #physics"),
                ];
                let mut clicked = None;
                for (i, (shown, starts, what, tip)) in GUIDES.into_iter().enumerate() {
                    if i > 0 {
                        ui.add_space(4.0);
                    }
                    if look::code(ui, p, shown).on_hover_text(format!("{tip}\nClick to start with it")).clicked() {
                        clicked = Some(starts);
                    }
                    look::note(ui, p, what);
                }
                return clicked;
            }
            Phase::Typing => look::note(ui, p, &self.becomes()),
        }
        None
    }

    /// The vault it goes to; a click opens the list when there are several. `keycap`: Super+V beside it (desktop).
    fn vault_pill(&mut self, ui: &mut egui::Ui, p: Palette, keycap: bool) {
        let Some(name) = self.vault().map(|v| v.name.clone()) else { return };
        let many = self.vaults.len() > 1;
        let open = matches!(self.popup, Popup::Vaults { .. });
        let pill = look::pill(ui, p, &name, many, open);
        let pill = pill.on_hover_text(if many { "The vault it goes to: Super+V the next, Super+Shift+V the one before, a click the list" } else { "The vault it goes to" });
        self.pill = Some(pill.rect);
        if pill.clicked() {
            if open {
                self.popup = Popup::Closed;
            } else {
                self.open_vault_menu();
            }
        }
        if many && keycap {
            // the key beside what it changes
            ui.add_space(1.0);
            look::key(ui, p, "Super+V").on_hover_text("The next vault (Super+Shift+V: the one before; a click: the list)");
        }
    }
}

/// The capture's text: what was typed with the page after it; under it the clipboard's text, then each file's embed (the
/// file put beside today's note). Nothing typed: the clipboard's text, else the first file's name, is the line.
fn compose(root: &std::path::Path, typed: String, parts: Vec<Part>) -> anyhow::Result<String> {
    let mut line = typed;
    let (mut below, mut files) = (Vec::new(), Vec::new());
    for part in parts {
        match part {
            Part::Inline(s) => line = if line.is_empty() { s } else { format!("{line} {s}") },
            Part::Below(s) => below.push(s),
            Part::File { path, label } => files.push((path, label)),
        }
    }
    if line.is_empty() {
        line = if below.is_empty() { files.first().map_or(String::new(), |f| f.1.to_string()) } else { below.remove(0) };
    }
    for (path, label) in files {
        let name = path.file_name().map_or_else(|| format!("{label}.png"), |n| n.to_string_lossy().into_owned());
        below.push(send::attach(root, &name, &path)?.1);
    }
    Ok(std::iter::once(line).chain(below).collect::<Vec<_>>().join("\n"))
}

fn close(ctx: &egui::Context, why: &str) {
    eprintln!("atlas-capture: closing ({why})");
    ctx.send_viewport_cmd(egui::ViewportCommand::Close);
}
