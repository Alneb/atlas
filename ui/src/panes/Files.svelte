<script lang="ts">
  // File tree over /api/tree, lazily expanded; open folders refresh on fs events.
  import { VAULT_DRAG } from "../lib/explorer/drag";
  import { dirOf } from "../lib/paths";
  import { atPointer, type MenuAt } from "../lib/menu";
  import { errText } from "../lib/text";
  import { onMount, untrack } from "svelte";
  import { api } from "../lib/api";
  import { onFilesAddedOrRemoved } from "../lib/vault";
  import { app } from "../lib/state.svelte";
  import { toggleShowAll, treeView } from "../lib/tree-view.svelte";
  import type { TreeEntry } from "../lib/types";
  import type { PaneProps } from "../lib/dock";
  import FileTree from "../components/FileTree.svelte";
  import { onGitWorthyChange, refreshGitTree } from "../lib/gitstatus.svelte";
  import { revealPath } from "../lib/file-tree.svelte";
  import { revealItems } from "../lib/reveal-items";
  import ContextMenu, { type MenuItem } from "../components/ContextMenu.svelte";
  import { pluginMenu } from "../lib/plugin-menus";
  import InputDialog from "../components/InputDialog.svelte";
  import { open, openPath } from "../lib/dock";
  import { movedTabs } from "../lib/gone-files";
  import { openWith } from "../lib/actions";
  import { toast } from "../lib/state.svelte";
  import Icon from "../components/Icon.svelte";
  import { editors, lastEditorId, openIntent } from "../lib/registry";
  import { phone } from "../lib/phone.svelte";
  import PhoneFiles from "../components/PhoneFiles.svelte";

  let { panel: _panel }: PaneProps<"files"> = $props();
  let roots = $state<TreeEntry[]>([]);
  let error = $state("");
  let version = $state(0);

  // --- managing files: menu, dialogs ------------------------------------------------------------
  let menu = $state<MenuAt | null>(null);
  let dialog = $state<{ title: string; value?: string; hint?: string; confirm?: string; submit: (v: string) => void } | null>(null);
  const parentOf = dirOf;
  const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
  const fail = (what: string) => (e: unknown) => toast(what, e instanceof Error && /409/.test(e.message) ? "Something with that name already exists." : errText(e), "error");

  function newFile(dir: string) {
    dialog = { title: dir ? `New file in ${dir}/` : "New file", hint: "No extension → a note (.md)", submit: async (name) => {
      const path = join(dir, /\.[a-z0-9]+$/i.test(name) ? name : `${name}.md`);
      const exists = await api.file(path).then(() => true, () => false);
      if (exists) { toast("Could not create the file", "Something with that name already exists.", "error"); return; }
      try { await api.putFile(path, ""); openPath(path); } catch (e) { fail("Could not create the file")(e); }
    } };
  }
  function newFolder(dir: string) {
    dialog = { title: dir ? `New folder in ${dir}/` : "New folder", submit: (name) => void api.mkdir(join(dir, name)).catch(fail("Could not create the folder")) };
  }
  /** Move or rename; the tabs that showed it follow to the new place (the old ones close: gone-files.ts). */
  async function moveTo(from: string, to: string): Promise<void> {
    const follow = movedTabs(from, to);
    await api.move(from, to);
    for (const p of follow) openPath(p);
  }
  // the row a dialog was about: the keyboard goes back to it when the dialog closes (its new name after a rename)
  let tree = $state<ReturnType<typeof FileTree>>();
  let backTo = "";
  function rename(path: string) {
    backTo = path;
    const name = path.split("/").pop() ?? path;
    dialog = { title: `Rename ${name}`, value: name, submit: (to) => {
      if (to === name) return;
      backTo = join(parentOf(path), to);
      void moveTo(path, backTo).then(() => setTimeout(() => tree?.refocus(backTo), 300), fail("Could not rename"));
    } };
  }
  function remove(path: string) {
    dialog = { title: `Move “${path}” to the Trash?`, confirm: "Move to Trash", hint: "Recoverable from the Trash.", submit: async () => {
      try { const r = await api.trash(path); toast("Moved to " + r.to, path); } catch (e) { fail("Could not delete")(e); }
    } };
  }
  function onContext(e: MouseEvent) {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".row[data-path]");
    e.preventDefault();
    const path = row?.dataset.path ?? "";
    const isDir = !row || row.classList.contains("is-dir");
    const dir = isDir ? path : parentOf(path);
    const items: MenuItem[] = [
      { label: "New file…", icon: "file", run: () => newFile(dir) },
      { label: "New folder…", icon: "folder", run: () => newFolder(dir) },
    ];
    items.push(...revealItems(path || dir, isDir));
    if (path && !isDir) items.push("sep", { label: "Open with…", icon: "plugin", run: () => openWith(path) });
    if (path) items.push("sep",
      { label: "Rename…", icon: "edit", hint: "F2", run: () => rename(path) },
      { label: "Copy path", icon: "copy", run: () => void navigator.clipboard.writeText(path).then(() => toast("Copied", path)) },
      "sep",
      { label: "Delete…", icon: "close", hint: "Del", danger: true, run: () => remove(path) });
    items.push(...pluginMenu("file", { path: path || dir, dir: isDir }));
    menu = atPointer(e, items);
  }
  // --- drag a row onto a folder (or the empty tree = the root) to move it --------------------------
  let dropDir = $state<string | null>(null);
  let treeEl = $state<HTMLElement>(); // absent on a phone (PhoneFiles)
  // the folder that would receive the drop is outlined (TreeNode stays unaware of drags)
  $effect(() => {
    treeEl?.querySelectorAll(".row.drop-into").forEach((r) => r.classList.remove("drop-into"));
    if (dropDir) treeEl?.querySelector(`.row[data-path="${CSS.escape(dropDir)}"]`)?.classList.add("drop-into");
  });
  const rowOf = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>(".row[data-path]");
  const dirAt = (row: HTMLElement | null) => (!row ? "" : row.classList.contains("is-dir") ? row.dataset.path! : parentOf(row.dataset.path!));
  function onDragStart(e: DragEvent) {
    const path = rowOf(e)?.dataset.path;
    if (!path || !e.dataTransfer) return;
    e.dataTransfer.setData(VAULT_DRAG, path);
    e.dataTransfer.setData("text/plain", path); // dropped on a terminal or a note: the path
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes(VAULT_DRAG)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    dropDir = dirAt(rowOf(e));
  }
  function onDrop(e: DragEvent) {
    const from = e.dataTransfer?.getData(VAULT_DRAG);
    const dir = dirAt(rowOf(e));
    dropDir = null;
    if (!from) return;
    e.preventDefault();
    // no-ops: the same folder, or a folder into itself / its own subfolder
    if (parentOf(from) === dir || dir === from || dir.startsWith(from + "/")) return;
    const to = join(dir, from.split("/").pop()!);
    moveTo(from, to).then(() => toast("Moved", `${from} → ${to}`), fail("Could not move"));
  }

  function onKey(e: KeyboardEvent) {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".row[data-path]");
    if (!row?.dataset.path) return;
    if (e.key === "F2") { e.preventDefault(); rename(row.dataset.path); }
    else if (e.key === "Delete") { e.preventDefault(); remove(row.dataset.path); }
  }

  async function refresh() {
    try { roots = await api.tree(undefined, treeView.showAll); error = ""; }
    catch (err) { error = errText(err); }
    version++;
    // a page nobody looks at (a phone in a pocket, a background tab) asks git nothing: caught up when shown (below)
    if (!document.hidden) void refreshGitTree();
  }

  // "Show hidden files" (here or in an explorer tab): the dotfiles fetched too, or dropped again
  let showAllSeen = untrack(() => treeView.showAll);
  $effect(() => { if (treeView.showAll !== showAllSeen) { showAllSeen = treeView.showAll; void refresh(); } });

  onMount(() => {
    void refresh();
    // the tree shows names only: a save of a file it already lists changes nothing in it (git marks follow on their own)
    const off = onFilesAddedOrRemoved(refresh, 500);
    const offGit = onGitWorthyChange(() => void refreshGitTree(), () => !!treeEl?.offsetParent);
    // commits and stages touch only .git (no fs event): re-read status when the window regains focus
    const onFocus = () => void refreshGitTree();
    window.addEventListener("focus", onFocus);
    const onShown = () => { if (!document.hidden) void refreshGitTree(); };
    document.addEventListener("visibilitychange", onShown);
    // the tree follows the active file (FileTree scrolls to it while shown)
    const onActive = (e: Event) => revealPath((e as CustomEvent<string>).detail);
    window.addEventListener("atlas-active-file", onActive);
    // opened after the file: the event is gone — reveal the file you were last in
    const last = lastEditorId();
    const p = openIntent.path || (last ? editors.get(last)?.path : undefined); // the file asked for last
    if (p) onActive(new CustomEvent("atlas-active-file", { detail: p }));
    return () => { off(); offGit(); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onShown); window.removeEventListener("atlas-active-file", onActive); };
  });
</script>

{#if phone.on}
  <PhoneFiles oncontext={onContext} onnewfile={newFile} onnewfolder={newFolder} />
{:else}
<div class="side-pane">
  <div class="side-head">
    <span class="side-title">{app.workspace?.name ?? "Files"}</span>
    <span class="head-btns">
      <button class="icon-btn" title="New file" aria-label="New file" onclick={() => newFile("")}><Icon name="plus" size={14} /></button>
      <button class="icon-btn" title="New folder" aria-label="New folder" onclick={() => newFolder("")}><Icon name="folder" size={14} /></button>
      <button class="icon-btn" title="The explorer: a big list, SSH hosts and servers too" aria-label="Open the explorer" onclick={() => open({ kind: "explorer", source: "vault", place: "" })}><Icon name="folder-open" size={14} /></button>
      <button class="icon-btn" class:on={treeView.showAll} title={treeView.showAll ? "Hide the companions again (attachments, ink, data notes)" : "Show hidden files: companions, attachments, ink"} aria-label="Show hidden files" aria-pressed={treeView.showAll} onclick={toggleShowAll}><Icon name="eye" size={14} /></button>
      <button class="icon-btn" title="Refresh" aria-label="Refresh" onclick={refresh}><Icon name="refresh" size={14} /></button>
    </span>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scroll tree" bind:this={treeEl} class:drop-root={dropDir === ""} oncontextmenu={onContext} onkeydown={onKey}
    ondragstart={onDragStart} ondragover={onDragOver} ondragleave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dropDir = null; }} ondrop={onDrop} ondragend={() => (dropDir = null)}>
    {#if error}<p class="faint small pad">{error}</p>{/if}
    <FileTree bind:this={tree} {roots} {version} scroller={treeEl} />
  </div>
</div>
{/if}
{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}
{#if dialog}<InputDialog title={dialog.title} value={dialog.value} hint={dialog.hint} confirm={dialog.confirm}
  onsubmit={(v) => { const d = dialog!; dialog = null; d.submit(v); }} oncancel={() => { dialog = null; if (backTo) tree?.refocus(backTo); }} />{/if}

<style>
  .head-btns { display: inline-flex; gap: 2px; }
  .tree { flex: 1; min-height: 0; overflow: auto; padding: 2px 6px 16px; }
  .pad { padding: 8px 10px; }
  .tree.drop-root { box-shadow: inset 0 0 0 1px var(--accent); }
  .tree :global(.row.drop-into) { box-shadow: inset 0 0 0 1px var(--accent); background: var(--bg-hover); }
</style>
