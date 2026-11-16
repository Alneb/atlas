//! The core's system notifications on the phone (docs/design/DESIGN-notifications.md, "Delivery to the system"): the
//! core decides when (notify.rs), Java shows (Notices.java). A press on one of a notice's buttons comes back through
//! `Notices.chosen` (NoticeActions.java) and is said on the bus of the vault that showed it.
use atlas_core::api::{Notice, NoticeLevel};
use atlas_core::events::{Chosen, EventBus};
use atlas_core::notify::{self, Notifier};
use jni::objects::{GlobalRef, JClass, JObject, JString, JValue};
use jni::sys::{jboolean, jint, JNI_FALSE, JNI_TRUE};
use jni::{JNIEnv, JavaVM};
use std::collections::BTreeMap;
use std::sync::{Arc, LazyLock, Mutex, Once};

struct Java {
    vm: JavaVM,
    /// Held from a Java thread: on the core's own threads `FindClass` sees only the system's classes.
    class: GlobalRef,
}

/// One per vault served, all reaching the same Java class; its bus hears its notifications' buttons.
struct JavaNotifier(Arc<Java>, EventBus);

/// What a press on a button of notification `id` needs: the bus of the vault that showed it, and the notice's
/// source, id and open. Android's ids are the process's own (Notices.java counts them), so one table for every vault.
struct Pressable {
    bus: EventBus,
    source: Option<String>,
    id: Option<String>,
    open: Option<String>,
}

static PRESSABLE: LazyLock<Mutex<BTreeMap<i32, Pressable>>> = LazyLock::new(Default::default);

/// The few notifications whose buttons can still be pressed: older ones are long gone from the shade.
const PRESSABLE_KEPT: usize = 128;

/// A notice's buttons as Notices.java reads them: `id<TAB>label` per line.
fn actions_of(n: &Notice) -> String {
    let flat = |s: &str| s.replace(['\t', '\n'], " ");
    n.actions.iter().map(|a| format!("{}\t{}", flat(&a.id), flat(&a.label))).collect::<Vec<_>>().join("\n")
}

impl JavaNotifier {
    /// Calls a static method of Notices on this thread (attached for good: its references must not pile up).
    fn call<T>(&self, f: impl FnOnce(&mut JNIEnv, &JClass) -> jni::errors::Result<T>) -> Result<T, String> {
        let mut env = self.0.vm.attach_current_thread_as_daemon().map_err(|e| e.to_string())?;
        let class: &JClass = self.0.class.as_obj().into();
        let done = env.with_local_frame(10, |env| f(env, class));
        done.map_err(|e| {
            // a Java exception stays pending on this thread until cleared
            let _ = env.exception_describe();
            let _ = env.exception_clear();
            e.to_string()
        })
    }
}

impl Notifier for JavaNotifier {
    fn show(&self, n: &Notice, replaces: Option<u32>, _stay: notify::Stay) -> Result<u32, String> {
        let shown = self.call(|env, class| {
            let (title, body, actions) = (env.new_string(&n.title)?, env.new_string(notify::body_of(n))?, env.new_string(actions_of(n))?);
            let source = n.source.as_deref().map_or(Ok(JObject::null()), |s| env.new_string(s).map(JObject::from))?;
            let open = notify::opens(n).map_or(Ok(JObject::null()), |s| env.new_string(s).map(JObject::from))?;
            let args = [
                JValue::Object(&title),
                JValue::Object(&body),
                JValue::Object(&source),
                JValue::Object(&open),
                JValue::Bool((n.level == Some(NoticeLevel::Failure)).into()),
                JValue::Int(replaces.map_or(-1, |r| r as i32)),
                JValue::Object(&actions),
            ];
            env.call_static_method(class, "show", "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;ZILjava/lang/String;)I", &args)?.i()
        })?;
        if shown < 0 {
            return Err("the app has not started".into());
        }
        let mut pressable = PRESSABLE.lock().unwrap();
        pressable.remove(&shown);
        if !n.actions.is_empty() {
            pressable.insert(shown, Pressable { bus: self.1.clone(), source: n.source.clone(), id: n.id.clone(), open: notify::opens(n).map(str::to_string) });
            while pressable.len() > PRESSABLE_KEPT {
                pressable.pop_first();
            }
        }
        Ok(shown as u32)
    }

    fn withdraw(&self, handle: u32) -> Result<(), String> {
        PRESSABLE.lock().unwrap().remove(&(handle as i32));
        self.call(|env, class| env.call_static_method(class, "cancel", "(I)V", &[JValue::Int(handle as i32)]).map(drop))
    }
}

/// `Notices.chosen`: a button of notification `id` pressed (NoticeActions.java); false when no vault here showed it.
#[no_mangle]
pub extern "system" fn Java_org_atlas_capture_Notices_chosen(mut env: JNIEnv, _: JClass, id: jint, action: JString) -> jboolean {
    let Ok(action) = env.get_string(&action).map(String::from) else { return JNI_FALSE };
    let Some(p) = PRESSABLE.lock().unwrap().remove(&id) else { return JNI_FALSE };
    p.bus.chose(Chosen { action, source: p.source, notice: p.id, open: p.open });
    JNI_TRUE
}

/// Gives the core the phone's notifier. From a Java thread, before the first vault is served.
pub fn install(env: &mut JNIEnv) {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let class = env.find_class("org/atlas/capture/Notices").and_then(|c| env.new_global_ref(c));
        match (env.get_java_vm(), class) {
            (Ok(vm), Ok(class)) => {
                let java = Arc::new(Java { vm, class });
                notify::set_platform(move |bus| Box::new(JavaNotifier(java.clone(), bus.clone())));
            }
            (vm, class) => {
                let _ = env.exception_clear();
                eprintln!("atlas: no system notifications: {:?} {:?}", vm.err(), class.err());
            }
        }
    });
}
