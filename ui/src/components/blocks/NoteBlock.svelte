<script lang="ts">
  // A note (or a piece of markdown text) shown rendered inside a page; "open as a tab" edits the note.
  import { onMount } from "svelte";
  import { reloadOnChange } from "../../lib/reload-on-change";
  import { sectionOf } from "../../lib/note-anchor";
  import { api } from "../../lib/api";
  import Markdown from "../Markdown.svelte";

  // `section`: only that heading and what is under it (`![[Note#Heading]]`, as Obsidian embeds it)
  let { path = "", text = "", doc = "", section = "" }: { path?: string; text?: string; doc?: string; section?: string } = $props();
  let body = $state("");
  const load = () => api.file(path).then((f) => { body = section ? sectionOf(f.text, section) : f.text; }, () => { body = `*No ${path} yet — open this block as a tab to write it.*`; });

  onMount(() => {
    if (!path) return;
    void load();
    return reloadOnChange(() => void load(), { wait: 0, wants: (p) => p === path });
  });
</script>

<Markdown text={path ? body : text} path={path || doc} />
