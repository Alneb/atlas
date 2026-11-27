//! Untrusted HTML made safe to show — a mail's body, a feed's article (one cleaner for both): ammonia removes scripts,
//! frames, forms, event handlers and `javascript:` links, keeps the document's own `<style>` (newsletters are built on
//! it), prefixes its ids (no DOM clobbering of the frame's own), and counts the remote content it asks for (pictures,
//! backgrounds, stylesheets). The page shows the result in a sandboxed frame whose Content-Security-Policy is what
//! really blocks remote content (ui/src/components/HtmlFrame.svelte): nothing here has to find every way HTML can reach
//! the network.

use regex::Regex;
use std::sync::LazyLock;

/// The cleaned HTML and how many remote things it asks for (blocked unless the user allows them).
#[derive(Debug, Clone, PartialEq)]
pub struct Cleaned {
    pub html: String,
    pub remote: usize,
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

static REMOTE_SRC: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)(?:\bsrc|\bbackground|\bsrcset)\s*=\s*["']?\s*(?:https?:)?//"#).unwrap());
static REMOTE_URL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)url\(\s*["']?\s*(?:https?:)?//"#).unwrap());
static IMPORT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)@import\b"#).unwrap());

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

/// `html` cleaned, its remote content counted.
pub fn clean(html: &str) -> Cleaned {
    let html = cleaner().clean(html).to_string();
    let remote = REMOTE_SRC.find_iter(&html).count() + REMOTE_URL.find_iter(&html).count() + IMPORT.find_iter(&html).count();
    Cleaned { html, remote }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scripts_handlers_frames_and_forms_go_styles_stay() {
        let c = clean("<html><head><style>.x{color:red}</style><script>alert(1)</script></head><body onload=\"x()\"><p class=\"x\" onclick=\"y()\" style=\"color:blue\">Hi</p><iframe src=\"https://evil\"></iframe><form action=\"https://e\"><input name=p></form><a href=\"javascript:alert(1)\">j</a><a href=\"https://ok.example\">ok</a><img id=\"location\" src=\"https://track.example/p.gif\"></body></html>");
        assert!(c.html.contains("<style>.x{color:red}</style>"), "{}", c.html);
        assert!(c.html.contains("style=\"color:blue\""));
        for bad in ["script", "alert", "onclick", "onload", "iframe", "<form", "<input", "javascript:"] {
            assert!(!c.html.contains(bad), "{bad} in {}", c.html);
        }
        assert!(c.html.contains("href=\"https://ok.example\""));
        assert!(c.html.contains("target=\"_blank\"") && c.html.contains("noopener"));
        assert!(c.html.contains("id=\"m-location\""), "ids prefixed: {}", c.html);
        assert_eq!(c.remote, 1);
    }

    #[test]
    fn remote_content_is_counted_in_every_form() {
        let c = clean("<table background=\"http://x/bg.png\"><tr><td style=\"background:url('https://x/a.png')\"><img src=\"//x/b.png\" srcset=\"https://x/c.png 2x\"></td></tr></table><style>@import url(https://x/s.css);</style>");
        assert_eq!(c.remote, 6);
    }
}
