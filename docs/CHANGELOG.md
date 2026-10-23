# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/) once 1.0 is out.

## [Unreleased]

### Added
- First public release: the desktop app (Linux), the `atlas` CLI, the server mode with its Docker image and
  `compose.yaml`, the Android capture app, and the plugins in `plugins/stable/` and `plugins/beta/`.
- Packages for Linux: AppImage, `.deb`, `.rpm` and Flatpak, built by the Release workflow.
- `AGENTS.md`: rules for AI coding agents working in the repository, and a `tidy` stage in the gate.
- [Plugin maturity](guides/PLUGIN-MATURITY.md): what beta and stable promise, and the criteria for stable.
- [Porting study](decisions/PORTING-windows-macos.md) for Windows and macOS.
