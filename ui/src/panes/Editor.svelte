<script lang="ts">
  // Editor pane: load, autosave (600 ms, base_mtime → 409 conflict banner), reload on fs events. Code files
  // are saved only by Ctrl+S (`[editor] autosave_code`, off); their unsaved text is kept meanwhile in a
  // recovery copy (.atlas/cache/recovery/<path>), offered back when the file is opened again.
  import { errText } from "../lib/text";
  import { inPhoneApp } from "../lib/eink";
  import { shownName, shownPath } from "../lib/paths";
  import { keepRecovery as rescueCopy, recoveryPath } from "../lib/recovery";
  import { openLintPanel } from "@codemirror/lint";
  import { workspaceSymbols } from "../lib/editor/lsp";
  import { settings } from "../lib/settings.svelte";
  import { fileIcon } from "../lib/panes";
  import Icon from "../components/Icon.svelte";
  import { onMount } from "svelte";
  import { api, ApiError } from "../lib/api";
  import { diff } from "../lib/frontmatter-edit";
  import { on } from "../lib/bus";
  import { app, toast } from "../lib/state.svelte";
  import { setDirty, closePanel, open } from "../lib/dock";
  import { editors, noteEditorActive, openIntent } from "../lib/registry";
  import { createEditor, isMarkdown, type AtlasEditor } from "../lib/editor/create";
  import FormatBar from "../components/FormatBar.svelte";
  import SyncCopies from "../components/SyncCopies.svelte";
  import { refreshGitGutter } from "../lib/editor/git-gutter";
  import CodeBar from "../components/CodeBar.svelte";
  import { openWikilink } from "../lib/links";
  import { applyMove } from "../lib/section-move";
  import { vaultReady } from "../lib/vault";
  import type { PaneProps } from "../lib/dock";
  import { setSelection } from "../lib/context.svelte";
  import Backlinks from "../components/Backlinks.svelte";
  import PropertiesPanel from "../components/PropertiesPanel.svelte";
  import { propsPanel } from "../lib/properties-panel.svelte";
  import { phone } from "../lib/phone.svelte";
  import { nativeShell } from "../lib/native-shell.svelte";
  import { frontmatterOf } from "../lib/property-model";
  import { noteViewFor, shownAsNote } from "../lib/note-views.svelte";
  import type { LiveNote } from "../lib/note-live";
  import { hostOf, mirrorState, signInToMirror, type MirrorState } from "../lib/mirror";
  import { chooseVault } from "../lib/vaults";
  import { readText } from "../lib/vault-files";
  import type { Text } from "@codemirror/state";
  import { noteHeadings } from "../lib/note-anchor";
  /** Vim, as the setting says — never in the mobile apps or on a phone's screen: a touch keyboard has no Escape, and normal mode ate the taps. */
  const vimHere = () => app.vimEnabled && !nativeShell.on && !phone.on;

  let { spec, panel }: PaneProps<"editor"> = $props();
  // svelte-ignore state_referenced_locally -- a pane's spec is fixed for its lifetime
  const path = spec.path;

  let host: HTMLDivElement;
  let ed: AtlasEditor | null = null;
  // the last headings() answer and the text it was read from (one scan per version of the text)
  let headCache: { doc: Text; heads: { level: number; text: string; line: number }[] } | null = null;
  let status = $state<"loading" | "ready" | "error">("loading");
  let loadError = $state("");
  let conflict = $state(false);
  let isNew = $state(false);
  let docText = $state(""); // what the properties panel reads; set on every change of the text
  let live: LiveNote | null = null; // the note shared with the other devices that have it open (lib/note-live.ts)
  let livePeers = $state<string[]>([]);
  /** This vault's mirror (lib/mirror.ts): the note is saved here, and its live room is the server's (core server.rs
   *  live_ws); null when none is linked. Shown as the `⇄ host` chip. */
  let mirror = $state<{ host: string; state: MirrorState } | null>(null);
  const askMirror = () => { if (isMarkdown(path)) void mirrorState().then((m) => { if (!disposed) mirror = m && { host: hostOf(m.address), state: m.state }; }, () => {}); };
  /** Who saves the note while it is shared live (lib/live.ts writes()); read again as the room changes. */
  const writesHere = $derived.by(() => { void livePeers; return live?.writes() ?? true; });
  let disposed = false;

  let mtime: number | undefined;
  let saved = ""; // text as last known on disk
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;
  let behindTries = 0; // a writer's saves refused while its copy is behind (save)

  const current = () => ed?.view.state.doc.toString() ?? saved;
  const markDirty = () => setDirty(panel.id, current() !== saved);
  // "dont autosave code files, but keep a temporary one just in case"
  const autosave = () => isMarkdown(path) || (settings.config?.editor.autosave_code ?? false);
  const RECOVERY = recoveryPath(path);
  let parked = false; // the tab is going away with unsaved text (park)
  let blameOn = false; // git blame shown beside the lines (toggleBlame)
  let rescued = false; // text that could not be saved was put in the recovery copy (rescue)
  let recovered = $state<string | null>(null); // a recovery copy that differs from the file, offered back
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  // an empty copy means none: the API has no delete outside the trash, and a saved file needs no copy
  const keepRecovery = (now = false) => {
    clearTimeout(recoveryTimer);
    const write = () => void api.putFile(RECOVERY, current() === saved ? "" : current()).catch(() => {});
    if (now) write(); else recoveryTimer = setTimeout(write, 600);
  };

  /** `closing`: the tab's last text, the editor already gone — saved all the same, or kept (rescue), never dropped. */
  async function save(force = false, closing?: string): Promise<void> {
    clearTimeout(timer);
    while (inflight) await inflight; // the text is read after: what was typed meanwhile goes too
    const text = closing ?? (ed ? current() : null);
    if (text === null || (text === saved && !isNew)) return;
    if (conflict && !force) { if (closing !== undefined) rescue(text); return; }
    // in a room with another device that writes: it saves the shared text, which comes back here through Syncthing
    if (live && !live.writes() && !force) return;
    let again = false;
    inflight = (async () => {
      try {
        const res = await api.putFile(path, text, force || isNew ? undefined : mtime, true);
        mtime = res.mtime;
        saved = text;
        if (res.template?.text !== undefined) void applyTemplate(res.template.template, res.template.added, res.template.text, text);
        if (!autosave()) keepRecovery(true);
        else if (rescued) { rescued = false; void api.putFile(RECOVERY, "").catch(() => {}); }
        if (ed) void refreshGitGutter(ed.view, path); // what differs from git changed with this save
        isNew = false;
        conflict = false;
        behindTries = 0;
      } catch (err) {
        // the room's writer, whose copy is not the last version yet (the writer before it saved, Syncthing has not brought
        // it): the shared text goes on top once it has — asked again each second, a while (core mirror_guard.rs)
        if (err instanceof ApiError && err.status === 409 && live && live.others() > 0 && behindTries++ < 30) {
          await new Promise((r) => setTimeout(r, 1000));
          const f = await api.file(path).catch(() => null);
          if (f) { mtime = f.mtime; again = true; return; }
        }
        // the file was only touched (Syncthing rewrote what we last saved, a new mtime on the same text): ours goes on top
        if (err instanceof ApiError && err.status === 409) {
          const f = await api.file(path).catch(() => null);
          if (f && f.text === saved) { mtime = f.mtime; again = true; return; }
          conflict = true;
        } else toast(`Could not save ${shownPath(path)}`, errText(err), "error");
        if (closing !== undefined) rescue(text);
      } finally {
        inflight = null;
        markDirty();
      }
    })();
    await inflight;
    if (again) return save(force, closing);
  }

  /** A template this save brought (a property set to a value a template applies to, core template_apply.rs), merged
   *  in as one change of the editor's own — undo and the autosave as typing. Typed in meanwhile: merged again into
   *  what is there now, and given up when typing goes on. */
  async function applyTemplate(name: string, added: string[], merged: string, base: string): Promise<void> {
    if (!ed) return;
    if (current() !== base) {
      base = current();
      const again = await api.mergeTemplate(path, name, base).catch(() => null);
      if (!again?.text || !ed || current() !== base) return;
      merged = again.text;
    }
    const change = diff(base, merged);
    if (!change) return;
    ed.view.dispatch({ changes: change, userEvent: "input.template" });
    toast(`Template “${name}” applied`, `Added ${added.join(", ")} · click to undo`, "info", 9000, () => {
      if (!ed || current() !== merged) return;
      const back = diff(merged, base);
      if (back) ed.view.dispatch({ changes: back, userEvent: "input.template" });
    });
  }

  /** The tab closed with text that could not be saved: kept in the recovery copy, offered back when the note opens. */
  function rescue(text: string) {
    rescued = true;
    void rescueCopy(path, text, "Its text is kept: open the note again to get it back.");
  }

  /** Shared live with the other devices that open the note (in a mirrored vault, the core splices the room to the server's). */
  function startLive() {
    if (!isMarkdown(path) || !(settings.config?.editor.live ?? true)) return;
    void import("../lib/note-live").then((m) => { if (!disposed && ed && !live) live = m.liveNote(path, ed.view, (n) => (livePeers = n), () => void save()); });
  }

  // On each change: the unsaved dot at once (cheap); the text itself — the properties panel's, the exact dirty check
  // — once typing pauses. Building a big note's text twice per key (4.5 MB, pictures inlined) was most of a key's cost.
  let textTimer: ReturnType<typeof setTimeout> | undefined;
  function schedule(text?: string, typed = false, keys = false) {
    if (text !== undefined) docText = text;
    window.dispatchEvent(new CustomEvent("atlas-doc-change", { detail: panel.id }));
    if (typed) setDirty(panel.id, true); // the user's change: unsaved at once — not a load or a reload, which may leave it as saved
    if (keys) {
      // keys: the text read when typing pauses (a big note's text is not free to build on every key)
      clearTimeout(textTimer);
      textTimer = setTimeout(() => { if (disposed) return; docText = current(); markDirty(); }, 120);
    } else {
      // anything else (a panel's edit, a paste, a load) is read at once: what made it reads it back
      clearTimeout(textTimer);
      if (text === undefined) docText = current();
      markDirty();
    }
    if (!autosave()) return keepRecovery();
    clearTimeout(timer);
    timer = setTimeout(() => void save(), 600);
  }

  async function reloadFromDisk() {
    try {
      const f = await api.file(path);
      mtime = f.mtime;
      saved = f.text;
      ed?.setDoc(f.text);
      conflict = false;
      markDirty();
    } catch (err) {
      toast(`Could not reload ${shownPath(path)}`, String(err), "error");
    }
  }

  function openLink(target: string, opts?: { beside?: boolean }) {
    void openWikilink(target, path, opts); // a PDF link keeps its #page=… (lib/pdf-place.ts)
  }

  onMount(() => {
    (async () => {
      let text = "";
      askMirror();
      try {
        // links and embeds resolve against the workspace file list: have it before the first render
        const [f] = await Promise.all([api.file(path), vaultReady()]);
        text = f.text;
        mtime = f.mtime;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) isNew = true;
        else { status = "error"; loadError = errText(err); return; }
      }
      if (disposed) return;
      saved = text;
      docText = text;
      ed = createEditor({
        parent: host,
        doc: text,
        path,
        vim: vimHere(),
        line: spec.line,
        onChange: (typed, keys) => schedule(undefined, typed, keys),
        onVimMode: (m) => { if (panel.isActive) app.vimMode = m; },
        onFocus: () => { app.vimMode = ed?.vimMode() ?? ""; app.problems = ed?.problems() ?? null; noteEditorActive(panel.id); },
        onProblems: (p) => { if (panel.isActive) app.problems = p; },
        onSelection: (s) => {
          // the section around the caret: the last heading at or above it (shared context, R3)
          const h = editors.get(panel.id)?.headings().filter((x) => x.line <= s.from_line).pop();
          setSelection({ path, ...s }, h ? { path, heading: h.text, line: h.line } : undefined);
        },
        onSave: () => void save(),
        onQuit: () => void closePanel(panel),
        onOpenLink: openLink,
      });
      status = "ready";
      void refreshGitGutter(ed.view, path);
      // a note is shared live with the other devices that open it (on by default; `[editor] live = false` turns it off)
      startLive();
      // unsaved text kept from last time (a code file's, or a note's that could not be saved: rescue); asked through the
      // listings, as most notes have none (a 404 on every open is logged as an error)
      void readText(RECOVERY).then((r) => { if (!disposed && r && r !== text) { recovered = r; rescued = true; } });
      // the line was a one-shot jump; don't replay it on every layout restore
      if (spec.line !== undefined) panel.updateParameters({ line: undefined });
      editors.set(panel.id, {
        path,
        gotoLine: (n) => ed?.gotoLine(n),
        focus: () => ed?.view.focus(),
        insertBlock: (text) => {
          if (!ed) return;
          const { state } = ed.view, at = state.doc.lineAt(state.selection.main.head).to;
          const insert = `\n\n${text.replace(/\n+$/, "")}\n`;
          ed.view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length }, scrollIntoView: true, userEvent: "input" });
        },
        flush: () => save(),
        park: async () => { if (autosave()) await save(); else if (current() !== saved) parked = true; },
        vimMode: () => ed?.vimMode() ?? "",
        snapshot: () => ({ text: ed?.view.state.doc.toString() ?? "", ranges: ed?.view.state.selection.ranges.map((r) => ({ from: r.from, to: r.to })) ?? [] }),
        showProblems: () => (ed?.problems() ? openLintPanel(ed.view) : false),
        symbols: () => (ed ? workspaceSymbols(ed.view) : false),
        toggleBlame: async () => {
          if (!ed) return null;
          if (blameOn) { ed.setBlame(null, () => {}); blameOn = false; return false; }
          if (autosave()) await save(); // blame reads the file on disk
          const b = await api.gitBlame(path).catch((e) => { toast("No blame", errText(e), "error"); return null; });
          if (!b || !ed) return null;
          if (!b.lines.length) { toast("No history for this file", "Git has no commit of it (outside a repository, or never committed)."); return null; }
          ed.setBlame(b, (hash, subject) => open({ kind: "commit", hash, subject }));
          blameOn = true;
          return true;
        },
        moveSection: (m) => {
          if (!ed) return;
          const doc = ed.view.state.doc, { lo, hi, text, head } = applyMove((n) => doc.line(n).text, m);
          const from = doc.line(lo).from;
          ed.view.dispatch({ changes: { from, to: doc.line(hi - 1).to, insert: text }, selection: { anchor: from + head }, scrollIntoView: true, userEvent: "move.section" });
        },
        headings: () => {
          if (!ed) return [];
          // asked on every caret move: scanned once per version of the text (a doc is immutable, so its identity is
          // the version)
          const doc = ed.view.state.doc;
          if (headCache?.doc !== doc) headCache = { doc, heads: scanHeadings(doc) };
          return headCache.heads.slice();
        },
      });
      function scanHeadings(doc: Text): { level: number; text: string; line: number }[] {
        const out: { level: number; text: string; line: number }[] = [];
        if (/\.tex$/i.test(path)) {
          // LaTeX sectioning → outline levels (\part = 1 … \subparagraph = 7)
          const LV: Record<string, number> = { part: 1, chapter: 2, section: 3, subsection: 4, subsubsection: 5, paragraph: 6, subparagraph: 7 };
          for (let i = 1; i <= doc.lines; i++) {
            const m = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?(?:\[[^\]]*\])?\{(.*)\}/.exec(doc.line(i).text);
            if (m) out.push({ level: LV[m[1]], text: m[2].trim(), line: i });
          }
          return out;
        }
        if (!isMarkdown(path)) return [];
        return noteHeadings(doc.iterLines()).map((h) => ({ level: h.level, text: h.text, line: h.i + 1 }));
      }
      if (panel.isActive) {
        // loaded late (the home note at startup): take the focus only if nobody else has it — the
        // palette or a search box opened meanwhile keeps its keys (vim would read them as commands)
        const a = document.activeElement;
        const asked = openIntent.path === path && Date.now() - openIntent.t < 5000;
        // the app on a phone or a Boox: a note opens to be read; the keyboard comes with a tap in the text (it covered
        // half the screen at every open)
        if (!inPhoneApp() && (asked || !a || a === document.body || host.contains(a))) ed.view.focus();
        app.vimMode = ed.vimMode();
        noteEditorActive(panel.id);
      }
    })();

    const offFs = on("fs", (e) => {
      if (!e.paths.some((p) => p === path || p.endsWith(`/${path}`))) return;
      if (inflight || !ed) return;
      // shared live: the others' edits arrive as edits, not as a reload of the file under the shared text
      if (live && live.others() > 0) { void api.file(path).then((f) => { mtime = f.mtime; saved = f.text === current() ? f.text : saved; markDirty(); }, () => {}); return; }
      const dirty = current() !== saved;
      void api.file(path).then((f) => {
        if (f.mtime === mtime || f.text === current()) { mtime = f.mtime; return; }
        if (dirty) { conflict = true; return; } // our next save would 409 anyway: say so now
        mtime = f.mtime;
        saved = f.text;
        ed?.setDoc(f.text);
        markDirty();
      }, () => {});
    });
    // linked, unlinked or linked elsewhere in the vault switcher: the chip follows
    window.addEventListener("atlas-mirror-unlinked", askMirror);
    const offActive = panel.onDidActiveChange((e) => {
      if (e.isActive && ed) { app.vimMode = ed.vimMode(); app.problems = ed.problems(); if (!inPhoneApp()) requestAnimationFrame(() => ed?.view.focus()); }
    });

    return () => {
      disposed = true;
      offFs();
      offActive.dispose();
      const pending = current() !== saved ? current() : null; // read now: the editor goes below
      // read now too: the room goes below, and out of it this pane would count as the writer
      if (pending !== null && autosave() && (live?.writes() ?? true)) void save(false, pending);
      if (pending !== null && !autosave()) {
        keepRecovery(true);
        // closed by hand: say where the changes went (a reload or the window closing reopens it with the offer)
        if (parked) toast(`${shownPath(path)} was not saved`, "Its changes are kept: open it again to restore them.", "info");
      }
      clearTimeout(recoveryTimer);
      clearTimeout(textTimer);
      live?.close();
      window.removeEventListener("atlas-mirror-unlinked", askMirror);
      editors.delete(panel.id);
      setDirty(panel.id, false);
      ed?.destroy();
      ed = null;
    };
  });

  // a note a plugin draws its own way (a mail note as the mail): drawn over the editor, which stays loaded underneath
  const noteProps = $derived(isMarkdown(path) && status === "ready" ? frontmatterOf(docText)?.data : null);
  const noteView = $derived(noteViewFor(noteProps));
  const drawn = $derived(!!noteView && !shownAsNote.has(path));
  let viewHost = $state<HTMLDivElement>();
  $effect(() => {
    if (!drawn || !viewHost || !noteView) return;
    const off = noteView.render(viewHost, { path, text: docText, props: noteProps ?? {}, showNote: () => shownAsNote.add(path) });
    return () => { if (typeof off === "function") off(); viewHost?.replaceChildren(); };
  });

  // live vim toggle from the palette / status bar
  $effect(() => {
    const on = vimHere();
    ed?.setVim(on);
  });
</script>

<div class="editor-pane" class:is-md={isMarkdown(path)} class:drawn>
  {#if noteView}
    <button class="note-view-switch" onclick={() => (drawn ? shownAsNote.add(path) : shownAsNote.delete(path))}
      title={drawn ? "The note's markdown, to edit" : `Drawn as ${noteView.title.toLowerCase()}`}>{drawn ? "Show as note" : `Show as ${noteView.title.toLowerCase()}`}</button>
  {/if}
  {#if settings.config?.editor.breadcrumbs ?? true}
    <nav class="crumbs" aria-label="Path">
      {#each path.split("/") as seg, i}
        {#if i > 0}<span class="sep">›</span>{/if}
        {#if i < path.split("/").length - 1}
          <!-- a folder of the path: the explorer there, the next step down (the folder or this note) selected -->
          <button class="seg" title="Show {path.split("/").slice(0, i + 1).join("/")} in the explorer"
            onclick={() => open({ kind: "explorer", source: "vault", place: "", path: path.split("/").slice(0, i + 1).join("/"), select: path.split("/")[i + 1] })}>{seg}</button>
        {:else}
          <span class="seg file"><Icon name={fileIcon(path)} size={13} />{shownName(seg)}</span>
        {/if}
      {/each}
    </nav>
  {/if}
  {#if conflict}
    <div class="banner banner-warn" role="alert">
      <span><strong>{shownPath(path)}</strong> changed on disk while you were editing.</span>
      <span class="banner-actions">
        <button class="btn btn-ghost" onclick={reloadFromDisk}>Load disk version</button>
        <button class="btn primary" onclick={() => save(true)}>Keep mine (overwrite)</button>
      </span>
    </div>
  {/if}
  {#if isMarkdown(path)}<SyncCopies {path} mine={current} take={(text) => { ed?.setDoc(text); markDirty(); schedule(text); }} />{/if}
  {#if recovered !== null}
    <div class="banner banner-warn" role="alert">
      <span>Unsaved changes to <strong>{shownPath(path)}</strong> were kept from last time.</span>
      <span class="banner-actions">
        <button class="btn btn-ghost" onclick={() => { recovered = null; rescued = false; void api.putFile(RECOVERY, "").catch(() => {}); }}>Discard them</button>
        <button class="btn primary" onclick={() => { ed?.setDoc(recovered ?? ""); recovered = null; markDirty(); }}>Restore</button>
      </span>
    </div>
  {/if}
  {#if status === "error"}
    <div class="pane-empty"><p class="muted">Could not open <code>{path}</code></p><p class="faint small">{loadError}</p></div>
  {/if}
  {#if livePeers.length}<div class="live-chip" title="These devices have this note open: their edits and cursors show here as they type.{mirror ? (writesHere ? ' This device writes the note.' : ' Another device writes; its saves come here through Syncthing.') : ''}">Live · {[...new Set(livePeers)].join(", ")}{#if mirror} · ⇄ {mirror.host}{/if}</div>
  {:else if mirror}<button class="live-chip mirror-chip" class:down={mirror.state !== "online"}
    onclick={() => (mirror?.state === "signin" ? signInToMirror() : void chooseVault({ linkMirror: true }))}
    title={mirror.state === "online"
      ? `Live with ${mirror.host}, this vault's mirror: saved in this folder, the server leasing each save so Syncthing never sees two versions. ${writesHere ? "This device writes the note." : "Another device writes; its saves come here through Syncthing."} Click: the mirror's settings`
      : `${mirror.host} ${mirror.state === "signin" ? "wants a sign-in (click)" : "is offline"}: this note is saved here only, and a later difference is merged. Click: ${mirror.state === "signin" ? "sign in" : "the mirror's settings"}`}>⇄ {mirror.host}{mirror.state === "online" ? "" : mirror.state === "signin" ? " · sign in" : " · offline"}</button>{/if}
  {#if isNew && status === "ready"}
    <div class="new-file-hint">New file — it is created on the first save.</div>
  {/if}
  {#if isMarkdown(path) && status !== "error" && (settings.config?.editor.format_bar ?? false)}<FormatBar view={() => ed?.view ?? null} />{/if}
  {#if !isMarkdown(path) && status === "ready" && (settings.config?.editor.code_bar ?? true)}<CodeBar view={() => ed?.view ?? null} {path} />{/if}
  {#if drawn}<div class="note-view" bind:this={viewHost}></div>{/if}
  <div class="editor-row">
    <div class="editor-host" bind:this={host}></div>
    {#if isMarkdown(path) && status === "ready" && (settings.config?.editor.properties === "panel" || ((settings.config?.editor.properties ?? "hidden") === "hidden" && propsPanel.open))}
      <PropertiesPanel text={docText} view={() => ed?.view ?? null} onopen={openLink} closable={settings.config?.editor.properties !== "panel"} />
    {/if}
  </div>
  {#if isMarkdown(path) && status !== "error" && (settings.config?.editor.backlinks ?? true)}<Backlinks {path} />{/if}
</div>

<style>
  .editor-pane { height: 100%; display: flex; flex-direction: column; background: var(--bg); position: relative; }
  .note-view { flex: 1; min-height: 0; overflow: auto; }
  .live-chip { position: absolute; z-index: 3; bottom: 10px; right: 14px; padding: 3px 10px; border-radius: 999px; pointer-events: none;
    background: var(--accent); color: var(--accent-fg, #fff); font-size: calc(12px * var(--ui-scale, 1)); }
  .mirror-chip { background: var(--bg-elev); color: var(--text-muted); border: 1px solid var(--border); opacity: .85; font: inherit; cursor: pointer; }
  .mirror-chip:hover { opacity: 1; color: var(--text); }
  .mirror-chip.down { color: var(--text-faint); border-style: dashed; }
  .drawn .editor-row, .drawn :global(.format-bar) { display: none; }
  .note-view-switch { position: absolute; top: 2px; right: 10px; z-index: 2; padding: 2px 9px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--bg); color: var(--text-muted); font-size: calc(12px * var(--ui-scale, 1)); }
  .note-view-switch:hover { color: var(--text); background: var(--bg-hover); }
  .editor-row { flex: 1; min-height: 0; display: flex; }
  .editor-host { flex: 1; min-width: 0; min-height: 0; }
  .crumbs { flex: none; display: flex; align-items: center; gap: 2px; padding: 4px 14px; min-height: 26px; overflow: hidden; white-space: nowrap;
    font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-faint); border-bottom: 1px solid var(--border); }
  .crumbs .seg { padding: 1px 4px; border-radius: 4px; color: var(--text-muted); }
  .crumbs button.seg:hover { background: var(--bg-hover); color: var(--text); }
  .crumbs .seg.file { display: inline-flex; gap: 5px; align-items: center; color: var(--text); }
  .crumbs .sep { opacity: .6; }
  .editor-host :global(.cm-editor) { height: 100%; }
  .new-file-hint { font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-faint); padding: 6px 16px 0; text-align: center; }
  .banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    padding: 8px 14px; font-size: calc(13px * var(--ui-scale, 1)); border-bottom: 1px solid var(--border); }
  .banner-warn { background: color-mix(in srgb, var(--yellow) 14%, var(--bg)); color: var(--text); }
  .banner-actions { display: flex; gap: 8px; }
</style>
