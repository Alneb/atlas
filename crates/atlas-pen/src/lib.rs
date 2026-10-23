//! What a pen stroke was meant as (docs/design/DESIGN-pen-eink-reader.md): Atlas's recogniser (`shape`), openink's
//! (`shape_openink`), a shaft and its head drawn apart (`arrow`), then the bias to regular shapes (`regular`). One
//! implementation: the phone's Notepad asks through JNI (atlas-android's glue), the web drawing through the core
//! (`POST /api/pen/shape`), so a stroke snaps alike everywhere (memory feedback_local_remote_same.md).
pub mod arrow;
pub mod regular;
pub mod shape;
pub mod shape_openink;

/// The shape `xyt` (`x, y, t` per point; two strokes: a NaN triple between) was meant as, in the wire format
/// (shape.rs): `[0]` none. `openink`: openink's recogniser, else Atlas's.
pub fn recognize(xyt: &[f32], openink: bool) -> Vec<f32> {
    // two strokes: a shaft and its head by geometry first, then openink's reading of both
    let two = xyt.iter().any(|v| v.is_nan());
    let wire = match (two, openink) {
        (true, open) => arrow::of_two(xyt).unwrap_or_else(|| if open { shape_openink::recognize_wire(xyt) } else { vec![0.0] }),
        (false, true) => shape_openink::recognize_wire(xyt),
        (false, false) => shape::recognize_xyt(xyt),
    };
    regular::regularise(wire)
}
