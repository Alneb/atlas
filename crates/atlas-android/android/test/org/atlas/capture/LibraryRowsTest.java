package org.atlas.capture;

import java.util.Arrays;
import java.util.List;

/** The phone's Library rules (LibraryRows): which libraries it shows, a library's answer read, the things narrowed to
 *  what is typed, their lines, the sort cycle, a plugin's own app (android/test/run.sh). A failed check prints what it
 *  got and the run exits 1. */
public final class LibraryRowsTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (String.valueOf(want).equals(String.valueOf(got))) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    public static void main(String[] a) {
        // the core's list: a given library (the page's) and a hidden one are not the phone's
        String list = "[{\"id\":\"drawings\",\"title\":\"drawings\",\"kind\":\"any\",\"icon\":\"folder\",\"source\":\"given\",\"folder\":\"\",\"base\":\"\",\"sort\":\"\",\"layout\":\"covers\",\"hidden\":false},"
            + "{\"id\":\"books\",\"title\":\"Books\",\"kind\":\"books\",\"icon\":\"library\",\"source\":\"folder\",\"folder\":\"Books\",\"base\":\"\",\"sort\":\"-last_read\",\"layout\":\"covers\",\"hidden\":false},"
            + "{\"id\":\"old\",\"title\":\"Old\",\"kind\":\"notes\",\"icon\":\"notes\",\"source\":\"folder\",\"folder\":\"Old\",\"base\":\"\",\"sort\":\"\",\"layout\":\"list\",\"hidden\":true},"
            + "{\"id\":\"films\",\"title\":\"Films\",\"kind\":\"video\",\"icon\":\"film\",\"source\":\"base\",\"folder\":\"\",\"base\":\"Films.base\",\"sort\":\"\",\"layout\":\"list\",\"hidden\":false}]";
        List<LibraryRows.Lib> libs = LibraryRows.libraries(list);
        eq("the phone's libraries", "[books, films]", Arrays.toString(libs.stream().map(l -> l.id).toArray()));
        eq("covers or a list", "true false", libs.get(0).covers() + " " + libs.get(1).covers());
        eq("the one asked", "films", LibraryRows.pick(libs, "films").id);
        eq("gone: the first", "books", LibraryRows.pick(libs, "nope").id);
        eq("none", "null", String.valueOf(LibraryRows.pick(List.of(), "x")));

        // a library's answer: the core's order and Continue row kept as sent
        String view = "{\"library\":{\"id\":\"books\",\"title\":\"Books\",\"kind\":\"books\",\"layout\":\"covers\",\"sort\":\"-last_read\"},"
            + "\"continue\":[{\"path\":\"Books/Dune.epub\",\"note\":\"Books/Dune.md\",\"title\":\"Dune\",\"sub\":\"Frank Herbert\",\"cover\":\"Books/Dune.epub\",\"progress\":0.42,\"last_read\":1763200800000,\"modified\":1,\"group\":\"\"}],"
            + "\"items\":[{\"path\":\"Books/Sci-fi/Solaris.epub\",\"note\":null,\"title\":\"Solaris\",\"sub\":\"Sci-fi\",\"cover\":null,\"progress\":1.0,\"last_read\":1763300000000,\"modified\":2,\"group\":\"Sci-fi\"},"
            + "{\"path\":\"Books/Dune.epub\",\"note\":\"Books/Dune.md\",\"title\":\"Dune\",\"sub\":\"Frank Herbert\",\"cover\":\"Books/Dune.epub\",\"progress\":0.42,\"last_read\":1763200800000,\"modified\":1,\"group\":\"\"},"
            + "{\"path\":\"Books/Hyperion.pdf\",\"note\":null,\"title\":\"Hyperion\",\"sub\":\"\",\"cover\":\"Books/Hyperion.pdf\",\"progress\":null,\"last_read\":null,\"modified\":3,\"group\":\"\"}]}";
        LibraryRows.View v = LibraryRows.view(view);
        eq("its library", "Books", v.lib.title);
        eq("continue", "Dune", v.continuing.get(0).title);
        eq("items in the core's order", "[Solaris, Dune, Hyperion]", Arrays.toString(v.items.stream().map(t -> t.title).toArray()));
        LibraryRows.Thing dune = v.items.get(1), solaris = v.items.get(0), hyperion = v.items.get(2);
        eq("no cover", "null", String.valueOf(solaris.cover));
        eq("a cover", "Books/Dune.epub", dune.cover);
        eq("last read", 1763200800000L, dune.lastRead);
        eq("never read", 0L, hyperion.lastRead);

        // lines
        eq("author and how far", "Frank Herbert · 42 %", LibraryRows.detail(dune));
        eq("finished", "Sci-fi · Finished", LibraryRows.detail(solaris));
        eq("nothing said", "", LibraryRows.detail(hyperion));

        // what is typed: every word, any case, in the title, the line or the path
        eq("one word", "[Dune]", Arrays.toString(LibraryRows.matching(v.items, "herb").stream().map(t -> t.title).toArray()));
        eq("two words", "[Solaris]", Arrays.toString(LibraryRows.matching(v.items, "SCI sol").stream().map(t -> t.title).toArray()));
        eq("nothing typed", 3, LibraryRows.matching(v.items, "  ").size());

        // the sort cycle, as the core reads it
        eq("title → last read", "-last_read", LibraryRows.nextSort(""));
        eq("last read → changed", "-modified", LibraryRows.nextSort("-last_read"));
        eq("changed → title", "", LibraryRows.nextSort("-modified"));
        eq("a library's own (a property) → title", "", LibraryRows.nextSort("year"));
        eq("its name", "Last read", LibraryRows.sortName("-last_read"));

        // kinds' icons: drawn ones only
        eq("icons", "library music pen vault", LibraryRows.icon("books") + " " + LibraryRows.icon("audio") + " " + LibraryRows.icon("drawings") + " " + LibraryRows.icon("odd"));

        // a plugin's own app: a native side that opens `<id>:library`, named by its manifest
        LibraryRows.App manga = LibraryRows.app("manga", p -> p.startsWith("manga:"), "# x\ntitle = \"Manga\"\nicon = \"file\"\n");
        eq("an app", "Manga manga:library", manga.title + " " + manga.address);
        eq("no manifest: its id", "Audiobookshelf", LibraryRows.app("audiobookshelf", p -> true, null).title);
        eq("a reader only: none", "null", String.valueOf(LibraryRows.app("books", p -> p.endsWith(".epub"), "title = \"Books\"")));

        System.out.println("LibraryRowsTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }
}
