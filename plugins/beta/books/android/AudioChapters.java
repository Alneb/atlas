package org.atlas.plugins.books;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** The book's audiobook, the pure part (plain Java, AudioChaptersTest): which audiobook the book's note names, and which
 *  chapter of the text matches a chapter of the audio by its normalised title. The web reader's rules
 *  (books/audiobook.js), tested on the same cases (ui/tests/fixtures/audiobook-chapters.json). */
final class AudioChapters {
    private AudioChapters() {}

    private static final Pattern IN_URL = Pattern.compile("/item/([^/?#\\s]+)");
    private static final Pattern BARE = Pattern.compile("[\\w-]{8,}");

    /** The item id from the note's `audiobookshelf` property (the catalog's id), else from its `audiobook` link
     *  (`…/item/<id>`) or a bare id there; null when the note names none. Either may be null. */
    static String itemOf(String audiobookshelf, String audiobook) {
        String id = audiobookshelf == null ? "" : audiobookshelf.trim();
        if (!id.isEmpty()) return id;
        String link = audiobook == null ? "" : audiobook.trim();
        Matcher m = IN_URL.matcher(link);
        if (m.find()) {
            try { return java.net.URLDecoder.decode(m.group(1).replace("+", "%2B"), "UTF-8"); } catch (Exception e) { return m.group(1); }
        }
        return BARE.matcher(link).matches() ? link : null; // a bare id (ids are long); other text names none
    }

    /** A title made comparable: accents, case and punctuation gone, `&` as "and", spaces collapsed, a leading word
     *  "chapter" dropped. */
    static String norm(String title) {
        String t = Normalizer.normalize(title == null ? "" : title, Normalizer.Form.NFKD).replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT)
            .replace("&", " and ").replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
        return t.replaceFirst("^chapter\\s+(?=\\S)", "");
    }

    /** The index in `titles` of the chapter titled `title`: the first with the same normalised title, else the only one
     *  where one title starts the other at a word's end; -1 when none or several. */
    static int match(List<String> titles, String title) {
        String want = norm(title);
        if (want.isEmpty()) return -1;
        List<String> norms = new ArrayList<>();
        for (String t : titles) norms.add(norm(t));
        int same = norms.indexOf(want);
        if (same >= 0) return same;
        int found = -1;
        for (int i = 0; i < norms.size(); i++) {
            String n = norms.get(i);
            if (!starts(n, want) && !starts(want, n)) continue;
            if (found >= 0) return -1; // several: none is the one
            found = i;
        }
        return found;
    }

    private static boolean starts(String longer, String shorter) {
        return !shorter.isEmpty() && longer.startsWith(shorter) && longer.length() > shorter.length() && longer.charAt(shorter.length()) == ' ';
    }
}
