package org.atlas.capture;

/** A share into the capture box: its subject before its text, and under an unsent draft, never over it. */
public final class SharesTest {
    static void eq(Object got, Object want, String what) { if (!java.util.Objects.equals(got, want)) throw new AssertionError(what + ": " + got + " (wanted " + want + ")"); }

    public static void main(String[] a) {
        eq(Shares.text("Dune", "https://example.org/dune"), "Dune\nhttps://example.org/dune", "the subject first");
        eq(Shares.text("Dune", "Dune https://example.org/dune"), "Dune https://example.org/dune", "a subject the text holds: once");
        eq(Shares.text("Dune", null), "Dune", "a subject alone");
        eq(Shares.underDraft("call the lab\n", "https://example.org/x"), "call the lab\nhttps://example.org/x", "under the draft");
        eq(Shares.underDraft("  ", "https://example.org/x"), "https://example.org/x", "no draft: the share");
        eq(Shares.underDraft("call the lab", null), "call the lab", "no share: the draft");
        eq(Shares.quote("spin liquid\n\nground state\n"), "> spin liquid\n>\n> ground state", "selected text: a quote");
        eq(Shares.quote("  "), null, "nothing selected: nothing");
        System.out.println("SharesTest: ok");
    }
}
