package org.atlas.plugins.books;

import android.util.Xml;

import org.xmlpull.v1.XmlPullParser;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** An EPUB opened from a file on the device (Host.local: a server's book is fetched once): the container → the
 *  package (OPF) → its metadata, cover, spine and manifest, and the contents from the EPUB 3 nav or the EPUB 2 NCX —
 *  the same reading as the web side's (view.js openEpub), so both name chapters alike. Entries are read on demand. */
final class Epub implements Doc {
    /** A line of the contents: its label, the spine entry it opens, the `#anchor` in it, how deep it is. */
    static final class Toc {
        final String label, path, frag;
        final int depth;
        Toc(String label, String path, String frag, int depth) { this.label = label; this.path = path; this.frag = frag; this.depth = depth; }
    }

    private final ZipFile zip;
    String title = "", author = "", cover;
    final List<String> spine = new ArrayList<>();
    /** Each spine entry's size (bytes): where you are in the book, as a share of its text. */
    final List<Long> sizes = new ArrayList<>();
    final List<Toc> toc = new ArrayList<>();
    private final Map<String, String> types = new HashMap<>(); // entry → media type

    Epub(File f) throws IOException {
        zip = new ZipFile(f);
        try { read(); } catch (IOException e) { zip.close(); throw e; } catch (Exception e) { zip.close(); throw new IOException("not an EPUB (" + e.getMessage() + ")"); }
    }

    @Override public boolean has(String entry) { return zip.getEntry(entry) != null; }

    @Override public InputStream open(String entry) throws IOException {
        ZipEntry e = zip.getEntry(entry);
        if (e == null) throw new IOException("no " + entry + " in the book");
        return zip.getInputStream(e);
    }

    @Override public byte[] bytes(String entry) throws IOException {
        try (InputStream in = open(entry)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    /** An entry's media type: the manifest's, else from its extension. */
    @Override public String type(String entry) {
        String t = types.get(entry);
        if (t != null) return t;
        String low = entry.toLowerCase(java.util.Locale.ROOT);
        if (low.endsWith(".css")) return "text/css";
        if (low.endsWith(".png")) return "image/png";
        if (low.endsWith(".jpg") || low.endsWith(".jpeg")) return "image/jpeg";
        if (low.endsWith(".gif")) return "image/gif";
        if (low.endsWith(".svg")) return "image/svg+xml";
        if (low.endsWith(".webp")) return "image/webp";
        if (low.endsWith(".ttf")) return "font/ttf";
        if (low.endsWith(".otf")) return "font/otf";
        if (low.endsWith(".woff")) return "font/woff";
        if (low.endsWith(".woff2")) return "font/woff2";
        return "application/xhtml+xml";
    }

    @Override public String title() { return title; }
    @Override public String author() { return author; }
    @Override public String cover() { return cover; }
    @Override public List<String> spine() { return spine; }
    @Override public List<Long> sizes() { return sizes; }
    @Override public List<Toc> toc() { return toc; }

    @Override public void close() throws IOException { zip.close(); }

    // ---- reading the package -------------------------------------------------------------------------------------

    private void read() throws Exception {
        String opf = null;
        XmlPullParser x = parser("META-INF/container.xml");
        for (int ev = x.getEventType(); ev != XmlPullParser.END_DOCUMENT; ev = x.next())
            if (ev == XmlPullParser.START_TAG && "rootfile".equals(x.getName())) { opf = x.getAttributeValue(null, "full-path"); break; }
        if (opf == null) throw new IOException("no package in META-INF/container.xml");
        Map<String, String> hrefs = new HashMap<>(); // manifest id → entry
        Map<String, String> props = new HashMap<>(); // manifest id → properties
        List<String> spineIds = new ArrayList<>();
        String ncx = null, coverId = null, tocId = null;
        x = parser(opf);
        String text = null;
        for (int ev = x.getEventType(); ev != XmlPullParser.END_DOCUMENT; ev = x.next()) {
            if (ev == XmlPullParser.START_TAG) {
                String n = local(x.getName());
                text = null;
                if (n.equals("item")) {
                    String id = x.getAttributeValue(null, "id"), href = x.getAttributeValue(null, "href");
                    if (id == null || href == null) continue;
                    String entry = resolve(opf, href);
                    hrefs.put(id, entry);
                    String t = x.getAttributeValue(null, "media-type");
                    if (t != null) types.put(entry, t);
                    String p = x.getAttributeValue(null, "properties");
                    if (p != null) props.put(id, p);
                    if ("application/x-dtbncx+xml".equals(t)) ncx = entry;
                } else if (n.equals("itemref")) {
                    String id = x.getAttributeValue(null, "idref");
                    if (id != null && !"no".equals(x.getAttributeValue(null, "linear"))) spineIds.add(id);
                } else if (n.equals("meta") && "cover".equals(x.getAttributeValue(null, "name"))) {
                    coverId = x.getAttributeValue(null, "content");
                } else if (n.equals("spine")) {
                    tocId = x.getAttributeValue(null, "toc");
                }
            } else if (ev == XmlPullParser.TEXT) {
                text = x.getText();
            } else if (ev == XmlPullParser.END_TAG && text != null) {
                String n = local(x.getName());
                if (n.equals("title") && title.isEmpty()) title = text.trim();
                else if (n.equals("creator") && author.isEmpty()) author = text.trim();
                text = null;
            }
        }
        for (String id : spineIds) {
            String e = hrefs.get(id);
            if (e == null) continue;
            spine.add(e);
            ZipEntry z = zip.getEntry(e);
            sizes.add(z == null ? 0L : Math.max(1L, z.getSize()));
        }
        if (spine.isEmpty()) throw new IOException("the book has no chapters");
        for (Map.Entry<String, String> p : props.entrySet()) {
            if (p.getValue().contains("cover-image")) cover = hrefs.get(p.getKey());
        }
        if (cover == null && coverId != null) cover = hrefs.get(coverId);
        String nav = null;
        for (Map.Entry<String, String> p : props.entrySet()) if (p.getValue().contains("nav")) nav = hrefs.get(p.getKey());
        if (ncx == null && tocId != null) ncx = hrefs.get(tocId);
        try {
            if (nav != null) navToc(nav);
            if (toc.isEmpty() && ncx != null) ncxToc(ncx);
        } catch (Exception e) { toc.clear(); } // a broken contents: the book still reads
    }

    /** EPUB 3: the nav document's `<nav epub:type="toc">`, its nested `<ol>`s as depth. */
    private void navToc(String nav) throws Exception {
        XmlPullParser x = parser(nav);
        int depth = -1, inToc = 0;
        String href = null;
        StringBuilder label = null;
        for (int ev = x.getEventType(); ev != XmlPullParser.END_DOCUMENT; ev = x.next()) {
            if (ev == XmlPullParser.START_TAG) {
                String n = local(x.getName());
                if (n.equals("nav")) {
                    String type = attr(x, "type");
                    if (inToc > 0) inToc++;
                    else if (type != null && type.contains("toc")) inToc = 1;
                } else if (inToc > 0 && n.equals("ol")) depth++;
                else if (inToc > 0 && n.equals("a")) { href = x.getAttributeValue(null, "href"); label = new StringBuilder(); }
            } else if (ev == XmlPullParser.TEXT && label != null) {
                label.append(x.getText());
            } else if (ev == XmlPullParser.END_TAG) {
                String n = local(x.getName());
                if (n.equals("nav") && inToc > 0) inToc--;
                else if (inToc > 0 && n.equals("ol")) depth--;
                else if (n.equals("a") && label != null) { add(nav, href, label.toString(), Math.max(0, depth)); label = null; href = null; }
            }
        }
    }

    /** EPUB 2: the NCX's navPoints, nested as depth. */
    private void ncxToc(String ncx) throws Exception {
        XmlPullParser x = parser(ncx);
        int depth = -1;
        String label = null;
        boolean inText = false;
        for (int ev = x.getEventType(); ev != XmlPullParser.END_DOCUMENT; ev = x.next()) {
            if (ev == XmlPullParser.START_TAG) {
                String n = local(x.getName());
                if (n.equals("navPoint")) { depth++; label = ""; }
                else if (n.equals("text") && label != null) inText = true;
                else if (n.equals("content") && label != null) { add(ncx, x.getAttributeValue(null, "src"), label, Math.max(0, depth)); label = null; }
            } else if (ev == XmlPullParser.TEXT && inText && label != null) {
                label += x.getText();
            } else if (ev == XmlPullParser.END_TAG) {
                String n = local(x.getName());
                if (n.equals("text")) inText = false;
                else if (n.equals("navPoint")) depth--;
            }
        }
    }

    private void add(String base, String href, String label, int depth) {
        if (href == null) return;
        String frag = "";
        int hash = href.indexOf('#');
        if (hash >= 0) { frag = href.substring(hash + 1); href = href.substring(0, hash); }
        String path = href.isEmpty() ? base : resolve(base, href);
        toc.add(new Toc(label.replaceAll("\\s+", " ").trim(), path, frag, depth));
    }

    private XmlPullParser parser(String entry) throws Exception {
        XmlPullParser x = Xml.newPullParser();
        x.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false);
        x.setInput(open(entry), null);
        return x;
    }

    /** `epub:type` and plain `type` alike (namespaces are not processed). */
    private static String attr(XmlPullParser x, String name) {
        for (int i = 0; i < x.getAttributeCount(); i++) if (local(x.getAttributeName(i)).equals(name)) return x.getAttributeValue(i);
        return null;
    }

    private static String local(String n) { int c = n.indexOf(':'); return c < 0 ? n : n.substring(c + 1); }

    /** `href` from entry `base`'s folder, as a zip entry name (`..` followed, `%20` decoded). */
    static String resolve(String base, String href) {
        try { href = URLDecoder.decode(href.replace("+", "%2B"), "UTF-8"); } catch (Exception e) { /* as it is */ }
        List<String> parts = new ArrayList<>();
        if (!href.startsWith("/")) {
            int slash = base.lastIndexOf('/');
            if (slash > 0) for (String p : base.substring(0, slash).split("/")) parts.add(p);
        }
        for (String p : href.split("/")) {
            if (p.equals("..")) { if (!parts.isEmpty()) parts.remove(parts.size() - 1); }
            else if (!p.isEmpty() && !p.equals(".")) parts.add(p);
        }
        return String.join("/", parts);
    }

    static String text(byte[] b) { return new String(b, StandardCharsets.UTF_8); }
}
