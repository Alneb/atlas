# softbuffer 0.4.8, patched for Atlas

Upstream: https://github.com/rust-windowing/softbuffer, version 0.4.8 from crates.io, unchanged except:

- `src/backends/wayland/buffer.rs`: the two `wl_shm::Format::Xrgb8888` are `Argb8888`, so the alpha byte of a
  pixel reaches the compositor (premultiplied, as Wayland expects). The quick-capture box
  (`crates/atlas-capture`) needs it for its rounded, shadowed card and its lists drawn in the transparent part
  of a window that never resizes (docs/guides/CAPTURE.md, "Floating lists").

Drop this copy (and `[patch.crates-io]` in the root Cargo.toml) when softbuffer offers transparency itself.
