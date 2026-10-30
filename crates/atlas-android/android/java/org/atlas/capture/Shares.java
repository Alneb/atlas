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

    /** A share never replaces an unsent draft (leaving would then save over it): it goes under the draft. */
    static String underDraft(String draft, String shared) {
        if (shared == null) return draft;
        if (draft == null || draft.trim().isEmpty()) return shared;
        return draft.replaceAll("\\s+$", "") + "\n" + shared;
    }
}
