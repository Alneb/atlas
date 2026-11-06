//! The tray icon on Linux: a StatusNotifierItem over D-Bus (ksni), which KDE Plasma, GNOME's AppIndicator extension,
//! XFCE, Cinnamon and the bars of tiling compositors show. Pure Rust: Tauri's own tray loads libayatana-appindicator at
//! run time and panics without it (DESIGN-tray-background.md). It draws the [`Model`] and hands clicks to the shell.
use crate::background::{Shell, TrayView};
use crate::tray::{Model, TrayAction, TrayItem};
use ksni::TrayMethods;
use std::sync::Arc;

/// The pixels of the app's icon at tray size, as RGBA, and the same with the attention dot.
pub struct Icons {
    pub plain: ksni::Icon,
    pub dotted: ksni::Icon,
}

const SIZE: u32 = 64;

impl Icons {
    pub fn from_rgba(rgba: &[u8], w: u32, h: u32) -> Self {
        let small = crate::tray::scaled(rgba, w, h, SIZE);
        let dotted = crate::tray::with_dot(&small, SIZE, SIZE);
        Self { plain: argb(&small), dotted: argb(&dotted) }
    }
}

/// StatusNotifierItem wants ARGB32 in network byte order.
fn argb(rgba: &[u8]) -> ksni::Icon {
    let data = rgba.as_chunks::<4>().0.iter().flat_map(|p| [p[3], p[0], p[1], p[2]]).collect();
    ksni::Icon { width: SIZE as i32, height: SIZE as i32, data }
}

struct Sni {
    model: Model,
    shell: Arc<Shell>,
    icons: Arc<Icons>,
}

impl ksni::Tray for Sni {
    fn id(&self) -> String {
        "atlas".into()
    }
    fn title(&self) -> String {
        self.model.tooltip()
    }
    fn icon_name(&self) -> String {
        String::new() // the pixmap: an installed theme icon named atlas may be older or missing (AppImage)
    }
    /// Unseen notices: the dotted icon, steady. `NeedsAttention` would make Plasma pulse it for as long as they wait.
    fn icon_pixmap(&self) -> Vec<ksni::Icon> {
        vec![if self.model.attention() { self.icons.dotted.clone() } else { self.icons.plain.clone() }]
    }
    fn status(&self) -> ksni::Status {
        ksni::Status::Active
    }
    fn tool_tip(&self) -> ksni::ToolTip {
        ksni::ToolTip { title: self.model.tooltip(), ..Default::default() }
    }
    fn activate(&mut self, _x: i32, _y: i32) {
        self.shell.toggle();
    }
    fn menu(&self) -> Vec<ksni::MenuItem<Self>> {
        items(&self.model.menu())
    }
    fn watcher_online(&self) {
        self.shell.tray_online(true);
    }
    fn watcher_offline(&self, _reason: ksni::OfflineReason) -> bool {
        self.shell.tray_online(false); // closing quits again until a tray host comes back
        true
    }
}

fn items(list: &[TrayItem]) -> Vec<ksni::MenuItem<Sni>> {
    use ksni::menu::{CheckmarkItem, StandardItem, SubMenu};
    let on = |a: TrayAction| -> Box<dyn Fn(&mut Sni) + Send> { Box::new(move |t: &mut Sni| t.shell.act(a)) };
    list.iter()
        .map(|i| match i {
            TrayItem::Action { label, action } => StandardItem { label: label.clone(), activate: on(*action), ..Default::default() }.into(),
            TrayItem::Check { label, checked, action } => CheckmarkItem { label: label.clone(), checked: *checked, activate: on(*action), ..Default::default() }.into(),
            TrayItem::Sub { label, items: sub } => SubMenu { label: label.clone(), submenu: items(sub), ..Default::default() }.into(),
            TrayItem::Separator => ksni::MenuItem::Separator,
        })
        .collect()
}

struct View(ksni::Handle<Sni>);

impl TrayView for View {
    fn draw(&self, m: &Model) {
        let (handle, m) = (self.0.clone(), m.clone());
        tauri::async_runtime::spawn(async move {
            handle.update(|t| t.model = m).await;
        });
    }
}

/// Puts the icon in the tray. Err: no tray host answers (nothing shows it), said by the caller.
pub async fn start(shell: Arc<Shell>, icons: Icons, model: Model) -> Result<(), String> {
    let tray = Sni { model, shell: shell.clone(), icons: Arc::new(icons) };
    let handle = tray.spawn().await.map_err(|e| e.to_string())?;
    shell.tray_online(true);
    shell.set_tray(Arc::new(View(handle)));
    Ok(())
}
