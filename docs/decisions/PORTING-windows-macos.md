# Porting Atlas to Windows and macOS: a study

Atlas is built and used on Linux (KDE Plasma, Wayland). This study says what stands between it and Windows and macOS,
part by part, how big each step is, and the order to take them in. It was written from the code on 2026-10-23. CI runs
`cargo check -p atlas-core -p atlas` on both systems as a non-blocking job (`.github/workflows/ci.yml`, job `port`),
so progress is visible.

## The short answer

It is **not hard for the core and the browser UI**, and **medium for the desktop app**. The quick-capture box and the
Android-only parts stay Linux- or Android-only.

- Most of Atlas is already portable. The UI is a web page (Svelte, CodeMirror, pdf.js), and the desktop window is
  Tauri 2, which runs on all three systems (WebView2 on Windows, WKWebView on macOS). The core is Rust on tokio and
  axum. Terminals use `portable-pty`, which speaks ConPTY on Windows.
- What blocks the build today is a dozen Unix-only spots in the core, each small. What changes behaviour is a
  handful of Linux conventions: XDG folders, `sh`, `xdg-open`, `/proc`.
- What is truly Linux-only is the global quick-capture box (`crates/atlas-capture`: Wayland layer shell, KWin
  scripts, D-Bus, a patched softbuffer). It needs a separate small implementation per system, or a fallback to a
  Tauri window.

Rough effort: **1–2 weeks** for the core and the CLI to build and pass their tests on both systems; **another 1–2
weeks** for the desktop app to feel native (menus, shortcuts, packaging, signing); the capture box **later**, per
system.

## Part by part

| Part | What is Linux-specific now | What to do | Size |
|---|---|---|---|
| `today.rs` | `MetadataExt::ino()` in a cache key | use `(mtime, len)` plus the file id from `same-file`, or drop the inode off Unix | S |
| `vaults.rs` `open_window` | `CommandExt::process_group(0)` | `#[cfg(unix)]` it; on Windows `creation_flags(DETACHED_PROCESS \| CREATE_NEW_PROCESS_GROUP)` | S |
| `vaults.rs` `running_server` | a process alive = `/proc/<pid>` exists | the `sysinfo` crate (or `kill(pid, 0)` on Unix, `OpenProcess` on Windows) | S |
| `commands.rs`, `helper.rs` | scripts and helpers run through `sh -c` | a `shell_command()` helper: `sh -c` on Unix, `cmd /C` (or PowerShell) on Windows; a plugin's `run` line documented per system | M |
| `pty.rs` | default shell `$SHELL` or `/bin/sh` | Windows: `%COMSPEC%` / PowerShell (`pwsh` when present); macOS: `$SHELL` (zsh) works as is | S |
| `server.rs`, `atlas-app/main.rs` | `xdg-open` for "show in file manager" and links | the `opener` crate (or `tauri-plugin-opener`): `explorer /select,`, `open -R` | S |
| `auth.rs`, `mirror_guard.rs`, `agents.rs`, `paths.rs` | `$XDG_CONFIG_HOME` / `$XDG_STATE_HOME` / `$HOME` fallbacks | the `dirs` crate behind one `atlas_core::dirs` module: `%APPDATA%\Atlas`, `~/Library/Application Support/Atlas`; the env overrides stay | M |
| `secrets.rs`, `vault_write.rs`, `auth.rs` | owner-only files by mode `0o600` (already `#[cfg(unix)]`) | Windows: files under the user's profile are private by default; optionally the OS keychain (`keyring` crate) | S |
| `capture.rs` | host name from `/proc/sys/kernel/hostname`, else `$HOSTNAME` | the `gethostname` crate | S |
| tests | `std::os::unix::fs::symlink` in path-escape tests | `#[cfg(unix)]` those tests; add Windows junction cases later | S |
| `atlas-app` (Tauri) | `#[cfg(target_os = "linux")]` blocks: WebKitGTK settings (GPU, scrolling), the browser tab's WebKit specifics | their WebView2 and WKWebView counterparts, or skip them | M |
| global shortcuts | KDE (`packaging/kde-shortcut.sh`) | `tauri-plugin-global-shortcut` | S |
| `atlas-capture` | Wayland, layer-shell, KWin script for the window under the box, D-Bus, Spectacle, patched softbuffer | first a Tauri window for capture on Windows and macOS (no "page under the box" context); a native one per system later | L |
| plugins | most are JavaScript; helpers in Python call `python3`; Rust engines build static with musl | `python` on Windows (or ship helpers as Rust engines); engines built per target in CI; each plugin declares its systems (PLUGIN-MATURITY.md, criterion 8) | M |
| packaging | `packaging/install.sh` (bash, `~/.local`), AppImage/deb/rpm/Flatpak | Tauri's bundler: `.msi`/NSIS on Windows, `.dmg`/`.app` on macOS; code signing (Authenticode, Apple notarization) | M |
| dev scripts | bash, `systemd-run` (`heavy.sh`), KWin capture | stay Linux-only tools; the gate runs in WSL or Git Bash on Windows, natively on macOS | — |

## Order

1. **The core and the CLI build** on both systems (the S rows): CI's `port` job turns green. `atlas serve` then works
   there, and the browser UI with it. That is already a usable Atlas on any system.
2. **One `dirs` module and one `shell_command` helper** (the M rows of the core), with their tests on all three
   systems; the CI job runs `cargo test` instead of `cargo check`.
3. **The desktop app**: the Tauri-specific blocks, opener, global shortcuts; the Release workflow adds `.msi` and
   `.dmg`.
4. **Plugins**: each declares its systems; the Rust engines are built per target.
5. **The capture box**: a Tauri fallback first, native later if it is worth it.

## What to watch out for

- **Paths**: the core joins paths as strings in places (`format!("{}/…")`), and vault-relative paths are always `/`.
  On Windows the vault-relative form must stay `/` (it is what notes link with) while file-system paths use `\`. One
  conversion point (`paths.rs`) rather than fixes spread around.
- **Case-insensitive file systems** (default on both): two notes `Foo.md` and `foo.md` are one file there. The index
  must not assume otherwise.
- **File watching**: `notify` works on all three, but events differ (macOS FSEvents batches; Windows renames come as
  two events). The watcher's tests should run in CI on each system.
- **Line endings**: notes written on Windows may carry `\r\n`. The markdown parsers and the task/frontmatter editors
  must keep a file's own line endings when they rewrite a line.
