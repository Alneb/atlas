package org.atlas.capture;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Addresses as they go into a capture: the share-tracking parameters apps add (`si` from YouTube and Spotify, `igsh` from
 * Instagram, `utm_*`, `feature=share…`) taken off, so what reaches the catalog, TubeArchivist or a downloader is the item's
 * own address. By shape: any parameter of that kind on any site; the rest of the address is kept as it was.
 */
final class Links {
    private Links() {}

    private static final Pattern URL = Pattern.compile("https?://[^\\s<>\"\\]\\)]+");
    private static final Pattern TRACKING = Pattern.compile("^(si|igsh|igshid|fbclid|gclid|utm_[a-z]+|feature=share\\w*)(=|$)");

    static String untracked(String text) {
        if (text == null) return null;
        Matcher m = URL.matcher(text);
        StringBuilder out = new StringBuilder();
        while (m.find()) m.appendReplacement(out, Matcher.quoteReplacement(clean(m.group())));
        m.appendTail(out);
        return out.toString();
    }

    private static final Pattern PICTURE = Pattern.compile("^!\\[\\[([^\\]|]+\\.(?:png|jpe?g|webp|gif|avif|jxl|heic))\\]\\]$", Pattern.CASE_INSENSITIVE);

    /** A picture's embed as a capture writes it: a thumbnail, `![[Screen….png|240]]`; any other embed as it was. */
    static String thumbnail(String embed) {
        Matcher m = embed == null ? null : PICTURE.matcher(embed);
        return m != null && m.matches() ? "![[" + m.group(1) + "|240]]" : embed;
    }

    private static String clean(String url) {
        int q = url.indexOf('?');
        if (q < 0) return url;
        int hash = url.indexOf('#', q);
        String query = hash < 0 ? url.substring(q + 1) : url.substring(q + 1, hash);
        StringBuilder kept = new StringBuilder();
        for (String p : query.split("&")) {
            if (p.isEmpty() || TRACKING.matcher(p).find()) continue;
            kept.append(kept.length() == 0 ? "" : "&").append(p);
        }
        return url.substring(0, q) + (kept.length() == 0 ? "" : "?" + kept) + (hash < 0 ? "" : url.substring(hash));
    }
}
