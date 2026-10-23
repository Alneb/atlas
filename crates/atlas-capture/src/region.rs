//! The floating box's input region (Wayland): only the card and the open list take the pointer; a click
//! anywhere else in the window goes through to the window under it (and so closes the box, which loses the
//! focus). winit has no partial hit-testing, so the surface winit made is reached through its raw handle and
//! given a `wl_region` (`wl_surface.set_input_region`), on a queue of our own on winit's connection.
use egui::Rect;
use wayland_client::backend::{Backend, ObjectId};
use wayland_client::protocol::{wl_compositor::WlCompositor, wl_region::WlRegion, wl_registry, wl_surface::WlSurface};
use wayland_client::{Connection, Dispatch, EventQueue, Proxy, QueueHandle};
use winit::raw_window_handle::{HasDisplayHandle, HasWindowHandle, RawDisplayHandle, RawWindowHandle};
use winit::window::Window;

#[derive(Default)]
struct Globals {
    compositor: Option<WlCompositor>,
}

impl Dispatch<wl_registry::WlRegistry, ()> for Globals {
    fn event(g: &mut Self, registry: &wl_registry::WlRegistry, event: wl_registry::Event, _: &(), _: &Connection, qh: &QueueHandle<Self>) {
        if let wl_registry::Event::Global { name, interface, version } = event {
            if interface == WlCompositor::interface().name {
                g.compositor = Some(registry.bind(name, version.min(4), qh, ()));
            }
        }
    }
}

impl Dispatch<WlCompositor, ()> for Globals {
    fn event(_: &mut Self, _: &WlCompositor, _: <WlCompositor as Proxy>::Event, _: &(), _: &Connection, _: &QueueHandle<Self>) {}
}

impl Dispatch<WlRegion, ()> for Globals {
    fn event(_: &mut Self, _: &WlRegion, _: <WlRegion as Proxy>::Event, _: &(), _: &Connection, _: &QueueHandle<Self>) {}
}

pub struct InputRegion {
    conn: Connection,
    compositor: WlCompositor,
    surface: WlSurface,
    qh: QueueHandle<Globals>,
    _queue: EventQueue<Globals>,
    last: Vec<[i32; 4]>,
}

impl InputRegion {
    /// None off Wayland, or when the compositor cannot be reached (the whole window then takes the pointer).
    pub fn new(window: &Window) -> Option<Self> {
        let RawDisplayHandle::Wayland(d) = window.display_handle().ok()?.as_raw() else { return None };
        let RawWindowHandle::Wayland(w) = window.window_handle().ok()?.as_raw() else { return None };
        // SAFETY: winit's display and surface, alive as long as the window, which outlives this (window.rs)
        let backend = unsafe { Backend::from_foreign_display(d.display.as_ptr().cast()) };
        let conn = Connection::from_backend(backend);
        let mut queue = conn.new_event_queue::<Globals>();
        let qh = queue.handle();
        conn.display().get_registry(&qh, ());
        let mut globals = Globals::default();
        queue.roundtrip(&mut globals).ok()?;
        let compositor = globals.compositor?;
        let id = unsafe { ObjectId::from_ptr(WlSurface::interface(), w.surface.as_ptr().cast()) }.ok()?;
        let surface = WlSurface::from_id(&conn, id).ok()?;
        Some(Self { conn, compositor, surface, qh, _queue: queue, last: Vec::new() })
    }

    /// The parts that take the pointer, in the surface's (logical) coordinates; sent only when they changed.
    /// It takes effect with the surface's next commit — the frame being presented.
    pub fn set(&mut self, rects: &[Rect]) {
        let r: Vec<[i32; 4]> = rects
            .iter()
            .map(|r| [r.left().floor() as i32, r.top().floor() as i32, r.width().ceil() as i32 + 1, r.height().ceil() as i32 + 1])
            .collect();
        if r == self.last {
            return;
        }
        let region = self.compositor.create_region(&self.qh, ());
        for [x, y, w, h] in &r {
            region.add(*x, *y, *w, *h);
        }
        self.surface.set_input_region(Some(&region));
        region.destroy();
        if let Err(e) = self.conn.flush() {
            eprintln!("atlas-capture: input region not sent: {e}");
        }
        self.last = r;
    }
}
