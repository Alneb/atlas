// Audiobooks — the player's pane (docs/design/DESIGN-audiobooks.md): a book of Audiobookshelf played from where you
// were, its chapters, ±30 s, speed, a sleep timer. The playing itself is the app's one player (`atlas.player`), outside
// this pane: closing the pane does not stop the book, a second book replaces the first, and on the phone it plays on
// with the screen off (the lock screen and a headset control it). Where you are goes to the server from the player's
// reports — the core calls the helper's `progress` (`[media] progress`), every 15 s, on pause and on close — so the
// phone, the desktop and Audiobookshelf's own apps carry on from each other. A book's audio may be several files
// (tracks), laid over the book's time by their start offsets. Opened with no book: the home (home.js) — the server's
// shelves, its search, your collections and playlists; opened on a podcast: its episodes (podcast.js), an episode
// playing here as a book does. The pane's argument: shelf.js `argOf`.
import { abs, clock } from "./abs.js";
import { argOf } from "./shelf.js";
import { el, style } from "./cards.js";
import { home } from "./home.js";
import { bookmarks } from "./bookmarks.js";
import { readAlong } from "./readalong.js";
import { podcast } from "./podcast.js";
import { forget, keep, keptOf, rememberPlace } from "./keep.js";
import { SPEEDS, keepSpeed, keptSpeed, playBook } from "./play.js";
const SLEEPS = [["off", 0], ["end of chapter", -1], ["15 min", 15], ["30 min", 30], ["60 min", 60]];

export default function mount(host, atlas) {
  const root = el("div", "abs-player");
  host.append(style(), root);
  const a = abs(atlas), P = atlas.player;
  const where = argOf(atlas.arg);
  if (where.kind === "home" && a.on) {
    // no book: the server's shelves, its search, your listening (home.js)
    const h = home(root, atlas, a);
    return () => h.dispose();
  }
  if (where.kind === "show" && a.on) {
    podcast(root, atlas, a, where.item); // a podcast: its episodes (podcast.js)
    return () => {};
  }
  if (!a.on) {
    const hint = el("p", "abs-hint", "Set your Audiobookshelf's address and API token in the plugin's settings. "), b = el("button", "atlas-btn", "Settings…");
    b.onclick = () => atlas.plugin.openSettings();
    hint.append(b);
    root.append(hint);
    return () => {};
  }
  const skip = Number(atlas.plugin.settings?.skip) || 30;
  // what this pane plays: a book, or one episode of a podcast (shelf.js argOf)
  const item = where.item, episode = where.kind === "episode" ? where.episode : undefined;
  /** The player's state when it plays this book (or episode), else null (another one, or nothing). */
  const mine = (s = P.state()) => (s && s.plugin === atlas.plugin.id && s.key?.item === item && (s.key?.episode ?? undefined) === episode ? s : null);

  const cover = el("img", "abs-cover"), title = el("div", "abs-title"), who = el("div", "abs-who"), chapter = el("div", "abs-chapter");
  cover.alt = "";
  cover.hidden = true; // shown once the book has one
  const bar = el("input", "abs-bar");
  Object.assign(bar, { type: "range", min: "0", step: "1", value: "0" });
  bar.setAttribute("aria-label", "Where in the book");
  const at = el("span", "abs-at", "0:00"), left = el("span", "abs-left", "");
  const back = el("button", "abs-btn", `−${skip}`), play = el("button", "abs-play", "▶"), fwd = el("button", "abs-btn", `+${skip}`);
  back.setAttribute("aria-label", `Back ${skip} seconds`); fwd.setAttribute("aria-label", `Forward ${skip} seconds`); play.setAttribute("aria-label", "Play");
  const speed = el("select", "abs-sel"), sleep = el("select", "abs-sel");
  speed.setAttribute("aria-label", "Speed"); sleep.setAttribute("aria-label", "Sleep timer");
  for (const s of SPEEDS) speed.append(Object.assign(el("option", "", `${s}×`), { value: String(s) }));
  for (const [label, v] of SLEEPS) sleep.append(Object.assign(el("option", "", `sleep: ${label}`), { value: String(v) }));
  speed.value = String(keptSpeed());
  const list = el("ol", "abs-chapters");
  // the lower half: the chapters or the bookmarks
  const tabs = el("div", "abs-tabs"), chTab = el("button", "on", "Chapters"), bmTab = el("button", "", "Bookmarks"), marks = el("div", "abs-marks-tab");
  tabs.setAttribute("role", "tablist");
  for (const t of [chTab, bmTab]) t.setAttribute("role", "tab");
  bmTab.hidden = !!episode; // Audiobookshelf's bookmarks are a book's
  tabs.append(chTab, bmTab);
  marks.hidden = true;
  const tab = (which) => {
    chTab.classList.toggle("on", which === "chapters"); bmTab.classList.toggle("on", which === "bookmarks");
    chTab.setAttribute("aria-selected", String(which === "chapters")); bmTab.setAttribute("aria-selected", String(which === "bookmarks"));
    list.hidden = which !== "chapters"; marks.hidden = which !== "bookmarks";
  };
  chTab.onclick = () => tab("chapters");
  bmTab.onclick = () => tab("bookmarks");
  const status = el("div", "abs-status", "Opening…");
  const times = el("div", "abs-times"); times.append(at, left);
  const keys = el("div", "abs-keys"); keys.append(back, play, fwd);
  const opts = el("div", "abs-opts"); opts.append(speed, sleep);
  const read = el("div", "abs-read"); // Keep offline (keep.js); Read along, when the item carries its ebook (readalong.js)
  const head = el("div", "abs-head"), words = el("div", "abs-words");
  words.append(title, who, chapter);
  head.append(cover, words);
  root.append(head, bar, times, keys, opts, read, status, tabs, list, marks);

  let dragging = false, shownChapters = null, ownCover = "";
  let kept = null; // the kept copy (keep.js) when this device has one
  void a.cover(item).then((u) => { if (u) { ownCover = u; shown(mine()); } }).catch(() => {});
  /** The pane drawn from the player's state (it changes several times a second while playing). */
  function shown(s) {
    if (!s) { play.textContent = "▶"; play.setAttribute("aria-label", "Play"); return; }
    if (s.title) title.textContent = s.title;
    if (s.author) who.textContent = s.author;
    const pic = s.cover || ownCover; // the phone's player does not echo a cover back: the one this pane found
    if (pic && cover.src !== pic) { cover.src = pic; cover.hidden = false; }
    bar.max = String(Math.floor(s.duration));
    if (!dragging) { bar.value = String(Math.floor(s.at)); at.textContent = clock(s.at); }
    left.textContent = `−${clock(s.duration - s.at)}`;
    chapter.textContent = s.chapter >= 0 ? s.chapters[s.chapter].title : "";
    if (shownChapters !== s.chapters) { shownChapters = s.chapters; chaptersList(s.chapters); }
    for (const [k, li] of [...list.children].entries()) li.classList.toggle("on", k === s.chapter);
    play.textContent = s.playing ? "❚❚" : "▶";
    play.setAttribute("aria-label", s.playing ? "Pause" : "Play");
    speed.value = String(s.speed);
    if (!s.sleep && sleep.value !== "0") sleep.value = "0"; // the timer ran out (or the player was told elsewhere)
    status.textContent = s.error;
  }
  function chaptersList(chapters) {
    list.replaceChildren(...chapters.map((c) => {
      const li = el("li"), b = el("button", "", `${c.title} `);
      b.append(el("span", "abs-dim", clock(c.start)));
      b.onclick = () => P.seek(c.start);
      li.append(b);
      return li;
    }));
  }
  const off = P.on((s) => {
    const m = mine(s);
    shown(m);
    if (m && kept) rememberPlace(item, episode, m.at); // a kept one may be started with no server to ask
  });

  play.onclick = () => (mine() ? P.toggle() : void start(true));
  back.onclick = () => mine() && P.skip(-skip);
  fwd.onclick = () => mine() && P.skip(skip);
  bar.oninput = () => { dragging = true; at.textContent = clock(Number(bar.value)); };
  bar.onchange = () => { dragging = false; if (mine()) P.seek(Number(bar.value)); };
  speed.onchange = () => {
    if (mine()) P.speed(Number(speed.value));
    keepSpeed(speed.value);
  };
  sleep.onchange = () => {
    const v = Number(sleep.value);
    if (mine()) P.sleep(v < 0 ? "chapter" : v > 0 ? { minutes: v } : null);
  };
  root.tabIndex = 0;
  root.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
    if (e.key === " ") { e.preventDefault(); play.click(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); back.click(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); fwd.click(); }
  });

  /** The book handed to the app's player (play.js): the server's session, or the kept copy (alone when the server is
   *  out of reach: the helper keeps the reports until it answers again). The pane only shows the player from then on. */
  async function start(andPlay, from) {
    try {
      status.textContent = "Opening…";
      const r = await playBook(atlas, a, { item, episode, from, cover: ownCover, speed: Number(speed.value) });
      kept = r.kept;
      if (!andPlay) P.pause();
      if (!r.session) status.textContent = "Playing the kept copy: the server is out of reach.";
    } catch (e) { status.textContent = `Not opened: ${e.message ?? e}`; }
  }

  // ---- keep offline: the tracks into this device's cache (keep.js), or given up ----
  const keepBtn = el("button", "atlas-btn"), keepSaid = el("span", "abs-dim");
  const keepLabel = () => { keepBtn.textContent = kept ? "Kept offline · Remove" : "Keep offline"; keepBtn.title = kept ? "Remove the downloaded copy from this device" : "Download it to this device, to listen with no connection"; };
  keepBtn.onclick = async () => {
    keepBtn.disabled = true;
    try {
      if (kept) { await forget(atlas, item, episode); kept = null; keepSaid.textContent = ""; }
      else {
        kept = await keep(atlas, a, item, episode, (done, of) => { keepBtn.textContent = `Keeping ${done} of ${of}…`; });
        keepSaid.textContent = "";
        atlas.toast?.("Kept offline", `${kept.title}: plays from this device from now on`);
      }
    } catch (e) { keepSaid.textContent = `Not kept: ${e.message ?? e}`; }
    finally { keepBtn.disabled = false; keepLabel(); }
  };
  read.append(keepBtn, keepSaid);
  keepLabel();
  void keptOf(atlas, item, episode).then((k) => { kept = k; keepLabel(); });

  if (!episode) bookmarks(marks, {
    atlas, a, item, title: () => title.textContent ?? "",
    at: () => mine()?.at ?? 0,
    go: (t) => (mine() ? P.seek(t) : void start(true, t)),
  });

  const leaveReading = episode ? () => {} : readAlong(read, { atlas, a, item });

  // this book already playing (the pane opened again from the lower bar): shown as it is; else started
  if (mine()) shown(mine());
  else void start(true);

  return () => { off(); leaveReading(); }; // the book plays on: the player is the app's, not this pane's
}
