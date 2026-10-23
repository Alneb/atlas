# The Android apps against Android's design guidance

The Android apps' design improved from Android's own UI / UX guidance, with the focus on the Android apps (2026-10-17). This file is what was read,
what the apps already did, what was changed and what is left. The apps keep **the desktop's look**, so Material 3 is used for its
measures and behaviour, not its colours or shapes.

## What was read (2026-10-17)

- **Android core app quality** (developer.android.com/docs/quality-guidelines/core-app-quality): touch targets ≥ 48 dp
  (`Touch_Target_Size`); text contrast 4.5:1, 3:1 for large text and graphics (`Visual_Contrast`); a
  `contentDescription` on every element that is not a TextView (`Content_Description`); standard back and the back
  gesture, no custom on-screen back buttons (`Back_Button_Nav`); state kept across Recents, sleep, lock and short
  relaunches (`State_Preservation`); light and dark (`Theme_Support`); lines of 45–75 characters (`Line_Length`);
  notifications in channels, grouped, never ads (`Notification_Quality`); the system share sheet.
- **Edge-to-edge with Views** (developer.android.com/develop/ui/views/layout/edge-to-edge): enforced from targetSdk 35;
  pad for `systemBars() | displayCutout()`, the keyboard (`ime()`); light / dark bar icons
  (`APPEARANCE_LIGHT_STATUS_BARS`); no translucent gesture bar.
- **Material 3 measures** (m3.material.io renders with scripts and could not be read here; Android's layout basics page
  and the known M3 specs): a 4 / 8 dp grid, 16 dp side margins on a phone (24 on medium widths), list rows 56 / 72 /
  88 dp, top app bar 64 dp, navigation bar with a 64 × 32 dp pill under the active icon, FAB 56 dp with 16 dp corners,
  buttons 40 dp tall inside a 48 dp target; type scale Title L 22 sp, Title M 16, Body L 16, Body M 14, Label L 14.

## Where the apps stood

Already right: edge-to-edge with insets on every screen (`Shell`, `AtlasActivity.frame`, the capture box), the IME
pushing the page up and hiding the bottom bar, light / dark bar icons, an M3 navigation bar (pill + label), a 56 dp FAB
with 16 dp corners, list rows of 48 dp (`Look.row`), both themes from the phone's night mode, e-ink without ripples
or shadows, the system Back closing sheets first, state kept per vault (open files come back as tabs).

## Changed

- **Icon-only buttons say what they do**: `AtlasActivity.iconButton(icon, label, tap)` takes the label as a required
  argument (content description + long-press tooltip) — back, open files, More options, a file's close. The capture
  box's picture badge says "Put in / Leave out <what>", the drawing's close says "Cancel".
- **48 dp targets**: icon buttons 44 → 48 dp; the capture box's picture badge keeps its 24 dp circle inside a 48 dp
  target; its list rows (suggestions, vaults, "Send to an Atlas server…") 40 → 48 dp; the drawing bar's Undo / Clear
  40 → 48; the vault pill 32 → 40 and Save 36 → 40 (M3 button height; the row around them is taller).
- **Contrast**: `Look.faint` (row details, section names — small text) was 3.5–4.3:1; now 0xff8b919c in dark
  (4.5–5.6:1) and 0xff676c77 in light (4.5–5.3:1); the light accent 0xff4762d9 (4.5:1 on the grey app background).
  Measured with WCAG's formula against `bg`, `app` and `pop`. The desktop's tokens are unchanged (a separate decision).
- **The pen region follows what is shown**: Onyx's instant ink only while the page that asked for it is
  visible and nothing covers it (`AtlasActivity.applyInk`, window focus) — before, it drew over native Settings.

- **Rows never cut their words** (screen review): `Look.row` returns a `Row` — the label and its detail
  side by side when both fit whole, else the label wrapping and the detail under it (Material's two-line list item).
  Before, both were single lines with "…", so the capture app's Settings read "Allow access to your…" at 100 % and
  "An Atlas s…" / "…and a token" at 200 %. `Row.label` / `Row.detail` are fields: callers no longer reach the
  texts by child index (`getChildAt(1)`), which shifted when a row had no icon (the manga chapter list had to guess).

- **Settings as Android's own**:
  `SettingsPages` — a short list (Vaults, Plugins, Capture, "Editor, look and more"), each a page in the app's
  history. Plugins: a row each with its Switch, a tap opens its page; built-in plugins' settings shown from the
  manifest the app carries until the vault has a folder for them. The vault's own settings generated from the config
  schema (`ConfigPages`, as the desktop's are), the same for a vault here and on a server. Vaults like Wi-Fi
  networks: tap to use, ⋯ / long press for the details (name, sign in again, token, forget, remove). Capture: a
  Switch per thing Android grants (the screen, the last screenshot, what is playing), the row opening Android's screen.
- **Excalidraw's pen read natively** (`PenCatcher`, 2026-10-18): over the drawing's ink region while Onyx's instant
  ink is on — every sample and its pressure as Notepad reads them, handed to the page as a stroke; fingers and the
  eraser end pass through, a palm right after the pen is swallowed.
- **Never Home by accident**: a vault reopened by itself (a renderer that died, the activity made again) comes back
  at the file that was in front (`open(vault, resume)`).

## Kept on purpose

- The top bar's ← is Material's "Up" (the navigation icon of a top app bar), not a second Back: it walks the app's
  own history of places, the system Back does the same and also closes sheets first.
- Section names in capitals (`Look.heading`) — the desktop's; Material 3 would use sentence case. Not changed without
  the user.

## Next

- Look at every screen in the emulator in both themes and at 200 % font size (`run-emulator.sh shot`), fix what is cut
  or crowded; TalkBack order on the capture box.
- ~~Line length~~: `Look.readable(context, view)` caps a native column at `Look.READABLE_DP` (600 dp,
  ~70 characters of 15 sp text) and centres it; Settings uses it. The note view keeps the page's own `--measure`.
  Dialogs are narrow already.
- ~~Notifications~~ (checked 2026-10-18): the apps post one kind only — "Sent N kept captures" (OutboxJob), in its own channel "Captures sent later" at low importance, after asking for POST_NOTIFICATIONS on Android 13+ only when a capture is kept for later. New mail and plugin notices are not posted on Android; when one is added it gets its own channel the same way.
- The Boox pen screen on openink's pens: `crates/atlas-android/src/ink.rs`.
