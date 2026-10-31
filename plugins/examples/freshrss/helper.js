// FreshRSS' helper, run in the core (QuickJS, [helper] js): the unread articles and an article saved as a note, through
// FreshRSS's Fever API (`/api/fever.php?api&items`). The page's block and the `freshrss_unread` / `freshrss_save` tools
// call the same methods, so an agent or the phone reads and saves the same way. Fever wants its key as a form field:
// the core fills it in (`form: { api_key: { secret: "api_key" } }`), so the key never reaches this script or a page.

const baseOf = (s) => {
  const base = String(s?.server ?? "").trim().replace(/\/+$/, "");
  if (!base) throw new atlas.AtlasError("set the FreshRSS server in Settings → Plugins → FreshRSS", 400);
  return base;
};
async function fever(settings, query) {
  const res = await atlas.fetchResponse({ url: `${baseOf(settings)}/api/fever.php?api&${query}`, method: "POST", form: { api_key: { secret: "api_key" } }, timeout_secs: 30 });
  if (!res.ok) throw new atlas.AtlasError(`FreshRSS answered ${res.status}`, 502);
  const j = JSON.parse(res.text || "{}");
  if (j.auth === 0) throw new atlas.AtlasError("FreshRSS did not accept the API key", 403);
  return j;
}
const fileName = (t) => String(t).replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Article";
const textOf = (html) => (atlas.html.select(`<body>${html ?? ""}</body>`, "body")[0]?.text ?? "").trim();

/** The unread articles, newest first: [{ id, title, url, feed }] (at most `limit`, 15 by default). */
async function unread(p) {
  const ids = String((await fever(p.settings, "unread_item_ids")).unread_item_ids ?? "").split(",").filter(Boolean)
    .sort((a, b) => Number(b) - Number(a)).slice(0, Math.max(1, Number(p.limit) || 15));
  if (!ids.length) return [];
  const items = (await fever(p.settings, `items&with_ids=${ids.join(",")}`)).items ?? [];
  return items.map((it) => ({ id: String(it.id), title: String(it.title ?? ""), url: it.url ?? null, feed: it.feed_id ?? null }));
}

/** One article (by its id from `unread`) as a note in the settings' folder → { path, made } (made: false when the
 *  note was there already; it is not written over). */
async function save(p) {
  const id = String(p.id ?? "").replace(/\D/g, "");
  if (!id) throw new atlas.AtlasError("which article: an id from freshrss_unread", 400);
  const it = ((await fever(p.settings, `items&with_ids=${id}`)).items ?? [])[0];
  if (!it) throw new atlas.AtlasError(`FreshRSS has no article ${id}`, 404);
  const folder = String(p.settings?.folder || "notes/reading").replace(/\/+$/, "");
  const path = `${folder}/${fileName(it.title)}.md`;
  try { await atlas.read(path); return { path, made: false }; } catch (e) { if (e.status !== 404) throw e; }
  const day = new Date().toISOString().slice(0, 10);
  await atlas.write(path, `---\ntype: article\nsource: ${JSON.stringify(it.url ?? "")}\nsaved: ${day}\n---\n# ${it.title}\n\n${textOf(it.html)}\n`);
  return { path, made: true };
}

atlas.methods({ unread, save });
