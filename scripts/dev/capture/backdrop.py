#!/usr/bin/env python3
"""A plain backdrop for look.sh's screenshots: a desktop-type window filling the nested screen with one colour
(argv[1], default #59606c), so the floating box's transparent shadow and corners show against something, as
on a real desktop. Kept below every window by KWin (_NET_WM_WINDOW_TYPE_DESKTOP); runs until killed.
Only on look.sh's nested display: it refuses a screen that is not the nested one (look.sh passes its size)."""
import os, sys
from Xlib import X, display

d = display.Display()
s = d.screen()
g = s.root.get_geometry()
if f"{g.width}x{g.height}" not in os.environ.get("ATLAS_LOOK_SCREEN", "1280x800").split():
    sys.exit(f"refusing: {d.get_display_name()} is {g.width}x{g.height}, not look.sh's nested screen")
rgb = int((sys.argv[1] if len(sys.argv) > 1 else "#59606c").lstrip("#"), 16)
pixel = s.default_colormap.alloc_color(((rgb >> 16) & 0xFF) * 257, ((rgb >> 8) & 0xFF) * 257, (rgb & 0xFF) * 257).pixel
w = s.root.create_window(0, 0, g.width, g.height, 0, s.root_depth, X.InputOutput, X.CopyFromParent, background_pixel=pixel)
w.change_property(d.intern_atom("_NET_WM_WINDOW_TYPE"), d.intern_atom("ATOM"), 32, [d.intern_atom("_NET_WM_WINDOW_TYPE_DESKTOP")])
w.set_wm_name("look.sh backdrop")
w.map()
d.flush()
while True:
    d.next_event()
