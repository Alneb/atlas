// Diagnostics → server (.atlas/cache/ui.log): uncaught errors, failed promises, and a layout
// self-check, so problems that only happen in the desktop webview (WebKitGTK) are visible.
import { api } from "./api";

const sent = new Set<string>();
export function report(level: "error" | "warn" | "info", message: string): void {
  if (sent.has(message) || sent.size > 200) return; // once per distinct message
  sent.add(message);
  api.uiLog(level, message).catch(() => {});
}

/** Pixels a clipping container may cut without being reported (dockview's gap between groups). */
const CLIP_SLACK = 8;

/** Elements that show scrollbars around the shell (they should never scroll; panes scroll inside). */
function overflowCheck(): void {
  const shell = document.querySelector(".shell");
  if (!shell) return;
  const bad: string[] = [];
  for (const el of [document.documentElement, document.body, ...Array.from(shell.querySelectorAll<HTMLElement>(".main, .dock-wrap, .dock, .dv-dockview, .dv-grid-view, .dv-branch-node, .dv-split-view-container, .dv-view-container, .dv-view"))]) {
    const dx = el.scrollWidth - el.clientWidth, dy = el.scrollHeight - el.clientHeight;
    if (dx <= 1 && dy <= 1) continue;
    // only what can show: a collapsed view (0 px) hides everything anyway, and a clipping container cutting a few
    // pixels is dockview's own margin (ui.log was full of both: "scroll 1740x1085 client 1740x1080 overflow clip/clip")
    if (el.clientWidth === 0 || el.clientHeight === 0) continue;
    const cs = getComputedStyle(el);
    const clips = (o: string) => o === "clip" || o === "hidden";
    if (clips(cs.overflowX) && clips(cs.overflowY) && dx <= CLIP_SLACK && dy <= CLIP_SLACK) continue;
    bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} scroll ${el.scrollWidth}x${el.scrollHeight} client ${el.clientWidth}x${el.clientHeight} overflow ${cs.overflowX}/${cs.overflowY}`);
  }
  for (const el of [document.documentElement, document.body, ...Array.from(document.querySelectorAll<HTMLElement>(".shell, .main, .dock-wrap, .dv-dockview, .dv-view"))]) {
    if (el.scrollLeft || el.scrollTop) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} scrolled by ${el.scrollLeft},${el.scrollTop}`);
  }
  if (bad.length) report("warn", `layout overflow (dpr ${devicePixelRatio}, window ${innerWidth}x${innerHeight}):\n${bad.slice(0, 12).join("\n")}`);
}

export function installDiagnostics(): void {
  window.addEventListener("error", (e) => report("error", `${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => report("error", `unhandled rejection: ${e.reason instanceof Error ? e.reason.stack ?? e.reason.message : String(e.reason)}`));
  report("info", `ui start: ${navigator.userAgent} dpr ${devicePixelRatio} ${innerWidth}x${innerHeight}`);
  let t: ReturnType<typeof setTimeout> | undefined;
  const later = () => { clearTimeout(t); t = setTimeout(overflowCheck, 800); };
  window.addEventListener("resize", later);
  later();
  setInterval(overflowCheck, 15000);
}
