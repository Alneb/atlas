// The pane's pieces drawn the same everywhere (home.js, view.js): an element maker, a card (a book, a podcast, an
// episode, a group of them), a row of cards, and the pane's one style sheet. Colours are the app's theme variables only,
// so the light and the dark theme both hold.
import { clock } from "./abs.js";

export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/** The line under a card's title. */
export function subOf(c) {
  if (c.kind === "episode") return [c.sub, c.duration && clock(c.duration, true)].filter(Boolean).join(" · ");
  if (c.kind === "show") return [c.author, c.episodes ? `${c.episodes} episodes` : ""].filter(Boolean).join(" · ");
  if (c.cards) return `${c.cards.length} ${c.kind === "playlist" ? "items" : "books"}`;
  return [c.author, c.duration && clock(c.duration, true)].filter(Boolean).join(" · ");
}

/** One card: its cover (asked of `cover(id)` when drawn), title, line, and how far you are. `open(card)` on a click. */
export function cardEl(c, cover, open) {
  const b = el("button", `abs-card abs-card-${c.kind}`);
  b.type = "button";
  b.title = c.title;
  const pic = el("div", "abs-card-pic"), img = el("img");
  img.alt = "";
  img.loading = "lazy";
  img.hidden = true;
  const first = c.cards ? c.cards[0]?.id : c.id;
  if (first) void cover(first).then((u) => { if (u) { img.src = u; img.hidden = false; } });
  pic.append(img);
  if (c.cards) pic.append(el("span", "abs-card-count", String(c.cards.length)));
  if (c.ebook) pic.append(el("span", "abs-card-flag", "ebook"));
  if (c.progress !== undefined) {
    const bar = el("div", "abs-card-bar"), fill = el("div");
    fill.style.width = `${Math.round(c.progress * 100)}%`;
    bar.append(fill);
    pic.append(bar);
  }
  b.append(pic, el("div", "abs-card-title", c.title), el("div", "abs-card-sub", subOf(c)));
  b.onclick = () => open(c);
  return b;
}

/** A titled row of cards, scrolled sideways. */
export function rowEl(label, cards, cover, open) {
  const sec = el("section", "abs-row");
  const list = el("div", "abs-row-cards");
  list.append(...cards.map((c) => cardEl(c, cover, open)));
  sec.append(el("h3", "abs-row-title", label), list);
  return sec;
}

export function style() {
  const s = el("style");
  s.textContent = `
.abs-player { max-width: 640px; margin: 0 auto; padding: 24px 20px; display: flex; flex-direction: column; gap: 12px; color: var(--text); outline: none; }
.abs-hint { color: var(--text-muted); }
.abs-head { display: flex; gap: 16px; align-items: center; }
.abs-cover { width: 120px; height: 120px; object-fit: cover; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-alt); flex: none; }
.abs-words { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.abs-title { font-size: 1.3em; font-weight: 600; }
.abs-who, .abs-dim, .abs-left, .abs-at { color: var(--text-muted); font-size: .9em; }
.abs-chapter { color: var(--accent); font-size: .95em; }
.abs-bar { width: 100%; accent-color: var(--accent); }
.abs-times { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; }
.abs-keys { display: flex; justify-content: center; align-items: center; gap: 18px; }
.abs-btn { min-width: 56px; height: 40px; border-radius: 20px; border: 1px solid var(--border-strong); background: var(--bg-elev); color: var(--text); }
.abs-play { width: 64px; height: 64px; border-radius: 50%; border: none; background: var(--accent); color: var(--bg); font-size: 1.4em; }
.abs-opts { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
.abs-sel { padding: 4px 8px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-elev); color: var(--text); }
.abs-status { color: var(--text-muted); min-height: 1.2em; text-align: center; }
.abs-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); }
.abs-tabs button { border: none; background: none; color: var(--text-muted); padding: 8px 12px; border-bottom: 2px solid transparent; }
.abs-tabs button.on { color: var(--text); border-bottom-color: var(--accent); font-weight: 600; }
.abs-chapters, .abs-marks, .abs-episodes { list-style: none; margin: 0; padding: 0; }
.abs-chapters li button, .abs-episodes li button.abs-ep { width: 100%; text-align: left; padding: 8px 4px; border: none; border-bottom: 1px solid var(--border); background: none; color: var(--text); display: flex; justify-content: space-between; gap: 8px; }
.abs-chapters li.on button { color: var(--accent); font-weight: 600; }
.abs-ep-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.abs-episodes li.done .abs-ep-title { color: var(--text-muted); }
.abs-marks li { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px solid var(--border); }
.abs-marks li .abs-mark-go { flex: 1; min-width: 0; text-align: left; border: none; background: none; color: var(--text); display: flex; gap: 10px; }
.abs-marks li .abs-mark-at { color: var(--accent); font-variant-numeric: tabular-nums; flex: none; }
.abs-marks li .abs-mark-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.abs-mini { border: 1px solid var(--border); background: var(--bg-elev); color: var(--text-muted); border-radius: 6px; padding: 2px 8px; font-size: .85em; }
.abs-add { display: flex; gap: 6px; padding: 8px 0; }
.abs-add input, .abs-search { flex: 1; min-width: 0; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-elev); color: var(--text); }
.abs-empty { color: var(--text-muted); padding: 8px 0; }
.abs-home { padding: 16px 20px 32px; display: flex; flex-direction: column; gap: 18px; color: var(--text); }
.abs-home-bar { display: flex; gap: 8px; align-items: center; }
.abs-lib-title { margin: 8px 0 0; font-size: 1.1em; color: var(--text-muted); font-weight: 600; }
.abs-row-title { margin: 0 0 8px; font-size: 1em; font-weight: 600; }
.abs-row-cards { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; scrollbar-width: thin; }
.abs-grid { display: flex; flex-wrap: wrap; gap: 12px; }
.abs-card { flex: none; width: 128px; display: flex; flex-direction: column; gap: 4px; padding: 0; border: none; background: none; color: var(--text); text-align: left; cursor: pointer; }
.abs-card-pic { position: relative; width: 128px; height: 128px; border-radius: 8px; overflow: hidden; background: var(--bg-alt); border: 1px solid var(--border); }
.abs-card-pic img { width: 100%; height: 100%; object-fit: cover; display: block; }
.abs-card-count, .abs-card-flag { position: absolute; top: 6px; right: 6px; background: var(--bg-elev); color: var(--text); border-radius: 10px; padding: 0 7px; font-size: .78em; border: 1px solid var(--border); }
.abs-card-flag { right: auto; left: 6px; }
.abs-card-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: var(--border); }
.abs-card-bar > div { height: 100%; background: var(--accent); }
.abs-card-title { font-size: .9em; font-weight: 600; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.abs-card-sub { font-size: .8em; color: var(--text-muted); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.abs-card:focus-visible .abs-card-pic { outline: 2px solid var(--accent); }
.abs-sheet-head { display: flex; gap: 10px; align-items: center; }
.abs-sheet-head h3 { margin: 0; }
.abs-authors { display: flex; flex-wrap: wrap; gap: 6px; }
.abs-stats { display: flex; flex-direction: column; gap: 12px; }
.abs-stat-tiles { display: flex; gap: 12px; flex-wrap: wrap; }
.abs-stat { padding: 10px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-elev); min-width: 120px; }
.abs-stat b { display: block; font-size: 1.3em; font-variant-numeric: tabular-nums; }
.abs-stat span { color: var(--text-muted); font-size: .85em; }
.abs-days { display: flex; align-items: flex-end; gap: 6px; height: 96px; }
.abs-day { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; }
.abs-day > div { width: 100%; max-width: 28px; background: var(--accent); border-radius: 4px 4px 0 0; min-height: 1px; }
.abs-day > span { font-size: .75em; color: var(--text-muted); }
.abs-top li { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--border); }
.abs-top { list-style: none; margin: 0; padding: 0; }
.abs-read { display: flex; gap: 8px; align-items: center; justify-content: center; flex-wrap: wrap; }
`;
  return s;
}
