//! Shape snapping by openink's recogniser (`openink-shape`, vendored from boox_5c_re: a trained classifier +
//! segmenter, geometric fits, specialisation — FROM-BOOX.md, 2026-10-17 evening; weights include Google's Quick, Draw!
//! data, CC BY 4.0), mapped onto what Excalidraw draws. The Notepad setting `shapes = "openink"` picks it over Atlas's
//! own (shape.rs): its first version read an upright 200×80 box as an ellipse and rejected boxes turned ≥ 0.3 rad;
//! fixed upstream (3e1a009: smoothed features, Douglas–Peucker corners beside the segmenter; FROM-BOOX.md).
//!
//! Wire format for Java (`Core.penShape`): in `x0, y0, t0, x1, y1, t1, …` (t in ms); out `[kind, …]` —
//! `0` leave it ink · `1` line `x1, y1, x2, y2` · `2` rectangle and `3` ellipse `cx, cy, w, h, angle (radians)` ·
//! `5` path `closed, start head, end head (0/1), n, x1, y1, … xn, yn` (triangles, polygons, arrows, arcs).
//! (`4`, a triangle, is drawn by the shapes tool only.)

use openink_shape::features::Sample;
use openink_shape::geom::Pt;
use openink_shape::model::{Candidate, Decoration, Primitive, Recognition, ShapeClass};
use openink_shape::recognize::Recognizer;
use std::sync::OnceLock;

/// What a stroke was taken for.
#[derive(Debug, Clone, PartialEq)]
pub enum Shape {
    Line { from: [f32; 2], to: [f32; 2] },
    /// Centre, size along its own axes, rotation.
    Rectangle { centre: [f32; 2], size: [f32; 2], angle: f32 },
    Ellipse { centre: [f32; 2], size: [f32; 2], angle: f32 },
    /// Corners and sampled curves in order; `closed` joins the last to the first.
    Path { points: Vec<[f32; 2]>, closed: bool, start_head: bool, end_head: bool },
}

impl Shape {
    pub fn to_wire(&self) -> Vec<f32> {
        match self {
            Shape::Line { from, to } => vec![1.0, from[0], from[1], to[0], to[1]],
            Shape::Rectangle { centre, size, angle } => vec![2.0, centre[0], centre[1], size[0], size[1], *angle],
            Shape::Ellipse { centre, size, angle } => vec![3.0, centre[0], centre[1], size[0], size[1], *angle],
            Shape::Path { points, closed, start_head, end_head } => {
                let flag = |b: bool| if b { 1.0 } else { 0.0 };
                let mut w = vec![5.0, flag(*closed), flag(*start_head), flag(*end_head), points.len() as f32];
                w.extend(points.iter().flatten());
                w
            }
        }
    }
}

type P = [f32; 2];

/// Polylines and polygons with more corners than this stay ink: a hold mid-way through zig-zag writing is not a shape.
const MAX_CORNERS: usize = 8;

fn recognizer() -> &'static Recognizer {
    static R: OnceLock<Recognizer> = OnceLock::new();
    R.get_or_init(Recognizer::builtin)
}

/// The shape one stroke (x, y, t in ms) was meant as, or None to leave it ink.
pub fn recognize(stroke: &[[f32; 3]]) -> Option<Shape> { recognize_strokes(&[stroke.to_vec()]) }

/// The shape of several strokes read together (an arrow's head drawn apart from its shaft), or None.
pub fn recognize_strokes(strokes: &[Vec<[f32; 3]>]) -> Option<Shape> {
    let ink: Vec<Vec<Sample>> = strokes.iter().filter(|s| !s.is_empty()).map(|s| s.iter().map(|p| Sample { x: p[0], y: p[1], t: p[2] }).collect()).collect();
    if ink.is_empty() { return None; }
    match recognizer().recognize(&ink) {
        Recognition::Shape(cands) => cands.first().and_then(shape_of),
        Recognition::ScratchOut { .. } | Recognition::Rejected => None, // the notepad's own scribble erase handles scratch-outs
    }
}

fn xy(p: Pt) -> P { [p.x, p.y] }

/// The best candidate as Excalidraw's element: a rectangle or ellipse where Excalidraw has one, else a path.
fn shape_of(c: &Candidate) -> Option<Shape> {
    use ShapeClass::*;
    match (c.class, c.primitives.as_slice()) {
        (Line, [Primitive::Line { p1, p2, .. }]) => Some(Shape::Line { from: xy(*p1), to: xy(*p2) }),
        (Rectangle | Square, [Primitive::Line { p1: a, p2: b, .. }, Primitive::Line { p1: _, p2: c2, .. }, ..]) => {
            let (a, b, c2) = (xy(*a), xy(*b), xy(*c2));
            Some(Shape::Rectangle {
                centre: [(a[0] + c2[0]) / 2.0, (a[1] + c2[1]) / 2.0],
                size: [dist(a, b), dist(b, c2)],
                angle: (b[1] - a[1]).atan2(b[0] - a[0]),
            })
        }
        (Ellipse | Circle, [Primitive::Arc { centre, rx, ry, phi, .. }]) => {
            Some(Shape::Ellipse { centre: xy(*centre), size: [2.0 * rx, 2.0 * ry], angle: *phi })
        }
        (ScratchOut, _) => None,
        (Polyline | Polygon, ps) => path(ps).filter(|s| matches!(s, Shape::Path { points, .. } if points.len() <= MAX_CORNERS)),
        (_, ps) => path(ps),
    }
}

/// The primitives chained: a line by its ends, an arc sampled; arrowheads from the first and last ends' decorations.
fn path(ps: &[Primitive]) -> Option<Shape> {
    let mut points: Vec<P> = Vec::new();
    let (mut start_head, mut end_head) = (false, false);
    for (i, p) in ps.iter().enumerate() {
        let (pts, d1, d2) = match p {
            Primitive::Line { p1, p2, d1, d2 } => (vec![xy(*p1), xy(*p2)], *d1, *d2),
            Primitive::Arc { rx, ry, d1, d2, .. } => (p.sample(rx.max(*ry) / 12.0).into_iter().map(xy).collect(), *d1, *d2),
        };
        if i == 0 { start_head = d1 != Decoration::None; } // open or closed (triangle) head
        if i == ps.len() - 1 { end_head = d2 != Decoration::None; }
        for q in pts {
            if points.last().is_none_or(|l| dist(*l, q) > 1e-3) { points.push(q); }
        }
    }
    if points.len() < 2 { return None; }
    let span = points.iter().fold(0f32, |m, p| m.max(dist(*p, points[0])));
    let closed = points.len() > 2 && dist(points[0], *points.last().unwrap()) < span * 1e-3;
    if closed { points.pop(); }
    Some(Shape::Path { points, closed, start_head, end_head })
}

fn dist(a: P, b: P) -> f32 { ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt() }

/// `x, y, t` triples; a triple of NaNs separates strokes (Pad sends the stroke before when it may be a shaft).
pub fn recognize_wire(xyt: &[f32]) -> Vec<f32> {
    recognize_strokes(&strokes(xyt)).map_or_else(|| vec![0.0], |s| s.to_wire())
}

/// The wire's strokes: split at NaN triples, other non-finite points dropped.
pub fn strokes(xyt: &[f32]) -> Vec<Vec<[f32; 3]>> {
    let mut out = vec![Vec::new()];
    for p in xyt.as_chunks::<3>().0 {
        if p.iter().all(|v| v.is_nan()) { out.push(Vec::new()); }
        else if p.iter().all(|v| v.is_finite()) { out.last_mut().unwrap().push([p[0], p[1], p[2]]); }
    }
    out.retain(|s| !s.is_empty());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A hand's wobble: deterministic, a couple of units.
    fn wobble(i: usize) -> f32 {
        ((i as f32 * 1.7).sin() + (i as f32 * 0.37).cos()) * 0.9
    }

    /// Points drawn 8 ms apart (a pen's report rate), as Pad sends them.
    fn timed(pts: &[P]) -> Vec<[f32; 3]> {
        pts.iter().enumerate().map(|(i, p)| [p[0], p[1], i as f32 * 8.0]).collect()
    }

    fn of(pts: &[P]) -> Option<Shape> { recognize(&timed(pts)) }

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
        assert!(matches!(of(&pts), Some(Shape::Line { .. })), "{:?}", of(&pts));
    }

    #[test]
    fn a_round_stroke_is_an_ellipse() {
        match of(&circle(200.0, 150.0, 80.0, 50.0)) {
            Some(Shape::Ellipse { centre, size, .. }) => {
                assert!((centre[0] - 200.0).abs() < 6.0 && (centre[1] - 150.0).abs() < 6.0, "{centre:?}");
                let (big, small) = (size[0].max(size[1]), size[0].min(size[1]));
                assert!((big - 160.0).abs() < 12.0 && (small - 100.0).abs() < 12.0, "{size:?}");
            }
            other => panic!("{other:?}"),
        }
        assert!(matches!(of(&circle(0.0, 0.0, 60.0, 60.0)), Some(Shape::Ellipse { .. })));
    }

    #[test]
    fn a_long_upright_box_is_a_rectangle() {
        let b = polyline(&[[0.0, 60.0], [200.0, 60.0], [200.0, 140.0], [0.0, 140.0]], 30);
        assert!(matches!(of(&b), Some(Shape::Rectangle { .. })), "{:?}", of(&b));
    }

    #[test]
    fn a_box_is_a_rectangle_and_three_corners_a_closed_path() {
        let r = polyline(&[[0.0, 0.0], [200.0, 0.0], [200.0, 120.0], [0.0, 120.0]], 30);
        match of(&r) {
            Some(Shape::Rectangle { centre, size, .. }) => {
                assert!((centre[0] - 100.0).abs() < 6.0 && (centre[1] - 60.0).abs() < 6.0, "{centre:?}");
                assert!((size[0].max(size[1]) - 200.0).abs() < 12.0 && (size[0].min(size[1]) - 120.0).abs() < 12.0, "{size:?}");
            }
            other => panic!("{other:?}"),
        }
        let t = polyline(&[[0.0, 150.0], [100.0, 0.0], [200.0, 150.0]], 30);
        assert!(matches!(of(&t), Some(Shape::Path { ref points, closed: true, .. }) if points.len() == 3), "{:?}", of(&t));
    }

    #[test]
    fn a_tilted_box_keeps_its_turn() {
        let a = 0.5f32;
        let (s, c) = a.sin_cos();
        let rot = |x: f32, y: f32| [100.0 + x * c - y * s, 100.0 + x * s + y * c];
        let tilted = polyline(&[rot(-100.0, -40.0), rot(100.0, -40.0), rot(100.0, 40.0), rot(-100.0, 40.0)], 30);
        match of(&tilted) {
            // a turn of a, or of a ± a quarter / half turn with the sides swapped: the same box
            Some(Shape::Rectangle { angle, size, .. }) => {
                let off = (angle - a).rem_euclid(std::f32::consts::FRAC_PI_2);
                assert!(!(0.08..=std::f32::consts::FRAC_PI_2 - 0.08).contains(&off), "{angle}");
                assert!((size[0].max(size[1]) - 200.0).abs() < 12.0, "{size:?}");
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn the_wire_splits_strokes_at_nan() {
        let n = f32::NAN;
        let s = strokes(&[1.0, 2.0, 0.0, 3.0, 4.0, 8.0, n, n, n, 5.0, 6.0, 0.0]);
        assert_eq!(s, vec![vec![[1.0, 2.0, 0.0], [3.0, 4.0, 8.0]], vec![[5.0, 6.0, 0.0]]]);
    }

    #[test]
    fn the_wire_carries_paths_and_nothing() {
        let w = Shape::Path { points: vec![[1.0, 2.0], [3.0, 4.0]], closed: false, start_head: false, end_head: true }.to_wire();
        assert_eq!(w, vec![5.0, 0.0, 0.0, 1.0, 2.0, 1.0, 2.0, 3.0, 4.0]);
        assert_eq!(recognize_wire(&[1.0, 1.0, 0.0, 2.0, 2.0, 8.0]), vec![0.0]);
        assert_eq!(recognize_wire(&[]), vec![0.0]);
    }

    /// What openink itself says (family odds, class, cost, primitives; `>` marks an arrowhead) and what Atlas
    /// maps it to, for `--nocapture`. Returns openink's best class and Atlas's shape.
    fn report(name: &str, pts: &[P]) -> (Option<ShapeClass>, Option<Shape>) {
        let ink = vec![timed(pts).iter().map(|p| Sample { x: p[0], y: p[1], t: p[2] }).collect::<Vec<_>>()];
        if let Some(n) = openink_shape::features::Norm::new(&ink) {
            let probs = recognizer().models.classifier.probabilities(&openink_shape::features::stroke_features(&n));
            let fams: Vec<String> = openink_shape::model::Family::ALL.iter().zip(&probs).filter(|(_, p)| **p > 0.01).map(|(f, p)| format!("{f:?} {p:.2}")).collect();
            eprintln!("{name}: families {}", fams.join(", "));
        }
        let best = match recognizer().recognize(&ink) {
            Recognition::Shape(cands) => {
                for c in cands.iter().take(3) {
                    let prims: Vec<String> = c.primitives.iter().map(|p| match p {
                        Primitive::Line { d1, d2, .. } => format!("L{}{}", if *d1 == Decoration::ArrowHead { "<" } else { "" }, if *d2 == Decoration::ArrowHead { ">" } else { "" }),
                        Primitive::Arc { d1, d2, .. } => format!("A{}{}", if *d1 == Decoration::ArrowHead { "<" } else { "" }, if *d2 == Decoration::ArrowHead { ">" } else { "" }),
                    }).collect();
                    eprintln!("{name}: {:?} cost {:.2} [{}]", c.class, c.cost, prims.join(" "));
                }
                Some(cands[0].class)
            }
            other => { eprintln!("{name}: {other:?}"); None }
        };
        let s = of(pts);
        eprintln!("{name}: atlas -> {s:?}");
        (best, s)
    }

    fn regular(n: usize, r: f32, turn: f32) -> Vec<P> {
        (0..n).map(|k| { let a = turn + k as f32 / n as f32 * std::f32::consts::TAU; [300.0 + r * a.cos(), 300.0 + r * a.sin()] }).collect()
    }

    /// An open run through `pts`, `per` samples per segment, with the hand's wobble.
    fn run(pts: &[P], per: usize) -> Vec<P> {
        let mut out = Vec::new();
        for w in pts.windows(2) {
            for i in 0..per {
                let t = i as f32 / per as f32;
                out.push([w[0][0] + t * (w[1][0] - w[0][0]) + wobble(out.len()), w[0][1] + t * (w[1][1] - w[0][1]) + wobble(out.len() + 3)]);
            }
        }
        out.push(*pts.last().unwrap());
        out
    }

    fn is_closed_path(s: &Option<Shape>, n: usize) -> bool {
        matches!(s, Some(Shape::Path { points, closed: true, .. }) if points.len() == n)
    }

    /// Every polygon openink finds must reach the pad with its n corners; openink's own misses (a small one taken
    /// for a circle) are listed, not failed — FROM-ATLAS.md, 2026-10-18.
    #[test]
    fn hexagons_and_pentagons_are_closed_paths() {
        let (mut bad, mut openink_misses) = (Vec::new(), Vec::new());
        for n in [5usize, 6] {
            for r in [60.0f32, 120.0, 250.0] {
                for turn in [0.0f32, 0.2, 0.5] {
                    let name = format!("{n}-gon r{r} turn{turn}");
                    match report(&name, &polyline(&regular(n, r, turn), (r / 4.0) as usize)) {
                        (Some(c), s) if c.family() == openink_shape::model::Family::Polygon => if !is_closed_path(&s, n) { bad.push(name) },
                        (c, _) => openink_misses.push(format!("{name}: {c:?}")),
                    }
                }
            }
        }
        eprintln!("polygons openink missed: {openink_misses:?}");
        assert!(bad.is_empty(), "polygons lost by the mapping: {bad:?}");
        assert!(openink_misses.is_empty(), "openink missed polygons (shape5 reads them all): {openink_misses:?}");
    }

    /// A shaft from (0,0) to (len,0) turned by `turn`, then a head of barbs `h` long at ±`spread` from the shaft.
    fn arrow_parts(len: f32, turn: f32, h: f32, spread: f32) -> (P, P, P, P) {
        let (s, c) = turn.sin_cos();
        let rot = |x: f32, y: f32| [100.0 + x * c - y * s, 100.0 + x * s + y * c];
        let (bs, bc) = spread.sin_cos();
        (rot(0.0, 0.0), rot(len, 0.0), rot(len - h * bc, h * bs), rot(len - h * bc, -h * bs))
    }

    fn has_end_head(s: &Option<Shape>) -> bool {
        matches!(s, Some(Shape::Path { start_head, end_head, .. }) if *start_head || *end_head)
    }

    /// Every arrow openink finds must reach the pad with its head; openink's own misses are listed, not failed.
    #[test]
    fn one_stroke_arrows_carry_a_head() {
        let (mut bad, mut openink_misses) = (Vec::new(), Vec::new());
        for len in [120.0f32, 250.0] {
            for turn in [0.0f32, 0.6, 2.5] {
                let (tail, tip, b1, b2) = arrow_parts(len, turn, len * 0.2, 0.5);
                let forms: [(&str, Vec<P>); 3] = [
                    // shaft, one barb, back to the tip, the other barb
                    ("shaft+V", run(&[tail, tip, b1, tip, b2], 30)),
                    // shaft then the head as a closed-ish polyline: barb, across, other barb's end back to tip
                    ("shaft+triangle", run(&[tail, tip, b1, b2, tip], 30)),
                    // a half head: the shaft, then one barb (a one-stroke "⇀")
                    ("half-head", run(&[tail, tip, b1], 30)),
                ];
                for (form, pts) in forms {
                    let name = format!("arrow {form} len{len} turn{turn}");
                    match report(&name, &pts) {
                        (Some(c), s) if c.family() == openink_shape::model::Family::Arrow => if !has_end_head(&s) { bad.push(name) },
                        (c, _) => openink_misses.push(format!("{name}: {c:?}")),
                    }
                }
            }
        }
        eprintln!("arrows openink missed: {openink_misses:?}");
        assert!(bad.is_empty(), "arrows that lost their head in the mapping: {bad:?}");
        assert!(openink_misses.len() <= 8, "openink misses grew: {openink_misses:?}");
    }

    /// A shaft, then the head as a second stroke (a chevron), as on paper: what openink makes of it when the pad
    /// passes both strokes (it passes one today).
    #[test]
    fn two_stroke_arrows_for_the_record() {
        for len in [120.0f32, 250.0] {
            for turn in [0.0f32, 0.6, 2.5] {
                let (tail, tip, b1, b2) = arrow_parts(len, turn, len * 0.2, 0.5);
                let (shaft, head) = (timed(&run(&[tail, tip], 30)), timed(&run(&[b1, tip, b2], 15)));
                let t0 = shaft.last().unwrap()[2] + 300.0;
                let ink: Vec<Vec<Sample>> = [shaft.clone(), head.iter().map(|p| [p[0], p[1], p[2] + t0]).collect()]
                    .iter().map(|s| s.iter().map(|p| Sample { x: p[0], y: p[1], t: p[2] }).collect()).collect();
                let got = match recognizer().recognize(&ink) {
                    Recognition::Shape(c) => format!("{:?} -> {:?}", c[0].class, shape_of(&c[0])),
                    other => format!("{other:?}"),
                };
                eprintln!("two strokes len{len} turn{turn}: {got}");
            }
        }
    }

    #[test]
    fn writing_stays_ink() {
        // a zig-zag run of many corners: a hold mid-word must not snap it
        let s: Vec<P> = (0..80).map(|i| [i as f32 * 3.0, if i % 10 < 5 { 0.0 } else { 40.0 } + wobble(i)]).collect();
        assert!(!matches!(of(&s), Some(Shape::Rectangle { .. } | Shape::Ellipse { .. } | Shape::Line { .. })), "{:?}", of(&s));
    }
}
