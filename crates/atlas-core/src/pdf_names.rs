//! Named destinations PDFium does not find. A link to a named destination (`/Dest (eq.3)`, a GoTo to `/D /cite.x`)
//! is looked up in the catalog's `/Names /Dests` name tree; PDFium misses a name when a node of that tree carries both
//! `/Names` and `/Kids` (as some LaTeX theses' do), so those links led nowhere. This reads the page's link annotations
//! with lopdf and walks the whole tree — every node's `/Names` and its `/Kids`, never trusting `/Limits` — plus the
//! older catalog `/Dests` dictionary. `pdfium::links` asks it only for the links PDFium left without a destination.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use lopdf::{Dictionary, Document, Object, ObjectId};

use crate::pdfium::Box4;

/// How deep a name tree is walked: real ones are 2–4 levels; a loop or a broken file stops here.
const MAX_DEPTH: usize = 32;

/// One document's names, read once: name → its page (1-based), and the document for its pages' annotations.
struct Names {
    doc: Document,
    pages: BTreeMap<u32, ObjectId>,
    dests: HashMap<Vec<u8>, u32>,
}

/// The last document read, by path and modification time: a reader asks page after page of one paper.
static LAST: Mutex<Option<(PathBuf, Option<SystemTime>, Arc<Names>)>> = Mutex::new(None);

fn names_of(pdf: &Path) -> Option<Arc<Names>> {
    let modified = std::fs::metadata(pdf).and_then(|m| m.modified()).ok();
    let mut last = LAST.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((p, m, n)) = last.as_ref() {
        if p == pdf && *m == modified {
            return Some(n.clone());
        }
    }
    let doc = Document::load(pdf).ok()?;
    let names = Arc::new(read_names(doc));
    *last = Some((pdf.to_path_buf(), modified, names.clone()));
    Some(names)
}

fn read_names(doc: Document) -> Names {
    let pages = doc.get_pages();
    let page_of: HashMap<ObjectId, u32> = pages.iter().map(|(n, id)| (*id, *n)).collect();
    let mut dests = HashMap::new();
    if let Ok(catalog) = doc.catalog() {
        // the name tree (PDF 1.2+): /Names << /Dests <tree> >>
        if let Some(tree) = catalog
            .get(b"Names")
            .ok()
            .and_then(|o| deref_dict(&doc, o))
            .and_then(|n| n.get(b"Dests").ok())
            .and_then(|o| deref_dict(&doc, o))
        {
            let mut seen = HashSet::new();
            walk(&doc, tree, 0, &mut seen, &mut |name, value| {
                if let Some(p) = page_of_dest(&doc, value, &page_of) {
                    dests.entry(name.to_vec()).or_insert(p);
                }
            });
        }
        // the older dictionary (PDF 1.1): /Dests << /name [page …] >>
        if let Some(d) = catalog.get(b"Dests").ok().and_then(|o| deref_dict(&doc, o)) {
            for (name, value) in d.iter() {
                if let Some(p) = page_of_dest(&doc, value, &page_of) {
                    dests.entry(name.clone()).or_insert(p);
                }
            }
        }
    }
    Names { doc, pages, dests }
}

/// Every key/value pair of a name tree node and of all its kids, whatever `/Limits` says.
fn walk(
    doc: &Document,
    node: &Dictionary,
    depth: usize,
    seen: &mut HashSet<ObjectId>,
    each: &mut dyn FnMut(&[u8], &Object),
) {
    if depth > MAX_DEPTH {
        return;
    }
    if let Ok(pairs) = node.get(b"Names").and_then(|o| doc.dereference(o)).and_then(|(_, o)| o.as_array()) {
        for pair in pairs.chunks(2) {
            if let [key, value] = pair {
                if let Some(k) = key_of(doc, key) {
                    each(k, value);
                }
            }
        }
    }
    if let Ok(kids) = node.get(b"Kids").and_then(|o| doc.dereference(o)).and_then(|(_, o)| o.as_array()) {
        for kid in kids {
            // a kid seen before (a loop in a broken file) is not walked again
            if let Ok(id) = kid.as_reference() {
                if !seen.insert(id) {
                    continue;
                }
            }
            if let Some(d) = deref_dict(doc, kid) {
                walk(doc, d, depth + 1, seen, each);
            }
        }
    }
}

/// A destination's name: a string in a name tree or a link's `/D (…)`, a name in `/D /…` and the `/Dests` dictionary.
fn key_of<'a>(doc: &'a Document, o: &'a Object) -> Option<&'a [u8]> {
    let o = doc.dereference(o).ok()?.1;
    o.as_str().or_else(|_| o.as_name()).ok()
}

fn deref_dict<'a>(doc: &'a Document, o: &'a Object) -> Option<&'a Dictionary> {
    doc.dereference(o).ok()?.1.as_dict().ok()
}

/// The page a destination points at: `[page /XYZ …]`, or a dictionary holding it as `/D`.
fn page_of_dest(doc: &Document, value: &Object, page_of: &HashMap<ObjectId, u32>) -> Option<u32> {
    let value = doc.dereference(value).ok()?.1;
    let array = match value {
        Object::Dictionary(d) => doc.dereference(d.get(b"D").ok()?).ok()?.1.as_array().ok()?,
        other => other.as_array().ok()?,
    };
    match array.first()? {
        Object::Reference(id) => page_of.get(id).copied(),
        // a remote-style destination by page number (0-based), seen in some generators' local links
        Object::Integer(i) if *i >= 0 => Some(*i as u32 + 1),
        _ => None,
    }
}

/// Page `n`'s links to named destinations, resolved by this module: where each sits (as PDFium gives a link's box)
/// and the page it goes to. Empty when the file cannot be read or has none.
pub fn named_links(pdf: &Path, n: u32) -> Vec<(Box4, u32)> {
    let Some(names) = names_of(pdf) else { return vec![] };
    links_on(&names, n)
}

fn links_on(names: &Names, n: u32) -> Vec<(Box4, u32)> {
    let doc = &names.doc;
    let Some(page) = names.pages.get(&n).and_then(|id| doc.get_object(*id).ok()).and_then(|o| o.as_dict().ok()) else {
        return vec![];
    };
    let Some(annots) =
        page.get(b"Annots").ok().and_then(|o| doc.dereference(o).ok()).and_then(|(_, o)| o.as_array().ok())
    else {
        return vec![];
    };
    let mut out = vec![];
    for a in annots {
        let Some(a) = deref_dict(doc, a) else { continue };
        if a.get(b"Subtype").and_then(Object::as_name).ok() != Some(b"Link".as_slice()) {
            continue;
        }
        // the name: the link's own /Dest, else its GoTo action's /D
        let name = a.get(b"Dest").ok().and_then(|d| key_of(doc, d)).or_else(|| {
            let act = deref_dict(doc, a.get(b"A").ok()?)?;
            (act.get(b"S").and_then(Object::as_name).ok()? == b"GoTo".as_slice()).then_some(())?;
            key_of(doc, act.get(b"D").ok()?)
        });
        let Some(page_to) = name.and_then(|k| names.dests.get(k)) else { continue };
        let Some(r) = a.get(b"Rect").ok().and_then(|o| doc.dereference(o).ok()).and_then(|(_, o)| o.as_array().ok())
        else {
            continue;
        };
        let v: Vec<f32> = r.iter().filter_map(|x| doc.dereference(x).ok()?.1.as_float().ok()).collect();
        if let [l, b, rr, t] = v[..] {
            out.push(([l.min(rr), b.min(t), l.max(rr), b.max(t)], *page_to));
        }
    }
    out
}

/// Whether two boxes are the same link's (PDFium and lopdf read one `/Rect`; a hair of rounding allowed).
pub fn same_box(a: &Box4, b: &Box4) -> bool {
    a.iter().zip(b).all(|(x, y)| (x - y).abs() < 0.5)
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::{dictionary, Object, StringFormat};

    /// A three-page document whose name tree's root has both /Names and /Kids — the shape PDFium misses — and a
    /// page-1 link to a name in each half, one by /Dest and one by a GoTo action, plus one by the old /Dests.
    fn doc() -> Document {
        let mut d = Document::with_version("1.7");
        let pages_id = d.new_object_id();
        let page_ids: Vec<ObjectId> = (0..3).map(|_| d.new_object_id()).collect();
        let s = |t: &str| Object::String(t.as_bytes().to_vec(), StringFormat::Literal);
        let dest = |id: ObjectId| {
            Object::Array(vec![Object::Reference(id), "XYZ".into(), Object::Null, Object::Null, Object::Null])
        };
        let kid = d.add_object(
            dictionary! { "Names" => vec![s("eq.3"), dest(page_ids[2])], "Limits" => vec![s("eq.3"), s("eq.3")] },
        );
        // the root: its own pair, and a kid; its /Limits wrong on purpose (a walk must not trust them)
        let tree = d.add_object(dictionary! { "Names" => vec![s("cite.a"), dictionary! { "D" => dest(page_ids[1]) }.into()], "Kids" => vec![Object::Reference(kid)], "Limits" => vec![s("a"), s("b")] });
        let names = d.add_object(dictionary! { "Dests" => Object::Reference(tree) });
        let old = d.add_object(dictionary! { "sec.1" => dest(page_ids[2]) });
        let link = |rect: [i64; 4], how: Object| -> Object {
            let mut a = dictionary! { "Type" => "Annot", "Subtype" => "Link", "Rect" => rect.iter().map(|&x| Object::Integer(x)).collect::<Vec<_>>() };
            match how {
                Object::Dictionary(act) => a.set("A", act),
                other => a.set("Dest", other),
            }
            a.into()
        };
        let annots = vec![
            link([10, 10, 50, 20], s("eq.3")),
            link([10, 30, 50, 40], dictionary! { "S" => "GoTo", "D" => s("cite.a") }.into()),
            link([10, 50, 50, 60], Object::Name(b"sec.1".to_vec())),
            link([10, 70, 50, 80], s("nowhere")),
        ];
        for (i, id) in page_ids.iter().enumerate() {
            let mut p = dictionary! { "Type" => "Page", "Parent" => pages_id, "MediaBox" => vec![Object::Integer(0), Object::Integer(0), Object::Integer(200), Object::Integer(200)] };
            if i == 0 {
                p.set("Annots", annots.clone());
            }
            d.objects.insert(*id, p.into());
        }
        d.objects.insert(pages_id, dictionary! { "Type" => "Pages", "Kids" => page_ids.iter().map(|&id| Object::Reference(id)).collect::<Vec<_>>(), "Count" => Object::Integer(3) }.into());
        let catalog =
            d.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id, "Names" => names, "Dests" => old });
        d.trailer.set("Root", catalog);
        d
    }

    #[test]
    fn a_name_in_a_tree_with_names_and_kids_at_its_root_is_found() {
        let names = read_names(doc());
        assert_eq!(names.dests.get(b"eq.3".as_slice()), Some(&3), "in the root's kid");
        assert_eq!(names.dests.get(b"cite.a".as_slice()), Some(&2), "in the root's own /Names, a dictionary with /D");
        assert_eq!(names.dests.get(b"sec.1".as_slice()), Some(&3), "the old /Dests dictionary");
        let links = links_on(&names, 1);
        assert_eq!(
            links,
            vec![([10.0, 10.0, 50.0, 20.0], 3), ([10.0, 30.0, 50.0, 40.0], 2), ([10.0, 50.0, 50.0, 60.0], 3)],
            "a name nowhere gives no link"
        );
        assert!(links_on(&names, 2).is_empty(), "a page without links");
    }

    #[test]
    fn a_saved_file_is_read_once_per_change() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("thesis.pdf");
        doc().save(&path).unwrap(); // a temporary, so `&mut` is fine
        let links = named_links(&path, 1);
        assert_eq!(links.len(), 3);
        assert!(same_box(&links[0].0, &[10.2, 9.9, 50.0, 20.0]));
        assert!(!same_box(&links[0].0, &[11.0, 10.0, 50.0, 20.0]));
        assert!(named_links(&dir.path().join("missing.pdf"), 1).is_empty());
    }
}
