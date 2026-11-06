# Plugin helpers inside the phone app

The phone runs programs only from the APK's own native-library folder (Android forbids running files from storage an app
can write). So a plugin helper that is a compiled program — Rust, C++, anything — goes **in the APK**: put its Android build
here as `helpers/<arch>/<name>` (`<arch>`: `arm64-v8a`, and `x86_64` for the emulator), and `build-apk.sh` ships it as
`lib/<arch>/lib<name>.so`; the app links `<name>` to it on the helpers' `PATH`, so a plugin's `helper = "<name> …"` (or
`data = "<name> …"`) runs unchanged. A phone runs no Python: script helpers are JavaScript, run in the core (`[helper] js`).
