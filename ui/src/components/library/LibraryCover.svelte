<script lang="ts">
  // An item's picture: an address as is, a vault picture (a path or a `[[name]]`, found as links are) as a thumbnail, a
  // PDF as its first page — asked only when it comes near the view (a shelf of hundreds asks for what is seen). Without
  // one, a tile tinted by the title with its first letter, so items without covers still read as covers.
  import { pdfThumbUrl, thumbUrl } from "../../lib/raw";
  import type { LibraryItem } from "../../lib/library";

  let { cover, title, big = false }: { cover: LibraryItem["cover"]; title: string; big?: boolean } = $props();
  let url = $state<string | null>(null);
  let box = $state<HTMLElement>();

  async function resolve(c: LibraryItem["cover"]): Promise<string | null> {
    const raw = typeof c === "function" ? await c() : c;
    if (!raw) return null;
    if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
    const name = raw.replace(/^!?\[\[|\]\]$/g, "").split("|")[0];
    const path = (await import("../../lib/vault")).resolveLink(name, "") ?? name;
    return /\.pdf$/i.test(path) ? pdfThumbUrl(path, big ? 520 : 260) : thumbUrl(path, big ? 520 : 260);
  }

  $effect(() => {
    const c = cover, el = box;
    if (!el) return;
    let live = true;
    url = null;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      void resolve(c).then((u) => { if (live) url = u; }, () => {});
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
  });
  const initial = $derived(title.replace(/[^\p{L}\p{N}]/gu, "").charAt(0).toUpperCase() || "?");
  const hue = $derived([...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
</script>

<div class="wrap" class:big bind:this={box}>
  {#if url}
    <img class="cover" class:big src={url} alt="" />
  {:else if !big}
    <div class="cover tile" aria-hidden="true" style:--hue={hue}>{initial}</div>
  {/if}
</div>

<style>
  .cover { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: var(--radius-sm); background: var(--bg-alt); box-shadow: 0 1px 3px rgba(0, 0, 0, .2); }
  .cover.big { aspect-ratio: auto; max-height: 280px; width: auto; max-width: 100%; margin-bottom: 10px; }
  .tile { display: grid; place-items: center; font-size: 2.2em; font-weight: 600; box-shadow: none;
    background: hsl(var(--hue) 32% 50% / .22); color: hsl(var(--hue) 40% 42%); }
  .wrap { width: 100%; min-height: 1px; }
</style>
