// The signs of travelling the history (an animation at both sides, so it is clear
// the history is being travelled): while a two-finger swipe is under way, an arrow at the edge it
// leads to, growing with the swipe and filled once letting go would go there; on every step back
// or forward (swipe, mouse button, key), a pill naming where it went and where in the history that is.
// Both keep moving with ui.motion = "instant" (.motion-keep).
let edge: HTMLElement | null = null, pill: HTMLElement | null = null, pillT: ReturnType<typeof setTimeout> | undefined;

function make(cls: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `${cls} motion-keep`;
  el.setAttribute("aria-hidden", "true");
  document.body.append(el);
  return el;
}

/** The swipe so far: -1 … 1 (negative: back, at the left edge); |p| ≥ 1 means far enough. */
export function swipeSign(p: number, can: boolean): void {
  edge ??= make("nav-edge");
  const back = p < 0, k = Math.min(1, Math.abs(p));
  edge.dataset.side = back ? "left" : "right";
  edge.dataset.ready = String(k >= 1 && can);
  edge.dataset.blocked = String(!can); // nothing that way: the arrow stays grey
  edge.textContent = back ? "←" : "→";
  edge.style.setProperty("--k", String(k));
  edge.hidden = false;
}

export function hideSwipe(): void {
  if (edge) edge.hidden = true;
}

/** After a step: "Back · Runs · 3 of 7". */
export function travelSign(back: boolean, title: string, at: number, of: number): void {
  pill ??= make("nav-pill");
  pill.textContent = `${back ? "← Back" : "Forward →"} · ${title} · ${at} of ${of}`;
  pill.hidden = false;
  pill.classList.remove("show");
  void pill.offsetWidth; // restart the fade-in
  pill.classList.add("show");
  clearTimeout(pillT);
  pillT = setTimeout(() => { if (pill) pill.hidden = true; }, 1400);
}
