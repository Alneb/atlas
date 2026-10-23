package org.atlas.capture;

import java.util.Arrays;
import java.util.List;

/** The screen recognisers on views shaped as the apps and browsers show them (android/test/run.sh). No framework: a
 *  failed check prints what it got and the run exits 1. */
public final class OnscreenTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (want == null ? got == null : want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    private static Onscreen.Node t(String text) { return Onscreen.Node.text(text, null); }
    private static Onscreen.Node t(String text, String id) { return Onscreen.Node.text(text, id); }
    private static Onscreen.Node web(String title, String url) { return new Onscreen.Node(title, null, "android.webkit.WebView", null, url, true); }
    private static Onscreen.Found read(String pkg, Onscreen.Node... n) { return Onscreen.read(pkg, Arrays.asList(n)); }

    public static void main(String[] a) {
        // Chrome on YouTube's mobile site: the bar without a scheme, the share's `si` and YouTube's `pp` gone
        Onscreen.Found f = read("com.android.chrome",
            t("m.youtube.com/watch?v=dQw4w9WgXcQ&si=AbC123xyz&pp=ygUJcmljayByb2xs", "com.android.chrome:id/url_bar"),
            web("Rick Astley - Never Gonna Give You Up (Official Music Video) - YouTube", "https://m.youtube.com/watch?v=dQw4w9WgXcQ&pp=ygUJcmljayByb2xs"),
            t("Rick Astley - Never Gonna Give You Up (Official Music Video)"), t("1.7B views"));
        eq("chrome youtube", "[Rick Astley - Never Gonna Give You Up (Official Music Video)](https://www.youtube.com/watch?v=dQw4w9WgXcQ)", f.markdown());
        eq("chrome youtube site", Onscreen.Site.YOUTUBE, f.site);

        // Firefox on Wikipedia's mobile host
        f = read("org.mozilla.firefox",
            t("en.m.wikipedia.org/wiki/Harakiri_(1962_film)", "org.mozilla.firefox:id/mozac_browser_toolbar_url_view"),
            web("Harakiri (1962 film) - Wikipedia", null));
        eq("firefox wikipedia", "[Harakiri (1962 film)](https://en.wikipedia.org/wiki/Harakiri_(1962_film))", f.markdown());

        // the Wikipedia app: no address bar, the article is a web page the app loads from its REST API
        f = read("org.wikipedia",
            t("Explore"), new Onscreen.Node(null, null, "android.webkit.WebView", null, "https://es.wikipedia.org/api/rest_v1/page/mobile-html/Seppuku_(pel%C3%ADcula)", true),
            t("Seppuku (película)"), t("Película de 1962 dirigida por Masaki Kobayashi"));
        eq("wikipedia app", "[Seppuku (película)](https://es.wikipedia.org/wiki/Seppuku_(pel%C3%ADcula))", f.markdown());
        eq("wikipedia app site", Onscreen.Site.WIKIPEDIA, f.site);

        // the Wikipedia app with no web root read: its title to look up
        f = read("org.wikipedia", t("Harakiri (1962 film)", "org.wikipedia:id/view_page_title_text"), t("1962 film by Masaki Kobayashi"));
        eq("wikipedia app no url: query", "Harakiri (1962 film)", f.query);
        eq("wikipedia app no url: no link yet", null, f.url);

        // the Letterboxd app's film page: the title, then the year (alone or leading a line)
        f = read("com.letterboxd.letterboxd", t("Film"), t("Dune: Part Two"), t("2024"), t("Directed by"), t("Denis Villeneuve"), t("167 mins"),
            t("Long live the fighters. Paul Atreides unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family."));
        eq("letterboxd app: query", "Dune: Part Two", f.query);
        eq("letterboxd app: year", "2024", f.year);
        eq("letterboxd app: site", Onscreen.Site.LETTERBOXD, f.site);
        f = read("com.letterboxd.letterboxd", t("Up"), t("2009 • Directed by"), t("Pete Docter"));
        eq("letterboxd short title", "Up", f.query);
        eq("letterboxd short title year", "2009", f.year);

        // the YouTube app: no address on screen; a link in the description is not the video's
        f = read("com.google.android.youtube", t("https://merch.example.com/shop"), t("Never Gonna Give You Up", "com.google.android.youtube:id/title"), t("Rick Astley"));
        eq("youtube app: not the description's link", null, f.url);
        eq("youtube app: query", "Never Gonna Give You Up", f.query);
        eq("youtube app: site", Onscreen.Site.YOUTUBE, f.site);
        eq("revanced is youtube", Onscreen.Site.YOUTUBE, Onscreen.ofPackage("app.revanced.android.youtube"));
        eq("youtube music", Onscreen.Site.YOUTUBE_MUSIC, Onscreen.ofPackage("com.google.android.apps.youtube.music"));

        // Spotify in a browser: the country prefix and `si` gone, "song and lyrics by" said as the box does
        f = read("com.android.chrome", t("open.spotify.com/intl-es/track/4cOdK2wGLETKBW3PvgPWqT?si=0f1e2d", "com.android.chrome:id/url_bar"),
            web("Never Gonna Give You Up - song and lyrics by Rick Astley | Spotify", null));
        eq("spotify web", "[Never Gonna Give You Up — Rick Astley](https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT)", f.markdown());

        // the Spotify app: its session has the song; the screen's longest text (a lyric) is not taken as its title
        f = read("com.spotify.music", t("Never gonna give you up, never gonna let you down"));
        eq("spotify app: site", Onscreen.Site.SPOTIFY, f.site);
        eq("spotify app: no lyric as query", null, f.query);

        // Letterboxd in a browser
        f = read("com.android.chrome", t("letterboxd.com/film/dune-part-two/", "com.android.chrome:id/url_bar"),
            web("‎Dune: Part Two (2024) directed by Denis Villeneuve • Reviews, film + cast • Letterboxd", null));
        eq("letterboxd web", "[Dune: Part Two (2024)](https://letterboxd.com/film/dune-part-two/)", f.markdown());

        // an app nobody named: its title guessed, never a link
        f = read("com.example.reader", t("Home"), t("How the octopus lost its shell", "com.example.reader:id/article_title"), t("A long time ago"));
        eq("unknown app guess", "How the octopus lost its shell", f.guess);
        eq("unknown app no site", null, f.site);

        // addresses made canonical
        eq("youtu.be with time", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42", Onscreen.canonical("https://youtu.be/dQw4w9WgXcQ?si=x&t=42"));
        eq("shorts", "https://www.youtube.com/shorts/abcdefghijk", Onscreen.canonical("https://m.youtube.com/shorts/abcdefghijk?feature=share"));
        eq("music", "https://music.youtube.com/watch?v=dQw4w9WgXcQ", Onscreen.canonical("https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM"));
        eq("watch with v later", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", Onscreen.canonical("https://www.youtube.com/watch?app=desktop&v=dQw4w9WgXcQ"));
        eq("other site untouched", "https://example.com/a?b=1", Onscreen.canonical("https://example.com/a?b=1&utm_source=x"));
        eq("youtube unread count", "Some video", Onscreen.title(Onscreen.Site.YOUTUBE, "(3) Some video - YouTube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"));

        // looking up: the pieces that need no network
        eq("slug", Arrays.asList("dune-part-two", "dune-part-two-2024"), Onscreen.letterboxdSlugs("Dune: Part Two", "2024"));
        eq("slug apostrophe", Arrays.asList("schindlers-list"), Onscreen.letterboxdSlugs("Schindler's List", null));
        eq("slug accent", Arrays.asList("amelie"), Onscreen.letterboxdSlugs("Amélie", null));
        eq("slug ampersand", Arrays.asList("fast-furious"), Onscreen.letterboxdSlugs("Fast & Furious", null));
        eq("og year", "2021", Onscreen.letterboxdYear("<meta property=\"og:url\" content=\"https://letterboxd.com/film/dune-2021/\" /><meta property=\"og:title\" content=\"Dune (2021)\" />"));
        eq("wikipedia summary", "https://en.wikipedia.org/wiki/Harakiri_(1962_film)",
            Onscreen.wikipediaPage("{\"type\":\"standard\",\"title\":\"Harakiri (1962 film)\",\"content_urls\":{\"desktop\":{\"page\":\"https://en.wikipedia.org/wiki/Harakiri_(1962_film)\",\"revisions\":\"x\"}}}"));
        eq("youtube results", "dQw4w9WgXcQ", Onscreen.firstVideo("{\"adSlotRenderer\":{},\"videoRenderer\":{\"videoId\":\"dQw4w9WgXcQ\",\"thumbnail\":{}}"));
        List<String> none = Arrays.asList();
        eq("offline or unknown: unchanged", null, Onscreen.resolve(new Onscreen.Found(Onscreen.Site.SPOTIFY, null, "x", "x", null, null, false), none).url);

        // a capture's picture as a thumbnail
        eq("thumbnail", "![[Screen 2026-10-21 093900.png|240]]", Links.thumbnail("![[Screen 2026-10-21 093900.png]]"));
        eq("drawing embed kept", "![[Drawing.excalidraw]]", Links.thumbnail("![[Drawing.excalidraw]]"));
        eq("sized embed kept", "![[a.png|600]]", Links.thumbnail("![[a.png|600]]"));

        System.out.println((ran - failed) + "/" + ran + " checks passed");
        if (failed > 0) System.exit(1);
    }
}
