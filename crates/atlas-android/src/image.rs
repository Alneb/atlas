//! Pictures Android cannot decode itself, for the native plugins (docs/refactor/REFACTOR-native-plugins.md): JPEG XL,
//! which no Android decoder reads, and AVIF, which Android's decoders refuse in forms manga sources serve (pages and
//! covers stayed blank). Both are the core's pure-Rust decoders, so the phone's build needs no C. The answer is what
//! `Bitmap.createBitmap(int[], w, h, ARGB_8888)` takes: packed ARGB.
use anyhow::{bail, Result};

/// A JPEG XL's or an AVIF's picture as (width, height, ARGB pixels), in sRGB: the core's decoders (its thumbnails
/// use them too). Anything else is an error: Android's own decoders read it.
pub fn decode(bytes: &[u8]) -> Result<(u32, u32, Vec<i32>)> {
    decode_fit(bytes, u32::MAX, u32::MAX)
}

/// As `decode`, made smaller by a whole factor while it stays about the size it is shown at in `max_w` × `max_h` (a
/// 2142×3056 manga page for a 1080-wide screen comes over as 1071×1528): a quarter of the pixels to copy across JNI and into the Bitmap, which
/// Java then fits exactly. JPEG XL decodes on threads of its own made here, so they run at the caller's priority
/// (`decode_jxl_on`: the page being read is not decoded on the slow cores).
pub fn decode_fit(bytes: &[u8], max_w: u32, max_h: u32) -> Result<(u32, u32, Vec<i32>)> {
    let img = if atlas_core::thumbs::jxl_head(bytes) {
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
        atlas_core::thumbs::decode_jxl_on(bytes, Some(threads))?
    } else if atlas_core::avif::is_avif(bytes) {
        atlas_core::avif::decode_avif(bytes, atlas_core::thumbs::MAX_JXL_PIXELS)?
    } else {
        bail!("neither JPEG XL nor AVIF");
    };
    let k = factor(img.width(), img.height(), max_w, max_h);
    Ok(reduce(&img, k))
}

/// The largest whole factor that keeps the picture at least the size it is fitted to in `max_w` × `max_h` (fitting
/// scales by the tighter side's ratio, so the looser bound decides), up to 5 % under it: 2142 wide for a 1080 screen
/// comes over at 1071 and is shown 0.8 % larger, not at twice the pixels. 1: as it is.
fn factor(w: u32, h: u32, max_w: u32, max_h: u32) -> u32 {
    let ratio = |size: u32, max: u32| if max == 0 || max == u32::MAX { 0.0 } else { size as f64 / max as f64 };
    let k = ratio(w, max_w).max(ratio(h, max_h)) * 1.05;
    (k.floor() as u32).clamp(1, 16)
}

/// Packed ARGB, each `k` × `k` block averaged into one pixel (a box filter: what a fit loses anyway, and no aliasing).
fn reduce(img: &image::RgbaImage, k: u32) -> (u32, u32, Vec<i32>) {
    let pack = |[r, g, b, a]: [u32; 4]| ((a as i32) << 24) | ((r as i32) << 16) | ((g as i32) << 8) | b as i32;
    if k <= 1 {
        return (img.width(), img.height(), img.pixels().map(|p| pack(p.0.map(u32::from))).collect());
    }
    let (w, h) = (img.width() / k, img.height() / k);
    let n = k * k;
    let mut out = Vec::with_capacity(w as usize * h as usize);
    for y in 0..h {
        for x in 0..w {
            let mut sum = [0u32; 4];
            for dy in 0..k {
                for dx in 0..k {
                    let p = img.get_pixel(x * k + dx, y * k + dy).0;
                    for c in 0..4 {
                        sum[c] += p[c] as u32;
                    }
                }
            }
            out.push(pack(sum.map(|s| (s + n / 2) / n)));
        }
    }
    (w, h, out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_jpeg_xl_becomes_argb_pixels() {
        // 3×2, white, a red pixel at (0, 0) and a blue one at (2, 1) (made with ImageMagick, lossless)
        let (w, h, px) = decode(include_bytes!("../tests/fixtures/tiny.jxl")).unwrap();
        assert_eq!((w, h), (3, 2));
        assert_eq!(px[0] as u32, 0xffff0000);
        assert_eq!(px[1] as u32, 0xffffffff);
        assert_eq!(px[5] as u32, 0xff0000ff);
    }

    #[test]
    fn an_avif_becomes_argb_pixels() {
        // 8×4 (ravif, quality 100): left half red, right half blue
        let (w, h, px) = decode(include_bytes!("../tests/fixtures/tiny.avif")).unwrap();
        assert_eq!((w, h), (8, 4));
        assert_eq!((px[8] as u32) >> 24, 0xff);
        assert!((px[8] as u32 >> 16 & 0xff) > 240 && (px[8] as u32 & 0xff) < 15, "{:x}", px[8]);
    }

    #[test]
    fn a_page_comes_over_reduced_by_a_whole_factor_about_the_size_shown() {
        assert_eq!(factor(2142, 3056, 1080, 2400), 2, "fitted 1080 wide: 1071 is within 5 %");
        assert_eq!(factor(2000, 3056, 1080, 2400), 1, "1000 would be 7 % under 1080");
        assert_eq!(factor(2160, 3056, 1080, 1528), 2);
        assert_eq!(factor(4320, 6112, 1080, 1528), 4);
        assert_eq!(factor(2160, 30000, 1080, u32::MAX), 2, "fit width: only the width binds (webtoon)");
        assert_eq!(factor(1080, 12000, 1080, 2400), 5, "a webtoon strip fitted to the screen's height");
        assert_eq!(factor(800, 1200, 1080, 2400), 1, "smaller than the screen: as it is");
        assert_eq!(factor(3, 2, u32::MAX, u32::MAX), 1);
    }

    #[test]
    fn a_reduced_block_is_its_pixels_average() {
        let mut img = image::RgbaImage::new(4, 2);
        for (x, y, p) in img.enumerate_pixels_mut() {
            *p = image::Rgba(if x < 2 { [255, 0, 0, 255] } else if (x + y) % 2 == 0 { [0, 0, 255, 255] } else { [0, 0, 0, 255] });
        }
        let (w, h, px) = reduce(&img, 2);
        assert_eq!((w, h), (2, 1));
        assert_eq!(px[0] as u32, 0xffff0000);
        assert_eq!(px[1] as u32, 0xff000080, "half blue, half black: {:x}", px[1]);
    }

    #[test]
    fn anything_else_says_so() {
        assert!(decode(b"\x89PNG not this").is_err());
    }
}
