// Ctrl+Tab as a glance: the tabs of the focused split, most recently used first, as cards with a preview. Ctrl held:
// Tab steps on, Shift+Tab back; letting go of Ctrl switches to the chosen tab; Esc keeps the one you
// were on. A quick Ctrl+Tab (Ctrl let go before the cards show) switches to the previous tab at once,
// like Alt+Tab. `[ui] tab_switcher = cycle` keeps the older step through every tab in the bar's order.
// Each step shows the chosen tab itself in the pane behind: the cards are names only — no previews to draw — and Esc goes back.
import type { DockviewApi } from "dockview-core";
import { tabs } from "./tabs.svelte";

const DRAW_MS = 120;
/** Each split's tabs, the most recently active first. */
const recent = new Map<string, string[]>();
/** While the glance steps through tabs, they are shown, not chosen: the recent order waits for the end. */
let glancing = false;

/** Keeps the most-recent order of every split; call once with the dock. */
export function trackRecent(d: DockviewApi): void {
  d.onDidActivePanelChange(() => { if (!glancing) remember(d); });
  remember(d);
}

/** The active tab first in its split's recent order. */
function remember(d: DockviewApi): void {
  const p = d.activePanel;
  if (!p) return;
  const list = (recent.get(p.group.id) ?? []).filter((id) => id !== p.id);
  recent.set(p.group.id, [p.id, ...list]);
}

/** The focused split's open tabs, most recent first (tabs never visited keep their bar order). */
export function glanceOrder(d: DockviewApi): string[] {
  const g = d.activeGroup;
  if (!g) return [];
  const here = g.panels.map((p) => p.id);
  const seen = (recent.get(g.id) ?? []).filter((id) => here.includes(id));
  return [...seen, ...here.filter((id) => !seen.includes(id))];
}

let state: { ids: string[]; at: number; el: HTMLElement | null; timer: ReturnType<typeof setTimeout>; show: () => void } | null = null;

/** Ctrl+Tab (+1) or Ctrl+Shift+Tab (-1) while the glance is open or to open it. */
export function glance(d: DockviewApi, step: 1 | -1): void {
  if (state) {
    state.at = (state.at + step + state.ids.length) % state.ids.length;
    state.show();
    draw();
    return;
  }
  const ids = glanceOrder(d);
  if (ids.length < 2) return;
  const from = ids[0];
  glancing = true;
  const show = () => { if (state) d.getPanel(state.ids[state.at])?.api.setActive(); };
  state = { ids, at: step === 1 ? 1 : ids.length - 1, el: null, timer: setTimeout(draw, DRAW_MS), show };
  show(); // the pane behind shows the chosen tab at once
  const up = (e: KeyboardEvent) => { if (e.key === "Control") finish(true); };
  const esc = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault(); e.stopPropagation();
    finish(false);
  };
  const end = () => finish(true);
  function finish(go: boolean) {
    if (!state) return;
    const { ids, at, el, timer } = state;
    clearTimeout(timer);
    el?.remove();
    state = null;
    window.removeEventListener("keyup", up, true);
    window.removeEventListener("keydown", esc, true);
    window.removeEventListener("blur", end);
    glancing = false;
    d.getPanel(go ? ids[at] : from)?.api.setActive(); // chosen, or back where it was (Esc)
    remember(d); // already active while shown: no change event comes, so it is counted here
  }
  window.addEventListener("keyup", up, true);
  window.addEventListener("keydown", esc, true);
  window.addEventListener("blur", end);
}

function draw(): void {
  if (!state) return;
  clearTimeout(state.timer);
  const items = tabs.groups.flatMap((g) => g.tabs);
  if (!state.el) {
    const el = document.createElement("div");
    el.className = "tab-glance";
    el.dataset.testid = "tab-glance";
    el.setAttribute("role", "listbox");
    el.setAttribute("aria-label", "Tabs of this split, most recent first");
    for (const id of state.ids) {
      const t = items.find((x) => x.id === id);
      const card = document.createElement("div");
      card.className = "glance-card";
      card.setAttribute("role", "option");
      const title = document.createElement("div");
      title.className = "glance-title";
      title.textContent = t?.title ?? id;
      const where = document.createElement("div");
      where.className = "glance-where";
      where.textContent = t?.path ?? t?.tip ?? "";
      card.append(title, where);
      el.append(card);
    }
    document.body.append(el);
    state.el = el;
  }
  [...state.el.children].forEach((c, i) => {
    c.classList.toggle("chosen", i === state!.at);
    c.setAttribute("aria-selected", String(i === state!.at));
    if (i === state!.at) (c as HTMLElement).scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}
