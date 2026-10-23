//! Drawings kept small on disk. The rules of
//! every writer (the web's draw-compact.ts, the notepad's DrawingSize.java): JSON without indentation, pen points to
//! 0.1 px, pressures to 0.01, pictures at most 2000 px. Here, for the drawings already written (`atlas drawings`): the
//! core has no lossy WebP encoder, so pictures become lossless WebP (the 22.9 MB page's PDF pages: 11.8 MB of PNG →
//! 5.3 MB, nothing lost, transparency kept).
//! docs/design/DESIGN-drawing-size.md.
use crate::config::Config;
use crate::{walk, Result};
use base64::Engine;
use serde_json::Value;
use std::path::Path;

pub const MAX_SIDE: u32 = 2000;

fn round(v: &mut Value, k: f64) {
    if let Some(x) = v.as_f64() {
        if let Some(n) = serde_json::Number::from_f64((x * k).round() / k) {
            *v = Value::Number(n);
        }
    }
}

/// Pen points to 0.1 px and pressures to 0.01, in every element.
fn round_strokes(elements: &mut [Value]) {
    for e in elements {
        if let Some(pts) = e.get_mut("points").and_then(Value::as_array_mut) {
            for p in pts.iter_mut().filter_map(Value::as_array_mut) {
                p.iter_mut().for_each(|x| round(x, 10.0));
            }
        }
        if let Some(pr) = e.get_mut("pressures").and_then(Value::as_array_mut) {
            pr.iter_mut().for_each(|x| round(x, 100.0));
        }
    }
}

/// A picture's data URL at most MAX_SIDE px, as lossless WebP — or None when that is not smaller.
fn shrink_picture(url: &str) -> Option<String> {
    let (head, data) = url.split_once(',')?;
    if !(head.starts_with("data:image/png") || head.starts_with("data:image/jpeg") || head.starts_with("data:image/bmp")) || !head.ends_with(";base64") {
        return None;
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).ok()?;
    let mut img = image::load_from_memory(&bytes).ok()?;
    if img.width().max(img.height()) > MAX_SIDE {
        img = img.resize(MAX_SIDE, MAX_SIDE, image::imageops::FilterType::Lanczos3);
    }
    let rgba = img.to_rgba8();
    let mut out = Vec::new();
    image::codecs::webp::WebPEncoder::new_lossless(&mut out).encode(rgba.as_raw(), rgba.width(), rgba.height(), image::ExtendedColorType::Rgba8).ok()?;
    let new = format!("data:image/webp;base64,{}", base64::engine::general_purpose::STANDARD.encode(&out));
    (new.len() < url.len()).then_some(new)
}

/// The drawing's text made small, or None when it is no Excalidraw scene or is already as small.
pub fn compact(text: &str) -> Option<String> {
    let mut scene: Value = serde_json::from_str(text).ok()?;
    if scene.get("type").and_then(Value::as_str) != Some("excalidraw") {
        return None;
    }
    if let Some(els) = scene.get_mut("elements").and_then(Value::as_array_mut) {
        round_strokes(els);
    }
    if let Some(files) = scene.get_mut("files").and_then(Value::as_object_mut) {
        for f in files.values_mut() {
            let Some(url) = f.get("dataURL").and_then(Value::as_str) else { continue };
            if let Some(new) = shrink_picture(url) {
                f["mimeType"] = "image/webp".into();
                f["dataURL"] = new.into();
            }
        }
    }
    let out = serde_json::to_string(&scene).ok()?;
    (out.len() < text.len()).then_some(out)
}

/// What `compact_all` did (or would do): each drawing with its size before and after, and where the originals went.
pub struct Compacted {
    pub drawings: Vec<(String, u64, u64)>,
    pub snapshot: Option<String>,
}

/// Every `.excalidraw` of the vault made small. A dry run (`apply` false) says the sizes; applied, each original is
/// first copied to `.atlas/trash/<time>-drawings-before-compact/<its path>`.
pub fn compact_all(root: &Path, cfg: &Config, apply: bool) -> Result<Compacted> {
    let snap = format!(".atlas/trash/{}-drawings-before-compact", chrono::Local::now().format("%Y%m%d-%H%M%S"));
    let mut drawings = Vec::new();
    for (path, rel) in walk::files(root, cfg).filter(|(_, rel)| rel.ends_with(".excalidraw")) {
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        let Some(small) = compact(&text) else { continue };
        drawings.push((rel.clone(), text.len() as u64, small.len() as u64));
        if apply {
            crate::vault_write::copy(&path, &root.join(&snap).join(&rel))?;
            crate::vault_write::write(&path, small.as_bytes())?;
        }
    }
    let snapshot = (apply && !drawings.is_empty()).then_some(snap);
    Ok(Compacted { drawings, snapshot })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(w: u32, h: u32, alpha: u8) -> String {
        // noise, like a scan or a photo (a smooth gradient is what PNG compresses best)
        let mut seed = 12345u32;
        let mut next = move || { seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12345); (seed >> 16) as u8 };
        let img = image::RgbaImage::from_fn(w, h, |_, _| image::Rgba([next(), next(), next(), alpha]));
        let mut b = std::io::Cursor::new(Vec::new());
        img.write_to(&mut b, image::ImageFormat::Png).unwrap();
        format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(b.into_inner()))
    }

    #[test]
    fn strokes_are_rounded_pictures_shrunk_and_the_json_compact() {
        let scene = serde_json::json!({
            "type": "excalidraw", "version": 2,
            "elements": [{ "type": "freedraw", "points": [[0.0, 0.0], [12.345678, -3.14321]], "pressures": [0.123456, 0.5] }],
            "files": { "a": { "mimeType": "image/png", "dataURL": png(2400, 1200, 255) }, "b": { "mimeType": "image/png", "dataURL": png(40, 40, 100) } },
        });
        let pretty = serde_json::to_string_pretty(&scene).unwrap();
        let small = compact(&pretty).unwrap();
        assert!(small.len() < pretty.len() && !small.contains('\n'));
        let v: Value = serde_json::from_str(&small).unwrap();
        assert_eq!(v["elements"][0]["points"][1], serde_json::json!([12.3, -3.1]));
        assert_eq!(v["elements"][0]["pressures"][0], serde_json::json!(0.12));
        assert_eq!(v["files"]["a"]["mimeType"], "image/webp");
        let a = base64::engine::general_purpose::STANDARD.decode(v["files"]["a"]["dataURL"].as_str().unwrap().split_once(',').unwrap().1).unwrap();
        assert_eq!(image::load_from_memory(&a).unwrap().width(), MAX_SIDE, "at most 2000 px");
        let b = base64::engine::general_purpose::STANDARD.decode(v["files"]["b"]["dataURL"].as_str().unwrap().split_once(',').unwrap().1).unwrap();
        assert_eq!(image::load_from_memory(&b).unwrap().to_rgba8().get_pixel(0, 0).0[3], 100, "transparency kept");
        assert!(compact(&small).is_none(), "once");
        assert!(compact("{\"type\":\"other\"}").is_none());
    }

    #[test]
    #[ignore = "reads a real drawing: ATLAS_TEST_DRAWING=<a .excalidraw with a PDF page> cargo test -- --ignored drawing_compact"]
    fn a_22_mb_drawing_page_shrinks() {
        let Some(path) = std::env::var_os("ATLAS_TEST_DRAWING") else { return };
        let Ok(text) = std::fs::read_to_string(path) else { return };
        let v: Value = serde_json::from_str(&text).unwrap();
        let url = v["files"].as_object().unwrap().values().next().unwrap()["dataURL"].as_str().unwrap().to_string();
        let small = shrink_picture(&url).expect("the PDF page shrinks");
        assert!(small.len() * 10 < url.len() * 7, "{} → {}", url.len(), small.len()); // seen: 172 378 → 95 943
        let whole: Value = serde_json::from_str(&compact(&text).unwrap()).unwrap();
        let webp = whole["files"].as_object().unwrap().values().filter(|f| f["mimeType"] == "image/webp").count();
        assert_eq!(webp, v["files"].as_object().unwrap().len(), "every picture of the page");
    }
}
