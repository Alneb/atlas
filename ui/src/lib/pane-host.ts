// A pane's body in the dock: the Svelte component of its kind, mounted into dockview's panel. Here, once for every
// kind: its code loaded on first use, the keys typed while it loads held for it, its scroll kept while its tab is in
// the background (pane-scroll.ts), and its sleep — unmounted after a while unseen, mounted again when shown
// (hibernate.ts's policy).
import type { Component } from "svelte";
import { mount, unmount } from "svelte";
import type { DockviewPanelApi, GroupPanelPartInitParameters, IContentRenderer } from "dockview-core";
import type { PaneKind, PaneSpec, SpecOf } from "./panes";
import { errText } from "./text";
import { superOf } from "./keys";
import { app } from "./state.svelte";
import { keepScroll, type ScrollKeeper } from "./pane-scroll";
import { register, startsAsleep, type SleeperHandle } from "./hibernate";
import { getDock } from "./dock-instance";

export interface PaneProps<K extends PaneKind> { spec: SpecOf<K>; panel: DockviewPanelApi }
/** Each pane's code loads on first use (CodeMirror, pdf.js, xterm stay out of the startup bundle). */
export type PaneComponents = { [K in PaneKind]: () => Promise<{ default: Component<PaneProps<K>> }> };
export type AnyLoader = () => Promise<{ default: Component<PaneProps<PaneKind>> }>;

/** The panel `open()` is creating and activating right now (its init runs inside addPanel). */
let opening: string | null = null;
export const setOpening = (id: string | null): void => { opening = id; };

/** Swallows plain characters typed until `release`, then types them into the given text box
 *  (dropped if it is not one: better lost than typed into another note). */
function holdKeys(): { release(into: EventTarget | Element | null): void } {
  let text = "";
  // the focus the shortcut was pressed in (Home's capture box): keys typed there now are the new pane's
  const before = document.activeElement;
  const grab = (e: KeyboardEvent) => {
    if (e.key.length !== 1 || e.ctrlKey || superOf(e) || e.altKey) return;
    // a text field focused since (the palette, opened while the pane loads): the keys are its
    const a = document.activeElement as HTMLElement | null;
    if (a && a !== before && (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a.isContentEditable)) return;
    e.preventDefault();
    e.stopPropagation();
    text += e.key;
  };
  window.addEventListener("keydown", grab, true);
  const timer = setTimeout(() => window.removeEventListener("keydown", grab, true), 3000);
  return {
    release(box) {
      clearTimeout(timer);
      window.removeEventListener("keydown", grab, true);
      const t = text;
      text = ""; // once: the first release wins
      if (!t || !(box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement)) return;
      box.setRangeText(t, box.selectionStart ?? box.value.length, box.selectionEnd ?? box.value.length, "end");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    },
  };
}

/** Mounts a Svelte component as a dockview panel body; unmounts it when the panel goes — or while it sleeps. */
export class SveltePane implements IContentRenderer {
  readonly element = document.createElement("div");
  private instance: ReturnType<typeof mount> | null = null;
  private disposed = false;
  private asleep = false;
  private api: DockviewPanelApi | null = null;
  /** The spec it was opened with, for waking when the panel's own params are gone. */
  private spec: PaneSpec | null = null;
  private readonly scroll: ScrollKeeper;
  private subs: { dispose(): void }[] = [];
  private sleeper: SleeperHandle | null = null;
  constructor(private readonly load: AnyLoader, private readonly kind: PaneKind) {
    this.element.className = `atlas-pane atlas-pane-${kind}`;
    this.scroll = keepScroll(this.element);
  }
  init(p: GroupPanelPartInitParameters): void {
    const api = (this.api = p.api as DockviewPanelApi);
    // a background tab is out of the page: its scroll positions come back with it; a sleeping one is mounted again
    this.subs.push(api.onDidVisibilityChange((e) => {
      if (e.isVisible) { this.wake(); this.scroll.shown(); this.sleeper?.seen(); } else { this.scroll.hidden(); this.sleeper?.seen(); }
    }));
    this.sleeper = register({
      id: api.id,
      kind: this.kind,
      visible: () => api.isVisible,
      canSleep: () => !app.dirty[api.id] && !!this.instance,
      sleep: () => this.sleep(),
    });
    // opened active (a shortcut, a click) while its code still loads: hold the characters typed meanwhile, so they
    // reach the pane instead of whatever had the focus (Today's capture box got "colour" meant for Search — depth audit)
    this.spec = p.params as PaneSpec;
    if (opening !== api.id && startsAsleep(this.kind)) {
      // a layout being restored says which tab of a group shows only once it is in: decide then
      queueMicrotask(() => {
        if (this.disposed || this.instance || this.asleep) return;
        // a panel restored after its group's active one is still marked visible until its group runs its events
        (getDock()?.getPanel(api.id) as unknown as { runEvents?(): void } | undefined)?.runEvents?.();
        if (api.isVisible) this.mountNow(this.spec!, null);
        else { this.asleep = true; this.element.classList.add("asleep"); }
      });
      return;
    }
    this.mountNow(this.spec, opening === api.id ? holdKeys() : null);
  }
  private mountNow(spec: PaneSpec, held: ReturnType<typeof holdKeys> | null): void {
    this.load().then(
      (m) => {
        if (this.disposed || this.asleep || this.instance) { held?.release(null); return; }
        this.instance = mount(m.default, { target: this.element, props: { spec, panel: this.api! } as PaneProps<PaneKind> });
        // into the pane's FIRST focused box (on mount or a frame later) — not one focused after it
        // (Search's replace field, when Ctrl+Shift+H came while the pane loaded)
        if (held) {
          const el = this.element;
          if (el.contains(document.activeElement)) held.release(document.activeElement);
          else {
            el.addEventListener("focusin", (e) => held.release(e.target), { once: true });
            requestAnimationFrame(() => requestAnimationFrame(() => held.release(null)));
          }
        }
      },
      (err) => {
        held?.release(null);
        console.error("[atlas] pane failed to load", this.kind, err);
        // a chunk gone after an update, imported without Vite's preload wrapper: main.ts's reload all the same
        if (/dynamically imported module|Importing a module script failed/i.test(errText(err))) window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
        this.element.textContent = `Could not load the ${this.kind} pane: ${errText(err)}`;
      },
    );
  }
  /** Unmounted, its element emptied; the tab stays. */
  private sleep(): void {
    if (!this.instance) return;
    this.asleep = true;
    void unmount(this.instance);
    this.instance = null;
    this.element.replaceChildren();
    this.element.classList.add("asleep");
  }
  /** Shown again: mounted with the tab's parameters as they are now (a renamed path, a page reached). */
  private wake(): void {
    if (!this.asleep || this.disposed || !this.api) return;
    this.asleep = false;
    this.element.classList.remove("asleep");
    this.sleeper?.woke();
    // the panel's params as they are now (updateParameters merges into them); api.getParameters() is unset until one
    this.mountNow((getDock()?.getPanel(this.api.id)?.params as PaneSpec | undefined) ?? this.spec!, null);
  }
  dispose(): void {
    this.disposed = true;
    this.subs.forEach((s) => s.dispose());
    this.sleeper?.dispose();
    this.scroll.dispose();
    if (this.instance) void unmount(this.instance);
    this.instance = null;
  }
}
