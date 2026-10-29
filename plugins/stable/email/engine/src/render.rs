//! A message's body made safe to show (DESIGN-mail-ui §3): the HTML cleaned (ammonia: no scripts, frames, forms or
//! event handlers; the mail's own `<style>` kept, since newsletters are built on it), its cid: pictures put in place,
//! remote content counted; a text-only mail turned into HTML (links, `>` quotes as nested bars, format=flowed rewrapped).
//! The page puts the result in a sandboxed frame whose Content-Security-Policy is what really blocks remote content:
//! nothing here has to find every way a mail can reach the network.

use crate::parse::{escape, Body};
use base64::Engine;
use regex::Regex;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Rendered {
    /// the body as HTML for the frame (without the frame's own `<head>`: the page adds it with the CSP)
    pub html: String,
    /// remote pictures, backgrounds and stylesheets the mail asks for (blocked unless allowed)
    pub remote: usize,
    /// the mail was plain text (the page draws it in the reader's prose font)
    pub plain: bool,
}

const TAGS: &[&str] = &[
    "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo", "big", "blockquote", "br", "caption", "center", "cite", "code", "col", "colgroup", "dd", "del",
    "details", "dfn", "div", "dl", "dt", "em", "figcaption", "figure", "font", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "img", "ins",
    "kbd", "li", "main", "mark", "nav", "ol", "p", "picture", "pre", "q", "rp", "rt", "ruby", "s", "samp", "section", "small", "source", "span", "strike",
    "strong", "style", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "tt", "u", "ul", "var", "wbr",
];
const ATTRS: &[&str] = &[
    "align", "valign", "width", "height", "bgcolor", "color", "border", "cellpadding", "cellspacing", "dir", "lang", "title", "face", "size", "style", "class",
    "id", "colspan", "rowspan", "span", "start", "type", "reversed", "nowrap", "background", "abbr", "scope", "headers", "summary", "frame", "rules", "hspace",
    "vspace", "datetime", "cite", "open", "role", "aria-hidden", "aria-label", "name",
];

static CID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)cid:([^"'\s)>]+)"#).unwrap());
static REMOTE_SRC: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)(?:\bsrc|\bbackground|\bsrcset)\s*=\s*["']?\s*(?:https?:)?//"#).unwrap());
static REMOTE_URL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)url\(\s*["']?\s*(?:https?:)?//"#).unwrap());
static IMPORT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)@import\b"#).unwrap());
static URL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)\b(?:https?://|www\.)[^\s<>"'()]+(?:\([^\s<>"'()]*\)[^\s<>"'()]*)*"#).unwrap());
static MAILTO: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"#).unwrap());

fn cleaner() -> ammonia::Builder<'static> {
    let mut b = ammonia::Builder::default();
    b.tags(TAGS.iter().copied().collect())
        .rm_clean_content_tags(["style"])
        .clean_content_tags(["script", "title", "head", "noscript", "template", "iframe", "object", "embed", "form", "svg", "math"].into_iter().collect())
        .generic_attributes(ATTRS.iter().copied().collect())
        .add_tag_attributes("a", ["href", "target"])
        .add_tag_attributes("img", ["src", "alt", "srcset", "loading"])
        .add_tag_attributes("source", ["srcset", "media", "type"])
        .url_schemes(["http", "https", "mailto", "tel", "cid", "data"].into_iter().collect())
        .link_rel(Some("noopener noreferrer"))
        .set_tag_attribute_value("a", "target", "_blank")
        .strip_comments(true)
        // a `name`/`id` from the mail must not shadow the frame's own (DOM clobbering): prefixed
        .id_prefix(Some("m-"));
    b
}

/// The body as the reader shows it. `images`: the message's cid: pictures (content id, mime, bytes).
pub fn render(body: &Body, images: &[(String, String, Vec<u8>)]) -> Rendered {
    match &body.html {
        Some(html) => {
            let clean = cleaner().clean(html).to_string();
            let remote = REMOTE_SRC.find_iter(&clean).count() + REMOTE_URL.find_iter(&clean).count() + IMPORT.find_iter(&clean).count();
            Rendered { html: inline_cids(&clean, images), remote, plain: false }
        }
        None => Rendered { html: text_html(&body.text, body.flowed), remote: 0, plain: true },
    }
}

/// cid:x → a data: address with the picture's bytes (the frame may load data: pictures, nothing remote).
fn inline_cids(html: &str, images: &[(String, String, Vec<u8>)]) -> String {
    let by: HashMap<String, String> = images
        .iter()
        .map(|(cid, mime, bytes)| (cid.to_lowercase(), format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))))
        .collect();
    CID.replace_all(html, |c: &regex::Captures| by.get(&c[1].to_lowercase()).cloned().unwrap_or_else(|| c[0].to_string())).into_owned()
}

/// A text mail as HTML: escaped, links and addresses made links, `>` quotes as nested blockquotes, a format=flowed
/// paragraph joined into one line, the signature (after "-- ") marked so the page can dim it.
pub fn text_html(text: &str, flowed: bool) -> String {
    let lines: Vec<String> = if flowed { unflow(text) } else { text.lines().map(String::from).collect() };
    let mut out = String::from("<div class=\"atlas-plain\">");
    let mut depth = 0;
    let mut in_sig = false;
    for line in lines {
        let (d, rest) = quote_depth(&line);
        while depth < d {
            out.push_str("<blockquote type=\"cite\">");
            depth += 1;
        }
        while depth > d {
            out.push_str("</blockquote>");
            depth -= 1;
        }
        if d == 0 && (rest == "-- " || rest == "--") && !in_sig {
            in_sig = true;
            out.push_str("<div class=\"atlas-signature\">");
        }
        out.push_str(&linkify(&escape(rest)));
        out.push_str("<br>");
    }
    while depth > 0 {
        out.push_str("</blockquote>");
        depth -= 1;
    }
    if in_sig {
        out.push_str("</div>");
    }
    out.push_str("</div>");
    out
}

fn quote_depth(line: &str) -> (usize, &str) {
    let mut d = 0;
    let mut rest = line;
    loop {
        let t = rest.strip_prefix(' ').filter(|_| d > 0).unwrap_or(rest);
        match t.strip_prefix('>') {
            Some(r) => {
                d += 1;
                rest = r;
            }
            None => break,
        }
    }
    if d > 0 {
        rest = rest.strip_prefix(' ').unwrap_or(rest);
    }
    (d, rest)
}

/// RFC 3676: a line ending in a space continues on the next (same quote depth); "-- " is not a soft break.
fn unflow(text: &str) -> Vec<String> {
    let mut out: Vec<String> = vec![];
    let mut open: Option<(usize, String)> = None;
    for raw in text.lines() {
        let (d, rest) = quote_depth(raw);
        let rest = rest.strip_prefix(' ').filter(|_| d == 0 && raw.starts_with("  ")).unwrap_or(rest); // space-stuffing
        let soft = rest.ends_with(' ') && rest != "-- ";
        let prefix = if d > 0 { format!("{} ", ">".repeat(d)) } else { String::new() };
        match open.take() {
            Some((od, mut acc)) if od == d => {
                acc.push_str(rest);
                if soft { open = Some((d, acc)) } else { out.push(format!("{prefix}{}", acc.trim_end())) }
            }
            Some((od, acc)) => {
                out.push(format!("{}{}", if od > 0 { format!("{} ", ">".repeat(od)) } else { String::new() }, acc.trim_end()));
                if soft { open = Some((d, rest.to_string())) } else { out.push(format!("{prefix}{rest}")) }
            }
            None => {
                if soft { open = Some((d, rest.to_string())) } else { out.push(format!("{prefix}{rest}")) }
            }
        }
    }
    if let Some((d, acc)) = open {
        out.push(format!("{}{}", if d > 0 { format!("{} ", ">".repeat(d)) } else { String::new() }, acc.trim_end()));
    }
    out
}

/// Links in escaped text: web addresses and mail addresses (a trailing period or comma stays text).
fn linkify(escaped: &str) -> String {
    let mut out = String::new();
    let mut last = 0;
    let mut spans: Vec<(usize, usize, String)> = vec![];
    for m in URL.find_iter(escaped) {
        let s = m.as_str().trim_end_matches(['.', ',', ';', ':', '!', '?']);
        let s = s.strip_suffix("&gt").unwrap_or(s);
        let href = if s.starts_with("www.") { format!("https://{s}") } else { s.to_string() };
        spans.push((m.start(), m.start() + s.len(), format!("<a href=\"{}\" target=\"_blank\" rel=\"noopener noreferrer\">{s}</a>", href.replace("&amp;", "&").replace('"', "%22"))));
    }
    let taken: HashSet<usize> = spans.iter().flat_map(|(a, b, _)| *a..*b).collect();
    for m in MAILTO.find_iter(escaped) {
        if !taken.contains(&m.start()) {
            spans.push((m.start(), m.end(), format!("<a href=\"mailto:{0}\">{0}</a>", m.as_str())));
        }
    }
    spans.sort_by_key(|s| s.0);
    for (a, b, html) in spans {
        if a < last {
            continue;
        }
        out.push_str(&escaped[last..a]);
        out.push_str(&html);
        last = b;
    }
    out.push_str(&escaped[last..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::body;

    #[test]
    fn scripts_handlers_frames_and_forms_go_styles_stay() {
        let raw = b"From: a@b.c\r\nContent-Type: text/html\r\n\r\n<html><head><style>.x{color:red}</style><script>alert(1)</script></head><body onload=\"x()\"><p class=\"x\" onclick=\"y()\" style=\"color:blue\">Hi</p><iframe src=\"https://evil\"></iframe><form action=\"https://e\"><input name=p></form><a href=\"javascript:alert(1)\">j</a><a href=\"https://ok.example\">ok</a><img id=\"location\" src=\"https://track.example/p.gif\"></body></html>";
        let r = render(&body(raw).unwrap(), &[]);
        assert!(r.html.contains("<style>.x{color:red}</style>"), "{}", r.html);
        assert!(r.html.contains("style=\"color:blue\""));
        for bad in ["script", "alert", "onclick", "onload", "iframe", "<form", "<input", "javascript:"] {
            assert!(!r.html.contains(bad), "{bad} in {}", r.html);
        }
        assert!(r.html.contains("href=\"https://ok.example\""));
        assert!(r.html.contains("target=\"_blank\"") && r.html.contains("noopener"));
        assert!(r.html.contains("id=\"m-location\""), "ids prefixed: {}", r.html);
        assert_eq!(r.remote, 1);
        assert!(!r.plain);
    }

    #[test]
    fn remote_content_is_counted_in_every_form() {
        let raw = b"Content-Type: text/html\r\n\r\n<table background=\"http://x/bg.png\"><tr><td style=\"background:url('https://x/a.png')\"><img src=\"//x/b.png\" srcset=\"https://x/c.png 2x\"></td></tr></table><style>@import url(https://x/s.css);</style>";
        assert_eq!(render(&body(raw).unwrap(), &[]).remote, 6);
    }

    #[test]
    fn cid_pictures_are_put_in_place() {
        let raw = b"Content-Type: text/html\r\n\r\n<img src=\"cid:Logo@X\"><img src=\"cid:missing\">";
        let r = render(&body(raw).unwrap(), &[("logo@x".into(), "image/png".into(), vec![1, 2, 3])]);
        assert!(r.html.contains("src=\"data:image/png;base64,AQID\""), "{}", r.html);
        assert!(r.html.contains("cid:missing"));
    }

    #[test]
    fn plain_text_gets_links_quotes_and_a_signature() {
        let h = text_html("See https://x.org/a_(b). or www.y.org, mail ana@x.example\n> quoted\n>> deeper\nback & <here>\n-- \nAna", false);
        assert!(h.contains("<a href=\"https://x.org/a_(b)\""), "{h}");
        assert!(h.contains(">https://x.org/a_(b)</a>."));
        assert!(h.contains("<a href=\"https://www.y.org\""));
        assert!(h.contains("<a href=\"mailto:ana@x.example\">"));
        assert!(h.contains("<blockquote type=\"cite\">quoted<br><blockquote type=\"cite\">deeper<br></blockquote></blockquote>back &amp; &lt;here&gt;"), "{h}");
        assert!(h.contains("<div class=\"atlas-signature\">-- <br>Ana"), "{h}");
    }

    #[test]
    fn format_flowed_paragraphs_are_joined() {
        assert_eq!(unflow("This is a \nlong line.\n> quoted \n> more\nnext"), vec!["This is a long line.", "> quoted more", "next"]);
        assert_eq!(unflow("-- \nsig"), vec!["-- ", "sig"]);
    }

    #[test]
    fn a_link_with_query_parameters_keeps_them() {
        let h = text_html("https://x.org/?a=1&b=2", false);
        assert!(h.contains("href=\"https://x.org/?a=1&b=2\""), "{h}");
    }
}
