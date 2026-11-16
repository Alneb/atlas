//! Windows toasts (WinRT `Windows.UI.Notifications`). The app gets a name and an icon in this user's registry
//! (`AppUserModelId\<id>`): done at start, needing no installer step, so a portable `atlas.exe` shows them too. A click
//! and a button's press are the toast's `Activated` event, which needs the process alive; the core is, as long as a
//! vault is served.
//!
//! The toast is written as XML (`toast_xml`): the title and body as text, the notice's buttons as `<actions>`, each
//! naming its action in its `arguments` (`ACTION` + the id); a click on the body brings the toast's `launch` (`OPEN`).
//! `Activated`'s `ToastActivatedEventArgs.Arguments` is read back by `pressed`: a click opens the notice's note as on
//! Linux, a button is said on the bus (`EventBus::chose`). A withdrawal is `History().RemoveGroupedTagWithId` with the
//! toast's tag (the handle) and group (the source). What makes the XML, the arguments and the tag and group is plain
//! Rust, tested on every platform; the WinRT calls are Windows's alone.
// elsewhere only the tests below use the plain part
#![cfg_attr(not(windows), allow(dead_code))]

use super::Notice;

/// A tag or a group is at most 16 characters on older Windows (64 since 1703): a longer one is accepted when set and
/// refused when read back (CI's Windows Server). Sources are short (`sync`, a plugin's id).
pub(super) const GROUP_MAX: usize = 16;
/// The arguments of a click on the toast's body (its `launch`).
const OPEN: &str = "atlas-open";
/// A button's arguments: this, then the action's id.
const ACTION: &str = "atlas-action:";
/// Windows shows at most five buttons; a toast with more is refused whole.
const BUTTONS_MAX: usize = 5;

/// What an activation of one of Atlas's toasts was.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Pressed {
    /// The body clicked (or an activation without arguments): the notice's note opens, Atlas comes forward.
    Body,
    /// One of the notice's buttons, by its action's id.
    Action(String),
}

/// `ToastActivatedEventArgs.Arguments` read back.
pub(super) fn pressed(arguments: &str) -> Pressed {
    match arguments.strip_prefix(ACTION) {
        Some(id) if !id.is_empty() => Pressed::Action(id.to_string()),
        _ => Pressed::Body,
    }
}

/// The toast's tag: its handle, which a later notice of the same id replaces and a withdrawal names.
pub(super) fn tag_of(handle: u32) -> String {
    handle.to_string()
}

/// The toast's group: its source (folding a source's burst), cut to what every Windows reads back.
pub(super) fn group_of(n: &Notice) -> String {
    n.source.as_deref().unwrap_or("atlas").chars().take(GROUP_MAX).collect()
}

/// Text in XML, as written: `<`, `&` and quotes are never markup.
fn escaped(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

/// The toast of a notice, as Windows's toast schema: title and body as the generic template's two lines, the buttons
/// (at most five) as foreground actions — an activation reaches the running process's `Activated`.
pub(super) fn toast_xml(n: &Notice) -> String {
    let mut xml = format!(
        "<toast launch=\"{OPEN}\"><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual>",
        escaped(&n.title),
        escaped(&super::body_of(n))
    );
    if !n.actions.is_empty() {
        xml.push_str("<actions>");
        for a in n.actions.iter().take(BUTTONS_MAX) {
            xml.push_str(&format!("<action content=\"{}\" arguments=\"{ACTION}{}\" activationType=\"foreground\"/>", escaped(&a.label), escaped(&a.id)));
        }
        xml.push_str("</actions>");
    }
    xml.push_str("</toast>");
    xml
}

#[cfg(windows)]
pub(super) use winrt::Toasts;

#[cfg(windows)]
mod winrt {
    use super::super::{Notice, Notifier, Stay};
    use super::{group_of, pressed, tag_of, toast_xml, Pressed};
    use crate::events::{Chosen, EventBus};
    use std::collections::{HashMap, VecDeque};
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Mutex;
    use windows::core::{IInspectable, Interface, Ref, HSTRING};
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Foundation::TypedEventHandler;
    use windows::UI::Notifications::{ToastActivatedEventArgs, ToastNotification, ToastNotificationManager, ToastNotifier};

    /// The same as the Tauri bundle's identifier, so Windows groups the toasts under one app.
    const APP_ID: &str = "dev.atlas.app";
    /// The toasts whose clicks are still awaited: their handlers live as long as they do.
    const KEPT: usize = 32;
    /// The groups of the toasts shown, by handle, for a withdrawal: the last few hundred.
    const GROUPS_KEPT: usize = 512;

    /// One notifier per vault, one identity per app: a process-wide counter, or one vault's toast would replace
    /// another's with the same tag.
    static NEXT: AtomicU32 = AtomicU32::new(1);

    pub struct Toasts {
        notifier: ToastNotifier,
        bus: EventBus,
        kept: Mutex<VecDeque<ToastNotification>>,
        groups: Mutex<HashMap<u32, String>>,
    }

    impl Toasts {
        /// Names the app to Windows and opens its toast notifier.
        pub fn open(bus: EventBus) -> Result<Self, String> {
            register()?;
            let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_ID)).map_err(|e| e.to_string())?;
            Ok(Self { notifier, bus, kept: Mutex::default(), groups: Mutex::default() })
        }
    }

    impl Notifier for Toasts {
        fn show(&self, n: &Notice, replaces: Option<u32>, _stay: Stay) -> Result<u32, String> {
            let handle = replaces.unwrap_or_else(|| NEXT.fetch_add(1, Ordering::Relaxed));
            let toast = toast_of(n, handle).map_err(|e| e.to_string())?;
            let bus = self.bus.clone();
            let (open, source, id) = (super::super::opens(n).map(str::to_string), n.source.clone(), n.id.clone());
            toast
                .Activated(&TypedEventHandler::new(move |_, args: Ref<IInspectable>| {
                    let said = args.ok().ok().and_then(|a| a.cast::<ToastActivatedEventArgs>().ok()).and_then(|a| a.Arguments().ok()).map(|h| h.to_string()).unwrap_or_default();
                    match pressed(&said) {
                        Pressed::Body => super::super::open_notice(&bus, open.clone()),
                        Pressed::Action(action) => bus.chose(Chosen { action, source: source.clone(), notice: id.clone(), open: open.clone() }),
                    }
                    Ok(())
                }))
                .map_err(|e| e.to_string())?;
            self.notifier.Show(&toast).map_err(|e| e.to_string())?;
            let mut kept = self.kept.lock().unwrap();
            kept.push_back(toast);
            if kept.len() > KEPT {
                kept.pop_front();
            }
            let mut groups = self.groups.lock().unwrap();
            groups.insert(handle, group_of(n));
            if groups.len() > GROUPS_KEPT {
                // handles count upwards: the oldest half goes
                let keep_from = handle.saturating_sub((GROUPS_KEPT / 2) as u32);
                groups.retain(|&h, _| h >= keep_from);
            }
            Ok(handle)
        }

        /// Takes the toast away from the screen and the Action Center, by its tag and group.
        fn withdraw(&self, handle: u32) -> Result<(), String> {
            let Some(group) = self.groups.lock().unwrap().remove(&handle) else {
                return Err(format!("toast {handle} no longer known"));
            };
            ToastNotificationManager::History()
                .and_then(|h| h.RemoveGroupedTagWithId(&HSTRING::from(tag_of(handle)), &HSTRING::from(group), &HSTRING::from(APP_ID)))
                .map_err(|e| e.to_string())
        }
    }

    /// The toast of a notice (`toast_xml`), with its tag (which earlier toast it replaces) and group.
    fn toast_of(n: &Notice, handle: u32) -> windows::core::Result<ToastNotification> {
        let xml = XmlDocument::new()?;
        xml.LoadXml(&HSTRING::from(toast_xml(n)))?;
        let toast = ToastNotification::CreateToastNotification(&xml)?;
        toast.SetTag(&HSTRING::from(tag_of(handle)))?;
        toast.SetGroup(&HSTRING::from(group_of(n)))?;
        Ok(toast)
    }

    /// `HKCU\Software\Classes\AppUserModelId\<id>`: the name and the icon Windows shows above a toast. Set at every
    /// start, as the icon's file may have moved; this user's own hive, so no elevation.
    fn register() -> Result<(), String> {
        use windows_sys::Win32::Foundation::ERROR_SUCCESS;
        use windows_sys::Win32::System::Registry::{RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_SZ};
        let wide = |s: &str| s.encode_utf16().chain([0]).collect::<Vec<u16>>();
        let path = wide(&format!("Software\\Classes\\AppUserModelId\\{APP_ID}"));
        let mut key: HKEY = std::ptr::null_mut();
        // SAFETY: the strings are NUL-terminated and outlive the calls; the key is closed below
        let made = unsafe { RegCreateKeyExW(HKEY_CURRENT_USER, path.as_ptr(), 0, std::ptr::null(), REG_OPTION_NON_VOLATILE, KEY_SET_VALUE, std::ptr::null(), &mut key, std::ptr::null_mut()) };
        if made != ERROR_SUCCESS {
            return Err(format!("the registry refused the app's name (error {made})"));
        }
        let set = |name: &str, value: &str| {
            let (name, value) = (wide(name), wide(value));
            // SAFETY: the length is the value's own, in bytes, its NUL included
            let done = unsafe { RegSetValueExW(key, name.as_ptr(), 0, REG_SZ, value.as_ptr().cast(), (value.len() * 2) as u32) };
            if done == ERROR_SUCCESS { Ok(()) } else { Err(format!("the registry refused a value of the app's name (error {done})")) }
        };
        let mut named = set("DisplayName", "Atlas");
        match icon() {
            Ok(file) => named = named.and(set("IconUri", &file.to_string_lossy())),
            Err(e) => eprintln!("atlas: toasts without the icon: {e}"), // the toast still shows
        }
        // SAFETY: opened above, closed once
        unsafe { RegCloseKey(key) };
        named
    }

    /// The icon as a file: Windows reads it from a path, and the program's own is inside the exe.
    fn icon() -> Result<std::path::PathBuf, String> {
        let dir = crate::platform::dirs::atlas(crate::platform::dirs::Base::Cache);
        let file = dir.join("toast-icon.png");
        std::fs::create_dir_all(&dir).and_then(|_| std::fs::write(&file, include_bytes!("../../../atlas-app/icons/128x128.png"))).map_err(|e| e.to_string())?;
        Ok(file)
    }

    #[cfg(test)]
    mod tests {
        use super::super::GROUP_MAX;
        use super::*;
        use crate::api::NoticeAction;

        // Shows nothing: only builds the toast. CI's Windows has the real WinRT classes and must pass; Wine has none.
        #[test]
        fn a_toast_says_title_and_body_as_text_and_carries_tag_group_and_buttons() {
            let n = Notice::new("a < b & c").body("line").source("x".repeat(GROUP_MAX + 9)).action(NoticeAction::new("done", "Done"));
            let toast = match toast_of(&n, 7) {
                Ok(t) => t,
                Err(e) if std::env::var_os("CI").is_none() => return eprintln!("skipped: no WinRT toasts here (Wine?): {e}"),
                Err(e) => panic!("{e}"),
            };
            let xml = toast.Content().unwrap().GetXml().unwrap().to_string();
            assert!(xml.contains("a &lt; b &amp; c"), "{xml}");
            assert!(xml.contains(">line<"), "{xml}");
            assert!(xml.contains("atlas-action:done"), "{xml}");
            assert_eq!(toast.Tag().unwrap().to_string(), "7");
            assert_eq!(toast.Group().unwrap().to_string().len(), GROUP_MAX);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::NoticeAction;

    #[test]
    fn a_buttons_arguments_name_its_action_and_anything_else_is_the_body() {
        let n = Notice::new("t").action(NoticeAction::snooze(10)).action(NoticeAction::new("done", "Done"));
        let xml = toast_xml(&n);
        for a in &n.actions {
            let args = format!("{ACTION}{}", a.id);
            assert!(xml.contains(&format!("arguments=\"{args}\"")), "{xml}");
            assert_eq!(pressed(&args), Pressed::Action(a.id.clone()), "read back as written");
        }
        assert_eq!(pressed(OPEN), Pressed::Body, "the body's launch");
        assert_eq!(pressed(""), Pressed::Body, "an activation without arguments");
        assert_eq!(pressed(ACTION), Pressed::Body, "no id: not a button");
        assert!(xml.starts_with(&format!("<toast launch=\"{OPEN}\">")), "{xml}");
    }

    #[test]
    fn a_toasts_text_is_never_markup_and_it_has_at_most_five_buttons() {
        let mut n = Notice::new("Prof <prof@uni.example> & \"co\"").body("a < b");
        for i in 0..7 {
            n = n.action(NoticeAction::new(format!("a{i}"), format!("B&{i}")));
        }
        let xml = toast_xml(&n);
        assert!(xml.contains("<text>Prof &lt;prof@uni.example&gt; &amp; &quot;co&quot;</text><text>a &lt; b</text>"), "{xml}");
        assert_eq!(xml.matches("<action ").count(), BUTTONS_MAX, "{xml}");
        assert!(xml.contains("content=\"B&amp;0\""), "{xml}");
        assert!(!toast_xml(&Notice::new("plain")).contains("<actions>"), "no buttons: no actions element");
    }

    #[test]
    fn the_tag_is_the_handle_and_the_group_the_source_cut_short() {
        assert_eq!(tag_of(42), "42");
        assert_eq!(group_of(&Notice::new("t")), "atlas");
        assert_eq!(group_of(&Notice::new("t").source("sync")), "sync");
        assert_eq!(group_of(&Notice::new("t").source("é".repeat(GROUP_MAX + 3))).chars().count(), GROUP_MAX);
    }
}
