// A podcast's page (the pane's argument `show:<item>`): its cover, title and author, and its episodes newest first,
// each with its date, length and how far you are (`/api/me`'s mediaProgress per episode). An episode opens in the
// player as itself (`<item>/<episode>`: the server's `/play/<episode>`), so where you are is kept per episode.
import { clock } from "./abs.js";
import { episodesOf, progressMap } from "./shelf.js";
import { el, notLoaded } from "./cards.js";

const day = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "");

export function podcast(root, atlas, a, item) {
  root.className = "abs-player abs-show";
  const head = el("div", "abs-head"), cover = el("img", "abs-cover"), words = el("div", "abs-words");
  const title = el("div", "abs-title"), who = el("div", "abs-who"), status = el("div", "abs-status", "Loading the episodes…");
  cover.alt = "";
  cover.hidden = true;
  words.append(title, who);
  head.append(cover, words);
  const list = el("ol", "abs-episodes");
  root.append(head, status, list);
  void a.cover(item).then((u) => { if (u) { cover.src = u; cover.hidden = false; } }).catch(() => {});

  async function load() {
    try {
      const [it, me] = await Promise.all([a.item(item), a.me().catch(() => ({}))]);
      const m = it?.media?.metadata ?? {};
      title.textContent = m.title ?? item;
      who.textContent = m.author ?? "";
      const eps = episodesOf(it, progressMap(me));
      status.textContent = eps.length ? "" : "No episodes yet.";
      list.replaceChildren(...eps.map((e) => {
        const li = el("li"), b = el("button", "abs-ep"), name = el("span", "abs-ep-title", e.title);
        const how = e.finished ? "✓ played" : e.progress ? `${Math.round(e.progress * 100)}%` : "";
        b.append(name, el("span", "abs-dim", [day(e.published), e.duration && clock(e.duration, true), how].filter(Boolean).join(" · ")));
        b.title = e.progress && !e.finished ? `Go on from ${clock(e.at)}` : "Play";
        b.onclick = () => atlas.openView(e.open, { title: e.title, icon: "headphones" });
        if (e.finished) li.classList.add("done");
        li.append(b);
        return li;
      }));
    } catch (e) { notLoaded(status, atlas, e, load); }
  }
  void load();
  return { reload: load };
}
