//! The input region off Linux: Wayland's partial hit-testing has no counterpart here, so the box never floats and
//! the whole window takes the pointer (region.rs is the Wayland one).
use egui::Rect;
use winit::window::Window;

pub struct InputRegion;

impl InputRegion {
    pub fn new(_window: &Window) -> Option<Self> {
        None
    }

    pub fn set(&mut self, _rects: &[Rect]) {}
}
