// Wikipedia for the catalog: `recognize` reads a Wikipedia page's one-line description to say what the page is about,
// and the page's external links for the identifiers other sources use — both in ONE small request to the MediaWiki
// query API (Wikipedia rate-limits bursts; a whole page's HTML per capture was ~1 MB). Tests: helper.test.ts.
import type { Params } from "atlas-helper";

const PAGE = /https?:\/\/([a-z]{2,3}(?:-[a-z]+)?)\.(?:m\.)?wikipedia\.org\/wiki\/([^\s?#]+)/i;

// JavaScript's \b knows only ASCII letters ("álbum" has none before its á): a word edge over every script's letters
const EDGE = String.raw`(?:(?<![\p{L}\p{N}_])(?=[\p{L}\p{N}_])|(?<=[\p{L}\p{N}_])(?![\p{L}\p{N}_]))`;
const words = (src: string) => new RegExp(src.replaceAll(String.raw`\b`, EDGE), "iu");

// a description's words → the kind, in English, Spanish and French; first match wins, so specific before general
const KINDS: [RegExp, string][] = [
  [words(String.raw`\b(anime|animated (tv |television )?series|original (video|net) animation|serie de anime|OVA)\b`), "anime"],
  [words(String.raw`\b(manga|manhwa|manhua|gekiga)\b`), "manga"],
  [words(String.raw`\b(television|tv|web) (series|miniseries|sitcom|drama|soap opera|program(me)?|show|anthology)|\bsoap opera\b|\bserie de (televisión|tv)|`
    + String.raw`\bminiserie|\bsérie télévisée|\bsitcom\b|\btelenovela\b`), "show"],
  [words(String.raw`\b(\d{4} )?(\w+ )?(films?|movies?|documentar(y|ies)|short film)\b|\bpel[ií]culas?\b|\bcortometraje\b|\bdocumental\b|\bfilm (de|réalisé)`), "movie"],
  // a group by its music ("hip hop group", "song and dance troupe"), before "song" and "album" can take it; a bare
  // "group" is not one ("ethnic group")
  [words(String.raw`\b(hip[- ]hop|rap|pop|rock|punk|metal|folk|dance|electronic|indie|vocal|a cappella|jazz|reggae|soul|r&b|country|techno|`
    + String.raw`house|eurodance|music|musical|song and dance) (group|ensemble|collective|duo|trio|troupe|act|project)\b`), "artist"],
  [words(String.raw`\b(studio |live |compilation |debut |tribute )?albums?\b|\b[áa]lbum\b|\bep by\b|\bmixtape\b`), "album"],
  [words(String.raw`\b(songs?|single)\b|\bcanci[oó]n\b|\bsencillo\b|\bchanson\b`), "song"],
  [words(String.raw`\b(novels?|novellas?|books?|memoirs?|non-fiction book|textbooks?|treatise|monograph|short stor(y|ies)|`
    + String.raw`anthology of)\b|\bnovelas?\b|\blibros?\b|\broman\b`), "book"],
  [words(String.raw`\b(band|musical group|musician|singer|rapper|composer|dj|boy band|girl group)\b|\bgrupo musical\b|\bbanda\b|\bcantante\b|\bgroupe\b`), "artist"],
];

// the page's links that name the thing elsewhere (its infobox and "External links"), per kind: a film page also cites
// books (their ISBNs), an album page links its artist — only the thing's own identifiers are taken
const IDS: Record<string, [RegExp, string][]> = {
  movie: [[/imdb\.com\/title\/(tt\d{6,10})/i, "imdb"], [/letterboxd\.com\/film\/([\w-]+)/i, "letterboxd"], [/themoviedb\.org\/movie\/(\d+)/i, "tmdb"]],
  show: [[/imdb\.com\/title\/(tt\d{6,10})/i, "imdb"], [/themoviedb\.org\/tv\/(\d+)/i, "tmdb"]],
  album: [[/musicbrainz\.org\/release-group\/([0-9a-f-]{36})/i, "musicbrainz"]],
  song: [],
  artist: [[/musicbrainz\.org\/artist\/([0-9a-f-]{36})/i, "musicbrainz"]],
  book: [[/openlibrary\.org\/works\/(OL\d+W)/i, "openlibrary"]],
  manga: [[/anilist\.co\/manga\/(\d+)/i, "anilist"], [/myanimelist\.net\/manga\/(\d+)/i, "myanimelist"]],
  anime: [[/anilist\.co\/anime\/(\d+)/i, "anilist"], [/myanimelist\.net\/anime\/(\d+)/i, "myanimelist"]],
};

export function kindOf(description: string | null | undefined): string | null {
  return KINDS.find(([rx]) => rx.test(description ?? ""))?.[1] ?? null;
}

/** `%C2%A1x` → `¡x`, leaving a malformed escape as it is (as Python's unquote does). */
function unquote(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** A page title's own disambiguation, "Apollo 11 (2019 film)" → "2019 film": Wikipedia's naming says the kind. */
export function qualifier(title: string): string | null {
  return /\(([^()]+)\)$/.exec(unquote(title).replaceAll("_", " ").trim())?.[1] ?? null;
}

/** The page's short description and its external links (IMDb, Letterboxd, MusicBrainz…), redirects followed. */
export function queryUrl(lang: string, title: string): string {
  return `https://${lang}.wikipedia.org/w/api.php?action=query&prop=description%7Cextlinks&titles=${atlas.url.quote(unquote(title), "")}`
    + "&ellimit=500&redirects=1&format=json&formatversion=2";
}

interface Page { title?: string; description?: string; missing?: boolean; extlinks?: { url?: string }[] }

async function recognize(params: Params) {
  const m = PAGE.exec(String(params.url ?? params.text ?? ""));
  if (!m) return { candidates: [] };
  const [whole, lang, title] = [m[0], m[1].toLowerCase(), m[2]];
  // Wikimedia asks programs to say who to contact; without that it throttles hard. Two a second at most.
  const contact = String(params.settings?.contact ?? "").trim();
  const agent = `Atlas/0.1 (personal notes app${contact ? `; ${contact}` : ""}) catalog-wikipedia`;
  let page: Page = {};
  try {
    const pages: Page[] = (await atlas.fetchJson(queryUrl(lang, title), { headers: { "User-Agent": agent }, every: 0.5 }))?.query?.pages ?? [{}];
    page = pages[0]?.missing ? {} : (pages[0] ?? {});
  } catch (e) {
    // busy or unreachable: the title's qualifier alone still files "X (2019 film)" right; anything else waits for a retry
    if (!kindOf(qualifier(title))) throw e;
  }
  // the title's qualifier is Wikipedia's own naming ("(Narsha song)", "(1975 film)"): surer than a description that
  // mentions the album a song is from or the series a film was cut from
  const kind = kindOf(qualifier(title)) ?? kindOf(page.description);
  if (!kind) return { candidates: [] }; // not a thing the catalog files: it stays a web page
  const links = (page.extlinks ?? []).map((e) => String(e.url ?? "")).join("\n");
  const ids: Record<string, string> = { url: whole };
  for (const [rx, name] of IDS[kind]) {
    const found = rx.exec(links);
    if (found && !(name in ids)) ids[name] = found[1];
  }
  const label = page.title ?? unquote(title).replaceAll("_", " ");
  return { candidates: [{ kind, ids, label: `${label} — ${page.description ?? qualifier(title)}` }] };
}

atlas.methods({ recognize });
