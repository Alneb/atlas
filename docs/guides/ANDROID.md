# Atlas on the phone — the capture app

The requirements: a native Rust app for Android, built without downloading the whole Android SDK; the app is simple — the capture part, a small UI to find the vault, and plugins. It must be very fast and reachable by a shortcut like the screenshot one, offering the last screen as a screenshot, the clipboard, typed text, or all of them; sharing files into it stays important. Android came first.

## What it is

`crates/atlas-android`: the **capture box of the desktop** (`crates/atlas-capture`, egui painted on the CPU into a softbuffer surface), run by Android's `NativeActivity` through winit's `android-native-activity`. The same `Capture` code, the same short forms (`[] ` a to-do, `@fri` a date, `[[` a link, `#` a tag), the same file writing (`atlas_core::capture`). `atlas-capture` became a library for it (`src/lib.rs`; the desktop binary is `src/main.rs`), with `window::run` taking the event loop its caller made, and the Wayland input region a no-op on Android (`region_none.rs`).

## The toolchain (no SDK manager, Gradle, Studio or emulator)

`bash crates/atlas-android/get-toolchain.sh` puts into `atlas/local/toolchains/` (git-ignored; everything stays inside the repository folder), each archive checked against Google's SHA-1 from its repository index:

| piece | what for | size |
|---|---|---|
| NDK r30 (`android-ndk-r30`) | clang as the linker, bionic's sysroot | 738 MB zip |
| build-tools 37 (`unpack/android-37.0`) | `aapt2` (the binary manifest), `zipalign`, `apksigner`, later `d8` (the tile's Java) | 66 MB |
| platform android-37.2 (`unpack/android-37.2`) | `android.jar`, the API stubs `aapt2` and `javac` compile against | 68 MB |

Already on the machine: the Rust target `aarch64-linux-android`, `javac` (OpenJDK 25), `keytool`, `adb` (Fedora's android-tools). Why not xbuild: its own page now says *"(unmaintained)"*; cargo-apk needs the same build-tools anyway.

RAR comics (`.cbr`): the phone has no `bsdtar`, `unar` or `unrar`, so the core links libarchive (BSD) there, built by `crates/atlas-rar` from its release source (pinned by SHA-256, fetched by curl into the build folder, or `ATLAS_LIBARCHIVE_TARBALL` offline) with only the RAR4/RAR5 readers; cmake needs `cmake` on the build machine and takes the NDK's toolchain file from `ANDROID_NDK_ROOT` (set by `build-apk.sh`). The desktop and the server keep the programs. Never the unrar crate: its licence forbids writing a RAR compressor from it.

## Build and install

```sh
bash crates/atlas-android/build-apk.sh          # → target/dist/android/atlas-capture.apk (signed with a key of this machine)
adb install -r target/dist/android/atlas-capture.apk   # the phone with USB debugging on (or send the file and open it)
```

The script: `cargo build -p atlas-android --target aarch64-linux-android --release` with the NDK's `aarch64-linux-android26-clang` as linker → `llvm-strip` → `aapt2 link` of `crates/atlas-android/android/AndroidManifest.xml` against `android.jar` → the `.so` zipped in as `lib/arm64-v8a/` → `zipalign` → `apksigner` (key `local/toolchains/atlas-debug.keystore`, made once). Android 8.0 (API 26) and newer.

**Signing.** Android installs an update only when it carries the same signature as the app already there. The script
signs with `local/toolchains/atlas-debug.keystore` (store and key password `atlas-debug`, alias `atlas`), made once if
missing. CI and releases (`.github/workflows/packages.yml`) write the project's key there first, from the repository
secret `ANDROID_KEYSTORE_B64` (the keystore file in base64: `base64 -w0 local/toolchains/atlas-debug.keystore`), so an
APK from any run or release installs over the one before, and over one built on the maintainer's machine. Without the
secret (a fork, a Dependabot pull request) a run signs with a key made for it, and says so; a release refuses.

## The plan for the rework

Two runs on the phone showed that the text line was not a normal Android text box (some keyboard features did not work), that the box sat under the notification bar and looked poor, lacked most of the planned features, and had no icon. The chosen way on: **Android widgets + Rust core, looking like a modern Android app**, keeping the desktop's visual style, with the screens in Java.

So the egui box (what is in `crates/atlas-android` now) is a stepping stone, replaced by:

- **Java for the screen, no Gradle, no AndroidX**: `javac` against `local/toolchains/unpack/android-37.2/android.jar`, `d8` from build-tools → `classes.dex`; resources compiled by `aapt2` (already in `build-apk.sh`). Platform widgets only: a real `EditText` (autocorrect, swipe, selection handles, paste), buttons, a list for completions and vaults.
- **The desktop's look**: the capture box's own palette and shapes (`crates/atlas-capture/src/look.rs`: the dark `#1f2128`-ish card, text `#dcdfe5`, accent `#8aa4ff`; light: white, `#4864dd`), rounded cards with the hairline border, the keycap and code chips as small rounded labels, Inter-like type; built from `GradientDrawable`s and the platform's `DayNight` theme so it follows the phone's dark/light. Modern Android behaviour: edge to edge handled with `WindowInsets` (never under the status bar), ripples, the keyboard's actions.
- **Rust underneath, through JNI** (`crates/atlas-android` as the native library, `jni` crate): what a text becomes (`atlas_core::capture` — the same short forms as the desktop), the completions (`task_suggest`, notes, tags), the vault list, writing the capture. One implementation of what a capture means, on both.
- **The icon**: Atlas's icon (`packaging/icon/`, generated by `scripts/dev/icons.mjs`, guides/ICON.md) as an adaptive icon (`mipmap-anydpi-v26/ic_launcher.xml`: the white glyph as foreground and monochrome layer, inside the 66 dp safe circle, on `drawable/ic_launcher_bg.xml`, the tile's gradient) plus PNG fallbacks.
- **Then the features asked for**: the quick-settings tile (TileService; "the screen I was on" by an accessibility service's `takeScreenshot()`, the clipboard, text — any of them together), the share target (files, links, text), the vault picker on the Syncthing folder ("all files access" asked once), the waiting-captures inbox for plugins.

## Where it stands, and what comes next

1. **Now — it runs on a real phone** (from a screenshot): the box draws, the keyboard came up and the capture was written. What the first run showed, and what changed:
   - it drew under the status bar: Android 15 forces a target-35 app edge to edge → the APK targets API 34 until the box reads the bars' size;
   - the desktop's one-line footer squeezed into 360 points ran into itself → below 520 points the footer stacks in two rows (the guides; then the vault and a **Save** button), no keycaps (`app.rs` `footer`, test `a_phone_stacks_the_footer_and_saves_with_a_button`);
   - the keyboard is asked for when the box opens and on every tap (`window::SHOW_KEYBOARD`, set to `AndroidApp::show_soft_input`);
   - the app did not open again once closed, because of focus: the desktop box closes when another window takes the focus; on the phone that ended the loop and left a dead activity → `close_on_blur = false` on Android (test `on_the_phone_switching_apps_keeps_the_box`), and when the box does close (saved, Back) the process ends, so the next tap starts a new box.
2. **Typing quality**: keys arrive as key events through `NativeActivity`; on the keyboard tried, it typed. If autocorrect, swipe or accents misbehave, the fix is a small Java text field feeding the Rust side — with the Java of step 4.
3. **The vault**: the Syncthing folder in shared storage (e.g. `/storage/emulated/0/Sync/…`), chosen in the box, "all files access" asked once; several vaults with the same pill/menu as the desktop.
4. **The quick-settings tile** (a shortcut like the screenshot one): a `TileService` + an accessibility service's `takeScreenshot()` for "the screen I was on", the clipboard read once the box has the focus, the text box — any of them together. Small Java, compiled with `javac` against `android.jar` and dexed with `d8` from build-tools.
5. **The share target** (files, links, text from any app): an intent filter in the manifest; the shared content read through JNI.
6. **Plugins**: captures that a plugin should treat are written as waiting and processed by the desktop or the server when they arrive (Syncthing), or sent to the server at once with a capture token (docs/guides/SERVER.md); later, plugins on the phone itself (QuickJS).


## Started — where the rework stands

Done, in Rust (the shared half):
- `atlas-capture` has a `window` feature (default). Without it the crate is only what a capture means: `complete` (completions, `Names::load(root)`, `what_it_becomes`), `icons` (`Icon::ALL`, `svg(icon)` → SVG path data per stroke, for the phone's vector drawables; new icons Image, Clipboard, Server, Close), `send` (writing). The egui painting moved to `icon_paint.rs`.
- The egui stepping stone's hooks are gone from the desktop box: `window::SHOW_KEYBOARD`, `CONTENT_AREA`, `region_none.rs`, the `phone` flag and the narrow two-row footer (and their two tests).
- **The Rust half of the phone app is written**: `src/phone.rs` (prepare, suggest with UTF-16 offsets, describe, save, attach, find_vaults; host test `offsets_are_utf16_and_vaults_are_found`) and `src/glue.rs` (the 6 `Java_org_atlas_capture_Core_*` functions, checked exported by `llvm-nm` on the aarch64 build). **The Java screen is written**: `Core`, `Look`, `Vaults`, `CaptureActivity` (the card above the keyboard, a real EditText whose keyboard action saves, completions as rows, tappable guides, what it becomes, the vault pill → known vaults + found ones + "Allow access to your folders" + "Keep captures in the app", the clipboard chip, the draft, insets for target 35, shared text). build-apk.sh: javac → d8, aapt2 compile of `android/res` + the generated icons, link -R; APK 1.1 MB, classes.dex + the .so, launcher = CaptureActivity, adaptive icon. **Not run on a phone yet.** Then: the quick-settings tile `CaptureTile` ("Capture") and `ScreenService` (accessibility, `canTakeScreenshot`, no window content): the tile → shade dismissed → 350 ms → `takeScreenshot` → PNG in the cache → the box with a **Screen** chip (thumbnail; tap to include; attached beside today's log note on save, `![[Screen … .png]]` under the line). Without the service, a "Screen · set up" chip opens the accessibility settings; the accessibility button / gesture does the same as the tile. APK 1.2 MB. Then shared files: SEND / SEND_MULTIPLE of any type → each stream copied into the cache (its display name) → a chip, on by default, × to take it off → attached on save like the screen. Then the server as a destination: the vault menu's "Send to an Atlas server…" (a vault's address `https://host/v/notes` + a `capture` token) → `Server.java` posts `/api/capture` and `/api/attach` (now allowed to capture tokens, never overwriting). Not tried against a running server from the phone. Also done: the res generator (`cargo run -p atlas-android --bin android-res -- <res>` → 18 `drawable/ic_*.xml` from `icons::svg`) and the launcher icon (`android/res/mipmap-*`: PNGs + adaptive foreground at 66 % on `#1f2229`, monochrome layer); both pass `aapt2 compile`. Next: the Java below, then build-apk.sh (javac, d8, aapt2 compile + link -R, the generator).

Next, decided in detail:
- **Rust (`crates/atlas-android`)**: depend on `atlas-capture` with `default-features = false`, `atlas-core`, `serde_json`, `chrono`, and `jni = "0.21"` (already in Cargo.lock) for Android only; drop winit. `src/phone.rs` holds plain functions, testable on the host; `src/jni.rs` wraps each in `catch_unwind` and passes strings (JSON for structures). Class `org.atlas.capture.Core`:
  - `prepare(vault)` loads `Names` in the background into a per-vault cache;
  - `suggest(vault, text, caretUtf16)` → `[{label, detail, icon, insert, from, to, more, newLine}]`, offsets in UTF-16, the icon as a snake-case name;
  - `describe(text)` → `what_it_becomes(None, text)` (the core's `capture::describe`, without the vault's settings);
  - `save(vault, text)` → `{path, line}` or `{error}` (`send::capture`);
  - `attach(vault, name, sourcePath)` → `{path, embed}` (`files::attach` beside today's log note);
  - `findVaults(root)` → folders holding `.atlas` or `.obsidian`, at most 4 levels deep, skipping hidden folders and `Android/`.

  A small host binary writes `res/drawable/ic_<name>.xml` from `icons::svg`, so the phone and the desktop draw the same icons.
- **Java** (`crates/atlas-android/android/java/org/atlas/capture/`, views built in code, platform `org.json`):
  - **`Look`**: look.rs's palette, picked by the night mode, with dp and `GradientDrawable`/`RippleDrawable` helpers. The brand tile is an accent→purple gradient with an "A".
    `Look.readable(context, view)` caps a column of text at `READABLE_DP` (600 dp, ~70 characters) and
    centres it — wrap any native screen of explanations in it, so a tablet does not stretch lines edge to edge.
  - **`CaptureActivity`**: a translucent, dimmed window holding a floating card above the keyboard. The card's corners are 16 dp, with an accent hairline at 55 %.
    - On the card: the tile, then a real `EditText` that wraps, with no multi-line flag and the Send action, so the keyboard's Enter saves as on the desktop.
    - A chips row: Screen (thumbnail), Clipboard (read once the window has the focus), shared files (selected by default).
    - The guides as tappable code chips that insert `[]`, `@`, `[[` and `#`, or what the text becomes once typing starts.
    - A hairline, then the vault pill and an accent Save button.
    - Completions show as a card above; tapping a row replaces the range.
    - Insets: `setDecorFitsSystemWindows(false)` and padding from systemBars|ime (target 35).
    - The draft is kept in SharedPreferences when the box is left, and cleared once saved. Saved/failed show in green/red, and the box closes after 650 ms.
  - **`Vaults`**: a JSON list in SharedPreferences.
  - **`VaultsActivity`**: "all files access" (`ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION`; on API 26–29 `WRITE_EXTERNAL_STORAGE`). The vaults found by `findVaults("/storage/emulated/0")` are listed, plus "Choose a folder…" (`ACTION_OPEN_DOCUMENT_TREE`, `primary:X` → `/storage/emulated/0/X`) and a fallback folder inside the app.
  - **`CaptureTile`** (TileService): through the screen service when it is on, else `startActivityAndCollapse` (a PendingIntent on 34+).
  - **`ScreenService`** (AccessibilityService, `canTakeScreenshot`, accessibility button):
    - dismisses the notification shade (31+);
    - after 350 ms calls `takeScreenshot`;
    - turns the HardwareBuffer into a software bitmap, saved as a PNG in the cache;
    - starts the activity with the `screen` extra.

    Without it, a "Screen · set up" chip opens the accessibility settings.
  - **Share**: SEND and SEND_MULTIPLE (`*/*`). Text goes into the box; streams are copied to the cache and attached on save.
  - **Selected text**: PROCESS_TEXT (`text/plain`), "Capture" in any app's text-selection menu; the text goes into the box as a quote (`> …`, `Shares.quote`), as the desktop box's Selection chip.
- **build-apk.sh**:
  - `javac -source 17 -target 17 -cp android.jar` → `d8 --lib android.jar --min-api 26` → `classes.dex`;
  - `aapt2 compile` of `res/` + `aapt2 link -R`, then `classes.dex` and `lib/` zipped in;
  - the manifest gets `hasCode=true`, the activities and services, MANAGE_EXTERNAL_STORAGE and target 35.
- **Icon**: an adaptive icon from `crates/atlas-app/icons/icon.png` (`magick` is installed) — a foreground at 66 % of 108 dp, a background colour, and a monochrome layer for themed icons — plus the PNG mipmaps.
- No phone connected over adb (`adb devices` empty): every check on a device is done by hand.


**Works on a real phone**. Next: hook it up, run the full app on Android as well, and make the UI truly mobile-friendly and fast.

## The last screenshot, pictures shown, and the page address

Asked for: offer the last screenshot taken, not only a new one; show shared pictures (a shared image did not show); make a picture viewable bigger; and in a browser (or YouTube) copy the page's address automatically.

- **One list of pieces** (`CaptureActivity.Piece`: label, file, on, removable, a thumbnail decoded once at ~96 px) replaces the separate screen and files fields: the screen taken, the last screenshot, files shared in.
- **Last screenshot**: the newest MediaStore image whose `RELATIVE_PATH` holds "Screenshots", taken in the last 30 minutes, copied into `cache/last/` and offered **off** with its thumbnail. Readable with all-files access (what vaults on the storage need anyway) or `READ_MEDIA_IMAGES` (API 33+; `READ_EXTERNAL_STORAGE` ≤ 32), asked from a "Last screenshot · allow" chip when missing.
- **Shared pictures show**: a shared file that decodes as a picture gets its thumbnail in its chip (it showed only the name before — likely why "the image doesn't show").
- **Bigger**: a tap on any thumbnail shows the picture full screen (fit to the screen, decoded at the power-of-two step that fits its height); a tap closes it. A tap elsewhere on the chip still turns it on/off (or, for shared files, takes it off).
- **The page address**: the accessibility service may now read window content (`canRetrieveWindowContent`, `flagReportViewIds`) — only at the moment the tile or the button is pressed, after the shade closed, from the app under it (`Page.read`). Shape-based: Chromium's `url` extra on the web root, else a field whose view id says url/address/location and whose text reads like a web address, else any text that reads like one with a path. The title: the WebView node's text or description. A scheme-less address gets `https://`. The box shows a **Link** chip, **on**; saved as `[title](url)` after the text. The app's name joins the Screen chip ("Screen · YouTube"). The service's description says it reads the page address.
- YouTube in its own app does not show its address on screen: its Share → Atlas capture (shared text) is the way there; in a browser the address is read.
- Built: APK 1.2 MB (`target/dist/android/atlas-capture.apk`), no warnings but javac's deprecation note (MediaStore `DATA` on API ≤ 28). **Not run on a phone** (none on adb): installed by hand. After installing, the accessibility service may need turning off and on once for the new "read window content" ability.


## Two apps, the full app, signing in

Two versions were asked for: one with just the capture, where opening the app normally (not through the accessibility options) shows a normal app to configure it; and one that keeps the capture but is also a port of the desktop app, native where possible, knowing most features matter less on a phone. Then the sign-in (docs/guides/SERVER.md, "Signing in a phone").

**Two apps from one library and one dex** (`build-apk.sh` → `target/dist/android/atlas-capture.apk` and `atlas.apk`; `android/AndroidManifest.{capture,atlas}.xml`). The Java stays in package `org.atlas.capture` (the JNI names); the full app's manifest package is `org.atlas.app` and names the shared components in full. Both can be installed side by side.

- **Atlas capture**: the launcher opens **`SettingsActivity`** — a normal app in the recent apps — showing `Setup`: *Where captures go* (the known vaults, the current one in the accent; a server's row says how this phone is signed in, a tap signs in again; the vaults found on the phone; "Allow access to your folders"; "An Atlas server…"; "A folder in the app"), *Capture quickly* (**Add the Capture tile** — one tap on Android 13+ with `StatusBarManager.requestAddTileService`; the screen-and-page service on/off and what it does; Share), **New capture**, the version. The box (`CaptureActivity`, no longer the launcher) opens from the tile, the accessibility button, a share, or New capture.
- **Atlas** (`AtlasActivity`): the desktop app's phone part, natively, in the platform's patterns (Material 3): a top bar (the screen's name, Back when deeper, its one action), a **bottom bar** — Home, Library, Files, Search, **Apps**, Settings; Apps is no place but a menu of direct links over the bar (the plugins' own apps with their launcher icons — Manga, Audiobooks — and the Agenda) — and a **capture button** (FAB) on Today and Files. Back goes up the stack, then to Today, then out.
  - **Today**: the date; Focus (when the note has text); **Open tasks** with boxes (a tick is `today::tick_task`, as Home does: a done date, the next occurrence); **Today's log** drawn as a note.
  - **Files**: folders first, notes without `.md`; a note opens, a picture shows full screen; other files say to open them on the computer.
  - **Search**: the core's search — notes by name, then lines in the text.
  - **A note**: drawn natively (`NoteRender`): headings, paragraphs with bold/italic/code/math/strike/highlight/tags, links (a vault path opens, an address goes to the browser, a missing note says so), list items and **tasks with boxes**, quotes and **callouts** in Obsidian's colours, code (monospace, scrolling sideways), math as TeX in the math colour (no TeX engine on the phone), pictures from the vault, the properties. **Edit** shows the text in a plain editor; **Done** (or leaving) saves with the mtime it read — a change on the computer meanwhile is refused, never overwritten.
  - **Settings**: the same `Setup`.
  - A vault on a server: the phone app reads folder vaults (synced to the phone); for a server vault it offers the server's pages in the browser (the web UI's phone layout, docs/guides/MOBILE.md).
- **Rust**: `src/md.rs` — a note as blocks with inline spans (frontmatter, headings, paragraphs, items with depth/marker/task/line, quotes and callouts, fenced code, `$$` math, pictures, rules; `**`, `*`/`_` (not inside words, not around spaces), `` ` ``, `$`, `~~`, `==`, `#tags`, `[[target|alias]]`, `[text](url)`), tested; `src/vault.rs` — `Core.call(json)`: one closed enum of calls (`tree`, `note`, `write` with `baseMtime`, `search`, `today`, `tick`, `resolve`), answers in JSON; a new call is a new variant, the JNI glue never changes; `atlas_core::links::Resolver` (made public) resolves `[[links]]` as Obsidian does, cached per vault for a minute or until a write.
- **Signing in to a server** (`SignIn`, `SignedInActivity`, `SignInWebActivity`, `VaultChoice.signIn`): the address only, then the app looks at what answers and offers the ways in that fit — the browser (Atlas's `/auth/app` in Chrome: the gate with the security key, then Atlas hands back its token and the gate's session; docs/guides/SERVER.md), in the app (a WebView keeping the gate's cookies; a password and a one-time code), or by hand (a token, an optional generic header — kept as the device's bypass key for the server's host, in the core's one sign-in store: docs/design/SERVICE-SIGNIN.md, "One store per device"). The OIDC path written first was removed. Requests (`Server.headers`): Atlas's token in `x-atlas-token` (and as Bearer for older servers), the gate's session and the WebView's cookies, the bypass key kept for its host (`Signins.keys`, also sent by `Web` to Suwayomi and Audiobookshelf); a redirect is never followed with the data, and a sign-in page instead of JSON says "sign in again". **The apps had no INTERNET permission until now**: sending to a server could not have worked on the phone before.
- **Checking without a phone**: `get-toolchain.sh --emulator` fetches Google's emulator and an Android 15 x86_64 image into `local/toolchains/` (~2 GB, checksums checked); `build-apk.sh --emulator` adds the x86_64 library to the APKs; `run-emulator.sh start | shot <png> | stop` makes a phone-sized virtual device by hand (no avdmanager; the system's adb linked as platform-tools), boots it headless and installs the APKs. One heavy job at a time: the emulator takes 4 cores and 3 GB. `run-emulator.sh plugin <package> <plugin id> <file>` makes a test vault inside the app (the image's root shell), puts the file in its `drawings/`, points the app at it and opens the native plugin on it — e.g. `plugin org.atlas.boox notepad my.excalidraw`; write with a simulated pen: `adb -s emulator-5580 shell input stylus swipe …` or `input stylus motionevent DOWN|MOVE|UP x y` (a finger pans). The GPU mode defaults to `swangle_indirect`: `swiftshader_indirect` segfaulted in qemu's RenderThread on the development host; `ATLAS_EMU_RAM=2048` when memory is short.


**Two sign-in bugs fixed**:
- **The ways in were never drawn.** `VaultChoice.offer` built an `AlertDialog` with both `setMessage(…)` and `setItems(…)`; Android shows only the message when both are set, so behind Authelia the dialog said *"A sign-in stands in front of this server…"* and offered nothing but Cancel. Now `VaultChoice.choose` puts the explanation and the ways in (`Look.row`s: **Sign in here** — password, one-time code; **Sign in in the browser** — security key; **A token or a header…**; **Look again** when nothing answered) in one custom view. Never combine `setMessage` with `setItems` / `setSingleChoiceItems` in this app.
- **The Boox app's token went to the wrong app.** All full editions asked the server as `app=atlas`, so `/auth/app` sent the token to `org.atlas.app://signed-in`, the plain Atlas app's address, not `org.atlas.boox`'s. Now `SignIn.app` names the edition (`boox`, server.rs `APPS` knows it, test `behind_a_gate_the_phone_gets_the_gates_cookies`) for the browser path; the in-app path (`SignInWebActivity`) asks by scope only (`SignIn.scopeApp`) and catches any `org.atlas.*://signed-in` redirect itself (`SignIn.isReturn`), so it also works against a server deployed before `boox` existed. A refusal (`?error=`) is now shown, not silently closed.


**"I hand the token but it does not work" (the phone's browser sign-in)** — what is known: an Authelia gate answers anything without its session cookie with a 302 to its sign-in host (`auth.example.org`), an Atlas token or not (checked with curl); its sessions there last 2 weeks / 3 days idle / 1 month with Remember me, so expiry is not the cause. Changed: (1) `Server.headers` sends `Authorization: Bearer <atlas token>` only when no gate cookie goes with the request — Authelia's authz endpoint reads an `Authorization` header as credentials of its own and can refuse the request despite a valid session cookie; Atlas reads `x-atlas-token`. (2) `Server.verify` right after either sign-in probes `/api/auth/me` with what the phone now sends and says the outcome in a toast and `adb logcat -s AtlasSignIn` — "signed in", "the sign-in in front still sends this phone to sign in — cookies: <names>" (never values), "Atlas refused the token", or "did not answer". Not reproduced here (no Authelia credentials on this machine): the toast on the phone is the next evidence.

- **Found from the phone's report** (logcat): the vault's page loaded but every `/assets/…` script went to Authelia — `plantGate` had set the browser sign-in's cookie without a Path, so Android scoped it to `/v/`. Now `Path=/` for the site, re-planted whenever a server vault opens; a page that never gets ready on a server offers the sign-in; the page reloads after a sign-in (`AtlasActivity.RELOAD`).
- **Security keys on Android**: a browser must hand WebAuthn to Android's credential service — Vanadium does on a phone (checked: it works). The Boox (Android 15, Authnkey enabled) has Fennec F-Droid 149 (default; no FIDO there) and an old Chromium 111 (before Chromium's third-party passkey providers, ~118). "Sign in in the browser" now opens a chooser (`SignIn.atlasInBrowser`), so a capable browser (Cromite, Chrome, Brave) can be picked without changing the default. The Boox's browser path also needs the server's Atlas rebuilt (`app=boox`).

**The capture box's choices, reworked**:
- **Why a picture "only deselected" or "disappeared"**: a picture was a 20 × 26 dp thumbnail inside a chip; nearly every tap landed on the chip, which toggled a screenshot off and *removed* a shared image (`if (p.removable) pieces.remove(p)`).
- **Pictures are tiles now** (`CaptureActivity.tile`, 72 dp high, their own row above the chips): a tap opens the picture large (`view`) with big buttons — **Add to capture / Leave out**, **Remove** (only for what was shared or drawn here), a tap on the picture closes; a corner badge (✓ / +) toggles without opening. Left-out pictures are dimmed. A file that is not a picture is a chip that toggles — nothing disappears at a tap any more.
- **No sideways scrolling**: the chips wrap onto lines (`Flow.java`, a small wrapping `ViewGroup`; no AndroidX); labels cut at 36 characters on one line.
- **Fewer choices**: the two set-up nags ("Screen · set up", "Last screenshot · allow") left the box; Settings → *Capture quickly* has **The last screenshot** (asks for the pictures permission) beside the screen service.
- **The drawing canvas** (`CaptureActivity.draw`): the full-screen dialog now pads for the system bars and the cutout (`WindowInsets`, `fitsSystemWindows` before Android 11) — its bar sat under the clock; a bar of ×, "Drawing", Undo, Clear, Done (all greyed while the page is empty); the canvas as a white rounded sheet with a margin of the app's background, framed (2 px on e-ink); a one-line hint under it.
- **The order**: `Piece.Kind` is declared in priority order — `SHARED, SCREEN, LAST_SCREENSHOT, DRAWING` — and the pieces are sorted by it; then the chips: shared files, **clipboard, link, what is playing**, the app's title, Draw. (Pieces were matched by their label string before; the kind is now a type.)

**Captures kept offline**: `Outbox.java` + `OutboxJob.java`.
- `Server.post` marks an error `retry: true` when it passes by itself or by signing in again: no connection (`IOException`), 502/503/504, a redirect / 401 / 403 / an HTML page (a sign-in in front). The box's `toServer` then keeps the capture: `files/outbox/<millis>-<n>/capture.json` `{server, text, files}` plus the files not yet sent, and says *"Kept on the phone: sent to X when it answers (why)"*.
- **Order kept**: a new capture for a server with older ones waiting first tries to send those, and queues behind them if they still wait. Sending writes each uploaded file's embed into the text before deleting it, so nothing is uploaded twice.
- **When it is sent**: the box, the Settings screen and the full app send on open; `OutboxJob` (a platform `JobService`, `NETWORK_TYPE_ANY`, exponential backoff from 60 s, persisted across reboots — hence `RECEIVE_BOOT_COMPLETED`) runs once there is a network, and reschedules itself while anything still waits.
- **A refusal for good** (any other error, e.g. 400): the capture is marked `refused` with its `lastError`, no longer holds newer captures back, and waits for a person: Settings shows *"N waiting"* on the server's row and **Send the kept captures now** (which retries refused ones too).
- **Said when sent**: `OutboxJob` posts "N kept captures were sent" (channel "Captures sent later", low importance) when its run delivered any; the notifications permission (Android 13+) is asked the first time a capture is kept offline — the moment it matters. Not done: the full app's notes (they are the server's web pages) are not kept offline.


**The ⋮ menu's file actions and the Boox's look** — the ⋮ menu needed more file actions (such as removing the opened file); on the Boox the UI should be a bit bigger, the native app's lines a bit thicker, and Excalidraw's a bit leaner.
- On a file (`AtlasActivity.menu`): Close this file, Close all files, **Rename…** (a native dialog, the name selected without its extension), **Show in Files** (the phone Files list opens the file's folder, the row highlighted), **Open with…** (the page's openers as a list — an SVG's code, a table as text), **Copy a link to it** (`[[name]]` on the clipboard), **Outline**, **Move to the trash…** (confirmed; `.atlas/trash/`). "Remove opened file" was read as the trash, since Close was already there. The page side is `atlasShell.reveal / rename / trash / openers / openWith` (ui/src/lib/native-shell.svelte.ts); a renamed file's tab follows it, a trashed one closes (gone-files.ts).
- The Boox: `Look.EINK_SCALE` (1.12) multiplies `dp()` and every `label()`'s text, and e-ink borders are `dp(1.5)` instead of one pixel; the page's `--eink-scale` is 1.25 (was 1.15); Excalidraw's own chrome and the notepad bar keep 1 px borders and 1.75 icon strokes while the rest of the page has 1.5 px / 2.5.


**Instant ink lost between drawing tabs** — drawing in Excalidraw lagged again. Each open drawing has its own `nativeInk` (draw-excalidraw.ts) but Onyx has one ink region per app: when tabs switched, the hidden drawing's "off" could land after the shown one's "on" and the line was slow until the pen tool was tapped again. Now `inkOwner` lets only the drawing holding the region turn it off. Also, at open the pen tool is sent as such (`getAppState()` right after `setActiveTool` still has the old tool). Diagnose with `adb logcat -s AtlasInk AtlasPage`: `instant ink over …` then `instant ink on: state 2, valid true` is the good path; `Onyx BLOCKED` means the whitelist (OnyxAccess).

**Writing that is kept and looks like what was written** — some strokes were not recorded, and strokes looked different while drawn and once settled. The target look: *crisp, like Boox Notes* (with the default fountain pen).
- **Palm rejection** (`fingerGestures`, draw-notepad.ts): a resting hand panned the page under the stroke, and a palm's two brief contacts were a two-finger tap = **undo** — the stroke "not recorded". Now touches are ignored while the pen is down and 700 ms after, a contact wider than 28 CSS px is a palm, and the pen landing cancels a finger gesture (no pan, no tap).
- **Crisp strokes**: Excalidraw outlines every freehand stroke with fixed perfect-freehand settings (thinning .6, smoothing .5, streamline .5) — rounded handwriting, a width curve unlike the Boox's quick line. `ui/scripts/dep-rewrites.ts` (applied by `vite.config.ts`) rewrites that one spot of Excalidraw's bundle (build and dev pre-bundle) to ask `globalThis.__atlasInk(element)` first; `ui/src/lib/draw-ink.ts` answers for strokes marked `customData.atlasPen` (the notepad's pen marks every stroke): fountain thinning .35 / smoothing .25 / streamline .12, ballpoint no thinning, the highlighter soft. The build **fails** if Excalidraw's code moved (no silent fallback). Files stay plain `.excalidraw`: elsewhere (Obsidian's plugin) the same points are drawn with Excalidraw's softer look. Values follow boox_5c_re's measured pen (median pressure 0.39, light smoothing without look-ahead).
- **Lost pen-ups** (boox_5c_re found the Boox can drop one): `collectPenStrokes` treats `pointercancel` as the end of the stroke and logs `pen: a down without an up …`, `pen: the stroke was cancelled …`, `pen: no stroke of Excalidraw's …` to logcat (AtlasPage) — the next "not recorded" shows its cause.
- Test: `eink.spec.ts` "a palm while the pen writes neither undoes nor moves the page; pen strokes are kept crisp".


## Next for the full app: Obsidian's basics, the code editor, plugin blocks (proposed, not built)

The request: atlas.apk needs Obsidian's basics (wikilinks, tasks, Bases), code-editor basics, and ideally the blocks plugins render (Runs and others) and the capture plugins, perhaps with a small JS engine; plugin blocks may run JS if well integrated.

What is there: wikilinks (followed, resolved as Obsidian does), tasks (ticked, Today's open tasks), the note read natively and edited as plain text. Missing: Bases, a code editor, plugin blocks, plugins.

**Why one engine, not two**: a plugin's `main.js` / `view.js` run in the page and draw into the DOM (docs/guides/PLUGIN-API.md); Bases, the CodeMirror editor and every block are the web UI's. Re-writing them natively would be a second implementation of each (against "one implementation per idea"), and a bare JS engine (QuickJS) has no DOM for them to draw into.

**Proposed**: the core runs **inside the app** — `atlas-core` already compiles for Android, its server included — on 127.0.0.1 with a per-launch token; the web UI's build (`ui/dist`, a few MB) goes in the APK's assets; a **WebView** shows the pieces the native screens do not draw — a Base, a plugin block (Runs and the rest), a note in the code editor, a plugin's pane — in the phone layout (docs/guides/MOBILE.md), talking to that in-app core like the desktop window talks to its own. The native screens stay for what must be instant (Today, capture, Files, Search, reading). Plugins' `main.js` then run as on the desktop (in the WebView), with the same `atlas` API.

**What cannot come**: plugin helpers that are scripts for an interpreter — a phone runs no Python; such plugins would say so and offer the server's version (the same vault on an Atlas server runs them there).


## The native shell

The app had become a pure WebView, without access to native settings, and the mobile web view needed work. Chosen: a **native shell, the web for notes**; Home, Files and Search are not tabs — only actual files are tabs.

**The shape** (`AtlasActivity`):

```
┌──────────────────────────────┐
│ ←  title            [3]  ⋮   │  native top bar: Back (the brand mark on Home), the screen's name, the open files, the menu
├──────────────────────────────┤
│  the phone's settings        │  native (Setup.java): vaults, sign-in, capture
│        — or —                │
│  the note view (one WebView) │  the web's Home, or the open file: live edit, LaTeX, Bases, blocks (Files, Search: native lists)
│                        (+)   │  capture button on Home and Files → CaptureActivity
├──────────────────────────────┤
│ Home Library Files Search Apps Settings │  native bottom bar, Material 3's (a pill marks the place; steps aside for the keyboard)
└──────────────────────────────┘
```

- **Home is the web's**: the bottom bar's Home shows the note view with the page's Today pane (`atlasShell.home()`), as a view, never a tab; a link followed from it opens the file and Back returns to Home. The first pass's native Home (home page row, Today tasks, Recent) was removed.
- **Files and Search are native** (the next section): the bottom bar's Files and Search are lists drawn by the app over the vault's core, which work while the page is still loading or has failed; a file opened from them opens in the note view (or its native plugin) and Back returns. The page's own Files and Search panes stay for the desktop and the phone's browser. (A first native pass, `Places.java` and `Api.java`, had been removed in favour of the page's panes; the lists came back on one shared widget, `PlaceList`, with the core deciding what they show.) Settings is native too (the phone's own: vaults, sign-in, capture, plus *This vault → Vault settings*, the web's).
- **The note view** is one WebView per vault, loaded once and kept alive. The page knows it is inside the app by the injected `AtlasNative` bridge (`ui/src/lib/native-shell.svelte.ts`): it hides its own phone bars, tab strip and status bar; reports its tabs on every change (`AtlasNative.tabs(json)`); keeps **one non-file view** at a time (Settings, the graph, a plugin's pane: shown, never a tab); and takes the app's orders through `window.atlasShell` (`open(path, line)`, `home()`, `view(kind)`, `plugin(id, arg)`, `activate(id)`, `close(id)`, `back()`). Calls wait until the page says `ready()`.
- **Tabs are files only**: the count and the sheet list the panes that have a path. The sheet is Material's modal bottom sheet in the app's look: a grip, "Open files · n" and *Close all*, a row per file (its icon, its name, its folder under it, the one on screen marked in the accent), × to close one. The ⋮ menu is a card in the same look (an icon per line): *Close this file*, *Close all files*, *Commands*, *Vault settings*, *Phone and vaults*. The graph was in the first menu only to try the one-view rule; it is reachable from Commands. A link followed inside a note pushes the previous tab on the back stack, so Back returns to it. The open files are remembered per vault in the app's preferences and reopened on start; the desktop's layout file is neither read nor written by the phone.
- **One implementation of the vault's logic**: every native place and the note view talk to an Atlas server — the core inside the app (`Core.serve` → `http://127.0.0.1:<port>`) for a vault on the phone, the vault's own server (signed in as `Server.headers`) for a server vault. The phone never re-implements files, notes, search or plugins.
- **One implementation of the text rules too**: logic with no Android in it is Rust, not a Java copy — `src/text.rs` wraps the core's own rules for the Java screens (`Core.untracked`, `shareText` / `shareQuote` / `underDraft` from atlas-capture `share.rs`, `samplesEncode` / `samplesDecode` from `pdf_marks.rs`, `propsRead` / `propsSet` / `propsList` / `propsSetList` from atlas-text `frontmatter.rs`, which `Props` wraps for the plugins), strings in and out with "" for null and JSON for structures, tested on the host (`cargo test -p atlas-android text::`). Java keeps what needs Android: views, activities, services, the system's HTTP and preferences. `Onscreen` (reading other apps' screens) calls `Core.untracked` through a field its JVM test stands in for. Two pure-Java classes stay Java on purpose, since moving them would share nothing: `Onscreen`'s recognisers read Android's accessibility tree and have no counterpart elsewhere, and `PdfText`'s selection and quote mirror the desktop's TypeScript (`atlas-mark.ts`), not Rust.
- **The look** (the native part polished): the system's bars take the bars' colour (the root is `bg`, the places `app`); the top bar is Material 3's small top app bar (64 dp, a medium-weight title); the bottom bar is Material 3's — 64 dp, the current place's icon on a 64 × 32 dp accent pill, its label medium weight; buttons draw 40 dp inside a 48 dp touch target and chips 32 dp (`Look.target`); the brand mark stands where Back would go nowhere
- **Icons**: `Back`, `More`, `Tabs`, `Chevron`, `Command` were added to the shared set in `crates/atlas-capture/src/icons.rs` (the drawables are generated from it at build time).

- **Fullscreen**: the ⋮ menu's *Fullscreen*, or the page's own (Super+F, a drawing's ⛶ — `toggleFullscreen` in `ui/src/lib/fullscreen.svelte.ts` hands it to the bridge's `toggleFullscreen()` inside the app, since there the page is always one pane) → `AtlasActivity.setFull`: the top bar, the bottom bar and the + go, and both system bars hide (`Shell.bars(a, true)`, a swipe from an edge shows them a moment over the page, which keeps its size). Back, the faint corner button (bottom right, `Minimize`) or the page's ⛶ leave it; out of it the Boox hides the notification bar and a phone keeps it, as before. A dialog or menu that brings the bars back is undone when the window has the focus again. A drawing's page shown fitted stays fitted when the view changes size (draw-excalidraw.ts, a `ResizeObserver`; a page zoomed by hand is left as it is), and a fitted page now fills 98 % of the view (was 96 %). Icons `Maximize` / `Minimize` added to the shared set.
- **The Notepad's own full screen and page mode** (native): a different thing from the app's fullscreen above — the Notepad screen has its own (the page island's ⛶ hides its islands and panel too), and shows one page at a time filling the screen by default. (plugins/beta/notepad/README.md).


## What is playing, clean links, the in-app core locked

- **The capture box offers what is playing** (`Playing.java`, `MediaListener.java`): a chip with the song or video of the system's media sessions — the address found by shape, else, for a YouTube app, YouTube's own search (*· link by search*). Needs notification access once: Settings → *Capture quickly* → **What is playing**. YouTube and YT Music captures must carry their URL (they go on to TubeArchivist or a music downloader).
- **Shared links lose their tracking parameters** in the core, as every capture does (`atlas-text` `links.rs`: `si`, `igsh`, `utm_*`, `fbclid`, `gclid`, `feature`, …); a browser's address read from the screen goes through the same rule on the phone (`Core.untracked`).
- **The app's player, with the screen off** (`MediaService.java`): the phone's engine of `atlas.player` (the page's module `ui/src/lib/player.svelte.ts` calls `AtlasNative.player(cmd, json)`; the state comes back through `window.__atlasPlayer`). A foreground service of type `mediaPlayback` (`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK` in the manifest) with Android's own `MediaPlayer`, one per track (no Gradle, so no ExoPlayer), the item's time over its tracks by `PlayerTimeline` (the page's rules, `android/test/PlayerTest`); a `MediaSession` for the lock screen, the notification (−30 s, play/pause, +30 s, a tap opens the app, a swipe away while paused closes it), a headset and a car; audio focus (a call pauses it and its end resumes it, another player takes it, a notification pauses rather than talks over speech), headphones pulled out pause it; the sleep timer. It reaches the core with what the vault on screen needs (`AtlasActivity.playerHeaders`: a server's `Server.headerMap`, or the in-app core's cookie) and reports where you are itself — every 15 s while playing, on pause, at the end and on close — to `/api/plugins/<id>/media/progress`, the plugin's `[media] progress` (`PlayerReports`: the time listened kept until a report is taken, the key an answer gives). `START_NOT_STICKY`: killed by the system, it does not start again on its own; the place is with the plugin. The page's `blob:` cover goes over as a `data:` address. Needs a device to confirm: playback with the screen off over hours, the lock screen and Bluetooth controls, focus on a call.
- **An app that is not a browser**: its on-screen title (the view id saying `title`, else the longest one-line text) is offered, off (`Page.java`).
- **The in-app core is locked to this app**: every app on a phone reaches 127.0.0.1, so the core started by `Core.serve` answers only requests with its per-run key; the WebView gets it as a cookie by loading the one-time address `Core.serve` returns (`{port, open}`). The capture box writes through JNI (no HTTP) and needs nothing.
- **One way to a vault, a folder's as a server's**: the native screens (Settings, the plugins' switches and forms, the readers' notes and PDF marks, a drawing's note) reach a vault through `VaultFiles.OnServer` — a server's address with the app's sign-in, or, for a folder on the phone, the core `Core.serve` started for it (`Local.java`: `http://127.0.0.1:<port>` and the run's key as `x-atlas-token`). The same HTTP calls either way (`/api/config`, `/api/plugins?platform=android`, `/api/companion`, `/api/pdf-marks`, `/api/file`…), so the core's rules — the mirror's leases, the companion notes, `plugins::blocked` — hold on the phone as on the desktop. JNI is left for what must not wait on a server or has no route: the pen engine, PDFium, JPEG XL, the capture box's `prepare` / `suggest` / `describe` / `save`, a built-in plugin's form, and `serve` itself. A folder vault's `local(path)` is still the file itself (a book is not copied). A server vault's is a copy in the app's cache, kept by `ServerCopy` (plain Java, `android/test/ServerCopyTest`): trusted for a minute after a check (a PDF asks for its file at every page), else fetched again only when the server's modification time changed, streamed to a `.part` file renamed over the copy (a broken download never replaces it), and used as it is when the server does not answer — the reader then says *Offline — the copy on this device* once per file (`VaultFiles.offlineNotice`, `Host.local` / `Host.read`).
- `Icon::Music` added to the shared icon set (the drawable `ic_music` is generated at build time).
- **Launcher shortcuts** (`Shortcuts.java`): a long press on Atlas's icon offers *Capture*, *New note*, *Today*, *Search*, *Files* (a launcher shows the first four or five). Each runs what the app already does for it, never a second implementation: *Capture* starts the capture box (`CaptureActivity`), *New note* is the + (`atlasShell.view("command('ui.new')")`, the page's own New… command), *Today*, *Search* and *Files* are the bottom bar's places (`go`). Dynamic ones (`ShortcutManager.setDynamicShortcuts` at start), not static `shortcuts.xml`: a static shortcut's intent is started with `FLAG_ACTIVITY_CLEAR_TASK`, which would restart the note view and the in-app core; these carry `CLEAR_TOP | SINGLE_TOP`, so the running app takes them in `onNewIntent` and goes to the place (`Shortcuts.PLACE`). The icons are the app's own glyphs in the accent on a soft tile, as adaptive bitmaps (the launcher's mask shapes them).
- **A swipe on the top bar moves between the open files** (`swipeBetweenFiles`, `stepFile`): a sideways fling on the bar or the title goes to the next / previous file, the title sliding in; not on the back stack (a step between files, not a link followed). On the bar, not on the note: the note scrolls tables and selects text sideways, and the screen's edges are the system's Back gesture (a swipe from the left edge for a side bar, in MOBILE.md's list, would fight it — dropped).
- **`atlas.signIn` on the phone** (`SignInWebActivity.oauth`, the bridge's `signIn(url, back)`): the provider's page in the app's sign-in window; when it heads for an address starting with `back` (any scheme: a localhost address or `audiobookshelf://oauth`) the window closes and the address goes to the page (`atlasShell.signedIn` → the `signin` event, as the desktop's sign-in window hands it over). The page's `window.open` sent it to the browser, which never came back.
- **One look for the page and the app** (`Look.save`, `AtlasActivity.relook`; the page's `ui/src/lib/settings.svelte.ts`): after every settings change the page sends its tokens (`--bg-app`, `--bg-elev`, `--text`, `--text-muted`, `--text-faint`, `--border`, `--border-strong`, `--bg-hover`, `--accent`, `--accent-soft`, `--accent-fg`), whether it is dark, and whether it follows the phone, over the bridge's `look(json)`. The app keeps them (shared preferences) and every `Look` made after takes them instead of the phone's own light/dark palette, Material You's accent included — so the bars' text and icons, Settings, the sheets and the native readers are drawn in the vault's theme, palette and accent. When they change, the window's own chrome is made again around the same WebView (`relook`: no reload, the place, the count and fullscreen kept; the system bars' icons dark or light to match). Saved tokens of a page that follows the phone are not used after the phone turns dark or light, until the page sends the new ones. E-ink keeps its own black on white. The tab count is sized in dp inside the icon's front square (sp grew it out of the square with a large font or on e-ink).
- **A swipe moves between the places** (`flingBetweenPlaces`, `stepPlace`; the page's `ui/src/lib/place-swipe.ts`): a sideways fling on the bottom bar steps to the place beside in its order (Home, Library, Files, Search, Settings), the title sliding in as for files; a tap on an item is still a tap (only the UP that ended a fling is kept from it). On Home, the Library, Files and Search the page itself listens: a quick one-finger fling (under 600 ms, at least 64 px, twice as sideways as up or down) that began on nothing that scrolls sideways (`overflow-x: auto/scroll` and wider inside), not in a field or editable text, and left nothing selected, calls the bridge's `swipe("1" | "-1")`; `stepPlace` ignores it on an open file, whose sideways gesture stays the top bar's. Spec `phone-place-swipe.spec.ts` (a stand-in bridge); the fling on the bar needs a device.
- **Back asks the page first** (`onBackPressed` → `atlasShell.dismiss()`, `ui/src/lib/back.ts`): the palette, a menu, a dialog, a dropdown, a Settings area close first; only when nothing was open does Back go to the previous place. Before, Back left the place with the palette still open over it.
- **Predictive back** (Android 14+): `AtlasActivity`, `CaptureActivity` and `PluginActivity` carry `android:enableOnBackInvokedCallback="true"` in the manifest, and each registers its own `onBackPressed` as the `OnBackInvokedCallback` (`Shell.onBack`) — so the gesture, the top bar's Back button and older Android all take the one path above (the page's `dismiss()` first, then the places, then `super.onBackPressed()`, which leaves as before). The opt-in is per activity, not the application's: below 34 only the application's flag counts, so Android 13 and older keep calling `onBackPressed`, and the capture overlay (a window `ScreenService` adds, no activity) keeps receiving the Back key in `dispatchKeyEvent`. The callback stays registered while the activity lives, because whether the page has something open is known only by asking it; the cost is that the system's back-to-home preview is not shown on the last step (Back still leaves). A new activity with a Back of its own does the same: the manifest attribute and `Shell.onBack(this, this::onBackPressed)` in `onCreate`.
- **The phone's font size no longer stretches the note view**: Android's WebView grows the page's text by the system font size (its default text zoom) while every box keeps its pixels, so with a larger font words run out of their rows, chips and buttons. Now `setTextZoom(100)`, and the font size goes to the page through the bridge (`AtlasNative.fontScale()`) as `--system-font`, a factor of the interface's own scale (`html.phone.native-shell` in base.css: `--ui-scale` = Settings' size × 1.15 × the phone's, kept within 0.85–1.3) — the scale every component already sizes its boxes by.
- **The page is always in the phone layout inside the app** (`lib/phone.svelte.ts`, `inApp`): a phone turned sideways (≈ 860 × 330 between the bars) got the desktop layout — the side bar, splits, the status bar — inside the native bars. A phone's browser turned sideways too (`(max-height: 480px) and (pointer: coarse)`).


## Material You, and the home-screen widget

- **Material You** (Android 12+): the app's accent is the wallpaper's — `Look.wallpaper` reads Material 3's picks, `system_accent1_200` (dark) / `system_accent1_600` (light) for the accent and `system_neutral1_900` / `system_neutral1_50` for a surface, so the bottom bar's pill, the +, the capture box and the launcher shortcuts' glyphs take it. A vault that keeps **Atlas's own palette** (`ui.palette = "atlas"`, no accent of its own, not high contrast, not e-ink) takes them in the page too, through the paths that already joined the two: the page asks the bridge `AtlasNative.wallpaper(dark)` (`{accent, bars}` as `#rrggbb`, "" below Android 12), the way it asks `fontScale()`, and uses the accent as a chosen accent (`applyAccent`, settings.svelte.ts); it then reports the surface through `AtlasNative.paper(css)` instead of its `--bg-app`, so the top and bottom bars and the system bars behind them (drawn edge to edge over them) are the wallpaper's. The dark or light side is the page's own theme, not the phone's night mode, so a vault shown light on a dark phone still matches. Any other palette, or an accent set in Settings, keeps its own colours, the bars taking its `--bg-app` as before. Older Android: unchanged (no wallpaper colours, the app's fixed accent).
- **The home-screen widget** (`TodayWidget`, an `AppWidgetProvider` with native `RemoteViews`; the full app and the Boox one, not the capture app): the day and the vault, a **Capture** button, the last lines of **today's log**, **Coming up** (the Agenda's next four things, "The Agenda, native"), and the **open tasks** (the first twelve, a count beside "Open tasks"). 4 × 2 cells to start, resizable both ways down to a 2 × 1; rows past its height are cut by its frame (a plain `LinearLayout` of rows, not a scrolling collection: no `RemoteViewsService` to keep). The data is Home's own: the core's `GET /api/today`, reached as every native screen reaches a vault (`VaultFiles.OnServer`: the in-app core `Local.of` starts for a folder vault, the vault's server with the app's sign-in for a server's), so the tasks are the core's list (`today::open_tasks`) in its order, and nothing in Java reads a task; the log's lines are shown as written (its properties, blank lines and a list's `- ` left out). The vault is the one the app opens (`Vaults.current`).
  - **Taps**: a task opens its note **at its line** (`AtlasActivity.OPEN` + `LINE` → `atlasShell.open(path, line)`); the log opens today's log note; the day opens Today (`Shortcuts.place("home")`, the launcher shortcut's intent); Capture starts the capture box (`CaptureActivity`, as the tile and the shortcut do).
  - **The vault's palette**: the page reports its background (`paper`) and its accent (`AtlasNative.accent(css)`, beside `paper` in settings.svelte.ts); `TodayWidget.paint` keeps both per vault in the app's preferences (`widget`), since the widget has no page, and draws again when one changed. The card and the Capture pill are white shapes tinted with `ImageView.setColorFilter` (a call RemoteViews allows on every Android since 8); the text is light or dark by the background's luminance. Before the vault was ever opened: the app's own colours (`Look`).
  - **When it is drawn again**: every 30 minutes (`updatePeriodMillis`, the shortest Android allows; no WorkManager, no alarm), whenever the app comes forward or leaves it (`onResume`, `onPause` → `TodayWidget.refresh`, an `APPWIDGET_UPDATE` to the placed ones; nothing when none is placed), and when the page's colours change. The fetch runs off the main thread under `goAsync()`, since the first one may start the in-app core.
  - **Resources**: `res/layout/widget_today.xml`, `widget_task.xml`, `res/drawable/widget_shape.xml`, `widget_pill.xml`, `res/xml/today_widget.xml` (the provider: sizes, resize, period, preview); found by name (`getIdentifier`) as every resource here, the build making no `R` class.

## The + is New…

After trying atlas-boox.apk: the + was nice as quick capture, but the capture belongs on the accessibility button or another button; the + should create a normal note, a lecture drawing and so on, and focus on placing the new note in the vault quickly. The full apps' + (Home, Files) now opens the page's **New…** (`atlasShell.command("ui.new")`, lib/new-thing.ts): a note, a note per template (placed by its `create_in:`), a drawing, and the plugins' kinds (`atlas.registerNew`; in a vault with a Lectures plugin, e.g., *Lecture note* and *Lecture drawing*). **A long press on the + is the quick capture**, as are the Quick Settings tile and the accessibility button. Chosen as the default while "what does placing mean" is still open — to revisit.


## A server's vault shows the app's own interface

A server vault on the Boox worked but used the server's JavaScript, so the file explorer was the desktop's, not the Android view. Decided: the app brings its own interface, while the server may still provide plugins' JavaScript; app and server check UI versions and warn; and the app no longer downloads the server's 20 MB of JS.

- **How**: `AtlasActivity.ownUi` (in `shouldInterceptRequest`) answers every GET to the server's host from the app's own interface — `Core.uiFile` (JNI) → `atlas_core::server::ui_file`, the very lookup `atlas serve` uses (installed UI, then the built-in one; a page address is `index.html` told its prefix through `window.__ATLAS_API__`). Not intercepted: `/api/…` (notes, data, **plugins' code** — the server's), `/auth/…`, `/login`, and anything the app does not carry. Same origin as before, so Authelia's cookie and Atlas's session work unchanged.
- **Versions**: `atlas_core::server::API_LEVEL` (bumped whenever the interface starts relying on a server call or answer an older server lacks) and `GET /api/version` → `{version, api, ui}` (`ui`: the hash of the interface's index). `AtlasActivity.checkVersion` compares the server's with `Core.version()` on opening a server vault and says once per server version: older server (API lower, or no `/api/version` at all — 404), or newer server (update the app). Logged as `versions: app …, server …` (AtlasPage).
- Test: `server_mode.rs` `the_interface_and_its_version_for_the_phone_app`.
- Consequence: a phone's interface changes with the app, not the server; a new server-side call needs `API_LEVEL` bumped so older apps/servers are told.


## "Catalogue it": the capture box hands links to the catalog

For YouTube and YT Music the URL matters: it is passed on to TubeArchivist or another app that downloads music into the music library. The catalog already does the hand-off (a catalogued video → TubeArchivist's `archive`, anything → the Downloader's `send`: `[contributes.catalog] links`); the phone's captures only went to the day's log. Now, on a **server vault**, when the capture carries an address (the browser's page, what is playing, or one in the text: `CaptureActivity.links()`), a chip **Catalogue it** appears (off until chosen). Saving then also calls the server's `POST /api/plugins/catalog/tools/add {text: url}` for each address, after the capture itself succeeded; the status line ends with `catalogued: <note names>` or why not. A capture-only token (the capture app's) may not call plugin tools (`auth::CAPTURE_PATHS`): the box then says to catalogue from the full app. A capture kept offline (Outbox) is not catalogued later — said here as a known gap.


## The reader app, the mirror, the Library tab

- **Open with → Atlas** (`OpenWithActivity`, `AndroidManifest.atlas.xml`): a book, a comic or a PDF from another app
  (a file manager, a download, a mail) — EPUB, MOBI/AZW, FB2, PDF, CBZ — is copied into the app's own folder `Opened/`
  (a vault of its own, so the reader keeps its place and notes beside the file as in any vault; the same file again is
  not copied twice) and opened by the native plugin that reads its kind (`PluginActivity.start(…, vault)`). CBR and
  DjVu are not claimed: no reader opens them yet.
- **The Library tab** is the page's Libraries; the app's own readers (Books, Manga) are tabs of it that open the
  reader (`AtlasNative.nativePlaces` / `openPlace`, `registerNativeLibrary`), standing in for their plugins' page
  libraries; the ⋯ menu no longer lists them.
- **The mirror**: `Core.mirror` gives the in-app core a folder's mirror and the phone's
  sign-in for it; Settings → Vaults shows a folder and its mirror as one row, and a server vault's details offer
  "Its copy on this device…". A capture of a folder vault is always written by the in-app core (`toFolder`), mirrored
  or not: the old `CaptureActivity.toMirror`, which sent it to the server first, was removed in v2 step 2.
- **Crashes fixed**: the bottom bar asked for an icon the phone never had (`Look.icon` now blank instead of null; a
  test over every icon name in the Java); closing a drawing closed its live socket on the main thread.
- **The native notepad**: a stroke shown once the view has drawn it (OnyxInk `up`); saving, Properties, Move and
  Delete never on the screen's thread; the system bars hidden while it is open, full screen hiding only its controls;
  a new notebook's pages the screen's shape.


## Manga, a reader app of its own

The Manga plugin's Android side (`plugins/beta/manga/android/`) is a Suwayomi client with its own places, one stack
in `MangaScreen` (Back goes down one place, past the first the app takes it):

- **The library** (`LibraryView`, address `manga:library`; the command *Manga: library* on the phone): the server's
  categories as tabs, the vault's own series (the manga folder) in theirs, and **Reading** — what was started, last
  read first — whose series open straight in the reader where they were left. Covers in a grid or a list (the bar's
  button, kept as the setting `library_layout`), the unread count on each, a filter by title, pull to refresh (the
  server's library update: it looks for new chapters). The server's library is kept (`library.json` in the plugin's
  cache) and shown as last seen when the server cannot be reached. Which tabs exist and what each lists are
  `Shelf.tabs` / `Shelf.shelf`, plain Java with a JVM test (`ShelfTest`).
- **A series** (`SeriesView`, `manga:series/<vault path or suwayomi:<id>>` — the page's Comics library hands its series
  here on the phone): the cover, one button that goes on where you were (`Shelf.resume`: the chapter left half read at
  its page, else the next unread, else again from the start), the chapters newest first or oldest first, read ones
  quiet, the one being read in bold, a server's chapter whose every page is on the phone marked *offline*. A tap reads
  a chapter from where it was left; a long press marks it read or unread, marks the ones before it read, or keeps it
  for offline; *Keep the next 5 for offline* fetches the next unread chapters' pages into the cache. Pull to refresh
  asks the server to fetch the series' source again. Read state goes to the server (Suwayomi's `updateChapter`) or to
  a vault series' note (`chapter_progress`, the format the reader already writes). *Its note* opens the series' one
  note, made then if it has none; reading makes it only once the series is yours (a page past a chapter's first, a
  chapter finished: `Thing`, `ThingTest`), through the catalog's rule (`Host.thingNote`), the page's same call.
- **The reader** (`ReaderView`): what a finger means is decided by `Gestures` (plain Java, `GesturesTest`) — tap zones
  per layout with right to left flipped, swipes by length or speed along the reading axis, fit width scrolling before
  it turns, a zoomed page panning before it turns, pinches and double taps (`Zoom`). The touch's owner is fixed when
  the finger comes down (the bars, the pen or a palm, else the page) and the first touch is always taken, so a gesture
  is never split or dropped. A page slides with the finger and out on a turn (no animation on e-ink). Past a
  chapter's end comes the transition page (`Transition`: finished, next, and a warning when chapter numbers skip),
  then the next chapter at its first page; back from a chapter's start, the previous one at its last.
- **Offline**: a chapter opened once, or kept, opens with no network — its page list and pictures are in
  `.atlas/cache/plugins/manga/suwayomi/` (`Kept`, `KeptTest`), shared with the web side; a series' chapters and the
  library come from there when the server does not answer.

- **Browse** (the library bar's **+**, with a server): the sources installed in the user's Suwayomi
  (`SourcesView`), under their languages — the phone's first, then the ones spanning languages, the server's own
  folder last — with a box that narrows them by name; a source's series (`SourceView`) as covers, **Popular**,
  **Latest** (when the source has it) or a search, the next page asked as the grid nears its end, a series listed twice
  by overlapping pages shown once, the ones already in the library quieter and marked. A tap opens the series' screen:
  for a series the server knows only from a listing, the server first fetches its details and chapters from the source
  (`fetchMangaAndChapters`). That screen shows who made it, its status, genres and description, and **Add to library**
  (asking its categories when the server has some) or, once in, **In your library · change** (its categories, or
  Remove). Back in the library, it lists again. Installing sources (extensions) stays in Suwayomi's own page; nothing of
  Browse is kept for offline. The library's tabs follow the categories' own order on the server (`order`), kept with
  the library for offline.
  The calls, checked against Suwayomi's GraphQL schema (its server source; no real server was reached for these):
  `sources { nodes { id name lang displayName iconUrl isNsfw supportsLatest } }` (a source's id is a `LongString`, sent
  as text), the mutation `fetchSourceManga(input: {source, type: POPULAR | LATEST | SEARCH, page, query})` →
  `{hasNextPage, mangas}`, `manga(id)` with `user { inLibrary }` (the top-level `inLibrary` is deprecated),
  `updateManga(input: {id, patch: {inLibrary}})`, `updateMangaCategories(input: {id, patch: {addToCategories,
  removeFromCategories}})`, `categories { nodes { id name order default } }`. The questions, what the answers mean and
  the paging are plain Java (`Browse`, read with its own small JSON reader `Json`, since Android's org.json is not on
  the desktop JVM), tested against cut-down answers in the schema's shape (`BrowseTest`). The desktop's Comics library
  (`suwayomi.js`) has no Browse yet.

## The PDF reader: the page strip, the column zoom, find as it goes

The Books plugin's native PDF reader (`plugins/beta/books/android/PdfView.java`) on top of fitting the width, cropping
the margins and turning by screenfuls (`PageFit`):

- **The page strip** (`PageStrip`): while the bars show, the pages as small pictures in a row just above the bottom bar
  (`ReaderBars.strip`, a reader's own row: hidden while a panel is open, its touches its own), the page read framed in
  the accent and brought into view after every turn or jump. A finger drags the row, a tap jumps (and leaves "Back to
  page N", as every jump). The pictures are drawn by `PageSource.thumb` about 54 dp wide on the render thread (never
  the UI's), kept in a cache of their own (12 MB) apart from the pages read, and only while still in view when their
  turn comes (a strip dragged past a page draws nothing for it); until one is there, its cell is a white page with an
  outline. Where cells go — width, the page under a tap, the scroll that brings a page to the middle, a short row
  centred — is plain Java (`StripLayout`, `android/test/StripLayoutTest`).
- **A double tap zooms to the column under the finger**: the page's characters from PDFium (`Pdfium.text`) are taken
  to the page's shown space (`PdfText.shownBoxes`, through `PageSpace`, so a turned page works) and handed to the core
  (`Pdfium.column` → JNI `Core.pdfColumn` → `atlas_core::pdf_columns::column_at`, the same function the desktop's
  double-click asks over `POST /api/pdf-column`). The zoom makes that column fill the width (4 % room), centred across,
  the tapped line kept at its height. No text there (a scan, a figure), or a column already as wide as the screen: 2.5×
  about the finger, as before. A double tap while zoomed fits the page again.
- **Rendered ahead at the zoomed size**: after a turn, a double tap or a pinch, the page and the ones either side are
  rendered at the width they are shown now, zoom included (`renderAhead`), so a turn while zoomed shows the next page
  sharp at once instead of a smaller picture scaled up. The rendered pages' cache is half the app's memory, between 64
  and 192 MB (a page zoomed to 3200 px is about 50 MB: three fit).
- **Find as it goes**: from the page shown to the end, then from the start, on a thread of its own and one PDFium call
  a page (PDFium's lock is free between pages, so the page keeps drawing); the first match is shown as soon as it is
  found ("Back to page N" offered), the bar counts on ("3 / 12…", "Finding… page 37" before the first), ✕ stops it.
  Every match of the page is framed, the current one firmly.

Needs a device to confirm: the strip's drag on e-ink, and the memory a 3200 px page costs on the Boox.

## What is on screen: YouTube, Spotify, Letterboxd, Wikipedia

The goal: recognise the YouTube video, the Spotify song, the Letterboxd page or the Wikipedia article on screen, inside
their apps too. A capture from the tile or the
accessibility button now carries **the thing's own link and title** — `- 09:39 [Dune: Part Two](https://letterboxd.com/film/dune-part-two/)`
with the screenshot under it as a thumbnail (`![[Screen ….png|240]]`) — so the catalog files it ("Catalogue it" picks the
link up like any other).

**Where it happens**: `ScreenService` reads the window the moment the button is pressed (`Page.read`: the views, depth
first so they are in reading order, at most 600, each as an `Onscreen.Node` — text, view id, class, description, Chromium's
`url` extra); **`Onscreen.java`** (plain Java, no `android.*`) recognises; the box (`CaptureActivity.readPlaying`) finishes
what needs a media session or the network, off the main thread, without holding up the screen.

**Per site — the most robust source first:**

| on screen | what gives the link | the title |
|---|---|---|
| any browser | the address bar (a view id saying url/address/location), else Chromium's web root `url`, else any address-shaped text | the tab title, the site's suffix taken off (`- YouTube`, `- Wikipedia`, `\| Spotify`, Letterboxd's `directed by … • Letterboxd`, YouTube's `(3)` unread count) |
| YouTube / YouTube Music app (also ReVanced, NewPipe, LibreTube: the package says so) | the app's **media session** (`Playing.of(all, pkg)`: the session of the app on screen is what it shows) — its id, else YouTube's own search for "title channel" (*· by search*) | the session's "Title — Channel" |
| Spotify app | the media session: `spotify:track:…` → `open.spotify.com/track/…` | "Song — Artist" |
| Letterboxd app | the film header: a year alone or leading a line (`2024`, `2024 • Directed by`), the text just before it is the title → `letterboxd.com/film/<slug>/`, then `<slug>-<year>`, each fetched and kept only when its `og:title` ends with that year (remakes: `dune` is 1984, `dune-2021` the other) | the film's title |
| Wikipedia app | its article is a web page from `…/api/rest_v1/page/mobile-html/<Title>` (the web root's `url`) → `https://<lang>.wikipedia.org/wiki/<Title>`; without it, the title view → the REST summary (`/page/summary/<Title>`, redirects followed) in the phone's languages, then English | from the address |
| any other app | — (as before: the view id saying `title`, else the longest one-line text, offered off as *App: title*) | |

**Canonical addresses** (`Onscreen.canonical`, after `Core.untracked`): `m.youtube.com` / `youtu.be/ID` → `www.youtube.com/watch?v=ID`
(a start time `&t=` kept, playlists and `pp` dropped), `/shorts/ID` kept as shorts, `music.youtube.com/watch?v=ID`;
`<lang>.m.wikipedia.org` and the app's mobile-html → `<lang>.wikipedia.org/wiki/…`; Spotify's `intl-xx/` prefix dropped.
These are the shapes the catalog's `recognize` patterns know.

**Guards**: in a known app only its own site's address is taken (a link in a YouTube description, an ad's WebView, are not
the video); Spotify's longest text (a lyric, a playlist blurb) is never its title; an answer that arrives after a newer
capture is dropped (`asked`); a link found by searching a title *guessed* from the screen (YouTube without a session)
is offered off (*· by search*), one from the app's own session or a checked lookup on. Degrades: no media session and offline → the title is offered off as before; an unknown app →
the screenshot and its guessed title, as before.

**Tests**: `crates/atlas-android/android/test/run.sh` — `OnscreenTest` (40 checks: Chrome on m.youtube, Firefox on
m.wikipedia, the Wikipedia app with and without its web root, the Letterboxd app's header in two shapes, the YouTube and
Spotify apps, Spotify and Letterboxd in a browser, an unknown app, canonical addresses, slugs, the og:title year, the
summary's address, the search page's first video, thumbnails) on the desktop JVM, no device. `build-apk.sh` runs it before
compiling the app, so a broken recogniser fails the build. The network halves were checked once by hand from the desktop
(`Dune`+2021 → `film/dune-2021/`, `Dune: Part Two`+2024 → `film/dune-part-two/`, Harakiri's summary → its
`/wiki/` page, YouTube's search → `dQw4w9WgXcQ`). **Not yet seen on a phone**: the view trees above are shaped from the
apps' known layouts, not dumped from a real phone — the first real captures in each app are the check.

## System notifications

The core decides when a notice becomes a system notification (`crates/atlas-core/src/notify.rs`), on the phone as on the desktop. `crates/atlas-android/src/notices.rs` gives the core a notifier (`notify::set_platform`) that calls `Notices.java` over JNI; a click opens the notice's vault path through `AtlasActivity`. Android 13 and later ask for the permission once, when the app first opens.

**A channel per kind** (`NoticeKind.java`, the one place a notice's source is mapped): **Reminders** (the calendar's, `dav`; high importance, heads-up), **Nudges** (`plan`: its nudges and morning digest), **Mail** (`email`), **Sync** (the core's conflict copies, Syncthing, the mirror; low, silent) and **Other** (everything else, failures of scheduled commands included). Each can be silenced, or made louder, in Android's settings for the app without touching the others. All five are made on the first notice of a process (making a channel that exists keeps what the person set for it); the per-source channels of older builds (`notice.<source>`) are removed then. A new source that deserves its own kind is one line in `NoticeKind.of`; anything unknown lands in Other. A reminder carries Android's `event` category, a nudge `reminder`, a mail `email`, so Do Not Disturb's own rules for those apply.

### Reminders on time

The core rings planned notices itself (`planned.rs`: a plugin's `on = "plan"` tool, asked every five minutes and again just before one rings; what fired is kept by id and moment) — but only while it runs, and Android ends or freezes a backgrounded app. `ReminderAlarms.java` keeps one **alarm per folder vault** at the vault's next moment, so a reminder rings on time with the phone asleep and the app's process gone:

- **When**: `Reminders.next` over the core's own files — `.atlas/cache/planned.json` and `planned-snoozed.json` less `planned-fired.json` (the same key as `planned.rs`) — and the planning device's nudges in `plan/next.md` (the Plan plugin's note, synced), each **2 minutes late**: the grace of the device rule (DESIGN-calendar-tasks-nudges.md §3.7). By then the desktop that rang it has written its ledger line; the phone's core, started, asks the Plan plugin, which rings on the phone only when the rule picks it. A stale `next.md` (2 hours, the planner asleep) is not read: the phone plans for itself and its own `planned.json` has the times. Never two wakes less than a minute apart.
- **The wake**: the alarm's broadcast (`goAsync`, a partial wake lock) starts the vault's core in the app's process (`Local.of`, as the widget does), keeps it 40 s (`Reminders.HOLD_MS`: the planned loop's first look comes 15 s after it starts, then the plugin's answer, then the notification through `Notices`), and sets the next alarm. Logged under `adb logcat -s AtlasAlarm`.
- **Exact or not**: `setExactAndAllowWhileIdle` (on time, even in Doze). Android 13+ grants `USE_EXACT_ALARM` to a calendar or reminder app at install; Android 12 has `SCHEDULE_EXACT_ALARM` (granted, revocable; declared up to API 32). Where the permission is withheld, `setAndAllowWhileIdle` (Android may defer it by minutes in Doze; a planned notice still rings within its `until`, 15 minutes by default) and the log says so. The alarms are set again when the app goes to the background, after a restart of the phone (`BOOT_COMPLETED`), after an update (`MY_PACKAGE_REPLACED`) and when the exact-alarm permission changes. The receiver is exported for those system broadcasts; a ring is acted on only for a folder vault in the app's own list.
- **What was armed**: each time it sets them, `ReminderAlarms` writes `.atlas/cache/alarms.json` in the vault (`Reminders.armed`: `{ exact, armed_at, nudges }`, the `plan/next.md` stamps it wakes for, each wake setting the next). The vault's core reads it on a phone into its presence report (`devices::Alarms`), so Plan's device rule can leave a nudge the phone armed exactly to the phone while the app is closed (plugins/beta/plan/README.md, "The phone's alarms"). It reaches the server while the vault's core reports — the app open, or just left, when the alarms are set.
- **Not covered**: a server's vault (its core runs on the server, which does not show notices); a folder vault's mirror is not linked by the wake (the device rule then sees this phone as present while its core runs). Needs a device to confirm: a reminder with the screen off for an hour, in Doze, after a reboot, and with the permission revoked on Android 12.

Pure logic in `NoticeKind`, `Reminders` (and `WebHealth` below), tested on the JVM: `android/test/RemindersTest`.

## The note view, robust

The WebView's failures, each logged by its name under one tag (`adb logcat -s AtlasWeb`) and said in a toast (`WebHealth.java` names them and decides; `AtlasActivity` acts):

- **`renderer-gone`** (`onRenderProcessGone`: out of memory, a crash): the WebView is made again through the vault's opening with `resume` — back at the file in front, its tabs restored from what the app remembers — instead of a dead screen. An old view's renderer dying only lets that view go. **`renderer-loop`**: more than three restarts within two minutes wait for a tap on a message, rather than a loop that drains the battery.
- **`not-ready`**: a page that never says ready within 20 s is shown as it is (as before), now logged by name too.
- **`core-restarted`**: on resume after 15 s or more away, the core is asked for `/api/version` (the cheapest GET: version, commit and interface digest; the in-app core with its key, a server with the app's sign-in). Another answer than when the page opened (the server updated, or the in-app core made again, on another port: the address counts as part of the answer) — or an answer a few seconds after none (it was restarting) — reloads the page once, at its place. **`core-down`**: no answer twice is said, never reloaded into an error page.
- **`memory-low`** (`onTrimMemory`): when memory runs low with the app in view, or once the app is in the background, the WebView's memory cache is let go (the files on disk stay). Logged, not said.
- **One WebView per vault, never two**: opening a vault, a restart and a reload all take the old view out and destroy it before making the next.

## Ways into the capture box, and the box floating over the app

**Ways in**: the quick-settings tile, a share, text selected in any app ("Capture" in its selection menu), the launcher shortcut, the accessibility button / gesture / volume-key shortcut (`ScreenService`), and two switches in Settings → Capture (`CaptureWays`): **a Capture icon of its own** (an `activity-alias` of the box, disabled until asked for: the home screen, the app drawer, a Pixel's Quick Tap "open app") and **a quiet notification that stays** (`IMPORTANCE_MIN`: no sound, no status-bar icon, shown on the lock screen since it shows nothing of the vault; posted again when the app starts).

**The box is held by a frame** (`CaptureBox`, a `ContextWrapper` over the frame's context, so its views and dialogs are the frame's):
- `CaptureActivity` — a translucent screen of its own. Android pauses the activity under any activity, so a video under it stops.
- `CaptureOverlay` — a window of the accessibility service (`TYPE_ACCESSIBILITY_OVERLAY`), used whenever the service opens the box (button, gesture, volume keys, the tile when the service is on): the app under keeps running — a video plays on under the dimmed screen. It needs no permission beyond the service the user already turned on. Its own dialogs (a picture shown large, the drawing canvas) are windows of the same type (`CaptureBox.above`), else they would open under the app.
- **What only an activity can do moves the box into one** (`CaptureBox.activity(Then)`): the camera, "All files access", signing in to a server. The draft is kept and the box reopens as `CaptureActivity` with the same intent (the screen taken, the page's link) and does the step there. Choices made in the floating box (a chip turned on) are not carried over.
- **The floating box goes away when another app comes up** (home, a switch): the service's `TYPE_WINDOW_STATE_CHANGED` events, looked at only while the box floats, ignoring the app under it, Atlas itself, the system UI and the keyboard. The draft is kept.
- **A switch** in Settings → Capture, "Over the app, which keeps running" (on by default, Android 11+); off, the service opens the activity as before.

## The box ready to type at once, shares read by shape

**Nothing but the text box on the main thread before the first frame.** The box used to ask the core three times while it was being built (the share's text, the hint, the completions) and once per keystroke after; the first call loads the native library, tens of megabytes in the full app, and a hint reads the vault's settings and its plugins' manifests from shared storage. Now:
- **One thread for the core** (`CaptureBox.core()`, a `HandlerThread` named `capture-core`): every call the open box makes — `describe`, `suggest`, `shareText`, `prepare` — is posted there in order, and its answer is shown only while the text, the caret and the vault are still the ones asked about (`hint`: a newer keystroke drops an older answer, a completion taken meanwhile asks again). Saving keeps its own thread.
- **The library loads before the box asks** (`CaptureBox.warm()`): queued first on that thread when the box opens, and by `ScreenService` as soon as the gesture comes, while the screen is being taken.
- **The draft at once, the share after**: the box opens with the draft from Java's own preferences and the focus in the text (the keyboard comes with the window, `stateAlwaysVisible`); a share's text is made by the core on its thread and put under the draft when it is ready (`shareIn`, `under_draft`). A box moved into its activity carries its share in its draft already (`Shared.DRAFTED` on the intent), so it is not added twice.
- **The screen opens the box before its file exists** (`Screens`): `ScreenService` reads the page (on a thread of its own, cut at `Page.BUDGET_MS` = 400 ms; what was read is used) while the screenshot is taken, and opens the box when both are in. Encoding a 2–3-megapixel PNG took longer than everything else the gesture did; it is now written in the background (`<path>.part`, then renamed, so a file at the path is always whole) and the box shows the picture once it is on disk, its thumbnail made from the pixels in memory. Only the tile waits for the shade's closing animation (350 ms); the accessibility button, gesture and volume keys shoot at once.
- **Smaller things off the main thread**: the media permission check for the last screenshot; whether a camera app answers is asked of the system once per process.

**Timings in logcat**, tag `AtlasCapture` (`CaptureClock`): one line per step, `<way> +<ms since the gesture> <step>` — opening, box built, first frame, window focused, keyboard up, shared text in, screen shown, saving, saved in N ms; the service's own steps as `screen +N ms …` (screen taken, page read, screen written); `core ready in N ms`. The gesture's time travels in the intent (`org.atlas.capture.t0`, set by the tile and the service); a share has none (the other app's tap is not seen), so it counts from the box's start and says when the process was started cold for it. Read them with `adb logcat -s AtlasCapture`; DeviceLog carries the app's logcat into the vault's device log.

**A share is read by shape, never by app** (`CaptureBox.Shared`): `EXTRA_TEXT` (and the link targets a styled text's words hide), every text of a `SEND_MULTIPLE` (`EXTRA_TEXT` as a list), the HTML text's links when there is no plain one, every ClipData item's text and web address, `EXTRA_SUBJECT` (else `EXTRA_TITLE`). `Shares.join` makes the pieces one text — apps fill the same thing in twice (the text and its ClipData copy, a styled text and its link), so a piece another one holds is dropped and the fuller one kept in the first one's place (plain Java, `android/test/SharesTest.java`). What that text becomes is the core's (`Core.shareText` → atlas-capture `share::shared`): every address loses its tracking parameters (atlas-text `links.rs`, the one rule every capture and the catalog use — with Reddit's `share_*`, Spotify's `dlsi`, Google Maps' `g_st`, Facebook's `mibextid`, TikTok's web-share keys, and `SITE_TRACKING` for keys that track only on one site: X's `s` and `t`, while YouTube's `t` stays), and the subject becomes a title by its shape (`share::title_of`): an address, the app's own name beside its address (`Spotify` with `open.spotify.com/…`) or a text already said is dropped; one quoted part in a few words (`Watch "…" on YouTube`, `“…” on Letterboxd`) is that part. Whole shares as the apps send them are a fixture, `crates/atlas-android/tests/fixtures/shares.json`, tested by `cargo test -p atlas-android text::` — a new app whose share comes out wrong goes there first.

**Text in a picture (OCR) stays off the phone** on purpose: Android has no text recogniser of its own (ML Kit needs Google Play services; Tesseract would add tens of megabytes to the APK). A capture with a picture — the screen, a shared screenshot, a photo — is kept for another device's hooks (`capture::keep_for_others`; the OCR plugin's `[platforms]` say no here), and the desktop or the server that serves the vault runs the OCR plugin's capture hook: the text goes under the picture in the capture's note as a folded `[!ocr]` callout (the plugin's own path) and is handed to the catalog, whose `canonical_url` takes tracking off with the same atlas-text rule, so a link read in a screenshot is the same item as the clean one.

**Not yet seen on a phone**: the timings above are logged but not measured on a device (no phone was attached when this was written); the share fixture is shaped from the apps' known share texts, not captured from them.

## Audiobookshelf, a listening app of its own

The Audiobookshelf plugin's Android side (`plugins/beta/audiobookshelf/android/`) is a native client of the user's
server, one stack in `AbsScreen` as Manga's (Back goes down one place, past the first the app takes it), with a mini
player along the bottom of every place while one of its books is loaded:

- **Home** (`HomeView`, `audiobookshelf:home`): per library the server's personalized shelves (Continue listening,
  Recently added, series, Discover, Listen again, Newest episodes) as rows of covers, then the collections and
  playlists; the bar's search asks every library's `/search` after a pause in typing (books and podcasts, series,
  authors).
- **Library** (`LibraryView`, `audiobookshelf:library`): tabs Books (a grid or a list of `Tile`s, the choice kept on the
  device), Series, Authors, Collections, Playlists (`PlaceList` rows); a filter; a row opens its books (`GroupView`; an
  author's asked when opened, a podcast's episodes newest first, an episode plays).
- **A book** (`BookView`, `audiobookshelf:book/<item id>`): cover, details, description, chapters and bookmarks (added
  where the player is, removed with a long press), *Play* / *Go on · 1:02:03 · chapter* / *From the start*.
- **The player** (`PlayingView`, `audiobookshelf:playing`): over `MediaService`'s session — cover, chapter, the bar,
  ⏮ / −skip / play / +skip / ⏭, speed (kept on the device), sleep (off, end of chapter, 15 / 30 / 60 min), the
  chapters with the one playing marked.

How it reaches the server: through the vault's core, never with the token in Java. `Host.fetch` posts the request to
`/api/plugins/<id>/fetch` (`atlas.fetch`'s path: `{secret: "token", prefix: "Bearer "}` filled in by the core);
`Host.media` turns a track into a `/media/<ticket>` address; `Host.play` hands the item to `MediaService` with the
key the helper's `progress` reads (`{item, session, device}`), so where you are goes to the server from the player's
own reports, as from the page; `Host.watchPlayer` hears its state beside the page (`MediaService.watchers`). Covers
are kept in `.atlas/cache/plugins/audiobookshelf/covers/` (the page's place). The answers are read by plain Java on
the shell's `Json` — `Cards` (cards, shelves, series, authors, collections, playlists, hits, episodes, bookmarks),
`Book` (details, a play session, the chapter at a time), `Clock`, `State` — tested in `android/test/run.sh`
(`CardsTest`, `BookTest`) on answers shaped like the stand-in server's. `TopBar`, `Tile`, `Json` and `PlaceList` are
the shell's, shared with Manga.

Opening it from elsewhere: any of its addresses through `PluginActivity` / `Host.openPlugin("audiobookshelf", …)`,
or the page's `atlas.openNative("audiobookshelf:home")` (false on the desktop, where the pane shows). Needs a device
and a live server to confirm.

## A plugin's own launcher icon

Audiobooks and Manga each show in the phone's launcher as an app of their own, beside Atlas: a native plugin says so in
its manifest (`[android] launcher = { label, icon, home }`, PLUGIN-API.md), and `build-apk.sh` makes the entry —
`scripts/dev/android-launchers.mjs` writes an `<activity>` per launcher into the full apps' manifest at its marker (its
own `LAUNCHER` filter, label, an adaptive icon of the app's icon on Atlas's tile, and its own `taskAffinity`, so it is
its own app in recents), the icon into `mipmap-anydpi-v26/ic_plugin_<id>.xml`, and an empty `PluginLaunchers.<id>`
subclass of `PluginActivity` for it to name. `PluginActivity` reads the plugin and its place from the entry's
meta-data: the plugin's native home opens in Atlas's own process, on the same core and the vault in use (no vault yet:
it says to choose one first). The Boox app gets the same entries under its own package. The generator is tested by
`node --test scripts/dev/android-launchers.test.mjs` (build-apk.sh runs it first).

## Plugins bundled in the app

The full apps (Atlas, Atlas for Boox) carry every phone-ready plugin's run-time files — `plugin.toml`, `main.js`, `view.js`, `helper.js`, their shared modules and README — as APK assets, packed by `build-apk.sh` through `scripts/dev/bundle-plugins.mjs` (`node scripts/dev/bundle-plugins.mjs list` shows which). A phone vault no longer keeps whatever copy it was given: when a folder vault opens, the app brings it up to the carried versions through the core's own install path (`Bundled.java` → `plugin_install::sync_bundled`). A plugin the vault has at an older version is updated (its settings and its own files kept, the old copy in `.atlas/trash/`); a plugin that replaces one the vault has (Audiobookshelf in place of `catalog-audiobookshelf`) is installed in its place, settings carried; a copy changed in the vault since it was installed is left as it is and said once. A toast names what changed ("Plugins updated: …"). Plugins the vault does not have are not added on their own: Settings → Plugins lists them under "Built into this app", and a tap adds one. A server's vault has the server's plugins and is not touched. How it works: `docs/guides/DEVELOPING.md`, "Plugins an app carries".

## Files and Search, native

The phone's Files and Search places are native screens (docs/design/DESIGN-android-native-app.md §3), drawn on one list widget and fed by the vault's core — the in-app core for a folder vault, the server for a server's (`VaultFiles.OnServer`, the same client the share target uses). Nothing about files or ranking is re-implemented in Java: the Java draws, the core decides.

- **`PlaceList`** (the one list of the native places; the Library is next on it): Material 3 list items of 56 dp at least — a 24 dp icon, the title over a supporting line, a trailing ⋮ — under sticky section headers (the next header pushes the current one up), in the `Look`'s colours (e-ink: no glow, no animation). A tap opens; a long press or the ⋮ opens the item's menu; a pull from the top reads again (a disc with an arrow, then the platform's spinner); a sideways fling steps to the place beside, as on the bottom bar; scrolling is a `ListView`'s own fling, rows made only for what is on screen. What the lines are is plain data (`PlaceItem`), built by `FileRows` and `SearchRows`.
- **Files** (`FilesScreen`): a folder from `GET /api/tree?path=…` — folders first, then files, in the core's order (a "Folders" and a "Files" header only when both are there); companion notes the tree hides stay hidden, ignored entries are dimmed; each file's line says when it changed (the hour today, the day this year, the date before) and its size. Breadcrumbs above (the vault's name, then each folder; a tap goes there; the current one in the accent). Back steps to the folder above before leaving Files. The ⋮ menu: *Open*, *Open with…* (the page's openers, while the page is ready), *Rename…* (a name typed as the phone shows it keeps the hidden `.md`, as the page's rename does), *Copy a link to it*, *Move to the trash…* — renaming and trashing go to the core (`/api/fs/move`, `/api/fs/trash`: `.atlas/trash/`), so they work without the page; an open tab follows a renamed file through the page's own watch. The file menu's *Show in Files* opens the folder holding the file.
- **Search** (`SearchScreen`): a Material search bar over the list, results as you type. The query goes to the core's `GET /api/search` twice, as the desktop's Search pane does — `names=true` first (the files matched by name, no file read: at once), then the full answer (the names, then the matching lines grouped by file, the files ranked: the desktop's ranking, `search.rs`). `SearchRows.Typing` times it: a search starts 180 ms after the last key (the desktop's pause), an answer to an older query is dropped, and names arriving after the lines are dropped. The list: a "Files" section of names, then a section per file (its header the file and how many lines match in all; a tap opens it) with its lines cut around the first match and every match marked (smart case, as the core's). A hit opens its file at its line (`atlasShell.open(path, line)`).
- **Opening a row** is the existing path: a native plugin when one opens the file (`nativeFor`: a drawing, a book), else the note view with `atlasShell.open` — a place of its own, Back returning to the list. While the page is still loading, the open waits for it (`js()` queues the call) and the screen says "Opening…".
- **Without the page**: the two screens need nothing of the WebView. A page that never says it is ready leaves them in front (the fallback that shows the page as it is applies to the page's own places only).

Pure logic in `PlaceItem` (which header is sticky), `FileRows` (sections, icons, details, breadcrumbs, the rename) and `SearchRows` (sections, cut lines and marks, the typing timer), tested on the JVM: `android/test/FileRowsTest`, `SearchRowsTest`. Not covered yet: drag and drop, multiple selection, the search's regex / whole-word / case options and Replace (the page's Search and Replace do them: ⋮ → Commands). Needs a device to confirm: the fling and the pull on a real screen, the sticky header while flinging, the keyboard over the search bar, and a large folder's first read over a slow server.

## The Agenda, native

The phone's Agenda (docs/design/DESIGN-android-native-app.md §6) is a native screen over the same two answers the desktop Calendar's Agenda reads: the events of the plugin that provides the calendar (its engine's `range`, `POST /api/plugins/@calendar/helper` with the phone's zone) and the core's dated tasks and notes (`POST /api/view`, `from: deadlines`, `scheduled: true`; the deadline calendars' events are left out there, being events already). Java decides nothing about what is due.

- **Where**: a place of the app's own outside the bottom bar's five — the top bar's calendar button on every place, the launcher's *Agenda* shortcut, a tap on the widget's *Coming up*. Back returns to Home, as from Files or Search; the app remembers it as the place it was at.
- **`AgendaScreen`**: segmented chips *Day · 3 days · Week* (kept per install), a bar with ‹ the days shown › and *Today*, and a `PlaceList`: a header per day (Today, Tomorrow, a date; how many items), all-day events, then dated tasks and notes, then timed events by start; an empty day says "Nothing planned". A sideways fling moves by the span, a pull reads again. An event's line: its hours ("… – 06:00" when it began the day before), place and calendar; a task's: *Task* and its note.
- **Taps**: a task or a note opens at its line (the Files path: a native plugin, else the note view); its ⋮: *Mark as done* (the core's `POST /api/task/tick`, as Home ticks: the ✅ date, a repeating task's next one; the list and the widget drawn again) and *Open the note*. An event opens the page's Calendar at its day (`plugin.dav.open`, then its `atlas-calendar:show` event), where its card and its editor are; its ⋮ adds the note it came from.
- **A vault on the phone** runs no Calendar engine (the `dav` helper is built for desktops and servers): the Agenda lists its tasks and says "No calendar in this vault". A server's vault runs the engine on the server and shows both.
- **The widget**: *Coming up* lists the next four things of the coming week (`AgendaRows.next`: what has not ended yet, the soonest first) above the open tasks, each a tap to the Agenda; hidden when there is nothing.

Pure logic in `AgendaRows` (spans and their days, the title, which day an item is on and in what order, the rows' words, the widget's lines; `android/test/AgendaRowsTest`); `Agenda` reads and ticks. Needs a device to confirm: the chips, the fling, the widget's rows and a server vault's events.

## The Library, native

The phone's Library place is a native screen (`LibraryScreen`, docs/design/DESIGN-android-native-app.md §4) over the vault's own libraries — a folder or a Base with a kind, `[ui] libraries` — read from the vault's core like Files (`GET /api/libraries`, `GET /api/library?id=&sort=`: the in-app core for a folder vault, the server for a server's). What a library holds, its order and its Continue row are the core's (`libraries.rs`); the Java draws them, so the Library works while the page loads or has failed.

- **At the top**, a chip per library (its kind's icon), then, after a rule and "SERVERS", a chip per plugin that has a library app of its own — a native side that opens `<id>:library`, as Manga's and Audiobookshelf's do (`LibraryRows.app`, named by the plugin's manifest) — opening that app (`PluginActivity`): a server's things are never mixed into the vault's. **More…** opens the page's Libraries (Drawings, References and the plugins' other libraries, drawn by the page).
- **Under them**, a search field (narrows to the things whose title, author or path hold every word), the order (Title, Last read, Changed — asked of the core as `&sort=`, remembered on the phone per library) and covers ↔ list (the library's own layout first, then the phone's choice).
- **Continue**: what you were in the middle of (begun, not finished, newest first: the core's row), as covers in a strip; not while searching.
- **The things** as covers (a grid of the app's `Tile`, two by three, "42 %" on the cover while under way) or a list (the cover small at the start). Covers are the core's thumbnails (`/api/thumb`: an EPUB's cover, a PDF's or a CBZ's first page, a picture), decoded small off the UI thread and kept for the app's run; a thing with none shows its kind's icon. A tap opens it as any file opens (its native reader, else the note view); a long press gives the file's menu (`FilesScreen.menu`).
- **Empty and failed**: no library yet says how to make one and goes to Files; a library with nothing in it, nothing matching, or an answer that did not come (with Try again) each say so in place.
- **A folder made a library**: Files' ⋮ on a folder → *Show as a library* (`POST /api/libraries/add`, its kind guessed by the core). Kind, order and layout are changed in the page's Settings → Libraries.

Pure logic in `LibraryRows` (which libraries the phone shows, the answers read with the app's `Json`, the search, the lines, the order's cycle, a plugin's app), tested on the JVM: `android/test/LibraryRowsTest`. Needs a device to confirm: the grid's fling with many covers, the keyboard over the search field.

## Every feature has its Android path

A test keeps the phone from silently falling behind: `cargo test -p atlas-android --lib -- parity` reads every feature from the repository — the page's built-in commands (each `id: …, title:` of an `Action[]` table under `ui/src`, a run-time family such as `ui.tabs.${n}` read as `ui.tabs.*`) and the core's built-ins (`core:<id>`), every plugin of `plugins/stable` and `plugins/beta` with its manifest's word on Android (read by the core's own manifest reader), every page of the page's Settings (`PAGES`, with its `only`) and of the phone's native Settings (`SettingsPages.java`, as `phone:<page>`) — and checks each against `crates/atlas-android/parity.toml`, which says how the phone does it: `"page"` (the WebView, as on the desktop), `{ native = "Class" }` (a Java class of the app or of a plugin's `android/`, which must exist) or `{ missing = "why" }` (allowed, and listed on every run, so the gaps stay in sight). It fails on a feature with no line, a `native` class with no file, a line for a feature that is gone, and a line that contradicts its feature's own source (a plugin that runs on Android marked missing, one whose manifest says `no` marked page or native, a native line naming another class than the manifest's `[android] main`); the failure lists every offender with the line to paste. A feature whose own source already keeps it off the phone (a manifest's `no` with its reason, a Settings page `only` elsewhere) needs no line: that is its declaration, listed with the gaps — so a plugin only the private tree carries leaves nothing behind in the shared table. Where nobody has seen a feature work on the phone, the table says `missing = "unverified on the phone: …"` rather than claim it. The checker is a pure function (`parity::check`) with a unit test per kind of failure; each discovery has a floor (at least 20 page commands, 10 plugins, 10 Settings pages…) so a refactor that moves a source fails loudly instead of emptying the list.
