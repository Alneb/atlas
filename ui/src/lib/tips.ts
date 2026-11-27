// The delayed tooltip of every `.tipped` button (its `data-tip`): one floating element at the top of the page, so no
// panel that clips its overflow cuts it off. The left bar did: a tab's or a tool's tip drawn as the button's own
// `::after` stopped at the bar's edge ("Files · Super+Shift+F · right-click: its…"). Placed beside a button whose row
// runs down (icons in a column), under one in a row, always inside the window; gone on a press, a key, a scroll or
// when the pointer leaves.

const DELAY = 450;
const GAP = 8;

let tip: HTMLDivElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let over: HTMLElement | null = null;

function hide(): void {
  clearTimeout(timer);
  over = null;
  if (tip) tip.hidden = true;
}

/** Whether the button sits in a column of buttons (its tip goes beside it) rather than a row (under it): its parent
 *  lays out downward, or a neighbouring button stands right above or below it. */
function inColumn(el: HTMLElement): boolean {
  const parent = el.parentElement;
  if (!parent) return false;
  const cs = getComputedStyle(parent);
  if (cs.display.includes("flex")) return cs.flexDirection.startsWith("column");
  const r = el.getBoundingClientRect();
  const next = (el.nextElementSibling ?? el.previousElementSibling) as HTMLElement | null;
  if (!next) return false;
  const n = next.getBoundingClientRect();
  return Math.abs(n.left - r.left) < 2 && Math.abs(n.top - r.top) >= r.height / 2;
}

function show(el: HTMLElement): void {
  const text = el.dataset.tip;
  if (!text || !el.isConnected) return;
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "float-tip";
    tip.setAttribute("role", "tooltip");
    document.body.append(tip);
  }
  tip.textContent = text;
  tip.hidden = false;
  const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
  const W = innerWidth, H = innerHeight;
  let x: number, y: number;
  if (inColumn(el)) {
    x = r.right + GAP;
    y = r.top + r.height / 2 - t.height / 2;
    if (x + t.width > W - 4) x = r.left - GAP - t.width; // no room at the right: at the left
  } else {
    x = r.left + r.width / 2 - t.width / 2;
    y = r.bottom + GAP;
    if (y + t.height > H - 4) y = r.top - GAP - t.height; // no room below: above
  }
  tip.style.left = `${Math.round(Math.min(Math.max(4, x), W - t.width - 4))}px`;
  tip.style.top = `${Math.round(Math.min(Math.max(4, y), H - t.height - 4))}px`;
}

/** Started once with the page (main.ts). */
export function startTips(): void {
  if (typeof document === "undefined") return;
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return; // a finger has no hover: the long press says what a button does
    const el = (e.target as Element | null)?.closest?.<HTMLElement>(".tipped[data-tip]") ?? null;
    if (el === over) return;
    hide();
    if (!el) return;
    over = el;
    timer = setTimeout(() => { if (over === el) show(el); }, DELAY);
  });
  document.addEventListener("pointerdown", hide, true);
  document.addEventListener("keydown", hide, true);
  document.addEventListener("scroll", hide, true);
  window.addEventListener("blur", hide);
}
