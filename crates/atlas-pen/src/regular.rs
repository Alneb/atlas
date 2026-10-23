//! Shapes biased to the regular ones. Applied to
//! either recogniser's answer on the wire (shape.rs, shape_openink.rs: the same format), so both get it:
//! nearly square → square, nearly round → circle, nearly equilateral → equilateral, a nearly regular polygon → regular,
//! and angles near an axis or a diagonal → exactly on it. Tolerances are generous on purpose: a hand-drawn square is
//! rarely within 5 %.

use std::f32::consts::{FRAC_PI_2, FRAC_PI_4, PI};

type P = [f32; 2];

/// Rectangle sides this close (shorter / longer) make a square; ellipse axes, a circle.
const SQUARE: f32 = 0.85;
const CIRCLE: f32 = 0.82;
/// Triangle sides this close (shortest / longest) make it equilateral; a polygon's, regular.
const EQUILATERAL: f32 = 0.8;
const REGULAR: f32 = 0.75;
/// Angles within these of an axis (or a diagonal, for lines and rectangles) are put on it.
const AXIS: f32 = 10.0 * PI / 180.0;
const LINE: f32 = 7.0 * PI / 180.0;
const DIAGONAL: f32 = 8.0 * PI / 180.0;

/// The wire with its shape made regular where it nearly is; anything it does not know is handed back as it came.
pub fn regularise(w: Vec<f32>) -> Vec<f32> {
    match w.first().map(|k| *k as i32) {
        Some(1) if w.len() >= 5 => {
            let (a, b) = line([w[1], w[2]], [w[3], w[4]]);
            vec![1.0, a[0], a[1], b[0], b[1]]
        }
        Some(2) if w.len() >= 6 => {
            let (sw, sh) = if w[3].min(w[4]) / w[3].max(w[4]).max(1e-6) >= SQUARE { let s = (w[3] + w[4]) / 2.0; (s, s) } else { (w[3], w[4]) };
            vec![2.0, w[1], w[2], sw, sh, snap(w[5], FRAC_PI_4, DIAGONAL).unwrap_or_else(|| snap(w[5], FRAC_PI_2, AXIS).unwrap_or(w[5]))]
        }
        Some(3) if w.len() >= 6 => {
            if w[3].min(w[4]) / w[3].max(w[4]).max(1e-6) >= CIRCLE {
                let d = (w[3] + w[4]) / 2.0;
                vec![3.0, w[1], w[2], d, d, 0.0]
            } else {
                vec![3.0, w[1], w[2], w[3], w[4], snap(w[5], FRAC_PI_2, AXIS).unwrap_or(w[5])]
            }
        }
        Some(4) if w.len() >= 7 => {
            let t = triangle([[w[1], w[2]], [w[3], w[4]], [w[5], w[6]]]);
            vec![4.0, t[0][0], t[0][1], t[1][0], t[1][1], t[2][0], t[2][1]]
        }
        Some(5) if w.len() >= 5 => {
            let n = w[4] as usize;
            if w.len() < 5 + 2 * n { return w; }
            let closed = w[1] != 0.0;
            let mut pts: Vec<P> = (0..n).map(|i| [w[5 + 2 * i], w[6 + 2 * i]]).collect();
            if closed && n == 3 {
                pts = triangle([pts[0], pts[1], pts[2]]).to_vec();
            } else if closed && (5..=8).contains(&n) {
                if let Some(r) = regular_polygon(&pts) { pts = r; }
            } else if !closed {
                straighten(&mut pts); // a polyline, an arrow's shaft: its segments on the axes and diagonals
            }
            let mut out = w[..5].to_vec();
            out.extend(pts.iter().flatten());
            out
        }
        _ => w,
    }
}

/// `a` put on the nearest multiple of `step` when within `tol` of it.
fn snap(a: f32, step: f32, tol: f32) -> Option<f32> {
    let k = (a / step).round();
    ((a - k * step).abs() <= tol).then_some(k * step)
}

fn dist(a: P, b: P) -> f32 { (a[0] - b[0]).hypot(a[1] - b[1]) }

/// A line on an axis or a diagonal when nearly, about its middle, its length kept.
fn line(a: P, b: P) -> (P, P) {
    let ang = (b[1] - a[1]).atan2(b[0] - a[0]);
    let Some(s) = snap(ang, FRAC_PI_4, LINE) else { return (a, b) };
    let (m, h) = ([(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0], dist(a, b) / 2.0);
    let (dx, dy) = (s.cos() * h, s.sin() * h);
    ([m[0] - dx, m[1] - dy], [m[0] + dx, m[1] + dy])
}

/// Equilateral when its sides nearly are (same centre, the mean side, the base side's turn kept, level when nearly
/// level, the apex on the side the drawn one was); otherwise as drawn.
fn triangle(t: [P; 3]) -> [P; 3] {
    let sides = [dist(t[0], t[1]), dist(t[1], t[2]), dist(t[2], t[0])];
    let (lo, hi) = (sides.iter().cloned().fold(f32::MAX, f32::min), sides.iter().cloned().fold(0f32, f32::max));
    if hi <= 0.0 || lo / hi < EQUILATERAL { return t; }
    let side = sides.iter().sum::<f32>() / 3.0;
    let c = [(t[0][0] + t[1][0] + t[2][0]) / 3.0, (t[0][1] + t[1][1] + t[2][1]) / 3.0];
    // the base: the side nearest level (a hand draws a triangle on its base); its turn, levelled when near
    let base = (0..3).min_by(|&i, &j| level(t[i], t[(i + 1) % 3]).total_cmp(&level(t[j], t[(j + 1) % 3]))).unwrap();
    let (a, b, apex) = (t[base], t[(base + 1) % 3], t[(base + 2) % 3]);
    let mut ang = (b[1] - a[1]).atan2(b[0] - a[0]);
    if let Some(s) = snap(ang, PI, AXIS) { ang = s; }
    let (ux, uy) = (ang.cos(), ang.sin());
    // the apex's side of the base: the sign of the cross product, as drawn
    let up = if (b[0] - a[0]) * (apex[1] - a[1]) - (b[1] - a[1]) * (apex[0] - a[0]) >= 0.0 { 1.0 } else { -1.0 };
    let (nx, ny) = (-uy * up, ux * up);
    let h = side * 3f32.sqrt() / 2.0;
    // vertices about the centroid: the base's ends a third of the height below it, the apex two thirds above
    let a2 = [c[0] - ux * side / 2.0 - nx * h / 3.0, c[1] - uy * side / 2.0 - ny * h / 3.0];
    let b2 = [c[0] + ux * side / 2.0 - nx * h / 3.0, c[1] + uy * side / 2.0 - ny * h / 3.0];
    let p2 = [c[0] + nx * 2.0 * h / 3.0, c[1] + ny * 2.0 * h / 3.0];
    let mut out = [[0.0; 2]; 3];
    out[base] = a2;
    out[(base + 1) % 3] = b2;
    out[(base + 2) % 3] = p2;
    out
}

/// How far from level a side is (0: level), in radians.
fn level(a: P, b: P) -> f32 {
    let ang = (b[1] - a[1]).atan2(b[0] - a[0]);
    (ang - (ang / PI).round() * PI).abs()
}

/// A regular n-gon when the sides nearly are equal: the same centre, the mean radius, the first corner's turn.
fn regular_polygon(pts: &[P]) -> Option<Vec<P>> {
    let n = pts.len();
    let sides: Vec<f32> = (0..n).map(|i| dist(pts[i], pts[(i + 1) % n])).collect();
    let (lo, hi) = (sides.iter().cloned().fold(f32::MAX, f32::min), sides.iter().cloned().fold(0f32, f32::max));
    if hi <= 0.0 || lo / hi < REGULAR { return None; }
    let c = [pts.iter().map(|p| p[0]).sum::<f32>() / n as f32, pts.iter().map(|p| p[1]).sum::<f32>() / n as f32];
    let r = pts.iter().map(|p| dist(*p, c)).sum::<f32>() / n as f32;
    let start = (pts[0][1] - c[1]).atan2(pts[0][0] - c[0]);
    // the drawn turning sense kept (the shoelace sign)
    let area: f32 = (0..n).map(|i| pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1]).sum();
    let dir = if area >= 0.0 { 1.0 } else { -1.0 };
    Some((0..n).map(|i| { let a = start + dir * 2.0 * PI * i as f32 / n as f32; [c[0] + r * a.cos(), c[1] + r * a.sin()] }).collect())
}

/// Each segment of an open path on an axis or a diagonal when nearly, its length kept; the first point stays.
fn straighten(pts: &mut [P]) {
    for i in 1..pts.len() {
        let (a, b) = (pts[i - 1], pts[i]);
        let ang = (b[1] - a[1]).atan2(b[0] - a[0]);
        if let Some(s) = snap(ang, FRAC_PI_4, LINE) {
            let l = dist(a, b);
            let moved = [a[0] + s.cos() * l, a[1] + s.sin() * l];
            let (dx, dy) = (moved[0] - b[0], moved[1] - b[1]);
            for p in pts[i..].iter_mut() { p[0] += dx; p[1] += dy; } // what follows moves with it: its shape kept
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_nearly_square_box_is_a_square_and_level() {
        let w = regularise(vec![2.0, 100.0, 100.0, 90.0, 100.0, 0.08]);
        assert_eq!((w[3], w[4], w[5]), (95.0, 95.0, 0.0));
        let long = regularise(vec![2.0, 0.0, 0.0, 60.0, 100.0, 0.5]);
        assert_eq!((long[3], long[4], long[5]), (60.0, 100.0, 0.5), "a long box turned freely stays as drawn");
    }

    #[test]
    fn a_nearly_round_ellipse_is_a_circle() {
        let w = regularise(vec![3.0, 0.0, 0.0, 90.0, 100.0, 0.4]);
        assert_eq!((w[3], w[4], w[5]), (95.0, 95.0, 0.0));
        let oval = regularise(vec![3.0, 0.0, 0.0, 50.0, 100.0, 0.1]);
        assert_eq!((oval[3], oval[4], oval[5]), (50.0, 100.0, 0.0), "an oval kept, its tilt put level");
    }

    #[test]
    fn a_nearly_level_line_is_level_about_its_middle() {
        let w = regularise(vec![1.0, 0.0, 0.0, 100.0, 8.0]);
        assert!((w[2] - 4.0).abs() < 1e-3 && (w[4] - 4.0).abs() < 1e-3, "{w:?}");
        assert!(((w[3] - w[1]) - (100f32).hypot(8.0)).abs() < 1e-3, "its length kept");
    }

    #[test]
    fn a_rough_triangle_becomes_equilateral_on_a_level_base() {
        let w = regularise(vec![4.0, 0.0, 100.0, 110.0, 96.0, 50.0, 10.0]);
        let t = [[w[1], w[2]], [w[3], w[4]], [w[5], w[6]]];
        let s = [dist(t[0], t[1]), dist(t[1], t[2]), dist(t[2], t[0])];
        assert!((s[0] - s[1]).abs() < 1e-2 && (s[1] - s[2]).abs() < 1e-2, "equal sides {s:?}");
        assert!((t[0][1] - t[1][1]).abs() < 1e-2, "the base level {t:?}");
        assert!(t[2][1] < t[0][1], "the apex stays above, as drawn");
        let thin = regularise(vec![4.0, 0.0, 0.0, 200.0, 0.0, 100.0, 40.0]);
        assert_eq!(thin, vec![4.0, 0.0, 0.0, 200.0, 0.0, 100.0, 40.0], "a flat triangle stays as drawn");
    }

    #[test]
    fn a_closed_three_corner_path_and_a_rough_hexagon_are_regular() {
        let tri = regularise(vec![5.0, 1.0, 0.0, 0.0, 3.0, 0.0, 100.0, 105.0, 98.0, 52.0, 8.0]);
        let t: Vec<P> = (0..3).map(|i| [tri[5 + 2 * i], tri[6 + 2 * i]]).collect();
        assert!((dist(t[0], t[1]) - dist(t[1], t[2])).abs() < 1e-2);
        let hex: Vec<f32> = (0..6).flat_map(|i| { let a = i as f32 * PI / 3.0; let r = if i % 2 == 0 { 100.0 } else { 90.0 }; [r * a.cos(), r * a.sin()] }).collect();
        let mut w = vec![5.0, 1.0, 0.0, 0.0, 6.0];
        w.extend(&hex);
        let out = regularise(w);
        let p: Vec<P> = (0..6).map(|i| [out[5 + 2 * i], out[6 + 2 * i]]).collect();
        let sides: Vec<f32> = (0..6).map(|i| dist(p[i], p[(i + 1) % 6])).collect();
        assert!(sides.iter().all(|s| (s - sides[0]).abs() < 1e-2), "{sides:?}");
    }

    #[test]
    fn an_arrow_shaft_is_straightened_and_its_head_follows() {
        // an open path: a shaft nearly level, then a barb
        let w = regularise(vec![5.0, 0.0, 0.0, 1.0, 3.0, 0.0, 0.0, 200.0, 12.0, 180.0, 30.0]);
        assert!((w[8] - 0.0).abs() < 1e-3, "the shaft level: {w:?}");
        assert!((dist([w[7], w[8]], [w[9], w[10]]) - 20f32.hypot(18.0)).abs() < 1e-2, "the barb as long, from the moved tip: {w:?}");
    }

    #[test]
    fn unknown_wires_come_back_as_they_came() {
        assert_eq!(regularise(vec![0.0]), vec![0.0]);
        assert_eq!(regularise(vec![9.0, 1.0]), vec![9.0, 1.0]);
    }
}
