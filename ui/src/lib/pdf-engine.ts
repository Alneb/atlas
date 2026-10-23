// What reads a PDF, seen from the reader, covers and thumbnails: PDFium (lib/engine-pdfium.ts, the default) or pdf.js
// (lib/engine-pdfjs.ts, the backup), chosen by Settings → PDF → engine. A document is read by one engine only, never
// both: the reader opens it with one and every page, text, link and find of that opening comes from it.
// Places cross in PDF points, page space (y up), whichever engine answers.
import { settings } from "./settings.svelte";

/** `px` is the page's width, or its longer side. */
export type Fit = "width" | "long";
/** Where a page lands in a bitmap: the bitmap is `bw`×`bh` device px, the whole page `fw`×`fh` at (`x`, `y`), turned
 *  `rotate` quarter turns clockwise past its own /Rotate (a zoomed tile is an offset into a larger page). */
export interface Area { bw: number; bh: number; x: number; y: number; fw: number; fh: number; rotate: number }
/** A box in PDF points, page space: x0, y0, x1, y1 (y0 < y1). */
export type Box = [number, number, number, number];
export interface OutlineItem { title: string; depth: number; page: number | null; y: number | null }
/** The document: each page's shown size in points (its /Rotate applied), two numbers a page, and its outline. */
export interface DocInfo { pages: number; sizes: number[]; outline: OutlineItem[] }
/** A link's and an outline item's `page` are 0-based, as the engines count. */
export interface PageLink { box: Box; url?: string; page?: number; y?: number | null }
/** A page's text and what lies on it. `codes`: a character's Unicode; `boxes`: its box, four numbers a character;
 *  `generated`: 1 for a space or line break the engine added between words and lines. `rotate`: /Rotate, quarter
 *  turns. `annots`: the PDF's own annotations by pdf.js's id (object number + "R"), which `#annotation=` links name. */
export interface PageLayers {
  view: Box; rotate: number; codes: Uint32Array; boxes: Float32Array; generated: Uint8Array;
  links: PageLink[]; annots: { id: string; box: Box }[];
}
/** A match: its page (1-based), its first character and length in the page's `codes`, its boxes. */
export interface Match { page: number; start: number; count: number; boxes: Box[] }

export type EngineName = "pdfium" | "pdfjs";

/** One engine. Pages are 1-based. */
export interface PdfEngine {
  readonly name: EngineName;
  info(path: string): Promise<DocInfo>;
  /** Page `page` placed by `area` (the reader's canvas, or a zoomed tile of it). */
  area(path: string, page: number, area: Area, signal?: AbortSignal): Promise<ImageBitmap>;
  /** Page `page`, `px` device pixels wide (or on its longer side), on white. */
  page(path: string, page: number, px: number, fit: Fit): Promise<ImageBitmap>;
  layers(path: string, page: number, signal?: AbortSignal): Promise<PageLayers>;
  /** Matches from page `from` on, a few pages' worth; `next`: where to go on (null: the end). */
  find(path: string, query: string, from: number, caseSensitive: boolean, signal?: AbortSignal): Promise<{ matches: Match[]; next: number | null }>;
  /** Forget `path` (it changed on disk): the next request reads it again. */
  drop(path: string): void;
}

/** The engine Settings chose. */
export const chosenEngine = (): EngineName => (settings.config?.pdf?.engine === "pdfjs" ? "pdfjs" : "pdfium");
export const otherEngine = (e: EngineName): EngineName => (e === "pdfium" ? "pdfjs" : "pdfium");

/** The engine `name`, loaded when first asked for (pdf.js is a few MB nobody loads unless it is chosen). */
export async function engine(name: EngineName = chosenEngine()): Promise<PdfEngine> {
  return name === "pdfjs" ? (await import("./engine-pdfjs")).pdfjsEngine : (await import("./engine-pdfium")).pdfiumEngine;
}

/** Every engine loaded so far forgets `path`. */
export function dropEverywhere(path: string): void {
  for (const e of loaded) e.drop(path);
}
const loaded = new Set<PdfEngine>();
/** Called by each engine module as it loads. */
export function registerLoaded(e: PdfEngine): void { loaded.add(e); }
