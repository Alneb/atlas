//! The text column under a point of a PDF page, for "double tap / double-click zooms to the column": the phone's
//! reader (JNI, `Core.pdfColumn`) and the desktop's PDF pane (`POST /api/pdf-column`) both ask here, so a two-column
//! paper zooms to the same column on either. Pure geometry over the page's character boxes — the caller reads them
//! with its own engine (PDFium on the phone, the page's PDFium or pdf.js worker on the desktop) and gives them in
//! the page's shown space (points, y down, the page's /Rotate applied), so turned pages need nothing here.
//!
//! How: neighbouring characters on a line are joined into pieces (a gap wider than a character's height ends one,
//! which a column's gutter always is); around the point's height, how many pieces cover each x is counted; the
//! columns are the runs of x covered by many of them (more than a quarter of the most covered x), so the gutter
//! between two columns, crossed only by a title or a figure caption, splits them. The column is the run under the
//! point, else the nearest; its height is that of the pieces inside it. No text (a scanned page): none.

/// A box in shown points: left, top, right, bottom (y down).
pub type Rect = [f32; 4];

/// How far above and below the point the columns are measured, in character heights: a page's two-column body
/// is measured apart from its one-column abstract or a full-width figure higher up.
const WINDOW: f32 = 24.0;
/// A run of x is a column where it is covered by more than this share of the most covered x.
const DENSE: f32 = 0.25;

/// The column of text under (x, y) on a page whose characters' boxes are `boxes` (shown points, content order;
/// spaces and empty boxes are skipped), or None when the page has no text there.
pub fn column_at(boxes: &[Rect], x: f32, y: f32) -> Option<Rect> {
    let chars: Vec<Rect> = boxes.iter().copied().filter(|b| b[2] > b[0] && b[3] > b[1] && b.iter().all(|v| v.is_finite())).collect();
    if chars.is_empty() {
        return None;
    }
    let h = median(chars.iter().map(|b| b[3] - b[1]).collect());
    let pieces = pieces(&chars, h);
    let near: Vec<Rect> = pieces.iter().copied().filter(|p| ((p[1] + p[3]) / 2.0 - y).abs() <= WINDOW * h).collect();
    let measured = if near.len() >= 4 { &near } else { &pieces };
    let runs = runs(measured, h);
    let (l, r) = runs.iter().copied().min_by(|a, b| distance(*a, x).total_cmp(&distance(*b, x)))?;
    // the column's height: every piece of the page lying mostly inside it
    let inside = pieces.iter().filter(|p| p[2].min(r) - p[0].max(l) >= 0.5 * (p[2] - p[0]));
    let (top, bottom) = inside.fold((f32::MAX, f32::MIN), |(t, b), p| (t.min(p[1]), b.max(p[3])));
    (top <= bottom).then_some([l, top, r, bottom])
}

/// The column read after `col` on the same page: the next one to its right, measured at `col`'s own height, whose
/// text starts below `col`'s top (a column beside it, not a full-width part above); None when `col` is the last (the
/// reader goes on to the next page). For "a zoomed column ends: the next one".
pub fn column_after(boxes: &[Rect], col: Rect) -> Option<Rect> {
    let chars: Vec<Rect> = boxes.iter().copied().filter(|b| b[2] > b[0] && b[3] > b[1] && b.iter().all(|v| v.is_finite())).collect();
    if chars.is_empty() {
        return None;
    }
    let h = median(chars.iter().map(|b| b[3] - b[1]).collect());
    let pieces = pieces(&chars, h);
    // measured over the column's height: the columns beside it, not a full-width title above or a figure below
    let beside: Vec<Rect> = pieces.iter().copied().filter(|p| p[3] > col[1] && p[1] < col[3]).collect();
    let (l, r) = runs(&beside, h).into_iter().filter(|(l, _)| *l >= col[2] - h).min_by(|a, b| a.0.total_cmp(&b.0))?;
    let mid = (col[1] + col[3]) / 2.0;
    column_at(boxes, (l + r) / 2.0, mid).filter(|c| c[0] >= col[2] - h)
}

fn median(mut v: Vec<f32>) -> f32 {
    v.sort_by(f32::total_cmp);
    v[v.len() / 2].max(0.5)
}

/// How far x is from the run (l, r): 0 inside.
fn distance((l, r): (f32, f32), x: f32) -> f32 {
    if x < l { l - x } else if x > r { x - r } else { 0.0 }
}

/// Characters joined into pieces of a line: the next one on the same line (overlapping by half a height) and less
/// than a character's height `h` after it. Splitting more than needed is harmless (the counting fills word gaps);
/// joining across a gutter is what must not happen, and a gutter is wider than a character's height.
fn pieces(chars: &[Rect], h: f32) -> Vec<Rect> {
    let mut out: Vec<Rect> = Vec::new();
    for &c in chars {
        if let Some(p) = out.last_mut() {
            let overlap = p[3].min(c[3]) - p[1].max(c[1]);
            let same_line = overlap >= 0.5 * (p[3] - p[1]).min(c[3] - c[1]);
            let gap = c[0] - p[2];
            if same_line && gap <= h && gap >= -h {
                *p = [p[0].min(c[0]), p[1].min(c[1]), p[2].max(c[2]), p[3].max(c[3])];
                continue;
            }
        }
        out.push(c);
    }
    out
}

/// The runs of x covered densely by `pieces` (left, right), gaps narrower than `h` closed and runs narrower than
/// two heights dropped (a stray letter or a page number's digit is no column).
fn runs(pieces: &[Rect], h: f32) -> Vec<(f32, f32)> {
    let lo = pieces.iter().map(|p| p[0]).fold(f32::MAX, f32::min);
    let hi = pieces.iter().map(|p| p[2]).fold(f32::MIN, f32::max);
    let n = (((hi - lo) / 1.0).ceil() as usize).clamp(1, 4000); // about a point a bin
    let bin = (hi - lo).max(1.0) / n as f32;
    let mut cover = vec![0u32; n];
    for p in pieces {
        let a = (((p[0] - lo) / bin) as usize).min(n - 1);
        let z = ((((p[2] - lo) / bin).ceil() as usize).max(a + 1)).min(n);
        for c in &mut cover[a..z] {
            *c += 1;
        }
    }
    let peak = *cover.iter().max().unwrap_or(&0) as f32;
    let mut out: Vec<(f32, f32)> = Vec::new();
    let mut start = None;
    for i in 0..=n {
        let dense = cover.get(i).is_some_and(|&c| c as f32 > DENSE * peak); // i == n: past the end, a run closes
        match (dense, start) {
            (true, None) => start = Some(i),
            (false, Some(s)) => {
                let run = (lo + s as f32 * bin, lo + i as f32 * bin);
                match out.last_mut() {
                    Some(last) if run.0 - last.1 < h => last.1 = run.1,
                    _ => out.push(run),
                }
                start = None;
            }
            _ => {}
        }
    }
    out.retain(|(l, r)| r - l >= 2.0 * h);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A line of text from x0 to x1 at top y: characters 5 wide, 7 tall, a word gap of 3 every six letters.
    fn line(x0: f32, x1: f32, y: f32) -> Vec<Rect> {
        let mut out = vec![];
        let (mut x, mut k) = (x0, 0);
        while x + 5.0 <= x1 {
            out.push([x, y, x + 5.0, y + 7.0]);
            k += 1;
            x += if k % 6 == 0 { 8.0 } else { 5.5 };
        }
        out
    }

    /// A two-column paper (a US letter page): a title across both columns, then columns 72–300 and 312–540 (a 12 pt
    /// gutter), 40 lines each, in reading order (the left column first), a page number at the bottom.
    pub(crate) fn two_columns() -> Vec<Rect> {
        let mut b = line(150.0, 460.0, 80.0);
        b.extend(line(100.0, 510.0, 100.0));
        for col in [(72.0, 300.0), (312.0, 540.0)] {
            for i in 0..40 {
                b.extend(line(col.0, col.1, 140.0 + 12.0 * i as f32));
            }
        }
        b.extend(line(300.0, 310.0, 740.0));
        b
    }

    #[test]
    fn a_point_in_either_column_gives_that_column_only() {
        let page = two_columns();
        let left = column_at(&page, 150.0, 300.0).unwrap();
        assert!((left[0] - 72.0).abs() < 2.0 && (left[2] - 300.0).abs() < 6.0, "the left column: {left:?}");
        assert!(left[1] <= 141.0 && left[3] >= 607.0, "its whole height: {left:?}");
        let right = column_at(&page, 400.0, 500.0).unwrap();
        assert!((right[0] - 312.0).abs() < 2.0 && (right[2] - 540.0).abs() < 6.0, "the right column: {right:?}");
    }

    #[test]
    fn after_a_column_comes_the_one_to_its_right_and_after_the_last_none() {
        let page = two_columns();
        let left = column_at(&page, 150.0, 300.0).unwrap();
        let next = column_after(&page, left).unwrap();
        assert!((next[0] - 312.0).abs() < 2.0 && next[1] <= 141.0, "the right column, from its top: {next:?}");
        assert_eq!(column_after(&page, next), None, "the last column: the next page's turn");
        let mut one = vec![];
        for i in 0..30 {
            one.extend(line(90.0, 520.0, 100.0 + 14.0 * i as f32));
        }
        assert_eq!(column_after(&one, column_at(&one, 300.0, 200.0).unwrap()), None, "one column: none after it");
    }

    #[test]
    fn the_gutter_and_the_margins_give_the_nearest_column() {
        let page = two_columns();
        assert!(column_at(&page, 301.0, 300.0).unwrap()[2] <= 306.0, "the gutter, nearer the left one");
        assert!(column_at(&page, 590.0, 300.0).unwrap()[0] >= 310.0, "the right margin: the right column");
    }

    #[test]
    fn one_column_is_the_text_width_and_no_text_is_none() {
        let mut page = vec![];
        for i in 0..30 {
            page.extend(line(90.0, 520.0, 100.0 + 14.0 * i as f32));
        }
        let c = column_at(&page, 300.0, 200.0).unwrap();
        assert!((c[0] - 90.0).abs() < 2.0 && (c[2] - 520.0).abs() < 8.0, "{c:?}");
        assert_eq!(column_at(&[], 10.0, 10.0), None);
        assert_eq!(column_at(&[[5.0, 5.0, 5.0, 9.0]], 5.0, 5.0), None, "only empty boxes");
    }

    #[test]
    fn columns_are_measured_near_the_point() {
        // a one-column abstract above a two-column body: the body's point gets its column, the abstract the width
        let mut page = vec![];
        for i in 0..12 {
            page.extend(line(72.0, 540.0, 80.0 + 12.0 * i as f32));
        }
        for col in [(72.0, 300.0), (312.0, 540.0)] {
            for i in 0..30 {
                page.extend(line(col.0, col.1, 400.0 + 12.0 * i as f32));
            }
        }
        let body = column_at(&page, 450.0, 600.0).unwrap();
        assert!(body[0] >= 310.0, "the body's right column: {body:?}");
        let abs = column_at(&page, 450.0, 100.0).unwrap();
        assert!(abs[0] < 80.0 && abs[2] > 530.0, "the abstract: the whole width {abs:?}");
    }
}
