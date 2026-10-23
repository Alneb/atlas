//! A PDF's text with its columns kept, in Rust (pdf_oxide): no poppler needed. Each text span is placed on its
//! baseline's line, the gap before it turned into spaces at the page's character width, so a table's columns stay
//! apart by runs of spaces as `pdftotext -layout` keeps them, which the presets' row regexes rely on.
use pdf_oxide::PdfDocument;

/// Spans closer than this (in characters) join without a space; wider than `COLUMN` they are columns apart.
const TOUCH: f32 = 0.25;
const COLUMN: f32 = 1.5;

pub fn text(bytes: &[u8]) -> Result<String, String> {
    let doc = PdfDocument::from_bytes(bytes.to_vec()).map_err(|e| format!("the PDF does not open: {e}"))?;
    let mut pages = vec![];
    for page in 0..doc.page_count().map_err(|e| e.to_string())? {
        let mut spans = doc.extract_spans(page).map_err(|e| format!("page {}: {e}", page + 1))?;
        // Text set sideways (a bank's legal line up the margin) is not part of any row: its letters are dropped.
        let sideways: Vec<(f32, f32)> = doc.extract_chars(page).map_err(|e| e.to_string())?.iter()
            .filter(|c| { let r = c.rotation_degrees.rem_euclid(360.0); r > 1.0 && r < 359.0 })
            .map(|c| (c.bbox.x + c.bbox.width / 2.0, c.bbox.y + c.bbox.height / 2.0)).collect();
        let inside = |s: &pdf_oxide::layout::TextSpan, (x, y): &(f32, f32)| *x >= s.bbox.x - 0.5 && *x <= s.bbox.x + s.bbox.width + 0.5 && *y >= s.bbox.y - 0.5 && *y <= s.bbox.y + s.bbox.height + 0.5;
        spans.retain(|s| !s.text.trim().is_empty() && !sideways.iter().any(|c| inside(s, c)));
        // The page's character width: the median of its spans' (a heading's big letters do not set it).
        let mut widths: Vec<f32> = spans.iter().map(|s| s.bbox.width / s.text.chars().count().max(1) as f32).filter(|w| *w > 0.0).collect();
        widths.sort_by(f32::total_cmp);
        let cw = widths.get(widths.len() / 2).copied().unwrap_or(5.0).max(0.5);
        // Lines from the top (PDF y grows upwards); a span joins a line whose baseline is within half its height.
        spans.sort_by(|a, b| b.bbox.y.total_cmp(&a.bbox.y));
        let mut lines: Vec<(f32, Vec<&pdf_oxide::layout::TextSpan>)> = vec![];
        for s in &spans {
            match lines.last_mut().filter(|(y, _)| (y - s.bbox.y).abs() <= s.bbox.height.max(1.0) * 0.5) {
                Some((_, l)) => l.push(s),
                None => lines.push((s.bbox.y, vec![s])),
            }
        }
        let left = spans.iter().map(|s| s.bbox.x).fold(f32::INFINITY, f32::min);
        let mut out = vec![];
        for (_, mut l) in lines {
            l.sort_by(|a, b| a.bbox.x.total_cmp(&b.bbox.x));
            let mut line = String::new();
            let mut end = left;
            let mut spaced = false;
            for s in l {
                let gap = (s.bbox.x - end) / cw;
                // Whether two spans touch is judged at their own letters' width (a heading's are wide).
                let own = (s.bbox.width / s.text.chars().count().max(1) as f32).max(cw * 0.5);
                let touch = (s.bbox.x - end) < TOUCH * own.min(cw * 2.0);
                let spaces = if line.is_empty() { gap.round().max(0.0) as usize } else if gap > COLUMN { (gap.round() as usize).max(2) } else if touch && !spaced { 0 } else { 1 };
                line.push_str(&" ".repeat(spaces));
                line.push_str(s.text.trim_end());
                // A span ending in a space ("CONSULTA DE ") is a word apart from the next, however close.
                spaced = s.text.ends_with(char::is_whitespace);
                end = s.bbox.x + s.bbox.width;
            }
            out.push(line.trim_end().to_string());
        }
        pages.push(out.join("\n"));
    }
    Ok(pages.join("\n\x0c"))
}
