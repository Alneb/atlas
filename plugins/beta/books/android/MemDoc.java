package org.atlas.plugins.books;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** A book made in memory from a format that is not an EPUB (Formats: MOBI, FB2, TXT): its chapters as HTML entries
 *  (`c0.html`, …) and its pictures (`img/<id>`), read by the reader exactly as an EPUB's are. */
final class MemDoc implements Doc {
    private final Map<String, byte[]> entries = new LinkedHashMap<>();
    private final Map<String, String> types = new HashMap<>();
    private final List<String> spine = new ArrayList<>();
    private final List<Long> sizes = new ArrayList<>();
    private final List<Epub.Toc> toc = new ArrayList<>();
    String title = "", author = "", cover;

    /** A chapter: `body` is HTML body content; `label` its line in the contents (none when empty). */
    void chapter(String label, String body) {
        String name = "c" + spine.size() + ".html";
        String html = "<!DOCTYPE html>\n<html><head><meta charset=\"utf-8\"/><title>"
            + esc(label) + "</title></head><body>" + body + "</body></html>";
        byte[] b = html.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        entries.put(name, b);
        types.put(name, "text/html"); // parsed leniently: a MOBI's HTML is not XML
        spine.add(name);
        sizes.add((long) b.length);
        if (!label.isEmpty()) toc.add(new Epub.Toc(label, name, "", 0));
    }

    /** A picture, as `img/<id>`; returns that entry's name. */
    String picture(String id, byte[] bytes, String type) {
        String name = "img/" + id;
        entries.put(name, bytes);
        types.put(name, type != null ? type : sniff(bytes));
        return name;
    }

    static String sniff(byte[] b) {
        if (b.length > 3 && (b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8) return "image/jpeg";
        if (b.length > 3 && b[0] == (byte) 0x89 && b[1] == 'P') return "image/png";
        if (b.length > 3 && b[0] == 'G' && b[1] == 'I') return "image/gif";
        return "application/octet-stream";
    }

    static String esc(String s) { return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;"); }

    @Override public String title() { return title; }
    @Override public String author() { return author; }
    @Override public String cover() { return cover; }
    @Override public List<String> spine() { return spine; }
    @Override public List<Long> sizes() { return sizes; }
    @Override public List<Epub.Toc> toc() { return toc; }
    @Override public boolean has(String entry) { return entries.containsKey(entry); }
    @Override public InputStream open(String entry) throws IOException { return new ByteArrayInputStream(bytes(entry)); }
    @Override public byte[] bytes(String entry) throws IOException {
        byte[] b = entries.get(entry);
        if (b == null) throw new IOException("no " + entry + " in the book");
        return b;
    }
    @Override public String type(String entry) { String t = types.get(entry); return t != null ? t : "application/octet-stream"; }
    @Override public void close() {}
}
