//! AVIF stills decoded in pure Rust: the container by `avif-parse`, the AV1 by `rav1d` (dav1d's Rust port, through its
//! C-shaped API). Android's own decoders refuse common manga AVIFs (pages and covers stayed blank on the phone) and the
//! core had no decoder at all (thumbs.rs passed AVIF through for a browser to decode). Used by thumbs.rs and, through
//! atlas-android's `image.rs`, by the phone's native screens.
use crate::error::{Error, Result};
use rav1d::include::dav1d::data::Dav1dData;
use rav1d::include::dav1d::dav1d::{Dav1dContext, Dav1dSettings};
use rav1d::include::dav1d::headers::{DAV1D_PIXEL_LAYOUT_I400, DAV1D_PIXEL_LAYOUT_I420, DAV1D_PIXEL_LAYOUT_I422};
use rav1d::include::dav1d::picture::Dav1dPicture;
use rav1d::src::lib::{dav1d_close, dav1d_data_create, dav1d_default_settings, dav1d_get_picture, dav1d_open, dav1d_picture_unref, dav1d_send_data};
use std::mem::MaybeUninit;
use std::ptr::NonNull;

/// dav1d's "try again" (-EAGAIN): more data wanted, or a picture not out yet.
const AGAIN: i32 = -11;

/// An AVIF by its first bytes: an `ftyp` box whose brand is `avif` (a still; `avis`, a sequence, is not decoded).
pub fn is_avif(b: &[u8]) -> bool {
    b.get(4..8) == Some(b"ftyp") && b.get(8..12) == Some(b"avif")
}

/// One AV1 picture as 8-bit planes, with what is needed to read them.
struct Planes {
    w: usize,
    h: usize,
    layout: u32,
    y: Vec<u8>,
    u: Vec<u8>,
    v: Vec<u8>,
    /// the chroma planes' width (0: monochrome)
    cw: usize,
    full_range: bool,
    /// the matrix coefficients (H.273): 0 identity (GBR), 1 BT.709, 9/10 BT.2020, else BT.601
    mtrx: u32,
}

/// The decoder, closed whatever happens.
struct Decoder(Option<Dav1dContext>);
impl Drop for Decoder {
    fn drop(&mut self) {
        // SAFETY: the context came from dav1d_open and is closed once, here.
        unsafe { dav1d_close(NonNull::new(&mut self.0)) }
    }
}

fn fail(what: &str) -> Error {
    Error::BadRequest(format!("an AVIF picture: {what}"))
}

/// The AV1 still in `obu` decoded to 8-bit planes; a frame of more than `max_pixels` is refused by the decoder.
fn decode_av1(obu: &[u8], max_pixels: u32) -> Result<Planes> {
    // SAFETY: rav1d's C-shaped API used as dav1d documents it: settings filled by dav1d_default_settings, a context
    // opened once and closed by `Decoder`, data made by dav1d_data_create and handed over to dav1d_send_data, a
    // picture read while referenced and then unreferenced.
    unsafe {
        let mut s = MaybeUninit::<Dav1dSettings>::uninit();
        dav1d_default_settings(NonNull::new(s.as_mut_ptr()).expect("not null"));
        let mut s = s.assume_init();
        s.n_threads = 1; // one picture: frame threads would only cost memory
        s.max_frame_delay = 1;
        s.frame_size_limit = max_pixels;
        let mut dec = Decoder(None);
        if dav1d_open(NonNull::new(&mut dec.0), NonNull::new(&mut s)).0 != 0 {
            return Err(fail("the AV1 decoder did not open"));
        }
        let mut data: Dav1dData = Default::default();
        let buf = dav1d_data_create(NonNull::new(&mut data), obu.len());
        if buf.is_null() {
            return Err(fail("no memory for its data"));
        }
        std::ptr::copy_nonoverlapping(obu.as_ptr(), buf, obu.len());
        let mut pic: Dav1dPicture = Default::default();
        for _ in 0..64 {
            if data.sz > 0 {
                let r = dav1d_send_data(dec.0, NonNull::new(&mut data)).0;
                if r != 0 && r != AGAIN {
                    return Err(fail("the AV1 data was refused"));
                }
            }
            match dav1d_get_picture(dec.0, NonNull::new(&mut pic)).0 {
                0 => {
                    let out = planes(&pic);
                    dav1d_picture_unref(NonNull::new(&mut pic));
                    return out;
                }
                AGAIN => continue,
                _ => break,
            }
        }
        Err(fail("the AV1 picture did not decode"))
    }
}

/// The picture's planes copied out at 8 bits (10- and 12-bit samples shifted down).
///
/// # Safety
/// `p` is a picture dav1d_get_picture returned and that is still referenced.
unsafe fn planes(p: &Dav1dPicture) -> Result<Planes> {
    let (w, h, bpc, layout) = (p.p.w as usize, p.p.h as usize, p.p.bpc as usize, p.p.layout);
    // SAFETY: a returned picture carries its sequence header.
    let seq = unsafe { p.seq_hdr.ok_or_else(|| fail("no sequence header"))?.as_ref() };
    let (cw, ch) = match layout {
        l if l == DAV1D_PIXEL_LAYOUT_I400 => (0, 0),
        l if l == DAV1D_PIXEL_LAYOUT_I420 => (w.div_ceil(2), h.div_ceil(2)),
        l if l == DAV1D_PIXEL_LAYOUT_I422 => (w.div_ceil(2), h),
        _ => (w, h),
    };
    let read = |plane: usize, pw: usize, ph: usize, stride: isize| -> Vec<u8> {
        let Some(base) = p.data[plane].map(|d| d.as_ptr() as *const u8) else { return vec![0; pw * ph] };
        let mut v = Vec::with_capacity(pw * ph);
        for row in 0..ph {
            // SAFETY: the plane holds `ph` rows of `stride` bytes, each with `pw` samples of `bpc` bits.
            unsafe {
                let line = base.offset(row as isize * stride);
                for x in 0..pw {
                    v.push(if bpc > 8 { (*(line as *const u16).add(x) >> (bpc - 8)).min(255) as u8 } else { *line.add(x) });
                }
            }
        }
        v
    };
    let y = read(0, w, h, p.stride[0]);
    let (u, v) = if cw > 0 { (read(1, cw, ch, p.stride[1]), read(2, cw, ch, p.stride[1])) } else { (vec![], vec![]) };
    Ok(Planes { w, h, layout, y, u, v, cw, full_range: seq.color_range != 0, mtrx: seq.mtrx })
}

/// An AVIF still as RGBA, its alpha too; no more than `max_pixels` (a picture from a manga source is untrusted).
pub fn decode_avif(bytes: &[u8], max_pixels: u64) -> Result<image::RgbaImage> {
    // avif-parse asserts on some malformed files instead of answering an error: a bad file from a source must not
    // take the request (or the phone's decoding thread) down with it
    std::panic::catch_unwind(|| decode(bytes, max_pixels)).unwrap_or_else(|_| Err(fail("a malformed file")))
}

fn decode(bytes: &[u8], max_pixels: u64) -> Result<image::RgbaImage> {
    let avif = avif_parse::read_avif(&mut std::io::Cursor::new(bytes)).map_err(|e| Error::BadRequest(format!("not an AVIF picture: {e}")))?;
    let max = max_pixels.min(u32::MAX as u64) as u32;
    let c = decode_av1(&avif.primary_item, max)?;
    let alpha = avif.alpha_item.as_ref().map(|a| decode_av1(a, max)).transpose()?;
    let (w, h) = (c.w, c.h);
    // Y'CbCr → R'G'B' by the stream's matrix
    let (kr, kb) = match c.mtrx {
        1 => (0.2126, 0.0722),
        9 | 10 => (0.2627, 0.0593),
        _ => (0.299, 0.114),
    };
    let kg = 1.0 - kr - kb;
    let luma = |v: u8, full: bool| if full { v as f32 } else { (v as f32 - 16.0) * 255.0 / 219.0 };
    let chroma = |v: u8| if c.full_range { v as f32 - 128.0 } else { (v as f32 - 128.0) * 255.0 / 224.0 };
    let (sx, sy) = match c.layout {
        l if l == DAV1D_PIXEL_LAYOUT_I420 => (1, 1),
        l if l == DAV1D_PIXEL_LAYOUT_I422 => (1, 0),
        _ => (0, 0),
    };
    let px = |v: f32| v.round().clamp(0.0, 255.0) as u8;
    let mut out = image::RgbaImage::new(w as u32, h as u32);
    for yy in 0..h {
        for xx in 0..w {
            let yv = luma(c.y[yy * w + xx], c.full_range);
            let rgb = if c.layout == DAV1D_PIXEL_LAYOUT_I400 {
                [yv; 3]
            } else {
                let i = (yy >> sy) * c.cw + (xx >> sx);
                if c.mtrx == 0 {
                    [c.v[i] as f32, c.y[yy * w + xx] as f32, c.u[i] as f32] // identity: G, B, R in Y, U, V
                } else {
                    let (cb, cr) = (chroma(c.u[i]), chroma(c.v[i]));
                    let (r, b) = (yv + 2.0 * (1.0 - kr) * cr, yv + 2.0 * (1.0 - kb) * cb);
                    [r, (yv - kr * r - kb * b) / kg, b]
                }
            };
            let a = alpha.as_ref().map_or(255.0, |a| luma(a.y[yy.min(a.h - 1) * a.w + xx.min(a.w - 1)], a.full_range));
            let k = if avif.premultiplied_alpha && a > 0.0 { 255.0 / a } else { 1.0 };
            out.put_pixel(xx as u32, yy as u32, image::Rgba([px(rgb[0] * k), px(rgb[1] * k), px(rgb[2] * k), px(a)]));
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    #[test]
    fn an_avif_decodes_with_its_colours_and_alpha() {
        // 8×4 (ravif, quality 100): left half red, right half blue, the bottom row half transparent
        let img = super::decode_avif(include_bytes!("../../atlas-android/tests/fixtures/tiny.avif"), 1 << 24).unwrap();
        assert_eq!((img.width(), img.height()), (8, 4));
        let near = |p: &image::Rgba<u8>, want: [u8; 4]| p.0.iter().zip(want).all(|(a, b)| a.abs_diff(b) <= 12);
        assert!(near(img.get_pixel(1, 1), [255, 0, 0, 255]), "{:?}", img.get_pixel(1, 1));
        assert!(near(img.get_pixel(6, 1), [0, 0, 255, 255]), "{:?}", img.get_pixel(6, 1));
        assert!(img.get_pixel(1, 3)[3].abs_diff(128) <= 12, "{:?}", img.get_pixel(1, 3));
    }

    #[test]
    fn a_broken_avif_is_an_error_not_a_panic() {
        assert!(super::decode_avif(b"\0\0\0\x1cftypavif\0\0\0\0avifmif1miaf not decoded here", 1 << 24).is_err());
        assert!(super::is_avif(b"\0\0\0\x1cftypavif"));
        assert!(!super::is_avif(b"\0\0\0\x1cftypavis"));
    }
}
