// The rendered conversation: a Claude Code conversation read from its own file by the helper (engine/src/transcript.rs)
// and drawn as a chat — your messages as bubbles, Claude's replies as text with their formulas drawn by the app's math
// (`atlas.editor.drawMath`), Claude's steps between two replies one pill that opens on each tool and its answer.
// Nothing is written anywhere. Opened from a Claude tab (its button, or Super+Alt+K in it) it shows that tab's
// conversation and "Terminal" goes back to it; opened elsewhere it follows the conversation Claude wrote to last.
import type { PluginApi } from "../../../../../ui/src/lib/plugin-api";
import { markdown } from "./md";

type Block = { kind: "text"; text: string } | { kind: "thinking"; text: string } | { kind: "tool"; name: string; what: string } | { kind: "result"; text: string; error: boolean };
type Entry = { role: "user" | "assistant" | "tool"; time: string; id: string; blocks: Block[] };
type Piece = { id: string; size: number; length: number; skipped: number; restart: boolean; more: boolean; entries: Entry[] };
type Conversation = { id: string; modified: number; size: number; title: string };

/** Sent to a rendered view that has the keys (main.js's command): go back to the terminal, or close. */
export const BACK = "atlas-claude-conversation-back";
/** Sent on the window by a view opened from a tab: show that tab (main.js keeps each tab's `show`). */
export const SHOW_TAB = "atlas-claude-show-tab";
const EVERY_MS = 1000;
/** A long conversation opens on its last part (a day's session is tens of MB); the start is a click away. */
const TAIL_BYTES = 6 << 20;

const STYLE = `
  .cc { --cc-w: 780px; display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg); color: var(--text); outline: none;
    font-family: var(--font-ui); font-size: calc(14px * var(--ui-scale, 1)); line-height: 1.6; }
  .cc-bar { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg-alt, var(--bg)); }
  .cc-title { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
  .cc-title b { font-weight: 600; color: var(--heading, var(--text)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cc-title small { color: var(--text-faint); font-size: .8em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cc-bar select { max-width: 40%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 7px; padding: 4px 8px; font: inherit; font-size: .9em; }
  .cc-bar label { display: flex; gap: 5px; align-items: center; color: var(--text-muted); font-size: .88em; white-space: nowrap; cursor: pointer; }
  .cc-btn { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 7px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font: inherit; font-size: .88em; cursor: pointer; white-space: nowrap; }
  .cc-btn:hover { background: var(--bg-hover); }
  .cc-btn kbd { font-family: var(--font-mono); font-size: .85em; color: var(--text-faint); }
  .cc-scroll { flex: 1; min-height: 0; overflow: auto; position: relative; }
  .cc-list { max-width: var(--cc-w); margin: 0 auto; padding: 20px 20px 30vh; display: flex; flex-direction: column; gap: 14px; }
  .cc-msg { content-visibility: auto; contain-intrinsic-size: auto 120px; min-width: 0; }
  .cc-you { align-self: flex-end; max-width: 82%; background: var(--accent-soft); border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
    border-radius: 16px 16px 4px 16px; padding: 8px 14px; }
  .cc-you > :first-child { margin-top: 0; } .cc-you > :last-child { margin-bottom: 0; }
  .cc-claude { display: grid; grid-template-columns: 26px 1fr; gap: 0 10px; }
  .cc-avatar { width: 24px; height: 24px; border-radius: 50%; background: color-mix(in srgb, #d97757 85%, var(--bg)); color: #fff; display: grid; place-items: center;
    font-size: 12px; font-weight: 700; margin-top: 2px; }
  .cc-body { min-width: 0; }
  .cc-meta { color: var(--text-faint); font-size: .78em; margin-bottom: 2px; }
  .cc-body > .cc-text > :first-child { margin-top: 0; }
  .cc-text :is(p, ul, ol, table, blockquote) { margin: .5em 0; }
  .cc-text :is(h1, h2, h3, h4) { margin: .9em 0 .3em; line-height: 1.3; color: var(--heading, var(--text)); }
  .cc-text h1 { font-size: 1.3em; } .cc-text h2 { font-size: 1.15em; } .cc-text :is(h3, h4) { font-size: 1em; }
  .cc-text ul, .cc-text ol { padding-left: 1.4em; }
  .cc-text a { color: var(--accent); text-decoration: none; } .cc-text a:hover { text-decoration: underline; }
  /* [[links]] look as in a note (markdown.css .internal-link) */
  .cc-text a.internal-link { border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); cursor: pointer; }
  .cc-text a.internal-link:hover { color: var(--accent-strong, var(--accent)); border-bottom-color: var(--accent-strong, var(--accent)); text-decoration: none; }
  .cc-text a.internal-link.is-unresolved { color: var(--red, #c33); opacity: .85; }
  .cc-text :not(pre) > code { font-family: var(--font-mono); font-size: .86em; background: var(--code-bg, var(--bg-hover)); border: 1px solid var(--border); border-radius: 5px; padding: .05em .35em; }
  .cc-text blockquote { border-left: 3px solid var(--accent); margin-left: 0; padding: 2px 12px; color: var(--text-muted); }
  .cc-text table { border-collapse: collapse; font-size: .92em; display: block; overflow-x: auto; max-width: 100%; }
  .cc-text th { background: var(--bg-hover); font-weight: 600; text-align: left; }
  .cc-text th, .cc-text td { border: 1px solid var(--border); padding: 4px 10px; }
  .cc-code { margin: .6em 0; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; background: var(--code-bg, var(--bg-hover)); }
  .cc-code-head { display: flex; justify-content: space-between; align-items: center; padding: 3px 6px 3px 12px; font-size: .76em; color: var(--text-faint); border-bottom: 1px solid var(--border); }
  .cc-copy { border: 0; background: none; color: var(--text-muted); font: inherit; cursor: pointer; padding: 2px 6px; border-radius: 5px; }
  .cc-copy:hover { background: var(--bg-hover); color: var(--text); }
  .cc-code pre { margin: 0; padding: 10px 12px; overflow: auto; font-family: var(--font-mono); font-size: .84em; line-height: 1.5; }
  .cc-display { display: block; overflow-x: auto; overflow-y: hidden; margin: .7em 0; padding: 4px 0; text-align: center; }
  .cc-steps { margin: 6px 0; }
  .cc-steps > summary { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; list-style: none; cursor: pointer; padding: 2px 10px; border-radius: 999px;
    background: var(--bg-hover); color: var(--text-muted); font-size: .8em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cc-steps > summary::-webkit-details-marker { display: none; }
  .cc-steps > summary:hover { color: var(--text); background: var(--bg-active); }
  .cc-steps > summary::before { content: "›"; font-size: 1.2em; line-height: 1; transition: transform .12s; }
  .cc-steps[open] > summary::before { transform: rotate(90deg); }
  .cc-steps.failed > summary { color: var(--red, #c33); }
  .cc-step-list { margin: 6px 0 4px 6px; padding-left: 12px; border-left: 2px solid var(--border); display: flex; flex-direction: column; gap: 2px; }
  .cc-step > summary { list-style: none; cursor: pointer; display: flex; gap: 8px; align-items: baseline; padding: 2px 6px; border-radius: 6px; font-size: .84em; color: var(--text-muted); min-width: 0; }
  .cc-step > summary::-webkit-details-marker { display: none; }
  .cc-step > summary:hover { background: var(--bg-hover); color: var(--text); }
  .cc-tool { flex: none; font-family: var(--font-mono); font-size: .9em; color: var(--accent); }
  .cc-step.failed .cc-tool { color: var(--red, #c33); }
  .cc-what { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cc-step pre { margin: 4px 0 6px 6px; max-height: 280px; overflow: auto; padding: 8px 10px; border-radius: 7px; background: var(--code-bg, var(--bg-hover));
    font-family: var(--font-mono); font-size: .8em; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
  .cc-thinking > summary .cc-tool { color: var(--text-faint); font-style: italic; font-family: inherit; }
  .cc-thinking .cc-text { margin: 2px 0 6px 6px; color: var(--text-muted); font-style: italic; font-size: .9em; }
  .cc-earlier { align-self: center; }
  .cc-empty { color: var(--text-muted); text-align: center; padding: 48px 16px; }
  .cc-jump { position: absolute; right: 24px; bottom: 20px; box-shadow: var(--shadow-sm, 0 1px 4px rgba(0,0,0,.2)); display: none; }
  .cc-jump.on { display: inline-flex; }
`;

export default function (host: HTMLElement, atlas: PluginApi) {
  const md = markdown();
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, kids: (Node | string)[] = []): HTMLElementTagNameMap[K] => {
    const e = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
    e.append(...kids);
    return e;
  };
  // opened from a tab: `{ "tab": "<its session>" }`; else (the command elsewhere) the newest conversation
  const tab = (() => { try { const a = JSON.parse(atlas.arg ?? ""); return typeof a?.tab === "string" ? (a.tab as string) : null; } catch { return null; } })();

  host.style.height = "100%";
  const root = el("div", { className: "cc claude-conversation", tabIndex: -1 });
  const title = el("b", { textContent: "Claude" }), sub = el("small");
  const picker = el("select", { title: "Which conversation" });
  const follow = el("input", { type: "checkbox", checked: true });
  const back = el("button", { className: "cc-btn", title: "Back to the terminal (Super+Alt+K)" }, ["Terminal ", el("kbd", { textContent: "Super+Alt+K" })]);
  const bar = el("div", { className: "cc-bar" }, [el("div", { className: "cc-title" }, [title, sub])]);
  if (tab) bar.append(back);
  else bar.append(picker, el("label", { title: "Switch to the conversation Claude wrote to last" }, [follow, "Newest"]));
  const list = el("div", { className: "cc-list" });
  const jump = el("button", { className: "cc-btn cc-jump", textContent: "↓ Latest" });
  const scroller = el("div", { className: "cc-scroll" }, [list, jump]);
  root.append(el("style", { textContent: STYLE }), bar, scroller);
  host.append(root);
  queueMicrotask(() => root.focus({ preventScroll: true }));

  const draw = typeof atlas.editor?.drawMath === "function" ? atlas.editor.drawMath : null;
  function text(source: string): HTMLElement {
    const div = el("div", { className: "cc-text" });
    div.innerHTML = md.render(source);
    if (draw) for (const m of div.querySelectorAll<HTMLElement>(".cc-math")) {
      const tex = m.dataset.tex ?? "";
      m.textContent = "";
      try { draw(m, tex, m.classList.contains("cc-display")); } catch { m.textContent = tex; }
    }
    // [[links]] as in a note: drawn unresolved when no file has that name, followed as a click in a note follows them
    const links = (atlas as { links?: PluginApi["links"] }).links;
    for (const a of div.querySelectorAll<HTMLAnchorElement>("a.internal-link")) {
      const target = a.dataset.href ?? "";
      if (links && !target.startsWith("#") && !links.resolve(target)) a.classList.add("is-unresolved");
      a.addEventListener("click", (e) => { e.preventDefault(); void links?.open(target); });
      a.addEventListener("auxclick", (e) => { if (e.button === 1) { e.preventDefault(); void links?.open(target, { beside: true }); } });
    }
    for (const a of div.querySelectorAll<HTMLAnchorElement>("a[href]:not(.internal-link)")) a.addEventListener("click", (e) => { e.preventDefault(); atlas.openLink(a.href); });
    for (const b of div.querySelectorAll<HTMLButtonElement>(".cc-copy")) b.addEventListener("click", () => {
      void navigator.clipboard?.writeText(b.closest(".cc-code")?.querySelector("code")?.textContent ?? "").then(() => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1200); });
    });
    return div;
  }
  const clock = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };

  // --- the messages ----------------------------------------------------------------------------------------------
  // a reply of Claude's runs on across its lines (text, steps, text…) until the person speaks again
  let reply: HTMLElement | null = null;
  type Steps = { box: HTMLDetailsElement; head: HTMLElement; list: HTMLElement; names: Map<string, number>; waiting: HTMLDetailsElement[]; failed: boolean };
  let steps: Steps | null = null;

  function claudeReply(time: string): HTMLElement {
    if (reply) return reply;
    const body = el("div", { className: "cc-body" }, [el("div", { className: "cc-meta", textContent: `Claude${clock(time) ? ` · ${clock(time)}` : ""}` })]);
    list.append(el("div", { className: "cc-msg cc-claude" }, [el("div", { className: "cc-avatar", textContent: "C", ariaHidden: "true" }), body]));
    return (reply = body);
  }
  function stepsHere(body: HTMLElement): Steps {
    if (steps) return steps;
    const box = el("details", { className: "cc-steps" }), head = el("summary"), inner = el("div", { className: "cc-step-list" });
    box.append(head, inner);
    body.append(box);
    return (steps = { box, head, list: inner, names: new Map(), waiting: [], failed: false });
  }
  function label(s: Steps) {
    const n = s.list.childElementCount;
    const names = [...s.names].map(([name, k]) => (k > 1 ? `${name} ×${k}` : name)).slice(0, 4).join(" · ");
    s.head.textContent = `${n} step${n === 1 ? "" : "s"}${names ? ` · ${names}` : ""}`;
    s.box.classList.toggle("failed", s.failed);
  }
  function step(cls: string, name: string, what: string, inside: Node | null): HTMLDetailsElement {
    const d = el("details", { className: `cc-step ${cls}` });
    d.append(el("summary", { title: what }, [el("span", { className: "cc-tool", textContent: name }), el("span", { className: "cc-what", textContent: what })]));
    if (inside) d.append(inside);
    return d;
  }

  function add(e: Entry) {
    if (e.role === "user") {
      reply = null; steps = null;
      for (const b of e.blocks) if (b.kind === "text") list.append(el("div", { className: "cc-msg cc-you", title: clock(e.time) }, [text(b.text)]));
      return;
    }
    const body = claudeReply(e.time);
    for (const b of e.blocks) {
      if (b.kind === "text") { steps = null; body.append(text(b.text)); continue; }
      const s = stepsHere(body);
      if (b.kind === "thinking") s.list.append(step("cc-thinking", "Thinking", b.text.split("\n")[0], text(b.text)));
      else if (b.kind === "tool") {
        const d = step("", b.name, b.what, null);
        s.list.append(d); s.waiting.push(d);
        s.names.set(b.name, (s.names.get(b.name) ?? 0) + 1);
      } else {
        const answer = el("pre", { textContent: b.text || "(nothing)" });
        const to = s.waiting.shift();
        if (to) to.append(answer); else s.list.append(step("", "Answer", b.text.split("\n")[0], answer));
        if (b.error) { (to ?? s.list.lastElementChild)?.classList.add("failed"); s.failed = true; }
      }
      label(s);
    }
  }

  // --- reading ---------------------------------------------------------------------------------------------------
  let id = "", size = 0, busy = false, stopped = false, timer: ReturnType<typeof setTimeout> | undefined, whole = false;
  const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160;
  const toEnd = () => { scroller.scrollTop = scroller.scrollHeight; requestAnimationFrame(() => requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; })); };
  scroller.addEventListener("scroll", () => { if (nearBottom()) jump.classList.remove("on"); });
  jump.addEventListener("click", () => { jump.classList.remove("on"); toEnd(); });

  function reset() { size = 0; reply = null; steps = null; list.replaceChildren(); }
  async function read() {
    if (busy || stopped || (!id && !tab)) return;
    busy = true;
    try {
      for (;;) {
        const first = size === 0;
        const p = (await atlas.helper.call("transcript", { ...(tab ? { tab } : { id }), from: size, tail: first && !whole ? TAIL_BYTES : 0 })) as Piece;
        if (stopped) return;
        if (tab && p.id && id && p.id !== id) { id = p.id; reset(); continue; } // the tab moved to another conversation (/clear)
        id = p.id || id;
        if (p.restart) reset();
        if (first && p.skipped > 0) {
          const more = el("button", { className: "cc-btn cc-earlier", textContent: `Show the earlier part (${(p.skipped / 1048576).toFixed(p.skipped < 10 << 20 ? 1 : 0)} MB)` });
          more.addEventListener("click", () => { whole = true; reset(); void read(); });
          list.append(more);
        }
        const stick = first || nearBottom();
        for (const e of p.entries) add(e);
        size = p.size;
        if (!list.querySelector(".cc-msg") && !list.querySelector(".cc-empty")) list.append(el("div", { className: "cc-empty", textContent: "Nothing said in this conversation yet." }));
        else if (list.querySelector(".cc-msg")) list.querySelector(".cc-empty")?.remove();
        if (stick) toEnd(); else if (p.entries.length) jump.classList.add("on");
        if (!p.more) break;
      }
    } catch (e) {
      sub.textContent = `Not read: ${(e as Error).message ?? e}`;
    } finally { busy = false; }
  }

  let known: Conversation[] = [];
  async function look() {
    try {
      const { folder, list: all } = (await atlas.helper.call("conversations", {})) as { folder: string; list: Conversation[] };
      if (stopped) return;
      known = all;
      const mine = all.find((c) => c.id === id);
      if (tab) { title.textContent = mine?.title || "Claude"; sub.textContent = mine ? `updated ${clock(new Date(mine.modified).toISOString())}` : ""; return; }
      const shown = picker.value;
      picker.replaceChildren(...all.map((c) => el("option", { value: c.id, textContent: `${c.title || "(untitled)"} · ${new Date(c.modified).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}` })));
      if (!all.length) { title.textContent = "Claude"; sub.textContent = ""; list.replaceChildren(el("div", { className: "cc-empty", textContent: `No Claude conversation in this vault yet (${folder}).` })); return; }
      const next = follow.checked || !all.some((c) => c.id === shown) ? all[0].id : shown;
      picker.value = next;
      const c = all.find((x) => x.id === next)!;
      title.textContent = c.title || "Claude";
      sub.textContent = `updated ${clock(new Date(c.modified).toISOString())}`;
      if (next !== id) { id = next; whole = false; reset(); await read(); }
    } catch (e) {
      sub.textContent = `Not read: ${(e as Error).message ?? e}`;
    }
  }

  picker.addEventListener("change", () => { follow.checked = false; void look(); });
  follow.addEventListener("change", () => { if (follow.checked) void look(); });
  // shown in a pop-up (main.js): closing it is going back; from a tab, that tab is brought to the front too
  const goBack = () => { atlas.pane?.close(); if (tab) window.dispatchEvent(new CustomEvent(SHOW_TAB, { detail: tab })); };
  back.addEventListener("click", goBack);
  root.addEventListener(BACK, goBack);
  void known;

  let n = 0;
  const tick = async () => {
    if (stopped) return;
    // the file every second; the list (titles, which is newest) every 5 s
    if (n++ % 5 === 0) await look();
    if (tab || id) await read();
    timer = setTimeout(tick, EVERY_MS);
  };
  void tick();
  return () => { stopped = true; clearTimeout(timer); };
}
