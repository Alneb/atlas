//! Drawing the icons (src/icons.rs) with egui's painter: the SVG paths read into strokes.
use crate::icons::{prims, Icon, Prim};
#[cfg(test)]
use crate::icons::{svg, PAGE};
use egui::{pos2, vec2, Color32, Painter, Pos2, Rect, Shape, Stroke};

/// Draws `icon` in the square `rect`.
pub fn paint(painter: &Painter, rect: Rect, icon: Icon, color: Color32) {
    let k = rect.width() / 24.0;
    let at = |p: Pos2| rect.min + vec2(p.x, p.y) * k;
    let stroke = Stroke::new((1.75 * k).max(1.15), color); // thinner than that, small icons fade
    for prim in prims(icon) {
        let lines = match prim {
            Prim::Path(d) => path(d),
            Prim::Circle(cx, cy, r) => vec![(arc_points(pos2(*cx, *cy), *r, 0.0, std::f32::consts::TAU), true)],
            Prim::Rect(x, y, w, h, r) => vec![(rounded(*x, *y, *w, *h, *r), true)],
        };
        for (pts, closed) in lines {
            let pts: Vec<Pos2> = pts.into_iter().map(at).collect();
            painter.add(if closed { Shape::closed_line(pts, stroke) } else { Shape::line(pts, stroke) });
        }
    }
}

fn arc_points(c: Pos2, r: f32, from: f32, sweep: f32) -> Vec<Pos2> {
    let n = ((sweep.abs() / std::f32::consts::TAU) * 32.0).ceil().max(2.0) as usize;
    (0..=n).map(|i| from + sweep * i as f32 / n as f32).map(|a| c + vec2(a.cos(), a.sin()) * r).collect()
}

fn rounded(x: f32, y: f32, w: f32, h: f32, r: f32) -> Vec<Pos2> {
    use std::f32::consts::FRAC_PI_2 as Q;
    let mut out = vec![];
    for (c, from) in [(pos2(x + w - r, y + r), -Q), (pos2(x + w - r, y + h - r), 0.0), (pos2(x + r, y + h - r), Q), (pos2(x + r, y + r), 2.0 * Q)] {
        out.extend(arc_points(c, r, from, Q));
    }
    out
}

/// An SVG path's subpaths as polylines (arcs flattened); `true` when the subpath is closed.
fn path(d: &str) -> Vec<(Vec<Pos2>, bool)> {
    let mut toks = Tokens { s: d.as_bytes(), i: 0 };
    let (mut out, mut cur, mut at, mut start) = (vec![], Vec::<Pos2>::new(), Pos2::ZERO, Pos2::ZERO);
    let mut cmd = b'M';
    let flush = |cur: &mut Vec<Pos2>, out: &mut Vec<(Vec<Pos2>, bool)>, closed: bool| {
        if cur.len() > 1 {
            out.push((std::mem::take(cur), closed));
        }
        cur.clear();
    };
    while let Some(c) = toks.command() {
        if let Some(c) = c {
            cmd = c;
        }
        let rel = cmd.is_ascii_lowercase();
        let base = if rel { at.to_vec2() } else { vec2(0.0, 0.0) };
        match cmd.to_ascii_uppercase() {
            b'M' => {
                flush(&mut cur, &mut out, false);
                at = pos2(toks.num(), toks.num()) + base;
                start = at;
                cur.push(at);
                cmd = if rel { b'l' } else { b'L' }; // further pairs are lines
                continue;
            }
            b'L' => at = pos2(toks.num(), toks.num()) + base,
            b'H' => at.x = toks.num() + base.x,
            b'V' => at.y = toks.num() + base.y,
            b'A' => {
                let (rx, ry, rot, large, sweep) = (toks.num(), toks.num(), toks.num(), toks.flag(), toks.flag());
                let to = pos2(toks.num(), toks.num()) + base;
                cur.extend(arc(at, to, rx, ry, rot, large, sweep).into_iter().skip(1));
                at = to;
                continue;
            }
            b'Z' => {
                flush(&mut cur, &mut out, true);
                at = start;
                cur.push(at);
                continue;
            }
            _ => break, // a command these icons do not use
        }
        cur.push(at);
    }
    flush(&mut cur, &mut out, false);
    out
}

/// An elliptical arc from `a` to `b` (SVG's endpoint form → centre form, spec F.6.5), as points.
fn arc(a: Pos2, b: Pos2, rx: f32, ry: f32, rot_deg: f32, large: bool, sweep: bool) -> Vec<Pos2> {
    if rx == 0.0 || ry == 0.0 || a == b {
        return vec![a, b];
    }
    let (s, c) = rot_deg.to_radians().sin_cos();
    let (dx, dy) = ((a.x - b.x) / 2.0, (a.y - b.y) / 2.0);
    let (x1, y1) = (c * dx + s * dy, -s * dx + c * dy);
    let (mut rx, mut ry) = (rx.abs(), ry.abs());
    let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if lambda > 1.0 {
        rx *= lambda.sqrt();
        ry *= lambda.sqrt();
    }
    let num = (rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1).max(0.0);
    let mut k = (num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)).sqrt();
    if large == sweep {
        k = -k;
    }
    let (cx1, cy1) = (k * rx * y1 / ry, -k * ry * x1 / rx);
    let centre = pos2(c * cx1 - s * cy1 + (a.x + b.x) / 2.0, s * cx1 + c * cy1 + (a.y + b.y) / 2.0);
    let angle = |ux: f32, uy: f32| uy.atan2(ux);
    let from = angle((x1 - cx1) / rx, (y1 - cy1) / ry);
    let mut delta = angle((-x1 - cx1) / rx, (-y1 - cy1) / ry) - from;
    if sweep && delta < 0.0 {
        delta += std::f32::consts::TAU;
    } else if !sweep && delta > 0.0 {
        delta -= std::f32::consts::TAU;
    }
    let n = ((delta.abs() / std::f32::consts::TAU) * 32.0).ceil().max(2.0) as usize;
    (0..=n)
        .map(|i| from + delta * i as f32 / n as f32)
        .map(|t| {
            let (x, y) = (rx * t.cos(), ry * t.sin());
            pos2(c * x - s * y + centre.x, s * x + c * y + centre.y)
        })
        .collect()
}

struct Tokens<'a> {
    s: &'a [u8],
    i: usize,
}

impl Tokens<'_> {
    fn skip(&mut self) {
        while self.i < self.s.len() && (self.s[self.i] == b' ' || self.s[self.i] == b',') {
            self.i += 1;
        }
    }
    /// Some(Some(c)): a command letter; Some(None): more numbers for the last one; None: the end.
    fn command(&mut self) -> Option<Option<u8>> {
        self.skip();
        let c = *self.s.get(self.i)?;
        if c.is_ascii_alphabetic() {
            self.i += 1;
            Some(Some(c))
        } else {
            Some(None)
        }
    }
    fn num(&mut self) -> f32 {
        self.skip();
        let start = self.i;
        let (mut dot, mut digits) = (false, false);
        if matches!(self.s.get(self.i), Some(b'-' | b'+')) {
            self.i += 1;
        }
        while let Some(&c) = self.s.get(self.i) {
            match c {
                b'0'..=b'9' => digits = true,
                b'.' if !dot => dot = true,
                _ => break,
            }
            self.i += 1;
        }
        if !digits {
            self.i = self.s.len(); // malformed: stop reading this path
            return 0.0;
        }
        std::str::from_utf8(&self.s[start..self.i]).ok().and_then(|t| t.parse().ok()).unwrap_or(0.0)
    }
    /// An arc flag: one character, possibly written with no separator ("0 01").
    fn flag(&mut self) -> bool {
        self.skip();
        let c = self.s.get(self.i).copied();
        self.i += 1;
        c == Some(b'1')
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_are_read_with_relative_moves_arcs_and_closing() {
        let lines = path("M4 9h16M4 15h16M10 3 8 21M16 3l-2 18");
        assert_eq!(lines.len(), 4, "four strokes of the hash");
        assert_eq!(lines[2].0, vec![pos2(10.0, 3.0), pos2(8.0, 21.0)], "a pair after M is a line");
        assert_eq!(lines[3].0[1], pos2(14.0, 21.0), "relative line");
        let page = path(PAGE);
        assert!(page[0].1, "z closes the page");
        assert_eq!(page[0].0[0], pos2(14.0, 3.0));
        assert_eq!(*page[0].0.last().unwrap(), pos2(19.0, 8.0), "the closing stroke is the shape's, not a point");
        // an arc of a quarter circle ends exactly at its end point
        let a = path("M19 5.5v6a3 3 0 0 1-3 3H5.5");
        let corner = a[0].0.iter().position(|p| (*p - pos2(16.0, 14.5)).length() < 0.01);
        assert!(corner.is_some(), "the arc ends at (16, 14.5)");
        assert!(a[0].0.len() > 6, "the arc is flattened into several points");
        // every icon reads to at least one stroke, all inside the 24-unit square
        for icon in Icon::ALL {
            for d in svg(icon) {
                let l = path(&d);
                assert!(!l.is_empty(), "{icon:?}");
                assert!(l.iter().flat_map(|(p, _)| p).all(|p| (-0.01..=24.01).contains(&p.x) && (-0.01..=24.01).contains(&p.y)), "{icon:?} stays in its square: {d}");
            }
        }
    }
}
