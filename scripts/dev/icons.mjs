#!/usr/bin/env node
// Every icon file from the three masters in packaging/icon/ (DEVELOPING.md, "The icon"):
//   atlas.svg       → the desktop app (Tauri), KDE (install.sh), the Android launcher, the capture window, apple-touch
//   atlas-glyph.svg → Android's adaptive foreground and themed (monochrome) layer
//   favicon.svg     → the browser tab (ui/public)
// Needs rsvg-convert and ImageMagick (`magick`). Run after changing a master; commit the outputs.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const src = (f) => join(root, "packaging/icon", f);
const tmp = mkdtempSync(join(tmpdir(), "atlas-icons-"));
const log = (m) => console.log(`[icons] ${m}`);

/** One square PNG of `svg` at `size` px. */
function png(svg, size, out) {
  execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), "-o", out, svg]);
  return out;
}

/** A Windows .ico holding each size (Tauri's bundle list and the browser's /favicon.ico). */
function ico(svg, sizes, out) {
  execFileSync("magick", [...sizes.map((s) => png(svg, s, join(tmp, `ico-${s}.png`))), out]);
}

/** A macOS .icns: a header and PNG entries (ic07 128, ic08 256, ic09 512) — no Linux tool writes one. */
function icns(svg, out) {
  const entries = [["ic07", 128], ["ic08", 256], ["ic09", 512]].map(([type, size]) => {
    const data = readFileSync(png(svg, size, join(tmp, `icns-${size}.png`)));
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(8 + entries.reduce((n, e) => n + e.length, 0), 4);
  writeFileSync(out, Buffer.concat([head, ...entries]));
}

/** The glyph with room around it: a launcher may mask an adaptive layer down to a 66 dp circle of its 108 dp. */
function padded(svg) {
  const out = join(tmp, "glyph-padded.svg");
  // the glyph spans about x 75–449, y 75–435 of 512; in a 780-unit square its corners clear the safe zone, a circle
  writeFileSync(out, readFileSync(svg, "utf8").replace('viewBox="0 0 512 512"', 'viewBox="-128 -135 780 780"'));
  return out;
}

try {
  log("desktop app (Tauri bundle and window): crates/atlas-app/icons");
  const app = (f) => join(root, "crates/atlas-app/icons", f);
  for (const [f, s] of [["32x32.png", 32], ["64x64.png", 64], ["128x128.png", 128], ["128x128@2x.png", 256], ["icon.png", 512]]) png(src("atlas.svg"), s, app(f));
  ico(src("atlas.svg"), [16, 32, 48, 256], app("icon.ico"));
  icns(src("atlas.svg"), app("icon.icns"));

  log("Android launcher: legacy icon + adaptive foreground per density");
  const fg = padded(src("atlas-glyph.svg"));
  for (const [d, legacy, layer] of [["mdpi", 48, 108], ["hdpi", 72, 162], ["xhdpi", 96, 216], ["xxhdpi", 144, 324], ["xxxhdpi", 192, 432]]) {
    const dir = join(root, `crates/atlas-android/android/res/mipmap-${d}`);
    png(src("atlas.svg"), legacy, join(dir, "ic_launcher.png"));
    png(fg, layer, join(dir, "ic_launcher_fg.png"));
  }

  log("browser: ui/public (favicon.svg, favicon.ico, apple-touch-icon.png)");
  const pub = (f) => join(root, "ui/public", f);
  copyFileSync(src("favicon.svg"), pub("favicon.svg"));
  ico(src("favicon.svg"), [16, 32, 48], pub("favicon.ico"));
  png(src("atlas.svg"), 180, pub("apple-touch-icon.png"));
  log("done");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
