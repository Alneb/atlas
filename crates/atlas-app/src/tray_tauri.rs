//! The tray icon on Windows (the notification area) and macOS (the menu bar): Tauri's tray. It draws the [`Model`] and
//! hands clicks to the shell, as tray_sni.rs does on Linux (DESIGN-tray-background.md).
use crate::background::{Shell, TrayView};
use crate::tray::{Model, TrayAction, TrayItem};
use std::sync::{Arc, Mutex};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Wry};

/// The icon's pixels at tray size, plain and with the attention dot (RGBA).
pub struct Icons {
    plain: Vec<u8>,
    dotted: Vec<u8>,
}

const SIZE: u32 = 64;

impl Icons {
    pub fn from_rgba(rgba: &[u8], w: u32, h: u32) -> Self {
        let plain = crate::tray::scaled(rgba, w, h, SIZE);
        let dotted = crate::tray::with_dot(&plain, SIZE, SIZE);
        Self { plain, dotted }
    }
    fn image(&self, attention: bool) -> Image<'_> {
        Image::new(if attention { &self.dotted } else { &self.plain }, SIZE, SIZE)
    }
}

/// The actions behind the menu's entries, by their id (`a<n>`), for the menu drawn last.
type Actions = Arc<Mutex<Vec<TrayAction>>>;

/// Appends `items` with `add` (a menu or a submenu), numbering each action in `ids`.
fn fill(app: &AppHandle, items: &[TrayItem], ids: &mut Vec<TrayAction>, add: &dyn Fn(&dyn tauri::menu::IsMenuItem<Wry>) -> tauri::Result<()>) -> tauri::Result<()> {
    for item in items {
        match item {
            TrayItem::Action { label, action } => {
                ids.push(*action);
                add(&MenuItem::with_id(app, format!("a{}", ids.len() - 1), label, true, None::<&str>)?)?;
            }
            TrayItem::Check { label, checked, action } => {
                ids.push(*action);
                add(&CheckMenuItem::with_id(app, format!("a{}", ids.len() - 1), label, true, *checked, None::<&str>)?)?;
            }
            TrayItem::Sub { label, items } => {
                let sub = Submenu::new(app, label, true)?;
                fill(app, items, ids, &|i| sub.append(i))?;
                add(&sub)?;
            }
            TrayItem::Separator => add(&PredefinedMenuItem::separator(app)?)?,
        }
    }
    Ok(())
}

fn menu_of(app: &AppHandle, m: &Model, actions: &Actions) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    let mut ids = Vec::new();
    fill(app, &m.menu(), &mut ids, &|i| menu.append(i))?;
    *actions.lock().unwrap() = ids;
    Ok(menu)
}

struct View {
    app: AppHandle,
    tray: TrayIcon<Wry>,
    icons: Arc<Icons>,
    actions: Actions,
}

impl TrayView for View {
    fn draw(&self, m: &Model) {
        let (app, tray, icons, actions, m) = (self.app.clone(), self.tray.clone(), self.icons.clone(), self.actions.clone(), m.clone());
        // menus are made on the main thread (macOS requires it)
        let _ = self.app.run_on_main_thread(move || {
            match menu_of(&app, &m, &actions) {
                Ok(menu) => {
                    let _ = tray.set_menu(Some(menu));
                }
                Err(e) => eprintln!("atlas-app: the tray's menu: {e}"),
            }
            let _ = tray.set_tooltip(Some(m.tooltip()));
            let _ = tray.set_icon(Some(icons.image(m.attention())));
        });
    }
}

/// Puts the icon in the tray (on the main thread, from `setup`).
pub fn start(app: &AppHandle, shell: Arc<Shell>, icons: Icons, model: Model) -> Result<(), String> {
    let actions: Actions = Arc::default();
    let menu = menu_of(app, &model, &actions).map_err(|e| e.to_string())?;
    let (by_menu, by_click) = (shell.clone(), shell.clone());
    let chosen = actions.clone();
    let tray = TrayIconBuilder::with_id("atlas")
        .icon(icons.image(model.attention()))
        .tooltip(model.tooltip())
        .menu(&menu)
        .show_menu_on_left_click(false) // the left click shows or hides the window; the menu is the right click's
        .on_menu_event(move |_, ev| {
            let n = ev.id().as_ref().strip_prefix('a').and_then(|n| n.parse::<usize>().ok());
            let action = n.and_then(|n| chosen.lock().unwrap().get(n).copied());
            if let Some(a) = action {
                by_menu.act(a);
            }
        })
        .on_tray_icon_event(move |_, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                by_click.toggle();
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;
    shell.tray_online(true);
    shell.set_tray(Arc::new(View { app: app.clone(), tray, icons: Arc::new(icons), actions }));
    Ok(())
}
