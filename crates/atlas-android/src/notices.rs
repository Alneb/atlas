//! The core's system notifications on the phone (docs/design/DESIGN-notifications.md, "Delivery to the system"): the
//! core decides when (notify.rs), Java shows (Notices.java).
use atlas_core::api::{Notice, NoticeLevel};
use atlas_core::notify::{self, Notifier};
use jni::objects::{GlobalRef, JClass, JObject, JValue};
use jni::{JNIEnv, JavaVM};
use std::sync::{Arc, Once};

struct Java {
    vm: JavaVM,
    /// Held from a Java thread: on the core's own threads `FindClass` sees only the system's classes.
    class: GlobalRef,
}

/// One per vault served, all reaching the same Java class.
struct JavaNotifier(Arc<Java>);

impl Notifier for JavaNotifier {
    fn show(&self, n: &Notice, replaces: Option<u32>) -> Result<u32, String> {
        let mut env = self.0.vm.attach_current_thread_as_daemon().map_err(|e| e.to_string())?;
        // the thread stays attached: its references must not pile up over the app's life
        let shown = env.with_local_frame(8, |env| -> jni::errors::Result<i32> {
            let (title, body) = (env.new_string(&n.title)?, env.new_string(notify::body_of(n))?);
            let source = n.source.as_deref().map_or(Ok(JObject::null()), |s| env.new_string(s).map(JObject::from))?;
            let open = notify::opens(n).map_or(Ok(JObject::null()), |s| env.new_string(s).map(JObject::from))?;
            let class: &JClass = self.0.class.as_obj().into();
            let args = [
                JValue::Object(&title),
                JValue::Object(&body),
                JValue::Object(&source),
                JValue::Object(&open),
                JValue::Bool((n.level == Some(NoticeLevel::Failure)).into()),
                JValue::Int(replaces.map_or(-1, |r| r as i32)),
            ];
            env.call_static_method(class, "show", "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;ZI)I", &args)?.i()
        });
        match shown {
            Ok(id) if id >= 0 => Ok(id as u32),
            Ok(_) => Err("the app has not started".into()),
            Err(e) => {
                // a Java exception stays pending on this thread until cleared
                let _ = env.exception_describe();
                let _ = env.exception_clear();
                Err(e.to_string())
            }
        }
    }
}

/// Gives the core the phone's notifier. From a Java thread, before the first vault is served.
pub fn install(env: &mut JNIEnv) {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let class = env.find_class("org/atlas/capture/Notices").and_then(|c| env.new_global_ref(c));
        match (env.get_java_vm(), class) {
            (Ok(vm), Ok(class)) => {
                let java = Arc::new(Java { vm, class });
                notify::set_platform(move || Box::new(JavaNotifier(java.clone())));
            }
            (vm, class) => {
                let _ = env.exception_clear();
                eprintln!("atlas: no system notifications: {:?} {:?}", vm.err(), class.err());
            }
        }
    });
}
