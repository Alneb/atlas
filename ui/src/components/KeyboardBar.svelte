<script lang="ts">
  // The phone's row above the keyboard while a note is being typed in: what a touch keyboard lacks (Tab and Shift+Tab,
  // undo, [[, the formatting keys) and what a phone adds (a photo, dictation), each the same function as on the
  // desktop (lib/editor/md-format.ts, the editor's attach path). It sits in the shell's column, so the note above it
  // shrinks and the caret is never under it; the bottom tab bar gives way while it shows.
  import { onMount } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { indentLess, indentMore, redo, undo } from "@codemirror/commands";
  import { formatNote } from "../lib/editor/md-format";
  import { attachAt } from "../lib/editor/note-extensions";
  import type { MdFormat } from "../lib/registry";
  import type { IconName } from "../lib/panes";
  import { keyboard, keyboardBar } from "../lib/phone.svelte";
  import Icon from "./Icon.svelte";

  type Bridge = { dictate?(): void };
  type Speech = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; start(): void };
  const native = () => (globalThis as unknown as { AtlasNative?: Bridge }).AtlasNative;
  const Recognition = (globalThis as unknown as { SpeechRecognition?: new () => Speech; webkitSpeechRecognition?: new () => Speech });
  const SpeechCtor = Recognition.SpeechRecognition ?? Recognition.webkitSpeechRecognition;
  const canDictate = typeof native()?.dictate === "function" || !!SpeechCtor;

  /** The note being typed in (kept while a photo is picked or words dictated, which take the focus away). */
  let view: EditorView | null = null;
  let picker = $state<HTMLInputElement>();
  let listening = $state(false);

  const noteOf = (el: Element | null) => el?.closest<HTMLElement>(".cm-editor.live-cm") ?? null;

  onMount(() => {
    const focusIn = (e: FocusEvent) => {
      const ed = noteOf(e.target as Element);
      if (!ed) return;
      view = EditorView.findFromDOM(ed);
      focused = !!view;
    };
    // a tap elsewhere hides it; the bar's own buttons never take the focus (pointerdown is stopped)
    const focusOut = () => setTimeout(() => { if (!noteOf(document.activeElement)) focused = false; }, 0);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    return () => { document.removeEventListener("focusin", focusIn); document.removeEventListener("focusout", focusOut); focused = false; keyboardBar.on = false; };
  });

  /** Shown while a note has the focus and the keyboard is up: Back on Android hides the keyboard and leaves the focus
   *  where it was, which left the row on screen with nothing under it. */
  let focused = $state(false);
  $effect(() => { keyboardBar.on = focused && keyboard.up; });
  // the keyboard came up (or the window changed under it): the caret back in sight, above the row
  $effect(() => {
    if (!keyboardBar.on || !view) return;
    const v = view;
    requestAnimationFrame(() => v.dispatch({ effects: EditorView.scrollIntoView(v.state.selection.main.head, { y: "nearest", yMargin: 24 }) }));
  });

  /** Runs `fn` on the note and gives it the keyboard back. */
  function on(fn: (v: EditorView) => unknown) {
    if (!view) return;
    fn(view);
    view.focus();
  }

  type Key = { icon: IconName; label: string; run: () => void };
  const fmt = (kind: MdFormat) => () => on((v) => formatNote(v, kind));
  const KEYS: Key[] = [
    { icon: "undo", label: "Undo", run: () => on(undo) },
    { icon: "redo", label: "Redo", run: () => on(redo) },
    { icon: "outdent", label: "Outdent", run: () => on(indentLess) },
    { icon: "indent", label: "Indent", run: () => on(indentMore) },
    { icon: "list-todo", label: "To-do (again: done)", run: fmt("task") },
    { icon: "list", label: "List", run: fmt("bullet") },
    { icon: "heading", label: "Heading (again: a smaller one, then none)", run: fmt("heading") },
    { icon: "bold", label: "Bold", run: fmt("bold") },
    { icon: "italic", label: "Italic", run: fmt("italic") },
    // `[[` opens the note picker as typing it does
    { icon: "brackets", label: "Link to a note", run: () => on((v) => v.dispatch(v.state.replaceSelection("[["), { userEvent: "input.type" })) },
    { icon: "link", label: "Web link", run: fmt("link") },
  ];

  function photo() {
    if (!picker) return;
    picker.value = "";
    picker.click();
  }

  async function picked() {
    const files = [...(picker?.files ?? [])];
    const v = view;
    const path = v?.dom.closest<HTMLElement>(".cm-editor.live-cm")?.dataset.note;
    if (!v || !path || !files.length) return;
    await attachAt(v, path, files, v.state.selection.main.head);
    v.focus();
  }

  /** Words said, typed at the caret with a space before them when the text needs one. */
  function said(text: string) {
    listening = false;
    const v = view;
    if (!v || !text.trim()) return;
    const at = v.state.selection.main.from;
    const before = v.state.sliceDoc(Math.max(0, at - 1), at);
    v.dispatch(v.state.replaceSelection((before && !/\s/.test(before) ? " " : "") + text.trim()), { userEvent: "input.type", scrollIntoView: true });
    v.focus();
  }

  function dictate() {
    const bridge = native();
    listening = true;
    if (typeof bridge?.dictate === "function") {
      // the phone app: Android's speech recognizer, answered through atlasDictated (AtlasActivity)
      (globalThis as unknown as { atlasDictated?: (t: string) => void }).atlasDictated = said;
      bridge.dictate();
      return;
    }
    if (!SpeechCtor) return;
    const r = new SpeechCtor();
    r.lang = document.documentElement.lang || navigator.language;
    r.interimResults = false;
    r.onresult = (e) => said(e.results[0]?.[0]?.transcript ?? "");
    r.onerror = () => { listening = false; };
    r.start();
  }
</script>

{#if keyboardBar.on}
  <div class="kbar" role="toolbar" aria-label="Typing" data-testid="keyboard-bar">
    <div class="keys">
      {#each KEYS as k (k.label)}
        <!-- pointerdown and mousedown stopped: the note keeps the focus, so the keyboard stays up -->
        <button onpointerdown={(e) => e.preventDefault()} onmousedown={(e) => e.preventDefault()} onclick={k.run} aria-label={k.label} title={k.label}><Icon name={k.icon} size={20} /></button>
      {/each}
      <button onpointerdown={(e) => e.preventDefault()} onmousedown={(e) => e.preventDefault()} onclick={photo} aria-label="Add a photo" title="Add a photo"><Icon name="camera" size={20} /></button>
      {#if canDictate}
        <button class:on={listening} onpointerdown={(e) => e.preventDefault()} onmousedown={(e) => e.preventDefault()} onclick={dictate} aria-label="Dictate" title="Dictate"><Icon name="mic" size={20} /></button>
      {/if}
    </div>
    <button class="done" onpointerdown={(e) => e.preventDefault()} onclick={() => view?.contentDOM.blur()} aria-label="Hide the keyboard" title="Hide the keyboard"><Icon name="keyboard-down" size={20} /></button>
    <input bind:this={picker} type="file" accept="image/*" hidden onchange={picked} />
  </div>
{/if}

<style>
  /* one row, the keyboard's own height of key (48 px targets); what does not fit scrolls sideways, the Hide key stays */
  .kbar { flex: none; display: flex; align-items: stretch; height: 48px; background: var(--bg-elev); border-top: 1px solid var(--border); }
  .keys { flex: 1; min-width: 0; display: flex; overflow-x: auto; scrollbar-width: none; }
  .keys::-webkit-scrollbar { display: none; }
  button { flex: none; width: 48px; height: 48px; display: grid; place-items: center; padding: 0; border: 0; background: none; color: var(--text-muted); border-radius: 0; }
  button:active { background: var(--bg-hover); color: var(--text); }
  button.on { color: var(--accent); }
  .done { border-left: 1px solid var(--border); }
  button:focus:not(:focus-visible) { outline: none; }
</style>
