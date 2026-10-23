//! Atlas's look in egui: the colours of ui/src/styles/tokens.css (dark and light), the UI font the
//! desktop has (Inter when installed, else Noto Sans), and the few pieces the box is made of — a
//! list's card and rows (the web lists' `.ta-complete`), a key chip, the vault pill.
use crate::icons::{self, Icon};
use egui::{self, vec2, Color32, FontData, FontDefinitions, FontFamily, FontId, Rect, Rounding, Stroke};

#[derive(Clone, Copy, Debug)]
pub struct Palette {
    pub bg: Color32,
    /// a list's card: one step above the box (lighter in dark, the same white with a shadow in light)
    pub pop: Color32,
    pub hover: Color32,
    pub border: Color32,
    pub border_strong: Color32,
    pub shadow: Color32,
    pub text: Color32,
    pub muted: Color32,
    pub faint: Color32,
    pub accent: Color32,
    pub accent_strong: Color32,
    pub accent_soft: Color32,
    pub purple: Color32,
    pub green: Color32,
    pub red: Color32,
    pub dark: bool,
}

const fn rgb(c: u32) -> Color32 {
    Color32::from_rgb((c >> 16) as u8, (c >> 8) as u8, c as u8)
}

/// `rgba(r, g, b, a)` of tokens.css, premultiplied as egui wants it.
const fn rgba(c: u32, a: f32) -> Color32 {
    const fn m(v: u32, a: f32) -> u8 {
        ((v & 0xff) as f32 * a + 0.5) as u8
    }
    Color32::from_rgba_premultiplied(m(c >> 16, a), m(c >> 8, a), m(c, a), (a * 255.0 + 0.5) as u8)
}

pub const DARK: Palette = Palette {
    bg: rgb(0x1f2229), pop: rgb(0x262a32), hover: rgba(0xffffff, 0.045), border: rgba(0xffffff, 0.07), border_strong: rgba(0xffffff, 0.12), shadow: rgba(0x000000, 0.35),
    text: rgb(0xdcdfe5), muted: rgb(0x9aa1ad), faint: rgb(0x767e8b), accent: rgb(0x8aa4ff), accent_strong: rgb(0xaabdff), accent_soft: rgba(0x8aa4ff, 0.12),
    purple: rgb(0xc4a7ff), green: rgb(0x86d1a0), red: rgb(0xf28b8f), dark: true,
};
pub const LIGHT: Palette = Palette {
    bg: rgb(0xffffff), pop: rgb(0xffffff), hover: rgba(0x0f172a, 0.045), border: rgba(0x0f172a, 0.085), border_strong: rgba(0x0f172a, 0.14), shadow: rgba(0x0f172a, 0.10),
    text: rgb(0x23272e), muted: rgb(0x5b6270), faint: rgb(0x767c89), accent: rgb(0x4864dd), accent_strong: rgb(0x3a52c4), accent_soft: rgba(0x4864dd, 0.1),
    purple: rgb(0x8150d6), green: rgb(0x2f9e5c), red: rgb(0xd4464f), dark: false,
};

/// The type sizes of the box (points): the text typed, a list's rows, the footer.
pub const TEXT: f32 = 16.0;
pub const ROW_TEXT: f32 = 13.5;
pub const SMALL: f32 = 12.0;
/// A list's row height and its card's padding.
pub const ROW: f32 = 26.0;
pub const POP_PAD: f32 = 4.0;

pub fn palette(ctx: &egui::Context) -> Palette {
    ctx.data(|d| d.get_temp(egui::Id::new("atlas-palette"))).unwrap_or(DARK)
}

pub fn apply(ctx: &egui::Context, p: Palette, font: Option<Vec<u8>>) {
    ctx.data_mut(|d| d.insert_temp(egui::Id::new("atlas-palette"), p));
    let mut v = if p.dark { egui::Visuals::dark() } else { egui::Visuals::light() };
    v.panel_fill = Color32::TRANSPARENT;
    v.window_fill = p.bg;
    // not override_text_color: that would also paint the placeholder as bright as typed text
    for w in [&mut v.widgets.noninteractive, &mut v.widgets.inactive, &mut v.widgets.hovered, &mut v.widgets.active] {
        w.fg_stroke = Stroke::new(1.0_f32, p.text);
    }
    v.selection.bg_fill = with_alpha(p.accent, if p.dark { 0.26 } else { 0.2 }); // --accent-sel
    v.selection.stroke = Stroke::new(1.0_f32, p.text);
    v.text_cursor.stroke = Stroke::new(2.0_f32, p.accent);
    v.widgets.hovered.weak_bg_fill = p.hover;
    v.widgets.inactive.weak_bg_fill = Color32::TRANSPARENT;
    ctx.set_visuals(v);
    ctx.style_mut(|s| {
        s.spacing.item_spacing = vec2(8.0, 0.0);
        s.interaction.selectable_labels = false;
    });
    if let Some(bytes) = font {
        let mut f = FontDefinitions::default();
        f.font_data.insert("ui".into(), FontData::from_owned(bytes));
        f.families.entry(FontFamily::Proportional).or_default().insert(0, "ui".into());
        ctx.set_fonts(f);
    }
}

pub fn with_alpha(c: Color32, a: f32) -> Color32 {
    Color32::from_rgba_unmultiplied(c.r(), c.g(), c.b(), (a * 255.0) as u8)
}

/// The desktop's UI font, read from the usual places (no font is bundled: the box stays small).
pub fn ui_font() -> Option<Vec<u8>> {
    const TRY: [&str; 4] = ["/usr/share/fonts/rsms-inter-fonts/Inter.ttc", "/usr/share/fonts/inter/Inter.ttc", "/usr/share/fonts/google-noto-vf/NotoSans[wght].ttf", "/usr/share/fonts/google-noto/NotoSans-Regular.ttf"];
    TRY.iter().find_map(|p| std::fs::read(p).ok())
}

/// Device pixels: what keeps edges crisp at any scale. A line 1 pt wide at a scale of 1.5 is 1.5 pixels, smeared
/// over two rows at half strength — and so is any 1-px line not centred on a pixel (the footer's hairline was, even
/// at scale 1). Edges are put on pixel boundaries, and a hairline is whole pixels (at least one, as a browser draws
/// a 1px border: floor(scale)).
#[derive(Clone, Copy)]
pub struct Px(pub f32);

impl Px {
    pub fn of(ctx: &egui::Context) -> Self {
        Self(ctx.pixels_per_point())
    }

    /// The nearest pixel boundary, in points.
    pub fn snap(self, v: f32) -> f32 {
        (v * self.0).round() / self.0
    }

    pub fn rect(self, r: Rect) -> Rect {
        Rect::from_min_max(egui::pos2(self.snap(r.min.x), self.snap(r.min.y)), egui::pos2(self.snap(r.max.x), self.snap(r.max.y)))
    }

    /// A hairline's width, in points.
    pub fn line(self) -> f32 {
        self.0.floor().max(1.0) / self.0
    }
}

/// A rectangle on pixel boundaries, filled, its outline the outermost hairline of pixels inside it.
pub fn crisp_rect(painter: &egui::Painter, rect: Rect, rounding: f32, fill: Color32, outline: Color32) {
    let px = Px::of(painter.ctx());
    let r = px.rect(rect);
    painter.rect_filled(r, Rounding::same(rounding), fill);
    if outline != Color32::TRANSPARENT {
        let t = px.line();
        painter.rect_stroke(r.shrink(t / 2.0), Rounding::same((rounding - t / 2.0).max(0.0)), Stroke::new(t, outline));
    }
}

/// A horizontal hairline whose top is at `y` (snapped), over `x`.
pub fn hline(painter: &egui::Painter, x: egui::Rangef, y: f32, color: Color32) {
    let px = Px::of(painter.ctx());
    let top = px.snap(y);
    painter.rect_filled(Rect::from_min_max(egui::pos2(px.snap(x.min), top), egui::pos2(px.snap(x.max), top + px.line())), Rounding::ZERO, color);
}

/// The window's edge (the growing box, X11): a hairline on its outermost pixels.
pub fn edge(painter: &egui::Painter, rect: Rect, p: Palette) {
    crisp_rect(painter, rect, 0.0, Color32::TRANSPARENT, if p.dark { p.border_strong } else { with_alpha(p.text, 0.3) });
}

/// Around the floating box's card: the focused capture box's soft accent ring (the app's `.capture:focus-within`,
/// a 3 px `--accent-soft` ring) and a shadow below it, as one shape drawn under the card.
pub fn card_halo(rect: Rect, p: Palette) -> egui::Shape {
    let mut shapes = Vec::new();
    for (grow, alpha) in [(10.0, 0.10), (6.0, 0.16), (3.0, 0.22)] {
        shapes.push(egui::Shape::rect_filled(rect.translate(vec2(0.0, 4.0)).expand(grow), Rounding::same(12.0 + grow), p.shadow.gamma_multiply(alpha)));
    }
    shapes.push(egui::Shape::rect_filled(rect.expand(3.0), Rounding::same(15.0), p.accent_soft));
    egui::Shape::Vec(shapes)
}

/// A list's card (completions, the vault menu): a raised surface with a border and a soft shadow.
pub fn card(painter: &egui::Painter, rect: Rect, p: Palette) {
    for (grow, alpha) in [(3.0, 0.25), (1.5, 0.5)] {
        painter.rect_filled(rect.translate(vec2(0.0, 2.0)).expand(grow), Rounding::same(8.0 + grow), p.shadow.gamma_multiply(alpha));
    }
    painter.rect(rect, Rounding::same(8.0), p.pop, Stroke::new(1.0_f32, p.border_strong));
}

/// One row of a list: the icon, the label, the hint faint at the right; the chosen one on the accent's tint.
pub fn row(ui: &mut egui::Ui, rect: Rect, p: Palette, icon: Icon, label: &str, detail: &str, chosen: bool) -> egui::Response {
    let resp = ui.interact(rect, ui.id().with(("row", rect.min.y as i32)), egui::Sense::click());
    let painter = ui.painter();
    if chosen || resp.hovered() {
        painter.rect_filled(rect, Rounding::same(5.0), if chosen { p.accent_soft } else { p.hover });
    }
    let icon_rect = Rect::from_center_size(rect.left_center() + vec2(8.0 + 7.5, 0.0), vec2(15.0, 15.0));
    icons::paint(painter, icon_rect, icon, if chosen { p.accent_strong } else { p.muted });
    let detail_w = if detail.is_empty() {
        0.0
    } else {
        let g = painter.layout_no_wrap(detail.to_string(), FontId::proportional(SMALL), p.faint);
        let w = g.size().x;
        painter.galley(rect.right_center() - vec2(10.0 + w, g.size().y / 2.0), g, p.faint);
        w + 16.0
    };
    let left = icon_rect.right() + 8.0;
    let room = (rect.right() - 10.0 - detail_w - left).max(0.0);
    let mut job = egui::text::LayoutJob::simple_singleline(label.to_string(), FontId::proportional(ROW_TEXT), p.text);
    // cut with "…" rather than clipped (UI-STYLE §6)
    job.wrap = egui::text::TextWrapping { max_width: room, max_rows: 1, break_anywhere: true, overflow_character: Some('…') };
    let g = painter.layout_job(job);
    painter.galley(egui::pos2(left, rect.center().y - g.size().y / 2.0), g, p.text);
    resp
}

/// The width a row needs to show `label` and `detail` whole (a list is as wide as its widest row).
pub fn row_width(ctx: &egui::Context, label: &str, detail: &str) -> f32 {
    ctx.fonts(|f| {
        let w = |t: &str, size: f32| if t.is_empty() { 0.0 } else { f.layout_no_wrap(t.to_string(), FontId::proportional(size), Color32::WHITE).size().x };
        8.0 + 15.0 + 8.0 + w(label, ROW_TEXT) + if detail.is_empty() { 0.0 } else { 16.0 + w(detail, SMALL) } + 10.0
    })
}

/// Atlas's tile (the sidebar's brand: accent → purple, an "A"), its corners rounded.
pub fn brand(ui: &mut egui::Ui, p: Palette, size: f32) {
    use std::f32::consts::{FRAC_PI_2, PI};
    let (rect, _) = ui.allocate_exact_size(vec2(size, size), egui::Sense::hover());
    let r = size * 0.28;
    let corner = |c: egui::Pos2, from: f32| (0..=6).map(move |i| c + egui::Vec2::angled(from + FRAC_PI_2 * i as f32 / 6.0) * r);
    let outline: Vec<egui::Pos2> = corner(rect.right_top() + vec2(-r, r), -FRAC_PI_2)
        .chain(corner(rect.right_bottom() + vec2(-r, -r), 0.0))
        .chain(corner(rect.left_bottom() + vec2(r, -r), FRAC_PI_2))
        .chain(corner(rect.left_top() + vec2(r, r), PI))
        .collect();
    // a diagonal gradient, accent at the top left to purple at the bottom right; the outline as a fan
    let colour = |q: egui::Pos2| p.accent.lerp_to_gamma(p.purple, (((q.x - rect.left()) + (q.y - rect.top())) / (2.0 * size)).clamp(0.0, 1.0));
    let mut mesh = egui::Mesh::default();
    mesh.colored_vertex(rect.center(), colour(rect.center()));
    for q in &outline {
        mesh.colored_vertex(*q, colour(*q));
    }
    let n = outline.len() as u32;
    for i in 0..n {
        mesh.add_triangle(0, 1 + i, 1 + (i + 1) % n);
    }
    ui.painter().add(egui::Shape::mesh(mesh));
    let ink = if p.dark { rgb(0x0b0d12) } else { Color32::WHITE }; // --accent-fg
    ui.painter().text(rect.center() + vec2(0.0, 0.5), egui::Align2::CENTER_CENTER, "A", FontId::proportional(size * 0.55), ink);
}

/// A key, quiet: the web box's `<kbd>`. → its response, for a tooltip saying what it does.
pub fn key(ui: &mut egui::Ui, p: Palette, text: &str) -> egui::Response {
    let galley = ui.painter().layout_no_wrap(text.to_string(), FontId::proportional(10.5), p.muted);
    let size = vec2((galley.size().x + 9.0).max(18.0), 17.0);
    let (rect, resp) = ui.allocate_exact_size(size, egui::Sense::hover());
    ui.painter().rect(rect, Rounding::same(4.0), p.hover, Stroke::new(1.0_f32, p.border));
    ui.painter().galley(rect.center() - galley.size() / 2.0, galley, p.muted);
    resp
}

/// The arrow keys as one chip, drawn (the UI fonts at hand may have no arrows).
pub fn arrows(ui: &mut egui::Ui, p: Palette) {
    let (rect, _) = ui.allocate_exact_size(vec2(26.0, 17.0), egui::Sense::hover());
    ui.painter().rect(rect, Rounding::same(4.0), p.hover, Stroke::new(1.0_f32, p.border));
    for (dx, icon) in [(-4.5, Icon::ArrowUp), (4.5, Icon::ArrowDown)] {
        icons::paint(ui.painter(), Rect::from_center_size(rect.center() + vec2(dx, 0.0), vec2(10.0, 10.0)), icon, p.muted);
    }
}

/// A short form in a guide (`[]`, `@fri`): the web hints' `<code>`. A click puts it in the text, as a tap does on the
/// phone; hovered, it looks clickable (more contrast, the hand).
pub fn code(ui: &mut egui::Ui, p: Palette, text: &str) -> egui::Response {
    let width = ui.painter().layout_no_wrap(text.to_string(), FontId::monospace(11.0), p.muted).size().x;
    let (rect, resp) = ui.allocate_exact_size(vec2(width + 8.0, 17.0), egui::Sense::click());
    let (fill, ink) = if resp.hovered() { (p.accent_soft, p.accent_strong) } else { (p.hover, p.muted) };
    let galley = ui.painter().layout_no_wrap(text.to_string(), FontId::monospace(11.0), ink);
    ui.painter().rect_filled(rect, Rounding::same(4.0), fill);
    ui.painter().galley(rect.center() - galley.size() / 2.0, galley, ink);
    resp.on_hover_cursor(egui::CursorIcon::PointingHand)
}

/// The vault, as a pill on the accent's tint; with `menu`, a chevron says a click lists the others.
pub fn pill(ui: &mut egui::Ui, p: Palette, text: &str, menu: bool, open: bool) -> egui::Response {
    let galley = ui.painter().layout_no_wrap(text.to_string(), FontId::proportional(11.5), p.accent_strong);
    let extra = if menu { 12.0 } else { 0.0 };
    let (rect, resp) = ui.allocate_exact_size(vec2(galley.size().x + 16.0 + extra, 19.0), egui::Sense::hover());
    // clicked over 24 px of height (UI-STYLE §4), though drawn 19 px tall
    let resp = if menu { ui.interact(rect.expand2(vec2(2.0, 2.5)), resp.id.with("click"), egui::Sense::click()) } else { resp };
    let fill = if resp.hovered() || open { p.accent_soft.gamma_multiply(1.8) } else { p.accent_soft };
    ui.painter().rect_filled(rect, Rounding::same(9.5), fill);
    ui.painter().galley(egui::pos2(rect.left() + 8.0, rect.center().y - galley.size().y / 2.0), galley, p.accent_strong);
    if !menu {
        return resp;
    }
    // a small chevron: up while closed (the menu opens above the footer), down while open
    let c = egui::pos2(rect.right() - 10.0, rect.center().y);
    let (tip, ends) = if open { (2.0, -1.5) } else { (-1.5, 2.0) };
    let s = Stroke::new(1.4_f32, p.accent_strong);
    ui.painter().line_segment([c + vec2(-3.0, ends), c + vec2(0.0, tip)], s);
    ui.painter().line_segment([c + vec2(0.0, tip), c + vec2(3.0, ends)], s);
    resp.on_hover_cursor(egui::CursorIcon::PointingHand)
}

/// Faint footer text.
pub fn note(ui: &mut egui::Ui, p: Palette, text: &str) {
    ui.label(egui::RichText::new(text).size(SMALL).color(p.faint));
}
