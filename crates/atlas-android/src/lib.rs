//! Atlas on the phone (docs/guides/ANDROID.md): the screen is Java (android/java/), what a capture means is the desktop
//! box's own code (atlas-capture without its window, atlas-core). `phone` holds plain functions, tested here;
//! `glue` hands them to Java through JNI as strings (JSON for structures), so the Java side stays thin.
pub mod phone;
pub mod text;
pub mod image;
pub mod ink;
/// the device's sign-ins for the native screens (service_signin.rs's store): every app, the capture one too
pub mod signins;
pub use atlas_core::pdfium; // PDFium is the core's (covers on every platform); the phone loads it from the APK
pub use atlas_pen::{arrow, regular, shape, shape_openink}; // the recognisers live in atlas-pen (the core uses them too)
#[cfg(feature = "full")]
pub mod serve;
// every feature has its Android path (parity.toml; docs/design/DESIGN-android-native-app.md §9): a test, nothing shipped
#[cfg(test)]
mod parity;

#[cfg(target_os = "android")]
mod glue;
#[cfg(target_os = "android")]
mod pen_reader;
#[cfg(all(target_os = "android", feature = "full"))]
mod notices;
