//! JNI: `org.atlas.capture.Core`'s native methods, each a string in and out; a panic becomes `{"error"}`. The pens
//! take and give float arrays and throw IllegalArgumentException with why.
use crate::phone;
use crate::ink;
use jni::objects::{JByteArray, JClass, JFloatArray, JString};
use jni::sys::{jboolean, jbyteArray, jfloat, jfloatArray, jint, jstring};
use jni::JNIEnv;
use std::path::Path;

fn arg(env: &mut JNIEnv, s: &JString) -> String {
    env.get_string(s).map(Into::into).unwrap_or_default()
}

fn ret(env: &mut JNIEnv, f: impl FnOnce() -> String + std::panic::UnwindSafe) -> jstring {
    let out = std::panic::catch_unwind(f).unwrap_or_else(|_| r#"{"error":"the Rust side panicked"}"#.into());
    env.new_string(out).map(|s| s.into_raw()).unwrap_or(std::ptr::null_mut())
}

#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_prepare(mut env: JNIEnv, _: JClass, vault: JString) {
    let v = arg(&mut env, &vault);
    let _ = std::panic::catch_unwind(|| phone::prepare(Path::new(&v)));
}

#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_suggest(mut env: JNIEnv, _: JClass, vault: JString, text: JString, caret: jint) -> jstring {
    let (v, t) = (arg(&mut env, &vault), arg(&mut env, &text));
    ret(&mut env, move || phone::suggest(Path::new(&v), &t, caret.max(0) as usize).to_string())
}

#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_describe(mut env: JNIEnv, _: JClass, text: JString) -> jstring {
    let t = arg(&mut env, &text);
    ret(&mut env, move || phone::describe(&t))
}

#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_save(mut env: JNIEnv, _: JClass, vault: JString, text: JString) -> jstring {
    let (v, t) = (arg(&mut env, &vault), arg(&mut env, &text));
    ret(&mut env, move || phone::save(Path::new(&v), &t).to_string())
}

#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_attach(mut env: JNIEnv, _: JClass, vault: JString, name: JString, source: JString) -> jstring {
    let (v, n, s) = (arg(&mut env, &vault), arg(&mut env, &name), arg(&mut env, &source));
    ret(&mut env, move || phone::attach(Path::new(&v), &n, Path::new(&s)).to_string())
}

#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_findVaults(mut env: JNIEnv, _: JClass, root: JString) -> jstring {
    let r = arg(&mut env, &root);
    ret(&mut env, move || phone::find_vaults(Path::new(&r)).to_string())
}

/// The full app's core: the vault's own Atlas server inside the app → `{port}` or `{error}` (serve.rs).
#[cfg(feature = "full")]
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_serve(mut env: JNIEnv, _: JClass, vault: JString, home: JString, vars: JString) -> jstring {
    let (v, h, e) = (arg(&mut env, &vault), arg(&mut env, &home), arg(&mut env, &vars));
    let vars: serde_json::Value = serde_json::from_str(&e).unwrap_or_default();
    ret(&mut env, move || crate::serve::serve(Path::new(&v), Path::new(&h), &vars).to_string())
}

/// A folder vault's mirror and this app's sign-in for it, given to the in-app core (serve.rs `mirror`): `{ok}` or `{error}`.
#[cfg(feature = "full")]
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_mirror(mut env: JNIEnv, _: JClass, vault: JString, mirror: JString, cookies: JString) -> jstring {
    let (v, m, c) = (arg(&mut env, &vault), arg(&mut env, &mirror), arg(&mut env, &cookies));
    ret(&mut env, move || crate::serve::mirror(Path::new(&v), &m, &c).to_string())
}

/// A JPEG XL for the native plugins (image.rs): `[width, height, ARGB…]`, or null when it is not one.
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_decodeJxl(env: JNIEnv, _: JClass, bytes: jni::objects::JByteArray) -> jni::sys::jintArray {
    let Ok(b) = env.convert_byte_array(&bytes) else { return std::ptr::null_mut() };
    let Ok(Ok((w, h, px))) = std::panic::catch_unwind(move || crate::image::decode_jxl(&b)) else { return std::ptr::null_mut() };
    let mut all = Vec::with_capacity(px.len() + 2);
    all.extend([w as i32, h as i32]);
    all.extend(px);
    let Ok(arr) = env.new_int_array(all.len() as i32) else { return std::ptr::null_mut() };
    if env.set_int_array_region(&arr, 0, &all).is_err() {
        return std::ptr::null_mut();
    }
    arr.into_raw()
}

#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_drawingSaved(mut env: JNIEnv, _: JClass, vault: JString, rel: JString, scene: JString) -> jstring {
    let (v, r, sc) = (arg(&mut env, &vault), arg(&mut env, &rel), arg(&mut env, &scene));
    ret(&mut env, move || phone::drawing_saved(Path::new(&v), &r, &sc).to_string())
}

#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_plugins(mut env: JNIEnv, _: JClass, vault: JString) -> jstring {
    let v = arg(&mut env, &vault);
    ret(&mut env, move || phone::plugins(Path::new(&v)).to_string())
}

/// A file's one note, found (phone::companion_note): `{path, created}` or `{error}`.
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_companionNote(mut env: JNIEnv, _: JClass, vault: JString, pdf: JString) -> jstring {
    let (v, p) = (arg(&mut env, &vault), arg(&mut env, &pdf));
    ret(&mut env, move || phone::companion_note(Path::new(&v), &p).to_string())
}

/// The vault's settings with their schema (phone::config): `{config, schema}` or `{error}`.
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_config(mut env: JNIEnv, _: JClass, vault: JString) -> jstring {
    let v = arg(&mut env, &vault);
    ret(&mut env, move || phone::config(Path::new(&v)).to_string())
}

/// The vault's settings saved (phone::config_save): `{}` or `{error}`.
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_configSave(mut env: JNIEnv, _: JClass, vault: JString, config: JString) -> jstring {
    let (v, c) = (arg(&mut env, &vault), arg(&mut env, &config));
    ret(&mut env, move || phone::config_save(Path::new(&v), &c).to_string())
}

/// A built-in plugin's form from the manifest the app carries (phone::plugin_form): `{fields, settings}` or `{error}`.
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_pluginForm(mut env: JNIEnv, _: JClass, manifest: JString) -> jstring {
    let m = arg(&mut env, &manifest);
    ret(&mut env, move || phone::plugin_form(&m).to_string())
}

/// A plugin's settings saved from the app's Settings (phone::save_plugin_settings): `{}` or `{error}`.
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_pluginSettingsSave(mut env: JNIEnv, _: JClass, vault: JString, id: JString, values: JString) -> jstring {
    let (v, i, s) = (arg(&mut env, &vault), arg(&mut env, &id), arg(&mut env, &values));
    ret(&mut env, move || phone::save_plugin_settings(Path::new(&v), &i, &s).to_string())
}

/// A plugin switched on or off in this vault (phone::set_plugin_on): `{}` or `{error}`.
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_pluginOn(mut env: JNIEnv, _: JClass, vault: JString, id: JString, on: jboolean) -> jstring {
    let (v, i) = (arg(&mut env, &vault), arg(&mut env, &id));
    ret(&mut env, move || phone::set_plugin_on(Path::new(&v), &i, on != 0).to_string())
}

/// The app's own interface for a server's vault (AtlasActivity serves it in place of the server's): the file at `path`
/// as `[mime, NUL, bytes…]`, the page told its API `prefix`; null when there is no such file.
#[cfg(feature = "full")]
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_uiFile(mut env: JNIEnv, _: JClass, path: JString, prefix: JString) -> jni::sys::jbyteArray {
    let (p, pre) = (arg(&mut env, &path), arg(&mut env, &prefix));
    let Ok(Some((data, mime))) = std::panic::catch_unwind(move || atlas_core::server::ui_file(&p, &pre)) else { return std::ptr::null_mut() };
    let mut all = Vec::with_capacity(mime.len() + 1 + data.len());
    all.extend_from_slice(mime.as_bytes());
    all.push(0);
    all.extend_from_slice(&data);
    env.byte_array_from_slice(&all).map(|a| a.into_raw()).unwrap_or(std::ptr::null_mut())
}

/// `{version, api, ui}` of the interface this app carries (atlas_core::server::version_info), to compare with a server's.
#[cfg(feature = "full")]
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_version(mut env: JNIEnv, _: JClass) -> jstring {
    ret(&mut env, || atlas_core::server::version_info().to_string())
}

// ---- the Boox pens (ink.rs): float arrays in and out; a refusal becomes IllegalArgumentException with its reason ----

fn floats(env: &JNIEnv, a: &JFloatArray) -> Vec<f32> {
    let n = env.get_array_length(a).unwrap_or(0).max(0) as usize;
    let mut v = vec![0.0; n];
    if env.get_float_array_region(a, 0, &mut v).is_err() {
        v.clear();
    }
    v
}

/// Hands `f`'s floats to Java, or throws why it refused (a panic says so too); null after a throw.
fn give_floats(env: &mut JNIEnv, f: impl FnOnce() -> Result<Vec<f32>, ink::Refused> + std::panic::UnwindSafe) -> jfloatArray {
    let out = match std::panic::catch_unwind(f) {
        Ok(Ok(v)) => v,
        Ok(Err(why)) => return throw(env, &why.to_string()),
        Err(_) => return throw(env, "the Rust pen engine panicked"),
    };
    let Ok(arr) = env.new_float_array(out.len() as i32) else { return std::ptr::null_mut() };
    if env.set_float_array_region(&arr, 0, &out).is_err() {
        return std::ptr::null_mut();
    }
    arr.into_raw()
}

fn throw<T>(env: &mut JNIEnv, why: &str) -> *mut T {
    let _ = env.throw_new("java/lang/IllegalArgumentException", why);
    std::ptr::null_mut()
}

#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_penInk(mut env: JNIEnv, _: JClass, pen: jint, config: JFloatArray, samples: JFloatArray) -> jfloatArray {
    let (cfg, raw) = (floats(&env, &config), floats(&env, &samples));
    give_floats(&mut env, move || ink::render(pen, &cfg, &raw))
}

#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_penDefaults(mut env: JNIEnv, _: JClass, pen: jint, dpi: jfloat) -> jfloatArray {
    give_floats(&mut env, move || ink::defaults(pen, dpi).map(Vec::from))
}

/// A charcoal stroke's dithered bitmap (ink::charcoal): 16 header bytes, then the pixels.
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_penCharcoal(mut env: JNIEnv, _: JClass, pen: jint, config: JFloatArray, samples: JFloatArray) -> jbyteArray {
    let (cfg, raw) = (floats(&env, &config), floats(&env, &samples));
    let out = match std::panic::catch_unwind(move || ink::charcoal(pen, &cfg, &raw)) {
        Ok(Ok(v)) => v,
        Ok(Err(why)) => return throw(&mut env, &why.to_string()),
        Err(_) => return throw(&mut env, "the Rust pen engine panicked"),
    };
    env.byte_array_from_slice(&out).map(JByteArray::into_raw).unwrap_or(std::ptr::null_mut())
}

/// What Onyx's instant ink is told for a pen (ink::live): style, width, exact, n, params[n], settled config.
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_penLive(mut env: JNIEnv, _: JClass, pen: jint, config: JFloatArray) -> jfloatArray {
    let cfg = floats(&env, &config);
    give_floats(&mut env, move || ink::live(pen, &cfg))
}

/// The shape a stroke (`x, y, t` per point) was meant as (atlas_pen::recognize): `[0]` none, else its kind and
/// measures (shape.rs's wire format).
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_penShape(mut env: JNIEnv, _: JClass, xyt: JFloatArray, openink: jboolean) -> jfloatArray {
    let pts = floats(&env, &xyt);
    give_floats(&mut env, move || Ok(atlas_pen::recognize(&pts, openink != 0)))
}

/// 0 filled, 1 translucent (the marker), 2 dabs; throws for a pen that does not exist.
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Core_penOutput(mut env: JNIEnv, _: JClass, pen: jint) -> jint {
    match ink::output(pen) {
        Ok(o) => o,
        Err(why) => {
            let _ = env.throw_new("java/lang/IllegalArgumentException", why.to_string());
            -1
        }
    }
}
