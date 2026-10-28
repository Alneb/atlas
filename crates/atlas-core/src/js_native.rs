//! The heavy primitives of a JavaScript helper, done natively (docs/design/DESIGN-plugin-runtimes.md): QuickJS
//! interprets, so parsing HTML, CSV or a zip in script would be slow and written once per plugin. Each is one
//! synchronous call, `__host.native(op, json)` → json, behind `atlas.html` / `atlas.csv` / `atlas.zip` / `atlas.hash`
//! (sdk/js/prelude.js). Files are the vault's (a vault-relative path, checked by `paths::safe_join`), or the plugin's
//! own cache for `cache.head`.
use serde_json::{json, Value};
use std::io::Read;
use std::path::Path;

/// More than this is not handed to a script at once.
const MAX_TEXT: u64 = 32 << 20;

pub fn call(root: &Path, id: &str, op: &str, args: &Value) -> Result<Value, String> {
    let s = |k: &str| args.get(k).and_then(Value::as_str).unwrap_or_default();
    match op {
        "html.select" => html_select(s("html"), s("css")),
        "html.unescape" => Ok(json!(html_unescape(s("text")))),
        "csv.parse" => csv_parse(s("text"), args.get("header").and_then(Value::as_bool).unwrap_or(false), s("delimiter")),
        "zip.list" => zip_list(&vault_file(root, s("path"))?),
        "zip.read" => zip_read(&vault_file(root, s("path"))?, s("name")),
        "hash.sha256" => {
            use sha2::Digest;
            Ok(json!(sha2::Sha256::digest(s("text").as_bytes()).iter().map(|b| format!("{b:02x}")).collect::<String>()))
        }
        "cache.head" => cache_head(root, id, s("name"), args.get("bytes").and_then(Value::as_u64).unwrap_or(8)),
        other => Err(format!("no native {other:?} (html.select, html.unescape, csv.parse, zip.list, zip.read, hash.sha256, cache.head)")),
    }
}

fn vault_file(root: &Path, rel: &str) -> Result<std::path::PathBuf, String> {
    crate::paths::safe_join(root, rel).map_err(|e| e.to_string())
}

/// Every element `css` matches: its text, its attributes, its inner HTML.
fn html_select(html: &str, css: &str) -> Result<Value, String> {
    let sel = scraper::Selector::parse(css).map_err(|e| format!("html.select: {css:?}: {e}"))?;
    let doc = scraper::Html::parse_document(html);
    Ok(Value::Array(
        doc.select(&sel)
            .map(|el| {
                let attrs: serde_json::Map<String, Value> = el.value().attrs().map(|(k, v)| (k.to_string(), json!(v))).collect();
                json!({ "tag": el.value().name(), "text": el.text().collect::<String>(), "attrs": attrs, "html": el.inner_html() })
            })
            .collect(),
    ))
}

/// Every HTML character reference decoded (all of HTML5's names, as Python's `html.unescape`), nothing else changed:
/// the text is read as a `<textarea>`'s (RCDATA: references decoded, tags not parsed). Its `</` is written `&lt;/` so it
/// cannot end the element, and a newline goes first because the parser drops one right after the start tag.
fn html_unescape(text: &str) -> String {
    if !text.contains('&') {
        return text.to_string();
    }
    let doc = scraper::Html::parse_fragment(&format!("<textarea>\n{}</textarea>", text.replace("</", "&lt;/")));
    let sel = scraper::Selector::parse("textarea").expect("a valid selector");
    doc.select(&sel).next().map(|t| t.text().collect()).unwrap_or_else(|| text.to_string())
}

/// Rows as arrays, or as objects keyed by the first row (`header`).
fn csv_parse(text: &str, header: bool, delimiter: &str) -> Result<Value, String> {
    let d = delimiter.bytes().next().unwrap_or(b',');
    let mut r = csv::ReaderBuilder::new().has_headers(false).flexible(true).delimiter(d).from_reader(text.as_bytes());
    let mut rows = r.records().map(|rec| rec.map(|rec| rec.iter().map(str::to_string).collect::<Vec<_>>())).collect::<Result<Vec<_>, _>>().map_err(|e| format!("csv.parse: {e}"))?;
    if !header || rows.is_empty() {
        return Ok(json!(rows));
    }
    let names = rows.remove(0);
    Ok(Value::Array(rows.into_iter().map(|row| Value::Object(names.iter().cloned().zip(row.into_iter().map(Value::String)).collect())).collect()))
}

fn open_zip(file: &Path) -> Result<zip::ZipArchive<std::fs::File>, String> {
    let f = std::fs::File::open(file).map_err(|e| format!("zip: {}: {e}", file.display()))?;
    zip::ZipArchive::new(f).map_err(|e| format!("zip: {}: {e}", file.display()))
}

fn zip_list(file: &Path) -> Result<Value, String> {
    let mut z = open_zip(file)?;
    (0..z.len()).map(|i| z.by_index(i).map(|e| json!({ "name": e.name(), "size": e.size(), "dir": e.is_dir() })).map_err(|e| e.to_string())).collect::<Result<Vec<_>, _>>().map(Value::Array)
}

/// One entry, as text (UTF-8, damaged bytes replaced).
fn zip_read(file: &Path, name: &str) -> Result<Value, String> {
    let mut z = open_zip(file)?;
    let e = z.by_name(name).map_err(|e| format!("zip: {name}: {e}"))?;
    if e.size() > MAX_TEXT {
        return Err(format!("zip: {name} is more than {} MB", MAX_TEXT >> 20));
    }
    let mut bytes = Vec::with_capacity(e.size() as usize);
    e.take(MAX_TEXT).read_to_end(&mut bytes).map_err(|e| format!("zip: {name}: {e}"))?;
    Ok(json!(String::from_utf8_lossy(&bytes)))
}

/// The first bytes of a file of the plugin's cache (what `atlas.download` saved), as text: a PDF starts `%PDF`.
fn cache_head(root: &Path, id: &str, name: &str, n: u64) -> Result<Value, String> {
    let clean = name.trim_start_matches('/');
    if clean.split('/').any(|p| p.is_empty() || p == "..") {
        return Err(format!("cache.head: {name:?}"));
    }
    let file = root.join(".atlas/cache/plugins").join(id).join(clean);
    let mut bytes = vec![];
    std::fs::File::open(&file).and_then(|f| f.take(n.min(4096)).read_to_end(&mut bytes)).map_err(|e| format!("cache.head: {name}: {e}"))?;
    Ok(json!(bytes.iter().map(|&b| b as char).collect::<String>()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn html_csv_zip_and_hash_answer_plain_data() {
        let t = tempfile::tempdir().unwrap();
        let r = |op: &str, a: Value| call(t.path(), "demo", op, &a);
        let hits = r("html.select", json!({ "html": "<p><a class=x href='/a'>One</a><a href='/b'>Two</a></p>", "css": "a.x" })).unwrap();
        assert_eq!(hits, json!([{ "tag": "a", "text": "One", "attrs": { "class": "x", "href": "/a" }, "html": "One" }]));
        assert!(r("html.select", json!({ "html": "", "css": "a[" })).unwrap_err().contains("html.select"));
        let un = |t: &str| r("html.unescape", json!({ "text": t })).unwrap();
        assert_eq!(un("Pe&ntilde;a &amp; &#39;x&#x27; &eacute;t&eacute;"), json!("Peña & 'x' été"));
        assert_eq!(un("\na <b>b</b> </textarea> &bogus; 1 < 2"), json!("\na <b>b</b> </textarea> &bogus; 1 < 2"), "only references change");

        assert_eq!(r("csv.parse", json!({ "text": "Name,Year\n\"A, film\",2001\nB,1999\n", "header": true })).unwrap(), json!([{ "Name": "A, film", "Year": "2001" }, { "Name": "B", "Year": "1999" }]));
        assert_eq!(r("csv.parse", json!({ "text": "a;b\n", "delimiter": ";" })).unwrap(), json!([["a", "b"]]));

        let f = std::fs::File::create(t.path().join("e.zip")).unwrap();
        let mut w = zip::ZipWriter::new(f);
        w.start_file("diary.csv", zip::write::SimpleFileOptions::default()).unwrap();
        std::io::Write::write_all(&mut w, b"Name\nX\n").unwrap();
        w.finish().unwrap();
        assert_eq!(r("zip.list", json!({ "path": "e.zip" })).unwrap(), json!([{ "name": "diary.csv", "size": 7, "dir": false }]));
        assert_eq!(r("zip.read", json!({ "path": "e.zip", "name": "diary.csv" })).unwrap(), json!("Name\nX\n"));
        assert!(r("zip.read", json!({ "path": "../e.zip", "name": "x" })).is_err(), "outside the vault");

        assert_eq!(r("hash.sha256", json!({ "text": "abc" })).unwrap(), json!("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
        let cache = t.path().join(".atlas/cache/plugins/demo/pdf");
        std::fs::create_dir_all(&cache).unwrap();
        std::fs::write(cache.join("k.pdf"), b"%PDF-1.7 rest").unwrap();
        assert_eq!(r("cache.head", json!({ "name": "pdf/k.pdf", "bytes": 4 })).unwrap(), json!("%PDF"));
        assert!(r("cache.head", json!({ "name": "../other/x" })).is_err());
    }
}
