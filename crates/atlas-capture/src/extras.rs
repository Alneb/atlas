//! Besides the text (docs/guides/CAPTURE.md): the chips under it — the page of the browser you were on, the clipboard, the last
//! screenshot, the screen — gathered in the background (context.rs), drawn here, and what the chosen ones add to a capture.
//! The page is on from the start; the rest wait for a click or their key.
use crate::context::{self, Clip, Page};
use crate::icons::Icon;
use crate::look::{self, Palette};
use egui::{vec2, Color32, FontId, Rect};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// A screenshot newer than this is offered as "Last screenshot" (one taken just before, to go with the capture).
const RECENT: Duration = Duration::from_secs(10 * 60);
/// How long the box stays drawn empty before the screen is taken, so it is not in the picture.
const HIDE_FIRST: Duration = Duration::from_millis(160);

/// What a chip is; also its order in the row and its key.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Kind {
    Link,
    Clipboard,
    /// the text last selected anywhere (the primary selection), as a quote
    Selection,
    Last,
    Screen,
    /// the song or video playing (MPRIS), last: after the screen and the link
    Playing,
}

impl Kind {
    pub fn key(self) -> &'static str {
        match self {
            Kind::Link => "Super+U",
            Kind::Clipboard => "Super+C",
            Kind::Selection => "Super+Q",
            Kind::Last => "Super+Shift+S",
            Kind::Screen => "Super+S",
            Kind::Playing => "Super+M",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum What {
    Link(Page),
    Text(String),
    Picture(PathBuf),
    /// Files copied in a file manager: each attached beside the day's log as it is.
    Files(Vec<PathBuf>),
}

/// One thing the box offers to add; the ones `on` go with the capture.
#[derive(Clone, Debug, PartialEq)]
pub struct Offer {
    pub kind: Kind,
    pub what: What,
    pub on: bool,
}

/// What a capture carries besides the typed text.
#[derive(Debug, PartialEq)]
pub enum Part {
    /// On the capture's line, after the text (the page's link).
    Inline(String),
    /// On a line of its own under it (the clipboard's text).
    Below(String),
    /// A file put beside today's note and embedded under the text; `label` is the capture's text when nothing was typed.
    File { path: PathBuf, label: &'static str },
}

#[derive(Default)]
struct Found {
    offers: Vec<Offer>,
    thumbs: Vec<(PathBuf, Thumb)>,
    failed: Option<String>,
}

enum Shot {
    Idle,
    Hiding(Instant),
    Taking,
}

pub struct Extras {
    found: Arc<Mutex<Found>>,
    pending: Arc<AtomicUsize>,
    shot: Shot,
    textures: HashMap<PathBuf, (egui::TextureHandle, egui::TextureHandle)>,
    /// What takes the screen: Spectacle; a stand-in in tests (they never touch the desktop).
    pub take_screen: fn() -> anyhow::Result<PathBuf>,
}

impl Default for Extras {
    fn default() -> Self {
        Self { found: Arc::default(), pending: Arc::default(), shot: Shot::Idle, textures: HashMap::new(), take_screen: context::take_screen }
    }
}

impl Extras {
    /// Looks for what to offer, each in its own thread: the box is on screen meanwhile.
    pub fn gather(&self) {
        // the window you were on: its picture first (taken now, offered off, thrown away unless chosen), then its page
        self.job(|offer| {
            let Some(w) = context::window_under() else { return };
            if let Ok(p) = context::window_shot(&w) {
                offer(Offer { kind: Kind::Screen, what: What::Picture(p), on: false });
            }
            if let Some(page) = context::browser_app(&w.class).and_then(|app| context::page(&w, &app)) {
                offer(Offer { kind: Kind::Link, what: What::Link(page), on: true });
            }
        });
        self.job(|offer| {
            let what = match context::clipboard() {
                // a copied link goes on the capture's line, as the page does; other text under it
                Some(Clip::Text(t)) => match link_alone(&t) {
                    Some(url) => What::Link(Page { url, title: String::new() }),
                    None => What::Text(t),
                },
                Some(Clip::Image(p)) => What::Picture(p),
                // one copied picture shows as one (its thumbnail); any other files as their names
                Some(Clip::Files(f)) => match <[PathBuf; 1]>::try_from(f) {
                    Ok([p]) if context::is_picture(&p) => What::Picture(p),
                    Ok([p]) => What::Files(vec![p]),
                    Err(f) => What::Files(f),
                },
                None => return,
            };
            offer(Offer { kind: Kind::Clipboard, what, on: false });
        });
        // the selection, off like the clipboard: it may be old (put() drops it when it is what was copied)
        self.job(|offer| {
            if let Some(t) = context::selection() {
                offer(Offer { kind: Kind::Selection, what: What::Text(t), on: false });
            }
        });
        // what is playing, offered off as on the phone: a YouTube video's link goes to the catalog with the capture
        self.job(|offer| {
            if let Some(page) = context::playing() {
                offer(Offer { kind: Kind::Playing, what: What::Link(page), on: false });
            }
        });
        self.job(|offer| {
            if let Some(p) = context::last_screenshot(RECENT) {
                offer(Offer { kind: Kind::Last, what: What::Picture(p), on: false });
            }
        });
    }

    /// Runs `find` in its own thread; each offer it makes shows as soon as it is made.
    fn job(&self, find: impl FnOnce(&dyn Fn(Offer)) + Send + 'static) {
        let (found, pending) = (self.found.clone(), self.pending.clone());
        pending.fetch_add(1, Ordering::SeqCst);
        std::thread::spawn(move || {
            find(&|o| put(&found, o));
            pending.fetch_sub(1, Ordering::SeqCst);
        });
    }

    /// For tests and screenshots: an offer as if found.
    pub fn offer(&self, o: Offer) {
        put(&self.found, o);
    }

    pub fn offers(&self) -> Vec<Offer> {
        self.found.lock().unwrap().offers.clone()
    }

    /// The box is drawn empty: the screen is being taken.
    pub fn hidden(&self) -> bool {
        !matches!(self.shot, Shot::Idle)
    }

    /// Once a frame: takes the screen once the box has been drawn empty, and keeps frames coming while anything is pending.
    pub fn tick(&mut self, ctx: &egui::Context) {
        if let Shot::Hiding(since) = self.shot {
            if since.elapsed() >= HIDE_FIRST {
                self.shot = Shot::Taking;
                let found = self.found.clone();
                let (pending, take) = (self.pending.clone(), self.take_screen);
                pending.fetch_add(1, Ordering::SeqCst);
                std::thread::spawn(move || {
                    match take() {
                        Ok(p) => put(&found, Offer { kind: Kind::Screen, what: What::Picture(p), on: true }),
                        Err(e) => found.lock().unwrap().failed = Some(format!("The screen was not taken: {e}")),
                    }
                    pending.fetch_sub(1, Ordering::SeqCst);
                });
            }
        }
        if matches!(self.shot, Shot::Taking) && self.pending.load(Ordering::SeqCst) == 0 {
            self.shot = Shot::Idle;
        }
        if self.hidden() || self.pending.load(Ordering::SeqCst) > 0 {
            ctx.request_repaint_after(Duration::from_millis(40));
        }
        // thumbnails decoded in the background, made textures here (the UI thread)
        let ready: Vec<(PathBuf, Thumb)> = std::mem::take(&mut self.found.lock().unwrap().thumbs);
        for (path, t) in ready {
            let name = path.display().to_string();
            let small = ctx.load_texture(format!("{name}#small"), t.small, egui::TextureOptions::LINEAR);
            let large = ctx.load_texture(format!("{name}#large"), t.large, egui::TextureOptions::LINEAR);
            self.textures.insert(path, (small, large));
        }
    }

    /// A chip's click or key: the screen is taken the first time, then turned on and off like the others.
    pub fn toggle(&mut self, kind: Kind) {
        let mut found = self.found.lock().unwrap();
        found.failed = None;
        match found.offers.iter_mut().find(|o| o.kind == kind) {
            Some(o) => o.on = !o.on,
            None if kind == Kind::Screen && !self.hidden() => self.shot = Shot::Hiding(Instant::now()),
            None => {}
        }
    }

    pub fn failed(&self) -> Option<String> {
        self.found.lock().unwrap().failed.clone()
    }

    /// What the chosen chips add to the capture.
    pub fn parts(&self) -> Vec<Part> {
        let found = self.found.lock().unwrap();
        found
            .offers
            .iter()
            .filter(|o| o.on)
            .flat_map(|o| match (&o.what, o.kind) {
                (What::Link(p), _) => vec![Part::Inline(p.markdown())],
                (What::Text(t), Kind::Selection) => vec![Part::Below(quote(t))],
                (What::Text(t), _) => vec![Part::Below(t.clone())],
                (What::Picture(p), k) => vec![Part::File { path: p.clone(), label: label(k) }],
                (What::Files(f), k) => f.iter().map(|p| Part::File { path: p.clone(), label: label(k) }).collect(),
            })
            .collect()
    }

    /// The row of chips; → the kind clicked.
    pub fn draw(&mut self, ui: &mut egui::Ui, p: Palette) -> Option<Kind> {
        let mut offers = self.offers();
        if !offers.iter().any(|o| o.kind == Kind::Screen) {
            // not taken yet: the chip that takes it
            offers.push(Offer { kind: Kind::Screen, what: What::Text(String::new()), on: false });
        }
        let mut clicked = None;
        ui.horizontal(|ui| {
            ui.spacing_mut().item_spacing.x = 6.0;
            // the labels share what room the row has: long ones (a page title, copied text) are cut to fit, never the row
            // the keys beside the labels while there is room; else in each chip's hover note, the labels kept readable
            // the keys are in each chip's hover note, not drawn: the row stays a few plain words
            let fixed = offers.iter().map(|o| self.frame_width(o)).sum::<f32>() + 6.0 * offers.len() as f32;
            let mut room = (ui.available_width() - fixed).max(0.0);
            let mut wants: Vec<(usize, f32)> = offers.iter().enumerate().map(|(i, o)| (i, text_width(ui, &self.text_of(o)))).collect();
            wants.sort_by(|a, b| a.1.total_cmp(&b.1));
            let mut give = vec![0.0; offers.len()];
            for (n, (i, w)) in wants.iter().enumerate() {
                let share = room / (offers.len() - n) as f32;
                give[*i] = w.min(share);
                room -= give[*i];
            }
            for (o, max) in offers.iter().zip(give) {
                if self.chip(ui, p, o, max).clicked() {
                    clicked = Some(o.kind);
                }
            }
        });
        clicked
    }

    fn text_of(&self, o: &Offer) -> String {
        match &o.what {
            What::Link(page) => short(if page.title.is_empty() { &page.url } else { &page.title }, 60),
            What::Text(t) if matches!(o.kind, Kind::Clipboard | Kind::Selection) => short(t, 60),
            What::Files(f) if f.len() == 1 => short(&f[0].file_name().unwrap_or_default().to_string_lossy(), 60),
            What::Files(f) => format!("{} files", f.len()),
            _ if o.kind == Kind::Screen && self.hidden() => "Taking the screen…".to_string(),
            _ => label(o.kind).to_string(),
        }
    }

    fn thumb_of(&self, o: &Offer) -> Option<&(egui::TextureHandle, egui::TextureHandle)> {
        match &o.what {
            What::Picture(path) => self.textures.get(path),
            _ => None,
        }
    }

    /// A chip's width without its label: the edges, the icon or thumbnail.
    fn frame_width(&self, o: &Offer) -> f32 {
        let lead = if self.thumb_of(o).is_some() { 26.0 } else { 14.0 };
        7.0 + lead + 6.0 + 8.0
    }

    fn chip(&self, ui: &mut egui::Ui, p: Palette, o: &Offer, max_label: f32) -> egui::Response {
        let thumb = self.thumb_of(o);
        let fg = if o.on { p.text } else { p.muted };
        let text = fit(ui, &self.text_of(o), max_label);
        let galley = ui.painter().layout_no_wrap(text, FontId::proportional(look::SMALL), fg);
        let lead = if thumb.is_some() { 26.0 } else { 14.0 };
        let width = self.frame_width(o) + galley.size().x;
        let (rect, resp) = ui.allocate_exact_size(vec2(width, 22.0), egui::Sense::click());
        let (fill, edge) = if o.on {
            (p.accent_soft, look::with_alpha(p.accent, 0.7))
        } else if resp.hovered() {
            (p.hover, p.border_strong)
        } else {
            (p.hover, p.border)
        };
        look::crisp_rect(ui.painter(), rect, 11.0, fill, edge);
        let mut x = rect.left() + 7.0;
        if let Some((small, _)) = thumb {
            let r = Rect::from_min_size(egui::pos2(x, rect.top() + 4.0), vec2(lead, 14.0));
            ui.painter().image(small.id(), r, cover_uv(small.size_vec2(), r.size()), Color32::WHITE);
        } else {
            let icon = match o.kind {
                Kind::Link => Icon::Link,
                Kind::Clipboard if o.on => Icon::Check,
                Kind::Clipboard => Icon::Clipboard,
                Kind::Selection if o.on => Icon::Check,
                Kind::Selection => Icon::Note,
                Kind::Last | Kind::Screen => Icon::Image,
                Kind::Playing => Icon::Music,
            };
            crate::icons::paint(ui.painter(), Rect::from_min_size(egui::pos2(x, rect.center().y - 7.0), vec2(14.0, 14.0)), icon, if o.on { p.accent } else { p.muted });
        }
        x += lead + 6.0;
        let gy = rect.center().y - galley.size().y / 2.0;
        ui.painter().galley(egui::pos2(x, gy), galley, fg);
        let resp = resp.on_hover_cursor(egui::CursorIcon::PointingHand);
        let what = format!("{} · {}", self.text_of(o), o.kind.key());
        resp.on_hover_ui(|ui| {
            // the picture large while the pointer is on its chip
            if let Some((_, large)) = thumb {
                ui.add(egui::Image::new(egui::load::SizedTexture::new(large.id(), large.size_vec2())));
            }
            ui.label(egui::RichText::new(what).size(look::SMALL));
        })
    }
}

fn put(found: &Mutex<Found>, o: Offer) {
    let thumb = match &o.what {
        What::Picture(p) => thumb(p).map(|t| (p.clone(), t)),
        _ => None,
    };
    let mut f = found.lock().unwrap();
    f.offers.retain(|x| x.kind != o.kind);
    f.offers.push(o);
    f.offers.sort_by_key(|x| x.kind);
    // text selected and then copied is in both: offered once, as the clipboard
    let copied = f.offers.iter().find(|x| x.kind == Kind::Clipboard).map(|x| x.what.clone());
    f.offers.retain(|x| x.kind != Kind::Selection || copied.as_ref() != Some(&x.what));
    f.thumbs.extend(thumb);
}

/// The text when it is one web address and nothing else (spaces around it aside).
fn link_alone(t: &str) -> Option<String> {
    let t = t.trim();
    let rest = t.strip_prefix("https://").or_else(|| t.strip_prefix("http://"))?;
    (!rest.is_empty() && !t.contains(char::is_whitespace)).then(|| t.to_string())
}

/// Text as a Markdown quote, line by line.
fn quote(t: &str) -> String {
    t.lines().map(|l| if l.trim().is_empty() { ">".to_string() } else { format!("> {l}") }).collect::<Vec<_>>().join("\n")
}

fn label(k: Kind) -> &'static str {
    match k {
        Kind::Link => "Page",
        Kind::Clipboard => "Clipboard",
        Kind::Selection => "Selection",
        Kind::Last => "Last screenshot",
        Kind::Screen => "Screen",
        Kind::Playing => "Playing",
    }
}

fn text_width(ui: &egui::Ui, s: &str) -> f32 {
    ui.painter().layout_no_wrap(s.to_string(), FontId::proportional(look::SMALL), Color32::WHITE).size().x
}

/// The text cut (with "…") to at most `max` points wide.
fn fit(ui: &egui::Ui, s: &str, max: f32) -> String {
    if text_width(ui, s) <= max {
        return s.to_string();
    }
    let chars: Vec<char> = s.chars().collect();
    let (mut lo, mut hi) = (0, chars.len());
    while lo < hi {
        let mid = (lo + hi).div_ceil(2);
        let t: String = chars[..mid].iter().collect::<String>().trim_end().to_string() + "…";
        if text_width(ui, &t) <= max {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    chars[..lo].iter().collect::<String>().trim_end().to_string() + "…"
}

fn short(s: &str, n: usize) -> String {
    let one = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if one.chars().count() > n {
        format!("{}…", one.chars().take(n).collect::<String>())
    } else {
        one
    }
}

/// The part of a picture that fills `to` without stretching it (cropped at the sides or the ends).
fn cover_uv(img: egui::Vec2, to: egui::Vec2) -> Rect {
    let (ia, ta) = (img.x / img.y.max(1.0), to.x / to.y.max(1.0));
    if ia > ta {
        let w = ta / ia;
        Rect::from_min_max(egui::pos2((1.0 - w) / 2.0, 0.0), egui::pos2((1.0 + w) / 2.0, 1.0))
    } else {
        let h = ia / ta;
        Rect::from_min_max(egui::pos2(0.0, (1.0 - h) / 2.0), egui::pos2(1.0, (1.0 + h) / 2.0))
    }
}

/// A picture, small for its chip and large for the look on hover.
struct Thumb {
    small: egui::ColorImage,
    large: egui::ColorImage,
}

/// PNG only (what Spectacle and the clipboard give); another format gets the icon instead.
fn thumb(path: &Path) -> Option<Thumb> {
    let file = std::fs::File::open(path).ok()?;
    let mut dec = png::Decoder::new(std::io::BufReader::new(file));
    dec.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = dec.read_info().ok()?;
    let mut buf = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).ok()?;
    let (w, h) = (info.width as usize, info.height as usize);
    let channels = match info.color_type {
        png::ColorType::Rgba => 4,
        png::ColorType::Rgb => 3,
        png::ColorType::GrayscaleAlpha => 2,
        png::ColorType::Grayscale => 1,
        png::ColorType::Indexed => return None, // expanded by the transformations above; never here
    };
    let px = |i: usize| -> [u8; 4] {
        let s = &buf[i * channels..i * channels + channels];
        match channels {
            4 => [s[0], s[1], s[2], s[3]],
            3 => [s[0], s[1], s[2], 255],
            2 => [s[0], s[0], s[0], s[1]],
            _ => [s[0], s[0], s[0], 255],
        }
    };
    let rgba: Vec<[u8; 4]> = (0..w * h).map(px).collect();
    Some(Thumb { small: shrink(&rgba, w, h, 52.0, 28.0), large: shrink(&rgba, w, h, 440.0, 250.0) })
}

/// Fits the picture in max_w × max_h, each pixel the average of the ones it covers.
fn shrink(rgba: &[[u8; 4]], w: usize, h: usize, max_w: f32, max_h: f32) -> egui::ColorImage {
    let k = (max_w / w as f32).min(max_h / h as f32).min(1.0);
    let (tw, th) = (((w as f32 * k).round() as usize).max(1), ((h as f32 * k).round() as usize).max(1));
    let mut out = Vec::with_capacity(tw * th);
    for ty in 0..th {
        let (y0, y1) = (ty * h / th, ((ty + 1) * h / th).max(ty * h / th + 1));
        for tx in 0..tw {
            let (x0, x1) = (tx * w / tw, ((tx + 1) * w / tw).max(tx * w / tw + 1));
            let mut sum = [0u32; 4];
            for y in y0..y1 {
                for x in x0..x1 {
                    for (c, v) in rgba[y * w + x].iter().enumerate() {
                        sum[c] += *v as u32;
                    }
                }
            }
            let n = ((y1 - y0) * (x1 - x0)) as u32;
            out.push(Color32::from_rgba_unmultiplied((sum[0] / n) as u8, (sum[1] / n) as u8, (sum[2] / n) as u8, (sum[3] / n) as u8));
        }
    }
    egui::ColorImage { size: [tw, th], pixels: out }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_chosen_chips_become_parts() {
        let x = Extras::default();
        x.offer(Offer { kind: Kind::Screen, what: What::Picture("/tmp/s.png".into()), on: true });
        x.offer(Offer { kind: Kind::Link, what: What::Link(Page { url: "https://a.org/".into(), title: "A".into() }), on: true });
        x.offer(Offer { kind: Kind::Clipboard, what: What::Text("copied".into()), on: false });
        assert_eq!(x.parts(), [Part::Inline("[A](https://a.org/)".into()), Part::File { path: "/tmp/s.png".into(), label: "Screen" }]);
        let mut x = x;
        x.toggle(Kind::Clipboard);
        assert!(x.parts().contains(&Part::Below("copied".into())));
    }

    #[test]
    fn a_copied_link_alone_goes_on_the_line() {
        assert_eq!(link_alone("  https://a.org/x?y=1\n").as_deref(), Some("https://a.org/x?y=1"));
        assert_eq!(link_alone("see https://a.org/"), None, "words around it: text, under the line");
        assert_eq!(link_alone("https://"), None);
        assert_eq!(link_alone("ftp://a.org/"), None);
        let x = Extras::default();
        x.offer(Offer { kind: Kind::Clipboard, what: What::Link(Page { url: "https://a.org/".into(), title: String::new() }), on: true });
        assert_eq!(x.parts(), [Part::Inline("https://a.org/".into())]);
    }

    #[test]
    fn the_selection_is_a_quote_unless_it_was_copied() {
        let x = Extras::default();
        x.offer(Offer { kind: Kind::Selection, what: What::Text("spin liquid\n\nground state".into()), on: true });
        assert_eq!(x.parts(), [Part::Below("> spin liquid\n>\n> ground state".into())]);
        x.offer(Offer { kind: Kind::Clipboard, what: What::Text("spin liquid\n\nground state".into()), on: true });
        assert_eq!(x.parts(), [Part::Below("spin liquid\n\nground state".into())], "once, as the clipboard");
    }

    #[test]
    fn copied_files_each_go_beside_the_log() {
        let x = Extras::default();
        x.offer(Offer { kind: Kind::Clipboard, what: What::Files(vec!["/home/u/a.pdf".into(), "/home/u/b.csv".into()]), on: true });
        let file = |p: &str| Part::File { path: p.into(), label: "Clipboard" };
        assert_eq!(x.parts(), [file("/home/u/a.pdf"), file("/home/u/b.csv")]);
        assert!(context::is_picture(Path::new("/home/u/Photo.JPEG")) && !context::is_picture(Path::new("/home/u/a.pdf")));
    }

    #[test]
    fn a_picture_shrinks_to_fit() {
        let img = shrink(&vec![[10, 20, 30, 255]; 400 * 200], 400, 200, 52.0, 28.0);
        assert_eq!(img.size, [52, 26]);
        assert_eq!(img.pixels[0], Color32::from_rgba_unmultiplied(10, 20, 30, 255));
    }
}
