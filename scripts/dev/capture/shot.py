#!/usr/bin/env python3
"""The nested KWin's whole screen as a PNG (argv[1]), through its org.kde.KWin.ScreenShot2 D-Bus API.
look.sh runs it inside its own headless KWin (KWIN_SCREENSHOT_NO_PERMISSION_CHECKS set there)."""
import dbus, os, struct, sys, threading, zlib

iface = dbus.Interface(dbus.SessionBus().get_object("org.kde.KWin", "/org/kde/KWin/ScreenShot2"), "org.kde.KWin.ScreenShot2")
r, w = os.pipe()
data = bytearray()
def read():
    while chunk := os.read(r, 1 << 20):
        data.extend(chunk)
reader = threading.Thread(target=read)
reader.start()
res = iface.CaptureWorkspace({"native-resolution": True}, dbus.types.UnixFd(w))
os.close(w)
reader.join()
W, H, stride = int(res["width"]), int(res["height"]), int(res["stride"])
# QImage ARGB32 is B, G, R, A in memory: written out as RGB rows for PNG
rows = b"".join(b"\0" + bytes(c for x in range(W) for c in data[y * stride + 4 * x: y * stride + 4 * x + 3][::-1]) for y in range(H))
chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
with open(sys.argv[1], "wb") as f:
    f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 6)) + chunk(b"IEND", b""))
print(f"{W}x{H} -> {sys.argv[1]}")
