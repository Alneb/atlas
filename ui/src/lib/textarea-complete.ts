// Completions in a plain text box (the capture boxes): `[[` a note's name, `#` a tag, `@` a day,
// and on a to-do (`[] …`, `todo …`) the task fields the editor offers (task-complete.ts).
// A Svelte action: `<textarea use:complete>`. The list hangs under the box — or over it, whichever
// side has more room, and never past the window's edge (it scrolls instead); ↑ ↓ and Tab / Shift+Tab
// choose (as in the editor), Enter takes it, Esc closes the list (and only the list). On a task's
// "new line" row Enter is the box's own again. Every row is icon, name, hint — the same rows as the
// native box (crates/atlas-capture). Nothing here knows about the editor.
import { settings } from "./settings.svelte";
import { basename } from "./paths";
import { api } from "./api";
import { captureDays, describeCapture, SETTLE_MS } from "./capture-hints.svelte";
import { Newest } from "./newest";
import type { IconName } from "./panes";
import { taskSuggestions, taskIconEl, rowIconEl, type TaskSuggestion } from "./task-complete";

const MOST = 7;
interface Open { start: number; kind: "note" | "tag" | "day"; typed: string }
const ICON: Record<Open["kind"], IconName> = { note: "file-text", tag: "hash", day: "calendar" };
const SIGN: Record<Open["kind"], string> = { note: "", tag: "#", day: "@" };
/** A day's hint in the list ("Fri 16 Oct"), from the date the core gives the word. */
const sayDate = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
let dayDates = new Map<string, string>();

/** What is being typed just before the caret, if it is one of the three kinds. */
export function tokenAt(text: string, caret: number): Open | null {
  const before = text.slice(0, caret);
  const note = /\[\[([^\]\n[]*)$/.exec(before);
  if (note) return { start: caret - note[1].length, kind: "note", typed: note[1] };
  const word = /(^|\s)([#@])([\w/+-]*)$/.exec(before);
  if (!word) return null;
  return { start: caret - word[3].length, kind: word[2] === "#" ? "tag" : "day", typed: word[3] };
}

let notes: Promise<string[]> | null = null, tags: Promise<string[]> | null = null;
const stem = (p: string) => basename(p).replace(/\.md$/i, "");
async function candidates(o: Open): Promise<string[]> {
  const q = o.typed.toLowerCase();
  if (o.kind === "day") {
    const days = await captureDays();
    dayDates = new Map(days.map((d) => [d.word, d.date]));
    return days.map((d) => d.word).filter((d) => d.startsWith(q));
  }
  if (o.kind === "tag") {
    tags ??= api.tags().then((t) => t.map((x) => x.tag.replace(/^#/, "")), () => []);
    return (await tags).filter((t) => t.toLowerCase().startsWith(q));
  }
  notes ??= api.files({ index: true }).then((f) => [...new Set(f.filter((p) => /\.md$/i.test(p)).map(stem))], () => []);
  const all = await notes;
  // names that begin with what was typed first, then those that only contain it
  return [...all.filter((n) => n.toLowerCase().startsWith(q)), ...all.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q))];
}

/** `when`: the list is offered only while it says so (the command bar is a capture box only in its capture mode). */
export function complete(box: HTMLTextAreaElement | HTMLInputElement, opts: { when?: () => boolean; vault?: () => string | undefined } = {}): { destroy(): void } {
  const list = document.createElement("ul");
  list.className = "ta-complete";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  box.after(list);
  let open: Open | null = null, items: string[] = [], sel = 0;
  const looks = new Newest(SETTLE_MS);
  let task: { start: number; items: TaskSuggestion[] } | null = null; // task fields / dates, when those are offered

  const close = () => { open = null; task = null; list.hidden = true; };
  const draw = () => {
    list.replaceChildren(...items.map((it, i) => {
      const li = document.createElement("li"), label = document.createElement("span"), detail = document.createElement("span");
      li.className = "task-row";
      label.className = "task-sugg-label";
      detail.className = "task-sugg-detail";
      if (task) {
        const t = task.items[i];
        label.textContent = t.label; detail.textContent = t.detail;
        li.append(taskIconEl(t.icon), label, detail);
      } else if (open) {
        label.textContent = SIGN[open.kind] + it;
        detail.textContent = open.kind === "day" && dayDates.has(it) ? sayDate(dayDates.get(it)!) : "";
        li.append(rowIconEl(ICON[open.kind]), label, detail);
      }
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === sel));
      li.onmousedown = (e) => { e.preventDefault(); sel = i; take(); };
      return li;
    }));
    list.hidden = !items.length;
    fit();
  };
  /** Places the list in the window's coordinates (position: fixed) under the box — over it when there is more
   *  room there — as tall as fits (it scrolls). Fixed, so no scrolling block around the box can clip it: on the
   *  Home page the list was cut at its block's edge and the next block showed through ("shows hidden below the
   *  other things"). */
  const fit = () => {
    if (list.hidden) return;
    const edge = 6, vh = window.innerHeight, vw = window.innerWidth;
    const host = (list.parentElement ?? box).getBoundingClientRect();
    list.style.maxHeight = "";
    const below = vh - edge - (host.bottom - 4), above = host.top + 4 - edge;
    const up = list.offsetHeight > below && above > below;
    list.style.maxHeight = `${Math.max(48, up ? above : below)}px`;
    list.style.top = up ? "" : `${host.bottom - 4}px`;
    list.style.bottom = up ? `${vh - host.top - 4}px` : "";
    list.style.left = `${Math.max(edge, Math.min(host.left + 10, vw - edge - list.offsetWidth))}px`;
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  };
  // the box moves with its page: the list follows
  const follow = () => fit();
  window.addEventListener("scroll", follow, true);
  window.addEventListener("resize", follow);
  async function look() {
    if (opts.when && !opts.when()) return close();
    const caret = box.selectionStart ?? 0, o = tokenAt(box.value, caret), still = looks.ask();
    if (!o) {
      const before = box.value.slice(0, caret);
      const mode = settings.config?.editor.task_suggest ?? "always"; // as in a note
      // a to-do in capture's spellings: the core says (capture.rs `starts_as_task`)
      // asked once typing settles, of the vault the box writes to; the hint line's request for the same text is this one
      if (mode !== "off" && !(await looks.settle(still))) return;
      const todo = mode !== "off" && (await describeCapture(box.value, opts.vault?.()).catch(() => null))?.task;
      if (!still()) return;
      const t = todo ? await taskSuggestions(before.slice(before.lastIndexOf("\n") + 1), { browse: mode === "always", keepEnter: true }) : null;
      if (!still()) return; // a later key already asked again
      if (!t) return close();
      open = null; task = { start: caret - t.replace, items: t.items }; items = t.items.map((x) => x.label); sel = 0;
      return draw();
    }
    task = null;
    const all = await candidates(o);
    if (!still()) return; // a later key already asked again
    // typed out in full already (`@tomorrow`): nothing to offer, and Enter must stay the box's own
    if (all.some((c) => c.toLowerCase() === o.typed.toLowerCase())) return close();
    const found = all.slice(0, MOST);
    open = o; items = found; sel = 0;
    draw();
  }
  function take() {
    if (task) {
      const it = task.items[sel];
      if (!it) return;
      box.setRangeText(it.insert, task.start, box.selectionStart ?? 0, "end");
      box.dispatchEvent(new Event("input", { bubbles: true })); // runs look() again: after "due", the dates
      if (!it.more) close();
      return;
    }
    if (!open || !items[sel]) return;
    const caret = box.selectionStart ?? 0, word = items[sel];
    const insert = open.kind === "note" ? `${word}]] ` : `${word} `;
    box.setRangeText(insert, open.start, caret, "end");
    box.dispatchEvent(new Event("input", { bubbles: true })); // the box's own bindings (its value, its hints) follow
    close();
  }
  const onKey = (e: KeyboardEvent) => {
    if (list.hidden) return;
    const down = e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey), up = e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey);
    if (down || up) { sel = (sel + (down ? 1 : items.length - 1)) % items.length; draw(); }
    else if (e.key === "Enter" && task?.items[sel]?.icon === "new_line") { close(); return; } // the box's own Enter
    else if (e.key === "Enter") take();
    else if (e.key === "Escape") close();
    else return;
    e.preventDefault();
    e.stopImmediatePropagation(); // the box's own Enter (send) and Esc (close the window) are not meant
  };
  const onInput = () => void look();
  (box as HTMLElement).addEventListener("keydown", onKey, true);
  box.addEventListener("input", onInput);
  box.addEventListener("blur", close);
  return { destroy() { (box as HTMLElement).removeEventListener("keydown", onKey, true); box.removeEventListener("input", onInput); box.removeEventListener("blur", close); window.removeEventListener("scroll", follow, true); window.removeEventListener("resize", follow); list.remove(); } };
}
