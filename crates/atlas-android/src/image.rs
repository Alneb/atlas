//! Pictures Android cannot decode itself, for the native plugins (docs/refactor/REFACTOR-native-plugins.md): JPEG XL,
//! which manga sources serve more and more and no Android decoder reads. `jxl-oxide` is pure Rust, so the phone's
//! build needs no C. The answer is what `Bitmap.createBitmap(int[], w, h, ARGB_8888)` takes: packed ARGB.
use anyhow::Result;

/// A JPEG XL's first frame as (width, height, ARGB pixels), in sRGB: the core's decoder (its thumbnails use it too).
pub fn decode_jxl(bytes: &[u8]) -> Result<(u32, u32, Vec<i32>)> {
    let img = atlas_core::thumbs::decode_jxl(bytes)?;
    let px = img.pixels().map(|p| { let [r, g, b, a] = p.0.map(i32::from); (a << 24) | (r << 16) | (g << 8) | b }).collect();
    Ok((img.width(), img.height(), px))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_jpeg_xl_becomes_argb_pixels() {
        // 3×2, white, a red pixel at (0, 0) and a blue one at (2, 1) (made with ImageMagick, lossless)
        let (w, h, px) = decode_jxl(include_bytes!("../tests/fixtures/tiny.jxl")).unwrap();
        assert_eq!((w, h), (3, 2));
        assert_eq!(px[0] as u32, 0xffff0000);
        assert_eq!(px[1] as u32, 0xffffffff);
        assert_eq!(px[5] as u32, 0xff0000ff);
    }

    #[test]
    fn not_a_jpeg_xl_says_so() {
        assert!(decode_jxl(b"\x89PNG not this").is_err());
    }
}
