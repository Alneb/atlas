package org.atlas.capture;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

/**
 * Who is where, as the phone's Files lists it (plain data, no Android: WhereRowsTest, android/test/run.sh): the places
 * the vault's core keeps from the live `where` room (`GET /api/where`, core live.rs `Rooms::places`) made into an
 * "On your other devices" section above the vault's top folder. A tap opens the file at its place: a PDF at its page,
 * a note at its line (PlaceItem.line, which FilesScreen's opener hands on). This device is left out by its own id —
 * the page in this app says it with every place (ui lib/where.svelte.ts, AtlasActivity's bridge `deviceId`) — and so
 * is a file another device shows too, once.
 */
final class WhereRows {
    private WhereRows() {}

    static final String HEADER = "On your other devices";

    /** One device's place, as `/api/where` lists it. */
    static final class Place {
        final String name, device, path;
        /** A PDF's page, a note's line (1-based); 0: none said. */
        final int page, line;

        Place(String name, String device, String path, int page, int line) {
            this.name = name == null || name.isEmpty() ? "another device" : name;
            this.device = device == null ? "" : device;
            this.path = path;
            this.page = page;
            this.line = line;
        }
    }

    /** The section's lines: a header and one row per other device's file (the first device to show a file names it),
     *  nothing at all when no other device shows anything. `self`: this device's id (null or empty: none known, all
     *  listed); `shown` names a file as the app does (Look.shownName). */
    static List<PlaceItem> rows(List<Place> places, String self, Function<String, String> shown) {
        List<PlaceItem> out = new ArrayList<>();
        List<String> seen = new ArrayList<>();
        for (Place p : places) {
            if (p.path == null || p.path.isEmpty() || seen.contains(p.path)) continue;
            if (self != null && !self.isEmpty() && self.equals(p.device)) continue;
            seen.add(p.path);
            PlaceItem r = PlaceItem.row(shown.apply(p.path));
            r.path = p.path;
            r.icon = FileRows.icon(p.path.substring(p.path.lastIndexOf('/') + 1), false);
            r.line = p.page > 0 ? p.page : p.line; // the opener's "line" is a PDF's page (as the page's specForPath reads it)
            r.detail = p.name + (p.page > 0 ? " · page " + p.page : p.line > 0 ? " · line " + p.line : "");
            r.more = true;
            out.add(r);
        }
        if (!out.isEmpty()) out.add(0, PlaceItem.header(HEADER));
        return out;
    }

    /** The vault's top folder with who is where above it: under a header of its own (`folder`, the vault's name) when
     *  there is a section above and the folder's list does not start with a header already. */
    static List<PlaceItem> above(List<PlaceItem> where, List<PlaceItem> folder, String name) {
        if (where.isEmpty()) return folder;
        List<PlaceItem> out = new ArrayList<>(where);
        if (!folder.isEmpty() && !folder.get(0).header()) out.add(PlaceItem.header(name));
        out.addAll(folder);
        return out;
    }
}
