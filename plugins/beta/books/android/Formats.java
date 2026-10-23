package org.atlas.plugins.books;

import android.util.Base64;
import android.util.Xml;

import org.xmlpull.v1.XmlPullParser;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.ByteBuffer;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** The book formats the reader opens besides EPUB: MOBI / AZW / AZW3 / PRC (Mobipocket and Kindle files without DRM), FB2 (and
 *  .fb2.zip), and plain text — each made into a MemDoc, chapters of HTML the reader shows as it shows an EPUB's. PDFs
 *  have their own view (PdfView). DjVu needs a native decoder (djvulibre) the app does not carry: not opened. */
final class Formats {
    private Formats() {}

    /** Books the library lists and the reader opens. */
    static boolean isBook(String path) {
        return path.toLowerCase(Locale.ROOT).matches(".+\\.(epub|pdf|mobi|azw3?|prc|fb2|fb2\\.zip|txt)");
    }

    /** What the reader takes from the rest of the app when it is opened: not plain text (that is a note's to open). */
    static boolean opens(String path) { return isBook(path) && !path.toLowerCase(Locale.ROOT).endsWith(".txt"); }

    /** A book's file name without its format's extension(s). */
    static String bare(String name) { return name.replaceFirst("(?i)\\.(epub|pdf|mobi|azw3?|prc|fb2\\.zip|fb2|txt)$", ""); }

    /** The book in `f` (named `path` in the vault), opened as its format says. */
    static Doc open(File f, String path) throws IOException {
        String low = path.toLowerCase(Locale.ROOT);
        if (low.endsWith(".epub")) return new Epub(f);
        byte[] b = read(new java.io.FileInputStream(f));
        if (low.endsWith(".fb2.zip")) b = firstInZip(b);
        if (low.endsWith(".fb2") || low.endsWith(".fb2.zip")) return fb2(b, bare(name(path)));
        if (low.matches(".+\\.(mobi|azw3?|prc)")) return mobi(b, bare(name(path)));
        if (low.endsWith(".txt")) return text(b, bare(name(path)));
        throw new IOException("not a book this reader opens");
    }

    private static String name(String path) { return path.substring(path.lastIndexOf('/') + 1); }

    static byte[] read(InputStream in) throws IOException {
        try (InputStream i = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            for (int n; (n = i.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private static byte[] firstInZip(byte[] zip) throws IOException {
        try (ZipInputStream z = new ZipInputStream(new ByteArrayInputStream(zip))) {
            for (ZipEntry e; (e = z.getNextEntry()) != null; ) if (!e.isDirectory()) return read(z);
        }
        throw new IOException("an empty archive");
    }

    // ---- plain text --------------------------------------------------------------------------------------------------

    /** A line that starts a chapter: "Chapter 3", "CAPÍTULO IV", "Part One", "Chapitre 2", "Kapitel 1", "1." alone. */
    private static final Pattern HEADING = Pattern.compile("(?iu)^\\s*((chapter|cap[ií]tulo|chapitre|kapitel|part|parte|partie|book|libro|livre)\\b.{0,60}|[0-9IVXLC]{1,6}\\.?)\\s*$");

    /** Text: UTF-8 (else Windows-1252), paragraphs at blank lines, chapters at heading lines (else every ~60 kB). */
    static Doc text(byte[] b, String name) {
        String t = decode(b).replace("\r\n", "\n").replace('\r', '\n');
        MemDoc d = new MemDoc();
        d.title = name;
        StringBuilder body = new StringBuilder(), para = new StringBuilder();
        String label = "";
        for (String line : t.split("\n", -1)) {
            boolean head = line.length() < 80 && HEADING.matcher(line).matches() && !line.trim().isEmpty();
            if (line.trim().isEmpty() || head) flushPara(body, para);
            if (head || body.length() > 60000) {
                if (body.length() > 0) d.chapter(label, body.toString());
                body.setLength(0);
                label = head ? line.trim() : "";
                if (head) { body.append("<h2>").append(MemDoc.esc(line.trim())).append("</h2>"); continue; }
            }
            if (!line.trim().isEmpty()) para.append(para.length() > 0 ? " " : "").append(line.trim());
        }
        flushPara(body, para);
        if (body.length() > 0 || d.spine().isEmpty()) d.chapter(label, body.toString());
        return d;
    }

    private static void flushPara(StringBuilder body, StringBuilder para) {
        if (para.length() == 0) return;
        body.append("<p>").append(MemDoc.esc(para.toString())).append("</p>\n");
        para.setLength(0);
    }

    private static String decode(byte[] b) {
        try { return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(b)).toString().replaceFirst("^﻿", ""); }
        catch (CharacterCodingException e) { return new String(b, Charset.forName("windows-1252")); }
    }

    // ---- FB2 ---------------------------------------------------------------------------------------------------------

    /** FictionBook 2: the title and authors from <description>, each top-level <section> of the main <body> a chapter
     *  (notes bodies after it), its pictures from <binary>. Elements mapped to HTML: title → h2, p, emphasis → em,
     *  strong, epigraph / cite → blockquote, poem's v → p, empty-line → br, image → img, a → a (notes as footnotes). */
    static Doc fb2(byte[] b, String name) throws IOException {
        MemDoc d = new MemDoc();
        Map<String, String> pictures = new HashMap<>();
        try {
            // binaries first: <image> refers to them by id, and they come at the end of the file
            XmlPullParser x = Xml.newPullParser();
            x.setInput(new ByteArrayInputStream(b), null);
            for (int ev = x.getEventType(); ev != XmlPullParser.END_DOCUMENT; ev = x.next()) {
                if (ev == XmlPullParser.START_TAG && "binary".equals(x.getName())) {
                    String id = x.getAttributeValue(null, "id"), type = x.getAttributeValue(null, "content-type");
                    byte[] pic = Base64.decode(x.nextText().trim(), Base64.DEFAULT);
                    if (id != null) pictures.put(id, d.picture(id, pic, type));
                }
            }
            x = Xml.newPullParser();
            x.setInput(new ByteArrayInputStream(b), null);
            StringBuilder html = new StringBuilder(), first = new StringBuilder(), last = new StringBuilder();
            String label = "", where = "";
            int depth = 0, bodies = 0; // section depth within the body
            boolean inTitle = false, inDescription = false, inAuthor = false, notes = false;
            String coverId = null;
            for (int ev = x.getEventType(); ev != XmlPullParser.END_DOCUMENT; ev = x.next()) {
                String tag = ev == XmlPullParser.START_TAG || ev == XmlPullParser.END_TAG ? x.getName() : "";
                if (ev == XmlPullParser.START_TAG) {
                    switch (tag) {
                        case "description": inDescription = true; break;
                        case "body": bodies++; notes = "notes".equals(x.getAttributeValue(null, "name")) || bodies > 1; if (notes) html.append("<hr/>"); break;
                        case "section":
                            depth++;
                            if (depth == 1 && !notes && html.length() > 0) { d.chapter(label, html.toString()); html.setLength(0); label = ""; }
                            String id = x.getAttributeValue(null, "id");
                            html.append("<section").append(id != null ? " id=\"" + MemDoc.esc(id) + "\"" : "").append(">");
                            break;
                        case "title": inTitle = true; if (!inDescription) html.append("<h2>"); break;
                        case "p": if (!inDescription) html.append("<p>"); break;
                        case "v": html.append("<p class=\"verse\">"); break;
                        case "emphasis": html.append("<em>"); break;
                        case "strong": html.append("<strong>"); break;
                        case "sup": html.append("<sup>"); break;
                        case "sub": html.append("<sub>"); break;
                        case "epigraph": case "cite": html.append("<blockquote>"); break;
                        case "subtitle": html.append("<h3>"); break;
                        case "empty-line": html.append("<br/>"); break;
                        case "author": if (inDescription && where.equals("title-info")) inAuthor = true; break;
                        case "title-info": where = "title-info"; break;
                        case "image": {
                            String href = href(x);
                            if (inDescription && "title-info".equals(where)) { if (href != null) coverId = href.replaceFirst("^#", ""); break; }
                            String src = href == null ? null : pictures.get(href.replaceFirst("^#", ""));
                            if (src != null) html.append("<img src=\"").append(src).append("\" alt=\"\"/>");
                            break;
                        }
                        case "a": {
                            String href = href(x);
                            html.append("<a href=\"").append(MemDoc.esc(href == null ? "" : href.startsWith("#") ? "#" + href.substring(1) : href)).append("\"")
                                .append("note".equals(x.getAttributeValue(null, "type")) ? " epub:type=\"noteref\"" : "").append(">");
                            break;
                        }
                        case "first-name": if (inAuthor) first.append(x.nextText().trim()); break;
                        case "last-name": if (inAuthor) last.append(x.nextText().trim()); break;
                        case "book-title": if (inDescription && "title-info".equals(where)) d.title = x.nextText().trim(); break;
                        default: break;
                    }
                } else if (ev == XmlPullParser.END_TAG) {
                    switch (tag) {
                        case "description": inDescription = false; break;
                        case "title-info": where = ""; break;
                        case "author": if (inAuthor) { String a = (first + " " + last).trim(); if (!a.isEmpty()) d.author = d.author.isEmpty() ? a : d.author + ", " + a; first.setLength(0); last.setLength(0); inAuthor = false; } break;
                        case "section": depth--; html.append("</section>"); break;
                        case "title": inTitle = false; if (!inDescription) html.append("</h2>"); break;
                        case "p": if (!inDescription) html.append("</p>"); break;
                        case "v": html.append("</p>"); break;
                        case "emphasis": html.append("</em>"); break;
                        case "strong": html.append("</strong>"); break;
                        case "sup": html.append("</sup>"); break;
                        case "sub": html.append("</sub>"); break;
                        case "epigraph": case "cite": html.append("</blockquote>"); break;
                        case "subtitle": html.append("</h3>"); break;
                        case "a": html.append("</a>"); break;
                        default: break;
                    }
                } else if (ev == XmlPullParser.TEXT && !inDescription) {
                    String t = x.getText();
                    html.append(MemDoc.esc(t));
                    if (inTitle && depth == 1 && label.length() < 80) label = (label + " " + t.trim()).trim();
                }
            }
            if (html.length() > 0 || d.spine().isEmpty()) d.chapter(label, html.toString());
            if (coverId != null && pictures.containsKey(coverId)) d.cover = pictures.get(coverId);
        } catch (org.xmlpull.v1.XmlPullParserException e) {
            throw new IOException("not a FictionBook file (" + e.getMessage() + ")");
        }
        if (d.title.isEmpty()) d.title = name;
        return d;
    }

    private static String href(XmlPullParser x) {
        for (int i = 0; i < x.getAttributeCount(); i++) if ("href".equals(x.getAttributeName(i)) || x.getAttributeName(i).endsWith(":href")) return x.getAttributeValue(i);
        return null;
    }

    // ---- MOBI / AZW ---------------------------------------------------------------------------------------------------

    /** Mobipocket and Kindle (KF8) books without DRM: the Palm database's text records, PalmDOC-decompressed with
     *  their trailing entries cut, read as the header's encoding; chapters at Mobipocket's page breaks (KF8: at its
     *  sections' starts); pictures from the first image record on, `recindex` (MOBI) and `kindle:embed` (KF8) pointing
     *  at them; title, author and cover from EXTH. HUFF/CDIC-compressed and encrypted books are refused, said why. */
    static Doc mobi(byte[] b, String name) throws IOException {
        if (b.length < 78 + 8) throw new IOException("too short for a Mobipocket file");
        int n = u16(b, 76);
        int[] rec = new int[n + 1];
        for (int i = 0; i < n; i++) rec[i] = (int) u32(b, 78 + 8 * i);
        rec[n] = b.length;
        int r0 = rec[0];
        int compression = u16(b, r0), records = u16(b, r0 + 8), encryption = u16(b, r0 + 12);
        if (encryption != 0) throw new IOException("this book is locked (DRM): it cannot be read here");
        if (compression == 17480) throw new IOException("this book is HUFF/CDIC-compressed, which the reader does not read yet");
        if (!"MOBI".equals(new String(b, r0 + 16, 4, StandardCharsets.ISO_8859_1))) throw new IOException("not a Mobipocket file");
        int headerLen = (int) u32(b, r0 + 20), encoding = (int) u32(b, r0 + 28);
        int firstImage = (int) u32(b, r0 + 0x6c);
        int extraFlags = headerLen >= 0xe4 ? u16(b, r0 + 0xf2) : 0;
        Charset cs = encoding == 65001 ? StandardCharsets.UTF_8 : Charset.forName("windows-1252");
        MemDoc d = new MemDoc();
        d.title = text(b, r0 + (int) u32(b, r0 + 0x54), (int) u32(b, r0 + 0x58), cs);
        int coverOffset = -1;
        if ((u32(b, r0 + 0x80) & 0x40) != 0) { // EXTH
            int e = r0 + 16 + headerLen;
            if (e + 12 <= b.length && "EXTH".equals(new String(b, e, 4, StandardCharsets.ISO_8859_1))) {
                int count = (int) u32(b, e + 8), at = e + 12;
                for (int i = 0; i < count && at + 8 <= b.length; i++) {
                    int type = (int) u32(b, at), len = (int) u32(b, at + 4);
                    if (len < 8 || at + len > b.length) break;
                    if (type == 100) d.author = d.author.isEmpty() ? text(b, at + 8, len - 8, cs) : d.author + ", " + text(b, at + 8, len - 8, cs);
                    else if (type == 503) d.title = text(b, at + 8, len - 8, cs);
                    else if (type == 201 && len >= 12) coverOffset = (int) u32(b, at + 8);
                    at += len;
                }
            }
        }
        if (d.title.isEmpty()) d.title = name;
        ByteArrayOutputStream all = new ByteArrayOutputStream();
        for (int i = 1; i <= records && i < n; i++) {
            int from = rec[i], to = Math.max(from, rec[i + 1] - trailing(b, from, rec[i + 1], extraFlags));
            if (compression == 2) palmdoc(b, from, to, all); else all.write(b, from, to - from);
        }
        // pictures: every image record from the first one, numbered from 1 as recindex counts
        Map<Integer, String> pics = new HashMap<>();
        if (firstImage > 0 && firstImage < n) for (int i = firstImage, k = 1; i < n; i++, k++) {
            int len = rec[i + 1] - rec[i];
            if (len < 4) continue;
            byte[] p = java.util.Arrays.copyOfRange(b, rec[i], rec[i + 1]);
            String type = MemDoc.sniff(p);
            if (type.startsWith("image/")) pics.put(k, d.picture(String.valueOf(k), p, type));
        }
        if (coverOffset >= 0) d.cover = pics.get(coverOffset + 1);
        String html = new String(all.toByteArray(), cs);
        boolean kf8 = html.contains("kindle:") || html.trim().startsWith("<?xml");
        if (kf8) { int end = html.lastIndexOf("</html>"); if (end > 0) html = html.substring(0, end + 7); } // KF8: its CSS flows follow the text
        html = html.replaceAll("(?is)<head\\b.*?</head>", "").replaceAll("<\\?xml[^>]*\\?>", "\u0000").replaceAll("(?i)</?(html|body)\\b[^>]*>", "");
        StringBuffer sb = new StringBuffer(); // Matcher.replaceAll(Function) is Android 14's: by hand
        Matcher m = RECINDEX.matcher(html);
        while (m.find()) { String p = pics.get(Integer.parseInt(m.group(2))); m.appendReplacement(sb, Matcher.quoteReplacement(m.group(1) + "src=\"" + (p != null ? p : "") + "\"")); }
        html = m.appendTail(sb).toString();
        sb = new StringBuffer();
        m = EMBED.matcher(html);
        while (m.find()) { String p = pics.get(base32(m.group(1))); m.appendReplacement(sb, Matcher.quoteReplacement(p != null ? p : "")); }
        html = m.appendTail(sb).toString();
        html = html.replaceAll("(?i)\\sfilepos=\"?\\d+\"?", "").replaceAll("href=\"kindle:pos:[^\"]*\"", "href=\"#\"");
        // chapters: Mobipocket's page breaks; KF8's parts (each was its own XHTML file, its declaration marked above)
        String[] parts = html.split("(?i)<mbp:pagebreak\\s*/?>(\\s*</mbp:pagebreak>)?|\u0000");
        for (String part : parts) {
            if (part.replaceAll("<[^>]*>", "").trim().isEmpty() && !part.contains("<img")) continue;
            Matcher h = HEADING_TAG.matcher(part);
            d.chapter(h.find() ? h.group(1).replaceAll("<[^>]*>", "").replaceAll("\\s+", " ").trim() : firstLine(part), part.replace("</mbp:pagebreak>", ""));
        }
        if (d.spine().isEmpty()) d.chapter("", html);
        return d;
    }

    /** A part's first short line of text, as its name in the contents (old Mobipocket books have no headings, only big
     *  bold text). */
    private static String firstLine(String part) {
        for (String line : part.replaceAll("(?i)<(/p|br|/div|/h\\d)\\b[^>]*>", "\n").replaceAll("<[^>]*>", "").split("\n")) {
            String t = line.replaceAll("\\s+", " ").trim();
            if (!t.isEmpty()) return t.length() <= 60 ? t : "";
        }
        return "";
    }

    private static final Pattern RECINDEX = Pattern.compile("(?i)(<img\\b[^>]*?)recindex=\"?0*(\\d+)\"?");
    private static final Pattern EMBED = Pattern.compile("kindle:embed:([0-9A-V]{4})(\\?[^\"')\\s]*)?");
    private static final Pattern HEADING_TAG = Pattern.compile("(?is)<h[1-3]\\b[^>]*>(.*?)</h[1-3]>");

    /** KF8's picture numbers: base 32 with digits 0–9 A–V, counted from 1. */
    private static int base32(String s) { return Integer.parseInt(s, 32); }

    private static String text(byte[] b, int at, int len, Charset cs) {
        if (at < 0 || len <= 0 || at + len > b.length) return "";
        return new String(b, at, len, cs).trim();
    }

    /** The size of a text record's trailing entries (the header's extra-data flags; calibre's getTrailingDataSize). */
    private static int trailing(byte[] b, int from, int to, int flags) {
        int size = 0;
        for (int f = flags >> 1; f != 0; f >>= 1) {
            if ((f & 1) == 0) continue;
            int end = to - size, v = 0;
            for (int i = Math.max(from, end - 4); i < end; i++) { if ((b[i] & 0x80) != 0) v = 0; v = (v << 7) | (b[i] & 0x7f); }
            size += v;
        }
        if ((flags & 1) != 0 && to - size - 1 >= from) size += (b[to - size - 1] & 0x3) + 1;
        return Math.min(size, to - from);
    }

    /** PalmDOC's LZ77: literals, runs of literals, a space plus a character, and back references. */
    private static void palmdoc(byte[] b, int from, int to, ByteArrayOutputStream all) {
        byte[] o = new byte[8192];
        int len = 0;
        for (int i = from; i < to; ) {
            int c = b[i++] & 0xff;
            if (len + 16 > o.length) o = java.util.Arrays.copyOf(o, o.length * 2);
            if (c >= 1 && c <= 8) { for (int k = 0; k < c && i < to; k++) { if (len + 1 > o.length) o = java.util.Arrays.copyOf(o, o.length * 2); o[len++] = b[i++]; } }
            else if (c < 0x80) o[len++] = (byte) c;
            else if (c >= 0xc0) { o[len++] = ' '; o[len++] = (byte) (c ^ 0x80); }
            else if (i < to) {
                int v = (c << 8) | (b[i++] & 0xff), dist = (v >> 3) & 0x7ff, n = (v & 7) + 3;
                if (dist == 0 || dist > len) continue;
                if (len + n > o.length) o = java.util.Arrays.copyOf(o, o.length * 2 + n);
                for (int k = 0; k < n; k++) { o[len] = o[len - dist]; len++; }
            }
        }
        all.write(o, 0, len);
    }

    private static int u16(byte[] b, int at) { return at + 2 > b.length ? 0 : ((b[at] & 0xff) << 8) | (b[at + 1] & 0xff); }
    private static long u32(byte[] b, int at) { return at + 4 > b.length ? 0 : ((long) (b[at] & 0xff) << 24) | ((b[at + 1] & 0xff) << 16) | ((b[at + 2] & 0xff) << 8) | (b[at + 3] & 0xff); }
}
