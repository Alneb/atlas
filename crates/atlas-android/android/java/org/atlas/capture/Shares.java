package org.atlas.capture;

/** What a share brings into the capture box as text, in plain Java (tested on the desktop JVM: test/run.sh). */
final class Shares {
    private Shares() {}

    /** The shared text, its subject first when the text does not already hold it (a page's title before its address). */
    static String text(String subject, CharSequence text) {
        if (text == null) return subject;
        String t = text.toString();
        return subject != null && !t.contains(subject) ? subject + "\n" + t : t;
    }

    /** Selected text as a Markdown quote, line by line (`extras::quote` on the desktop); null when there is none. */
    static String quote(CharSequence text) {
        if (text == null || text.toString().trim().isEmpty()) return null;
        StringBuilder out = new StringBuilder();
        for (String l : text.toString().trim().split("\n", -1)) out.append(out.length() > 0 ? "\n" : "").append(l.trim().isEmpty() ? ">" : "> " + l);
        return out.toString();
    }

    /** A share never replaces an unsent draft (leaving would then save over it): it goes under the draft. */
    static String underDraft(String draft, String shared) {
        if (shared == null) return draft;
        if (draft == null || draft.trim().isEmpty()) return shared;
        return draft.replaceAll("\\s+$", "") + "\n" + shared;
    }
}
