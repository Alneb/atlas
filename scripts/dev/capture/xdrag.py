#!/usr/bin/env python3
"""A real mouse drag through XTEST: xdrag.py x0 y0 x1 y1 (screen pixels). Press at the start, move there in small
steps, release. KWin turns XTEST into real input (libei), so it drags in Wayland windows too, not only X11 ones:
what Playwright's synthetic drags cannot show (WebKitGTK's own drag-and-drop). HOVER=seconds rests on the start
first, as a hand does. Only ever look.sh's nested display: it refuses any screen size look.sh did not make."""
import os, sys, time
from Xlib import X, display
from Xlib.ext import xtest

d = display.Display()
g = d.screen().root.get_geometry()
if f"{g.width}x{g.height}" not in os.environ.get("ATLAS_LOOK_SCREEN", "1280x800").split():
    sys.exit(f"refusing: {d.get_display_name()} is {g.width}x{g.height}, not look.sh's nested screen")
x0, y0, x1, y1 = map(int, sys.argv[1:5])

def move(x, y):
    xtest.fake_input(d, X.MotionNotify, x=x, y=y)
    d.sync()

move(x0, y0)
time.sleep(float(os.environ.get("HOVER", "0.3")))
xtest.fake_input(d, X.ButtonPress, 1)
d.sync()
time.sleep(0.15)
steps = 30
for i in range(1, steps + 1):  # past GTK's drag threshold at once, then on to the target
    move(x0 + (x1 - x0) * i // steps, y0 + (y1 - y0) * i // steps)
    time.sleep(0.03)
time.sleep(0.4)  # the drop target sees a few dragovers first
xtest.fake_input(d, X.ButtonRelease, 1)
d.sync()
time.sleep(0.5)
