# Server mode, apps that connect to it, and the Android capture app — design

The requirements (2026-10-15):

- **A server mode**: Atlas served from a server with secure authentication of some form (OIDC only if it is not too hard), a sign-in page of its own, and apps — the Android client above all — able to connect to it. Apps are still meant to be used mostly locally (faster) and synced with Syncthing.
- **An Android app**: a native Rust app built without downloading the whole Android SDK. It is simple: the capture part, a small UI to find the vault, and plugins — which are needed even offline, to process captures by the different plugins.
- **Capture on the phone must be blazing fast** (2026-10-14).
- **Sign-in**: plugins handle Authelia in both OIDC and forward-auth ("door") mode, and Authelia must be able to use YubiKeys.

Status: **design decided** (section "Decisions"); next: server mode. Nothing is built yet.

## Where Atlas stands today

- The core (`crates/atlas-core`, axum) serves the UI and `/api` on **127.0.0.1 only**. Its protection is the loopback address plus the `x-atlas: 1` header (a custom header forces a CORS preflight, which the core never answers, so another web page cannot call the API). There is **no identity**: every local process can use it — fine on one's own machine, not on a network.
- The desktop app (`crates/atlas-app`) runs the core in-process and shows the UI in WebKitGTK. `atlas serve` runs the same core headless.
- Plugins are JavaScript that runs **in the UI page** (`ui/src/lib/plugins.svelte.ts`), with helpers (Python, shell) the core runs for them. A plugin needs a page to run in.
- Captures: the native box (`crates/atlas-capture`, egui + winit + softbuffer, no web view) writes through the running Atlas or straight to the files. The phone route taken so far is ntfy (CAPTURE.md, "From the phone").
- The vaults are kept in step between machines by **Syncthing**; the apps are expected to work on their local copy (faster) and the server to be one more place, not the centre.

## 1. Server mode

`atlas serve --listen 0.0.0.0:7700` (or `[server] listen` in the machine's config) turns on everything below; on 127.0.0.1 without `--listen` nothing changes for the desktop.

### Sign-in without OIDC: secure and simple

- **One owner password**, hashed with **Argon2id** (the `argon2` crate; parameters giving ~100 ms per check), kept **outside the vault**: `~/.config/atlas/server.toml`. The vault is synced to the phone and other machines; a password hash has no business travelling with the notes. Set with `atlas server password` (asks twice, on the terminal).
- **The sign-in page** is served by the core itself at `/login` — a small page of its own (the app's colours, both themes, no JavaScript bundle needed), so it works before the UI is allowed to load. Every other path answers 401 for the API and a redirect to `/login` for pages.
- **Sessions**: a random 256-bit token in a cookie `atlas_session` with `HttpOnly; Secure; SameSite=Strict; Path=/`. The server keeps only a SHA-256 of each token (a stolen session file opens nothing), with its device name, created and last-used times; sliding expiry (30 days unused). "Sign out everywhere" in Settings drops them all.
- **Guessing is slow**: per-address back-off after failed sign-ins (1 s, 2 s, 4 s … up to 5 min), constant-time comparison, the same answer for a wrong password whatever the reason, and every attempt in the server's log.
- **TLS**: a typical self-hosted server already has a reverse proxy in front of its services (the one that fronts Authelia). The recommended setup is Atlas on a LAN port behind it; the cookie is `Secure`, so the core refuses to issue it over plain HTTP unless the request came through a configured proxy (`[server] trusted_proxies`, honouring `X-Forwarded-Proto: https` only from those addresses) or `--allow-plain-http` was given (on a trusted LAN or VPN). Optional built-in TLS (`rustls`, `--tls-cert/--tls-key`) for running without a proxy.
- The `x-atlas` header check stays: with SameSite=Strict it is defence in depth against cross-site requests.

### Security keys (YubiKey) — the second step

**Passkeys / WebAuthn** with `webauthn-rs`: register a YubiKey in Settings → Server → Security keys; then the sign-in asks for the key after the password (or instead of it). The sign-in page is a normal web page, so the browser (Firefox, Chrome, the phone's browser) talks to the key; this is the part that is hard in an embedded WebKitGTK window, and it is avoided by signing in in a real browser or in the desktop app's own window only when WebKitGTK supports it (to be measured; the Authelia sign-in work has the same question).

### Behind Authelia instead (optional, cheap)

When an Authelia gate already guards the domain ("door" / forward-auth mode), Atlas can trust it: `[server] trusted_proxies = ["10.0.0.2"]`, `remote_user_header = "Remote-User"` — a request from the proxy carrying the header is signed in as the owner, and nothing else is accepted from anywhere. Authelia brings its own second factor (YubiKeys included). About 50 lines in the core. **OIDC** proper (Atlas as an OIDC client of Authelia: authorization code + PKCE with the `openidconnect` crate, an ID token checked, then the same session cookie) is perhaps two days of work and testing — not hard, but the forward-auth route gives the same result with Authelia for far less.

### What a signed-in browser may do

Everything the local UI does — **except what runs code on the server**, which is off by default in server mode and switched on per vault: terminals (a terminal in a browser is a shell on the server), plugin helpers (Python/shell scripts), "run this code block". A stolen session must not be a remote shell. Settings → Server shows these switches.

## 2. Apps that connect to the server

- **Device tokens** for programs (the Android app, the desktop app pointing at the server, scripts): `Authorization: Bearer atl_<random>`. Made in Settings → Server → Devices (named, shown once, with a QR code for the phone), or by **pairing**: the app shows a six-letter code, the user approves it in the signed-in web page. Stored as SHA-256, with last-used time; revocable one by one. **Scopes**: `capture` (append-only: `POST /api/capture`, read the vault's names for completions) or `full`. The phone gets `capture` unless asked otherwise.
- The **WebSocket** (`/api/events`) accepts the session cookie, or the token in the `Sec-WebSocket-Protocol` header — never in the URL (URLs end up in logs).
- **The desktop app**: "Open a vault on a server…" (address, then the sign-in page in the app's window; the cookie stays in that window's store). The normal case remains the local vault synced by Syncthing: the server is for a browser away from home, and for the phone when it is online.

## 3. The Android app

What it is: the capture box, a way to pick the vault folder (the Syncthing copy on the phone), and the plugins' processing of captures.

### Native Rust without the Android SDK

The capture box is **already** egui + winit + softbuffer, and all three run on Android: winit through `android-activity` (a `NativeActivity`, no Java written by us), egui unchanged, softbuffer drawing into the `ANativeWindow`. So the phone app is the same crate, `atlas-capture`, built for `aarch64-linux-android` with a `lib.rs` entry point — not a second app.

The toolchain, smallest first (to be **measured** here before choosing — the download size and whether the APK installs):

1. **xbuild** (`x build --platform android --format apk`, rust-mobile): fetches precompiled artifacts and packages and signs the APK itself (in Rust), no Gradle; to check whether it still needs the NDK on disk.
2. **The NDK alone** (bionic's sysroot and `clang`/`lld`; no SDK, no Gradle, no Android Studio, no emulator) + `cargo-ndk` to build the `.so`, and the APK assembled and signed by a small Rust tool (`apk` crate / `zip` + `apksig`), with a hand-written `AndroidManifest.xml` compiled to binary XML in Rust too.
   **Checked 2026-10-15:** xbuild's own page now reads *"Cross compile rust to any platform (unmaintained)"* — not a base for the phone app. So: (2), the NDK alone. Already on this machine: the Rust targets `aarch64-linux-android` (and armv7, x86_64), `javac` (OpenJDK 25), `adb` (android-tools). Missing: the NDK (≈1 GB to download, a few hundred MB kept once only its sysroot and clang are needed) — **asked of the user before downloading**. The APK is then assembled without the SDK's `aapt2`: the `apk` crate (binary manifest, zip, v2 signing; it is the part of xbuild that is a library) or a small packer of our own.
3. Not: Tauri's Android target, Gradle, Android Studio.

Testing: no emulator (that is the SDK); on a real phone over `adb` (Fedora's `android-tools`, a few MB) or by sending the APK. The look checks continue on the desktop (the same egui code draws the same pixels in the hidden KWin).

What NativeActivity allows without any Java: the box itself; **a share target** (the manifest's intent filter; the shared text read from `getIntent()` through JNI); a **home-screen shortcut** to the app (the launcher's own long-press shortcuts are manifest XML). What needs Java/Kotlin code (so `d8` from the SDK, or a pre-built `classes.dex` checked in): a home-screen widget, a quick-settings tile, a notification reply. Those are later, and only if the share sheet and the shortcut are not fast enough.

**Finding the vault**: Syncthing(-Fork) keeps the folder in shared storage (e.g. `/storage/emulated/0/Sync/Notes`). Reading and writing there from native code needs the "all files access" permission (asked once) and then a plain folder picker drawn in egui (the same list look as the vault menu); the Storage Access Framework would need Java and a content-URI layer for every file. The app remembers the chosen folders (several vaults, as on the desktop: Super+V there, a tap on the pill here).

### Plugins on the phone

Plugins are JavaScript that run in the UI page; the phone app has no page. Yet they are needed offline, to process captures by the different plugins. Three ways:

- **(a) Process later, where Atlas runs (recommended to start).** A capture is a file. The phone writes it exactly as the desktop box does (the same `Capture` code: `[] ` a to-do, `@fri` a date, `[[` a link); a capture that a plugin should treat (a URL to clip, a paper to fetch) is marked as **waiting** (a line in `.atlas/inbox/` or a property on the note). Syncthing brings it to the desktop or the server, and the Atlas there runs the plugins over the waiting ones, **once** (the mark is removed in the same write; Syncthing carries the change back). Nothing is lost offline; the processing waits for a machine that has the plugins and, usually, the network the plugins need anyway (clipping a page, fetching a DOI).
- **(b) Send to the server when online.** With a device token, the phone posts the capture to the server's `/api/capture`; the server's Atlas runs the plugins at once; offline, (a). Fastest result when there is signal.
- **(c) Run the plugins on the phone.** Embed a JavaScript engine (QuickJS through `rquickjs`, about 1 MB) and give plugins a small `atlas` subset there (the capture hook, `atlas.fetch`, the vault's files). JavaScript stays the only plugin language. The cost is a second plugin runtime to keep in step with the UI's, and every plugin must say which of its parts run there.

(a) + (b) need no second runtime and cover the offline case by waiting; (c) is only worth it if some processing must happen on the phone, offline, at capture time. The open question is below.

## Order of work (proposed)

1. Server mode: password, sessions, sign-in page, back-off, the switches for code-running features, device tokens with scopes; Rust tests for every rule (wrong password, expired session, token scope, proxy trust) and a Playwright spec for the sign-in page; DEVELOPING.md and a REFACTOR note.
2. The Authelia forward-auth trust (small), then WebAuthn security keys.
3. Android: measure the toolchain (1 vs 2 above) with a one-screen egui APK; then `atlas-capture` as a library with the Android entry point, the folder picker, the share target.
4. The waiting-captures inbox and its processing on the desktop/server; then the phone's "send now" with a device token.

## Decisions (2026-10-15) — these decide the design

1. **Sign-in: both, chosen by configuration** — password + device tokens built in, **and** trusting Authelia in front (forward-auth), both available depending on configuration. So `[server] auth = "password" | "proxy" | "both"`: with `both`, a request from a trusted proxy carrying `Remote-User` is signed in, and anything else meets the sign-in page (and device tokens always work, for the phone). OIDC is not built.
2. **Plugins for phone captures: both** — first "later, where Atlas runs" (the waiting mark, processed once by the desktop/server; sent straight to the server when online), then plugins on the phone itself (QuickJS) for the ones that must act at capture time.
3. **Code-running features in server mode: the same as local** — terminals, helpers and code blocks work in the browser as in the desktop app, behind the sign-in. Consequence: the sign-in is the only thing between the internet and a shell on the server, so the password path keeps the back-off, sessions are revocable, and the Authelia route (with its second factor) is the recommended way to expose it beyond the LAN; this is said in Settings → Server and in the docs, and not changed silently.
4. **Speed on the phone**:
   - **A quick-settings tile** — the same pull-down panel as Android's screenshot button. One tap opens the capture box with three choices, combinable: **the screen I was on** (as a screenshot), **the clipboard**, **write something**. No widget (agreed: a tile is reachable from any app, a widget only from the home screen).
   - **The share sheet** stays, for files and anything an app shares.
   - What this costs: a tile is a `TileService`, a small Java class; the screenshot of "the screen I was on" is taken either by Android's screen-capture permission (`MediaProjection`, which since Android 14 asks for consent each time — too slow for this) or by an **accessibility service's `takeScreenshot()`** (Android 11+, no prompt once the service is enabled in Settings → Accessibility; fine for an app installed by hand, which this is). The tile collapses the panel, takes the screenshot of what is under it, then opens the box. The clipboard can be read because the box has the focus when it asks (Android 10+ allows that only to the focused app).
   - The Java pieces stay tiny (the tile, the accessibility service, a hand-off to the Rust activity through an intent). Building them needs only `javac` (Fedora's JDK), `android.jar` (the API stubs, one file) and `d8`/R8 (one jar from Google's Maven) — not the SDK manager, Gradle or Android Studio. The rest is the Rust `atlas-capture`.

## Open questions (2026-10-15; answered above)

1. Sign-in: built-in password + device tokens (recommended), and/or trust Authelia's forward-auth, and/or OIDC with Authelia?
2. Plugins for phone captures: process later where Atlas runs + send to the server when online (recommended), or plugins running on the phone itself?
3. Code-running features (terminals, helpers) in server mode: off unless switched on per vault (recommended)?
4. Reflective: which phone captures *need* a plugin before they reach a computer — and is the share sheet + a home-screen shortcut fast enough, or is a widget / quick tile the real target?
