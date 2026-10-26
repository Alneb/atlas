package org.atlas.capture;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Addresses as they go into a capture: the share-tracking parameters apps add (`si` from YouTube and Spotify, `igsh` from
 * Instagram, `utm_*`, `feature=share…`) taken off, so what reaches the catalog, TubeArchivist or a downloader is the item's
 * own address. By shape: any parameter of that kind on any site; the rest of the address is kept as it was. The rule is
 * atlas-text's `links.rs`, which every capture passes through in the core; this copy serves only what the phone reads
 * on screen before anything reaches the core (Onscreen.canonical), and must list the same parameters.
 */
final class Links {
    private Links() {}

    private static final Pattern URL = Pattern.compile("https?://[^\\s<>\"\\]\\)]+");
    private static final Pattern TRACKING = Pattern.compile("^(si|igsh|igshid|fbclid|gclid|mc_cid|mc_eid|ref_src|feature|pp|utm_[a-z]+)(=|$)");

    static String untracked(String text) {
        if (text == null) return null;
        Matcher m = URL.matcher(text);
        StringBuilder out = new StringBuilder();
        while (m.find()) m.appendReplacement(out, Matcher.quoteReplacement(clean(m.group())));
        m.appendTail(out);
        return out.toString();
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
