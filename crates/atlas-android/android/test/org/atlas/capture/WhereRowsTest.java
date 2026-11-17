package org.atlas.capture;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Who is where in the phone's Files (WhereRows, from `GET /api/where`): this device left out by its id, a file shown
 *  twice listed once, the place said and handed to the opener, the section above the vault's top folder
 *  (android/test/run.sh). A failed check prints what it got and the run exits 1. */
public final class WhereRowsTest {
    private static int failed, ran;

    private static void eq(String what, Object want, Object got) {
        ran++;
        if (want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got:  " + got);
    }

    public static void main(String[] a) {
        List<WhereRows.Place> places = Arrays.asList(
            new WhereRows.Place("desktop", "d-1", "notes/hubbard.md", 0, 42),
            new WhereRows.Place("phone", "phone-me", "notes/mine.md", 0, 3),        // this phone's own page: left out
            new WhereRows.Place("Boox", "", "refs/paper.pdf", 12, 0),
            new WhereRows.Place("desktop", "d-2", "notes/hubbard.md", 0, 7),        // the same file again: once
            new WhereRows.Place("", null, "drawings/plan.excalidraw", 0, 0),
            new WhereRows.Place("desktop", "d-3", "", 0, 0));                       // no file: nothing
        List<PlaceItem> rows = WhereRows.rows(places, "phone-me", FileRowsTest.SHOWN);
        eq("the section", "[# On your other devices, - hubbard | desktop · line 42 @notes/hubbard.md:42, - paper.pdf | Boox · page 12 @refs/paper.pdf:12, - plan.excalidraw | another device @drawings/plan.excalidraw]", rows.toString());
        eq("icons by the file's kind", "[note, pages, pen]", Arrays.asList(rows.get(1).icon, rows.get(2).icon, rows.get(3).icon).toString());
        eq("each row has the file's menu", true, rows.get(1).more && rows.get(2).more && rows.get(3).more);
        eq("no id known: every device listed", 5, WhereRows.rows(places, null, FileRowsTest.SHOWN).size());
        eq("nobody elsewhere: no section", 0, WhereRows.rows(Arrays.asList(places.get(1)), "phone-me", FileRowsTest.SHOWN).size());

        // above the vault's top folder: the folder gets a header of its own unless its list starts with one
        List<PlaceItem> folder = new ArrayList<>(Arrays.asList(PlaceItem.row("a")));
        eq("a header for the folder", "[# On your other devices, - hubbard | desktop · line 42 @notes/hubbard.md:42, # Vault, - a]", WhereRows.above(rows.subList(0, 2), folder, "Vault").toString());
        List<PlaceItem> sections = Arrays.asList(PlaceItem.header("Folders"), PlaceItem.row("b"));
        eq("the folder's own headers kept", "[# On your other devices, - hubbard | desktop · line 42 @notes/hubbard.md:42, # Folders, - b]", WhereRows.above(rows.subList(0, 2), sections, "Vault").toString());
        eq("nothing elsewhere: the folder as it is", folder, WhereRows.above(new ArrayList<>(), folder, "Vault"));
        eq("an empty folder: only who is where", 2, WhereRows.above(rows.subList(0, 2), new ArrayList<>(), "Vault").size());

        System.out.println("WhereRowsTest: " + (ran - failed) + "/" + ran + " passed");
        if (failed > 0) System.exit(1);
    }
}
