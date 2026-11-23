// In the dark theme a picture drawn on white — a plot, a diagram, a scanned page, a formula as an image — glares out
// of the note. Such a picture is darkened as a PDF's dark pages are (inverted, hues kept); a photo is left alone. Told
// apart by the picture itself, once loaded: a light (or transparent) border and few colours inside. `[editor]
// dark_pictures` switches it off. The verdict is a class (`dark-picture`), drawn only under the dark theme, so a
// theme change needs no second look.
import { settings } from "./settings.svelte";

const PICTURES = "img.cm-embed-image, .markdown img, .md-render img";
const SIDE = 40; // the picture is looked at this small
const verdicts = new Map<string, boolean>();

/** Whether a picture (its pixels, `SIDE`×`SIDE` RGBA) is a drawing on a light page rather than a photo. */
export function drawnOnLight(px: Uint8ClampedArray, w: number, h: number): boolean {
  const at = (x: number, y: number) => (y * w + x) * 4;
  const lum = (i: number) => (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
  const sat = (i: number) => { const mx = Math.max(px[i], px[i + 1], px[i + 2]), mn = Math.min(px[i], px[i + 1], px[i + 2]); return mx ? (mx - mn) / mx : 0; };
  // the border: light, or see-through
  let light = 0, clear = 0, n = 0;
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const i = at(x, y); n++; if (px[i + 3] < 40) clear++; else if (lum(i) > 0.86) light++; }
  for (let y = 1; y < h - 1; y++) for (const x of [0, w - 1]) { const i = at(x, y); n++; if (px[i + 3] < 40) clear++; else if (lum(i) > 0.86) light++; }
  // inside: how much is colourful (a photo is, nearly everywhere), and, for a see-through one, how dark its ink is
  let colourful = 0, opaque = 0, ink = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 40) continue;
    opaque++;
    if (sat(i) > 0.35 && lum(i) < 0.9) colourful++;
    ink += lum(i);
  }
  if (!opaque) return false;
  const fewColours = colourful / opaque < 0.25;
  if (light / n > 0.8) return fewColours; // on white
  if (clear / n > 0.8) return fewColours && ink / opaque < 0.35; // dark lines on nothing: invisible on a dark page
  return false;
}

function judge(img: HTMLImageElement): void {
  const src = img.currentSrc || img.src;
  if (!src || !img.naturalWidth) return;
  const known = verdicts.get(src);
  if (known !== undefined) { img.classList.toggle("dark-picture", known); return; }
  let verdict = false;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = SIDE;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return;
    g.drawImage(img, 0, 0, SIDE, SIDE);
    verdict = drawnOnLight(g.getImageData(0, 0, SIDE, SIDE).data, SIDE, SIDE);
  } catch { return; } // a picture from another site the page may not read: left as it is
  verdicts.set(src, verdict);
  img.classList.toggle("dark-picture", verdict);
}

let installed = false;
/** Once, for every note and view: each picture judged as it loads. */
export function installDarkPictures(): void {
  if (installed) return;
  installed = true;
  document.addEventListener("load", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.matches(PICTURES)) return;
    if (settings.config?.editor.dark_pictures === false) { img.classList.remove("dark-picture"); return; }
    judge(img);
  }, true);
}
