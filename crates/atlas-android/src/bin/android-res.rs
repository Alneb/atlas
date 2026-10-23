//! `android-res <res dir>`: the capture box's icons as vector drawables (`drawable/ic_<name>.xml`), from the same SVG
//! paths the desktop box paints (atlas_capture::icons) — run by build-apk.sh, so the two never drift.
use atlas_capture::icons::{svg, Icon};

fn main() -> std::io::Result<()> {
    let res = std::path::PathBuf::from(std::env::args().nth(1).expect("usage: android-res <res dir>"));
    let dir = res.join("drawable");
    std::fs::create_dir_all(&dir)?;
    for icon in Icon::ALL {
        let paths: String = svg(icon)
            .iter()
            .map(|d| format!("  <path android:pathData=\"{d}\" android:strokeColor=\"#FFFFFFFF\" android:strokeWidth=\"1.75\" android:strokeLineCap=\"round\" android:strokeLineJoin=\"round\" android:fillColor=\"#00000000\"/>\n"))
            .collect();
        let xml = format!("<vector xmlns:android=\"http://schemas.android.com/apk/res/android\" android:width=\"24dp\" android:height=\"24dp\" android:viewportWidth=\"24\" android:viewportHeight=\"24\">\n{paths}</vector>\n");
        std::fs::write(dir.join(format!("ic_{}.xml", atlas_android::phone::icon_name(icon))), xml)?;
    }
    Ok(())
}
