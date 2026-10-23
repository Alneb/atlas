package org.atlas.plugins.notepad;

import android.graphics.RectF;

import org.atlas.capture.Host;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** The drawing as Notepad holds it — its items in drawing order and its pages — and what changed since the last save.
 *  Saving merges into the file as it is then (the desktop or another device may have written it meanwhile): elements
 *  changed here replace theirs where they stand, erased ones go, new ones are added at the end; everything else in
 *  the file stays as it was. */
final class Scene {
    final List<Item> items = new ArrayList<>();
    final List<Page> pages = new ArrayList<>();
    final IdMaker ids = new IdMaker();
    /** Draws the strokes' ink (undo of a resize draws it again). */
    Host host;
    /** The paper of a page added here (the setting `paper`). */
    Page.Paper paper = Page.Paper.BLANK;
    /** The scene's `files` (pictures), for the Painter. */
    JSONObject files = new JSONObject();
    private final Map<String, Item> dirty = new LinkedHashMap<>();
    private final Map<String, Page> dirtyPages = new LinkedHashMap<>();
    private final Set<String> gone = new HashSet<>();
    /** Pictures put in here, for the file's `files` at the next save. */
    private final Map<String, JSONObject> newFiles = new LinkedHashMap<>();
    // ---- live (core live.rs, LiveSocket): what changed here goes to the other devices with the drawing open, what they
    // change comes in by version, as Excalidraw's own merge does (the web side: ui lib/draw-live.ts)
    /** Ids changed here since the last send to the room. */
    private final Set<String> liveOut = new java.util.LinkedHashSet<>();
    /** The last element seen of each id (loaded, sent or received): a version to beat, a removal's last look. */
    private final Map<String, JSONObject> seen = new java.util.HashMap<>();
    /** Called when something changed here (the view sends it shortly after). */
    Runnable onLiveChange;
    private float density = 1;

    private void live(String id) {
        liveOut.add(id);
        if (onLiveChange != null) onLiveChange.run();
    }

    void load(String text, Host host, float density) {
        this.host = host;
        this.density = density;
        JSONObject scene;
        try { scene = new JSONObject(text == null || text.isEmpty() ? "{}" : text); } catch (JSONException e) { scene = new JSONObject(); }
        files = scene.optJSONObject("files") != null ? scene.optJSONObject("files") : new JSONObject();
        JSONArray els = scene.optJSONArray("elements");
        for (int i = 0; els != null && i < els.length(); i++) {
            JSONObject e = els.optJSONObject(i);
            if (e != null) seen.put(e.optString("id"), e);
            if (e == null || e.optBoolean("isDeleted")) continue;
            switch (e.optString("type")) {
                case "frame":
                case "magicframe":
                    pages.add(Page.from(e));
                    break;
                case "freedraw": {
                    Stroke s = Stroke.from(e, host, density);
                    if (s != null) items.add(s);
                    break;
                }
                case "selection":
                    break;
                default:
                    items.add(new Figure(copy(e)));
            }
        }
        sortPages();
    }

    private static JSONObject copy(JSONObject e) {
        try { return new JSONObject(e.toString()); } catch (JSONException x) { return e; }
    }

    /** Top to bottom, then left to right (draw-pages.ts pagesOf). */
    void sortPages() {
        // one row when the tops are within a quarter page (draw-pages.ts pagesOf alike), then left to right
        pages.sort((a, b) -> Math.abs(a.r.top - b.r.top) >= Page.H / 4 ? Float.compare(a.r.top, b.r.top) : Float.compare(a.r.left, b.r.left));
    }

    // ---- changes ---------------------------------------------------------------------------------------------------

    /** `it` put at `at` (-1: on top). */
    void add(Item it, int at) {
        items.add(at < 0 || at > items.size() ? items.size() : at, it);
        gone.remove(it.id);
        dirty.put(it.id, it);
        live(it.id);
    }

    /** `it` taken away; where it was (for undo), or -1. */
    int remove(Item it) {
        int at = items.indexOf(it);
        if (at < 0) return -1;
        items.remove(at);
        dirty.remove(it.id);
        gone.add(it.id);
        live(it.id);
        return at;
    }

    void changed(Item it) { if (items.contains(it)) { dirty.put(it.id, it); live(it.id); } }

    void changed(Page p) { dirtyPages.put(p.id, p); live(p.id); }

    boolean unsaved() { return !dirty.isEmpty() || !dirtyPages.isEmpty() || !gone.isEmpty() || !newFiles.isEmpty(); }

    /** A picture's file (Excalidraw's `files` entry: id, mimeType, dataURL, created) put in the scene. */
    void addFile(String id, JSONObject file) {
        try { files.put(id, file); } catch (JSONException e) { return; }
        newFiles.put(id, file);
    }

    /** The size of a first page (the format chosen for a new notebook; A4 portrait by default). */
    float pageW = Page.W, pageH = Page.H;

    /** A new page under the last, put in the drawing. */
    Page addPage() {
        Page p = nextPage();
        putPage(p);
        return p;
    }

    /** A new page under the last (the first one where the drawing already is, or at the origin), not yet put in. */
    /** Pages side by side (the setting `per_row`; Rnote's grid of pages). */
    int perRow = 4; // pages per row by default

    /** Slot `k` of the grid whose first page's corner is (x0, y0). */
    android.graphics.RectF slot(float x0, float y0, int k) {
        float x = x0 + (k % perRow) * (Page.W + Page.GAP), y = y0 + (k / perRow) * (Page.H + Page.GAP);
        return new android.graphics.RectF(x, y, x + Page.W, y + Page.H);
    }

    /** A new page in the grid's first free slot (a drawing laid out otherwise keeps its pages: they are never moved). */
    Page nextPage() {
        float x = 0, y = 0;
        if (!pages.isEmpty()) {
            float x0 = Float.MAX_VALUE, y0 = Float.MAX_VALUE;
            for (Page p : pages) { x0 = Math.min(x0, p.r.left); y0 = Math.min(y0, p.r.top); }
            for (int k = 0; ; k++) {
                android.graphics.RectF r = slot(x0, y0, k), near = new android.graphics.RectF(r);
                near.inset(-Page.GAP / 2, -Page.GAP / 2);
                boolean free = true;
                for (Page p : pages) if (android.graphics.RectF.intersects(p.r, near)) { free = false; break; }
                if (free) { x = r.left; y = r.top; break; }
            }
        } else if (!items.isEmpty()) {
            float mx = Float.MAX_VALUE, my = Float.MAX_VALUE;
            for (Item it : items) { mx = Math.min(mx, it.box.left); my = Math.min(my, it.box.top); }
            x = mx - Page.GAP;
            y = my - Page.GAP;
        }
        // the last page's size (a notebook of A5 or landscape pages stays so; draw-excalidraw.ts does the same), else the chosen format
        float w = pages.isEmpty() ? pageW : pages.get(pages.size() - 1).r.width(), h = pages.isEmpty() ? pageH : pages.get(pages.size() - 1).r.height();
        return new Page(ids.next("page"), new android.graphics.RectF(x, y, x + w, y + h), "Page " + (pages.size() + 1), paper, null);
    }

    /** `p` put in (again), in its place by position. */
    void putPage(Page p) {
        if (!pages.contains(p)) pages.add(p);
        sortPages();
        gone.remove(p.id);
        changed(p);
    }

    /** `p` taken out (its items stay; the caller takes them); where it was, or -1. */
    int removePage(Page p) {
        int at = pages.indexOf(p);
        if (at < 0) return -1;
        pages.remove(at);
        dirtyPages.remove(p.id);
        gone.add(p.id);
        live(p.id);
        return at;
    }

    /** The items on `p`: its frame's, or (with no frame) those whose middle is on it. */
    List<Item> itemsOn(Page p) {
        List<Item> out = new ArrayList<>();
        for (Item it : items)
            if (p.id.equals(it.frame) || (it.frame == null && p.r.contains(it.box.centerX(), it.box.centerY()))) out.add(it);
        return out;
    }

    /** Pages `a` and `b` change places, their items with them; numbered names ("Page 3") stay with the place. Its
     *  own inverse. */
    void swapPages(Page a, Page b) {
        List<Item> onA = itemsOn(a), onB = itemsOn(b);
        float dx = b.r.left - a.r.left, dy = b.r.top - a.r.top;
        for (Item it : onA) { it.moveBy(dx, dy); changed(it); }
        for (Item it : onB) { it.moveBy(-dx, -dy); changed(it); }
        android.graphics.RectF t = new android.graphics.RectF(a.r);
        a.r.set(b.r);
        b.r.set(t);
        if (numbered(a.name) && numbered(b.name)) { String n = a.name; a.name = b.name; b.name = n; }
        changed(a);
        changed(b);
        sortPages();
    }

    static boolean numbered(String name) { return name == null || name.matches("Page \\d+"); }

    Page pageAt(float x, float y) {
        for (Page p : pages) if (p.r.contains(x, y)) return p;
        return null;
    }

    /** `chosen` with the text bound inside any chosen shape (`containerId`, Excalidraw's labels): they go together. */
    List<Item> withBound(List<Item> chosen) {
        Set<String> ids = new HashSet<>();
        for (Item it : chosen) ids.add(it.id);
        List<Item> out = new ArrayList<>(chosen);
        for (Item it : items)
            if (it instanceof Figure && !ids.contains(it.id) && ids.contains(((Figure) it).e.optString("containerId", ""))) out.add(it);
        return out;
    }

    /** Copies of `originals` with new ids, moved by (dx, dy), linked among themselves as Excalidraw duplicates them: an
     *  arrow bound to a shape copied with it binds to that copy (else unbound), a label goes in its container's copy (else
     *  free), and the copies of a group form a new group. */
    static List<Item> copied(List<Item> originals, IdMaker ids, float dx, float dy) {
        Map<String, Item> of = new LinkedHashMap<>(); // original id → its copy
        for (Item it : originals) {
            Item c = it.copy(ids.next(it instanceof Stroke ? "pen" : "shape"), dx, dy);
            if (c != null) of.put(it.id, c);
        }
        Map<String, String> groups = new HashMap<>(); // a group copied gets one new id, shared by its copies
        for (Item c : of.values()) {
            if (!(c instanceof Figure)) continue;
            Figure f = (Figure) c;
            try {
                JSONArray g = f.e.optJSONArray("groupIds"), renewed = new JSONArray();
                for (int i = 0; g != null && i < g.length(); i++) renewed.put(groups.computeIfAbsent(g.optString(i), k -> ids.next("group")));
                if (g != null) f.e.put("groupIds", renewed);
                for (boolean start : new boolean[] { true, false }) {
                    String key = start ? "startBinding" : "endBinding";
                    Item to = f.boundTo(start) == null ? null : of.get(f.boundTo(start));
                    if (to instanceof Figure) { f.e.getJSONObject(key).put("elementId", to.id); f.listedOn((Figure) to, "arrow"); } // focus, gap kept
                    else if (f.e.has(key)) f.e.put(key, JSONObject.NULL);
                }
                String box = f.e.optString("containerId", "");
                if (box.isEmpty() || "null".equals(box)) continue;
                Item in = of.get(box);
                if (in instanceof Figure) { f.e.put("containerId", in.id); f.listedOn((Figure) in, "text"); }
                else f.e.put("containerId", JSONObject.NULL);
            } catch (JSONException ex) { /* ids only */ }
        }
        return new ArrayList<>(of.values());
    }

    /** A new arrow bound at each end that lies on a shape (the topmost bindable one within `reach`). */
    void bindArrow(Figure arrow, float reach) {
        for (boolean start : new boolean[] { true, false }) {
            float[] p = arrow.end(start);
            if (p == null) continue;
            for (int i = items.size() - 1; i >= 0; i--) {
                Item it = items.get(i);
                if (it == arrow || !(it instanceof Figure) || !((Figure) it).bindable()) continue;
                RectF b = new RectF(it.box);
                b.inset(-reach, -reach);
                if (b.contains(p[0], p[1])) { arrow.bind(start, (Figure) it); changed(it); break; }
            }
        }
    }

    /** The arrows bound to any of `moved` (and not moved with them) follow: their bound ends mapped as the items were
     *  (a move: d; the handles: scale s and turn a about A). Undo calls it with the inverse. */
    void follow(List<Item> moved, float dx, float dy, float ax, float ay, float s, float a) {
        Set<String> ids = new HashSet<>();
        for (Item it : moved) ids.add(it.id);
        for (Item it : items) {
            if (!(it instanceof Figure) || ids.contains(it.id)) continue;
            Figure f = (Figure) it;
            for (boolean start : new boolean[] { true, false }) {
                String to = f.boundTo(start);
                if (to != null && ids.contains(to)) { f.followEnd(start, dx, dy, ax, ay, s, a); changed(f); }
            }
        }
    }

    /** The topmost item touching (x, y) within r that carries a link, or null. */
    Item linkAt(float x, float y, float r) {
        for (int i = items.size() - 1; i >= 0; i--) {
            Item it = items.get(i);
            if (it.link() != null && it.touches(x, y, r)) return it;
        }
        return null;
    }

    // ---- saving --------------------------------------------------------------------------------------------------

    /** This screen's unsaved changes as elements, taken on the screen's thread (cheap: only what changed) and then
     *  no longer unsaved; `merge` writes them into the file on any thread. */
    static final class Changes {
        final Map<String, JSONObject> items = new LinkedHashMap<>(), frames = new LinkedHashMap<>();
        final Set<String> gone = new HashSet<>();
        final Map<String, JSONObject> files = new LinkedHashMap<>();
    }

    Changes takeChanges() throws JSONException {
        Changes c = new Changes();
        for (Map.Entry<String, Item> e : dirty.entrySet()) c.items.put(e.getKey(), e.getValue().element());
        for (Map.Entry<String, Page> e : dirtyPages.entrySet()) c.frames.put(e.getKey(), e.getValue().element());
        c.gone.addAll(gone);
        c.files.putAll(newFiles);
        saved();
        return c;
    }

    /** The file's text with `c` merged into `onDisk` (the file as it is now): what another device saved meanwhile
     *  stays. Off the screen's thread: a drawing with pictures is megabytes to parse and write. */
    static String merge(String onDisk, Changes c) throws JSONException {
        JSONObject scene;
        try { scene = new JSONObject(onDisk == null || onDisk.isEmpty() ? "{}" : onDisk); } catch (JSONException e) { scene = new JSONObject(); }
        JSONArray old = scene.optJSONArray("elements"), els = new JSONArray();
        Map<String, JSONObject> items = new LinkedHashMap<>(c.items), frames = new LinkedHashMap<>(c.frames);
        for (int i = 0; old != null && i < old.length(); i++) {
            JSONObject e = old.optJSONObject(i);
            if (e == null) continue;
            String id = e.optString("id");
            // erased: kept as Excalidraw keeps it, `isDeleted` with its version moved on — dropped, a desktop view still
            // holding it would merge it back as new
            if (c.gone.contains(id)) { els.put(e.optBoolean("isDeleted") ? e : Figure.changed(e.put("isDeleted", true))); continue; }
            JSONObject mine = items.remove(id), page = frames.remove(id);
            els.put(mine != null ? mine : page != null ? page : e);
        }
        for (JSONObject p : frames.values()) els.put(p); // frames before what they hold, as Excalidraw orders them
        for (JSONObject it : items.values()) els.put(it);
        if (!scene.has("type")) scene.put("type", "excalidraw").put("version", 2).put("source", "atlas (notepad)").put("files", new JSONObject())
            .put("appState", new JSONObject().put("viewBackgroundColor", "#ffffff"));
        scene.put("elements", els);
        if (!c.files.isEmpty()) {
            JSONObject f = scene.optJSONObject("files") != null ? scene.optJSONObject("files") : new JSONObject();
            for (Map.Entry<String, JSONObject> e : c.files.entrySet()) f.put(e.getKey(), e.getValue());
            scene.put("files", f);
        }
        return scene.toString();
    }

    /** What changed here since the last call, as elements for the room: each with a version above the last one seen (the
     *  others keep the higher), a removed one as its last look marked deleted. */
    JSONArray takeLive() throws JSONException {
        JSONArray out = new JSONArray();
        for (String id : liveOut) {
            JSONObject e = null;
            for (Item it : items) if (it.id.equals(id)) { e = it.element(); break; }
            if (e == null) for (Page p : pages) if (p.id.equals(id)) { e = p.element(); break; }
            JSONObject last = seen.get(id);
            if (e == null) {
                if (last == null || last.optBoolean("isDeleted")) continue;
                e = new JSONObject(last.toString()).put("isDeleted", true);
            }
            long v = Math.max(e.optLong("version", 0), last == null ? 0 : last.optLong("version", 0) + 1);
            e.put("version", v).put("versionNonce", java.util.concurrent.ThreadLocalRandom.current().nextInt(1, Integer.MAX_VALUE));
            seen.put(id, e);
            out.put(e);
        }
        liveOut.clear();
        return out;
    }

    /** Every element, for a device that has just come into the room. */
    JSONArray allElements() throws JSONException {
        JSONArray out = new JSONArray();
        for (Page p : pages) { JSONObject e = p.element(); seen.put(p.id, e); out.put(e); }
        for (Item it : items) { JSONObject e = it.element(); seen.put(it.id, e); out.put(e); }
        return out;
    }

    /** Elements another device changed, taken in where their version beats the one seen (not unsaved here: that device
     *  saves them). Whether anything changed. */
    boolean applyRemote(JSONArray els) {
        boolean any = false;
        for (int i = 0; els != null && i < els.length(); i++) {
            JSONObject e = els.optJSONObject(i);
            if (e == null) continue;
            String id = e.optString("id");
            JSONObject last = seen.get(id);
            if (id.isEmpty() || id.startsWith("live-draft-") || (last != null && last.optLong("version", 0) >= e.optLong("version", 0))) continue;
            seen.put(id, e);
            any = true;
            String type = e.optString("type");
            if ("frame".equals(type) || "magicframe".equals(type)) {
                int at = -1;
                for (int k = 0; k < pages.size(); k++) if (pages.get(k).id.equals(id)) at = k;
                if (at >= 0) pages.remove(at);
                if (!e.optBoolean("isDeleted")) pages.add(Page.from(e));
                sortPages();
                continue;
            }
            int at = -1;
            for (int k = 0; k < items.size(); k++) if (items.get(k).id.equals(id)) at = k;
            if (at >= 0) items.remove(at);
            if (e.optBoolean("isDeleted") || "selection".equals(type)) continue;
            Item it = "freedraw".equals(type) ? Stroke.from(e, host, density) : new Figure(copy(e));
            if (it != null) items.add(at >= 0 ? at : items.size(), it);
        }
        return any;
    }

    /** No longer unsaved: taken to be written (takeChanges), or the drawing deleted. */
    void saved() {
        dirty.clear();
        newFiles.clear();
        dirtyPages.clear();
        gone.clear();
    }
}
