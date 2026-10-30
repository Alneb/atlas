//! The OCR plugin's helper: a captured picture's text is
//! read on this machine by Tesseract (kreuzberg-tesseract: the engine compiled into this program, its language models
//! fetched once), kept under the capture as a collapsed callout — so search finds it — and handed to the catalog like
//! typed text, so a link or a DOI in a screenshot is filed too. Tesseract over ocrs: ocrs read "mañana" as "ma?ana"; Tesseract reads Spanish, French… as written.
use atlas_plugin::{serve, Atlas, Error, Methods, Result};
use kreuzberg_tesseract::TesseractAPI;
use serde_json::{json, Value};
use std::cell::RefCell;
use std::path::{Path, PathBuf};
use std::rc::Rc;

/// Tesseract's fast models (the ones distributions ship): a few MB per language.
const MODELS_URL: &str = "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main";
const PICTURES: [&str; 6] = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];
const ME: &str = "ocr";

fn fail<T>(why: impl Into<String>) -> Result<T> {
    Err(Error { status: None, why: why.into() })
}

fn is_picture(name: &str) -> bool {
    name.rsplit_once('.').is_some_and(|(_, ext)| PICTURES.contains(&ext.to_ascii_lowercase().as_str()))
}

/// The pictures a capture embeds: `![[Shot.png]]`, `![[Shot.png|300]]`, `![alt](files/Shot.png)`, in order, once each.
fn pictures_in(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut push = |t: &str| {
        let t = t.trim();
        if is_picture(t) && !out.iter().any(|o| o == t) {
            out.push(t.to_string());
        }
    };
    for part in text.split("![[").skip(1) {
        if let Some((inner, _)) = part.split_once("]]") {
            push(inner.split('|').next().unwrap_or(inner));
        }
    }
    for part in text.split("![").skip(1) {
        if let Some((_, rest)) = part.split_once("](") {
            if let Some((target, _)) = rest.split_once(')') {
                push(&target.replace("%20", " "));
            }
        }
    }
    out
}

/// The text read, as a callout folded under the picture: searchable, out of the way.
fn callout(name: &str, text: &str) -> String {
    let file = name.rsplit('/').next().unwrap_or(name);
    let body: Vec<String> = text.lines().map(|l| format!("> {l}").trim_end().to_string()).collect();
    format!("> [!ocr]- Text in {file}\n{}", body.join("\n"))
}

/// The note with `block` right after the line that embeds `name`: the first such line from `from` (the capture's own,
/// 0-based), else the last in the note; None when no line does, or its callout is there.
fn with_callout(note: &str, name: &str, block: &str, from: Option<usize>) -> Option<String> {
    let lines: Vec<&str> = note.lines().collect();
    let embeds = |l: &&str| l.contains(name) && !l.trim_start().starts_with('>');
    let at = from
        .and_then(|f| lines.iter().skip(f).position(embeds).map(|i| f + i))
        .or_else(|| lines.iter().rposition(embeds))?;
    let head = block.lines().next().unwrap_or("");
    if lines.get(at + 1).is_some_and(|next| next.trim() == head) {
        return None; // read before: never twice
    }
    // indented like the embed, so a capture's list item keeps its picture and its text together
    let indent: String = lines[at].chars().take_while(|c| c.is_whitespace()).collect();
    let mut out: Vec<String> = lines[..=at].iter().map(|l| l.to_string()).collect();
    out.extend(block.lines().map(|l| format!("{indent}{l}")));
    out.extend(lines[at + 1..].iter().map(|l| l.to_string()));
    let mut text = out.join("\n");
    if note.ends_with('\n') {
        text.push('\n');
    }
    Some(text)
}

/// Lines a person would read: the model's specks (a lone `|`, `.`, `-`) dropped; a lone digit or letter kept.
fn tidy(lines: impl IntoIterator<Item = String>) -> String {
    lines.into_iter().map(|l| l.trim().to_string()).filter(|l| l.chars().count() > 1 || l.chars().all(char::is_alphanumeric) && !l.is_empty()).collect::<Vec<_>>().join("\n")
}

/// Where a picture named in a note is: a path as written (beside the note, or from the vault's root), else the one
/// file of that name anywhere (an `![[embed]]` names only the file).
fn locate(atlas: &Atlas, root: &Path, note: &str, name: &str) -> Result<PathBuf> {
    let dir = Path::new(note).parent().unwrap_or(Path::new(""));
    for p in [root.join(dir).join(name), root.join(name)] {
        if p.is_file() {
            return Ok(p);
        }
    }
    let file = name.rsplit('/').next().unwrap_or(name);
    if let Some(rel) = atlas.files(false)?.into_iter().find(|f| f == file || f.ends_with(&format!("/{file}"))) {
        return Ok(root.join(rel));
    }
    // a picture written a moment ago (the capture's own) may not be in the index yet: it is on disk
    match on_disk(root, file) {
        Some(p) => Ok(p),
        None => fail(format!("no picture {name} in the vault")),
    }
}

/// The file named `file` under `root`, hidden folders (`.atlas`, `.git`) left out; the first found.
fn on_disk(root: &Path, file: &str) -> Option<PathBuf> {
    let mut dirs = vec![root.to_path_buf()];
    while let Some(dir) = dirs.pop() {
        for e in std::fs::read_dir(&dir).ok()?.flatten() {
            let (path, name) = (e.path(), e.file_name());
            if name.to_string_lossy().starts_with('.') {
                continue;
            }
            match e.file_type() {
                Ok(t) if t.is_dir() => dirs.push(path),
                Ok(t) if t.is_file() && name == file => return Some(path),
                _ => {}
            }
        }
    }
    None
}

/// The engine, loaded on first use (again when the languages change); each language's model fetched into the plugin's
/// cache the first time of all.
#[derive(Default)]
struct Reader {
    engine: Option<(String, TesseractAPI)>,
}

impl Reader {
    fn engine(&mut self, atlas: &Atlas, languages: &str) -> Result<&TesseractAPI> {
        if self.engine.as_ref().is_none_or(|(l, _)| l != languages) {
            let cache = PathBuf::from(std::env::var("ATLAS_PLUGIN_CACHE").unwrap_or_else(|_| format!(".atlas/cache/plugins/{ME}")));
            let data = cache.join("tessdata");
            for lang in languages.split('+') {
                let file = format!("{lang}.traineddata");
                if !data.join(&file).is_file() {
                    eprintln!("ocr: fetching the {lang} model (once)");
                    let r = atlas.post(&format!("/api/plugins/{ME}/fetch"), &json!({ "url": format!("{MODELS_URL}/{file}"), "save_to": format!("tessdata/{file}"), "timeout_secs": 300 }))?;
                    if r["ok"] != json!(true) {
                        return fail(format!("the OCR model for {lang} could not be fetched (status {})", r["status"]));
                    }
                }
            }
            let api = TesseractAPI::new().or_else(|e| fail(format!("Tesseract: {e}")))?;
            api.init(&data, languages).or_else(|e| fail(format!("Tesseract with {languages}: {e}")))?;
            self.engine = Some((languages.to_string(), api));
        }
        Ok(&self.engine.as_ref().expect("loaded above").1)
    }

    fn read(&mut self, atlas: &Atlas, path: &Path, languages: &str) -> Result<String> {
        let (img, scale) = prepare(image::open(path).or_else(|e| fail(format!("{}: {e}", path.display())))?);
        let (w, h) = img.dimensions();
        let api = self.engine(atlas, languages)?;
        let (w, h) = (i32::try_from(w).or_else(|_| fail("too wide"))?, i32::try_from(h).or_else(|_| fail("too tall"))?);
        api.set_image(img.as_raw(), w, h, 1, w).or_else(|e| fail(format!("{}: {e}", path.display())))?;
        api.set_source_resolution(96 * scale).or_else(|e| fail(e.to_string()))?; // a screen's 96, times what prepare enlarged
        let text = api.get_utf8_text().or_else(|e| fail(e.to_string()))?;
        Ok(tidy(text.lines().map(mend_links)))
    }
}

/// The side of the squares light and dark are judged in: a sidebar, a panel, a code block each decide for themselves.
const TILE: u32 = 96;

/// What Tesseract reads best, and how many times it was enlarged: grey, dark text on light (each dark region of a
/// screenshot inverted on its own: a dark sidebar beside a light page), and a screen's text enlarged twice (its
/// models are trained on text ~30 px high; a UI's is ~13). A screen up to 4K is enlarged; a photo (both sides long)
/// keeps its size, its text being large already.
fn prepare(img: image::DynamicImage) -> (image::GrayImage, i32) {
    let mut g = img.into_luma8();
    let (w, h) = g.dimensions();
    for ty in (0..h).step_by(TILE as usize) {
        for tx in (0..w).step_by(TILE as usize) {
            let (tw, th) = (TILE.min(w - tx), TILE.min(h - ty));
            let sum: u64 = (ty..ty + th).flat_map(|y| (tx..tx + tw).map(move |x| (x, y))).map(|(x, y)| u64::from(g.get_pixel(x, y).0[0])).sum();
            if sum < 128 * u64::from(tw * th) {
                for y in ty..ty + th {
                    for x in tx..tx + tw {
                        let p = g.get_pixel_mut(x, y);
                        p.0[0] = 255 - p.0[0];
                    }
                }
            }
        }
    }
    if w.max(h) <= 4096 && w.min(h) <= 2200 {
        return (image::imageops::resize(&g, w * 2, h * 2, image::imageops::FilterType::CatmullRom), 2);
    }
    (g, 1)
}

/// The languages to read in: the setting (`eng+spa+fra`), else English plus the system's language.
fn languages(p: &Value) -> String {
    let raw = p.pointer("/settings/languages").and_then(Value::as_str).unwrap_or("");
    let codes: Vec<&str> = raw.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_')).filter(|c| !c.is_empty()).collect();
    if codes.is_empty() { default_languages(&system_locale()) } else { codes.join("+") }
}

/// The locale as the C library reads it: the first of LC_ALL, LC_MESSAGES, LANG that is set.
fn system_locale() -> String {
    ["LC_ALL", "LC_MESSAGES", "LANG"].iter().find_map(|k| std::env::var(k).ok().filter(|v| !v.is_empty())).unwrap_or_default()
}

/// `eng`, plus the locale's language as Tesseract names it (`es_ES.UTF-8` → `eng+spa`); an unknown one adds nothing.
fn default_languages(locale: &str) -> String {
    const TESS: [(&str, &str); 16] = [("es", "spa"), ("fr", "fra"), ("de", "deu"), ("it", "ita"), ("pt", "por"), ("ca", "cat"),
        ("nl", "nld"), ("pl", "pol"), ("ru", "rus"), ("sv", "swe"), ("da", "dan"), ("fi", "fin"), ("cs", "ces"),
        ("tr", "tur"), ("ja", "jpn"), ("zh", "chi_sim")];
    let lang = locale.split(['_', '.', '@']).next().unwrap_or("");
    match TESS.iter().find(|(iso, _)| *iso == lang) {
        Some((_, code)) => format!("eng+{code}"),
        None => "eng".into(),
    }
}

/// Tesseract breaks links with spaces: "https: //…", "www. example.org", "https://example. org/x". Put back together,
/// so the catalog still sees the link. Only a link-shaped word is joined to the next: prose's ". " stays.
fn mend_links(line: &str) -> String {
    let mut out = line.to_string();
    for scheme in ["https:", "http:"] {
        out = out.replace(&format!("{scheme} //"), &format!("{scheme}//"));
    }
    out = out.replace("www. ", "www.");
    let mut words: Vec<String> = Vec::new();
    for w in out.split(' ') {
        let joins = words.last().is_some_and(|prev| (prev.contains("://") || prev.starts_with("www.")) && prev.ends_with('.'))
            && w.starts_with(|c: char| c.is_ascii_lowercase() || c == '/');
        match words.last_mut() {
            Some(prev) if joins => prev.push_str(w),
            _ => words.push(w.to_string()),
        }
    }
    words.join(" ")
}

fn str_param<'a>(p: &'a Value, key: &str) -> Result<&'a str> {
    match p.get(key).and_then(Value::as_str) {
        Some(s) => Ok(s),
        None => fail(format!("{key}: missing")),
    }
}

/// After a capture: each picture in it read, its text put under it, and all of it offered to the catalog.
fn on_capture(atlas: &Atlas, reader: &mut Reader, p: &Value) -> Result<Value> {
    let text = str_param(p, "text")?;
    let pictures = pictures_in(text);
    if pictures.is_empty() {
        return Ok(json!({ "skipped": "no picture" }));
    }
    let note = str_param(p, "path")?;
    let root = PathBuf::from(std::env::var("ATLAS_ROOT").unwrap_or_else(|_| ".".into()));
    // each picture on its own: one that cannot be found or read does not keep the others from being read
    let (mut read, mut failed) = (Vec::new(), Vec::new());
    for name in &pictures {
        match locate(atlas, &root, note, name).and_then(|at| reader.read(atlas, &at, &languages(p))) {
            Ok(words) if !words.is_empty() => read.push((name.clone(), words)),
            Ok(_) => {}
            Err(e) => failed.push(format!("{}: {}", name.rsplit('/').next().unwrap_or(name), e.why)),
        }
    }
    if read.is_empty() {
        return match failed.is_empty() {
            true => Ok(json!({ "skipped": "no text in the picture" })),
            false => fail(failed.join("; ")),
        };
    }
    let mut body = atlas.read(note)?;
    let before = body.clone();
    // the capture's own line (1-based from the hook) first: the picture may be named again further down
    let from = p.get("line").and_then(Value::as_u64).and_then(|l| usize::try_from(l).ok()).map(|l| l.saturating_sub(1));
    for (name, words) in &read {
        if let Some(next) = with_callout(&body, name, &callout(name, words), from) {
            body = next;
        }
    }
    if body != before {
        atlas.write(note, &body)?;
    }
    let count: usize = read.iter().map(|(_, w)| w.split_whitespace().count()).sum();
    let mut said = format!("Read {count} words from {}", read.iter().map(|(n, _)| n.rsplit('/').next().unwrap_or(n)).collect::<Vec<_>>().join(", "));
    if !failed.is_empty() {
        said = format!("{said} ({} of {} pictures; not read: {})", read.len(), pictures.len(), failed.join("; "));
    }
    // a link or an identifier in the picture is filed like a typed one (the catalog skips plain words)
    let all: String = read.iter().map(|(_, w)| w.as_str()).collect::<Vec<_>>().join("\n");
    let filed = if p.pointer("/settings/to_catalog").and_then(Value::as_bool) == Some(false) {
        None
    } else {
        atlas.post("/api/plugins/@catalog/tools/capture", &json!({ "text": all, "path": note })).ok().filter(|v| v.get("path").is_some())
    };
    Ok(match filed {
        Some(v) => json!({ "path": v["path"], "notice": format!("{said}; {}", v["notice"].as_str().unwrap_or("filed")) }),
        None => json!({ "read": count, "notice": said }),
    })
}

fn main() {
    let atlas = Rc::new(Atlas::new());
    let reader = Rc::new(RefCell::new(Reader::default()));
    let mut m = Methods::new();
    {
        let (atlas, reader) = (atlas.clone(), reader.clone());
        m.add("read", move |p| {
            let root = PathBuf::from(std::env::var("ATLAS_ROOT").unwrap_or_else(|_| ".".into()));
            let path = str_param(&p, "path")?;
            let text = reader.borrow_mut().read(&atlas, &locate(&atlas, &root, "", path)?, &languages(&p))?;
            Ok(json!({ "text": text }))
        });
    }
    m.add("capture", move |p| on_capture(&atlas, &mut reader.borrow_mut(), &p));
    serve(m);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_captures_pictures_are_found_in_both_embed_forms() {
        let t = "look at this\n![[Screenshot 2026-10-17 at 10.02.png]]\n![[Shot.JPG|300]] ![x](files/a%20b.webp) ![[notes.md]] ![[Shot.JPG]]";
        assert_eq!(pictures_in(t), vec!["Screenshot 2026-10-17 at 10.02.png", "Shot.JPG", "files/a b.webp"]);
        assert!(pictures_in("no pictures, just [[a link]]").is_empty());
    }

    #[test]
    fn the_text_goes_under_its_picture_once() {
        let note = "# Log\n- 10:02 look at this\n  ![[Shot.png]]\n- 10:05 other\n";
        let block = callout("Shot.png", "Dune: Part Two\nhttps://letterboxd.com/film/dune-part-two/");
        let once = with_callout(note, "Shot.png", &block, None).unwrap();
        assert_eq!(once, "# Log\n- 10:02 look at this\n  ![[Shot.png]]\n  > [!ocr]- Text in Shot.png\n  > Dune: Part Two\n  > https://letterboxd.com/film/dune-part-two/\n- 10:05 other\n");
        assert_eq!(with_callout(&once, "Shot.png", &block, None), None, "never twice");
        assert_eq!(with_callout(note, "Other.png", &block, None), None);
    }

    #[test]
    fn the_text_goes_under_the_captures_own_line() {
        let note = "- 10:02 ![[Shot.png]]\n- 10:30 again ![[Shot.png]]\n";
        let block = callout("Shot.png", "words");
        assert_eq!(with_callout(note, "Shot.png", &block, Some(0)).unwrap(), "- 10:02 ![[Shot.png]]\n> [!ocr]- Text in Shot.png\n> words\n- 10:30 again ![[Shot.png]]\n");
        assert!(with_callout(note, "Shot.png", &block, None).unwrap().ends_with("again ![[Shot.png]]\n> [!ocr]- Text in Shot.png\n> words\n"), "no line: the last");
    }

    #[test]
    fn a_picture_not_yet_indexed_is_found_on_disk() {
        let root = std::env::temp_dir().join(format!("atlas-ocr-test-{}", std::process::id()));
        std::fs::create_dir_all(root.join("log/2026/files")).unwrap();
        std::fs::create_dir_all(root.join(".atlas")).unwrap();
        std::fs::write(root.join(".atlas/Shot.png"), b"hidden").unwrap();
        std::fs::write(root.join("log/2026/files/Shot.png"), b"x").unwrap();
        assert_eq!(on_disk(&root, "Shot.png"), Some(root.join("log/2026/files/Shot.png")));
        assert_eq!(on_disk(&root, "None.png"), None);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_link_tesseract_split_is_put_back_together() {
        assert_eq!(mend_links("ISBN 978-84-204-1214-6 - https: //letterboxd.com/film/the-realm/"), "ISBN 978-84-204-1214-6 - https://letterboxd.com/film/the-realm/");
        assert_eq!(mend_links("see http: //example.org"), "see http://example.org");
        assert_eq!(mend_links("time: //not a link"), "time: //not a link");
        assert_eq!(mend_links("at www. example.org today"), "at www.example.org today");
        assert_eq!(mend_links("https://example. org/a b"), "https://example.org/a b");
        assert_eq!(mend_links("The end. then more"), "The end. then more", "prose keeps its spaces");
    }

    #[test]
    fn the_languages_come_from_the_setting() {
        assert_eq!(default_languages("es_ES.UTF-8"), "eng+spa");
        assert_eq!(default_languages("fr_CA"), "eng+fra");
        assert_eq!(default_languages("en_US.UTF-8"), "eng");
        assert_eq!(default_languages("C"), "eng");
        assert_eq!(default_languages(""), "eng");
        assert_eq!(languages(&json!({ "settings": { "languages": "eng, fra" } })), "eng+fra");
        assert_eq!(languages(&json!({ "settings": { "languages": "../x" } })), "x", "only a code's own characters reach a path");
        assert_eq!(languages(&json!({ "settings": { "languages": " " } })), default_languages(&system_locale()));
    }

    #[test]
    fn a_dark_screenshot_becomes_dark_on_light_and_small_ones_grow() {
        let dark = image::DynamicImage::ImageLuma8(image::GrayImage::from_pixel(10, 4, image::Luma([20])));
        let (g, scale) = prepare(dark);
        assert_eq!((g.dimensions(), scale), ((20, 8), 2));
        assert!(g.get_pixel(0, 0).0[0] > 200, "inverted");
        let uhd = image::DynamicImage::ImageLuma8(image::GrayImage::from_pixel(3840, 2160, image::Luma([240])));
        assert_eq!(prepare(uhd).1, 2, "a 4K screenshot grows too");
        let photo = image::DynamicImage::ImageLuma8(image::GrayImage::from_pixel(4000, 3000, image::Luma([240])));
        assert_eq!(prepare(photo).0.dimensions(), (4000, 3000), "a photo keeps its size");
    }

    #[test]
    fn a_dark_sidebar_and_a_light_page_both_end_dark_on_light() {
        let mut half = image::GrayImage::from_pixel(2 * TILE, TILE, image::Luma([240]));
        for y in 0..TILE {
            for x in 0..TILE {
                half.put_pixel(x, y, image::Luma([25]));
            }
        }
        let (g, _) = prepare(image::DynamicImage::ImageLuma8(half));
        assert!(g.get_pixel(5, 5).0[0] > 200 && g.get_pixel(2 * TILE + 5, 5).0[0] > 200, "both halves light");
    }

    #[test]
    fn specks_are_dropped() {
        assert_eq!(tidy(["  Hello world ".to_string(), "|".to_string(), "ok".to_string(), "7".to_string(), " ".to_string()]), "Hello world\nok\n7");
    }
}
