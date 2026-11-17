//! PDFium in the core: PDF covers on every platform (thumbs.rs), and on the phone (docs/design/DESIGN-pdfium-android.md)
//! the Books reader's pages drawn, their characters with their boxes, find and links — what Android's PdfRenderer
//! cannot give. The library (pdfium-binaries' build, `scripts/dev/fetch-pdfium.sh`) is loaded at run time, only the
//! functions used here: from the APK on the phone (`init`), from the install elsewhere (`ready`); without it every
//! call is an `Err` and the callers keep their fallback (pdftoppm, PdfRenderer). PDFium is not thread-safe: one lock
//! around all of it, one document open (the last asked). Places are PDF points, page space (y up), as the marks'.
use libloading::Library;
use std::ffi::{c_char, c_double, c_int, c_ulong, c_void, CString};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

type Doc = *mut c_void;
type Page = *mut c_void;
type TextPage = *mut c_void;
type Bitmap = *mut c_void;
type Search = *mut c_void;
type Link = *mut c_void;
type Bookmark = *mut c_void;

#[repr(C)]
#[derive(Default)]
struct SizeF {
    width: f32,
    height: f32,
}
#[repr(C)]
#[derive(Default)]
struct RectF {
    left: f32,
    top: f32,
    right: f32,
    bottom: f32,
}

/// `FPDF_ANNOT`: annotations drawn with the page; `FPDF_LCD_TEXT` off (an e-ink screen has no sub-pixels).
const RENDER_ANNOT: c_int = 0x01;
/// `FPDF_REVERSE_BYTE_ORDER`: R, G, B, A in memory — an Android ARGB_8888 bitmap's own layout.
const RENDER_RGBA: c_int = 0x10;
/// `PDFACTION_URI`, `PDFACTION_GOTO`.
const ACTION_URI: c_ulong = 3;
const ACTION_GOTO: c_ulong = 1;

macro_rules! api {
    ($($name:ident: fn($($arg:ty),*) -> $ret:ty;)*) => {
        #[allow(non_snake_case)]
        struct Api { _lib: Library, $($name: unsafe extern "C" fn($($arg),*) -> $ret,)* }
        impl Api {
            #[allow(non_snake_case)] // PDFium's own C names
            fn load(path: &Path) -> Result<Api, String> {
                // SAFETY: a library of PDFium's own C API; each symbol is read with the signature its header gives
                unsafe {
                    let lib = Library::new(path).map_err(|e| format!("{}: {e}", path.display()))?;
                    $(let $name = *lib.get::<unsafe extern "C" fn($($arg),*) -> $ret>(concat!(stringify!($name), "\0").as_bytes())
                        .map_err(|e| format!("{}: {e}", stringify!($name)))?;)*
                    Ok(Api { _lib: lib, $($name,)* })
                }
            }
        }
    };
}

api! {
    FPDF_InitLibrary: fn() -> ();
    FPDF_LoadDocument: fn(*const c_char, *const c_char) -> Doc;
    FPDF_CloseDocument: fn(Doc) -> ();
    FPDF_GetPageCount: fn(Doc) -> c_int;
    FPDF_GetPageSizeByIndexF: fn(Doc, c_int, *mut SizeF) -> c_int;
    FPDF_LoadPage: fn(Doc, c_int) -> Page;
    FPDF_ClosePage: fn(Page) -> ();
    FPDF_GetPageBoundingBox: fn(Page, *mut RectF) -> c_int;
    FPDFPage_GetRotation: fn(Page) -> c_int;
    FPDFBitmap_Create: fn(c_int, c_int, c_int) -> Bitmap;
    FPDFBitmap_FillRect: fn(Bitmap, c_int, c_int, c_int, c_int, c_ulong) -> c_int;
    FPDFBitmap_GetBuffer: fn(Bitmap) -> *mut u8;
    FPDFBitmap_GetStride: fn(Bitmap) -> c_int;
    FPDFBitmap_Destroy: fn(Bitmap) -> ();
    FPDF_RenderPageBitmap: fn(Bitmap, Page, c_int, c_int, c_int, c_int, c_int, c_int) -> ();
    FPDFText_LoadPage: fn(Page) -> TextPage;
    FPDFText_ClosePage: fn(TextPage) -> ();
    FPDFText_CountChars: fn(TextPage) -> c_int;
    FPDFText_GetUnicode: fn(TextPage, c_int) -> u32;
    FPDFText_GetCharBox: fn(TextPage, c_int, *mut c_double, *mut c_double, *mut c_double, *mut c_double) -> c_int;
    FPDFText_FindStart: fn(TextPage, *const u16, c_ulong, c_int) -> Search;
    FPDFText_FindNext: fn(Search) -> c_int;
    FPDFText_GetSchResultIndex: fn(Search) -> c_int;
    FPDFText_GetSchCount: fn(Search) -> c_int;
    FPDFText_FindClose: fn(Search) -> ();
    FPDFText_CountRects: fn(TextPage, c_int, c_int) -> c_int;
    FPDFText_GetRect: fn(TextPage, c_int, *mut c_double, *mut c_double, *mut c_double, *mut c_double) -> c_int;
    FPDFLink_Enumerate: fn(Page, *mut c_int, *mut Link) -> c_int;
    FPDFLink_GetAnnotRect: fn(Link, *mut RectF) -> c_int;
    FPDFLink_GetDest: fn(Doc, Link) -> *mut c_void;
    FPDFLink_GetAction: fn(Link) -> *mut c_void;
    FPDFAction_GetType: fn(*mut c_void) -> c_ulong;
    FPDFAction_GetDest: fn(Doc, *mut c_void) -> *mut c_void;
    FPDFAction_GetURIPath: fn(Doc, *mut c_void, *mut c_void, c_ulong) -> c_ulong;
    FPDFDest_GetDestPageIndex: fn(Doc, *mut c_void) -> c_int;
    FPDFBookmark_GetFirstChild: fn(Doc, Bookmark) -> Bookmark;
    FPDFBookmark_GetNextSibling: fn(Doc, Bookmark) -> Bookmark;
    FPDFBookmark_GetTitle: fn(Bookmark, *mut c_void, c_ulong) -> c_ulong;
    FPDFBookmark_GetDest: fn(Doc, Bookmark) -> *mut c_void;
    FPDFBookmark_GetAction: fn(Bookmark) -> *mut c_void;
}

/// A box in page points: left, bottom, right, top (y up).
pub type Box4 = [f32; 4];

/// Where a link goes.
#[derive(Debug, Clone, PartialEq)]
pub enum Target {
    /// a page of this document, 1-based
    Page(u32),
    Web(String),
}

/// One entry of a document's outline (its bookmarks, the table of contents), in reading order.
#[derive(Debug, Clone, PartialEq)]
pub struct Section {
    pub title: String,
    /// 0 for a top-level entry, one more per level below
    pub depth: u32,
    /// the page it goes to, 1-based; None when it goes nowhere in this document (a heading only, or a web address)
    pub page: Option<u32>,
}

/// Outlines deeper than this, or longer, are cut there: a malformed file can loop its siblings back on themselves.
const OUTLINE_DEPTH: u32 = 16;
const OUTLINE_MAX: usize = 10_000;

struct State {
    api: Api,
    open: Option<(PathBuf, Doc)>,
}
// SAFETY: the raw pointers are only used under the one lock below
unsafe impl Send for State {}

static PDFIUM: OnceLock<Result<Mutex<State>, String>> = OnceLock::new();

/// Loads the library once (`lib`: libpdfium.so's path); later calls use the first answer.
pub fn init(lib: &Path) -> Result<(), String> {
    PDFIUM
        .get_or_init(|| {
            let api = Api::load(lib)?;
            // SAFETY: called once, before any other PDFium call
            unsafe { (api.FPDF_InitLibrary)() };
            Ok(Mutex::new(State { api, open: None }))
        })
        .as_ref()
        .map(|_| ())
        .map_err(Clone::clone)
}

/// The library's file name on this system.
pub const LIB_NAME: &str = if cfg!(windows) { "pdfium.dll" } else if cfg!(target_os = "macos") { "libpdfium.dylib" } else { "libpdfium.so" };

/// Where an install keeps PDFium: `ATLAS_PDFIUM`, beside the executable, `../lib/atlas/` from it (the server image),
/// or `$XDG_DATA_HOME/atlas/lib/` (`packaging/install.sh`). Looked up once.
pub fn installed() -> Option<PathBuf> {
    static FOUND: OnceLock<Option<PathBuf>> = OnceLock::new();
    FOUND
        .get_or_init(|| {
            let exe = std::env::current_exe().ok().and_then(|e| e.parent().map(Path::to_path_buf));
            let mut places: Vec<PathBuf> = std::env::var_os("ATLAS_PDFIUM").map(PathBuf::from).into_iter().collect();
            places.extend(exe.iter().flat_map(|d| [d.join(LIB_NAME), d.join("../lib/atlas").join(LIB_NAME)]));
            places.push(crate::platform::dirs::atlas(crate::platform::dirs::Base::Data).join("lib").join(LIB_NAME));
            places.into_iter().find(|p| p.is_file())
        })
        .clone()
}

/// Whether PDFium can be used: loaded already (the phone's `init`), or the installed library loaded now.
pub fn ready() -> bool {
    match PDFIUM.get() {
        Some(r) => r.is_ok(),
        None => installed().is_some_and(|p| init(&p).is_ok()),
    }
}

/// Runs `f` with PDFium and `pdf` open (opened now when another one was).
fn with_doc<T>(pdf: &Path, f: impl FnOnce(&Api, Doc) -> Result<T, String>) -> Result<T, String> {
    let lock = PDFIUM.get().ok_or("PDFium was not loaded")?.as_ref().map_err(Clone::clone)?;
    let mut st = lock.lock().unwrap_or_else(|e| e.into_inner());
    if st.open.as_ref().map(|(p, _)| p.as_path()) != Some(pdf) {
        if let Some((_, d)) = st.open.take() {
            // SAFETY: a document this module opened and nothing else holds
            unsafe { (st.api.FPDF_CloseDocument)(d) };
        }
        let c = CString::new(pdf.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
        // SAFETY: a NUL-terminated path; no password
        let d = unsafe { (st.api.FPDF_LoadDocument)(c.as_ptr(), std::ptr::null()) };
        if d.is_null() {
            return Err(format!("{}: PDFium cannot open it", pdf.display()));
        }
        st.open = Some((pdf.to_path_buf(), d));
    }
    let doc = st.open.as_ref().expect("opened above").1;
    f(&st.api, doc)
}

/// Closes the open document, if any (a cover drawn: its file is not held open).
pub fn close() {
    if let Some(Ok(lock)) = PDFIUM.get() {
        let mut st = lock.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((_, d)) = st.open.take() {
            // SAFETY: a document this module opened and nothing else holds
            unsafe { (st.api.FPDF_CloseDocument)(d) };
        }
    }
}

/// Page `n` (1-based) loaded for `f`, closed after.
fn with_page<T>(api: &Api, doc: Doc, n: u32, f: impl FnOnce(Page) -> T) -> Result<T, String> {
    // SAFETY: an open document; the page is closed before returning
    let p = unsafe { (api.FPDF_LoadPage)(doc, n as c_int - 1) };
    if p.is_null() {
        return Err(format!("no page {n}"));
    }
    let out = f(p);
    unsafe { (api.FPDF_ClosePage)(p) };
    Ok(out)
}

/// Its text page loaded for `f`, closed after.
fn with_text<T>(api: &Api, page: Page, f: impl FnOnce(TextPage) -> T) -> Result<T, String> {
    // SAFETY: a loaded page; the text page is closed before returning
    let t = unsafe { (api.FPDFText_LoadPage)(page) };
    if t.is_null() {
        return Err("no text on this page".into());
    }
    let out = f(t);
    unsafe { (api.FPDFText_ClosePage)(t) };
    Ok(out)
}

/// Each page's width and height in points as shown: its `/Rotate` applied (a quarter turn swaps them), cropped.
pub fn pages(pdf: &Path) -> Result<Vec<(f32, f32)>, String> {
    with_doc(pdf, |api, doc| {
        // SAFETY: an open document, indices below its page count
        let n = unsafe { (api.FPDF_GetPageCount)(doc) };
        Ok((0..n)
            .map(|i| {
                let mut s = SizeF::default();
                unsafe { (api.FPDF_GetPageSizeByIndexF)(doc, i, &mut s) };
                (s.width, s.height)
            })
            .collect())
    })
}

/// Where a page's points are shown: the box shown (its crop box, in page points) and its own `/Rotate` in quarter
/// turns clockwise. Characters, links, find's boxes and the note's marks are page points (y up, the box's origin
/// wherever the file put it); the page is drawn turned and cropped, so a point on screen goes through this (the
/// desktop's `pdf-geom.ts` toShown / toPage, the phone's `PageSpace.java`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Space {
    pub view: Box4,
    pub rotate: u8,
}

/// Page `n`'s space. Separate from `pages` because it loads the page: asked for the pages shown, not all of them.
pub fn space(pdf: &Path, n: u32) -> Result<Space, String> {
    with_doc(pdf, |api, doc| {
        with_page(api, doc, n, |page| {
            let mut r = RectF::default();
            // SAFETY: a loaded page
            let ok = unsafe { (api.FPDF_GetPageBoundingBox)(page, &mut r) } != 0;
            let rotate = (unsafe { (api.FPDFPage_GetRotation)(page) }.rem_euclid(4)) as u8;
            let view = if ok { [r.left.min(r.right), r.bottom.min(r.top), r.left.max(r.right), r.bottom.max(r.top)] } else { [0.0, 0.0, 612.0, 792.0] };
            Space { view, rotate }
        })
    })
}

/// Page `n` drawn `w` × `h` pixels on white, rows of `w * 4` bytes: B, G, R, A — or R, G, B, A with `rgba`, what
/// `Bitmap.copyPixelsFromBuffer` takes for ARGB_8888; `quarter_turns` more than the page's own `/Rotate`.
pub fn render(pdf: &Path, n: u32, w: u32, h: u32, quarter_turns: u8, rgba: bool) -> Result<Vec<u8>, String> {
    with_doc(pdf, |api, doc| {
        with_page(api, doc, n, |page| {
            // SAFETY: a bitmap of the size asked, read row by row through its own stride, destroyed after
            unsafe {
                let bmp = (api.FPDFBitmap_Create)(w as c_int, h as c_int, 1);
                if bmp.is_null() {
                    return Err(format!("no memory for a {w}×{h} page"));
                }
                (api.FPDFBitmap_FillRect)(bmp, 0, 0, w as c_int, h as c_int, 0xFFFF_FFFF);
                (api.FPDF_RenderPageBitmap)(bmp, page, 0, 0, w as c_int, h as c_int, (quarter_turns % 4) as c_int, RENDER_ANNOT | if rgba { RENDER_RGBA } else { 0 });
                let (buf, stride) = ((api.FPDFBitmap_GetBuffer)(bmp), (api.FPDFBitmap_GetStride)(bmp) as usize);
                let mut out = Vec::with_capacity((w * h * 4) as usize);
                for row in 0..h as usize {
                    out.extend_from_slice(std::slice::from_raw_parts(buf.add(row * stride), w as usize * 4));
                }
                (api.FPDFBitmap_Destroy)(bmp);
                Ok(out)
            }
        })?
    })
}

/// Page `n`'s characters, each with its box (left, bottom, right, top); a character with no box (a generated space,
/// a line break) gets an empty one at the last box's end.
pub fn chars(pdf: &Path, n: u32) -> Result<Vec<(char, Box4)>, String> {
    with_doc(pdf, |api, doc| {
        with_page(api, doc, n, |page| {
            with_text(api, page, |t| {
                // SAFETY: indices below the text page's count
                let count = unsafe { (api.FPDFText_CountChars)(t) }.max(0);
                let mut last: Box4 = [0.0; 4];
                (0..count)
                    .map(|i| {
                        let c = char::from_u32(unsafe { (api.FPDFText_GetUnicode)(t, i) }).unwrap_or('\u{fffd}');
                        let (mut l, mut r, mut b, mut tp) = (0.0, 0.0, 0.0, 0.0);
                        let ok = unsafe { (api.FPDFText_GetCharBox)(t, i, &mut l, &mut r, &mut b, &mut tp) } != 0;
                        let bx = if ok && r > l { [l as f32, b as f32, r as f32, tp as f32] } else { [last[2], last[1], last[2], last[3]] };
                        last = bx;
                        (c, bx)
                    })
                    .collect()
            })
        })?
    })
}

/// Each match of `query` on page `n` (case ignored), as the boxes of its lines.
pub fn find(pdf: &Path, n: u32, query: &str) -> Result<Vec<Vec<Box4>>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let wide: Vec<u16> = query.encode_utf16().chain(std::iter::once(0)).collect();
    with_doc(pdf, |api, doc| {
        with_page(api, doc, n, |page| {
            with_text(api, page, |t| {
                let mut out = vec![];
                // SAFETY: a NUL-terminated UTF-16 query; the search handle is closed after
                unsafe {
                    let s = (api.FPDFText_FindStart)(t, wide.as_ptr(), 0, 0);
                    if s.is_null() {
                        return out;
                    }
                    while (api.FPDFText_FindNext)(s) != 0 {
                        let (at, len) = ((api.FPDFText_GetSchResultIndex)(s), (api.FPDFText_GetSchCount)(s));
                        let rects = (api.FPDFText_CountRects)(t, at, len);
                        let boxes = (0..rects)
                            .map(|k| {
                                let (mut l, mut tp, mut r, mut b) = (0.0, 0.0, 0.0, 0.0);
                                (api.FPDFText_GetRect)(t, k, &mut l, &mut tp, &mut r, &mut b);
                                [l as f32, b as f32, r as f32, tp as f32]
                            })
                            .collect();
                        out.push(boxes);
                    }
                    (api.FPDFText_FindClose)(s);
                }
                out
            })
        })?
    })
}

/// Page `n`'s links: where each sits and where it goes.
pub fn links(pdf: &Path, n: u32) -> Result<Vec<(Box4, Target)>, String> {
    with_doc(pdf, |api, doc| {
        with_page(api, doc, n, |page| {
            let mut out = vec![];
            let (mut pos, mut link): (c_int, Link) = (0, std::ptr::null_mut());
            // SAFETY: PDFium's own enumeration; every handle read is the page's, alive while it is loaded
            unsafe {
                while (api.FPDFLink_Enumerate)(page, &mut pos, &mut link) != 0 {
                    let mut r = RectF::default();
                    if (api.FPDFLink_GetAnnotRect)(link, &mut r) == 0 {
                        continue;
                    }
                    let bx = [r.left.min(r.right), r.bottom.min(r.top), r.left.max(r.right), r.bottom.max(r.top)];
                    let mut dest = (api.FPDFLink_GetDest)(doc, link);
                    let action = (api.FPDFLink_GetAction)(link);
                    if dest.is_null() && !action.is_null() {
                        match (api.FPDFAction_GetType)(action) {
                            ACTION_URI => {
                                let len = (api.FPDFAction_GetURIPath)(doc, action, std::ptr::null_mut(), 0);
                                let mut buf = vec![0u8; len as usize];
                                (api.FPDFAction_GetURIPath)(doc, action, buf.as_mut_ptr().cast(), len);
                                let uri = String::from_utf8_lossy(&buf).trim_end_matches('\0').to_string();
                                if !uri.is_empty() {
                                    out.push((bx, Target::Web(uri)));
                                }
                                continue;
                            }
                            ACTION_GOTO => dest = (api.FPDFAction_GetDest)(doc, action),
                            _ => continue,
                        }
                    }
                    if !dest.is_null() {
                        let i = (api.FPDFDest_GetDestPageIndex)(doc, dest);
                        if i >= 0 {
                            out.push((bx, Target::Page(i as u32 + 1)));
                        }
                    }
                }
            }
            out
        })
    })
}

/// The document's outline (bookmarks), depth first; empty when it has none.
pub fn outline(pdf: &Path) -> Result<Vec<Section>, String> {
    with_doc(pdf, |api, doc| {
        let mut out = vec![];
        walk(api, doc, std::ptr::null_mut(), 0, &mut out);
        Ok(out)
    })
}

fn walk(api: &Api, doc: Doc, parent: Bookmark, depth: u32, out: &mut Vec<Section>) {
    if depth >= OUTLINE_DEPTH {
        return;
    }
    // SAFETY: bookmarks are the open document's, alive while it is; titles are read with the length PDFium gives
    let mut b = unsafe { (api.FPDFBookmark_GetFirstChild)(doc, parent) };
    while !b.is_null() && out.len() < OUTLINE_MAX {
        let title = unsafe {
            let len = (api.FPDFBookmark_GetTitle)(b, std::ptr::null_mut(), 0) as usize;
            let mut buf = vec![0u16; len.div_ceil(2)];
            if len > 0 {
                (api.FPDFBookmark_GetTitle)(b, buf.as_mut_ptr().cast(), len as c_ulong);
            }
            String::from_utf16_lossy(&buf).trim_end_matches('\0').trim().to_string()
        };
        let page = unsafe {
            let mut dest = (api.FPDFBookmark_GetDest)(doc, b);
            if dest.is_null() {
                let action = (api.FPDFBookmark_GetAction)(b);
                if !action.is_null() && (api.FPDFAction_GetType)(action) == ACTION_GOTO {
                    dest = (api.FPDFAction_GetDest)(doc, action);
                }
            }
            if dest.is_null() { -1 } else { (api.FPDFDest_GetDestPageIndex)(doc, dest) }
        };
        out.push(Section { title, depth, page: (page >= 0).then(|| page as u32 + 1) });
        walk(api, doc, b, depth + 1, out);
        b = unsafe { (api.FPDFBookmark_GetNextSibling)(doc, b) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The host's build of the APK's PDFium (DESIGN-pdfium-android.md), when it was fetched into local/.
    fn host_lib() -> Option<PathBuf> {
        let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../local/pdfium/8086-linux-x64/lib/libpdfium.so");
        p.exists().then_some(p)
    }

    /// Two pages of Helvetica text; page 1 links to page 2 and to a web address; an outline of two chapters, the first
    /// with a section under it, and a heading that goes nowhere.
    fn text_pdf() -> Vec<u8> {
        let text = |l: &str| format!("BT /F1 18 Tf 72 700 Td ({l}) Tj ET");
        let (a, b) = (text("The quantum dot model"), text("quantum again"));
        let objs = [
            "<< /Type /Catalog /Pages 2 0 R /Outlines 10 0 R >>".to_string(),
            "<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>".into(),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".into(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R /Annots [8 0 R 9 0 R] >>".into(),
            format!("<< /Length {} >>\nstream\n{a}\nendstream", a.len()),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 7 0 R >>".into(),
            format!("<< /Length {} >>\nstream\n{b}\nendstream", b.len()),
            "<< /Type /Annot /Subtype /Link /Rect [72 600 200 620] /Dest [6 0 R /XYZ 0 792 0] >>".into(),
            "<< /Type /Annot /Subtype /Link /Rect [72 560 200 580] /A << /S /URI /URI (https://example.org/) >> >>".into(),
            "<< /Type /Outlines /First 11 0 R /Last 14 0 R /Count 4 >>".into(),
            "<< /Title (Introduction) /Parent 10 0 R /Next 13 0 R /First 12 0 R /Last 12 0 R /Count 1 /Dest [4 0 R /Fit] >>".into(),
            "<< /Title (The model) /Parent 11 0 R /A << /S /GoTo /D [6 0 R /XYZ 0 700 0] >> >>".into(),
            "<< /Title (Appendix) /Parent 10 0 R /Prev 11 0 R /Next 14 0 R /Dest [6 0 R /Fit] >>".into(),
            "<< /Title <FEFF00C9007400E9> /Parent 10 0 R /Prev 13 0 R >>".into(),
        ];
        pdf_of(&objs)
    }

    /// A PDF of these objects (numbered from 1, the first the catalog), with its cross-reference table.
    fn pdf_of(objs: &[String]) -> Vec<u8> {
        let mut out = String::from("%PDF-1.4\n");
        let mut at = vec![];
        for (i, o) in objs.iter().enumerate() {
            at.push(out.len());
            out += &format!("{} 0 obj\n{o}\nendobj\n", i + 1);
        }
        let xref = out.len();
        out += &format!("xref\n0 {}\n0000000000 65535 f \n", objs.len() + 1);
        for n in at {
            out += &format!("{n:010} 00000 n \n");
        }
        out += &format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n", objs.len() + 1);
        out.into_bytes()
    }

    #[test]
    fn pages_text_find_render_and_links_through_pdfium() {
        let Some(lib) = host_lib() else {
            eprintln!("skipped: no local/pdfium/8086-linux-x64 (DESIGN-pdfium-android.md says how to fetch it)");
            return;
        };
        init(&lib).unwrap();
        let d = tempfile::tempdir().unwrap();
        let pdf = d.path().join("doc.pdf");
        std::fs::write(&pdf, text_pdf()).unwrap();
        assert_eq!(pages(&pdf).unwrap(), vec![(612.0, 792.0), (612.0, 792.0)]);
        let cs = chars(&pdf, 1).unwrap();
        assert_eq!(cs.iter().map(|c| c.0).collect::<String>().trim(), "The quantum dot model");
        let q = cs.iter().find(|c| c.0 == 'q').unwrap().1;
        assert!(q[0] > 72.0 && q[1] >= 690.0 && q[3] <= 725.0 && q[2] > q[0], "a character's box in page points: {q:?}");
        let hits = find(&pdf, 1, "QUANTUM").unwrap();
        assert_eq!(hits.len(), 1, "case ignored");
        assert!(hits[0][0][0] > 72.0 && hits[0][0][2] > hits[0][0][0]);
        assert_eq!(find(&pdf, 2, "quantum").unwrap().len(), 1);
        let px = render(&pdf, 1, 306, 396, 0, true).unwrap();
        assert_eq!(px.len(), 306 * 396 * 4);
        assert!(px.chunks(4).any(|p| p[0] < 128), "some text drawn dark on the white page");
        assert_eq!(links(&pdf, 1).unwrap().into_iter().map(|l| l.1).collect::<Vec<_>>(), [Target::Page(2), Target::Web("https://example.org/".into())]);
        let sec = |title: &str, depth, page| Section { title: title.into(), depth, page };
        assert_eq!(
            outline(&pdf).unwrap(),
            [sec("Introduction", 0, Some(1)), sec("The model", 1, Some(2)), sec("Appendix", 0, Some(2)), sec("Été", 0, None)],
            "depth first, a GoTo action's page too, a UTF-16 title, a heading that goes nowhere"
        );
        assert!(pages(&d.path().join("missing.pdf")).is_err());
        assert_eq!(space(&pdf, 1).unwrap(), Space { view: [0.0, 0.0, 612.0, 792.0], rotate: 0 });
    }

    /// pdf-geom.ts toShown: page points (y up) → the shown page's points from its top left.
    fn to_shown(s: Space, x: f32, y: f32) -> (f32, f32) {
        let [x0, y0, x1, y1] = s.view;
        match s.rotate & 3 {
            1 => (y - y0, x - x0),
            2 => (x1 - x, y - y0),
            3 => (y1 - y, x1 - x),
            _ => (x - x0, y1 - y),
        }
    }

    /// A page turned by its own `/Rotate 90`, its media box not at the origin: PDFium gives the shown size, but the
    /// characters in page points — so a reader that maps the screen to the page by the shown size alone selects the
    /// wrong words (or none). Through `space` a character's box lands where its glyph is drawn.
    #[test]
    fn a_rotated_pages_characters_are_found_where_they_are_drawn_through_its_space() {
        let Some(lib) = host_lib() else {
            eprintln!("skipped: no local/pdfium/8086-linux-x64 (DESIGN-pdfium-android.md says how to fetch it)");
            return;
        };
        init(&lib).unwrap();
        let text = "BT /F1 40 Tf 150 300 Td (WWWW) Tj ET";
        let objs = [
            "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
            "<< /Type /Pages /Kids [4 0 R] /Count 1 >>".into(),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".into(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [100 50 500 650] /Rotate 90 /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>".into(),
            format!("<< /Length {} >>\nstream\n{text}\nendstream", text.len()),
        ];
        let d = tempfile::tempdir().unwrap();
        let pdf = d.path().join("turned.pdf");
        std::fs::write(&pdf, pdf_of(&objs)).unwrap();
        assert_eq!(pages(&pdf).unwrap(), vec![(600.0, 400.0)], "the shown size: turned");
        let sp = space(&pdf, 1).unwrap();
        assert_eq!(sp, Space { view: [100.0, 50.0, 500.0, 650.0], rotate: 1 });
        let cs = chars(&pdf, 1).unwrap();
        let w = cs.iter().find(|c| c.0 == 'W').unwrap().1;
        assert!(w[0] >= 150.0 && w[0] < 160.0 && w[1] > 290.0 && w[3] < 345.0, "page points, unturned: {w:?}");
        // the glyph's centre, shown: where the drawn page is dark
        let (cx, cy) = to_shown(sp, (w[0] + w[2]) / 2.0, (w[1] + w[3]) / 2.0);
        let (pw, ph) = (600usize, 400usize);
        let px = render(&pdf, 1, pw as u32, ph as u32, 0, true).unwrap();
        let dark = |x: f32, y: f32| {
            // any dark pixel within 6 points of (x, y): the centre of a W may fall between its strokes
            (-6..=6).any(|dy: i32| (-6..=6).any(|dx: i32| {
                let (i, j) = ((x as i32 + dx).clamp(0, pw as i32 - 1) as usize, (y as i32 + dy).clamp(0, ph as i32 - 1) as usize);
                px[(j * pw + i) * 4] < 128
            }))
        };
        assert!(dark(cx, cy), "the character's box, through its space, is on its glyph: ({cx}, {cy})");
        // what the reader did before: the shown size alone, as if unturned at the origin — off the glyph
        let (nx, ny) = ((w[0] + w[2]) / 2.0, 400.0 - (w[1] + w[3]) / 2.0);
        assert!(!dark(nx, ny), "without the space the point is elsewhere: ({nx}, {ny})");
    }

    /// A two-column page read by PDFium: its characters, taken to the shown space, give each column under a point
    /// (pdf_columns.rs, what the phone's reader and the desktop's pane zoom to on a double tap).
    #[test]
    fn a_two_column_pages_characters_give_its_columns() {
        let Some(lib) = host_lib() else {
            eprintln!("skipped: no local/pdfium/8086-linux-x64 (DESIGN-pdfium-android.md says how to fetch it)");
            return;
        };
        init(&lib).unwrap();
        let mut text = String::from("BT /F1 10 Tf ");
        for (x, words) in [(72, "left words of the first column here"), (312, "right words in the second column")] {
            for i in 0..30 {
                text += &format!("1 0 0 1 {x} {} Tm ({words} {i}) Tj ", 700 - 12 * i);
            }
        }
        text += "ET";
        let objs = [
            "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
            "<< /Type /Pages /Kids [4 0 R] /Count 1 >>".into(),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".into(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>".into(),
            format!("<< /Length {} >>\nstream\n{text}\nendstream", text.len()),
        ];
        let d = tempfile::tempdir().unwrap();
        let pdf = d.path().join("columns.pdf");
        std::fs::write(&pdf, pdf_of(&objs)).unwrap();
        let sp = space(&pdf, 1).unwrap();
        let shown: Vec<crate::pdf_columns::Rect> = chars(&pdf, 1)
            .unwrap()
            .into_iter()
            .filter(|(c, _)| !c.is_whitespace())
            .map(|(_, b)| {
                let ((ax, ay), (bx, by)) = (to_shown(sp, b[0], b[1]), to_shown(sp, b[2], b[3]));
                [ax.min(bx), ay.min(by), ax.max(bx), ay.max(by)]
            })
            .collect();
        let left = crate::pdf_columns::column_at(&shown, 150.0, 250.0).expect("the left column");
        assert!(left[0] >= 70.0 && left[0] < 75.0 && left[2] < 312.0, "{left:?}");
        let right = crate::pdf_columns::column_at(&shown, 400.0, 250.0).expect("the right column");
        assert!(right[0] >= 310.0 && right[0] < 315.0 && right[2] < 560.0, "{right:?}");
    }
}
