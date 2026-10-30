package org.atlas.capture;

import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What the app on screen shows, as the thing's own address and title: a YouTube video, a Spotify
 * song, a Letterboxd film, a Wikipedia article — in their apps or in a browser — so the capture carries `[Title](https://…)`
 * and the catalog can file it. Read from the views the accessibility service saw (Page walks them); plain Java, no
 * android.*, so the recognisers run on the desktop JVM (android/test/run.sh, run by build-apk.sh).
 * Shape first, a small table second: any browser's address is found by its shape and made canonical; the four sites are
 * known by host or by a word in the package (a YouTube fork still says "youtube"); an unknown app keeps today's guess.
 * When an app shows no address, `query` (and `year`) name what to look up: the media session of the same app (Playing,
 * CaptureActivity) or `resolve` (network, off the main thread).
 */
final class Onscreen {
    private Onscreen() {}

    /** One view as the accessibility service saw it, in reading order (depth first). */
    static final class Node {
        final String text, id, cls, desc, extraUrl;
        final boolean visible;

        Node(String text, String id, String cls, String desc, String extraUrl, boolean visible) {
            this.text = trim(text); this.id = id == null ? "" : id.toLowerCase(Locale.ROOT); this.cls = cls == null ? "" : cls;
            this.desc = trim(desc); this.extraUrl = extraUrl; this.visible = visible;
        }

        /** A visible text view (tests and simple dumps). */
        static Node text(String text, String id) { return new Node(text, id, "android.widget.TextView", null, null, true); }
    }

    /** The sites known by name; anything else is found by shape only. */
    enum Site {
        YOUTUBE_MUSIC("YouTube Music"), YOUTUBE("YouTube"), SPOTIFY("Spotify"), LETTERBOXD("Letterboxd"), WIKIPEDIA("Wikipedia");
        final String shown;
        Site(String shown) { this.shown = shown; }
    }

    /** What was recognised. `url` known → done; else `query` (+ `year`) to look up for `site`; `guess` is an unknown app's title. */
    static final class Found {
        final Site site;
        final String url, title, query, year, guess;
        /** The address came from a search (a likely match, not a certain one): the chip says so. */
        final boolean searched;

        Found(Site site, String url, String title, String query, String year, String guess, boolean searched) {
            this.site = site; this.url = url; this.title = title; this.query = query; this.year = year; this.guess = guess; this.searched = searched;
        }

        Found withUrl(String url, String title, boolean searched) { return new Found(site, url, title == null ? this.title : title, query, year, guess, searched); }

        /** As it goes into the note: `[Title](url)`, or the bare address without a title; null without an address. */
        String markdown() {
            if (url == null) return null;
            return title == null || title.isEmpty() ? url : "[" + title.replace("[", "(").replace("]", ")") + "](" + url + ")";
        }
    }

    private static final Pattern WEB = Pattern.compile("^(https?://)?([\\w-]+\\.)+[a-z]{2,}(:\\d+)?(/\\S*)?$", Pattern.CASE_INSENSITIVE);
    /** A year shown alone or leading a line ("2024", "2024 • Directed by"): Letterboxd's film header. */
    private static final Pattern YEAR = Pattern.compile("^((?:18|19|20)\\d\\d)(?:$|\\s*[•·|,-])");

    /** The screen's thing from its package and views; null when nothing at all was read. */
    static Found read(String pkg, List<Node> nodes) {
        String byExtra = null, byId = null, byShape = null, webTitle = null, named = null, longest = null;
        for (Node n : nodes) {
            if (byExtra == null && n.extraUrl != null && n.extraUrl.startsWith("http")) byExtra = n.extraUrl; // Chromium's web root
            if (n.text != null && !n.text.contains(" ") && WEB.matcher(n.text).matches()) {
                if (byId == null && (n.id.contains("url") || n.id.contains("address") || n.id.contains("location"))) byId = n.text;
                if (byShape == null && n.text.contains("/")) byShape = n.text;
            }
            if (webTitle == null && n.cls.endsWith("WebView")) {
                String t = n.text != null ? n.text : n.desc;
                if (t != null && !t.isEmpty() && !WEB.matcher(t).matches()) webTitle = t;
            }
            if (n.text != null && n.visible && seeable(n.text)) {
                if (named == null && n.id.contains("title")) named = n.text;
                if (longest == null || n.text.length() > longest.length()) longest = n.text;
            }
        }
        // the address bar beats a page's own (a web root inside an app is the app's page: Wikipedia's mobile-html)
        String url = byId != null ? byId : byExtra != null ? byExtra : byShape;
        Site site = ofPackage(pkg);
        if (url != null) {
            if (!url.startsWith("http")) url = "https://" + url;
            url = canonical(url);
            Site of = ofUrl(url);
            // in a known app, only its own site's address: another is an ad's or a link in a description
            if (site == null || family(of) == family(site)) return new Found(of, url, title(of, webTitle, url), null, null, null, false);
        }
        if (site == null) return new Found(null, null, null, null, null, named != null ? named : longest, false);
        String year = null, title = named;
        if (site == Site.LETTERBOXD) { // the film's header: its title, then its year
            for (int i = 1; i < nodes.size(); i++) {
                Matcher y = nodes.get(i).text == null ? null : YEAR.matcher(nodes.get(i).text);
                if (y == null || !y.find()) continue;
                String before = previousText(nodes, i);
                if (before != null) { year = y.group(1); title = before; break; }
            }
        }
        if (site == Site.WIKIPEDIA && title == null) title = webTitle;
        if (title == null && site != Site.SPOTIFY) title = longest; // Spotify's longest text is a lyric or a playlist's blurb
        return new Found(site, null, title, title, year, null, false);
    }

    /** The text just before node `i` in reading order: a title may be short ("Up"), so only labels are skipped. */
    private static String previousText(List<Node> nodes, int i) {
        for (int j = i - 1; j >= 0 && j >= i - 4; j--) {
            String t = nodes.get(j).text;
            if (t == null || t.isEmpty() || t.length() > 160 || t.indexOf('\n') >= 0 || YEAR.matcher(t).find()) continue;
            return t;
        }
        return null;
    }

    /** A line of words that can be a title: not a button's word, not a paragraph, not an address. */
    private static boolean seeable(String t) {
        return t.length() >= 8 && t.length() <= 160 && t.indexOf('\n') < 0 && t.contains(" ") && !WEB.matcher(t).matches();
    }

    /** YouTube Music's app shows youtube.com pages too. */
    private static Site family(Site s) { return s == Site.YOUTUBE_MUSIC ? Site.YOUTUBE : s; }

    /** By a word in the package: forks and clients (ReVanced, NewPipe, LibreTube) say what they play. */
    static Site ofPackage(String pkg) {
        String p = pkg == null ? "" : pkg.toLowerCase(Locale.ROOT);
        if (p.contains("youtube") && p.contains("music")) return Site.YOUTUBE_MUSIC;
        if (p.contains("youtube") || p.contains("newpipe") || p.contains("libretube")) return Site.YOUTUBE;
        if (p.contains("spotify")) return Site.SPOTIFY;
        if (p.contains("letterboxd")) return Site.LETTERBOXD;
        if (p.contains("wikipedia")) return Site.WIKIPEDIA;
        return null;
    }

    private static final Pattern HOST = Pattern.compile("^https?://([^/?#]+)", Pattern.CASE_INSENSITIVE);

    static Site ofUrl(String url) {
        Matcher m = HOST.matcher(url);
        if (!m.find()) return null;
        String h = m.group(1).toLowerCase(Locale.ROOT);
        if (h.equals("music.youtube.com")) return Site.YOUTUBE_MUSIC;
        if (h.endsWith("youtube.com") || h.equals("youtu.be")) return Site.YOUTUBE;
        if (h.endsWith("spotify.com")) return Site.SPOTIFY;
        if (h.endsWith("letterboxd.com") || h.equals("boxd.it")) return Site.LETTERBOXD;
        if (h.endsWith("wikipedia.org")) return Site.WIKIPEDIA;
        return null;
    }

    private static final Pattern YT_WATCH = Pattern.compile("^https?://(?:www\\.|m\\.)?youtube\\.com/watch\\?(?:\\S*?&)?v=([\\w-]{11})(\\S*)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern YT_SHORT = Pattern.compile("^https?://(?:youtu\\.be/|(?:www\\.|m\\.)?youtube\\.com/shorts/)([\\w-]{11})(\\S*)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern YT_MUSIC = Pattern.compile("^https?://music\\.youtube\\.com/watch\\?(?:\\S*?&)?v=([\\w-]{11})", Pattern.CASE_INSENSITIVE);
    private static final Pattern YT_TIME = Pattern.compile("[?&#]t=(\\d+s?)");
    private static final Pattern WIKI = Pattern.compile("^https?://([a-z-]+)\\.(?:m\\.)?wikipedia\\.org/(?:wiki/|api/rest_v1/page/mobile-html/)([^?#]+)(#\\S*)?", Pattern.CASE_INSENSITIVE);
    private static final Pattern SPOTIFY_INTL = Pattern.compile("^(https?://open\\.spotify\\.com/)intl-[a-z]+/", Pattern.CASE_INSENSITIVE);

    /** The share-tracking parameters taken off an address: the core's rule (Core.untracked, atlas-text links.rs), the
     *  one every capture passes through; a field so the desktop JVM's test, which has no native library, stands in. */
    static java.util.function.UnaryOperator<String> untrack = s -> Core.untracked(s);

    /** The thing's own address, the way the catalog and the desktop know it: no tracking, no mobile host, no app-internal page. */
    static String canonical(String url) {
        url = untrack.apply(url);
        Matcher m;
        if ((m = YT_MUSIC.matcher(url)).find()) return "https://music.youtube.com/watch?v=" + m.group(1);
        if ((m = YT_WATCH.matcher(url)).find()) return "https://www.youtube.com/watch?v=" + m.group(1) + time(m.group(2));
        if ((m = YT_SHORT.matcher(url)).find()) {
            boolean shorts = url.toLowerCase(Locale.ROOT).contains("/shorts/");
            return shorts ? "https://www.youtube.com/shorts/" + m.group(1) : "https://www.youtube.com/watch?v=" + m.group(1) + time(m.group(2));
        }
        if ((m = WIKI.matcher(url)).find()) return "https://" + m.group(1).toLowerCase(Locale.ROOT) + ".wikipedia.org/wiki/" + m.group(2) + (m.group(3) == null ? "" : m.group(3));
        if ((m = SPOTIFY_INTL.matcher(url)).find()) return m.group(1) + url.substring(m.end());
        return url;
    }

    /** A start time is part of what was captured; everything else of the query (playlists, `pp`) is not. */
    private static String time(String rest) {
        Matcher t = YT_TIME.matcher(rest == null ? "" : rest);
        return t.find() ? "&t=" + t.group(1) : "";
    }

    /** A browser tab's title without the site's name and noise. */
    static String title(Site site, String raw, String url) {
        String t = raw == null ? null : raw.replace("‎", "").trim();
        if (site == Site.WIKIPEDIA && (t == null || t.isEmpty())) { // the app's own page has no tab title: the address has it
            Matcher m = WIKI.matcher(url);
            if (m.find()) t = decode(m.group(2)).replace('_', ' ');
        }
        if (t == null || t.isEmpty()) return null;
        t = t.replaceFirst("^\\(\\d+\\)\\s+", ""); // YouTube's unread count
        if (site == null) return t;
        switch (site) {
            case YOUTUBE: case YOUTUBE_MUSIC: return t.replaceFirst("\\s+[-–]\\s+YouTube( Music)?$", "");
            case WIKIPEDIA: return t.replaceFirst("\\s+[-–—]\\s+Wiki[pm]edia.*$", "");
            case SPOTIFY: {
                t = t.replaceFirst("\\s*\\|\\s*Spotify$", "");
                return t.replaceFirst("\\s+-\\s+(?:song|single|album)(?: and lyrics)? by (.+)$", " — $1");
            }
            case LETTERBOXD: return t.replaceFirst("\\s+(directed by|•).*$", "").replaceFirst("\\s*•\\s*Letterboxd$", "");
        }
        return t;
    }

    private static String decode(String s) {
        try { return java.net.URLDecoder.decode(s.replace("+", "%2B"), "UTF-8"); } catch (Exception e) { return s; }
    }

    // --- looking up what an app showed without its address (network: never on the main thread) ---

    /** `f` with its address looked up, or `f` itself when it cannot be (offline, nothing found). `langs`: Wikipedia's to try. */
    static Found resolve(Found f, List<String> langs) {
        if (f == null || f.url != null || f.site == null || f.query == null) return f;
        try {
            switch (f.site) {
                case YOUTUBE: case YOUTUBE_MUSIC: {
                    String u = youtubeSearch(f.query, f.site == Site.YOUTUBE_MUSIC);
                    return u == null ? f : f.withUrl(u, null, true);
                }
                case LETTERBOXD: {
                    for (String slug : letterboxdSlugs(f.query, f.year)) {
                        String page = fetch("https://letterboxd.com/film/" + slug + "/");
                        if (page != null && (f.year == null || f.year.equals(letterboxdYear(page)))) return f.withUrl("https://letterboxd.com/film/" + slug + "/", null, false);
                    }
                    return f;
                }
                case WIKIPEDIA: {
                    for (String lang : langs) {
                        String page = fetch("https://" + lang + ".wikipedia.org/api/rest_v1/page/summary/" + java.net.URLEncoder.encode(f.query.replace(' ', '_'), "UTF-8"));
                        String u = page == null ? null : wikipediaPage(page);
                        if (u != null) return f.withUrl(u, null, false);
                    }
                    return f;
                }
                default: return f; // Spotify: its session has the song; its search needs a sign-in
            }
        } catch (Exception e) {
            return f;
        }
    }

    /** A film's address names: its title as Letterboxd writes it, then with the year (how a remake is told apart). */
    static List<String> letterboxdSlugs(String title, String year) {
        String s = java.text.Normalizer.normalize(title, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT)
            .replaceAll("['’]", "").replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        List<String> out = new java.util.ArrayList<>();
        if (s.isEmpty()) return out;
        out.add(s);
        if (year != null) out.add(s + "-" + year);
        return out;
    }

    private static final Pattern OG_YEAR = Pattern.compile("<meta property=\"og:title\" content=\"[^\"]*\\((\\d{4})\\)\"");

    /** The year a Letterboxd film page is of: its og:title ends "(2024)". */
    static String letterboxdYear(String html) {
        Matcher m = OG_YEAR.matcher(html);
        return m.find() ? m.group(1) : null;
    }

    private static final Pattern WIKI_PAGE = Pattern.compile("\"desktop\":\\{\"page\":\"(https://[^\"]+)\"");

    /** The article's address from Wikipedia's summary (it follows redirects: "Harakiri" → its film's page). */
    static String wikipediaPage(String json) {
        Matcher m = WIKI_PAGE.matcher(json);
        return m.find() ? m.group(1) : null;
    }

    /** The first video of YouTube's own search (Playing's sessions without an id use it too). */
    static String youtubeSearch(String query, boolean music) {
        try {
            String page = fetch("https://www.youtube.com/results?search_query=" + java.net.URLEncoder.encode(query, "UTF-8"));
            String id = page == null ? null : firstVideo(page);
            return id == null ? null : (music ? "https://music.youtube.com/watch?v=" : "https://www.youtube.com/watch?v=") + id;
        } catch (Exception e) {
            return null;
        }
    }

    private static final Pattern RESULT = Pattern.compile("\"videoRenderer\":\\{\"videoId\":\"([A-Za-z0-9_-]{11})\"");

    /** The first result of a YouTube search page (ads and shelves are other renderers). */
    static String firstVideo(String html) {
        Matcher m = RESULT.matcher(html);
        return m.find() ? m.group(1) : null;
    }

    /** A page's text, or null (not 200, offline): 4 s to connect, 5 s to read. */
    static String fetch(String url) {
        java.net.HttpURLConnection h = null;
        try {
            h = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
            h.setConnectTimeout(4000);
            h.setReadTimeout(5000);
            h.setRequestProperty("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36");
            h.setRequestProperty("Accept-Language", "en");
            h.setRequestProperty("Cookie", "CONSENT=YES+1; SOCS=CAI"); // past the consent page some countries get (YouTube)
            if (h.getResponseCode() != 200) return null;
            try (java.io.InputStream in = h.getInputStream()) {
                java.io.ByteArrayOutputStream page = new java.io.ByteArrayOutputStream();
                byte[] b = new byte[65536];
                for (int n; (n = in.read(b)) > 0; ) page.write(b, 0, n); // readAllBytes is Android 13+
                return page.toString("UTF-8");
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (h != null) h.disconnect();
        }
    }

    private static String trim(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
