//! Shape snapping for the pen: Boox Notes turns a stroke held still at its end into a
//! clean line, rectangle, ellipse or triangle; its fitting is MyScript's closed engine (boox_5c_re
//! SHAPE-RECOGNITION.md), so this is an open one with no learning: the stroke resampled, then closure, corners
//! (Douglas–Peucker) and the residual of each candidate fit decide. Pure, in the units of the points it is given.
//!
//! Wire format for Java (`Core.penShape`): in `x0, y0, x1, y1, …`; out `[kind, …]` —
//! `0` nothing fits · `1` line `x1, y1, x2, y2` · `2` rectangle and `3` ellipse `cx, cy, w, h, angle (radians)` ·
//! `4` triangle `x1, y1, x2, y2, x3, y3`.

/// What a stroke was taken for.
#[derive(Debug, Clone, PartialEq)]
pub enum Shape {
    Line { from: [f32; 2], to: [f32; 2] },
    /// Centre, size along its own axes, rotation.
    Rectangle { centre: [f32; 2], size: [f32; 2], angle: f32 },
    Ellipse { centre: [f32; 2], size: [f32; 2], angle: f32 },
    Triangle([[f32; 2]; 3]),
}

impl Shape {
    pub fn to_wire(&self) -> Vec<f32> {
        match self {
            Shape::Line { from, to } => vec![1.0, from[0], from[1], to[0], to[1]],
            Shape::Rectangle { centre, size, angle } => vec![2.0, centre[0], centre[1], size[0], size[1], *angle],
            Shape::Ellipse { centre, size, angle } => vec![3.0, centre[0], centre[1], size[0], size[1], *angle],
            Shape::Triangle(p) => vec![4.0, p[0][0], p[0][1], p[1][0], p[1][1], p[2][0], p[2][1]],
        }
    }
}

type P = [f32; 2];

fn dist(a: P, b: P) -> f32 {
    (a[0] - b[0]).hypot(a[1] - b[1])
}

/// Distance from `p` to the segment `a`–`b`.
fn seg_dist(p: P, a: P, b: P) -> f32 {
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    let len = dx * dx + dy * dy;
    let t = if len == 0.0 { 0.0 } else { (((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len).clamp(0.0, 1.0) };
    dist(p, [a[0] + t * dx, a[1] + t * dy])
}

fn length(pts: &[P]) -> f32 {
    pts.windows(2).map(|w| dist(w[0], w[1])).sum()
}

/// `n` points evenly spaced along the path (the pen's samples bunch where it slows down).
fn resample(pts: &[P], n: usize) -> Vec<P> {
    let step = length(pts) / (n - 1) as f32;
    let mut out = vec![pts[0]];
    let (mut prev, mut acc) = (pts[0], 0.0);
    let mut i = 1;
    while i < pts.len() && out.len() < n {
        let d = dist(prev, pts[i]);
        if acc + d >= step && d > 0.0 {
            let t = (step - acc) / d;
            let q = [prev[0] + t * (pts[i][0] - prev[0]), prev[1] + t * (pts[i][1] - prev[1])];
            out.push(q);
            prev = q;
            acc = 0.0;
        } else {
            acc += d;
            prev = pts[i];
            i += 1;
        }
    }
    while out.len() < n {
        out.push(*pts.last().unwrap());
    }
    out
}

/// Douglas–Peucker: the indices of the points that keep the path within `eps`.
fn simplify(pts: &[P], eps: f32) -> Vec<usize> {
    fn rec(pts: &[P], a: usize, b: usize, eps: f32, keep: &mut Vec<usize>) {
        let (mut far, mut at) = (0.0, a);
        for i in a + 1..b {
            let d = seg_dist(pts[i], pts[a], pts[b]);
            if d > far {
                far = d;
                at = i;
            }
        }
        if far > eps {
            rec(pts, a, at, eps, keep);
            keep.push(at);
            rec(pts, at, b, eps, keep);
        }
    }
    let mut keep = vec![0];
    rec(pts, 0, pts.len() - 1, eps, &mut keep);
    keep.push(pts.len() - 1);
    keep
}

/// The principal axes: centroid, angle of the long axis.
fn axes(pts: &[P]) -> (P, f32) {
    let n = pts.len() as f32;
    let c = [pts.iter().map(|p| p[0]).sum::<f32>() / n, pts.iter().map(|p| p[1]).sum::<f32>() / n];
    let (mut xx, mut yy, mut xy) = (0.0, 0.0, 0.0);
    for p in pts {
        let (x, y) = (p[0] - c[0], p[1] - c[1]);
        xx += x * x;
        yy += y * y;
        xy += x * y;
    }
    (c, 0.5 * (2.0 * xy).atan2(xx - yy))
}

/// Points in the frame of (centre, angle).
fn local(pts: &[P], c: P, angle: f32) -> Vec<P> {
    let (s, co) = angle.sin_cos();
    pts.iter().map(|p| { let (x, y) = (p[0] - c[0], p[1] - c[1]); [x * co + y * s, -x * s + y * co] }).collect()
}

/// An angle that differs from a multiple of 90° by under 6° becomes it: hand-drawn boxes are meant straight.
fn square_up(a: f32) -> f32 {
    let q = std::f32::consts::FRAC_PI_2;
    let r = (a / q).round() * q;
    if (a - r).abs() < 6f32.to_radians() { 0.0 } else { a }
}

/// Mean distance from the points to a closed polygon, as a share of `scale`.
fn polygon_error(pts: &[P], corners: &[P], scale: f32) -> f32 {
    let n = corners.len();
    pts.iter().map(|&p| (0..n).map(|i| seg_dist(p, corners[i], corners[(i + 1) % n])).fold(f32::MAX, f32::min)).sum::<f32>() / pts.len() as f32 / scale
}

/// What the stroke (points in order) was meant as, or None when nothing fits well enough to replace it.
pub fn recognize(raw: &[P]) -> Option<Shape> {
    if raw.len() < 4 {
        return None;
    }
    let total = length(raw);
    let pts = resample(raw, 64);
    let (first, last) = (pts[0], pts[63]);
    let (minx, maxx) = pts.iter().fold((f32::MAX, f32::MIN), |(a, b), p| (a.min(p[0]), b.max(p[0])));
    let (miny, maxy) = pts.iter().fold((f32::MAX, f32::MIN), |(a, b), p| (a.min(p[1]), b.max(p[1])));
    let diag = (maxx - minx).hypot(maxy - miny);
    if total < 8.0 || diag < 6.0 {
        return None; // a dot or a tick
    }
    // a line: every point close to the chord, and the pen did not come back
    let chord = dist(first, last);
    if chord > 0.8 * total && pts.iter().all(|&p| seg_dist(p, first, last) < 0.05 * chord.max(1.0) + 1.5) {
        return Some(Shape::Line { from: raw[0], to: *raw.last().unwrap() });
    }
    // the rest are closed: the ends meet (within a fifth of the way round)
    if chord > 0.2 * total {
        return None;
    }
    let (c, pca) = axes(&pts);
    // corners: the closed path simplified (the last point is the first again)
    let scale0 = (maxx - minx).max(maxy - miny);
    let mut closed = pts.clone();
    closed.push(first);
    let keep = simplify(&closed, 0.08 * scale0);
    let mut corners: Vec<P> = keep.iter().map(|&i| closed[i]).collect();
    corners.pop(); // the end, which is the start
    // the start of the stroke is rarely a real corner: dropped when it lies on the line of its neighbours
    if corners.len() > 3 {
        let n = corners.len();
        if seg_dist(corners[0], corners[n - 1], corners[1]) < 0.08 * scale0 {
            corners.remove(0);
        }
    }
    // a box's angle: the principal axis, or (a square has none) its edges' directions
    let mut angles = vec![pca];
    if corners.len() == 4 {
        angles.extend((0..4).map(|i| { let (a, b) = (corners[i], corners[(i + 1) % 4]); (b[1] - a[1]).atan2(b[0] - a[0]) }));
    }
    let rect = angles.iter().map(|&a| fit_box(&pts, a)).min_by(|x, y| x.err.total_cmp(&y.err))?;
    if rect.size[0] < 4.0 || rect.size[1] < 4.0 {
        return None; // flat: a back-and-forth, not a shape
    }
    let ell = fit_ellipse(&pts, c, pca);
    let tri_err = if corners.len() == 3 { polygon_error(&pts, &corners, scale0) } else { f32::MAX };

    let best = [(tri_err, 4), (rect.err, 2), (ell.err * 0.5, 3)].into_iter().min_by(|a, b| a.0.total_cmp(&b.0))?;
    match best {
        (e, 4) if e < 0.04 => Some(Shape::Triangle(special_triangle([corners[0], corners[1], corners[2]]))),
        (e, 2) if e < 0.035 && corners.len() == 4 => Some(Shape::Rectangle { centre: rect.centre, size: evened(rect.size), angle: square_up(rect.angle) }),
        (e, 3) if e < 0.06 && corners.len() != 3 => Some(Shape::Ellipse { centre: ell.centre, size: evened(ell.size), angle: square_up(ell.angle) }),
        _ => None,
    }
}

/// The most specialised class that fits wins (MyScript's order, boox_5c_re SHAPE-RE.md: square before rectangle,
/// circle before ellipse): sides within a tenth of each other are made equal.
fn evened(size: [f32; 2]) -> [f32; 2] {
    let (lo, hi) = (size[0].min(size[1]), size[0].max(size[1]));
    if hi - lo < 0.1 * hi {
        let m = (lo + hi) / 2.0;
        [m, m]
    } else {
        size
    }
}

/// A triangle whose angles are within 10° of an equilateral's becomes one (same centre, first corner's direction);
/// one with an angle within 10° of a right angle gets it exact (SHAPE-RE.md: 10° for the triangles' special angles).
fn special_triangle(p: [P; 3]) -> [P; 3] {
    let tol = 10f32.to_radians();
    let real = |i: usize| {
        let (a, b, c) = (p[i], p[(i + 1) % 3], p[(i + 2) % 3]);
        let (u, v) = ([b[0] - a[0], b[1] - a[1]], [c[0] - a[0], c[1] - a[1]]);
        ((u[0] * v[0] + u[1] * v[1]) / (u[0].hypot(u[1]) * v[0].hypot(v[1])).max(1e-6)).clamp(-1.0, 1.0).acos()
    };
    let a = [real(0), real(1), real(2)];
    let third = std::f32::consts::FRAC_PI_3;
    if a.iter().all(|x| (x - third).abs() < tol) {
        let c = [(p[0][0] + p[1][0] + p[2][0]) / 3.0, (p[0][1] + p[1][1] + p[2][1]) / 3.0];
        let r = (dist(c, p[0]) + dist(c, p[1]) + dist(c, p[2])) / 3.0;
        let start = (p[0][1] - c[1]).atan2(p[0][0] - c[0]);
        // the corners keep their turning direction (clockwise or not)
        let turn = if (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]) >= 0.0 { 1.0 } else { -1.0 };
        let at = |k: f32| { let t = start + turn * k * 2.0 * third; [c[0] + r * t.cos(), c[1] + r * t.sin()] };
        return [at(0.0), at(1.0), at(2.0)];
    }
    if let Some(i) = (0..3).find(|&i| (a[i] - std::f32::consts::FRAC_PI_2).abs() < tol) {
        // the right angle at corner i: the next corner stays, the last moves onto the perpendicular
        let (o, j, k) = (p[i], p[(i + 1) % 3], p[(i + 2) % 3]);
        let u = [j[0] - o[0], j[1] - o[1]];
        let len = u[0].hypot(u[1]).max(1e-6);
        let n = [-u[1] / len, u[0] / len];
        let d = (k[0] - o[0]) * n[0] + (k[1] - o[1]) * n[1];
        let mut q = p;
        q[(i + 2) % 3] = [o[0] + n[0] * d, o[1] + n[1] * d];
        return q;
    }
    p
}

/// A box or an ellipse fitted at an angle, and how far the points are from it (a share of its size).
struct Fit {
    centre: P,
    size: [f32; 2],
    angle: f32,
    err: f32,
}

/// The points' extent along (angle): centre and size in those axes.
fn extent(pts: &[P], c: P, angle: f32) -> (P, [f32; 2], Vec<P>) {
    let loc = local(pts, c, angle);
    let (x0, x1) = loc.iter().fold((f32::MAX, f32::MIN), |(a, b), p| (a.min(p[0]), b.max(p[0])));
    let (y0, y1) = loc.iter().fold((f32::MAX, f32::MIN), |(a, b), p| (a.min(p[1]), b.max(p[1])));
    let mid = [(x0 + x1) / 2.0, (y0 + y1) / 2.0];
    let (s, co) = angle.sin_cos();
    let centre = [c[0] + mid[0] * co - mid[1] * s, c[1] + mid[0] * s + mid[1] * co];
    let loc = loc.into_iter().map(|p| [p[0] - mid[0], p[1] - mid[1]]).collect();
    (centre, [x1 - x0, y1 - y0], loc)
}

fn fit_box(pts: &[P], angle: f32) -> Fit {
    let (centre, size, _) = extent(pts, pts[0], angle);
    let (s, co) = angle.sin_cos();
    let (hw, hh) = (size[0] / 2.0, size[1] / 2.0);
    let corners: Vec<P> = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].iter().map(|q| [centre[0] + q[0] * co - q[1] * s, centre[1] + q[0] * s + q[1] * co]).collect();
    Fit { centre, size, angle, err: polygon_error(pts, &corners, size[0].max(size[1]).max(1.0)) }
}

fn fit_ellipse(pts: &[P], c: P, angle: f32) -> Fit {
    let (centre, size, loc) = extent(pts, c, angle);
    let (rx, ry) = ((size[0] / 2.0).max(0.5), (size[1] / 2.0).max(0.5));
    let err = loc.iter().map(|p| ((p[0] / rx).hypot(p[1] / ry) - 1.0).abs()).sum::<f32>() / loc.len() as f32;
    // a circle has no axis of its own: drawn upright
    let angle = if (size[0] - size[1]).abs() < 0.1 * size[0].max(size[1]) { 0.0 } else { angle };
    Fit { centre, size, angle, err }
}

/// `x0, y0, x1, y1, …` → the wire format above.
/// Pad's `x, y, t` points (the wire both recognisers take): this one reads the places only.
pub fn recognize_xyt(xyt: &[f32]) -> Vec<f32> {
    // one stroke only: the last (a stroke sent before it, after a NaN triple, is for openink's arrows)
    let last = crate::shape_openink::strokes(xyt).pop().unwrap_or_default();
    recognize_wire(&last.iter().flat_map(|p| [p[0], p[1]]).collect::<Vec<_>>())
}

pub fn recognize_wire(xy: &[f32]) -> Vec<f32> {
    let pts: Vec<P> = xy.as_chunks::<2>().0.iter().filter(|p| p[0].is_finite() && p[1].is_finite()).map(|p| [p[0], p[1]]).collect();
    recognize(&pts).map_or_else(|| vec![0.0], |s| s.to_wire())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A hand's wobble: deterministic, a couple of units.
    fn wobble(i: usize) -> f32 {
        ((i as f32 * 1.7).sin() + (i as f32 * 0.37).cos()) * 0.9
    }

    fn circle(cx: f32, cy: f32, rx: f32, ry: f32) -> Vec<P> {
        (0..=120).map(|i| { let t = i as f32 / 120.0 * std::f32::consts::TAU; [cx + rx * t.cos() + wobble(i), cy + ry * t.sin() + wobble(i + 7)] }).collect()
    }

    fn polyline(corners: &[P], per_side: usize) -> Vec<P> {
        let mut out = Vec::new();
        for k in 0..corners.len() {
            let (a, b) = (corners[k], corners[(k + 1) % corners.len()]);
            for i in 0..per_side {
                let t = i as f32 / per_side as f32;
                out.push([a[0] + t * (b[0] - a[0]) + wobble(out.len()), a[1] + t * (b[1] - a[1]) + wobble(out.len() + 3)]);
            }
        }
        out.push(corners[0]);
        out
    }

    #[test]
    fn a_straight_stroke_is_a_line() {
        let pts: Vec<P> = (0..50).map(|i| [10.0 + i as f32 * 4.0, 20.0 + i as f32 * 1.0 + wobble(i) * 0.5]).collect();
        assert!(matches!(recognize(&pts), Some(Shape::Line { .. })), "{:?}", recognize(&pts));
    }

    #[test]
    fn a_round_stroke_is_an_ellipse() {
        match recognize(&circle(200.0, 150.0, 80.0, 50.0)) {
            Some(Shape::Ellipse { centre, size, angle }) => {
                assert!((centre[0] - 200.0).abs() < 4.0 && (centre[1] - 150.0).abs() < 4.0, "{centre:?}");
                assert!((size[0] - 160.0).abs() < 8.0 && (size[1] - 100.0).abs() < 8.0 && angle == 0.0, "{size:?} {angle}");
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_box_is_a_rectangle_and_three_corners_a_triangle() {
        let r = polyline(&[[0.0, 0.0], [200.0, 0.0], [200.0, 120.0], [0.0, 120.0]], 30);
        assert!(matches!(recognize(&r), Some(Shape::Rectangle { angle, .. }) if angle == 0.0), "{:?}", recognize(&r));
        let t = polyline(&[[0.0, 150.0], [100.0, 0.0], [200.0, 150.0]], 30);
        assert!(matches!(recognize(&t), Some(Shape::Triangle(_))), "{:?}", recognize(&t));
    }

    #[test]
    fn a_square_a_tilted_box_and_a_circle() {
        let sq = polyline(&[[0.0, 0.0], [150.0, 0.0], [150.0, 150.0], [0.0, 150.0]], 30);
        assert!(matches!(recognize(&sq), Some(Shape::Rectangle { angle, size, .. }) if angle == 0.0 && (size[0] - 150.0).abs() < 8.0), "{:?}", recognize(&sq));
        let a = 0.5f32;
        let (s, c) = a.sin_cos();
        let rot = |x: f32, y: f32| [100.0 + x * c - y * s, 100.0 + x * s + y * c];
        let tilted = polyline(&[rot(-100.0, -40.0), rot(100.0, -40.0), rot(100.0, 40.0), rot(-100.0, 40.0)], 30);
        match recognize(&tilted) {
            Some(Shape::Rectangle { angle, size, .. }) => assert!(((angle - a).abs() < 0.08 || (angle - a).abs() > 3.0) && (size[0].max(size[1]) - 200.0).abs() < 10.0, "{angle} {size:?}"),
            other => panic!("{other:?}"),
        }
        assert!(matches!(recognize(&circle(0.0, 0.0, 60.0, 60.0)), Some(Shape::Ellipse { angle, .. }) if angle == 0.0));
    }

    #[test]
    fn near_special_shapes_become_special() {
        assert_eq!(evened([100.0, 94.0]), [97.0, 97.0]);
        assert_eq!(evened([100.0, 70.0]), [100.0, 70.0]);
        let eq = special_triangle([[0.0, 100.0], [52.0, 8.0], [97.0, 98.0]]);
        let sides = [dist(eq[0], eq[1]), dist(eq[1], eq[2]), dist(eq[2], eq[0])];
        assert!(sides.iter().all(|s| (s - sides[0]).abs() < 0.01 * sides[0]), "{sides:?}");
        let right = special_triangle([[0.0, 0.0], [100.0, 4.0], [-5.0, 80.0]]);
        let (u, v) = ([right[1][0] - right[0][0], right[1][1] - right[0][1]], [right[2][0] - right[0][0], right[2][1] - right[0][1]]);
        assert!((u[0] * v[0] + u[1] * v[1]).abs() < 1e-2, "{right:?}");
    }

    #[test]
    fn a_scribble_or_an_open_curve_stays_ink() {
        let s: Vec<P> = (0..80).map(|i| [i as f32 * 3.0, if i % 10 < 5 { 0.0 } else { 40.0 } + wobble(i)]).collect();
        assert_eq!(recognize(&s), None);
        let arc: Vec<P> = (0..60).map(|i| { let t = i as f32 / 60.0 * std::f32::consts::PI; [100.0 * t.cos(), 100.0 * t.sin()] }).collect();
        assert_eq!(recognize(&arc), None);
        assert_eq!(recognize_wire(&[1.0, 1.0, 2.0, 2.0]), vec![0.0]);
    }
}
