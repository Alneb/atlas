//! The Boox's stylus read from evdev, for `org.atlas.capture.PenReader` (docs/design/DESIGN-boox-pen-openink.md): a
//! thread decodes the pen (openink-pen, vendored from boox_5c_re) and calls `Listener.onPen(action, tool, x, y,
//! pressure, tiltX, tiltY, sideButton, timeUs)` per report. Atlas takes its pressure — linear raw/4095, as Boox Notes'
//! engine reads it, over the whole range — where Android's MotionEvents give Onyx's curve, cut at 1.0. Adapted from
//! boox_5c_re `impl/crates/openink-jni/src/lib.rs` (MIT): the reader alone, under Atlas's class name.
use jni::objects::{GlobalRef, JClass, JObject, JValue};
use jni::sys::{jlong, jstring};
use jni::{JNIEnv, JavaVM};
use openink_pen::{device::PenDevice, PenAction, PenDecoder, Tool};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;

/// Wire codes shared with PenReader.java (explicit: reordering an enum cannot shift them).
const fn action_code(a: PenAction) -> i32 {
    match a {
        PenAction::HoverEnter => 0,
        PenAction::Hover => 1,
        PenAction::Down => 2,
        PenAction::Move => 3,
        PenAction::Up => 4,
        PenAction::HoverLeave => 5,
        PenAction::ForcedUp => 6,
    }
}

const fn tool_code(t: Tool) -> i32 {
    match t {
        Tool::Pen => 0,
        Tool::Eraser => 1,
    }
}

struct Reader {
    stop: Arc<AtomicBool>,
    wake_fd: i32,
    thread: Option<JoinHandle<()>>,
    info: String,
}

fn throw(env: &mut JNIEnv, msg: &str) {
    let _ = env.throw_new("java/io/IOException", msg);
}

#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_PenReader_nativeStart(mut env: JNIEnv, _class: JClass, listener: JObject) -> jlong {
    let found = match PenDevice::find() {
        Ok(r) => r,
        Err(e) => {
            throw(&mut env, &format!("cannot list /dev/input: {e}"));
            return 0;
        }
    };
    let why = found.skipped_summary();
    let Some(mut dev) = found.pen else {
        throw(&mut env, &format!("no stylus device found; skipped [{why}]"));
        return 0;
    };
    let info = format!("{} {:?} pressure {}..{}", dev.path.display(), dev.name, dev.pressure.min, dev.pressure.max);
    // SAFETY: a plain syscall; the fd is closed in nativeStop.
    let wake_fd = unsafe { libc::eventfd(0, libc::EFD_CLOEXEC) };
    if wake_fd < 0 {
        throw(&mut env, &format!("eventfd: {}", std::io::Error::last_os_error()));
        return 0;
    }
    let (vm, cb): (JavaVM, GlobalRef) = match (env.get_java_vm(), env.new_global_ref(listener)) {
        (Ok(vm), Ok(cb)) => (vm, cb),
        _ => {
            throw(&mut env, "cannot pin the listener");
            return 0;
        }
    };
    let stop = Arc::new(AtomicBool::new(false));
    let stop_t = stop.clone();
    let thread = std::thread::Builder::new().name("atlas-pen".into()).spawn(move || {
        let Ok(mut env) = vm.attach_current_thread_as_daemon() else { return };
        let mut dec = PenDecoder::new(dev.pressure);
        let mut fds = [libc::pollfd { fd: dev.raw_fd(), events: libc::POLLIN, revents: 0 }, libc::pollfd { fd: wake_fd, events: libc::POLLIN, revents: 0 }];
        while !stop_t.load(Ordering::Acquire) {
            // SAFETY: fds is a valid array of 2 pollfds for the call.
            if unsafe { libc::poll(fds.as_mut_ptr(), 2, -1) } < 0 || fds[1].revents != 0 {
                break;
            }
            let Ok(raw) = dev.next_event() else { break };
            for e in dev.decode(&mut dec, raw).into_iter().flatten() {
                let args = [
                    JValue::Int(action_code(e.action)),
                    JValue::Int(tool_code(e.tool)),
                    JValue::Int(e.x),
                    JValue::Int(e.y),
                    JValue::Float(e.pressure),
                    JValue::Int(e.tilt_x),
                    JValue::Int(e.tilt_y),
                    JValue::Bool(e.side_button as u8),
                    JValue::Long(e.time_us),
                ];
                if env.call_method(&cb, "onPen", "(IIIIFIIZJ)V", &args).is_err() {
                    let _ = env.exception_describe();
                    let _ = env.exception_clear();
                }
            }
        }
    });
    let thread = match thread {
        Ok(t) => t,
        Err(e) => {
            throw(&mut env, &format!("spawn: {e}"));
            return 0;
        }
    };
    Box::into_raw(Box::new(Reader { stop, wake_fd, thread: Some(thread), info })) as jlong
}

#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_PenReader_nativeInfo(env: JNIEnv, _c: JClass, h: jlong) -> jstring {
    // SAFETY: h comes from nativeStart and is freed only by nativeStop (Java guards the order).
    let r = unsafe { &*(h as *const Reader) };
    env.new_string(&r.info).map(|s| s.into_raw()).unwrap_or(std::ptr::null_mut())
}

#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_PenReader_nativeStop(_env: JNIEnv, _c: JClass, h: jlong) {
    // SAFETY: as above; Java zeroes its handle before calling, so this runs once.
    let mut r = unsafe { Box::from_raw(h as *mut Reader) };
    r.stop.store(true, Ordering::Release);
    let one: u64 = 1;
    // SAFETY: 8 bytes to our own eventfd wake the poll.
    unsafe { libc::write(r.wake_fd, &one as *const u64 as *const _, 8) };
    if let Some(t) = r.thread.take() {
        let _ = t.join();
    }
    // SAFETY: our own fd, closed once.
    unsafe { libc::close(r.wake_fd) };
}
