//! An arrow from two strokes by plain geometry: a nearly straight
//! shaft, then a "V" whose point is at one of the shaft's ends with both barbs pointing back along it. Asked when a
//! head is drawn apart from its shaft, before the recognisers (openink reads arrows too, but misses short, quick
//! heads — FROM-ATLAS.md), and for either recogniser. The answer is the wire's open path with a head at its end.

type P = [f32; 2];

/// How straight a shaft must be: its farthest point from the chord at most this share of its length.
const STRAIGHT: f32 = 0.08;
/// The V's point within this share of the shaft's length from one of its ends.
const NEAR_END: f32 = 0.2;
/// The angle between the barbs, degrees: a V, not a line or a hook.
const SPREAD: (f32, f32) = (15.0, 130.0);

/// `xyt` as Pad sends two strokes: `x, y, t` triples, a NaN triple between the shaft and the head. The arrow's wire
/// (`[5, 0, 0, 1, 2, tail x, tail y, tip x, tip y]`), or None when the two are not a shaft and its head.
pub fn of_two(xyt: &[f32]) -> Option<Vec<f32>> {
    let split = (0..xyt.len() / 3).find(|&i| xyt[3 * i].is_nan())?;
    let pts = |from: usize, to: usize| -> Vec<P> { (from..to).map(|i| [xyt[3 * i], xyt[3 * i + 1]]).filter(|p| p[0].is_finite() && p[1].is_finite()).collect() };
    let (shaft, head) = (pts(0, split), pts(split + 1, xyt.len() / 3));
    let (tail, tip) = straight(&shaft)?;
    let len = dist(tail, tip);
    let (b1, apex, b2) = vee(&head)?;
    // the V's point at one of the shaft's ends: that end is the tip
    let (tail, tip) = if dist(apex, tip) <= dist(apex, tail) { (tail, tip) } else { (tip, tail) };
    if dist(apex, tip) > NEAR_END * len { return None; }
    // both barbs point back, towards the tail
    let back = [tail[0] - tip[0], tail[1] - tip[1]];
    let backwards = |b: P| (b[0] - apex[0]) * back[0] + (b[1] - apex[1]) * back[1] > 0.0;
    if !backwards(b1) || !backwards(b2) { return None; }
    Some(vec![5.0, 0.0, 0.0, 1.0, 2.0, tail[0], tail[1], apex[0], apex[1]])
}

fn dist(a: P, b: P) -> f32 { (a[0] - b[0]).hypot(a[1] - b[1]) }

fn off_line(p: P, a: P, b: P) -> f32 {
    let l = dist(a, b);
    if l == 0.0 { return dist(p, a); }
    ((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])).abs() / l
}

/// A stroke's two ends when it is nearly straight (and long enough to be a shaft).
fn straight(s: &[P]) -> Option<(P, P)> {
    let (a, b) = (*s.first()?, *s.last()?);
    let len = dist(a, b);
    if s.len() < 2 || len < 12.0 { return None; }
    s.iter().all(|p| off_line(*p, a, b) <= STRAIGHT * len).then_some((a, b))
}

/// A stroke that is a V: its two ends and the point farthest from the line between them (the V's point), each leg
/// nearly straight and the barbs spread as a V's are.
fn vee(s: &[P]) -> Option<(P, P, P)> {
    let (a, b) = (*s.first()?, *s.last()?);
    let (i, _) = s.iter().enumerate().map(|(i, p)| (i, off_line(*p, a, b))).max_by(|x, y| x.1.total_cmp(&y.1))?;
    let apex = s[i];
    if i == 0 || i == s.len() - 1 { return None; }
    let (l1, l2) = (dist(a, apex), dist(apex, b));
    if l1 < 4.0 || l2 < 4.0 || l1.max(l2) > 3.0 * l1.min(l2) { return None; } // two barbs of a like length
    let leg_ok = |leg: &[P], from: P, to: P| leg.iter().all(|p| off_line(*p, from, to) <= 0.25 * dist(from, to));
    if !leg_ok(&s[..=i], a, apex) || !leg_ok(&s[i..], apex, b) { return None; }
    let (u, v) = ([a[0] - apex[0], a[1] - apex[1]], [b[0] - apex[0], b[1] - apex[1]]);
    let cos = (u[0] * v[0] + u[1] * v[1]) / (l1 * l2);
    let deg = cos.clamp(-1.0, 1.0).acos().to_degrees();
    (SPREAD.0..=SPREAD.1).contains(&deg).then_some((a, apex, b))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wire(strokes: &[&[P]]) -> Vec<f32> {
        let mut out = Vec::new();
        for (k, s) in strokes.iter().enumerate() {
            if k > 0 { out.extend([f32::NAN; 3]); }
            for (i, p) in s.iter().enumerate() { out.extend([p[0], p[1], i as f32 * 8.0]); }
        }
        out
    }

    fn line(a: P, b: P, n: usize) -> Vec<P> { (0..=n).map(|i| { let t = i as f32 / n as f32; [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] }).collect() }

    #[test]
    fn a_shaft_and_a_v_at_its_end_are_an_arrow() {
        let shaft = line([0.0, 0.0], [200.0, 3.0], 20);
        let mut head = line([185.0, -12.0], [201.0, 2.0], 6);
        head.extend(line([201.0, 2.0], [184.0, 16.0], 6).into_iter().skip(1));
        let w = of_two(&wire(&[&shaft, &head])).expect("an arrow");
        assert_eq!(w[..5], [5.0, 0.0, 0.0, 1.0, 2.0]);
        assert!((w[5] - 0.0).abs() < 1e-3 && (w[7] - 201.0).abs() < 1e-3, "tail at the start, tip at the V's point: {w:?}");
    }

    #[test]
    fn the_head_at_the_start_turns_the_arrow_round() {
        let shaft = line([0.0, 0.0], [0.0, 150.0], 15);
        let mut head = line([-10.0, 14.0], [0.0, -1.0], 5);
        head.extend(line([0.0, -1.0], [11.0, 13.0], 5).into_iter().skip(1));
        let w = of_two(&wire(&[&shaft, &head])).expect("an arrow");
        assert!((w[6] - 150.0).abs() < 1e-3 && (w[8] + 1.0).abs() < 1e-3, "{w:?}");
    }

    #[test]
    fn a_curve_a_far_v_or_a_v_pointing_away_is_not_an_arrow() {
        let curve: Vec<P> = (0..=20).map(|i| { let t = i as f32 / 20.0; [200.0 * t, 60.0 * (t * std::f32::consts::PI).sin()] }).collect();
        let mut head = line([185.0, -12.0], [201.0, 0.0], 6);
        head.extend(line([201.0, 0.0], [184.0, 12.0], 6).into_iter().skip(1));
        assert!(of_two(&wire(&[&curve, &head])).is_none(), "a curved shaft");
        let shaft = line([0.0, 0.0], [200.0, 0.0], 20);
        let mut far = line([85.0, -12.0], [100.0, 40.0], 6);
        far.extend(line([100.0, 40.0], [84.0, 52.0], 6).into_iter().skip(1));
        assert!(of_two(&wire(&[&shaft, &far])).is_none(), "a V far from the ends");
        let mut away = line([215.0, -12.0], [200.0, 0.0], 6);
        away.extend(line([200.0, 0.0], [216.0, 12.0], 6).into_iter().skip(1));
        assert!(of_two(&wire(&[&shaft, &away])).is_none(), "barbs pointing away from the tail");
        assert!(of_two(&wire(&[&shaft])).is_none(), "one stroke");
    }
}
