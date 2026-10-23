<script lang="ts">
  // The other device's version of a note that Syncthing kept beside it (`name.sync-conflict-<date>-<time>-<device>.md`)
  // and the core could not merge: both changed the same lines (core sync_merge.rs; DESIGN-mirror-v2.md §4). Said on the
  // note, with the three ways out: look at it beside this one, keep this one, or take the other.
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { on } from "../lib/bus";
  import { openPath } from "../lib/dock";
  import { readText } from "../lib/vault-files";
  import { shownPath } from "../lib/paths";
  import { toast } from "../lib/state.svelte";
  import { errText } from "../lib/text";

  let { path, take }: { path: string; take: (text: string) => void } = $props();

  let copies = $state<string[]>([]);
  const dir = $derived(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
  /** `notes/log.md` → the pattern of its copies' names (`log.sync-conflict-20261020-231529-H3IIIUW.md`). */
  const pattern = $derived.by(() => {
    const name = path.slice(path.lastIndexOf("/") + 1), dot = name.lastIndexOf(".");
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${esc(stem)}\\.sync-conflict-\\d{8}-\\d{6}-[A-Za-z0-9]+${esc(ext)}$`);
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Looked for a moment after a change: the core merges most copies at once, and those need no word. */
  function look(after = 2000) {
    clearTimeout(timer);
    timer = setTimeout(() => void api.tree(dir).then((l) => { copies = l.filter((e) => e.kind === "file" && pattern.test(e.name)).map((e) => e.path); }, () => {}), after);
  }

  async function keepThis(copy: string) {
    try { await api.trash(copy); copies = copies.filter((c) => c !== copy); } catch (e) { toast(`Could not remove ${shownPath(copy)}`, errText(e), "error"); }
  }
  async function takeOther(copy: string) {
    const text = await readText(copy);
    if (text === null) return toast(`Could not read ${shownPath(copy)}`, "", "error");
    take(text);
    await keepThis(copy);
  }

  onMount(() => {
    look(0);
    const off = on("fs", (e) => { if (e.paths.some((p) => pattern.test(p.slice(p.lastIndexOf("/") + 1)))) look(); });
    return () => { off(); clearTimeout(timer); };
  });
</script>

{#each copies as copy (copy)}
  <div class="banner banner-warn" role="alert" data-testid="sync-copy">
    <span>Another device changed the same lines of this note while the two were apart. Its version is kept as <strong>{shownPath(copy)}</strong>.</span>
    <span class="banner-actions">
      <button class="btn btn-ghost" onclick={() => openPath(copy, undefined, { beside: true })}>Show it beside</button>
      <button class="btn btn-ghost" onclick={() => void keepThis(copy)} title="The other version goes to the trash">Keep this one</button>
      <button class="btn primary" onclick={() => void takeOther(copy)} title="This note's text becomes the other version's; the copy goes to the trash">Take the other</button>
    </span>
  </div>
{/each}
