// The explorer's Thumbnails view: each picture is asked of the file's source (FileSource.thumb) only once its tile
// is near the screen, three at a time (a folder of 500 PDFs must not open 500 at once), and kept for the run under the
// file's date, so a changed file is drawn again. docs/refactor/REFACTOR-explorer.md, "Thumbnails".
import type { Entry, FileSource } from "./file-sources.svelte";
import { thumbUrl } from "./raw";

export const THUMB_W = 240;
const kept = new Map<string, Promise<string | null>>();
const waiting: (() => void)[] = [];
let running = 0;

async function inTurn<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 3) await new Promise<void>((go) => waiting.push(go));
  running++;
  try { return await fn(); } finally { running--; waiting.shift()?.(); }
}

/** A source's picture of one file outside the explorer (a library's cover: `atlas.files.thumb`). */
export const sourcePicture = (src: FileSource, place: string, path: string): Promise<string | null> => picture(src, place, path, {} as Entry, () => true);

function picture(src: FileSource, place: string, path: string, e: Entry, wanted: () => boolean): Promise<string | null> {
  const key = [src.id, place, path, e.modified ?? "", e.size ?? ""].join("\n");
  let p = kept.get(key);
  if (!p) {
    p = inTurn(async () => {
      if (!wanted()) throw new Error("scrolled past"); // its turn came after the tile left: not kept, asked again later
      const t = await src.thumb!(place, path, THUMB_W);
      return t === null ? null : typeof t === "string" ? thumbUrl(t, THUMB_W) : URL.createObjectURL(t);
    });
    p.catch(() => kept.delete(key));
    kept.set(key, p);
  }
  return p.catch(() => null);
}

/** `use:thumb={…}` on an <img>: filled when its tile comes near the screen; `.has-thumb` on the tile once drawn. */
export function thumb(img: HTMLImageElement, a: { src: FileSource; place: string; path: string; entry: Entry }) {
  let alive = true;
  const tile = img.closest(".x-row");
  img.onload = () => tile?.classList.add("has-thumb");
  const io = new IntersectionObserver((seen) => {
    if (!seen.some((x) => x.isIntersecting)) return;
    io.disconnect();
    void picture(a.src, a.place, a.path, a.entry, () => alive).then((url) => { if (url && alive) img.src = url; });
  }, { rootMargin: "300px" });
  io.observe(img);
  return { destroy() { alive = false; io.disconnect(); } };
}
