//! Image thumbnails (`GET /api/thumb?path=&w=`): a figure gallery must not make the UI decode
//! 4368×2301 PNGs to show them 160 px wide (the runs view froze WebKit that way). Downscaled once,
//! cached in `.atlas/cache/thumbs/` until the source changes. JPEG XL (manga covers and pages) is always turned into
//! PNG here: WebKit's own decoder can hang the page on one, and Android has none.
use crate::error::{Error, Result};
use crate::workspace::Workspace;
use std::hash::{Hash, Hasher};
use std::path::Path;

/// Widths are rounded up to a step so nearby requests share one cached file.
const STEP: u32 = 64;
const MAX_W: u32 = 2048; // a reader's page (manga), not only a gallery's figure

/// PNG bytes no wider than `w` (aspect kept); an image already that small comes back as it is.
pub fn thumbnail(ws: &Workspace, rel: &str, w: u32) -> Result<(Vec<u8>, &'static str)> {
    let src = ws.resolve(rel)?;
    let w = w.clamp(STEP, MAX_W).div_ceil(STEP) * STEP;
    let mtime = std::fs::metadata(&src)?.modified()?;
    if is_pdf(rel) {
        return Ok((std::fs::read(pdf_cover(&ws.cache_dir(), rel, &src)?)?, "image/jpeg"));
    }
    let cached = cache_path(&ws.cache_dir(), rel, w, "png");
    if fresh(&cached, mtime) {
        return Ok((std::fs::read(&cached)?, "image/png"));
    }
    let img = if is_jxl(&src) {
        image::DynamicImage::ImageRgba8(decode_jxl(&std::fs::read(&src)?)?)
    } else if is_epub(rel) {
        // the book's own cover, once: the page unzipped the whole book for it each time
        image::load_from_memory(&epub_cover(&src)?).map_err(bad(rel))?
    } else if is_cbz(rel) {
        // a comic chapter's first page: a series' cover in the Libraries page, a .cbz's in the explorer
        let page = cbz_first_page(&src)?;
        if jxl_head(&page) {
            image::DynamicImage::ImageRgba8(decode_jxl(&page)?)
        } else {
            image::load_from_memory(&page).map_err(bad(rel))?
        }
    } else {
        let reader = image::ImageReader::open(&src)?.with_guessed_format()?;
        let format = reader.format();
        // as it is: small enough, or a picture the core cannot read but a browser can (AVIF: no pure-Rust decoder)
        let as_is = || -> Result<(Vec<u8>, &'static str)> {
            let mime = format.map(|f| f.to_mime_type()).or_else(|| mime_guess::from_path(&src).first_raw());
            Ok((std::fs::read(&src)?, mime.unwrap_or("application/octet-stream")))
        };
        match reader.into_dimensions() {
            Ok((iw, _)) if iw <= w => return as_is(),
            Err(image::ImageError::Unsupported(_)) => return as_is(),
            Err(e) => return Err(bad(rel)(e)),
            Ok(_) => image::ImageReader::open(&src)?.with_guessed_format()?.decode().map_err(bad(rel))?,
        }
    };
    let (iw, ih) = (img.width(), img.height());
    let small = if iw <= w { img } else { img.thumbnail(w, ((ih as u64 * w as u64) / iw as u64).max(1) as u32) };
    let mut out = std::io::Cursor::new(Vec::new());
    small.write_to(&mut out, image::ImageFormat::Png).map_err(bad(rel))?;
    let bytes = out.into_inner();
    write_cache(&cached, &bytes);
    Ok((bytes, "image/png"))
}

/// The width a PDF's cover is drawn at, whatever is asked: a library's big cover is 520 px.
pub const PDF_COVER_W: u32 = 640;

/// A PDF's first page as a JPEG in the cache, drawn by poppler's `pdftoppm` when missing or older than the PDF — on the
/// server, as the PDF arrives (pdf_text.rs runs it with the text), not by every page that shows it. Without poppler (a phone) it fails, and the page draws the cover itself.
/// Failures are remembered, so a pass over the vault (after every search) does not try each PDF again: no renderer
/// for the life of the process (installing poppler counts after a restart), a PDF that could not be drawn until it
/// changes (a `.failed` marker beside where its cover would be).
pub fn pdf_cover(cache_dir: &Path, rel: &str, pdf: &Path) -> Result<std::path::PathBuf> {
    static NO_RENDERER: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    let out = cache_path(cache_dir, rel, PDF_COVER_W, "jpg");
    let changed = std::fs::metadata(pdf)?.modified()?;
    if fresh(&out, changed) {
        return Ok(out);
    }
    let failed = out.with_extension("failed");
    if NO_RENDERER.load(std::sync::atomic::Ordering::Relaxed) {
        return Err(Error::NotFound(format!("{rel}: no PDF renderer here (pdftoppm)")));
    }
    if fresh(&failed, changed) {
        return Err(Error::BadRequest(format!("{rel}: its first page could not be drawn (tried before)")));
    }
    let _ = crate::vault_write::cache::mkdir(out.parent().expect("a cache file has a folder"));
    if crate::pdfium::ready() {
        return match pdfium_cover(pdf).and_then(|jpg| crate::vault_write::cache::write(&out, &jpg).map_err(|e| e.to_string())) {
            Ok(()) => {
                let _ = crate::vault_write::cache::remove_file(&failed);
                Ok(out)
            }
            Err(e) => {
                let _ = crate::vault_write::cache::write(&failed, b"");
                Err(Error::BadRequest(format!("{rel}: its first page could not be drawn ({e})")))
            }
        };
    }
    let base = out.with_extension("drawing"); // pdftoppm adds ".jpg"
    let w = PDF_COVER_W.to_string();
    let mut cmd = std::process::Command::new("pdftoppm");
    cmd.args(["-jpeg", "-jpegopt", "quality=85", "-f", "1", "-l", "1", "-singlefile", "-scale-to-x", &w, "-scale-to-y", "-1"]).arg(pdf).arg(&base);
    let ok = match crate::platform::host::std_command(cmd).and_then(|mut c| c.stderr(std::process::Stdio::null()).status()) {
        Ok(status) => status.success(),
        Err(e) => {
            NO_RENDERER.store(true, std::sync::atomic::Ordering::Relaxed);
            return Err(Error::NotFound(format!("{rel}: no PDF renderer here (pdftoppm: {e})")));
        }
    };
    let drawn = base.with_extension("drawing.jpg");
    if !ok || crate::vault_write::cache::rename(&drawn, &out).is_err() {
        let _ = crate::vault_write::cache::remove_file(&drawn);
        let _ = crate::vault_write::cache::write(&failed, b"");
        return Err(Error::BadRequest(format!("{rel}: its first page could not be drawn")));
    }
    let _ = crate::vault_write::cache::remove_file(&failed);
    Ok(out)
}

/// The first page drawn by PDFium, PDF_COVER_W wide, as a JPEG.
fn pdfium_cover(pdf: &Path) -> std::result::Result<Vec<u8>, String> {
    let drawn = (|| {
        let (pw, ph) = *crate::pdfium::pages(pdf)?.first().ok_or("no pages")?;
        let (w, h) = (PDF_COVER_W, ((PDF_COVER_W as f32 * ph / pw.max(1.0)).round() as u32).clamp(1, PDF_COVER_W * 4));
        Ok::<_, String>((w, h, crate::pdfium::render(pdf, 1, w, h, 0, true)?))
    })();
    crate::pdfium::close();
    let (w, h, rgba) = drawn?;
    let img = image::RgbaImage::from_raw(w, h, rgba).ok_or("a short bitmap")?;
    let mut jpg = vec![];
    image::DynamicImage::ImageRgba8(img).to_rgb8().write_to(&mut std::io::Cursor::new(&mut jpg), image::ImageFormat::Jpeg).map_err(|e| e.to_string())?;
    Ok(jpg)
}

fn is_epub(rel: &str) -> bool {
    rel.to_ascii_lowercase().ends_with(".epub")
}

/// An EPUB's cover picture as stored in the book: the package's cover (EPUB 3 `properties="cover-image"`, EPUB 2
/// `<meta name="cover" content="id">`), else a picture named like a cover, else the largest picture.
fn epub_cover(epub: &Path) -> Result<Vec<u8>> {
    use std::io::Read;
    let none = || Error::NotFound(format!("{}: no cover", epub.display()));
    let mut zip = zip::ZipArchive::new(std::fs::File::open(epub)?).map_err(|_| none())?;
    let mut text = |name: &str| -> Option<String> {
        let mut s = String::new();
        zip.by_name(name).ok()?.read_to_string(&mut s).ok()?;
        Some(s)
    };
    let opf_path = text("META-INF/container.xml").and_then(|c| attr_after(&c, "full-path=", 0)).unwrap_or_default();
    let href = text(&opf_path).and_then(|opf| {
        let item_by = |key: &str, value: &str| {
            let at = opf.find(&format!("{key}=\"{value}\"")).or_else(|| opf.find(&format!("{key}='{value}'")))?;
            let start = opf[..at].rfind('<')?;
            attr_after(&opf[start..opf[at..].find('>')? + at], "href=", 0)
        };
        let meta = opf.find("name=\"cover\"").and_then(|i| attr_after(&opf[opf[..i].rfind('<')?..], "content=", 0));
        item_by("properties", "cover-image").or_else(|| meta.and_then(|id| item_by("id", &id)))
    });
    let dir = opf_path.rsplit_once('/').map_or("", |(d, _)| d);
    let picture = |n: &str| { let n = n.to_ascii_lowercase(); [".jpg", ".jpeg", ".png", ".webp", ".gif"].iter().any(|e| n.ends_with(e)) };
    let named = href
        .map(|h| if dir.is_empty() { percent_decode(&h) } else { format!("{dir}/{}", percent_decode(&h)) })
        .filter(|n| zip.by_name(n).is_ok())
        .or_else(|| {
            let mut pics: Vec<(bool, u64, String)> = (0..zip.len())
                .filter_map(|i| zip.by_index(i).ok().filter(|f| picture(f.name())).map(|f| (f.name().to_lowercase().contains("cover"), f.size(), f.name().to_string())))
                .collect();
            pics.sort();
            pics.pop().map(|p| p.2)
        })
        .ok_or_else(none)?;
    let mut out = Vec::new();
    zip.by_name(&named).map_err(|_| none())?.take(20 << 20).read_to_end(&mut out)?;
    Ok(out)
}

fn is_cbz(rel: &str) -> bool {
    rel.to_ascii_lowercase().ends_with(".cbz")
}

/// The first picture of a comic archive, in the reader's order (natural: "2.png" before "10.png"); macOS's
/// `__MACOSX/` copies left out.
fn cbz_first_page(cbz: &Path) -> Result<Vec<u8>> {
    use std::io::Read;
    let none = || Error::NotFound(format!("{}: no page", cbz.display()));
    let mut zip = zip::ZipArchive::new(std::fs::File::open(cbz)?).map_err(|_| none())?;
    let picture = |n: &str| { let n = n.to_ascii_lowercase(); [".jpg", ".jpeg", ".png", ".webp", ".gif", ".jxl", ".avif", ".bmp"].iter().any(|e| n.ends_with(e)) };
    let first = (0..zip.len())
        .filter_map(|i| zip.by_index(i).ok().map(|f| f.name().to_string()))
        .filter(|n| picture(n) && !n.starts_with("__MACOSX/"))
        .min_by(|a, b| natural(a, b))
        .ok_or_else(none)?;
    let mut out = Vec::new();
    zip.by_name(&first).map_err(|_| none())?.take(40 << 20).read_to_end(&mut out)?;
    Ok(out)
}

/// Names compared with their numbers as numbers.
fn natural(a: &str, b: &str) -> std::cmp::Ordering {
    fn parts(s: &str) -> Vec<(u64, String)> {
        let mut out = Vec::new();
        let mut rest = s;
        while !rest.is_empty() {
            let digits = rest.chars().next().is_some_and(|c| c.is_ascii_digit());
            let end = rest.find(|c: char| c.is_ascii_digit() != digits).unwrap_or(rest.len());
            let (head, tail) = rest.split_at(end);
            out.push(if digits { (head.parse().unwrap_or(u64::MAX), String::new()) } else { (0, head.to_lowercase()) });
            rest = tail;
        }
        out
    }
    parts(a).cmp(&parts(b))
}

/// The quoted value after `key` (`full-path="OEBPS/x.opf"` → `OEBPS/x.opf`), searching from `from`.
fn attr_after(s: &str, key: &str, from: usize) -> Option<String> {
    let at = s[from..].find(key)? + from + key.len();
    let q = s[at..].chars().next().filter(|c| matches!(c, '"' | '\''))?;
    let end = s[at + 1..].find(q)?;
    Some(s[at + 1..at + 1 + end].to_string())
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match (b[i], b.get(i + 1..i + 3).and_then(|h| u8::from_str_radix(std::str::from_utf8(h).ok()?, 16).ok())) {
            (b'%', Some(v)) => { out.push(v); i += 3; }
            (c, _) => { out.push(c); i += 1; }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn is_pdf(rel: &str) -> bool {
    rel.to_ascii_lowercase().ends_with(".pdf")
}

/// Where the thumbnail of `rel` at width `w` is kept.
fn cache_path(cache_dir: &Path, rel: &str, w: u32, ext: &str) -> std::path::PathBuf {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    rel.hash(&mut h);
    cache_dir.join("thumbs").join(format!("{:016x}-{w}.{ext}", h.finish()))
}

/// Made since its source last changed.
fn fresh(cached: &Path, source_mtime: std::time::SystemTime) -> bool {
    std::fs::metadata(cached).and_then(|m| m.modified()).is_ok_and(|t| t >= source_mtime)
}

/// The most pixels decoded (a long webtoon strip is ~16 M): a picture from a manga source is untrusted, and a header
/// claiming more would allocate past the memory (an abort, not an error).
pub const MAX_JXL_PIXELS: u64 = 24_000_000;

/// A JPEG XL by its first bytes: the bare codestream (`FF 0A`) or the ISO container.
fn is_jxl(path: &Path) -> bool {
    use std::io::Read;
    let mut head = [0u8; 12];
    let n = std::fs::File::open(path).and_then(|mut f| f.read(&mut head)).unwrap_or(0);
    jxl_head(&head[..n])
}

fn jxl_head(b: &[u8]) -> bool {
    b.starts_with(&[0xff, 0x0a]) || b.starts_with(b"\0\0\0\x0cJXL \r\n\x87\n")
}

/// A JPEG XL's first frame in sRGB, as RGBA (the phone's native plugins use it too: atlas-android `image.rs`).
pub fn decode_jxl(bytes: &[u8]) -> Result<image::RgbaImage> {
    let fail = |what: &str, e: &dyn std::fmt::Display| Error::BadRequest(format!("{what}: {e}"));
    let mut jxl = jxl_oxide::JxlImage::builder().read(std::io::Cursor::new(bytes)).map_err(|e| fail("not a JPEG XL picture", &e))?;
    let (w, h) = (jxl.width(), jxl.height());
    if w as u64 * h as u64 > MAX_JXL_PIXELS {
        return Err(Error::BadRequest(format!("a JPEG XL picture of {w}×{h}: more than {MAX_JXL_PIXELS} pixels")));
    }
    jxl.request_color_encoding(jxl_oxide::EnumColourEncoding::srgb(jxl_oxide::RenderingIntent::Relative));
    let render = jxl.render_frame(0).map_err(|e| fail("a JPEG XL frame", &e))?;
    let fb = render.image_all_channels();
    let (fw, fh, ch) = (fb.width(), fb.height(), fb.channels());
    if ch == 0 || fw == 0 || fh == 0 {
        return Err(Error::BadRequest("an empty JPEG XL picture".into()));
    }
    let to8 = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    let mut out = Vec::with_capacity(fw * fh * 4);
    for p in fb.buf().chunks_exact(ch) {
        // grey (1–2 channels) or colour (3–4); a missing alpha is opaque
        let (r, g, b) = if ch >= 3 { (p[0], p[1], p[2]) } else { (p[0], p[0], p[0]) };
        let a = if ch == 2 || ch >= 4 { p[ch - 1] } else { 1.0 };
        out.extend([to8(r), to8(g), to8(b), to8(a)]);
    }
    image::RgbaImage::from_raw(fw as u32, fh as u32, out).ok_or_else(|| Error::BadRequest("a JPEG XL frame of the wrong size".into()))
}

fn bad(rel: &str) -> impl Fn(image::ImageError) -> Error + '_ {
    move |e| Error::BadRequest(format!("thumbnail of {rel}: {e}"))
}

/// Best effort: a read-only workspace still gets thumbnails, just uncached.
fn write_cache(path: &Path, bytes: &[u8]) {
    let _ = crate::vault_write::cache::write(path, bytes);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_epubs_cover_is_its_packages_cover_picture_thumbnailed_once() {
        use std::io::Write;
        let d = tempfile::tempdir().unwrap();
        let png = |w: u32, h: u32| {
            let mut c = std::io::Cursor::new(Vec::new());
            image::DynamicImage::new_rgb8(w, h).write_to(&mut c, image::ImageFormat::Png).unwrap();
            c.into_inner()
        };
        let mut z = zip::ZipWriter::new(std::fs::File::create(d.path().join("book.epub")).unwrap());
        let opt = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        let mut put = |name: &str, bytes: &[u8]| { z.start_file(name, opt).unwrap(); z.write_all(bytes).unwrap(); };
        put("META-INF/container.xml", br#"<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>"#);
        put("OEBPS/content.opf", br#"<package><metadata><meta name="cover" content="c"/></metadata><manifest><item id="big" href="big%20plate.png" media-type="image/png"/><item id="c" href="images/front.png" media-type="image/png"/></manifest></package>"#);
        put("OEBPS/big plate.png", &png(900, 900));
        put("OEBPS/images/front.png", &png(600, 900));
        z.finish().unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let (bytes, mime) = thumbnail(&ws, "book.epub", 200).unwrap();
        assert_eq!(mime, "image/png");
        assert_eq!(image::load_from_memory(&bytes).unwrap().width(), 256, "the package's cover (2:3), at the asked step");
        assert_eq!(image::load_from_memory(&bytes).unwrap().height(), 384);
        assert!(cache_path(&ws.cache_dir(), "book.epub", 256, "png").is_file(), "kept for the next time");
    }

    #[test]
    fn a_comic_chapters_cover_is_its_first_page_in_natural_order() {
        use std::io::Write;
        let d = tempfile::tempdir().unwrap();
        let png = |w: u32| {
            let mut c = std::io::Cursor::new(Vec::new());
            image::DynamicImage::new_rgb8(w, 10).write_to(&mut c, image::ImageFormat::Png).unwrap();
            c.into_inner()
        };
        let mut z = zip::ZipWriter::new(std::fs::File::create(d.path().join("Chapter 1.cbz")).unwrap());
        let opt = zip::write::SimpleFileOptions::default();
        for (name, w) in [("10.png", 70), ("__MACOSX/._1.png", 80), ("2.png", 90), ("info.txt", 0)] {
            z.start_file(name, opt).unwrap();
            z.write_all(&if w > 0 { png(w) } else { b"x".to_vec() }).unwrap();
        }
        z.finish().unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let (bytes, _) = thumbnail(&ws, "Chapter 1.cbz", 300).unwrap();
        assert_eq!(image::load_from_memory(&bytes).unwrap().width(), 90, "2.png, before 10.png");
    }

    #[test]
    fn a_pdfs_cover_is_drawn_once_by_the_core_and_kept() {
        if std::process::Command::new("pdftoppm").arg("-v").output().is_err() {
            eprintln!("no pdftoppm here: skipped");
            return;
        }
        let d = tempfile::tempdir().unwrap();
        let pdf = d.path().join("paper.pdf");
        std::fs::write(&pdf, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 300]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n").unwrap();
        let cache = d.path().join(".atlas/cache");
        let cover = pdf_cover(&cache, "paper.pdf", &pdf).unwrap();
        assert_eq!(image::image_dimensions(&cover).unwrap(), (PDF_COVER_W, PDF_COVER_W * 3 / 2), "page 1 at the cover's width");
        let drawn = std::fs::metadata(&cover).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        assert_eq!(pdf_cover(&cache, "paper.pdf", &pdf).unwrap(), cover);
        assert_eq!(std::fs::metadata(&cover).unwrap().modified().unwrap(), drawn, "kept, not drawn again");
        assert!(pdf_cover(&cache, "x.pdf", &d.path().join("missing.pdf")).is_err());

        // a PDF that cannot be drawn is tried once, then not again until it changes
        let broken = d.path().join("broken.pdf");
        std::fs::write(&broken, "not a pdf").unwrap();
        assert!(pdf_cover(&cache, "broken.pdf", &broken).unwrap_err().to_string().contains("could not be drawn"));
        assert!(pdf_cover(&cache, "broken.pdf", &broken).unwrap_err().to_string().contains("tried before"));
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&broken, "still not a pdf").unwrap();
        assert!(!pdf_cover(&cache, "broken.pdf", &broken).unwrap_err().to_string().contains("tried before"), "changed: tried again");
    }

    /// With PDFium (the host build fetched into local/pdfium) the cover needs no poppler.
    #[test]
    fn pdfium_draws_a_cover_without_poppler() {
        let lib = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../local/pdfium/8086-linux-x64/lib/libpdfium.so");
        if !lib.exists() || crate::pdfium::init(&lib).is_err() {
            eprintln!("no local/pdfium/8086-linux-x64 (scripts/dev/fetch-pdfium.sh): skipped");
            return;
        }
        let d = tempfile::tempdir().unwrap();
        let pdf = d.path().join("paper.pdf");
        std::fs::write(&pdf, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 300]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n").unwrap();
        let jpg = pdfium_cover(&pdf).unwrap();
        assert_eq!(image::load_from_memory(&jpg).unwrap().height(), PDF_COVER_W * 3 / 2, "page 1 at the cover's width");
        let cover = pdf_cover(&d.path().join(".atlas/cache"), "paper.pdf", &pdf).unwrap();
        assert!(cover.is_file());
        assert!(pdfium_cover(&d.path().join("missing.pdf")).is_err());
    }

    #[test]
    fn big_images_shrink_once_small_ones_pass_through() {
        let d = tempfile::tempdir().unwrap();
        image::RgbImage::new(2000, 1000).save(d.path().join("big.png")).unwrap();
        image::RgbImage::new(100, 50).save(d.path().join("small.png")).unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let (b, mime) = thumbnail(&ws, "big.png", 300).unwrap();
        assert_eq!(mime, "image/png");
        let t = image::load_from_memory(&b).unwrap();
        assert_eq!((t.width(), t.height()), (320, 160), "rounded up to the 64 px step, aspect kept");
        assert_eq!(std::fs::read_dir(d.path().join(".atlas/cache/thumbs")).unwrap().count(), 1);
        assert_eq!(thumbnail(&ws, "big.png", 300).unwrap().0, b, "served from the cache");
        let (s, _) = thumbnail(&ws, "small.png", 300).unwrap();
        assert_eq!(s, std::fs::read(d.path().join("small.png")).unwrap(), "small enough: unchanged");
        assert!(thumbnail(&ws, "../etc/passwd", 300).is_err());
        // a format the core does not decode (AVIF, by its `ftyp` box) passes through for the browser to decode
        let avif = b"\0\0\0\x1cftypavif\0\0\0\0avifmif1miaf not decoded here";
        std::fs::write(d.path().join("cover"), avif).unwrap();
        assert_eq!(thumbnail(&ws, "cover", 300).unwrap(), (avif.to_vec(), "image/avif"));
    }

    #[test]
    fn a_jpeg_xl_always_becomes_png() {
        // 3×2, white, a red pixel at (0, 0) and a blue one at (2, 1) (ImageMagick, lossless); a name without extension,
        // as the manga plugin's cached covers have
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("cover"), include_bytes!("../../atlas-android/tests/fixtures/tiny.jxl")).unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let (b, mime) = thumbnail(&ws, "cover", 300).unwrap();
        assert_eq!(mime, "image/png", "small, but still turned into PNG");
        let t = image::load_from_memory(&b).unwrap().to_rgba8();
        assert_eq!((t.width(), t.height()), (3, 2));
        assert_eq!(t.get_pixel(0, 0).0, [255, 0, 0, 255]);
        assert_eq!(t.get_pixel(2, 1).0, [0, 0, 255, 255]);
        assert!(decode_jxl(b"\x89PNG not this").is_err());
    }
}
