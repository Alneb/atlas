//! The window: winit for the window and the keys (through egui-winit, as eframe does), softbuffer
//! for a plain pixel buffer, and `raster` to paint egui's output into it. No GPU and no GL context
//! to start — what made the first frame late (measured in docs/guides/CAPTURE.md, "How fast it opens").
use crate::app::{Capture, FLOAT_HEIGHT, FLOAT_WIDTH, HEIGHT, WIDTH};
use crate::region::InputRegion;
use crate::{look, raster::Canvas};
use egui::{ViewportCommand, ViewportId, ViewportInfo};
use std::num::NonZeroU32;
use std::rc::Rc;
use std::time::{Duration, Instant};
use winit::application::ApplicationHandler;
use winit::dpi::LogicalSize;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::window::{Window, WindowAttributes, WindowId, WindowLevel};

struct Shown {
    // fields drop in order: the input region's proxies before the window they belong to
    region: Option<InputRegion>,
    surface: softbuffer::Surface<Rc<Window>, Rc<Window>>,
    window: Rc<Window>,
    input: egui_winit::State,
    info: ViewportInfo,
}

struct Run {
    cap: Capture,
    ctx: egui::Context,
    canvas: Canvas,
    shown: Option<Shown>,
    /// a frame asked for later (a timer: the "saved" message, a size check)
    next: Option<Instant>,
    started: Instant,
    timing: bool,
    frames: u32,
}

pub fn run(cap: Capture, started: Instant, timing: bool) -> anyhow::Result<()> {
    let events = EventLoop::new()?;
    let mut run = Run { cap, ctx: egui::Context::default(), canvas: Canvas::default(), shown: None, next: None, started, timing, frames: 0 };
    run.cap.prepare(&run.ctx);
    events.run_app(&mut run)?;
    Ok(())
}

fn attributes(el: &ActiveEventLoop, floating: bool) -> WindowAttributes {
    let (w, h) = if floating { (FLOAT_WIDTH, FLOAT_HEIGHT) } else { (WIDTH, HEIGHT) };
    let mut a = Window::default_attributes()
        .with_title("Atlas capture")
        .with_inner_size(LogicalSize::new(w, h))
        // floating: the card's corners, its shadow and the room for a list are see-through
        .with_transparent(floating)
        // resizable: on Wayland a fixed-size window is pinned to its first size, so a list could not grow it
        .with_resizable(true)
        .with_decorations(false)
        .with_window_level(WindowLevel::AlwaysOnTop)
        .with_active(true);
    // the desktop's name for it (a shortcut, a window rule): atlas-capture
    #[cfg(target_os = "linux")]
    {
        a = winit::platform::wayland::WindowAttributesExtWayland::with_name(a, "atlas-capture", "atlas-capture");
        a = winit::platform::x11::WindowAttributesExtX11::with_name(a, "atlas-capture", "atlas-capture");
    }
    // the window's own icon (X11; Wayland takes it from the desktop file the app id names)
    a = a.with_window_icon(window_icon());
    // centred, a third of the way down (X11; on Wayland the compositor places it)
    if let Some(m) = el.primary_monitor() {
        let (s, at) = (m.size().to_logical::<f64>(m.scale_factor()), m.position().to_logical::<f64>(m.scale_factor()));
        a = a.with_position(winit::dpi::LogicalPosition::new(at.x + (s.width - f64::from(w)) / 2.0, at.y + s.height / 3.0));
    }
    a
}

/// Atlas's icon (packaging/icon/atlas.svg, at 64 px by scripts/dev/icons.mjs), built into the program.
fn window_icon() -> Option<winit::window::Icon> {
    let mut dec = png::Decoder::new(&include_bytes!("../../atlas-app/icons/64x64.png")[..]);
    dec.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = dec.read_info().ok()?;
    let mut buf = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).ok()?;
    // rsvg-convert always writes RGBA; anything else means the file was replaced by hand
    (info.color_type == png::ColorType::Rgba).then_some(())?;
    buf.truncate(info.buffer_size());
    winit::window::Icon::from_rgba(buf, info.width, info.height).ok()
}

impl Run {
    fn show(&mut self, el: &ActiveEventLoop) -> anyhow::Result<()> {
        // floating on Wayland, where the compositor takes the alpha (and the box cannot place a second window);
        // ATLAS_CAPTURE_FLOAT=0 keeps the growing box there too
        #[cfg(target_os = "linux")]
        let wayland = winit::platform::wayland::ActiveEventLoopExtWayland::is_wayland(el);
        #[cfg(not(target_os = "linux"))]
        let wayland = false;
        self.cap.floating = wayland && std::env::var("ATLAS_CAPTURE_FLOAT").map_or(true, |v| v != "0");
        if self.cap.floating {
            self.cap.asked = FLOAT_HEIGHT;
        }
        let window = Rc::new(el.create_window(attributes(el, self.cap.floating))?);
        let context = softbuffer::Context::new(window.clone()).map_err(|e| anyhow::anyhow!("{e}"))?;
        let surface = softbuffer::Surface::new(&context, window.clone()).map_err(|e| anyhow::anyhow!("{e}"))?;
        let input = egui_winit::State::new(self.ctx.clone(), ViewportId::ROOT, &window, Some(window.scale_factor() as f32), None, None);
        let mut info = ViewportInfo::default();
        egui_winit::update_viewport_info(&mut info, &self.ctx, &window, true);
        if self.timing {
            eprintln!("atlas-capture: window ready after {} ms", self.started.elapsed().as_millis());
        }
        window.request_redraw();
        let region = if self.cap.floating { InputRegion::new(&window) } else { None };
        if self.cap.floating && region.is_none() {
            eprintln!("atlas-capture: no input region: the whole window takes the pointer");
        }
        self.shown = Some(Shown { region, surface, window, input, info });
        Ok(())
    }

    fn paint(&mut self, el: &ActiveEventLoop) {
        let Some(s) = self.shown.as_mut() else { return };
        let mut raw = s.input.take_egui_input(&s.window);
        egui_winit::update_viewport_info(&mut s.info, &self.ctx, &s.window, false);
        raw.viewports.insert(ViewportId::ROOT, s.info.clone());
        let cap = &mut self.cap;
        let mut out = self.ctx.run(raw, |ctx| cap.frame(ctx));
        s.info.events.clear();
        s.input.handle_platform_output(&s.window, std::mem::take(&mut out.platform_output));
        let (commands, delay) = out.viewport_output.remove(&ViewportId::ROOT).map_or((vec![], Duration::MAX), |v| (v.commands, v.repaint_delay));
        if commands.contains(&ViewportCommand::Close) {
            el.exit();
            return;
        }
        egui_winit::process_viewport_commands(&self.ctx, &mut s.info, commands, &s.window, &mut Default::default());

        // the window's size as winit has it now: a size just asked for is applied at once on Wayland
        let size = s.window.inner_size();
        let (Some(w), Some(h)) = (NonZeroU32::new(size.width), NonZeroU32::new(size.height)) else { return };
        self.canvas.update(&out.textures_delta);
        let prims = self.ctx.tessellate(std::mem::take(&mut out.shapes), out.pixels_per_point);
        if let Some(r) = s.region.as_mut() {
            r.set(&self.cap.hit);
        }
        if s.surface.resize(w, h).is_ok() {
            if let Ok(mut buf) = s.surface.buffer_mut() {
                let bg = if self.cap.floating { egui::Color32::TRANSPARENT } else { look::palette(&self.ctx).bg };
                self.canvas.paint(&mut buf, size.width as usize, size.height as usize, out.pixels_per_point, bg, &prims);
                s.window.pre_present_notify();
                if let Err(e) = buf.present() {
                    eprintln!("atlas-capture: could not show the frame: {e}");
                }
            }
        }
        self.canvas.free(&out.textures_delta);
        self.frames += 1;
        if self.timing && self.frames == 1 {
            eprintln!("atlas-capture: first frame shown after {} ms", self.started.elapsed().as_millis());
        }
        self.next = match delay {
            d if d.is_zero() => {
                s.window.request_redraw();
                None
            }
            d if d < Duration::from_secs(3600) => Some(Instant::now() + d),
            _ => None,
        };
    }
}

impl ApplicationHandler for Run {
    fn resumed(&mut self, el: &ActiveEventLoop) {
        if self.shown.is_none() {
            if let Err(e) = self.show(el) {
                eprintln!("atlas-capture: no window: {e}");
                el.exit();
            }
        }
    }

    fn window_event(&mut self, el: &ActiveEventLoop, _id: WindowId, event: WindowEvent) {
        match event {
            WindowEvent::CloseRequested => return el.exit(),
            WindowEvent::RedrawRequested => return self.paint(el),
            WindowEvent::ModifiersChanged(m) => self.cap.super_key = m.state().super_key(),
            _ => {}
        }
        let Some(s) = self.shown.as_mut() else { return };
        if s.input.on_window_event(&s.window, &event).repaint {
            s.window.request_redraw();
        }
    }

    fn about_to_wait(&mut self, el: &ActiveEventLoop) {
        match self.next {
            Some(at) if at <= Instant::now() => {
                self.next = None;
                if let Some(s) = &self.shown {
                    s.window.request_redraw();
                }
                el.set_control_flow(ControlFlow::Wait);
            }
            Some(at) => el.set_control_flow(ControlFlow::WaitUntil(at)),
            None => el.set_control_flow(ControlFlow::Wait),
        }
    }

    /// The window (and egui's clipboard thread on the Wayland connection) goes while the connection is still open:
    /// `run_app` consumes the event loop and closes it, and dropping them after that crashed every normal close (SIGSEGV).
    fn exiting(&mut self, _el: &ActiveEventLoop) {
        self.shown = None;
    }
}
