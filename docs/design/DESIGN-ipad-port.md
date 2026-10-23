# Atlas on the iPad: the EU Digital Markets Act route and the others

A study, not a build: what an iPadOS port of Atlas would take, and whether the EU's Digital Markets Act (DMA) changes how it can be distributed. Facts were gathered from Apple's and AltStore's pages in October 2026; points Apple leaves vague are marked **[uncertain]**. The terms change often: re-check the sources at the end before acting on any of it.

## The short answer

- **The DMA only helps an iPad that is in the EU, with an Apple Account whose region is an EU country.** Eligibility is checked on the device. Apps already installed keep working outside the EU, and since iPadOS 27.2 they keep updating for 90 days of travel; a *new* install needs the device in the EU. For anyone else the DMA route does not exist, and the port is distributed the usual ways (below).
- **The DMA does not change what an app may do on the device.** The sandbox stays: no `fork`/`exec`, no running downloaded binaries, no background daemon. Alternative distribution still goes through Apple's review ("notarization"), which checks exactly that.
- **For a free app the DMA route costs only the $99/yr developer membership.** The per-install Core Technology Fee is gone (October 2026 terms); what replaced it, the 5 % Core Technology Commission, is charged on digital sales only. **[uncertain but strongly implied: Apple's pages never say "free apps owe nothing" in so many words.]**
- **The realistic DMA route for a solo or open-source project is an alternative marketplace (AltStore PAL), not distribution from its own website.** Web Distribution has financial eligibility tests no individual meets; a marketplace needs only the paid account and notarization. For an iPad in the EU this is the recommended route (section 5).
- **Technically the port is close to the Android app**: the core's server inside the app on loopback, the embedded UI in a WebView (WKWebView, the same WebKit family as the desktop's WebKitGTK). What does not carry over is everything that starts a process: local terminals and the plugins' helper programs.

## 1. What the DMA allows on iPadOS (October 2026)

### Distribution
- **Alternative app marketplaces** and **Web Distribution** (installing from the developer's own site) work on **iPadOS 18 and later** in the EU. Japan and Brazil allow alternative distribution on the iPhone only, so the EU is the only place that includes the iPad.
- **Notarization is required on every route**: a lighter review than the App Store's (basic function, security, privacy), but still Apple's.

### Fees after the 2026 settlement (in force since 2026-10-01)
In August 2026 Apple announced new EU terms which it says resolve its dispute with the European Commission (the April 2025 fine of EUR 500 M is appealed separately).
- The **Core Technology Fee** (EUR 0.50 per first annual install above 1 M) and the 2025 **Store Services Fee** tiers are **gone**.
- Apps distributed **outside the App Store** pay a **Core Technology Commission of 5 %** of digital transactions (in-app sales, paid downloads, subscriptions, sales within 7 days of a link out).
- App Store rates in the EU: 26 % with Apple's in-app purchase, 20 % with another payment system, 15 % for links out; 15 / 10 / 10 % in the Small Business Program and a few partner programs.
- A single **Attachment 14** of the Developer Program License Agreement replaces the earlier Alternative Terms Addendum.
- **Fee waivers** exist for approved nonprofits, accredited schools and universities and government bodies. There is **no waiver for open-source projects** as such.

### Web Distribution: closed to a solo project
An EU legal entity is no longer needed, but the developer must meet **one** of: a D&B "low risk" rating, a stock listing, funding from a ranked venture firm, an unqualified audit from the last 3 years, a fee waiver (above), a **USD 1 M standby letter of credit**, or **2+ years in good standing plus an app with over 1 M first annual installs**. Apple's pages also only ever speak of organizations, so whether an individual account can qualify at all is **[uncertain]**.

### AltStore PAL: the route that fits
- The **marketplace** carries Apple's eligibility criteria; the **app's developer** needs only the paid account, the EU terms and notarization.
- The developer notarizes the build in App Store Connect, fetches the Alternative Distribution Package through AltStore's API, and **hosts the package and a JSON "source" on their own server** — an Atlas server could serve it. It can also be listed on explore.alt.store.
- AltStore takes 0 %; Apple's 5 % applies only to sales. Installed apps never expire. JIT: AltStore's FAQ says PAL supports it, its developer page says it does not — irrelevant to Atlas either way (below).

### AltStore PAL and AltStore Classic are different things

| | AltStore PAL | AltStore Classic |
|---|---|---|
| Where | EU, Japan, Brazil (the iPad only in the EU) | anywhere |
| What it installs | only apps Apple has notarized | any app package, signed with the user's own Apple ID |
| A computer needed | no | for the weekly re-signing (AltServer: macOS and Windows officially; on Linux a community port **[not checked]**) |
| A build lasts | no expiry | 7 days, then re-signed |
| Apps at once | no limit | 3 |

Outside the EU only Classic applies, and Classic is the free-Apple-ID sideload of section 3 with a helper for the re-signing. The paid account's 1-year builds make it unnecessary.

## 2. The DMA's technical parts, and why Atlas mostly does not need them

- **Alternative browser engines (BrowserEngineKit)** are for dedicated browser apps only. Atlas would use **WKWebView**, the system WebKit, which is the same engine family the desktop already runs and the WebKit probes (`scripts/dev/webkit-probe.mjs`) measure.
- **JIT**: the plugins are JavaScript run by WebKit, which compiles it itself; the Rust core is compiled ahead of time. Atlas needs no JIT of its own.
- **Interoperability requests (DMA Art. 6(7))**: what Apple has delivered so far is connectivity (accessory pairing, notification forwarding, peer-to-peer Wi-Fi, NFC). Nothing loosens background execution or allows starting processes, and nothing Atlas needs requires a request.
- **The Apple Pencil APIs are public on every route**: PencilKit, raw `UITouch` with pressure (`force`), `altitudeAngle` and `azimuth`, `coalescedTouches` (the full 240 Hz samples) and `predictedTouches` (to hide latency), hover on M2-and-later iPads, squeeze and barrel roll on the Pencil Pro. There is no equivalent of the Onyx system-drawn low-latency ink path (docs/design/DESIGN-boox-pen-openink.md); PencilKit's own latency is already low.

## 3. Routes outside the DMA (anywhere)

| Route | Cost | A build lasts | Fit |
|---|---|---|---|
| Free Apple ID (Xcode, or SideStore / AltStore Classic re-signing) | $0 | **7 days**, then re-signed; 3 sideloaded apps at once | a personal build; the re-signing is a chore **[limits from a secondary source]** |
| Paid account, development / ad-hoc profile for registered devices | $99/yr | **1 year** | the best personal route: installed with Xcode, Apple Configurator, or over the air from a manifest on one's own server |
| TestFlight | $99/yr | 90 days per build | a light beta review; for oneself and a few testers |
| App Store | $99/yr | no expiry | review risk, below |
| Enterprise program | — | — | an organization's internal apps only; does not apply |

**No route is like an Android APK.** iPadOS runs only code signed with a certificate Apple issues: there is no "install unknown apps" switch and no signing with one's own key. Even the free 7-day route is signed by Apple's servers (without a review); the paid account's builds for registered devices skip review; TestFlight, the App Store and the EU routes are reviewed. Jailbreaks and TrollStore (an old signing bug) are not available on current iPadOS as far as is known **[not checked per version]**, and nothing should be built on them. The only route with nothing from Apple is the web app: a server's Atlas in Safari, added to the Home Screen (Pencil pressure and tilt work there), without a local vault, offline use (beyond the browser's cache) or native pen latency.

**App Store review risk:**
- **Guideline 2.5.2** forbids downloading code that "introduces or changes features or functionality" — which is what a vault's plugins do.
- **Guideline 4.7** allows HTML5 / JavaScript "mini apps … and plug-ins" not embedded in the binary, under conditions: an index of the offered software with universal links (4.7.4), content reporting and filtering (4.7.1), age gating (4.7.5), and no native APIs exposed to them without Apple's permission (4.7.2).
- Atlas's plugins are files in the user's own vault, which is close to Obsidian's community plugins (on the App Store today), but the 4.7.4 "index" fits poorly. **[uncertain: the review's outcome]**
- Terminals limited to SSH are common on the App Store (Blink, Termius).

## 4. What the port takes technically

- **The shell.** `crates/atlas-app` is a Tauri 2 app, and Tauri 2 builds for iOS (`tauri ios init/build`): it generates the Xcode project and a WKWebView host. The alternative is a thin Swift host over a static `atlas-core` library with a C ABI, the way `crates/atlas-android` talks to the core through JNI.
- **The core's server inside the app.** As on Android (`crates/atlas-android/src/serve.rs`): the core listens on `127.0.0.1`, serves the embedded `ui/dist`, hands the WebView a one-time cookie, and is locked to the app (`docs/design/DESIGN-local-lock.md`). Loopback needs **no Local Network permission** (LAN addresses do). A WKWebView custom URL scheme would avoid TCP, but it would be a second transport; loopback keeps one.
- **The background.** iOS suspends a backgrounded app within seconds to minutes, and the server and the file watcher with it. That is fine for an editor; it means the iPad's MCP server is only up while Atlas is in front, and mail and calendars sync only when it is open (or in short `BGAppRefreshTask` / `BGProcessingTask` runs that iOS schedules when it likes).
- **What has to be stubbed (`cfg(target_os = "ios")`)**: the PTY (local terminals), every helper program a plugin starts, anything that runs `git` as a process (the in-process git library stays). **[to check: which dependencies link system libraries that iOS lacks]**
  - **Terminals become remote**: SSH, or the server's own terminal over the WebSocket the UI already uses.
  - **Plugin helpers** run on a server, or are rewritten in JavaScript or Rust.
- **The file watcher.** There is no inotify; the watcher needs an iOS backend (`NSFilePresenter`) or a polling fallback.
- **The vault.** Two choices:
  1. In Atlas's own container, visible in the Files app (`UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace`), kept in step by **the mirror** (`docs/design/DESIGN-mirror-v2.md`) as a client of a server — exactly as the phone does. **Recommended**: no file-provider fragility, and the mirror already merges offline edits.
  2. An outside folder picked with `UIDocumentPickerViewController` and kept by a security-scoped bookmark. Works for local and iCloud Drive folders, is fragile for third-party file providers, and watching there is weak. Syncthing has no iOS app; Möbius Sync (paid, Syncthing-compatible) writes into its own folder, which Atlas could open this way.
- **Pen ink.** The paper core fed from raw `UITouch` (coalesced touches for the full rate, predicted touches drawn as a tail that is thrown away), so strokes stay in Atlas's own format (`.excalidraw`, the pen engine) rather than PencilKit's `PKDrawing`; PencilKit at most for its tool picker. Pressure from `force`, tilt from altitude and azimuth. Before any native code, the web UI in Safari already gets pressure and tilt through Pointer Events.
- **Building without a Mac.** Xcode is required to build, sign and notarize, and runs only on macOS:
  - CI on **GitHub Actions macOS runners** (free minutes for public repositories), the signing certificate and provisioning profile as secrets (Tauri documents the variables); or Codemagic, or a rented Mac.
  - From Linux the `.ipa` is installed with `ideviceinstaller` (libimobiledevice) or over the air.
  - **Debugging is the real cost**: Safari's Web Inspector for a WKWebView, and Instruments, need a Mac.
- **Cost:** $99/yr for every route except the 7-day free signing, plus CI minutes or a Mac.

## 5. Recommended plan

The route depends on where the iPad lives.
- **An iPad in the EU, with an EU Apple Account: AltStore PAL.** A permanent install like an Android APK (no 7-day expiry, no 3-app limit), after Apple's notarization.
- **Anywhere else:** a personal build signed with the paid account (1-year profile, or TestFlight).

Either way the app is the same: a mirror client of a server running Atlas, with remote terminals, built on CI.

| Phase | What | Effort (rough) |
|---|---|---|
| 0 | No build: the server's web UI in Safari, added to the Home Screen. Fix what the iPad shows (touch, Pencil through Pointer Events, the on-screen keyboard). | 1–3 days |
| 1 | Tauri 2 iOS target from `atlas-app`: static core, WKWebView, loopback server, vault in the app's container, `cfg(ios)` stubs for the PTY and helpers; CI build and signing. | 1–2 weeks |
| 2 | The mirror as the iPad's sync; remote terminals; background refresh; a watcher backend. | 1–2 weeks |
| 3 | Native Pencil input into the paper core; hover; palm rejection. | 1–2 weeks |
| 4 | Distribution. In the EU: notarization and an AltStore PAL source (below). Elsewhere: TestFlight or ad-hoc; optionally App Store review (plugins under 4.7). | days, plus review risk |

About **4–7 weeks** for a usable app. Phase 0 is worth doing whatever is decided: every fix there also serves a phone's browser.

### Phase 4 in the EU: AltStore PAL, step by step
- **The iPad:** the Apple Account's region set to the EU country (Settings → the account → Media & Purchases; Apple first asks for any store credit to be spent and subscriptions ended), iPadOS 18 or later, and the iPad in the EU when Atlas is installed.
- **The developer:**
  - The $99/yr Apple Developer Program. **An individual account is enough** to distribute through a marketplace: the financial tests apply to marketplace operators and to Web Distribution only, and no EU company is needed.
  - Accept the EU terms (Attachment 14) in App Store Connect. A free app owes nothing on top.
  - Submit each build for notarization, then authorize AltStore to carry the app.
  - Fetch the Alternative Distribution Package through AltStore's API, and host it with a small `source.json` on one's own server.
- **The user:** install AltStore PAL (free for users), add the source's address, install Atlas from it.
- **Every update** repeats the cycle, and all of it can run in CI: build on a macOS runner, upload to App Store Connect, wait for notarization (typically hours to a day **[not guaranteed]**), fetch the package, upload it, bump `source.json`.

**The risk is the plugins.** Notarization checks a subset of the guidelines that **includes 2.5.2** (no downloaded code that changes features) and **excludes 4.7** (the rule that allows JavaScript plug-ins); the subset comes from a third-party copy of Apple's markers, and Apple's guidelines page can be filtered to "notarization only" to confirm it. JavaScript run in the WebView is the long-accepted case: Obsidian, Logseq and Scriptable ship user plugins or scripts. To keep the risk low:
- no plugin download built into the app (plugins are files the user put in their vault);
- plugins JavaScript-only, in the WebView;
- no native iPad features exposed to them beyond the core's existing HTTP interface.

The risk is judged low to moderate **[uncertain]**. If notarization refuses, the paid account's 1-year build for one's own registered iPad needs no review.

### AltStore, cost and law
- AltStore Classic is free and open source. AltStore PAL was €1.50/yr at launch (to pay Apple's per-install fee) and has been free for users since August 2024; that fee itself ended in October 2026.
- Sideloading is a legal obligation only where a law says so: the DMA in the EU (Art. 6(4), with Apple allowed "strictly necessary and proportionate" measures — the notarization), and similar laws in Japan and Brazil for the iPhone only. No such law was found in the US or Canada **[2026 not verified in detail]**.
- Faking an EU region or location is not reliable (the check runs on the device) and breaks Apple's terms.
- **Still moving:** the Commission's investigation of Apple's terms for apps outside the App Store (Art. 6(4): fees, who may run a store, notarization) is open, and app-developer groups have asked it to reject the August 2026 terms; the EU General Court confirmed Apple's gatekeeper status in July 2026. A new decision would loosen the conditions, not close the route, since the DMA itself requires it.

## Sources
- Apple, changes for apps in the EU (2026-08): https://www.apple.com/newsroom/2026/08/apple-announces-changes-for-apps-in-the-european-union/
- Apple, DMA and apps in the EU: https://developer.apple.com/support/dma-and-apps-in-the-eu/
- Apple, Web Distribution in the EU: https://developer.apple.com/support/web-distribution-eu/
- Apple, alternative distribution eligibility on the device: https://support.apple.com/en-us/118110
- Apple, the 2025 plan (superseded): https://developer.apple.com/news/?id=awedznci
- Apple, alternative browser engines: https://developer.apple.com/support/alternative-browser-engines/
- Apple, interoperability requests: https://developer.apple.com/support/ios-interoperability/
- Apple, App Review Guidelines (filter: notarization only): https://developer.apple.com/app-store/review/guidelines/
- The notarization subset of the guidelines (third-party copy): https://www.appstorereviewguidelineshistory.com/articles/2024-01-29-notarization-in-european-union/
- AltStore PAL for developers: https://developer.altstore.io/
- Coverage: https://thenextweb.com/news/apple-eu-app-store-fees-dma-core-technology-commission · https://appleinsider.com/articles/26/08/18/apples-eu-app-store-changes-are-big-and-a-preview-of-whats-coming-in-the-us · https://www.macobserver.com/news/eu-app-store-terms-october-1-rate-card/ · https://dataconomy.com/2026/03/12/altstore-pal-becomes-first-federated-app-marketplace/ · https://www.macrumors.com/2025/12/22/ios-26-3-dma-airpods-pairing/ · https://techcrunch.com/2025/03/19/eu-sends-apple-first-dma-interoperability-instructions-for-apps-and-connected-devices/
- Free-account sideload limits (secondary): https://ipswdl.com/blog/post/how-to-install-sideload-ios-apps-wirelessly-with-sidestore/
- Signing Tauri apps on CI: https://tauri.app/distribute/sign/macos · https://docs.crabnebula.dev/cloud/ci/tauri-v2-workflow/
