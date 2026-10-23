//! A PDF's marks, kept in the PDF's own note (docs/design/DESIGN-pdf-notes.md): one ```` ```pdf-marks ```` block, always
//! the last thing in the note, one mark a line — `<id> <kind> p<page> <json>`. Every device reads and writes it through
//! this module (the desktop through `/api/pdf-marks`, the phone through JNI), so a mark made on one sits in the same
//! place on the other. Everything outside the block is the owner's and comes back byte for byte.
//!
//! A mark changes by whole lines: its `version` grows with each change and a removed mark stays as a `deleted` line,
//! so two devices' copies merge mark by mark (`merge`) without bringing back what one of them removed.
use crate::sync_merge::{merge3, Merged};
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use ts_rs::TS;

/// The block's first line; its last is a bare fence.
pub const OPEN: &str = "```pdf-marks";
const CLOSE: &str = "```";

/// A mark's id: `m-` and 8 of `0-9a-z`. Also its block id in the note (`[[paper#^m-…]]`).
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(try_from = "String", into = "String")]
#[ts(export, type = "string")]
pub struct MarkId(String);

impl MarkId {
    pub fn parse(s: &str) -> Option<Self> {
        let rest = s.strip_prefix("m-")?;
        (rest.len() == 8 && rest.bytes().all(|b| b.is_ascii_digit() || b.is_ascii_lowercase())).then(|| Self(s.to_string()))
    }
    /// A new random id.
    pub fn new() -> Self {
        const ABC: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
        let mut b = [0u8; 8];
        getrandom::getrandom(&mut b).expect("the system's random source");
        Self(format!("m-{}", b.iter().map(|x| ABC[*x as usize % ABC.len()] as char).collect::<String>()))
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
}
impl Default for MarkId {
    fn default() -> Self {
        Self::new()
    }
}
impl TryFrom<String> for MarkId {
    type Error = String;
    fn try_from(s: String) -> Result<Self, String> {
        Self::parse(&s).ok_or_else(|| format!("not a mark id: {s}"))
    }
}
impl From<MarkId> for String {
    fn from(m: MarkId) -> String {
        m.0
    }
}

/// A box in PDF points, page space (y up): x0, y0, x1, y1.
pub type Quad = [f64; 4];

/// The passage's own words and a few around them (the W3C text-quote selector), so it can be found again whatever reads
/// the page.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Quote {
    pub exact: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub prefix: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub suffix: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Stamp {
    Check,
    Question,
    Exclaim,
    Star,
}

/// One pen sample as the Boox's pen gives it (openink): where (PDF points, page space), how hard, the pen's tilt, when
/// (ms from the stroke's start).
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Sample {
    pub x: f64,
    pub y: f64,
    pub pressure: f64,
    pub tilt_x: f64,
    pub tilt_y: f64,
    pub t: u32,
}

/// A stroke's samples, kept as quantized deltas in base64: 0.01 pt for places, 0.001 for pressure and tilt, 1 ms.
#[derive(Debug, Clone, PartialEq, Default, TS)]
#[ts(export, type = "string")]
pub struct Samples(pub Vec<Sample>);

const PLACE: f64 = 100.0;
const FINE: f64 = 1000.0;

impl Samples {
    pub fn encode(&self) -> String {
        let mut out = Vec::with_capacity(self.0.len() * 8);
        let mut last = [0i64; 6];
        for s in &self.0 {
            let now = [(s.x * PLACE).round() as i64, (s.y * PLACE).round() as i64, (s.pressure * FINE).round() as i64,
                (s.tilt_x * FINE).round() as i64, (s.tilt_y * FINE).round() as i64, s.t as i64];
            for k in 0..6 {
                varint(&mut out, zigzag(now[k] - last[k]));
            }
            last = now;
        }
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(out)
    }
    pub fn decode(s: &str) -> Option<Self> {
        let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s.trim()).ok()?;
        let (mut at, mut last, mut out) = (0usize, [0i64; 6], Vec::new());
        while at < bytes.len() {
            for v in last.iter_mut() {
                *v += unzigzag(read_varint(&bytes, &mut at)?);
            }
            out.push(Sample { x: last[0] as f64 / PLACE, y: last[1] as f64 / PLACE, pressure: last[2] as f64 / FINE,
                tilt_x: last[3] as f64 / FINE, tilt_y: last[4] as f64 / FINE, t: u32::try_from(last[5]).ok()? });
        }
        Some(Self(out))
    }
}
fn zigzag(v: i64) -> u64 {
    ((v << 1) ^ (v >> 63)) as u64
}
fn unzigzag(v: u64) -> i64 {
    ((v >> 1) as i64) ^ -((v & 1) as i64)
}
fn varint(out: &mut Vec<u8>, mut v: u64) {
    loop {
        let b = (v & 0x7f) as u8;
        v >>= 7;
        if v == 0 {
            out.push(b);
            return;
        }
        out.push(b | 0x80);
    }
}
fn read_varint(b: &[u8], at: &mut usize) -> Option<u64> {
    let mut v = 0u64;
    for shift in (0..64).step_by(7) {
        let x = *b.get(*at)?;
        *at += 1;
        v |= u64::from(x & 0x7f) << shift;
        if x & 0x80 == 0 {
            return Some(v);
        }
    }
    None
}
impl Serialize for Samples {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.encode())
    }
}
impl<'de> Deserialize<'de> for Samples {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        Samples::decode(&s).ok_or_else(|| serde::de::Error::custom("pen samples that do not decode"))
    }
}

/// A pen stroke: its samples, and the pen that drew it so every device draws it alike — `pen` the pen's name
/// (`fountain`, `ballpoint`, `marker`…), `width` in points; `openink` the Boox pen engine's own settings, kept as given
/// so the Boox redraws the stroke exactly.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Stroke {
    pub pen: String,
    pub width: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default = "one", skip_serializing_if = "is_one")]
    pub opacity: f64,
    pub samples: Samples,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(type = "unknown")]
    pub openink: Option<Value>,
}
fn one() -> f64 {
    1.0
}
fn is_one(v: &f64) -> bool {
    (*v - 1.0).abs() < 1e-6
}

/// What a mark is, with what that kind needs (and nothing another kind would).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "kebab-case")]
#[ts(export)]
pub enum Body {
    Highlight { quads: Vec<Quad>, #[serde(default, skip_serializing_if = "Option::is_none")] quote: Option<Quote> },
    Underline { quads: Vec<Quad>, #[serde(default, skip_serializing_if = "Option::is_none")] quote: Option<Quote> },
    Strike { quads: Vec<Quad>, #[serde(default, skip_serializing_if = "Option::is_none")] quote: Option<Quote> },
    /// Text written on the page, in its box; `size` the text's height in points.
    TextBox { rect: Quad, text: String, size: f64 },
    /// A note folded to an icon at `at`; `on`: the highlight it comments.
    Postit { at: [f64; 2], text: String, #[serde(default, skip_serializing_if = "Option::is_none")] on: Option<MarkId> },
    Ink { strokes: Vec<Stroke> },
    /// A region of the page (a figure, an equation), shown in the note as a picture of that part.
    Clip { rect: Quad, #[serde(default, skip_serializing_if = "String::is_empty")] title: String },
    Stamp { at: [f64; 2], stamp: Stamp },
    Bookmark { #[serde(default, skip_serializing_if = "String::is_empty")] title: String },
    /// A removed mark, kept so a copy that still has it does not bring it back on a merge.
    Deleted,
}

impl Body {
    pub fn kind(&self) -> &'static str {
        match self {
            Body::Highlight { .. } => "highlight",
            Body::Underline { .. } => "underline",
            Body::Strike { .. } => "strike",
            Body::TextBox { .. } => "text-box",
            Body::Postit { .. } => "postit",
            Body::Ink { .. } => "ink",
            Body::Clip { .. } => "clip",
            Body::Stamp { .. } => "stamp",
            Body::Bookmark { .. } => "bookmark",
            Body::Deleted => "deleted",
        }
    }
}

/// One mark. `page` counts from 1; `version` grows with each change (the core sets it).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Mark {
    pub id: MarkId,
    pub page: u32,
    #[serde(default)]
    pub version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Where it was made: `desktop`, `android`…
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
    /// When it was made, `YYYY-MM-DDTHH:MM`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(flatten)]
    pub body: Body,
}

impl Mark {
    pub fn line(&self) -> String {
        let mut v = serde_json::to_value(self).expect("a mark is plain data");
        let o = v.as_object_mut().expect("a mark is an object");
        for k in ["id", "kind", "page"] {
            o.remove(k);
        }
        format!("{} {} p{} {}", self.id.as_str(), self.body.kind(), self.page, v)
    }
    pub fn from_line(line: &str) -> Option<Self> {
        let mut parts = line.trim().splitn(4, ' ');
        let (id, kind, page) = (parts.next()?, parts.next()?, parts.next()?.strip_prefix('p')?.parse::<u32>().ok()?);
        let mut o: Map<String, Value> = match parts.next() {
            Some(rest) => serde_json::from_str(rest).ok()?,
            None => Map::new(),
        };
        o.insert("id".into(), id.into());
        o.insert("kind".into(), kind.into());
        o.insert("page".into(), page.into());
        let m: Mark = serde_json::from_value(Value::Object(o)).ok()?;
        (m.page >= 1).then_some(m)
    }
}

/// The block: its marks by id, and any line it could not read (kept as it was, never lost).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Block {
    pub marks: BTreeMap<MarkId, Mark>,
    pub unread: Vec<String>,
}

impl Block {
    /// The marks still there (not removed), in reading order.
    pub fn live(&self) -> Vec<&Mark> {
        let mut v: Vec<&Mark> = self.marks.values().filter(|m| m.body != Body::Deleted).collect();
        v.sort_by(|a, b| order(a, b));
        v
    }
}

fn order(a: &Mark, b: &Mark) -> std::cmp::Ordering {
    (a.page, &a.created, &a.id).cmp(&(b.page, &b.created, &b.id))
}

/// Where the block lies: the byte range of its lines, fences included.
fn span(note: &str) -> Option<(usize, usize)> {
    let mut at = 0;
    let mut start = None;
    for line in note.split_inclusive('\n') {
        let t = line.trim_end();
        match start {
            None if t == OPEN => start = Some(at),
            Some(s) if t == CLOSE => return Some((s, at + line.len())),
            _ => {}
        }
        at += line.len();
    }
    start.map(|s| (s, note.len())) // an unclosed block runs to the end
}

/// The note without its block: the owner's text.
pub fn outside(note: &str) -> String {
    match span(note) {
        Some((a, b)) => format!("{}{}", &note[..a], &note[b..]),
        None => note.to_string(),
    }
}

pub fn read(note: &str) -> Block {
    let mut block = Block::default();
    let Some((a, b)) = span(note) else { return block };
    for line in note[a..b].lines().skip(1) {
        if line.trim_end() == CLOSE || line.trim().is_empty() {
            continue;
        }
        match Mark::from_line(line) {
            Some(m) => keep_newer(&mut block.marks, m),
            None => block.unread.push(line.to_string()),
        }
    }
    block
}

/// The note with `block` as its last part; the owner's text as it was (a block found elsewhere moves to the end).
/// No marks and nothing unread: no block.
pub fn write(note: &str, block: &Block) -> String {
    let mut out = outside(note);
    if block.marks.is_empty() && block.unread.is_empty() {
        return out;
    }
    let body = out.trim_end().len();
    out.truncate(body);
    if !out.is_empty() {
        out.push_str("\n\n");
    }
    out.push_str(OPEN);
    out.push('\n');
    let mut marks: Vec<&Mark> = block.marks.values().collect();
    marks.sort_by(|a, b| order(a, b));
    for m in marks {
        out.push_str(&m.line());
        out.push('\n');
    }
    for l in &block.unread {
        out.push_str(l);
        out.push('\n');
    }
    out.push_str(CLOSE);
    out.push('\n');
    out
}

/// A change to the marks.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "op", rename_all = "lowercase")]
#[ts(export)]
pub enum Op {
    /// Adds the mark, or replaces the one with its id (one version up).
    Put { mark: Box<Mark> },
    Remove { id: MarkId },
}

/// `ops` applied in order.
pub fn apply(block: &mut Block, ops: Vec<Op>) {
    for op in ops {
        match op {
            Op::Put { mark } => {
                let mut mark = *mark;
                mark.version = block.marks.get(&mark.id).map_or(1, |m| m.version + 1);
                block.marks.insert(mark.id.clone(), mark);
            }
            Op::Remove { id } => {
                if let Some(m) = block.marks.get_mut(&id) {
                    if m.body != Body::Deleted {
                        m.body = Body::Deleted;
                        m.version += 1;
                        m.tags.clear();
                    }
                }
            }
        }
    }
}

/// `m` unless a newer version of it is there. Equal versions that differ are settled the same way on every device
/// (by their lines), so two devices merging each other's copies end equal.
fn keep_newer(marks: &mut BTreeMap<MarkId, Mark>, m: Mark) {
    match marks.get(&m.id) {
        Some(old) if (old.version, old.line()) >= (m.version, m.line()) => {}
        _ => {
            marks.insert(m.id.clone(), m);
        }
    }
}

/// Two copies' marks as one: every mark of either, the newer version where both have it.
pub fn merge(a: &Block, b: &Block) -> Block {
    let mut out = a.clone();
    for m in b.marks.values() {
        keep_newer(&mut out.marks, m.clone());
    }
    for l in &b.unread {
        if !out.unread.contains(l) {
            out.unread.push(l.clone());
        }
    }
    out
}

/// Two copies of a note with marks merged against their base (sync_merge.rs): the owner's text line by line, the
/// marks mark by mark. None when both changed the same lines of the owner's text.
pub fn merge_notes(base: &str, ours: &str, theirs: &str) -> Option<String> {
    let text = match merge3(&outside(base), &outside(ours), &outside(theirs)) {
        Merged::Clean(t) => t,
        Merged::Clashed => return None,
    };
    Some(write(&text, &merge(&read(ours), &read(theirs))))
}

/// Whether `note` has a marks block.
pub fn has_block(note: &str) -> bool {
    span(note).is_some()
}

/// A PDF's marks as the API gives them: the note that holds them (none yet: no mark made) and the live marks.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename = "PdfMarks")]
pub struct Marks {
    pub note: Option<String>,
    pub marks: Vec<Mark>,
}

fn note_of(root: &std::path::Path, cfg: &crate::config::Config, pdf: &str, make: bool, now: chrono::NaiveDateTime) -> crate::Result<crate::api::CompanionNote> {
    let req = crate::api::CompanionRequest { path: pdf.into(), title: None, properties: Default::default(), block: None, find: !make };
    crate::companion::ensure(root, cfg, &req, now)
}

/// `GET /api/pdf-marks?pdf=`: the marks of `pdf`, read from its note's block. Makes no note.
pub fn marks_of(root: &std::path::Path, cfg: &crate::config::Config, pdf: &str) -> crate::Result<Marks> {
    let note = note_of(root, cfg, pdf, false, chrono::Local::now().naive_local())?;
    let text = std::fs::read_to_string(crate::paths::safe_join(root, &note.path)?).ok();
    Ok(match text {
        Some(t) => Marks { note: Some(note.path), marks: read(&t).live().into_iter().cloned().collect() },
        None => Marks { note: None, marks: vec![] },
    })
}

/// `POST /api/pdf-marks?pdf=`: `ops` applied to `pdf`'s note (made with the first mark), the rest of it untouched.
/// Returns the marks after, and whether the note was just made.
pub fn change(root: &std::path::Path, cfg: &crate::config::Config, pdf: &str, ops: Vec<Op>, now: chrono::NaiveDateTime) -> crate::Result<(Marks, bool)> {
    let note = note_of(root, cfg, pdf, true, now)?;
    let abs = crate::paths::safe_join(root, &note.path)?;
    let text = std::fs::read_to_string(&abs)?;
    let mut block = read(&text);
    apply(&mut block, ops);
    let next = write(&text, &block);
    if next != text {
        crate::vault_write::write(&abs, next.as_bytes())?;
    }
    let marks = block.live().into_iter().cloned().collect();
    Ok((Marks { note: Some(note.path), marks }, note.created))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hl(id: &str, page: u32, words: &str) -> Mark {
        Mark { id: MarkId::parse(id).unwrap(), page, version: 0, color: Some("#FFE066".into()), device: Some("desktop".into()),
            created: Some("2026-10-23T10:00".into()), tags: vec![],
            body: Body::Highlight { quads: vec![[72.0, 700.0, 200.0, 712.5]], quote: Some(Quote { exact: words.into(), prefix: "the ".into(), suffix: String::new() }) } }
    }
    fn ink(id: &str) -> Mark {
        let samples = Samples((0..40).map(|i| Sample { x: 100.0 + i as f64 * 0.37, y: 500.0 - i as f64 * 0.11, pressure: 0.8 + (i % 7) as f64 * 0.01,
            tilt_x: 0.25, tilt_y: -0.125, t: i * 8 }).collect());
        // as stored: on the 0.01 pt grid (the codec's own precision test is separate)
        let samples = Samples::decode(&samples.encode()).unwrap();
        Mark { id: MarkId::parse(id).unwrap(), page: 7, version: 0, color: None, device: Some("android".into()), created: None, tags: vec!["todo".into()],
            body: Body::Ink { strokes: vec![Stroke { pen: "fountain".into(), width: 1.2, color: None, opacity: 1.0, samples,
                openink: Some(serde_json::json!({ "pen": 1, "config": { "thinning": 0.6 } })) }] } }
    }
    fn put(b: &mut Block, m: Mark) {
        apply(b, vec![Op::Put { mark: Box::new(m) }]);
    }

    #[test]
    fn a_mark_line_round_trips_every_kind() {
        let id = |s| MarkId::parse(s).unwrap();
        let marks = vec![
            hl("m-aaaaaaa1", 3, "quantum dot"),
            ink("m-aaaaaaa2"),
            Mark { body: Body::Postit { at: [10.0, 20.0], text: "check eq. 4 #question".into(), on: Some(id("m-aaaaaaa1")) }, ..hl("m-aaaaaaa3", 3, "") },
            Mark { body: Body::TextBox { rect: [1.0, 2.0, 3.0, 4.0], text: "two\nlines".into(), size: 10.0 }, ..hl("m-aaaaaaa4", 1, "") },
            Mark { body: Body::Clip { rect: [1.0, 2.0, 300.0, 400.0], title: "Fig. 2".into() }, ..hl("m-aaaaaaa5", 2, "") },
            Mark { body: Body::Stamp { at: [5.0, 6.0], stamp: Stamp::Star }, ..hl("m-aaaaaaa6", 2, "") },
            Mark { body: Body::Bookmark { title: "Methods".into() }, ..hl("m-aaaaaaa7", 4, "") },
            Mark { body: Body::Underline { quads: vec![[0.0, 0.0, 1.0, 1.0]], quote: None }, ..hl("m-aaaaaaa8", 4, "") },
            Mark { body: Body::Strike { quads: vec![[0.0, 0.0, 1.0, 1.0]], quote: None }, ..hl("m-aaaaaaa9", 4, "") },
        ];
        for m in marks {
            let line = m.line();
            assert!(line.starts_with(&format!("{} {} p{} {{", m.id.as_str(), m.body.kind(), m.page)), "{line}");
            assert!(!line.contains('\n'), "one line: {line}");
            assert_eq!(Mark::from_line(&line).as_ref(), Some(&m), "{line}");
        }
    }

    #[test]
    fn pen_samples_keep_pressure_tilt_and_time() {
        let Body::Ink { strokes } = ink("m-bbbbbbb1").body else { unreachable!() };
        let s = &strokes[0].samples;
        let back = Samples::decode(&s.encode()).unwrap();
        assert_eq!(back.0.len(), s.0.len());
        for (a, b) in s.0.iter().zip(&back.0) {
            assert!((a.x - b.x).abs() <= 0.005 && (a.y - b.y).abs() <= 0.005, "{a:?} {b:?}");
            assert!((a.pressure - b.pressure).abs() <= 0.0005 && (a.tilt_x - b.tilt_x).abs() <= 0.0005 && (a.tilt_y - b.tilt_y).abs() <= 0.0005);
            assert_eq!(a.t, b.t);
        }
        // compact: a 40-sample stroke in well under 20 bytes a sample
        assert!(s.encode().len() < 40 * 20, "{}", s.encode().len());
    }

    #[test]
    fn the_block_is_last_and_the_owners_text_is_untouched() {
        let note = "---\npdf: paper.pdf\n---\n# Paper\n\nmy own notes\n";
        let mut b = read(note);
        put(&mut b, hl("m-ccccccc1", 3, "a passage"));
        let out = write(note, &b);
        assert!(out.starts_with(note.trim_end()), "{out}");
        assert!(out.trim_end().ends_with(CLOSE));
        assert_eq!(outside(&out).trim_end(), note.trim_end());
        assert_eq!(read(&out).live().len(), 1);
        // the owner writes below the block: the block moves back to the end, their line kept
        let edited = format!("{out}a line after\n");
        let again = write(&edited, &read(&edited));
        assert!(again.contains("my own notes\n\na line after") || again.contains("a line after"), "{again}");
        assert!(again.trim_end().ends_with(CLOSE), "{again}");
        assert_eq!(read(&again), read(&edited));
    }

    #[test]
    fn put_bumps_the_version_and_remove_leaves_a_deleted_line() {
        let mut b = Block::default();
        put(&mut b, hl("m-ddddddd1", 1, "x"));
        put(&mut b, hl("m-ddddddd1", 1, "x y"));
        assert_eq!(b.marks.values().next().unwrap().version, 2);
        apply(&mut b, vec![Op::Remove { id: MarkId::parse("m-ddddddd1").unwrap() }]);
        assert!(b.live().is_empty());
        let out = write("", &b);
        assert!(out.contains("m-ddddddd1 deleted p1"), "{out}");
        assert_eq!(read(&out).marks.values().next().unwrap().version, 3);
    }

    #[test]
    fn a_line_it_cannot_read_is_kept() {
        let note = format!("text\n\n{OPEN}\nm-eeeeeee1 highlight p2 {{\"quads\":[]}}\nsomething from a newer Atlas\n{CLOSE}\n");
        let b = read(&note);
        assert_eq!(b.marks.len(), 1);
        assert_eq!(b.unread, vec!["something from a newer Atlas".to_string()]);
        assert!(write(&note, &b).contains("something from a newer Atlas"));
    }

    #[test]
    fn two_copies_merge_mark_by_mark_and_a_removal_stays_removed() {
        let mut base = Block::default();
        put(&mut base, hl("m-fffffff1", 1, "kept"));
        put(&mut base, hl("m-fffffff2", 2, "removed on the phone"));
        let base_note = write("# P\n\nmine\n", &base);
        // the desktop adds one and edits the owner's text; the phone removes one and adds ink
        let mut desk = read(&base_note);
        put(&mut desk, hl("m-fffffff3", 5, "desktop's"));
        let desk_note = write(&base_note.replace("mine", "mine, edited"), &desk);
        let mut phone = read(&base_note);
        apply(&mut phone, vec![Op::Remove { id: MarkId::parse("m-fffffff2").unwrap() }]);
        put(&mut phone, ink("m-fffffff4"));
        let phone_note = write(&base_note, &phone);
        let merged = merge_notes(&base_note, &desk_note, &phone_note).unwrap();
        let ids: Vec<String> = read(&merged).live().iter().map(|m| m.id.as_str().to_string()).collect();
        assert_eq!(ids, ["m-fffffff1", "m-fffffff3", "m-fffffff4"]);
        assert!(merged.contains("mine, edited"));
        // the same either way round
        assert_eq!(merge_notes(&base_note, &phone_note, &desk_note).unwrap(), merged);
    }

    #[test]
    fn ids_are_checked() {
        assert!(MarkId::parse("m-k2f9q1xz").is_some());
        for bad in ["m-K2F9Q1XZ", "m-short", "x-k2f9q1xz", "m-k2f9q1xz9"] {
            assert!(MarkId::parse(bad).is_none(), "{bad}");
        }
        assert!(MarkId::parse(MarkId::new().as_str()).is_some());
        assert!(serde_json::from_str::<MarkId>("\"nope\"").is_err());
    }

    #[test]
    fn the_first_mark_makes_the_note_and_later_ones_keep_its_text() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("books")).unwrap();
        std::fs::write(dir.path().join("books/x.pdf"), b"%PDF-1.4").unwrap();
        let cfg = crate::config::Config::default();
        let now = chrono::NaiveDate::from_ymd_opt(2026, 1, 2).unwrap().and_hms_opt(3, 4, 5).unwrap();
        assert_eq!(marks_of(dir.path(), &cfg, "books/x.pdf").unwrap().marks.len(), 0);
        let (m, made) = change(dir.path(), &cfg, "books/x.pdf", vec![Op::Put { mark: Box::new(hl("m-aaaaaaa1", 1, "w")) }], now).unwrap();
        assert!(made);
        let note = m.note.unwrap();
        let abs = dir.path().join(&note);
        let mine = std::fs::read_to_string(&abs).unwrap() + "\nmy own words\n";
        std::fs::write(&abs, &mine).unwrap();
        let (m, made) = change(dir.path(), &cfg, "books/x.pdf", vec![Op::Put { mark: Box::new(hl("m-aaaaaaa2", 2, "v")) }], now).unwrap();
        assert!(!made);
        assert_eq!(m.marks.len(), 2);
        let after = std::fs::read_to_string(&abs).unwrap();
        assert!(after.contains("my own words"));
        assert!(after.trim_end().ends_with("```"), "the block is last: {after}");
        assert_eq!(marks_of(dir.path(), &cfg, "books/x.pdf").unwrap().marks.len(), 2);
    }

    #[test]
    fn the_samples_codec_is_the_one_every_device_reads() {
        // the same string the desktop's test pins (ui/tests/pdf-marks.spec.ts)
        let s = |x, y, pressure, tilt_x, tilt_y, t| Sample { x, y, pressure, tilt_x, tilt_y, t };
        let samples = Samples(vec![s(100.0, 500.0, 0.8, 0.25, -0.125, 0), s(100.37, 499.89, 0.81, 0.25, -0.125, 8), s(99.5, 501.25, 0.0, -1.0, 1.0, 17)]);
        assert_eq!(samples.encode(), "oJwBoI0GwAz0A_kBAEoVFAAAEK0BkALTDMMTyhES");
        assert_eq!(Samples::decode("oJwBoI0GwAz0A_kBAEoVFAAAEK0BkALTDMMTyhES"), Some(samples));
    }
}
