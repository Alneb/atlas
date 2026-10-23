// A day's log in reading view (the Home log card) as the editor draws it (editor/log-lines.ts): each `HH:MM text` item
// gets its time in a muted column and loses its bullet; pictures under it are thumbnails (styled in TodayParts.svelte).
const TIME = /^\s*(\d{1,2}:\d{2})(?= )/;

/** Marks the log entries of rendered markdown: `li.log-entry` with its time in `span.log-time`. Idempotent. */
export function markLogEntries(root: HTMLElement): void {
  for (const li of root.querySelectorAll<HTMLLIElement>("li:not(.log-entry)")) {
    // the first text of the item, past a task's box
    let node = li.firstChild;
    while (node && node.nodeType !== Node.TEXT_NODE && (node as Element).matches?.("input, label")) node = node.nextSibling;
    if (node?.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === "P") node = node.firstChild; // a loose list
    if (!node || node.nodeType !== Node.TEXT_NODE) continue;
    const m = TIME.exec(node.textContent ?? "");
    if (!m) continue;
    const text = node as Text;
    const rest = text.splitText(m[0].length);
    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = m[1];
    text.replaceWith(time);
    rest.textContent = rest.textContent?.replace(/^ /, "") ?? "";
    li.classList.add("log-entry");
    li.parentElement?.classList.add("log-entries");
  }
  // the log's other items (a to-do written in it) line up with the entries, without a time
  for (const li of root.querySelectorAll<HTMLLIElement>("ul.log-entries > li:not(.log-entry)")) li.classList.add("log-entry", "log-untimed");
  // a bare address on one line, cut with "…" (the link keeps all of it): a DOI's URL wrapped mid-path otherwise
  for (const a of root.querySelectorAll<HTMLAnchorElement>("li.log-entry a[href]")) if (/^\w+:\/\//.test(a.textContent ?? "")) { a.classList.add("log-url"); a.title ||= a.href; }
}
