//! The app's own line icons (ui/src/lib/icons.ts: 24×24 geometry, stroke 1.75), drawn with egui's
//! painter so the box's rows look like the web lists' rows. Only the few the box needs; the shapes
//! are the same SVG path strings — read by a small path reader on the desktop (src/icon_paint.rs), turned into
//! vector drawables for the phone (`svg`).
#[cfg(feature = "window")]
pub use crate::icon_paint::paint;

/// What a row shows at its left. A closed set: a new kind of row needs a picture here.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Icon {
    Return,
    Calendar,
    Clock,
    Flag,
    Plus,
    Check,
    ChevronsUp,
    ChevronsDown,
    Repeat,
    Note,
    Tag,
    Vault,
    ArrowUp,
    ArrowDown,
    Image,
    Clipboard,
    Server,
    Close,
    Link,
    Search,
    Settings,
    Today,
    /// the phone app's shell (crates/atlas-android): Back, the menu, the open tabs
    Back,
    More,
    Tabs,
    /// a row that opens a list (a folder in Files)
    Chevron,
    /// the phone app's menu: the commands
    Command,
    /// the phone's capture box: what is playing (a media session)
    Music,
    /// the phone's capture box: Draw
    Pen,
    /// the Boox pen screen's tools (plugins/beta/notepad)
    Undo,
    Redo,
    Eraser,
    Lasso,
    Shapes,
    Pages,
    Grid,
    Text,
    /// the notepad's pages island: the page before
    ChevronLeft,
    /// the notepad's menu island (Excalidraw's hamburger)
    Menu,
    /// the notepad's shapes menu, one per shape it draws
    Line,
    Arrow,
    Rectangle,
    Ellipse,
    Diamond,
    Triangle,
    Axes,
    AxesFull,
    /// the notepad's lasso bar
    Duplicate,
    Trash,
    Palette,
    Cut,
    /// the readers' bars (plugins/beta/books, manga): contents, a bookmark, the highlighter, text size, the notes
    Contents,
    Bookmark,
    Highlighter,
    TypeSize,
    Notes,
    /// the phone app's fullscreen: in, and back out
    Maximize,
    Minimize,
    /// the phone app's bottom bar: the vault's libraries
    Library,
}

impl Icon {
    pub const ALL: [Icon; 59] = [
        Icon::Return, Icon::Calendar, Icon::Clock, Icon::Flag, Icon::Plus, Icon::Check, Icon::ChevronsUp, Icon::ChevronsDown, Icon::Repeat,
        Icon::Note, Icon::Tag, Icon::Vault, Icon::ArrowUp, Icon::ArrowDown, Icon::Image, Icon::Clipboard, Icon::Server, Icon::Close,
        Icon::Link, Icon::Search, Icon::Settings, Icon::Today, Icon::Back, Icon::More, Icon::Tabs, Icon::Chevron, Icon::Command,
        Icon::Music, Icon::Pen, Icon::Undo, Icon::Redo, Icon::Eraser, Icon::Lasso, Icon::Shapes, Icon::Pages, Icon::Grid, Icon::Menu, Icon::ChevronLeft,
        Icon::Text, Icon::Line, Icon::Arrow, Icon::Rectangle, Icon::Ellipse, Icon::Diamond, Icon::Triangle, Icon::Axes, Icon::AxesFull,
        Icon::Duplicate, Icon::Trash, Icon::Palette, Icon::Cut, Icon::Contents, Icon::Bookmark, Icon::Highlighter, Icon::TypeSize,
        Icon::Notes, Icon::Maximize, Icon::Minimize, Icon::Library,
    ];
}

pub(crate) enum Prim {
    Path(&'static str),
    Circle(f32, f32, f32),
    /// x, y, w, h, corner radius
    Rect(f32, f32, f32, f32, f32),
}

pub(crate) const PAGE: &str = "M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z";

pub(crate) fn prims(icon: Icon) -> &'static [Prim] {
    use Prim::*;
    match icon {
        Icon::Return => &[Path("M19 5.5v6a3 3 0 0 1-3 3H5.5"), Path("m9 10.5-4 4 4 4")],
        Icon::Calendar => &[Rect(4.0, 5.5, 16.0, 14.5, 2.0), Path("M4 10h16M8.5 3.5v4M15.5 3.5v4")],
        Icon::Clock => &[Circle(12.0, 12.0, 8.5), Path("M12 7.5V12l3 2")],
        Icon::Flag => &[Path("M5.5 21V4.5M5.5 4.5h11l-2.5 4 2.5 4h-11")],
        Icon::Plus => &[Path("M12 5v14M5 12h14")],
        Icon::Check => &[Path("m5 12.5 4.5 4.5L19 7.5")],
        Icon::ChevronsUp => &[Path("m7 11.5 5-5 5 5M7 17.5l5-5 5 5")],
        Icon::ChevronsDown => &[Path("m7 6.5 5 5 5-5M7 12.5l5 5 5-5")],
        Icon::Repeat => &[Path("M17 3.5 20 6.5 17 9.5"), Path("M4 11.5v-1a4 4 0 0 1 4-4h12M7 20.5 4 17.5 7 14.5"), Path("M20 12.5v1a4 4 0 0 1-4 4H4")],
        Icon::Note => &[Path(PAGE), Path("M14 3v5h5M9 13h6M9 17h4")],
        Icon::Tag => &[Path("M4 9h16M4 15h16M10 3 8 21M16 3l-2 18")],
        Icon::ArrowUp => &[Path("M12 19V5M5.5 11.5 12 5l6.5 6.5")],
        Icon::ArrowDown => &[Path("M12 5v14M5.5 12.5 12 19l6.5-6.5")],
        Icon::Image => &[Rect(3.0, 3.5, 18.0, 17.0, 2.5), Circle(9.0, 9.5, 1.8), Path("m21 15.5-4.5-4.5L6 20.5")],
        Icon::Clipboard => &[Rect(5.0, 5.0, 14.0, 16.0, 2.0), Rect(9.0, 3.0, 6.0, 4.0, 1.0)],
        Icon::Server => &[Rect(3.5, 4.0, 17.0, 7.0, 2.0), Rect(3.5, 13.0, 17.0, 7.0, 2.0), Path("M7.5 7.5h.01M7.5 16.5h.01")],
        Icon::Close => &[Path("M7 7l10 10M17 7 7 17")],
        Icon::Link => &[Path("M10 14a4.5 4.5 0 0 0 6.4 0l3-3A4.5 4.5 0 0 0 13 4.6l-1 1"), Path("M14 10a4.5 4.5 0 0 0-6.4 0l-3 3A4.5 4.5 0 0 0 11 19.4l1-1")],
        Icon::Search => &[Circle(11.0, 11.0, 6.5), Path("m20 20-4.3-4.3")],
        Icon::Settings => &[Circle(12.0, 12.0, 3.0), Path("M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z")],
        Icon::Today => &[Rect(3.0, 4.5, 18.0, 16.5, 2.5), Path("M8 2.5v4M16 2.5v4M3 10h18"), Path("M8.5 15l2.3 2.3L15.5 12.8")],
        Icon::Vault => &[Path("M4 6.5A2.5 2.5 0 0 1 6.5 4h3.3l2 2.2h5.7A2.5 2.5 0 0 1 20 8.7v8.8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z")],
        Icon::Back => &[Path("M15 5.5 8.5 12l6.5 6.5")],
        Icon::Chevron => &[Path("m9.5 6 6 6-6 6")],
        Icon::ChevronLeft => &[Path("m14.5 6-6 6 6 6")],
        Icon::Command => &[
            Path("M9 6.5V17.5M15 6.5V17.5M6.5 9H17.5M6.5 15H17.5"),
            Path("M9 6.5a2.5 2.5 0 1 0-2.5 2.5M15 6.5A2.5 2.5 0 1 1 17.5 9M9 17.5A2.5 2.5 0 1 1 6.5 15M15 17.5a2.5 2.5 0 1 0 2.5-2.5"),
        ],
        Icon::Music => &[Path("M9 18V5.5l11-2V16"), Circle(6.5, 18.0, 2.5), Circle(17.5, 16.0, 2.5)],
        Icon::More => &[Circle(12.0, 5.5, 0.9), Circle(12.0, 12.0, 0.9), Circle(12.0, 18.5, 0.9)],
        Icon::Tabs => &[Rect(4.0, 7.0, 13.0, 13.0, 2.0), Path("M8 4h9.5A2.5 2.5 0 0 1 20 6.5V16")],
        Icon::Pen => &[Path("M4 20h4L18.5 9.5a2.83 2.83 0 1 0-4-4L4 16v4"), Path("m13.5 6.5 4 4")],
        Icon::Undo => &[Path("M9 14 5 10l4-4"), Path("M5 10h11a4 4 0 1 1 0 8h-1")],
        Icon::Redo => &[Path("m15 14 4-4-4-4"), Path("M19 10H8a4 4 0 1 0 0 8h1")],
        Icon::Eraser => &[Path("M19 20H8.5l-4.2-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4L11.5 20"), Path("M18 13.3 11.7 7")],
        Icon::Lasso => &[Path("M7 22a5 5 0 0 1-2-4"), Path("M3.3 14A7 7 0 0 1 3 12c0-4.4 4-8 9-8s9 3.6 9 8-4 8-9 8a10 10 0 0 1-3-.5"), Circle(5.0, 16.0, 2.0)],
        Icon::Shapes => &[Path("M8.3 10a.7.7 0 0 1-.6-1.1l3.7-6a.7.7 0 0 1 1.2 0l3.7 6a.7.7 0 0 1-.6 1.1z"), Rect(3.0, 14.0, 7.0, 7.0, 1.0), Circle(17.5, 17.5, 3.5)],
        Icon::Pages => &[Rect(7.0, 3.0, 13.0, 15.0, 2.0), Path("M4 7v11.5A2.5 2.5 0 0 0 6.5 21H16")],
        Icon::Grid => &[Rect(3.0, 3.0, 18.0, 18.0, 2.0), Path("M3 9h18M3 15h18M9 3v18M15 3v18")],
        Icon::Text => &[Path("M6 4h12"), Path("M12 4v16")],
        Icon::Menu => &[Path("M4 6h16M4 12h16M4 18h16")],
        Icon::Line => &[Path("M5 19 19 5")],
        Icon::Arrow => &[Path("M5 19 19 5"), Path("M10 5h9v9")],
        Icon::Rectangle => &[Rect(3.0, 6.0, 18.0, 12.0, 1.5)],
        Icon::Ellipse => &[Path("M3 12a9 6.5 0 1 0 18 0a9 6.5 0 1 0-18 0")],
        Icon::Diamond => &[Path("M12 3 21 12 12 21 3 12z")],
        Icon::Triangle => &[Path("M12 4 21 20H3z")],
        Icon::Axes => &[Path("M5 20V3.5M5 20h15.5"), Path("m2.5 6 2.5-2.5L7.5 6M18 17.5l2.5 2.5-2.5 2.5"), Path("M9 18.5v3M13 18.5v3M3.5 15h3M3.5 11h3")],
        Icon::AxesFull => &[Path("M12 3v18M3 12h18"), Path("m9.5 5.5 2.5-2.5 2.5 2.5M18.5 9.5 21 12l-2.5 2.5"), Path("M7 10.5v3M16 10.5v3M10.5 7h3M10.5 16h3")],
        Icon::Duplicate => &[Rect(8.0, 8.0, 13.0, 13.0, 2.0), Path("M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3")],
        Icon::Trash => &[Path("M3.5 6.5h17M9 6.5V4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5v2"), Path("M5.5 6.5 6.5 19a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12.5M10 11v6M14 11v6")],
        Icon::Palette => &[Path("M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-4 3.5h-2a2 2 0 0 0-1.5 3.3c.6.7.3 2.2-1.5 2.2z"), Circle(7.5, 11.0, 1.2), Circle(10.5, 7.0, 1.2), Circle(15.5, 8.0, 1.2)],
        Icon::Contents => &[Path("M9 6h11M9 12h11M9 18h11"), Circle(4.5, 6.0, 1.0), Circle(4.5, 12.0, 1.0), Circle(4.5, 18.0, 1.0)],
        Icon::Library => &[Path("M5 4.5h3.5v15H5zM10.5 4.5H14v15h-3.5z"), Path("m16 5.2 3.3-.9 3.2 14.6-3.3.9z")],
        Icon::Bookmark => &[Path("M18 21l-6-4-6 4V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z")],
        Icon::Highlighter => &[Path("m9 11-6 6v3h9l3-3"), Path("m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4")],
        Icon::TypeSize => &[Path("m2.5 18 5-12 5 12M4.4 13.5h6.2"), Path("M15 18l3-7.5 3 7.5M16.1 15.3h3.8")],
        Icon::Notes => &[Path("M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z"), Path("M15 3v4a2 2 0 0 0 2 2h4M7.5 13h7M7.5 17h4")],
        Icon::Maximize => &[Path("M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3")],
        Icon::Minimize => &[Path("M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3")],
        Icon::Cut => &[Circle(6.0, 6.5, 3.0), Circle(6.0, 17.5, 3.0), Path("M20 4 8.5 15M14.5 13.5 20 20M8.5 9 11 11.5")],
    }
}

/// The icon as SVG path data, one string per stroke (24×24, stroke 1.75): the phone app's vector drawables are made
/// from these (crates/atlas-android, `res`), so both boxes draw the same pictures.
pub fn svg(icon: Icon) -> Vec<String> {
    prims(icon)
        .iter()
        .map(|p| match *p {
            Prim::Path(d) => d.to_string(),
            Prim::Circle(x, y, r) => format!("M{} {}a{r} {r} 0 1 0 {} 0a{r} {r} 0 1 0 {} 0", x - r, y, 2.0 * r, -2.0 * r),
            Prim::Rect(x, y, w, h, r) => format!(
                "M{} {y}h{}a{r} {r} 0 0 1 {r} {r}v{}a{r} {r} 0 0 1 -{r} {r}h-{}a{r} {r} 0 0 1 -{r} -{r}v-{}a{r} {r} 0 0 1 {r} -{r}z",
                x + r, w - 2.0 * r, h - 2.0 * r, w - 2.0 * r, h - 2.0 * r
            ),
        })
        .collect()
}
