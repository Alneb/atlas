<script lang="ts">
  // A note (or a piece of markdown text) shown rendered inside a page; "open as a tab" edits the note.
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import { on } from "../../lib/bus";
  import Markdown from "../Markdown.svelte";

  // `section`: only that heading and what is under it (`![[Note#Heading]]`, as Obsidian embeds it)
  let { path = "", text = "", doc = "", section = "" }: { path?: string; text?: string; doc?: string; section?: string } = $props();
  let body = $state("");
  const load = () => api.file(path).then((f) => { body = section ? sectionOf(f.text, section) : f.text; }, () => { body = `*No ${path} yet — open this block as a tab to write it.*`; });

  /** The heading named `name` (any level, compared without case) to the next heading of its level or above; the
   *  whole text when there is no such heading. */
  function sectionOf(md: string, name: string): string {
    const lines = md.split("\n"), want = name.trim().toLowerCase();
    const at = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.replace(/^#+\s+/, "").trim().toLowerCase() === want);
    if (at < 0) return md;
    const level = /^#+/.exec(lines[at])![0].length;
    const end = lines.findIndex((l, i) => i > at && /^#{1,6}\s/.test(l) && /^#+/.exec(l)![0].length <= level);
    return lines.slice(at, end < 0 ? undefined : end).join("\n");
  }

  onMount(() => {
    if (!path) return;
    void load();
    return on("fs", (e) => { if (e.paths.includes(path)) void load(); });
  });
</script>

<Markdown text={path ? body : text} path={path || doc} />
