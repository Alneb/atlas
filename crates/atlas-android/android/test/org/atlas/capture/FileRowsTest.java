package org.atlas.capture;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;

/** The Files screen's rules (FileRows) and the list's sticky headers (PlaceItem): sections, icons, details, breadcrumbs,
 *  a rename keeping the hidden extension (android/test/run.sh). A failed check prints what it got and the run exits 1. */
public final class FileRowsTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    /** Look.shownName's rule (Look needs Android): a text note without its extension, every other file with it. */
    static final Function<String, String> SHOWN = path -> {
        String b = path.replaceAll("/+$", "");
        b = b.substring(b.lastIndexOf('/') + 1);
        return b.matches("(?i).+\\.(md|markdown|txt|page)") && !b.matches("(?i).+\\.excalidraw\\.md") ? b.replaceFirst("(?i)\\.(md|markdown|txt|page)$", "") : b;
    };

    private static final ZoneId UTC = ZoneOffset.UTC;
    private static final long NOW = LocalDateTime.of(2026, 11, 17, 15, 0).toInstant(ZoneOffset.UTC).toEpochMilli();
    private static long at(int y, int mo, int d, int h, int mi) { return LocalDateTime.of(y, mo, d, h, mi).toEpochSecond(ZoneOffset.UTC); }

    private static FileRows.Entry dir(String path) { return new FileRows.Entry(path.substring(path.lastIndexOf('/') + 1), path, true, -1, 0, false, false); }
    private static FileRows.Entry file(String path, long size, long modified) { return new FileRows.Entry(path.substring(path.lastIndexOf('/') + 1), path, false, size, modified, false, false); }

    public static void main(String[] a) {
        // sections: folders, then files, headers only when both are there; the core's order kept
        List<PlaceItem> rows = FileRows.rows(Arrays.asList(dir("notes/b"), dir("notes/a"), file("notes/hubbard.md", 2400, at(2026, 11, 17, 14, 5)), file("notes/paper.pdf", 3_500_000, at(2026, 3, 2, 9, 0)),
            new FileRows.Entry("hidden.md", "notes/hidden.md", false, 10, 0, false, true)), SHOWN, NOW, UTC, Locale.ENGLISH);
        eq("folders then files, a header each", "[# Folders, - b @notes/b, - a @notes/a, # Files, - hubbard | 14:05 · 2.3 KB @notes/hubbard.md, - paper.pdf | 2 Mar · 3.3 MB @notes/paper.pdf]", rows.toString());
        eq("a folder is a folder, with the folder's icon", true, rows.get(1).folder && "vault".equals(rows.get(1).icon));
        eq("every row has its menu", true, rows.get(1).more && rows.get(4).more);
        List<PlaceItem> only = FileRows.rows(Arrays.asList(file("a.md", 1, 0), file("b.md", 1, 0)), SHOWN, NOW, UTC, Locale.ENGLISH);
        eq("files alone: no header", "[- a | 1 B @a.md, - b | 1 B @b.md]", only.toString());
        eq("an empty folder: an empty list", 0, FileRows.rows(Arrays.asList(), SHOWN, NOW, UTC, Locale.ENGLISH).size());
        FileRows.Entry ignored = new FileRows.Entry("cache", "cache", true, -1, 0, true, false);
        eq("an ignored entry is dimmed, not hidden", true, FileRows.rows(Arrays.asList(ignored), SHOWN, NOW, UTC, Locale.ENGLISH).get(0).dim);

        // icons by kind
        eq("a drawing", "pen", FileRows.icon("x.excalidraw.md", false));
        eq("a note", "note", FileRows.icon("X.MD", false));
        eq("a picture", "image", FileRows.icon("a.jpeg", false));
        eq("a PDF", "pages", FileRows.icon("a.pdf", false));
        eq("a comic", "library", FileRows.icon("v1.cbz", false));
        eq("an audiobook", "music", FileRows.icon("b.m4b", false));
        eq("a Base", "grid", FileRows.icon("t.base", false));
        eq("anything else", "text", FileRows.icon("main.rs", false));

        // sizes and dates
        eq("bytes", "812 B", FileRows.size(812));
        eq("one decimal under ten", "4.2 KB", FileRows.size(4300));
        eq("whole above ten", "13 MB", FileRows.size(13L * 1024 * 1024 + 1000));
        eq("today: the hour", "14:05", FileRows.when(at(2026, 11, 17, 14, 5), NOW, UTC, Locale.ENGLISH));
        eq("this year: the day", "2 Mar", FileRows.when(at(2026, 3, 2, 9, 0), NOW, UTC, Locale.ENGLISH));
        eq("before: the year too", "30 Dec 2025", FileRows.when(at(2025, 12, 30, 9, 0), NOW, UTC, Locale.ENGLISH));
        eq("no date: the size alone", "1 B", FileRows.detail(file("a", 1, 0), NOW, UTC, Locale.ENGLISH));

        // breadcrumbs and parents
        eq("the top alone", "[[Vault, ]]", str(FileRows.crumbs("", "Vault")));
        eq("each folder down to this one", "[[Vault, ], [refs, refs], [papers, refs/papers]]", str(FileRows.crumbs("/refs/papers/", "Vault")));
        eq("the parent", "refs", FileRows.parent("refs/papers"));
        eq("the top's parent is the top", "", FileRows.parent("refs"));

        // rename
        eq("a note keeps its hidden .md", "notes/Hubbard model.md", FileRows.renamed("notes/hubbard.md", "Hubbard model", SHOWN));
        eq("typed with it: not doubled", "notes/b.MD", FileRows.renamed("notes/hubbard.md", "b.MD", SHOWN));
        eq("a PDF shows its extension: as typed", "p.pdf", FileRows.renamed("a.pdf", "p.pdf", SHOWN));
        eq("unchanged: nothing to do", "null", String.valueOf(FileRows.renamed("notes/a.md", "a", SHOWN)));
        eq("a slash: refused", "null", String.valueOf(FileRows.renamed("a.md", "x/y", SHOWN)));
        eq("empty: refused", "null", String.valueOf(FileRows.renamed("a.md", "  ", SHOWN)));

        // the sticky header
        eq("a row's section is the header above it", 3, PlaceItem.headerFor(rows, 4));
        eq("a header is its own section", 0, PlaceItem.headerFor(rows, 0));
        eq("no header above: none", -1, PlaceItem.headerFor(only, 1));
        eq("the next header pushes it up", 3, PlaceItem.nextHeader(rows, 0));
        eq("none after the last", -1, PlaceItem.nextHeader(rows, 3));

        System.out.println("FileRowsTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }

    private static String str(List<String[]> crumbs) {
        StringBuilder s = new StringBuilder("[");
        for (String[] c : crumbs) s.append(s.length() > 1 ? ", " : "").append(Arrays.toString(c));
        return s.append(']').toString();
    }
}
