//! egui's triangles painted on the CPU, into the plain pixel buffer the window shows (softbuffer).
//! The box is small and redrawn only on a key, so no GPU is needed — and not starting one (the
//! driver, a GL context, shaders) is most of what made the window late. The maths is egui_glow's:
//! colours and texels premultiplied in gamma space, blended `src + dst·(1 − src.a)`.
use egui::epaint::{ClippedPrimitive, ImageData, ImageDelta, Primitive, Vertex};
use egui::{Color32, TextureId, TexturesDelta};
use std::collections::HashMap;

struct Texture {
    w: usize,
    h: usize,
    px: Vec<Color32>,
}

#[derive(Default)]
pub struct Canvas {
    textures: HashMap<TextureId, Texture>,
}

impl Canvas {
    /// New and changed textures (the font atlas, mostly), before a paint.
    pub fn update(&mut self, delta: &TexturesDelta) {
        for (id, d) in &delta.set {
            self.set(*id, d);
        }
    }

    /// Textures egui is done with, after a paint.
    pub fn free(&mut self, delta: &TexturesDelta) {
        for id in &delta.free {
            self.textures.remove(id);
        }
    }

    fn set(&mut self, id: TextureId, d: &ImageDelta) {
        let (w, h, px): (usize, usize, Vec<Color32>) = match &d.image {
            ImageData::Color(c) => (c.size[0], c.size[1], c.pixels.clone()),
            ImageData::Font(f) => (f.size[0], f.size[1], f.srgba_pixels(None).collect()), // as egui_glow uploads it
        };
        match d.pos {
            None => drop(self.textures.insert(id, Texture { w, h, px })),
            Some([x0, y0]) => {
                let Some(t) = self.textures.get_mut(&id) else { return };
                for y in 0..h {
                    let row = (y0 + y) * t.w + x0;
                    if let Some(dst) = t.px.get_mut(row..row + w) {
                        dst.copy_from_slice(&px[y * w..(y + 1) * w]);
                    }
                }
            }
        }
    }

    /// Paints `prims` (positions in points) into `buf`: `w`×`h` pixels, premultiplied ARGB, cleared to `clear`
    /// first (transparent on Wayland, where the card floats; the alpha byte is ignored on X11).
    pub fn paint(&self, buf: &mut [u32], w: usize, h: usize, ppp: f32, clear: Color32, prims: &[ClippedPrimitive]) {
        buf.fill(pack(clear.r(), clear.g(), clear.b(), clear.a()));
        for p in prims {
            let Primitive::Mesh(mesh) = &p.primitive else { continue };
            let Some(tex) = self.textures.get(&mesh.texture_id) else { continue };
            let clip = [
                (p.clip_rect.min.x * ppp).round().clamp(0.0, w as f32) as i32,
                (p.clip_rect.min.y * ppp).round().clamp(0.0, h as f32) as i32,
                (p.clip_rect.max.x * ppp).round().clamp(0.0, w as f32) as i32,
                (p.clip_rect.max.y * ppp).round().clamp(0.0, h as f32) as i32,
            ];
            for t in mesh.indices.chunks_exact(3) {
                let v = [&mesh.vertices[t[0] as usize], &mesh.vertices[t[1] as usize], &mesh.vertices[t[2] as usize]];
                triangle(buf, w, clip, ppp, v, tex);
            }
        }
    }
}

const fn pack(r: u8, g: u8, b: u8, a: u8) -> u32 {
    ((a as u32) << 24) | ((r as u32) << 16) | ((g as u32) << 8) | b as u32
}

/// Twice the signed area of (a, b, p): which side of the edge a→b the point p is on.
fn edge(a: [f32; 2], b: [f32; 2], p: [f32; 2]) -> f32 {
    (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
}

/// Pixels exactly on an edge belong to one of the two triangles sharing it (the top-left rule), so a
/// translucent rectangle — two triangles — is not darker along its diagonal.
fn owns(w: f32, a: [f32; 2], b: [f32; 2]) -> bool {
    w > 0.0 || (w == 0.0 && (b[1] < a[1] || (b[1] == a[1] && b[0] > a[0])))
}

fn triangle(buf: &mut [u32], w: usize, clip: [i32; 4], ppp: f32, v: [&Vertex; 3], tex: &Texture) {
    let mut p = v.map(|v| [v.pos.x * ppp, v.pos.y * ppp]);
    let mut v = v;
    let mut area = edge(p[0], p[1], p[2]);
    if area.abs() < 1e-6 {
        return;
    }
    if area < 0.0 {
        p.swap(1, 2);
        v.swap(1, 2);
        area = -area;
    }
    let x0 = (p.iter().map(|q| q[0]).fold(f32::MAX, f32::min).floor() as i32).max(clip[0]);
    let x1 = (p.iter().map(|q| q[0]).fold(f32::MIN, f32::max).ceil() as i32).min(clip[2]);
    let y0 = (p.iter().map(|q| q[1]).fold(f32::MAX, f32::min).floor() as i32).max(clip[1]);
    let y1 = (p.iter().map(|q| q[1]).fold(f32::MIN, f32::max).ceil() as i32).min(clip[3]);
    let col = v.map(|v| v.color.to_array().map(f32::from));
    // one texel for the whole triangle when its three corners sample the same place (every plain shape),
    // and then one colour too when the corners share it (a filled shape's inside)
    let flat = (v[0].uv == v[1].uv && v[1].uv == v[2].uv).then(|| sample(tex, v[0].uv.x, v[0].uv.y));
    let solid = flat.filter(|_| v[0].color == v[1].color && v[1].color == v[2].color).map(|t| std::array::from_fn::<f32, 4, _>(|k| col[0][k] * t[k] / 255.0));
    let fill = solid.map(Solid::new);
    let edges = [(p[1], p[2]), (p[2], p[0]), (p[0], p[1])];
    for y in y0..y1 {
        let cy = y as f32 + 0.5;
        // the pixels of this row the triangle can cover: each edge function is linear in x along the row, so
        // only that span is walked (egui fans long thin triangles across a shape: their boxes overlap a lot).
        // A (nearly) level edge does not bound it — extrapolated along the row its sign is not to be trusted.
        let (mut lo, mut hi, mut level) = (x0 as f32, x1 as f32, [None; 3]);
        for (k, (a, b)) in edges.into_iter().enumerate() {
            let slope = -(b[1] - a[1]); // d(edge)/dx
            let at0 = edge(a, b, [0.5, cy]); // at the row's first pixel centre
            if slope > 0.01 {
                lo = lo.max(-at0 / slope);
            } else if slope < -0.01 {
                hi = hi.min(-at0 / slope);
            } else {
                level[k] = Some((a, b));
            }
        }
        // two pixels of margin either side, decided by the exact test; between those margins (a solid fill whose
        // level edges are well inside at both ends) every pixel is inside: no test, an integer blend
        let (sx, ex) = ((lo.floor() as i32 - 2).max(x0), (hi.ceil() as i32 + 2).min(x1));
        let (ix, jx) = ((lo.ceil() as i32 + 2).max(sx), (hi.floor() as i32 - 2).min(ex));
        let inside = |x: i32| level.iter().flatten().all(|&(a, b)| edge(a, b, [x as f32 + 0.5, cy]) > 1.0);
        let fast = fill.as_ref().filter(|_| ix < jx && inside(ix) && inside(jx - 1));
        let row = y as usize * w;
        for x in sx..ex {
            let i = row + x as usize;
            if let Some(f) = fast.filter(|_| (ix..jx).contains(&x)) {
                buf[i] = f.over(buf[i]);
                continue;
            }
            let c = [x as f32 + 0.5, cy];
            let (w0, w1, w2) = (edge(p[1], p[2], c), edge(p[2], p[0], c), edge(p[0], p[1], c));
            if !(owns(w0, p[1], p[2]) && owns(w1, p[2], p[0]) && owns(w2, p[0], p[1])) {
                continue;
            }
            let s = solid.unwrap_or_else(|| {
                let (b0, b1, b2) = (w0 / area, w1 / area, w2 / area);
                let t = flat.unwrap_or_else(|| sample(tex, b0 * v[0].uv.x + b1 * v[1].uv.x + b2 * v[2].uv.x, b0 * v[0].uv.y + b1 * v[1].uv.y + b2 * v[2].uv.y));
                std::array::from_fn(|k| (b0 * col[0][k] + b1 * col[1][k] + b2 * col[2][k]) * t[k] / 255.0)
            });
            buf[i] = blend(s, buf[i]);
        }
    }
}

/// One colour laid over many pixels: premultiplied, in integers.
struct Solid {
    src: u32,
    /// 255 − alpha: how much of what is under it stays
    keep: u32,
}

impl Solid {
    fn new(s: [f32; 4]) -> Self {
        let c = s.map(|v| v.round().clamp(0.0, 255.0) as u8);
        Self { src: pack(c[0], c[1], c[2], c[3]), keep: 255 - u32::from(c[3]) }
    }

    #[inline]
    fn over(&self, d: u32) -> u32 {
        if self.keep == 0 {
            return self.src;
        }
        // x/255 rounded, without a division
        let div = |x: u32| (x + 128 + ((x + 128) >> 8)) >> 8;
        let ch = |shift: u32| (((self.src >> shift) & 0xff) + div(((d >> shift) & 0xff) * self.keep)).min(255) << shift;
        ch(24) | ch(16) | ch(8) | ch(0)
    }
}

/// `src + dst·(1 − src.a)`, premultiplied; `s` in 0–255.
#[inline]
fn blend(s: [f32; 4], d: u32) -> u32 {
    if s[3] >= 255.0 {
        return pack(s[0].round() as u8, s[1].round() as u8, s[2].round() as u8, 255); // opaque: what is under it does not count
    }
    let keep = 1.0 - s[3] / 255.0;
    let mix = |src: f32, shift: u32| (src + ((d >> shift) & 0xff) as f32 * keep).round().clamp(0.0, 255.0) as u8;
    pack(mix(s[0], 16), mix(s[1], 8), mix(s[2], 0), mix(s[3], 24))
}

/// The texel at (u, v), bilinear (egui's textures are linear-filtered), premultiplied, 0–255.
fn sample(t: &Texture, u: f32, v: f32) -> [f32; 4] {
    let (fx, fy) = (u * t.w as f32 - 0.5, v * t.h as f32 - 0.5);
    let (x0, y0) = (fx.floor(), fy.floor());
    let (ax, ay) = (fx - x0, fy - y0);
    let at = |x: f32, y: f32| {
        let (x, y) = ((x as i64).clamp(0, t.w as i64 - 1) as usize, (y as i64).clamp(0, t.h as i64 - 1) as usize);
        t.px[y * t.w + x].to_array().map(f32::from)
    };
    let (a, b, c, d) = (at(x0, y0), at(x0 + 1.0, y0), at(x0, y0 + 1.0), at(x0 + 1.0, y0 + 1.0));
    std::array::from_fn(|k| (a[k] * (1.0 - ax) + b[k] * ax) * (1.0 - ay) + (c[k] * (1.0 - ax) + d[k] * ax) * ay)
}

#[cfg(test)]
mod tests {
    use super::*;
    use egui::{pos2, vec2, Rect};

    /// A frame of `draw`, painted: the pixels as 0RGB.
    fn render(w: usize, h: usize, draw: impl FnMut(&egui::Context)) -> Vec<u32> {
        let ctx = egui::Context::default();
        let mut canvas = Canvas::default();
        let raw = egui::RawInput { screen_rect: Some(Rect::from_min_size(pos2(0.0, 0.0), vec2(w as f32, h as f32))), ..Default::default() };
        let out = ctx.run(raw, draw);
        canvas.update(&out.textures_delta);
        let prims = ctx.tessellate(out.shapes, out.pixels_per_point);
        let mut buf = vec![0; w * h];
        canvas.paint(&mut buf, w, h, out.pixels_per_point, Color32::TRANSPARENT, &prims);
        buf
    }

    #[test]
    fn a_translucent_rectangle_is_even_and_text_is_drawn() {
        let buf = render(64, 40, |ctx| {
            egui::CentralPanel::default().frame(egui::Frame::none()).show(ctx, |ui| {
                ui.painter().rect_filled(Rect::from_min_max(pos2(4.0, 4.0), pos2(36.0, 36.0)), 0.0, Color32::from_rgba_premultiplied(100, 0, 0, 100));
                ui.painter().text(pos2(40.0, 4.0), egui::Align2::LEFT_TOP, "A", egui::FontId::proportional(20.0), Color32::WHITE);
            });
        });
        let inside: Vec<u32> = (6..34).flat_map(|y| (6..34).map(move |x| (x, y))).map(|(x, y)| buf[y * 64 + x]).collect();
        assert!(inside.iter().all(|&p| p == inside[0]), "no seam along the diagonal: {:x?}", inside.iter().filter(|&&p| p != inside[0]).take(3).collect::<Vec<_>>());
        assert_eq!(((inside[0] >> 16) & 0xff, inside[0] >> 24), (100, 100), "premultiplied colour and its alpha, over nothing");
        assert_eq!(buf[2 * 64 + 2], 0, "outside: untouched, see-through");
        let glyph = (0..40).flat_map(|y| (40..64).map(move |x| (x, y))).filter(|&(x, y)| buf[y * 64 + x] & 0xff > 200).count();
        assert!(glyph > 20, "the letter has solid pixels: {glyph}");
    }
}
