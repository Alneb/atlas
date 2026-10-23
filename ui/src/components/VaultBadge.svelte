<script lang="ts">
  // The badge atop the rail and the sidebar: the open vault's initial, so two windows on two vaults tell apart at a glance. Atlas's own mark is the app icon (packaging/icon/).
  import { app } from "../lib/state.svelte";

  let { size = 28 }: { size?: number } = $props();

  const name = $derived(app.workspace?.name ?? "Atlas");
  // the first letter or digit ("~notes" → N), else the first character; a grapheme, so an emoji name stays whole
  const initial = $derived.by(() => {
    const chars = [...new Intl.Segmenter().segment(name.trim())].map((s) => s.segment);
    return (chars.find((c) => /[\p{L}\p{N}]/u.test(c)) ?? chars[0] ?? "A").toLocaleUpperCase();
  });
</script>

<div class="badge" title={name} style:--size="{size}px" data-testid="vault-badge">{initial}</div>

<style>
  .badge { width: var(--size); height: var(--size); border-radius: calc(var(--size) * .29); display: grid; place-items: center; flex: none;
    font-weight: 700; font-size: calc(var(--size) * .5 * var(--ui-scale, 1)); letter-spacing: -.02em; user-select: none;
    color: var(--bg); background: linear-gradient(135deg, var(--accent-strong), var(--accent) 55%, var(--purple));
    box-shadow: 0 2px 10px color-mix(in srgb, var(--accent) 32%, transparent); }
</style>
