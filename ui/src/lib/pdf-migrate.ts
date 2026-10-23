// "PDF: move older marks into their notes": every `x.pdf.excalidraw` (the store before the note's pdf-marks block)
// read as marks (lib/pdf-ink-to-marks.ts) with its pages' boxes from the reader's engine, listed first, then — after a
// yes — written into each PDF's note through the core (POST /api/pdf-marks), the drawing to the vault's trash. A drawing
// with something that is no mark (a picture, an embed) stays where it is, its marks copied. Running it again adds
// nothing twice: a mark already in the note is left alone.
import { api } from "./api";
import { confirmDialog } from "./confirm";
import { engine } from "./pdf-engine";
import { convert, pagesOf, type Converted, type Space } from "./pdf-ink-to-marks";
import { toast } from "./state.svelte";
import type { El } from "./pdf-ink-scene";

interface Plan { drawing: string; pdf: string; got: Converted }

async function plan(drawing: string): Promise<Plan | null> {
  const pdf = drawing.replace(/\.excalidraw$/i, "");
  const scene = JSON.parse((await api.file(drawing)).text) as { elements?: El[] };
  const els = scene.elements ?? [];
  const eng = await engine(), spaces = new Map<number, Space>();
  for (const n of pagesOf(els)) {
    const l = await eng.layers(pdf, n).catch(() => null);
    if (l) spaces.set(n, { view: l.view, rotate: l.rotate });
  }
  return { drawing, pdf, got: convert(els, spaces) };
}

export async function migratePdfMarks(): Promise<void> {
  const files = new Set(await api.files());
  const drawings = [...files].filter((f) => /\.pdf\.excalidraw$/i.test(f) && files.has(f.replace(/\.excalidraw$/i, "")));
  if (!drawings.length) { toast("No older PDF drawings to move: every PDF's marks are in its note"); return; }
  toast(`Reading ${drawings.length} PDF drawing${drawings.length === 1 ? "" : "s"}…`);
  const plans: Plan[] = [], failed: string[] = [];
  for (const d of drawings) {
    try { const p = await plan(d); if (p && (p.got.marks.length || p.got.kept)) plans.push(p); } catch (e) { failed.push(`${d}: ${e instanceof Error ? e.message : e}`); }
  }
  const marks = plans.reduce((a, p) => a + p.got.marks.length, 0), staying = plans.filter((p) => p.got.kept);
  const list = plans.slice(0, 8).map((p) => `${p.pdf.split("/").pop()}: ${p.got.marks.length}`).join(" · ") + (plans.length > 8 ? ` · and ${plans.length - 8} more` : "");
  const hint = `${marks} marks from ${plans.length} drawings go into their PDFs' notes (${list}). The drawings then go to the vault's trash`
    + (staying.length ? `, except ${staying.length} holding things that are no marks (pictures, embeds): those stay, their marks copied.` : ".")
    + (failed.length ? ` ${failed.length} could not be read and are left alone.` : "");
  if (!plans.length) { toast(failed.length ? `Not read: ${failed.join("; ")}` : "The older drawings hold no marks"); return; }
  if (!(await confirmDialog("Move the older PDF marks into their notes?", hint, "Move them"))) return;
  let moved = 0, trashed = 0;
  for (const p of plans) {
    try {
      const have = new Set((await api.pdfMarks(p.pdf)).marks.map((m) => m.id));
      const fresh = p.got.marks.filter((m) => !have.has(m.id));
      if (fresh.length) await api.changePdfMarks(p.pdf, fresh.map((mark) => ({ op: "put" as const, mark })));
      moved += fresh.length;
      if (!p.got.kept) { await api.trash(p.drawing); trashed++; }
    } catch (e) { failed.push(`${p.drawing}: ${e instanceof Error ? e.message : e}`); }
  }
  toast(`${moved} marks moved into their notes; ${trashed} drawings to the trash`, failed.length ? `Not done: ${failed.join("; ")}` : undefined, failed.length ? "error" : "info", failed.length ? 10000 : 5000);
}
