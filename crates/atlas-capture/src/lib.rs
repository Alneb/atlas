//! Atlas's capture box as a library. With the `window` feature (the default): the desktop's box, a native window
//! (src/main.rs). Without it: only what a capture means — the completions, what the text becomes, the icons as
//! SVG paths, writing it — which the phone app uses under its own screen (crates/atlas-android, docs/guides/ANDROID.md).
#[cfg(feature = "window")]
pub mod app;
pub mod complete;
#[cfg(feature = "window")]
pub mod context;
#[cfg(feature = "window")]
pub mod extras;
#[cfg(feature = "window")]
mod icon_paint;
pub mod icons;
#[cfg(feature = "window")]
mod look;
#[cfg(feature = "window")]
mod raster;
#[cfg(feature = "window")]
mod region;
pub mod send;
#[cfg(all(test, feature = "window"))]
mod tests;
#[cfg(feature = "window")]
pub mod window;
