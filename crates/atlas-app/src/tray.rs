//! The tray icon's model, the same on every system (docs/design/DESIGN-tray-background.md): what its menu lists in each
//! state and what each entry does. The drawers (tray_sni.rs on Linux, tray_tauri.rs on Windows and macOS) only show
//! this list and hand the chosen [`TrayAction`] back to the shell (background.rs).

/// What an entry of the tray's menu does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayAction {
    Show,
    Hide,
    Capture,
    /// Show Atlas and open the n-th unseen notice's note (newest first).
    OpenNotice(usize),
    MarkRead,
    ToggleQuiet,
    Quit,
}

/// One entry of the menu.
#[derive(Debug, Clone, PartialEq)]
pub enum TrayItem {
    Action { label: String, action: TrayAction },
    Check { label: String, checked: bool, action: TrayAction },
    Sub { label: String, items: Vec<TrayItem> },
    Separator,
}

/// A notice that came while nobody looked at Atlas.
#[derive(Debug, Clone, PartialEq)]
pub struct Unseen {
    pub title: String,
    pub source: Option<String>,
    pub open: Option<String>,
}

/// How many unseen notices the menu keeps.
pub const KEPT: usize = 8;

/// The tray's state: the window shown or not, the unseen notices (newest first), do not disturb.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Model {
    pub vault: String,
    pub shown: bool,
    pub unseen: Vec<Unseen>,
    /// Unseen notices counted, also those beyond [`KEPT`].
    pub unseen_count: usize,
    pub quiet: bool,
}

impl Model {
    /// A notice nobody looked at: first in the list.
    pub fn add_unseen(&mut self, u: Unseen) {
        self.unseen.insert(0, u);
        self.unseen.truncate(KEPT);
        self.unseen_count += 1;
    }

    pub fn mark_read(&mut self) {
        self.unseen.clear();
        self.unseen_count = 0;
    }

    /// Whether the icon asks for attention (its dotted form).
    pub fn attention(&self) -> bool {
        self.unseen_count > 0
    }

    pub fn tooltip(&self) -> String {
        let name = if self.vault.is_empty() { "Atlas".to_string() } else { format!("Atlas — {}", self.vault) };
        match self.unseen_count {
            0 => name,
            1 => format!("{name}: 1 new notice"),
            n => format!("{name}: {n} new notices"),
        }
    }

    pub fn menu(&self) -> Vec<TrayItem> {
        let act = |label: &str, action| TrayItem::Action { label: label.into(), action };
        let mut items = vec![if self.shown { act("Hide Atlas", TrayAction::Hide) } else { act("Show Atlas", TrayAction::Show) }, act("Quick capture", TrayAction::Capture)];
        if !self.unseen.is_empty() {
            let mut notices: Vec<TrayItem> = self.unseen.iter().enumerate().map(|(i, u)| act(&notice_label(u), TrayAction::OpenNotice(i))).collect();
            notices.push(TrayItem::Separator);
            notices.push(act("Mark all read", TrayAction::MarkRead));
            items.push(TrayItem::Separator);
            items.push(TrayItem::Sub { label: format!("Notices ({})", self.unseen_count), items: notices });
        }
        items.push(TrayItem::Separator);
        items.push(TrayItem::Check { label: "Do not disturb".into(), checked: self.quiet, action: TrayAction::ToggleQuiet });
        items.push(TrayItem::Separator);
        items.push(act("Quit Atlas", TrayAction::Quit));
        items
    }
}

/// A notice as a menu line: its title, and its source after a dash; cut to stay one readable line.
fn notice_label(u: &Unseen) -> String {
    let line = match &u.source {
        Some(s) if !s.is_empty() => format!("{} — {s}", u.title),
        _ => u.title.clone(),
    };
    let one: String = line.split_whitespace().collect::<Vec<_>>().join(" ");
    if one.chars().count() > 60 {
        format!("{}…", one.chars().take(59).collect::<String>())
    } else {
        one
    }
}

/// The icon in its attention form: a dot in the top-right corner, from RGBA pixels (row-major, `w`×`h`).
pub fn with_dot(rgba: &[u8], w: u32, h: u32) -> Vec<u8> {
    let mut out = rgba.to_vec();
    let r = (w.min(h) as f32 * 0.22).max(2.0);
    let (cx, cy) = (w as f32 - r - 0.5, r + 0.5);
    for y in 0..h {
        for x in 0..w {
            let d = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
            let i = ((y * w + x) * 4) as usize;
            if d <= r {
                // a warm red, legible on dark and light panels, with a light ring for separation
                out[i..i + 4].copy_from_slice(&[0xe5, 0x48, 0x4d, 0xff]);
            } else if d <= r + 1.2 {
                out[i..i + 4].copy_from_slice(&[0xff, 0xff, 0xff, 0xff]);
            }
        }
    }
    out
}

/// RGBA pixels made `to`×`to` (a box average when smaller; the tray draws ~22–48 px, and a 512 px icon would be 1 MB
/// on every read of the D-Bus property).
pub fn scaled(rgba: &[u8], w: u32, h: u32, to: u32) -> Vec<u8> {
    let mut out = vec![0u8; (to * to * 4) as usize];
    for y in 0..to {
        for x in 0..to {
            let (x0, x1) = (x * w / to, ((x + 1) * w / to).max(x * w / to + 1).min(w));
            let (y0, y1) = (y * h / to, ((y + 1) * h / to).max(y * h / to + 1).min(h));
            let mut sum = [0u32; 4];
            for sy in y0..y1 {
                for sx in x0..x1 {
                    let i = ((sy * w + sx) * 4) as usize;
                    // weighted by alpha, so transparent pixels do not darken the edges
                    let a = u32::from(rgba[i + 3]);
                    for c in 0..3 {
                        sum[c] += u32::from(rgba[i + c]) * a;
                    }
                    sum[3] += a;
                }
            }
            let n = (x1 - x0) * (y1 - y0);
            let o = ((y * to + x) * 4) as usize;
            for c in 0..3 {
                if let Some(v) = sum[c].checked_div(sum[3]) {
                    out[o + c] = v as u8;
                }
            }
            out[o + 3] = (sum[3] / n) as u8;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn labels(items: &[TrayItem]) -> Vec<String> {
        items
            .iter()
            .map(|i| match i {
                TrayItem::Action { label, .. } | TrayItem::Sub { label, .. } => label.clone(),
                TrayItem::Check { label, checked, .. } => format!("{label}{}", if *checked { " ✓" } else { "" }),
                TrayItem::Separator => "—".into(),
            })
            .collect()
    }

    #[test]
    fn the_menu_offers_show_or_hide_by_the_window_and_the_notices_only_when_there_are_some() {
        let mut m = Model { vault: "Notes".into(), ..Model::default() };
        assert_eq!(labels(&m.menu()), ["Show Atlas", "Quick capture", "—", "Do not disturb", "—", "Quit Atlas"]);
        assert!(!m.attention());
        assert_eq!(m.tooltip(), "Atlas — Notes");
        m.shown = true;
        m.quiet = true;
        m.add_unseen(Unseen { title: "Backup failed".into(), source: Some("schedule".into()), open: None });
        m.add_unseen(Unseen { title: "3 new mails".into(), source: None, open: Some("mail/x.md".into()) });
        let menu = m.menu();
        assert_eq!(labels(&menu), ["Hide Atlas", "Quick capture", "—", "Notices (2)", "—", "Do not disturb ✓", "—", "Quit Atlas"]);
        let TrayItem::Sub { items, .. } = &menu[3] else { panic!("no notices submenu") };
        assert_eq!(labels(items), ["3 new mails", "Backup failed — schedule", "—", "Mark all read"]);
        assert!(matches!(items[0], TrayItem::Action { action: TrayAction::OpenNotice(0), .. }), "newest first");
        assert!(m.attention());
        assert_eq!(m.tooltip(), "Atlas — Notes: 2 new notices");
        m.mark_read();
        assert!(!m.attention() && !labels(&m.menu()).iter().any(|l| l.starts_with("Notices")));
    }

    #[test]
    fn the_menu_keeps_the_newest_notices_but_counts_them_all() {
        let mut m = Model::default();
        for i in 0..KEPT + 3 {
            m.add_unseen(Unseen { title: format!("n{i}"), source: None, open: None });
        }
        assert_eq!(m.unseen.len(), KEPT);
        assert_eq!(m.unseen[0].title, format!("n{}", KEPT + 2));
        assert_eq!(m.tooltip(), format!("Atlas: {} new notices", KEPT + 3));
    }

    #[test]
    fn a_long_notice_is_one_short_line() {
        let l = notice_label(&Unseen { title: "a\nvery ".repeat(20), source: None, open: None });
        assert!(!l.contains('\n') && l.chars().count() == 60 && l.ends_with('…'));
    }

    #[test]
    fn a_scaled_icon_keeps_its_colours_and_its_transparency() {
        let (w, h) = (8, 8);
        let mut px = vec![0u8; (w * h * 4) as usize];
        for y in 0..h {
            for x in 0..w / 2 {
                px[((y * w + x) * 4) as usize..((y * w + x) * 4 + 4) as usize].copy_from_slice(&[10, 200, 30, 255]);
            }
        }
        let s = scaled(&px, w, h, 2);
        assert_eq!(&s[0..4], &[10, 200, 30, 255]);
        assert_eq!(s[7], 0, "the transparent half stays transparent");
    }

    #[test]
    fn the_dot_is_drawn_in_the_top_right_corner_only() {
        let (w, h) = (32, 32);
        let blank = vec![0u8; (w * h * 4) as usize];
        let dotted = with_dot(&blank, w, h);
        let px = |x: u32, y: u32| &dotted[((y * w + x) * 4) as usize..((y * w + x) * 4 + 4) as usize];
        assert_eq!(px(w - 8, 7), [0xe5, 0x48, 0x4d, 0xff]);
        assert_eq!(px(2, h - 3), [0, 0, 0, 0]);
    }
}
