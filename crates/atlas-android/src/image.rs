//! Pictures Android cannot decode itself, for the native plugins (docs/refactor/REFACTOR-native-plugins.md): JPEG XL,
//! which no Android decoder reads, and AVIF, which Android's decoders refuse in forms manga sources serve (pages and
//! covers stayed blank). Both are the core's pure-Rust decoders, so the phone's build needs no C. The answer is what
//! `Bitmap.createBitmap(int[], w, h, ARGB_8888)` takes: packed ARGB.
use anyhow::{bail, Result};

/// A JPEG XL's or an AVIF's picture as (width, height, ARGB pixels), in sRGB: the core's decoders (its thumbnails
/// use them too). Anything else is an error: Android's own decoders read it.
pub fn decode(bytes: &[u8]) -> Result<(u32, u32, Vec<i32>)> {
    let img = if atlas_core::thumbs::jxl_head(bytes) {
        atlas_core::thumbs::decode_jxl(bytes)?
    } else if atlas_core::avif::is_avif(bytes) {
        atlas_core::avif::decode_avif(bytes, atlas_core::thumbs::MAX_JXL_PIXELS)?
    } else {
        bail!("neither JPEG XL nor AVIF");
    };
    let px = img.pixels().map(|p| { let [r, g, b, a] = p.0.map(i32::from); (a << 24) | (r << 16) | (g << 8) | b }).collect();
    Ok((img.width(), img.height(), px))
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
    fn anything_else_says_so() {
        assert!(decode(b"\x89PNG not this").is_err());
    }
}
