//! Where Linux, macOS and Windows differ (docs/design/DESIGN-desktop-ports.md): folders, processes, opening things
//! outside Atlas, and starting a command line. Every caller goes through here; nothing else in the core branches on
//! the operating system.
pub mod dirs;
pub mod open;
pub mod proc;
pub mod run_line;
