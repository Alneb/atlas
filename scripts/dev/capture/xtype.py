#!/usr/bin/env python3
"""Keys into the focused window of an X display through XTEST: xtype.py 'text' key:Tab key:alt+v …
Only ever the nested display look.sh made: it refuses any screen that is not 1280×800, so a slip of
DISPLAY can never type into the user's own windows."""
import os, sys, time
from Xlib import X, XK, display
from Xlib.ext import xtest

d = display.Display()
g = d.screen().root.get_geometry()
if f"{g.width}x{g.height}" not in os.environ.get("ATLAS_LOOK_SCREEN", "1280x800").split():
    sys.exit(f"refusing: {d.get_display_name()} is {g.width}x{g.height}, not look.sh's nested screen")

def press(keysym, shift=False):
    code = d.keysym_to_keycode(keysym)
    if shift:
        xtest.fake_input(d, X.KeyPress, d.keysym_to_keycode(XK.XK_Shift_L))
    xtest.fake_input(d, X.KeyPress, code)
    xtest.fake_input(d, X.KeyRelease, code)
    if shift:
        xtest.fake_input(d, X.KeyRelease, d.keysym_to_keycode(XK.XK_Shift_L))
    d.sync()
    time.sleep(0.03)

NAMES = {" ": "space", "[": "bracketleft", "]": "bracketright", "@": "at", "#": "numbersign"}
MODS = {"alt": "Alt_L", "shift": "Shift_L", "ctrl": "Control_L"}
for arg in sys.argv[1:]:
    if arg.startswith("key:"):
        *mods, key = arg[4:].split("+")
        held = [d.keysym_to_keycode(XK.string_to_keysym(MODS[m])) for m in mods]
        for c in held:
            xtest.fake_input(d, X.KeyPress, c)
        d.sync()
        time.sleep(0.08)  # a modifier is held a moment before the key, as by hand
        press(XK.string_to_keysym(key))
        for c in reversed(held):
            xtest.fake_input(d, X.KeyRelease, c)
        d.sync()
        continue
    for ch in arg:
        ks = XK.string_to_keysym(NAMES.get(ch, ch))
        # shifted when the character is on the key's second level (US layout: look.sh sets it)
        press(ks, d.keycode_to_keysym(d.keysym_to_keycode(ks), 0) != ks)
