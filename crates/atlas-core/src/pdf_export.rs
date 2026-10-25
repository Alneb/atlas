//! "Export with marks": a copy of a PDF, `x (marked).pdf` beside it, with the PDF's marks (pdf_marks.rs) written in as
//! real PDF annotations, so any reader shows them. The original is never touched. The copy is the original's bytes
//! plus one incremental update (the annotations, the pages' `/Annots`, the bookmarks in the outline); an encrypted PDF
//! is rewritten whole, decrypted, since new plain objects cannot be appended to encrypted ones.
//!
//! Each annotation carries its own appearance stream (`/AP`), drawn the way the reader draws the mark
//! (ui/src/lib/pdf-marks.ts `pageSvg`), so readers that do not build appearances still show it; `/NM` is the mark's
//! id. Kinds: highlight, underline, strike → `Highlight`, `Underline`, `StrikeOut` with their quads; text box →
//! `FreeText`; post-it → `Text` (`/IRT` its highlight); ink → `Ink`, a line per sample pair at the pressure's width;
//! clip → `Square`, dashed; stamp → `Stamp`; bookmark → an outline item to its page.
//!
//! [`Mode::Flat`] draws the same appearances into the pages themselves instead (`x (marked, flat).pdf`), for readers
//! that hide annotations and for printing: each one placed as a reader places an annotation's appearance (its box,
//! through its form's matrix, fitted onto its rectangle), after the page's own content, which is wrapped in `q … Q` so
//! nothing it leaves set can move them.

use crate::pdf_marks::{self, Body, Mark, Quad, Stamp};
use crate::{Error, Result, Workspace};
use lopdf::content::{Content, Operation};
use lopdf::{dictionary, Dictionary, Document, IncrementalDocument, Object, ObjectId, Stream, StringFormat};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use ts_rs::TS;

/// How the marks go into the copy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, rename = "PdfExportMode")]
pub enum Mode {
    /// Real annotations: any reader shows, lists and edits them.
    #[default]
    Annotations,
    /// Drawn into the pages: seen by every reader and printer, no longer marks of their own.
    Flat,
}

/// What an export wrote.
#[derive(Debug, Clone, Default, PartialEq, Serialize, TS)]
#[ts(export, rename = "PdfExported")]
pub struct Exported {
    /// The copy, vault-relative.
    pub path: String,
    pub annotations: u32,
    pub bookmarks: u32,
    /// Marks on a page the PDF does not have.
    pub skipped: u32,
    /// The original was encrypted: the copy is a decrypted rewrite, not an update.
    pub rewritten: bool,
}

/// The copy's name: `dir/x.pdf` → `dir/x (marked).pdf`, or `dir/x (marked, flat).pdf`.
pub fn marked_name(pdf: &str, mode: Mode) -> String {
    let (stem, ext) = pdf.rsplit_once('.').filter(|(_, e)| !e.contains('/')).unwrap_or((pdf, "pdf"));
    let how = match mode {
        Mode::Annotations => "marked",
        Mode::Flat => "marked, flat",
    };
    format!("{stem} ({how}).{ext}")
}

/// `POST /api/pdf-export?pdf=(&mode=flat)`: writes the copy from `pdf` and its note's marks. An earlier copy goes to
/// the trash first (it may have been changed in another app).
pub fn export(ws: &Workspace, pdf: &str, mode: Mode) -> Result<Exported> {
    let cfg = ws.config()?;
    let marks = pdf_marks::marks_of(ws.root(), &cfg, pdf)?.marks;
    let bytes = std::fs::read(ws.resolve(pdf)?)?;
    let (out, mut report) = write_marks(bytes, &marks, mode)?;
    let path = marked_name(pdf, mode);
    let abs = ws.resolve(&path)?;
    if abs.exists() {
        crate::files::trash(ws, &path)?;
    }
    crate::vault_write::write(&abs, &out)?;
    report.path = path;
    Ok(report)
}

/// The PDF `bytes` with `marks` written in as annotations. Pure: no I/O.
pub fn annotate(bytes: Vec<u8>, marks: &[Mark]) -> Result<(Vec<u8>, Exported)> {
    write_marks(bytes, marks, Mode::Annotations)
}

/// The PDF `bytes` with `marks` written in, as annotations or drawn into the pages. Pure: no I/O.
pub fn write_marks(bytes: Vec<u8>, marks: &[Mark], mode: Mode) -> Result<(Vec<u8>, Exported)> {
    let mut t = Target::open(bytes)?;
    let pages = t.pages();
    let mut report = Exported { rewritten: matches!(t, Target::Whole(_)), ..Default::default() };
    let fonts = t.fonts();
    // highlights first, so a post-it on one can point at its annotation (`/IRT`)
    let mut order: Vec<&Mark> = marks.iter().collect();
    order.sort_by_key(|m| !matches!(m.body, Body::Highlight { .. } | Body::Underline { .. } | Body::Strike { .. }));
    let mut made: HashMap<&str, ObjectId> = HashMap::new();
    let mut bookmarks: Vec<(&Mark, ObjectId)> = vec![];
    let mut annots: BTreeMap<ObjectId, Vec<ObjectId>> = BTreeMap::new();
    let mut drawn: BTreeMap<ObjectId, Vec<(ObjectId, [f64; 6])>> = BTreeMap::new();
    for m in order {
        let Some(&page) = pages.get(&m.page) else {
            report.skipped += 1;
            continue;
        };
        if let Body::Bookmark { .. } = m.body {
            bookmarks.push((m, page));
            continue;
        }
        let rotate = t.rotate(page);
        let irt = match &m.body {
            Body::Postit { on: Some(on), .. } => made.get(on.as_str()).copied(),
            _ => None,
        };
        let Some((mut dict, ap)) = annotation(m, rotate, &fonts) else { continue };
        if mode == Mode::Flat {
            let (Some(rect), Some(fit)) = (dict.get(b"Rect").ok().and_then(quad_of), placing(&ap)) else { continue };
            let form = t.add(ap);
            drawn.entry(page).or_default().push((form, fit(rect)));
            report.annotations += 1;
            continue;
        }
        // a stream is always an object of its own
        let ap = t.add(ap);
        dict.set("AP", dictionary! { "N" => ap });
        dict.set("P", Object::Reference(page));
        if let Some(r) = irt {
            dict.set("IRT", Object::Reference(r));
        }
        let id = t.add(Object::Dictionary(dict));
        made.insert(m.id.as_str(), id);
        annots.entry(page).or_default().push(id);
        report.annotations += 1;
    }
    for (page, ids) in annots {
        t.push_annots(page, ids)?;
    }
    for (page, forms) in drawn {
        t.draw_over(page, &forms)?;
    }
    report.bookmarks = t.add_bookmarks(&bookmarks)?;
    Ok((t.save()?, report))
}

/// Where the new objects go: an incremental update over the original's bytes, or (encrypted) the whole document.
enum Target {
    Update(Box<IncrementalDocument>),
    Whole(Box<Document>),
}

fn bad(e: lopdf::Error) -> Error {
    Error::BadRequest(format!("this PDF could not be read: {e}"))
}

impl Target {
    fn open(bytes: Vec<u8>) -> Result<Self> {
        let doc = Document::load_mem(&bytes).map_err(bad)?;
        Ok(if doc.encryption_state.is_some() {
            Target::Whole(Box::new(doc))
        } else {
            Target::Update(Box::new(IncrementalDocument::create_from(bytes, doc)))
        })
    }
    /// The document as it stands: the original's objects, with the update's over them.
    fn base(&self) -> &Document {
        match self {
            Target::Update(i) => i.get_prev_documents(),
            Target::Whole(d) => d,
        }
    }
    fn get(&self, id: ObjectId) -> Result<Object> {
        let found = match self {
            Target::Update(i) => i.new_document.get_object(id).or_else(|_| i.get_prev_documents().get_object(id)),
            Target::Whole(d) => d.get_object(id),
        };
        found.cloned().map_err(bad)
    }
    fn set(&mut self, id: ObjectId, o: Object) {
        match self {
            Target::Update(i) => i.new_document.set_object(id, o),
            Target::Whole(d) => d.set_object(id, o),
        }
    }
    fn add(&mut self, o: Object) -> ObjectId {
        match self {
            Target::Update(i) => i.new_document.add_object(o),
            Target::Whole(d) => d.add_object(o),
        }
    }
    fn pages(&self) -> BTreeMap<u32, ObjectId> {
        self.base().get_pages()
    }
    /// A page's `/Rotate` (inherited from its parents too), in quarter turns 0–3.
    fn rotate(&self, page: ObjectId) -> u8 {
        let mut at = Some(page);
        for _ in 0..32 {
            let Some(id) = at else { break };
            let Ok(Object::Dictionary(d)) = self.get(id) else { break };
            if let Ok(r) = d.get(b"Rotate").and_then(Object::as_i64) {
                return (r.rem_euclid(360) / 90) as u8;
            }
            at = d.get(b"Parent").and_then(Object::as_reference).ok();
        }
        0
    }
    /// The two fonts the appearances use, as one resource dictionary.
    fn fonts(&mut self) -> Dictionary {
        let font = |base: &str| dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => base.to_string(), "Encoding" => "WinAnsiEncoding" };
        let helv = self.add(Object::Dictionary(font("Helvetica")));
        let bold = self.add(Object::Dictionary(font("Helvetica-Bold")));
        dictionary! { "Helv" => helv, "HelvB" => bold }
    }
    /// `ids` added to the page's `/Annots`, wherever that array lives (inline, or an object of its own).
    fn push_annots(&mut self, page: ObjectId, ids: Vec<ObjectId>) -> Result<()> {
        let Object::Dictionary(mut d) = self.get(page)? else { return Err(Error::BadRequest("a page is not a dictionary".into())) };
        let refs = ids.into_iter().map(Object::Reference);
        match d.get(b"Annots").cloned() {
            Ok(Object::Reference(arr)) => {
                let mut list = self.get(arr)?.as_array().map_err(bad)?.clone();
                list.extend(refs);
                self.set(arr, Object::Array(list));
                return Ok(());
            }
            Ok(Object::Array(mut list)) => {
                list.extend(refs);
                d.set("Annots", list);
            }
            _ => d.set("Annots", refs.collect::<Vec<_>>()),
        }
        self.set(page, Object::Dictionary(d));
        Ok(())
    }
    /// `forms` drawn over the page, each under its matrix: the page's content wrapped in `q … Q` first, then a stream
    /// of its own that draws them, named in a copy of the page's (maybe inherited) resources.
    fn draw_over(&mut self, page: ObjectId, forms: &[(ObjectId, [f64; 6])]) -> Result<()> {
        let Object::Dictionary(mut d) = self.get(page)? else { return Err(Error::BadRequest("a page is not a dictionary".into())) };
        let mut res = self.resources(page)?;
        let mut xobj = match res.get(b"XObject").cloned() {
            Ok(Object::Reference(id)) => self.get(id)?.as_dict().map_err(bad)?.clone(),
            Ok(Object::Dictionary(x)) => x,
            _ => Dictionary::new(),
        };
        let mut draw = String::from("Q\n");
        for (i, (form, m)) in forms.iter().enumerate() {
            let name = (0..).map(|k| format!("AtlasMark{i}_{k}")).find(|n| !xobj.has(n.as_bytes())).expect("a free name");
            xobj.set(name.as_bytes(), Object::Reference(*form));
            draw += &format!("q {} {} {} {} {} {} cm /{name} Do Q\n", m[0], m[1], m[2], m[3], m[4], m[5]);
        }
        res.set("XObject", xobj);
        d.set("Resources", res);
        let open = self.add(Object::Stream(Stream::new(Dictionary::new(), b"q\n".to_vec())));
        let ours = self.add(Object::Stream(Stream::new(Dictionary::new(), draw.into_bytes())));
        let mut contents = vec![Object::Reference(open)];
        match d.get(b"Contents").cloned() {
            Ok(Object::Array(list)) => contents.extend(list),
            Ok(other @ Object::Reference(_)) => contents.push(other),
            _ => {}
        }
        contents.push(Object::Reference(ours));
        d.set("Contents", contents);
        self.set(page, Object::Dictionary(d));
        Ok(())
    }
    /// A page's resources as a dictionary of its own (inherited from its parents when it has none; resolved when an
    /// object of its own), to be changed and set on the page alone.
    fn resources(&self, page: ObjectId) -> Result<Dictionary> {
        let mut at = Some(page);
        for _ in 0..32 {
            let Some(id) = at else { break };
            let Object::Dictionary(d) = self.get(id)? else { break };
            match d.get(b"Resources").cloned() {
                Ok(Object::Reference(r)) => return Ok(self.get(r)?.as_dict().map_err(bad)?.clone()),
                Ok(Object::Dictionary(r)) => return Ok(r),
                _ => at = d.get(b"Parent").and_then(Object::as_reference).ok(),
            }
        }
        Ok(Dictionary::new())
    }
    /// Each bookmark an outline item at the end of the document's outline (made if it has none), to its page.
    fn add_bookmarks(&mut self, marks: &[(&Mark, ObjectId)]) -> Result<u32> {
        if marks.is_empty() {
            return Ok(0);
        }
        let root = self.base().trailer.get(b"Root").and_then(Object::as_reference).map_err(bad)?;
        let Object::Dictionary(mut catalog) = self.get(root)? else { return Err(Error::BadRequest("the PDF has no catalog".into())) };
        let outlines = match catalog.get(b"Outlines").and_then(Object::as_reference) {
            Ok(id) => id,
            Err(_) => {
                let id = self.add(Object::Dictionary(dictionary! { "Type" => "Outlines", "Count" => 0 }));
                catalog.set("Outlines", id);
                self.set(root, Object::Dictionary(catalog));
                id
            }
        };
        let Object::Dictionary(mut top) = self.get(outlines)? else { return Err(Error::BadRequest("the PDF's outline is not a dictionary".into())) };
        let mut last = top.get(b"Last").and_then(Object::as_reference).ok();
        let mut sorted = marks.to_vec();
        sorted.sort_by_key(|(m, _)| m.page);
        for (m, page) in &sorted {
            let Body::Bookmark { title } = &m.body else { continue };
            let title = if title.is_empty() { format!("Page {}", m.page) } else { title.clone() };
            let mut item = dictionary! { "Title" => text(&title), "Parent" => outlines, "Dest" => vec![Object::Reference(*page), "Fit".into()] };
            if let Some(c) = m.color.as_deref().and_then(rgb) {
                item.set("C", c.iter().copied().map(Object::Real).collect::<Vec<_>>());
            }
            if let Some(prev) = last {
                item.set("Prev", prev);
            }
            let id = self.add(Object::Dictionary(item));
            match last {
                Some(prev) => {
                    if let Ok(Object::Dictionary(mut p)) = self.get(prev) {
                        p.set("Next", id);
                        self.set(prev, Object::Dictionary(p));
                    }
                }
                None => top.set("First", id),
            }
            last = Some(id);
        }
        top.set("Last", last.expect("at least one bookmark"));
        let count = top.get(b"Count").and_then(Object::as_i64).unwrap_or(0);
        top.set("Count", count.abs() + sorted.len() as i64);
        self.set(outlines, Object::Dictionary(top));
        Ok(sorted.len() as u32)
    }
    fn save(self) -> Result<Vec<u8>> {
        let mut out = Vec::new();
        match self {
            Target::Update(mut i) => i.save_to(&mut out),
            Target::Whole(mut d) => d.save_to(&mut out),
        }
        .map_err(|e| Error::Other(anyhow::anyhow!("the copy could not be written: {e}")))?;
        Ok(out)
    }
}

/// A PDF text string: plain when it is ASCII, UTF-16BE with its mark otherwise.
fn text(s: &str) -> Object {
    if s.is_ascii() {
        Object::String(s.as_bytes().to_vec(), StringFormat::Literal)
    } else {
        let mut b = vec![0xFE, 0xFF];
        b.extend(s.encode_utf16().flat_map(u16::to_be_bytes));
        Object::String(b, StringFormat::Hexadecimal)
    }
}

/// `#rgb` / `#rrggbb` → 0–1 components.
fn rgb(c: &str) -> Option<[f32; 3]> {
    let h = c.strip_prefix('#')?;
    let full: String = match h.len() {
        3 => h.chars().flat_map(|c| [c, c]).collect(),
        6 => h.into(),
        _ => return None,
    };
    let n = u32::from_str_radix(&full, 16).ok()?;
    Some([(n >> 16) as f32 / 255.0, ((n >> 8) & 255) as f32 / 255.0, (n & 255) as f32 / 255.0])
}

/// `2026-10-23T14:05` → `D:202610231405`.
fn pdf_date(created: &str) -> String {
    format!("D:{}", created.chars().filter(char::is_ascii_digit).collect::<String>())
}

fn op(name: &str, args: Vec<Object>) -> Operation {
    Operation::new(name, args)
}
fn nums(v: &[f64]) -> Vec<Object> {
    v.iter().map(|&x| Object::Real(x as f32)).collect()
}
fn color_ops(c: [f32; 3], fill: bool) -> Operation {
    op(if fill { "rg" } else { "RG" }, c.iter().map(|&x| Object::Real(x)).collect())
}

/// The union of boxes, a little wider (line caps, pens).
fn bounds(boxes: impl IntoIterator<Item = Quad>, pad: f64) -> Quad {
    let mut r = [f64::MAX, f64::MAX, f64::MIN, f64::MIN];
    for b in boxes {
        r = [r[0].min(b[0].min(b[2])), r[1].min(b[1].min(b[3])), r[2].max(b[0].max(b[2])), r[3].max(b[1].max(b[3]))];
    }
    if r[0] > r[2] {
        return [0.0; 4];
    }
    [r[0] - pad, r[1] - pad, r[2] + pad, r[3] + pad]
}

/// An appearance: a form over `rect` (user space) drawing `ops`, with `resources`; `turn` quarter turns so text reads
/// upright on a turned page.
fn appearance(rect: Quad, ops: Vec<Operation>, resources: Dictionary, turn: u8) -> Object {
    let content = Content { operations: ops }.encode().unwrap_or_default();
    let (c, s) = match turn & 3 {
        0 => (1.0, 0.0),
        1 => (0.0, 1.0),
        2 => (-1.0, 0.0),
        _ => (0.0, -1.0),
    };
    // turning about the box's centre: the form's box maps back onto `rect` either way
    let (cx, cy) = ((rect[0] + rect[2]) / 2.0, (rect[1] + rect[3]) / 2.0);
    let matrix = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
    let dict = dictionary! {
        "Type" => "XObject", "Subtype" => "Form", "BBox" => nums(&rect), "Matrix" => nums(&matrix), "Resources" => resources,
    };
    Object::Stream(Stream::new(dict, content))
}

/// An annotation's `/Rect` read back.
fn quad_of(o: &Object) -> Option<Quad> {
    let a = o.as_array().ok()?;
    let n: Vec<f64> = a.iter().filter_map(|x| x.as_float().map(f64::from).ok().or_else(|| x.as_i64().ok().map(|i| i as f64))).collect();
    (n.len() == 4).then(|| [n[0], n[1], n[2], n[3]])
}

/// How a reader places an appearance on its annotation's rectangle (PDF 32000 12.5.5): the form's box, through its
/// matrix, fitted onto the rectangle — given here as the matrix that does it for a rectangle.
fn placing(ap: &Object) -> Option<impl Fn(Quad) -> [f64; 6]> {
    let d = &ap.as_stream().ok()?.dict;
    let num = |o: &Object| o.as_float().map(f64::from).ok().or_else(|| o.as_i64().ok().map(|i| i as f64));
    let bbox: Vec<f64> = d.get(b"BBox").ok()?.as_array().ok()?.iter().filter_map(num).collect();
    let m: Vec<f64> = match d.get(b"Matrix") {
        Ok(o) => o.as_array().ok()?.iter().filter_map(num).collect(),
        Err(_) => vec![1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
    };
    if bbox.len() != 4 || m.len() != 6 {
        return None;
    }
    let corners = [(bbox[0], bbox[1]), (bbox[2], bbox[1]), (bbox[0], bbox[3]), (bbox[2], bbox[3])].map(|(x, y)| (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]));
    let (tx0, ty0) = corners.iter().fold((f64::MAX, f64::MAX), |(a, b), &(x, y)| (a.min(x), b.min(y)));
    let (tx1, ty1) = corners.iter().fold((f64::MIN, f64::MIN), |(a, b), &(x, y)| (a.max(x), b.max(y)));
    let (tw, th) = ((tx1 - tx0).max(1e-6), (ty1 - ty0).max(1e-6));
    Some(move |r: Quad| {
        let (sx, sy) = ((r[2] - r[0]) / tw, (r[3] - r[1]) / th);
        [sx, 0.0, 0.0, sy, r[0] - tx0 * sx, r[1] - ty0 * sy]
    })
}

fn alpha(fill: f32, blend: Option<&str>) -> Dictionary {
    let mut g = dictionary! { "Type" => "ExtGState", "ca" => fill, "CA" => fill };
    if let Some(b) = blend {
        g.set("BM", b.to_string());
    }
    dictionary! { "ExtGState" => dictionary! { "G0" => g } }
}

/// Text in `Helv` at `size`, broken into lines that fit `width` (Helvetica's widths), first line at the top.
fn text_lines(s: &str, size: f64, width: f64) -> Vec<Vec<u8>> {
    let w = |b: &[u8]| b.iter().map(|&c| helv_width(c)).sum::<f64>() * size / 1000.0;
    let mut out = vec![];
    for para in s.split('\n') {
        let mut line: Vec<u8> = vec![];
        for word in para.split(' ') {
            let word = win_ansi(word);
            let mut next = line.clone();
            if !next.is_empty() {
                next.push(b' ');
            }
            next.extend(&word);
            if !line.is_empty() && w(&next) > width {
                out.push(std::mem::take(&mut line));
                line = word;
            } else {
                line = next;
            }
        }
        out.push(line);
    }
    out
}

/// A string as WinAnsi bytes (Latin-1, plus typography in 0x80–0x9F); what it cannot hold becomes `?`.
fn win_ansi(s: &str) -> Vec<u8> {
    const HIGH: &str = "€\u{81}‚ƒ„…†‡ˆ‰Š‹Œ\u{8d}Ž\u{8f}\u{90}‘’“”•–—˜™š›œ\u{9d}žŸ";
    s.chars()
        .map(|c| match c as u32 {
            n if n < 0x80 || (0xA0..=0xFF).contains(&n) => n as u8,
            _ => HIGH.chars().position(|h| h == c).filter(|&i| !matches!(i, 1 | 13 | 15 | 16 | 29)).map_or(b'?', |i| 0x80 + i as u8),
        })
        .collect()
}

/// Helvetica's advance widths (per 1000), printable ASCII; the rest taken as a digit's.
fn helv_width(c: u8) -> f64 {
    const W: [u16; 95] = [
        278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
        556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
        667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
        556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
    ];
    if (32..127).contains(&c) { W[(c - 32) as usize] as f64 } else { 556.0 }
}

/// The pen's width at a pressure, as the reader draws it (pdf-marks.ts `widthAt`).
fn width_at(width: f64, pressure: f64) -> f64 {
    width * (0.35 + 0.65 * pressure.clamp(0.0, 1.0))
}

/// The annotation for one mark (no `/P`, `/IRT` or `/AP` yet) and its appearance stream; none for a mark with
/// nothing to draw.
fn annotation(m: &Mark, rotate: u8, fonts: &Dictionary) -> Option<(Dictionary, Object)> {
    let color = |dflt: &str| m.color.as_deref().and_then(rgb).or_else(|| rgb(dflt)).expect("a default colour parses");
    let tags = m.tags.iter().map(|t| format!("#{t}")).collect::<Vec<_>>().join(" ");
    let with_tags = |s: &str| match (s.is_empty(), tags.is_empty()) {
        (_, true) => s.to_string(),
        (true, false) => tags.clone(),
        (false, false) => format!("{s}\n{tags}"),
    };
    // each arm: the subtype, its box, its appearance, its words, its colour (`/C`), the keys only it has
    let (subtype, rect, ap, contents, c_main, extra): (&str, Quad, Object, String, Option<[f32; 3]>, Dictionary) = match &m.body {
        Body::Highlight { quads, .. } | Body::Underline { quads, .. } | Body::Strike { quads, .. } => {
            if quads.is_empty() {
                return None;
            }
            let c = color("#FFE066");
            let rect = bounds(quads.iter().copied(), 1.0);
            let mut ops = vec![];
            let (subtype, res) = match &m.body {
                Body::Highlight { .. } => {
                    ops.extend([op("gs", vec!["G0".into()]), color_ops(c, true)]);
                    for q in quads {
                        ops.extend([op("re", nums(&[q[0], q[1], q[2] - q[0], q[3] - q[1]])), op("f", vec![])]);
                    }
                    ("Highlight", alpha(0.4, Some("Multiply")))
                }
                _ => {
                    let under = matches!(m.body, Body::Underline { .. });
                    ops.push(color_ops(c, false));
                    for q in quads {
                        let h = q[3] - q[1];
                        let y = if under { q[1] + 0.5 } else { (q[1] + q[3]) / 2.0 };
                        ops.extend([op("w", nums(&[(h * 0.08).max(0.8)])), op("m", nums(&[q[0], y])), op("l", nums(&[q[2], y])), op("S", vec![])]);
                    }
                    (if under { "Underline" } else { "StrikeOut" }, Dictionary::new())
                }
            };
            // each quad's corners: top-left, top-right, bottom-left, bottom-right
            let qp: Vec<f64> = quads.iter().flat_map(|q| [q[0], q[3], q[2], q[3], q[0], q[1], q[2], q[1]]).collect();
            (subtype, rect, appearance(rect, ops, res, 0), with_tags(""), Some(c), dictionary! { "QuadPoints" => nums(&qp) })
        }
        Body::TextBox { rect, text: body, size } => {
            let c = m.color.as_deref().and_then(rgb).unwrap_or([0.0; 3]);
            let r = bounds([*rect], 0.0);
            let (w, h) = if rotate & 1 == 1 { (r[3] - r[1], r[2] - r[0]) } else { (r[2] - r[0], r[3] - r[1]) };
            let lead = size * 1.25;
            // laid out upright in a box of the shown size centred on the rect; `appearance` turns it with the page
            let (cx, cy) = ((r[0] + r[2]) / 2.0, (r[1] + r[3]) / 2.0);
            let (x0, top) = (cx - w / 2.0, cy + h / 2.0);
            let mut ops = vec![op("BT", vec![]), op("Tf", vec!["Helv".into(), Object::Real(*size as f32)]), color_ops(c, true)];
            for (i, line) in text_lines(body, *size, w.max(*size)).into_iter().enumerate() {
                let y = top - size - i as f64 * lead;
                ops.extend([op("Tm", nums(&[1.0, 0.0, 0.0, 1.0, x0, y])), op("Tj", vec![Object::String(line, StringFormat::Literal)])]);
            }
            ops.push(op("ET", vec![]));
            let res = dictionary! { "Font" => fonts.clone() };
            let da = format!("/Helv {size} Tf {} {} {} rg", c[0], c[1], c[2]);
            let extra = dictionary! { "DA" => Object::string_literal(da), "DR" => dictionary! { "Font" => fonts.clone() } };
            ("FreeText", r, appearance(r, ops, res, rotate), with_tags(body), None, extra)
        }
        Body::Postit { at, text: body, .. } => {
            let c = color("#FFE066");
            let r = [at[0], at[1] - 14.0, at[0] + 14.0, at[1]];
            let edge = rgb("#b08900").expect("parses");
            let ops = vec![
                color_ops(c, true), color_ops(edge, false), op("w", nums(&[0.6])),
                op("m", nums(&[r[0], r[3]])), op("l", nums(&[r[2], r[3]])), op("l", nums(&[r[2], r[1] + 4.0])),
                op("l", nums(&[r[2] - 4.0, r[1]])), op("l", nums(&[r[0], r[1]])), op("h", vec![]), op("B", vec![]),
            ];
            let extra = dictionary! { "Name" => "Comment", "Open" => false };
            ("Text", r, appearance(r, ops, Dictionary::new(), 0), with_tags(body), Some(c), extra)
        }
        Body::Ink { strokes } => {
            let mut lists = vec![];
            let mut ops = vec![op("J", vec![1.into()]), op("j", vec![1.into()])];
            let mut boxes = vec![];
            let mut widest = 1.0f64;
            for s in strokes {
                let ss = &s.samples.0;
                if ss.is_empty() {
                    continue;
                }
                let c = s.color.as_deref().or(m.color.as_deref()).and_then(rgb).unwrap_or([0.0; 3]);
                widest = widest.max(s.width);
                ops.extend([op("q", vec![]), op("gs", vec![format!("G{}", (s.opacity * 100.0).round() as u32).into()]), color_ops(c, false)]);
                for w in ss.windows(2) {
                    let (a, b) = (w[0], w[1]);
                    ops.extend([op("w", nums(&[width_at(s.width, (a.pressure + b.pressure) / 2.0)])), op("m", nums(&[a.x, a.y])), op("l", nums(&[b.x, b.y])), op("S", vec![])]);
                }
                ops.push(op("Q", vec![]));
                boxes.extend(ss.iter().map(|p| [p.x, p.y, p.x, p.y]));
                lists.push(Object::Array(nums(&ss.iter().flat_map(|p| [p.x, p.y]).collect::<Vec<_>>())));
            }
            if lists.is_empty() {
                return None;
            }
            let rect = bounds(boxes, widest);
            let mut states = Dictionary::new();
            for s in strokes {
                let pct = (s.opacity * 100.0).round() as u32;
                states.set(format!("G{pct}"), dictionary! { "Type" => "ExtGState", "CA" => pct as f32 / 100.0, "ca" => pct as f32 / 100.0 });
            }
            let extra = dictionary! { "InkList" => lists, "BS" => dictionary! { "W" => widest as f32 } };
            let first = strokes.iter().find_map(|s| s.color.as_deref()).or(m.color.as_deref()).and_then(rgb).unwrap_or([0.0; 3]);
            ("Ink", rect, appearance(rect, ops, dictionary! { "ExtGState" => states }, 0), with_tags(""), Some(first), extra)
        }
        Body::Clip { rect, title } => {
            let c = color("#1c7ed6");
            let r = bounds([*rect], 0.0);
            let ops = vec![
                color_ops(c, false), op("w", nums(&[1.0])), op("d", vec![Object::Array(nums(&[4.0, 3.0])), 0.into()]),
                op("re", nums(&[r[0] + 0.5, r[1] + 0.5, r[2] - r[0] - 1.0, r[3] - r[1] - 1.0])), op("S", vec![]),
            ];
            let extra = dictionary! { "BS" => dictionary! { "W" => 1, "S" => "D", "D" => vec![4.into(), 3.into()] } };
            ("Square", r, appearance(r, ops, Dictionary::new(), 0), with_tags(title), Some(c), extra)
        }
        Body::Stamp { at, stamp } => {
            let c = color("#e03131");
            let r = [at[0] - 9.0, at[1] - 9.0, at[0] + 9.0, at[1] + 9.0];
            let (x, y) = (at[0], at[1]);
            let ops = match stamp {
                Stamp::Check => vec![
                    color_ops(c, false), op("w", nums(&[2.6])), op("J", vec![1.into()]), op("j", vec![1.into()]),
                    op("m", nums(&[x - 6.0, y])), op("l", nums(&[x - 2.0, y - 5.0])), op("l", nums(&[x + 6.5, y + 6.0])), op("S", vec![]),
                ],
                Stamp::Star => {
                    let mut ops = vec![color_ops(c, true)];
                    for i in 0..10 {
                        let a = std::f64::consts::FRAC_PI_2 + i as f64 * std::f64::consts::PI / 5.0;
                        let rad = if i % 2 == 0 { 8.5 } else { 3.6 };
                        ops.push(op(if i == 0 { "m" } else { "l" }, nums(&[x + rad * a.cos(), y + rad * a.sin()])));
                    }
                    ops.extend([op("h", vec![]), op("f", vec![])]);
                    ops
                }
                Stamp::Question | Stamp::Exclaim => {
                    let (g, w) = if *stamp == Stamp::Question { (b'?', 611.0) } else { (b'!', 333.0) };
                    let size = 18.0;
                    vec![
                        op("BT", vec![]), op("Tf", vec!["HelvB".into(), Object::Real(size as f32)]), color_ops(c, true),
                        op("Tm", nums(&[1.0, 0.0, 0.0, 1.0, x - w * size / 2000.0, y - size * 0.36])),
                        op("Tj", vec![Object::String(vec![g], StringFormat::Literal)]), op("ET", vec![]),
                    ]
                }
            };
            let name = match stamp {
                Stamp::Check => "Check",
                Stamp::Question => "Question",
                Stamp::Exclaim => "Exclaim",
                Stamp::Star => "Star",
            };
            let res = dictionary! { "Font" => fonts.clone() };
            ("Stamp", r, appearance(r, ops, res, rotate), with_tags(""), Some(c), dictionary! { "Name" => name })
        }
        Body::Bookmark { .. } | Body::Deleted => return None,
    };
    let mut d = dictionary! {
        "Type" => "Annot", "Subtype" => subtype, "Rect" => nums(&rect), "NM" => text(m.id.as_str()), "F" => 4,
    };
    if let Some(c) = c_main {
        d.set("C", c.iter().map(|&x| Object::Real(x)).collect::<Vec<_>>());
    }
    if !contents.is_empty() {
        d.set("Contents", text(&contents));
    }
    if let Some(dev) = &m.device {
        d.set("T", text(&format!("Atlas ({dev})")));
    }
    if let Some(c) = &m.created {
        d.set("M", Object::string_literal(pdf_date(c)));
        d.set("CreationDate", Object::string_literal(pdf_date(c)));
    }
    for (k, v) in extra {
        d.set(k, v);
    }
    Some((d, ap))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pdf_marks::{MarkId, Sample, Samples, Stroke};

    /// A two-page PDF (the second turned a quarter), its cross-reference table counted.
    fn two_pages() -> Vec<u8> {
        let objs = [
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Rotate 90 /Annots [] >>",
        ];
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

    fn mark(id: &str, page: u32, body: Body) -> Mark {
        Mark { id: MarkId::parse(id).unwrap(), page, version: 1, color: None, device: Some("desktop".into()), created: Some("2026-10-24T09:30".into()), tags: vec!["q".into()], body }
    }

    fn every_kind() -> Vec<Mark> {
        let samples = Samples(vec![
            Sample { x: 100.0, y: 500.0, pressure: 0.2, ..Default::default() },
            Sample { x: 150.0, y: 520.0, pressure: 0.9, t: 8, ..Default::default() },
        ]);
        vec![
            mark("m-00000001", 1, Body::Highlight { quads: vec![[72.0, 700.0, 300.0, 712.0]], quote: None }),
            mark("m-00000002", 1, Body::Postit { at: [310.0, 712.0], text: "Why?".into(), on: MarkId::parse("m-00000001") }),
            mark("m-00000003", 1, Body::Underline { quads: vec![[72.0, 680.0, 200.0, 692.0]], quote: None }),
            mark("m-00000004", 1, Body::Strike { quads: vec![[72.0, 660.0, 200.0, 672.0]], quote: None }),
            mark("m-00000005", 2, Body::TextBox { rect: [100.0, 100.0, 300.0, 140.0], text: "Café, a long line that wraps".into(), size: 12.0 }),
            mark("m-00000006", 1, Body::Ink { strokes: vec![Stroke { pen: "pen".into(), width: 2.0, color: None, opacity: 1.0, samples, openink: None }] }),
            mark("m-00000007", 1, Body::Clip { rect: [50.0, 50.0, 250.0, 200.0], title: "Figure 1".into() }),
            mark("m-00000008", 2, Body::Stamp { at: [400.0, 400.0], stamp: Stamp::Star }),
            mark("m-00000009", 2, Body::Bookmark { title: String::new() }),
            mark("m-0000000a", 7, Body::Stamp { at: [1.0, 1.0], stamp: Stamp::Check }),
        ]
    }

    fn annots(doc: &Document, page: u32) -> Vec<Dictionary> {
        let id = doc.get_pages()[&page];
        doc.get_page_annotations(id).unwrap().into_iter().cloned().collect()
    }

    #[test]
    fn every_kind_becomes_an_annotation_and_the_original_bytes_stay_first() {
        let pdf = two_pages();
        let (out, r) = annotate(pdf.clone(), &every_kind()).unwrap();
        assert_eq!((r.annotations, r.bookmarks, r.skipped, r.rewritten), (8, 1, 1, false));
        assert!(out.starts_with(&pdf), "an incremental update keeps the original's bytes");
        let doc = Document::load_mem(&out).unwrap();
        let p1 = annots(&doc, 1);
        let kinds: Vec<String> = p1.iter().map(|a| String::from_utf8(a.get(b"Subtype").unwrap().as_name().unwrap().to_vec()).unwrap()).collect();
        assert_eq!(kinds, ["Highlight", "Underline", "StrikeOut", "Text", "Ink", "Square"]);
        let hl = &p1[0];
        assert_eq!(hl.get(b"QuadPoints").unwrap().as_array().unwrap().len(), 8);
        assert_eq!(hl.get(b"Contents").unwrap().as_str().unwrap(), b"#q");
        assert!(hl.get(b"AP").is_ok());
        // the post-it answers its highlight
        let postit = &p1[3];
        let irt = postit.get(b"IRT").unwrap().as_reference().unwrap();
        assert_eq!(doc.get_dictionary(irt).unwrap().get(b"NM").unwrap().as_str().unwrap(), b"m-00000001");
        assert_eq!(postit.get(b"Contents").unwrap().as_str().unwrap(), b"Why?\n#q");
        // page 2 already had an (empty) inline /Annots
        let p2 = annots(&doc, 2);
        assert_eq!(p2.len(), 2);
        let free = p2.iter().find(|a| a.get(b"Subtype").unwrap().as_name().unwrap() == b"FreeText").unwrap();
        assert!(free.get(b"Contents").unwrap().as_str().unwrap().starts_with(&[0xFE, 0xFF]), "non-ASCII text in UTF-16");
        // the bookmark: an outline made, one item to page 2
        let cat = doc.catalog().unwrap();
        let outl = doc.get_dictionary(cat.get(b"Outlines").unwrap().as_reference().unwrap()).unwrap();
        let item = doc.get_dictionary(outl.get(b"First").unwrap().as_reference().unwrap()).unwrap();
        assert_eq!(item.get(b"Title").unwrap().as_str().unwrap(), b"Page 2");
        assert_eq!(item.get(b"Dest").unwrap().as_array().unwrap()[0].as_reference().unwrap(), doc.get_pages()[&2]);
    }

    #[test]
    fn exporting_twice_from_the_copy_adds_to_its_outline_and_annotations() {
        let (once, _) = annotate(two_pages(), &every_kind()).unwrap();
        let (twice, r) = annotate(once, &every_kind()).unwrap();
        assert_eq!(r.bookmarks, 1);
        let doc = Document::load_mem(&twice).unwrap();
        assert_eq!(annots(&doc, 1).len(), 12);
        let outl = doc.get_dictionary(doc.catalog().unwrap().get(b"Outlines").unwrap().as_reference().unwrap()).unwrap();
        assert_eq!(outl.get(b"Count").unwrap().as_i64().unwrap(), 2);
        let first = outl.get(b"First").unwrap().as_reference().unwrap();
        assert!(doc.get_dictionary(first).unwrap().get(b"Next").is_ok(), "the earlier last item points at the new one");
    }

    #[test]
    fn names_colours_dates_and_wrapping() {
        assert_eq!(marked_name("refs/a.b/x.pdf", Mode::Annotations), "refs/a.b/x (marked).pdf");
        assert_eq!(marked_name("x", Mode::Annotations), "x (marked).pdf");
        assert_eq!(marked_name("x.pdf", Mode::Flat), "x (marked, flat).pdf");
        assert_eq!(rgb("#fff"), Some([1.0, 1.0, 1.0]));
        assert_eq!(rgb("red"), None);
        assert_eq!(pdf_date("2026-10-24T09:30"), "D:202610240930");
        assert_eq!(text_lines("aaa bbb ccc", 10.0, 45.0), vec![b"aaa bbb".to_vec(), b"ccc".to_vec()]);
        assert_eq!(win_ansi("é→—“€"), vec![0xE9, b'?', 0x97, 0x93, 0x80]);
    }

    #[test]
    fn flat_draws_each_mark_into_its_page_after_the_page_own_content() {
        let pdf = two_pages();
        let (out, r) = write_marks(pdf.clone(), &every_kind(), Mode::Flat).unwrap();
        assert_eq!((r.annotations, r.bookmarks, r.skipped), (8, 1, 1));
        assert!(out.starts_with(&pdf));
        let doc = Document::load_mem(&out).unwrap();
        for (n, count) in [(1, 6), (2, 2)] {
            assert!(annots(&doc, n).is_empty(), "no annotations on page {n}");
            let page = doc.get_dictionary(doc.get_pages()[&n]).unwrap();
            let xobj = page.get(b"Resources").unwrap().as_dict().unwrap().get(b"XObject").unwrap().as_dict().unwrap();
            assert_eq!(xobj.iter().filter(|(k, _)| k.starts_with(b"AtlasMark")).count(), count);
            // [q] + (the page had no content) + [the marks]: the first stream saves the state, the last restores it first
            let parts = page.get(b"Contents").unwrap().as_array().unwrap();
            let body = |o: &Object| doc.get_object(o.as_reference().unwrap()).unwrap().as_stream().unwrap().content.clone();
            assert_eq!(body(&parts[0]), b"q\n");
            let last = String::from_utf8(body(parts.last().unwrap())).unwrap();
            assert!(last.starts_with("Q\n") && last.matches(" Do Q").count() == count, "{last}");
        }
        // a highlight's appearance fills its own rectangle: placed with no scaling, where it was
        let page = doc.get_dictionary(doc.get_pages()[&1]).unwrap();
        let last = page.get(b"Contents").unwrap().as_array().unwrap().last().unwrap().as_reference().unwrap();
        let first_line = String::from_utf8(doc.get_object(last).unwrap().as_stream().unwrap().content.clone()).unwrap().lines().nth(1).unwrap().to_string();
        assert!(first_line.starts_with("q 1 0 0 1 0 0 cm /AtlasMark0_0 Do Q"), "{first_line}");
    }

    #[test]
    fn a_file_that_is_no_pdf_says_so() {
        assert!(matches!(annotate(b"not a pdf".to_vec(), &[]), Err(Error::BadRequest(_))));
    }
}
