# The Boox pen, read from boox_5c_re's reimplementation (openink)

## Why this file

The user, 2026-10-20: *"what about the stroke falkiness in the native app? i am telling you you need to investigate that
deepr"* · *"the excalidraw could not see the difference between thin and think pressure on the boox"* · *"you should read
the whole reimplementation and understand it"* · *"and use that in this app"*. The reimplementation is
`~/Projects/boox_5c_re` (another repo, its own sessions; read-only from here): an open re-implementation of the Boox Note
Air 5C's pen stack (`impl/crates/openink-*`, Java `org.openink.*`, `onyx-compat`). This file is what it says that
matters to Atlas, what Atlas changed from it, and what comes next.

## What the reimplementation established

- **Instant ink is surfaceflinger's**: it reads the pen from evdev itself and draws the quick line into the handwrite
  buffer, past Android's composition; the app only switches it on (`ViewUpdateHelper`: pen state START, region limit,
  region mode, width, RESUME, raw drawing on). While handwriting is on, **the app's own frames are held off the panel**
  until the scheme changes (`docs/EBC-ABI.md`).
- **`enablePost(1)` ends handwriting mode** (surfaceflinger `handleEnablePost` → `EpdcManager::stopHandwriting`, read
  in the decompile). Onyx's own SDK posts **once, 500 ms after the last pen-up, cancelled by the next pen-down**
  (`onyx-compat RawInputReader`: `removeCallbacks` on begin, `postDelayed(…, 500)` on end); `docs/EPDC-ENGINE.md`: "a
  written word gets one repaint, not one per stroke". A post landing while the next stroke is written hides that stroke
  until the following post.
- **The region gate** (`openink-stroke/src/sf.rs` `RegionGate::admits`): surfaceflinger draws a point only when the
  nib's square (side = the stroke width) lies wholly inside a limit rect and touches no exclude rect; a refused point
  ends the quick stroke. Ink within W/2 of the view's edge or a toolbar's exclude rect is never drawn quickly.
- **Redrawing everything per stroke stalls the pen** (their): draw only the new ink.
- **A lost pen-up happens** (`SYN_DROPPED`): their reader ends the stroke (`ForcedUp`), re-reads the device state and
  starts a new one if the pen is still down.
- **Pressure**: evdev reports 0–4095, never 0 on the glass; surfaceflinger and Boox Notes' engine (libneo) use it
  linearly (raw/4095). Android's `MotionEvent.getPressure()` is **curved** — surfaceflinger's pen model 0x153 curve,
  `n < .15 ? 4n : min(1, (n − .135)^.2 + .17)` (`SfPressure::map`): the user's strokes measured through Atlas's web path
  (209 strokes, 41 025 samples, 2026-10-19) had a median of .92 and a quarter at 1.0; undone, the median is **.37**,
  against the reimplementation's own trace subset **.39** — two measurements agreeing. Above ≈ .53 linear the curve is
  1.0: that part cannot be recovered from MotionEvents, only from evdev.
- **Boox Notes' widths** (`docs/STROKE.md`): fountain `W·p^(2s)·(1 − 0.6·vs·atan(0.06·v))` (s .3, vs .5), ballpoint
  constant W/2, marker steps .8/.9/1, brush `clamp(2W·√p, …)`; smoothing a FIR over ⌊50·smoothLevel⌋ samples, then
  Catmull-Rom with one point of look-ahead (Atlas's memory said "EMA, no look-ahead": corrected).
- **What runs on the stock, locked firmware 4.2.1**: the evdev reader in an ordinary app (no permission), the stroke
  engines (checked against the device's libneo: fountain within 0.7–1.8 %), the InkSession state machine after the
  hidden-API whitelist (`am broadcast -a com.onyx.action.disable_restriction --es package org.atlas.boox`: done for
  Atlas on 2026-10-17). Not yet tried on the device: their EpdEngine, `byPass`, onyx-compat. Stable packages:
  `org.openink.stroke`, `org.openink.pen`, `org.openink.shape`; `org.openink.epd` / `backend` still changing (they asked
  Atlas to wait for their note before replacing OnyxInk.java).

## What Atlas changed (2026-10-20)

1. **Posting paced as Onyx's SDK** (`OnyxInk.java` `down` / `up`): `up()` schedules the post 500 ms later (`POST_MS`),
   `down()` cancels it. The native notepad tells the ink its pen-downs (`Host.QuickInk.down`, `Pad` on ACTION_DOWN); the
   web path's pen catcher does too (`PenCatcher.Stroke.began`), and a repaint asked by the page after another device's
   change (`inkRepaint`) waits for the same pause. Before: the native notepad posted at every pen-up (and, for a few
   hours on 2026-10-20, right after the next frame — worse). The web path's old hook never saw the pen (the catcher
   takes it), so it never posted mid-word: the likeliest reason it "felt much better".
2. **Only the new stroke drawn** (`Pad.drawOne`, `NotepadView.wrote`): no whole-page repaint and no toolbar redraw per
   pen-up.
3. **Pressure linear** (`PenInput.linear`: the 0x153 curve undone) where the pen is read — the native notepad's samples
   (`Pad.sample`: what openink's engine expects) and the web path's (`PenCatcher`); the web drawing keeps it as it comes
   (`penPressure`) with the fountain's thinning .6 (`draw-ink.ts`, Stroke.java `outline` the same); the quick line's
   width at the usual .39.

4. **The pressure from evdev** (the first part of "Next" 1, built the same day): `crates/atlas-android/src/pen_reader.rs`
   (boox_5c_re's JNI reader alone, under `org.atlas.capture.PenReader`; `openink-pen` vendored, `sync-openink.sh` lists
   it), `PenPressure` (started once on an e-ink device; every DOWN/MOVE/UP sample kept by its arrival time; a
   MotionEvent's pressure is the device's sample that arrived last before its time, within 40 ms — else its own,
   uncurved). Used by the native notepad (`Pad.sample`) and the web path's catcher. Positions and timing stay the
   MotionEvents'. The reader says itself in logcat (`adb logcat -s AtlasPen`: "the stylus from evdev: /dev/input/…").

## Next (in order)

1. **The rest of the pen from evdev** (their step 4): vendor `openink-pen` (decoder + device) and a ~60-line JNI reader under
   Atlas's names (not the whole `openink-jni`: it pulls hwr, epdc, shape), `PenReader` / `PenAxes` / `ScreenMap` /
   `MapCalibrator` (MIT). Gives linear pressure over its whole range (no saturation), 482 Hz, pen strokes independent of
   touch pointers (a pen landing while a finger is pointer 0 is lost today), ForcedUp on a lost pen-up. MotionEvents stay
   for fingers, the palm and calibration pairs.
2. **The region gate in Java** (`RegionGate.admits`, ~20 lines): a stroke with refused samples posted at once.
3. **OnyxFrameworkBackend + InkSession** in place of OnyxInk's reflection, once boox_5c_re says the API is settled.
4. Measure on the device: `getevent -lt` beside a logcat of `getPressure()` for the same strokes, and the times of each
   post against each pen-down.
