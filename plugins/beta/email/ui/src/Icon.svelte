<script lang="ts" module>
  // Line icons on a 24 px grid, drawn with the text's colour (no emoji, UI-STYLE §8).
  export const PATHS: Record<string, string> = {
    inbox: "M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6z",
    star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z",
    clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
    send: "M21 3L10 14M21 3l-7 18-4-7-7-4z",
    draft: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
    archive: "M3 4h18v4H3zM5 8v12h14V8M10 12h4",
    trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
    spam: "M12 3l9 16H3zM12 10v4M12 17v.5",
    folder: "M3 6h6l2 2h10v11H3z",
    label: "M3 12V4h8l10 10-8 8z M7.5 8.5h.01",
    all: "M4 6h16M4 12h16M4 18h16",
    attach: "M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7",
    search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5",
    reply: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 6 6v5",
    replyall: "M7 14L2 9l5-5M12 14L7 9l5-5M7 9h7a6 6 0 0 1 6 6v5",
    forward: "M15 14l5-5-5-5M20 9H10a6 6 0 0 0-6 6v5",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    pen: "M4 20h4L19 9l-4-4L4 16z",
    check: "M4 12l5 5L20 6",
    x: "M6 6l12 12M18 6L6 18",
    back: "M15 18l-6-6 6-6",
    down: "M6 9l6 6 6-6",
    right: "M9 6l6 6-6 6",
    note: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
    refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
    filter: "M3 5h18l-7 8v6l-4 2v-8z",
    gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z",
    calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
    image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01",
    unread: "M4 6h16v12H4zM4 7l8 6 8-6",
    read: "M3 10l9-6 9 6v9H3zM3 10l9 6 9-6",
    menu: "M4 6h16M4 12h16M4 18h16",
    plus: "M12 5v14M5 12h14",
    layout: "M3 4h18v16H3zM9 4v16M9 12h12",
    person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
    news: "M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5",
    bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
    open: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
    lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
    save: "M12 4v11M7 10l5 5 5-5M5 20h14",
    keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  };
</script>

<script lang="ts">
  let { name, size = 16, title = "", filled = false }: { name: string; size?: number; title?: string; filled?: boolean } = $props();
</script>

<svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined} aria-label={title || undefined}>
  <path d={PATHS[name] ?? PATHS.folder} />
</svg>

<style>
  .icon { flex: none; display: block; }
</style>
