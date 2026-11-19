package org.atlas.plugins.manga;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** The native library's rules (Shelf): its tabs from the server's categories and the vault, what each tab lists, and
 *  where a series' Continue opens (android/test/run.sh). A failed check prints what it got and the run exits 1. */
public final class ShelfTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    private static Shelf.Item server(String title, long lastRead, String... cats) {
        Shelf.Item i = new Shelf.Item("suwayomi:" + title.hashCode(), title, Shelf.Origin.SERVER);
        i.categories.addAll(Arrays.asList(cats));
        i.lastRead = lastRead;
        return i;
    }

    private static Shelf.Item vault(String title, long lastRead) {
        Shelf.Item i = new Shelf.Item("manga/" + title, title, Shelf.Origin.VAULT);
        i.lastRead = lastRead;
        return i;
    }

    private static List<String> titles(List<Shelf.Item> items) {
        List<String> out = new ArrayList<>();
        for (Shelf.Item i : items) out.add(i.title);
        return out;
    }

    public static void main(String[] a) {
        tabs();
        shelves();
        orders();
        shows();
        resume();
        small();
        System.out.println("ShelfTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }

    static void tabs() {
        List<Shelf.Item> lib = new ArrayList<>(Arrays.asList(server("Berserk", 0, "Weekly"), server("Akira", 0), server("Monster", 0, "Done", "Weekly"), vault("Local", 0)));
        eq("categories by name, Default first for the uncategorised, the vault last", Arrays.asList("Default", "Done", "Weekly", "In the vault"), Shelf.tabs(lib, "Suwayomi"));
        lib.get(1).lastRead = 5;
        eq("Reading first once anything was started", Arrays.asList("Reading", "Default", "Done", "Weekly", "In the vault"), Shelf.tabs(lib, "Suwayomi"));
        List<Shelf.Item> plain = Arrays.asList(server("A", 0), server("B", 0));
        eq("a server with no categories is one tab, named for it", Arrays.asList("Suwayomi"), Shelf.tabs(plain, "Suwayomi"));
        List<Shelf.Item> allIn = Arrays.asList(server("A", 0, "Weekly"), server("B", 0, "Weekly"));
        eq("no Default when every series has a category", Arrays.asList("Weekly"), Shelf.tabs(allIn, "Suwayomi"));
        eq("only the vault", Arrays.asList("In the vault"), Shelf.tabs(Arrays.asList(vault("x", 0)), "Suwayomi"));
        eq("an empty library has no tabs", new ArrayList<String>(), Shelf.tabs(new ArrayList<>(), "Suwayomi"));
        eq("categories in natural order", Arrays.asList("Vol 2", "Vol 10"), Shelf.tabs(Arrays.asList(server("a", 0, "Vol 10"), server("b", 0, "Vol 2")), "S"));
    }

    static void shelves() {
        List<Shelf.Item> lib = Arrays.asList(server("Vinland Saga", 30, "Weekly"), server("Akira", 0), server("Monster 10", 0, "Weekly"),
            server("Monster 2", 0, "Weekly"), vault("Local Comic", 50), vault("Another", 0));
        eq("a category's series by title, numbers as numbers", Arrays.asList("Monster 2", "Monster 10", "Vinland Saga"), titles(Shelf.shelf("Weekly", lib, null, "S")));
        eq("Default: the server's series in no category", Arrays.asList("Akira"), titles(Shelf.shelf("Default", lib, "", "S")));
        eq("the vault's tab", Arrays.asList("Another", "Local Comic"), titles(Shelf.shelf(Shelf.VAULT, lib, null, "S")));
        eq("Reading: started ones, last read first, from both", Arrays.asList("Local Comic", "Vinland Saga"), titles(Shelf.shelf(Shelf.READING, lib, null, "S")));
        eq("the filter: every word, any case", Arrays.asList("Monster 10"), titles(Shelf.shelf("Weekly", lib, "monster 10", "S")));
        eq("the filter matches nothing", new ArrayList<String>(), titles(Shelf.shelf("Weekly", lib, "zzz", "S")));
        List<Shelf.Item> plain = Arrays.asList(server("B", 0), server("A", 0), vault("V", 0));
        eq("a server with no categories: its one tab lists all of it", Arrays.asList("A", "B"), titles(Shelf.shelf("Suwayomi", plain, null, "Suwayomi")));
    }

    static void shows() {
        Shelf.Item fresh = server("Fresh", 0), started = server("Started", 9), kept = server("Kept", 0), local = vault("Local", 0);
        fresh.unread = 12; fresh.downloaded = 0;
        started.unread = 0; started.downloaded = 0;
        kept.downloaded = 3;
        List<Shelf.Item> lib = Arrays.asList(fresh, started, kept, server("Unknown", 0), local);
        List<Shelf.Item> plainLib = new ArrayList<>(lib);
        eq("all", Arrays.asList("Fresh", "Kept", "Started", "Unknown"), titles(Shelf.shelf("S", plainLib, null, "S", Shelf.Order.TITLE, false, Shelf.Show.ALL)));
        eq("unread: chapters left", Arrays.asList("Fresh"), titles(Shelf.shelf("S", plainLib, null, "S", Shelf.Order.TITLE, false, Shelf.Show.UNREAD)));
        eq("started: read once", Arrays.asList("Started"), titles(Shelf.shelf("S", plainLib, null, "S", Shelf.Order.TITLE, false, Shelf.Show.STARTED)));
        eq("downloaded: the server's kept ones", Arrays.asList("Kept"), titles(Shelf.shelf("S", plainLib, null, "S", Shelf.Order.TITLE, false, Shelf.Show.DOWNLOADED)));
        eq("downloaded: the vault's series are files", Arrays.asList("Local"), titles(Shelf.shelf(Shelf.VAULT, plainLib, null, "S", Shelf.Order.TITLE, false, Shelf.Show.DOWNLOADED)));
        eq("an unknown word is all", Shelf.Show.ALL, Shelf.Show.of("whatever"));
    }

    static void resume() {
        eq("nothing read: the first chapter", "START 0:0", Shelf.resume(new boolean[3], new int[3], -1).toString());
        eq("the last one half read: there, at its page", "CONTINUE 1:7", Shelf.resume(new boolean[] { true, false, false }, new int[] { 0, 7, 0 }, 1).toString());
        eq("the last one finished: the next unread", "NEXT 2:0", Shelf.resume(new boolean[] { true, true, false }, new int[3], 1).toString());
        eq("finished, unread ones only before it: the first of those", "NEXT 0:0", Shelf.resume(new boolean[] { false, true, true }, new int[3], 2).toString());
        eq("everything read: again from the start", "AGAIN 0:0", Shelf.resume(new boolean[] { true, true }, new int[2], 1).toString());
        eq("read ones but no last: the first unread, as a next", "NEXT 2:0", Shelf.resume(new boolean[] { true, true, false }, new int[3], -1).toString());
        eq("no chapters", "NONE -1:0", Shelf.resume(new boolean[0], new int[0], -1).toString());
        eq("a last outside the list (chapters removed) is no last", "START 0:0", Shelf.resume(new boolean[2], new int[2], 5).toString());
    }

    static void small() {
        eq("unread", 2, Shelf.unread(new boolean[] { true, false, false }));
        eq("the next unread to keep, from Continue on", Arrays.asList(1, 3), Shelf.next(new boolean[] { false, false, true, false, false }, 1, 2));
        eq("mark previous as read", Arrays.asList(0, 1, 2), Shelf.before(3));
        eq("Suwayomi's seconds become ms", 1_700_000_000_000L, Shelf.millis(1_700_000_000L));
        eq("ms stay ms", 1_700_000_000_000L, Shelf.millis(1_700_000_000_000L));
        eq("never read", 0L, Shelf.millis(0));
        eq("natural order", true, Shelf.natural("ch 2", "ch 10") < 0);
    }

    /** The order chosen for the library: every tab follows it, turned round on asking, ties by title. */
    private static void orders() {
        Shelf.Item a = server("Alpha", 0), b = server("Beta 10", 5), c = server("Beta 9", 9), d = server("Gamma", 1);
        a.unread = 3; b.unread = 12; c.unread = 0; d.unread = 3;
        a.chapters = 40; b.chapters = 12; c.chapters = 90; d.chapters = 3;
        List<Shelf.Item> all = Arrays.asList(d, c, b, a);
        String tab = "srv";
        eq("auto: by title, numbers as numbers", Arrays.asList("Alpha", "Beta 9", "Beta 10", "Gamma"), titles(Shelf.shelf(tab, all, "", tab, Shelf.Order.AUTO, false)));
        eq("auto, Reading: last read first", Arrays.asList("Beta 9", "Beta 10", "Gamma"), titles(Shelf.shelf(Shelf.READING, all, "", tab, Shelf.Order.AUTO, false)));
        eq("title, turned round", Arrays.asList("Gamma", "Beta 10", "Beta 9", "Alpha"), titles(Shelf.shelf(tab, all, "", tab, Shelf.Order.TITLE, true)));
        eq("unread: most first, a tie by title", Arrays.asList("Beta 10", "Alpha", "Gamma", "Beta 9"), titles(Shelf.shelf(tab, all, "", tab, Shelf.Order.UNREAD, false)));
        eq("chapters: most first", Arrays.asList("Beta 9", "Alpha", "Beta 10", "Gamma"), titles(Shelf.shelf(tab, all, "", tab, Shelf.Order.CHAPTERS, false)));
        eq("last read on another tab: newest first, never read last", Arrays.asList("Beta 9", "Beta 10", "Gamma", "Alpha"), titles(Shelf.shelf(tab, all, "", tab, Shelf.Order.LAST_READ, false)));
        eq("the setting's words", Arrays.asList(Shelf.Order.UNREAD, Shelf.Order.AUTO, Shelf.Order.LAST_READ), Arrays.asList(Shelf.Order.of("unread"), Shelf.Order.of("nonsense"), Shelf.Order.of("last read")));
    }
}
