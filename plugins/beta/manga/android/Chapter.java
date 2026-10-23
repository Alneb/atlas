package org.atlas.plugins.manga;

import org.atlas.capture.Host;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** One chapter's pages, in reading order: the pictures of a .cbz (read by entry, never unpacked) or of a folder. */
final class Chapter {
    static final Pattern PICTURE = Pattern.compile("(?i).+\\.(jpe?g|png|webp|gif|avif|heic|heif|jxl|bmp)$");
    final String path, title;
    private final Host host;
    private final List<String> pages = new ArrayList<>();
    private ZipFile zip;
    /** A chapter of the user's Suwayomi: its pages' addresses (asked over the network: never built on the UI thread). */
    private List<String> remote;

    Chapter(Host host, String path) throws IOException {
        this.host = host;
        this.path = path;
        title = titleOf(path);
        if (Suwayomi.is(path)) {
            remote = Suwayomi.pages(host, path);
            for (int i = 0; i < remote.size(); i++) pages.add(String.valueOf(i));
            return; // in the server's order
        }
        if (isZip(path)) {
            zip = new ZipFile(host.local(path));
            for (Enumeration<? extends ZipEntry> e = zip.entries(); e.hasMoreElements(); ) {
                ZipEntry z = e.nextElement();
                if (!z.isDirectory() && PICTURE.matcher(z.getName()).matches() && !z.getName().contains("__MACOSX")) pages.add(z.getName());
            }
        } else {
            for (String f : host.list(path)) if (PICTURE.matcher(f).matches()) pages.add(f);
        }
        pages.sort(Chapter::natural);
    }

    /** A chapter's (or a loose .cbz series') name: the last part of its path, without .cbz. */
    static String titleOf(String path) {
        String name = path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
        return name.substring(name.lastIndexOf('/') + 1).replaceFirst("(?i)\\.cbz$", "");
    }

    static boolean isZip(String path) { return path.toLowerCase(java.util.Locale.ROOT).endsWith(".cbz"); }

    int size() { return pages.size(); }

    byte[] page(int i) throws IOException {
        if (remote != null) return Suwayomi.page(host, path, i, remote.get(i));
        if (zip != null) {
            try (InputStream in = zip.getInputStream(zip.getEntry(pages.get(i)))) { return org.atlas.capture.Bytes.all(in); }
        }
        String dir = path.endsWith("/") ? path : path + "/";
        try (InputStream in = host.read(dir + pages.get(i))) { return org.atlas.capture.Bytes.all(in); }
    }

    void close() { try { if (zip != null) zip.close(); } catch (IOException e) { /* closed */ } }

    private static final Pattern NUM = Pattern.compile("\\d+|\\D+");

    /** "p2" before "p10": numbers compared as numbers, the rest as text (how chapters and pages are named). */
    static int natural(String a, String b) {
        Matcher x = NUM.matcher(a.toLowerCase(java.util.Locale.ROOT)), y = NUM.matcher(b.toLowerCase(java.util.Locale.ROOT));
        while (x.find() && y.find()) {
            String p = x.group(), q = y.group();
            int c = Character.isDigit(p.charAt(0)) && Character.isDigit(q.charAt(0))
                ? new java.math.BigInteger(p).compareTo(new java.math.BigInteger(q)) : p.compareTo(q);
            if (c != 0) return c;
        }
        return a.length() - b.length();
    }
}
