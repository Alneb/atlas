//! A message from its raw bytes (mail-parser: charsets, RFC 2047/2231 words, broken MIME): what the index keeps
//! ([`Envelope`], from the header alone) and what the reader shows ([`Body`]).

use mail_parser::{Address, HeaderValue, Message, MessageParser, MimeHeaders, PartType};
use regex::Regex;
use serde::Serialize;
use std::sync::LazyLock;

/// A person on a message: the name as written (may be empty) and the address.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, serde::Deserialize, Default)]
pub struct Person {
    pub name: String,
    pub addr: String,
}

impl Person {
    /// "Name <addr>", or the bare address.
    pub fn display(&self) -> String {
        if self.name.is_empty() { self.addr.clone() } else { format!("{} <{}>", quote_name(&self.name), self.addr) }
    }
    /// What a list shows: the name, else the address's local part.
    pub fn short(&self) -> String {
        if !self.name.is_empty() {
            return self.name.clone();
        }
        self.addr.split('@').next().unwrap_or(&self.addr).to_string()
    }
}

fn quote_name(n: &str) -> String {
    if n.chars().any(|c| "()<>[]:;@\\,.\"".contains(c)) { format!("\"{}\"", n.replace('\\', "\\\\").replace('"', "\\\"")) } else { n.to_string() }
}

/// Who a message is from, for the split inbox: by the headers' shape, never by a list of senders.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Person,
    Newsletter,
    Notification,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Person => "person",
            Kind::Newsletter => "newsletter",
            Kind::Notification => "notification",
        }
    }
}

/// How to leave a mailing list (RFC 2369 / RFC 8058).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
pub struct Unsubscribe {
    pub url: Option<String>,
    pub mailto: Option<String>,
    /// List-Unsubscribe-Post: one POST to `url` unsubscribes, nothing to fill in
    pub one_click: bool,
}

/// What the index keeps of a message: its header, enough to list, thread and search it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Envelope {
    /// without the angle brackets; a made-up `atlas.<hash>@local` when the message has none
    pub message_id: String,
    pub subject: String,
    pub from: Vec<Person>,
    pub to: Vec<Person>,
    pub cc: Vec<Person>,
    pub reply_to: Vec<Person>,
    /// unix seconds (the Date header; the server's arrival date when it has none or a broken one)
    pub date: i64,
    pub in_reply_to: Vec<String>,
    pub references: Vec<String>,
    pub list_id: Option<String>,
    pub unsubscribe: Option<Unsubscribe>,
    pub kind: Kind,
    /// a guess from the header (multipart/mixed); the body's parse says for sure
    pub has_attachments: bool,
}

static ID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<([^<>\s]+)>").unwrap());
static MACHINE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^(notifications?|notify|alerts?|mailer-daemon|postmaster|bounces?|automated|system)\b").unwrap());
static NOREPLY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)no-?reply|do-?not-?reply").unwrap());
/// Re: / Fwd: and their translations, repeated, numbered (Re[2]:), with a space before the colon (French)
static PREFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^\s*(((re|fwd?|tr|aw|wg|sv|vs|rv|rif|r|enc|antw|odp|ref|réf|res)\s*(\[\d+\]|\(\d+\))?\s*:\s*)|(\[[^\]]{1,40}\]\s*))+").unwrap()
});

/// The message ids in a header's text: `<a@b> <c@d>`; one bare id when there are no brackets.
pub fn ids_in(text: &str) -> Vec<String> {
    let v: Vec<String> = ID.captures_iter(text).map(|c| c[1].to_string()).collect();
    if v.is_empty() {
        let t = text.trim();
        if !t.is_empty() && !t.contains(char::is_whitespace) && t.contains('@') {
            return vec![t.to_string()];
        }
    }
    v
}

/// "Name <a@b>" → "a@b"; a bare address stays.
pub fn bare(addr: &str) -> String {
    match (addr.rfind('<'), addr.rfind('>')) {
        (Some(a), Some(b)) if a < b => addr[a + 1..b].trim().to_string(),
        _ => addr.trim().to_string(),
    }
}

/// A conversation's subject: without Re:/Fwd:/TR: and list tags, spaces and case folded (to match replies).
pub fn thread_subject(subject: &str) -> String {
    PREFIX.replace(subject, "").split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// Whether a subject says it answers or forwards something (Re:, Fwd:, TR: …), list tags aside.
pub fn is_reply_subject(subject: &str) -> bool {
    let without_tags = Regex::new(r"^\s*(\[[^\]]{1,40}\]\s*)+").unwrap().replace(subject, "");
    PREFIX.find(&without_tags).is_some_and(|m| m.as_str().contains(':'))
}

fn people(a: Option<&Address>) -> Vec<Person> {
    let Some(a) = a else { return vec![] };
    a.iter()
        .filter_map(|x| {
            let addr = x.address()?.trim().to_string();
            let name = x.name().map(|n| n.trim().trim_matches('"').trim_matches('\'').trim().to_string()).unwrap_or_default();
            // a name that only repeats the address says nothing
            let name = if name.eq_ignore_ascii_case(&addr) { String::new() } else { name };
            (!addr.is_empty()).then_some(Person { name, addr })
        })
        .collect()
}

fn header_ids(v: &HeaderValue) -> Vec<String> {
    match v {
        HeaderValue::Text(t) => ids_in(&format!("<{t}>")),
        HeaderValue::TextList(l) => l.iter().flat_map(|t| ids_in(&format!("<{t}>"))).collect(),
        _ => vec![],
    }
}

fn raw_header<'a>(m: &'a Message, name: &'static str) -> Option<&'a str> {
    m.header_raw(name).map(str::trim).filter(|v| !v.is_empty())
}

/// The ids a header lists, read from its raw text first (mail-parser drops a malformed one), else its parse.
fn ids_of(m: &Message, name: &'static str, parsed: &HeaderValue) -> Vec<String> {
    let mut v = raw_header(m, name).map(ids_in).unwrap_or_default();
    if v.is_empty() {
        v = header_ids(parsed);
    }
    let mut seen = std::collections::HashSet::new();
    v.retain(|id| seen.insert(id.clone()));
    v
}

pub fn parser() -> MessageParser {
    MessageParser::default()
}

/// The envelope of a message (a whole one, or its header only). `arrived`: the server's INTERNALDATE, for a
/// message whose Date is missing or unreadable.
pub fn envelope(raw: &[u8], arrived: Option<i64>) -> Envelope {
    match parser().parse(raw) {
        Some(m) => envelope_of(&m, raw, arrived),
        None => Envelope {
            message_id: made_up_id(raw),
            subject: String::new(),
            from: vec![],
            to: vec![],
            cc: vec![],
            reply_to: vec![],
            date: arrived.unwrap_or(0),
            in_reply_to: vec![],
            references: vec![],
            list_id: None,
            unsubscribe: None,
            kind: Kind::Person,
            has_attachments: false,
        },
    }
}

fn made_up_id(raw: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let h = Sha256::digest(&raw[..raw.len().min(4096)]);
    format!("atlas.{}@local", h.iter().take(10).map(|b| format!("{b:02x}")).collect::<String>())
}

pub fn envelope_of(m: &Message, raw: &[u8], arrived: Option<i64>) -> Envelope {
    let from = people(m.from().or(m.sender()));
    let date = m.date().map(|d| d.to_timestamp()).filter(|t| *t > 0).or(arrived).unwrap_or(0);
    let message_id = m.message_id().map(|i| i.trim().trim_matches(['<', '>']).to_string()).filter(|i| !i.is_empty()).unwrap_or_else(|| made_up_id(raw));
    let list_id = raw_header(m, "List-Id").map(|l| ID.captures(l).map(|c| c[1].to_string()).unwrap_or_else(|| l.to_string()));
    let unsubscribe = raw_header(m, "List-Unsubscribe").map(|u| {
        let mut x = Unsubscribe::default();
        for c in ID.captures_iter(u) {
            let link = c[1].to_string();
            if link.to_lowercase().starts_with("mailto:") {
                x.mailto.get_or_insert(link);
            } else if link.starts_with("https://") || link.starts_with("http://") {
                x.url.get_or_insert(link);
            }
        }
        x.one_click = raw_header(m, "List-Unsubscribe-Post").is_some_and(|p| p.to_lowercase().contains("one-click")) && x.url.is_some();
        x
    });
    let ctype = m.content_type().map(|c| format!("{}/{}", c.ctype(), c.subtype().unwrap_or(""))).unwrap_or_default().to_lowercase();
    let mut e = Envelope {
        message_id,
        subject: m.subject().unwrap_or("").trim().to_string(),
        from,
        to: people(m.to()),
        cc: people(m.cc()),
        reply_to: people(m.reply_to()),
        date,
        in_reply_to: ids_of(m, "In-Reply-To", m.in_reply_to()),
        references: ids_of(m, "References", m.references()),
        list_id,
        unsubscribe,
        kind: Kind::Person,
        has_attachments: ctype == "multipart/mixed" || m.attachment_count() > 0 && m.attachments().any(|p| !p.is_inline_image()),
    };
    e.kind = kind(m, &e);
    e
}

trait InlineImage {
    fn is_inline_image(&self) -> bool;
}
impl InlineImage for mail_parser::MessagePart<'_> {
    fn is_inline_image(&self) -> bool {
        self.content_id().is_some() && self.content_type().is_some_and(|c| c.ctype().eq_ignore_ascii_case("image"))
    }
}

fn kind(m: &Message, e: &Envelope) -> Kind {
    let local = e.from.first().map(|p| p.addr.split('@').next().unwrap_or("").to_string()).unwrap_or_default();
    let auto = raw_header(m, "Auto-Submitted").unwrap_or("").to_lowercase();
    if (!auto.is_empty() && auto != "no") || MACHINE.is_match(&local) {
        return Kind::Notification;
    }
    let precedence = raw_header(m, "Precedence").unwrap_or("").to_lowercase();
    if e.list_id.is_some() || e.unsubscribe.is_some() || ["bulk", "list", "junk"].contains(&precedence.as_str()) {
        return Kind::Newsletter;
    }
    if NOREPLY.is_match(&local) { Kind::Notification } else { Kind::Person }
}

/// A part the reader lists under its message.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Attachment {
    /// the part's position in the message (mail-parser's part id), to fetch it again
    pub part: u32,
    pub name: String,
    pub mime: String,
    pub size: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cid: Option<String>,
    /// shown inside the body (a cid: image the HTML uses): not listed as a file
    pub inline: bool,
}

pub use crate::ical::Invite;

/// What the reader shows of a message.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Body {
    /// the HTML as it came (several HTML parts joined, Apple Mail's way); None for a text-only mail
    pub html: Option<String>,
    /// the text part as it came, else the HTML's text
    pub text: String,
    /// text/plain; format=flowed (RFC 3676): soft line breaks to join
    pub flowed: bool,
    pub attachments: Vec<Attachment>,
    pub invite: Option<Invite>,
    /// forwarded messages attached whole (message/rfc822): their envelope and body, shown inside
    pub forwarded: Vec<(Envelope, Body)>,
}

/// The body of a whole message.
/// Raised when what is read from a body changes: the index reads its kept bodies again (`Index::reparse`).
pub const VERSION: u32 = 4;

pub fn body(raw: &[u8]) -> Option<Body> {
    parser().parse(raw).map(|m| body_of(&m))
}

pub fn body_of(m: &Message) -> Body {
    let mut html = String::new();
    let mut any_html = false;
    for p in m.html_bodies() {
        match &p.body {
            PartType::Html(h) => {
                any_html = true;
                html.push_str(h);
            }
            PartType::Text(t) => html.push_str(&format!("<pre class=\"atlas-text\">{}</pre>", escape(t))),
            PartType::InlineBinary(_) | PartType::Binary(_) => {
                if let Some(cid) = p.content_id() {
                    html.push_str(&format!("<img src=\"cid:{}\">", escape(cid.trim_matches(['<', '>']))));
                }
            }
            _ => {}
        }
    }
    let text_part = m.text_bodies().find_map(|p| match &p.body {
        PartType::Text(t) => Some((t.to_string(), p.content_type().and_then(|c| c.attribute("format")).is_some_and(|f| f.eq_ignore_ascii_case("flowed")))),
        _ => None,
    });
    let (mut text, flowed) = match text_part {
        Some((t, f)) => (t.replace("\r\n", "\n"), f),
        None if any_html => (html_text(&html), false),
        None => (String::new(), false),
    };
    // a "plain text" part that is HTML source (some mailers label it so): drawn as HTML, its text read from it
    if looks_html(&text) {
        if !any_html {
            html = text.clone();
            any_html = true;
        }
        text = html_text(&text);
    } else if ENTITY.is_match(&text) && text.contains(';') {
        // entities in a text part (`enregistr&eacute;`) are never meant literally
        text = ENTITY.replace_all(&text, |c: &regex::Captures| entity(&c[1]).map(String::from).unwrap_or_else(|| c[0].to_string())).into_owned();
    }
    let html_cids: Vec<String> = Regex::new(r#"(?i)cid:([^"'\s)>]+)"#).unwrap().captures_iter(&html).map(|c| c[1].to_string()).collect();
    let mut attachments = vec![];
    let mut invite = None;
    let mut forwarded = vec![];
    for (i, p) in m.parts.iter().enumerate() {
        let ct = p.content_type();
        let mime = ct.map(|c| format!("{}/{}", c.ctype(), c.subtype().unwrap_or("octet-stream"))).unwrap_or_else(|| "application/octet-stream".into()).to_lowercase();
        if mime == "text/calendar" {
            if let PartType::Text(t) | PartType::Html(t) = &p.body {
                invite = Some(crate::ical::read(t));
            }
        }
        let is_body = m.html_body.contains(&(i as u32)) || m.text_body.contains(&(i as u32));
        let named = p.attachment_name().is_some();
        let listed = match &p.body {
            PartType::Binary(_) | PartType::InlineBinary(_) => !is_body || named,
            PartType::Message(inner) => {
                forwarded.push((envelope_of(inner, inner.raw_message(), None), body_of(inner)));
                true
            }
            // an invitation is a file too (`invite.ics`, as Thunderbird lists it): a saved note keeps it
            PartType::Text(_) | PartType::Html(_) => mime == "text/calendar" || (!is_body && (named || p.content_disposition().is_some_and(|d| d.ctype().eq_ignore_ascii_case("attachment")))),
            PartType::Multipart(_) => false,
        };
        if !listed {
            continue;
        }
        let cid = p.content_id().map(|c| c.trim_matches(['<', '>']).to_string());
        let inline = cid.as_ref().is_some_and(|c| html_cids.iter().any(|h| h.eq_ignore_ascii_case(c)));
        let name = p.attachment_name().map(String::from).unwrap_or_else(|| match &p.body {
            PartType::Message(inner) => format!("{}.eml", inner.subject().unwrap_or("message")),
            _ if mime == "text/calendar" => "invite.ics".to_string(),
            _ => format!("part {i}.{}", mime.rsplit('/').next().unwrap_or("bin")),
        });
        attachments.push(Attachment { part: i as u32, name, mime, size: p.len(), cid, inline });
    }
    Body { html: any_html.then_some(html), text, flowed, attachments, invite, forwarded }
}

/// The bytes of one part (by [`Attachment::part`]), decoded.
pub fn part_bytes(raw: &[u8], part: u32) -> Option<(Vec<u8>, String, String)> {
    let m = parser().parse(raw)?;
    let p = m.parts.get(part as usize)?;
    let mime = p.content_type().map(|c| format!("{}/{}", c.ctype(), c.subtype().unwrap_or("octet-stream"))).unwrap_or_else(|| "application/octet-stream".into());
    let name = p.attachment_name().unwrap_or("attachment").to_string();
    let bytes = match &p.body {
        PartType::Binary(b) | PartType::InlineBinary(b) => b.to_vec(),
        PartType::Text(t) | PartType::Html(t) => t.as_bytes().to_vec(),
        PartType::Message(inner) => inner.raw_message().to_vec(),
        PartType::Multipart(_) => return None,
    };
    Some((bytes, name, mime))
}

/// The cid: images of a message: content id → (mime, bytes), for the reader to show in place.
pub fn inline_images(raw: &[u8]) -> Vec<(String, String, Vec<u8>)> {
    let Some(m) = parser().parse(raw) else { return vec![] };
    m.parts
        .iter()
        .filter_map(|p| {
            let cid = p.content_id()?.trim_matches(['<', '>']).to_string();
            let ct = p.content_type()?;
            if !ct.ctype().eq_ignore_ascii_case("image") {
                return None;
            }
            let mime = format!("image/{}", ct.subtype().unwrap_or("png")).to_lowercase();
            match &p.body {
                PartType::Binary(b) | PartType::InlineBinary(b) => Some((cid, mime, b.to_vec())),
                _ => None,
            }
        })
        .collect()
}

pub fn escape(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => o.push_str("&amp;"),
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '"' => o.push_str("&quot;"),
            '\'' => o.push_str("&#39;"),
            _ => o.push(c),
        }
    }
    o
}

static DROP: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?is)<(head|style|script|title)\b.*?</\s*(head|style|script|title)\s*>|<!--.*?-->").unwrap());
static BREAK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)<\s*(br|/p|/div|/tr|/li|/h[1-6]|/blockquote|/table)\b[^>]*>").unwrap());
// a `>` inside a quoted attribute (a barcode's data, an inline style) does not end the tag
static TAG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?s)<(?:[^>"']|"[^"]*"|'[^']*')*>"#).unwrap());
static ENTITY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);").unwrap());

/// An HTML body's text (for snippets, the search index and a text/plain alternative): blocks become lines.
pub fn html_text(html: &str) -> String {
    let t = DROP.replace_all(html, "");
    let t = BREAK.replace_all(&t, "\n");
    let t = TAG.replace_all(&t, "");
    let t = ENTITY.replace_all(&t, |c: &regex::Captures| entity(&c[1]).map(String::from).unwrap_or_else(|| c[0].to_string()));
    let mut out = String::new();
    let mut blank = 0;
    for line in t.lines() {
        let l = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if l.is_empty() {
            blank += 1;
            if blank == 1 && !out.is_empty() {
                out.push('\n');
            }
        } else {
            blank = 0;
            out.push_str(&l);
            out.push('\n');
        }
    }
    out.trim().to_string()
}

fn entity(e: &str) -> Option<char> {
    if let Some(h) = e.strip_prefix("#x").or_else(|| e.strip_prefix("#X")) {
        return u32::from_str_radix(h, 16).ok().and_then(char::from_u32);
    }
    if let Some(d) = e.strip_prefix('#') {
        return d.parse().ok().and_then(char::from_u32);
    }
    Some(match e {
        "amp" => '&',
        "lt" => '<',
        "gt" => '>',
        "quot" => '"',
        "apos" => '\'',
        "nbsp" => ' ',
        "zwnj" | "zwj" | "shy" => '\u{200b}',
        "mdash" => '—',
        "ndash" => '–',
        "hellip" => '…',
        "rsquo" => '’',
        "lsquo" => '‘',
        "rdquo" => '”',
        "ldquo" => '“',
        "euro" => '€',
        "copy" => '©',
        "reg" => '®',
        "deg" => '°',
        "laquo" => '«',
        "raquo" => '»',
        "middot" => '·',
        "bull" => '•',
        "times" => '×',
        "iexcl" => '¡',
        "iquest" => '¿',
        "ordf" => 'ª',
        "ordm" => 'º',
        "szlig" => 'ß',
        "aelig" => 'æ',
        "AElig" => 'Æ',
        "oelig" => 'œ',
        "OElig" => 'Œ',
        "oslash" => 'ø',
        "Oslash" => 'Ø',
        "trade" => '™',
        "sect" => '§',
        "para" => '¶',
        "pound" => '£',
        "yen" => '¥',
        "cent" => '¢',
        "sbquo" => '‚',
        "bdquo" => '„',
        "dagger" => '†',
        "larr" => '←',
        "rarr" => '→',
        _ => return accented(e),
    })
}

/// `eacute`, `Uuml`, `ntilde`… — a letter and its accent, the Latin-1 names.
fn accented(e: &str) -> Option<char> {
    const ACCENTS: &[(&str, &str, &str)] = &[
        ("acute", "aeiouyAEIOUY", "áéíóúýÁÉÍÓÚÝ"),
        ("grave", "aeiouAEIOU", "àèìòùÀÈÌÒÙ"),
        ("circ", "aeiouAEIOU", "âêîôûÂÊÎÔÛ"),
        ("uml", "aeiouyAEIOU", "äëïöüÿÄËÏÖÜ"),
        ("tilde", "anoANO", "ãñõÃÑÕ"),
        ("cedil", "cC", "çÇ"),
        ("ring", "aA", "åÅ"),
    ];
    let mut cs = e.chars();
    let letter = cs.next()?;
    let rest = cs.as_str();
    let (_, from, to) = ACCENTS.iter().find(|(name, _, _)| *name == rest)?;
    from.chars().position(|c| c == letter).and_then(|i| to.chars().nth(i))
}

/// Text that is HTML source: a document's start, or several tags.
fn looks_html(t: &str) -> bool {
    let head = t.trim_start().get(..15).unwrap_or(t.trim_start()).to_ascii_lowercase();
    head.starts_with("<!doctype") || head.starts_with("<html") || HTML_TAG.find_iter(t).take(4).count() >= 4
}
static HTML_TAG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)<(p|div|br|img|table|td|tr|span|a|font|b|strong)\b[^>]*>").unwrap());

static WROTE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?im)^(on .{0,200}wrote:|le .{0,200}a écrit\s*:|el .{0,200}escribió:|am .{0,200}schrieb .{0,80}:|-{2,}\s*original message\s*-{2,}|_{5,}|from:\s.*\n(sent|date|envoyé|enviado):)").unwrap()
});

/// What a preview leaves out of a line: picture placeholders (Outlook's `[cid:…]`, Gmail's `[image: …]`), numbered link
/// marks (`{1}`), rules (`=====`, `-----`), and each link shortened to its host.
static NOISE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\[(cid:[^\]]*|image:?[^\]]*)\]|\{\d+\}|[-=_*~#]{4,}|<https?://[^>]*>").unwrap());
static LINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\bhttps?://(?:www\.)?([^/\s?#]+)[^\s]*").unwrap());

/// The first words of what a message says: its own text, without the quote it answers or the signature.
pub fn snippet(text: &str, width: usize) -> String {
    let cut = WROTE.find(text);
    let own = cut.map(|m| &text[..m.start()]).unwrap_or(text);
    let words = preview_words(own, width, false);
    if !words.is_empty() {
        return words;
    }
    // nothing of its own (a forward, a "see attached" with only the quote): what it carries
    match cut {
        Some(m) => preview_words(&text[m.start()..], width, true),
        None => words,
    }
}

/// Header lines of a quoted or forwarded message ("From: …", "Envoyé : …", "On … wrote:") — not its words.
static QUOTE_HEAD: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^(from|sent|to|cc|subject|date|de|envoy[ée]|[àa]|objet|para|asunto|enviado|fecha|von|an|betreff|gesendet)\s*:|(wrote|a [ée]crit|escribi[óo]|schrieb)\s*:\s*$|^-+\s*(forwarded|original|message transf|mensaje reenv)").unwrap()
});

fn preview_words(text: &str, width: usize, quoted: bool) -> String {
    let mut words = String::new();
    for line in text.lines() {
        let mut l = line.trim();
        if l == "--" || l == "-- " {
            if quoted && words.is_empty() { continue } else { break }
        }
        if quoted {
            l = l.trim_start_matches(|c: char| c == '>' || c.is_whitespace());
            if QUOTE_HEAD.is_match(l) {
                continue;
            }
        } else if l.starts_with('>') {
            continue;
        }
        if l.is_empty() {
            continue;
        }
        let l = NOISE.replace_all(l, " ");
        let l = LINK.replace_all(&l, "$1…");
        let l = l.split_whitespace().collect::<Vec<_>>().join(" ");
        if l.is_empty() {
            continue;
        }
        if !words.is_empty() {
            words.push(' ');
        }
        words.push_str(&l);
        if words.chars().count() > width {
            break;
        }
    }
    // invisible preheader padding newsletters use (zero-width joiners, &zwnj;, combining grapheme joiners)
    let words: String = words.chars().filter(|c| !matches!(c, '\u{200b}'..='\u{200f}' | '\u{034f}' | '\u{feff}' | '\u{00ad}')).collect();
    let words = words.split_whitespace().collect::<Vec<_>>().join(" ");
    if words.chars().count() > width { format!("{}…", words.chars().take(width).collect::<String>().trim_end()) } else { words }
}

/// A message's preview: its words, else a forwarded message's, else the files it carries.
pub fn preview(b: &Body, width: usize) -> String {
    let own = snippet(&b.text, width);
    if !own.is_empty() {
        return own;
    }
    if let Some(f) = b.forwarded.iter().map(|(_, fb)| snippet(&fb.text, width)).find(|x| !x.is_empty()) {
        return f;
    }
    let files: Vec<&str> = b.attachments.iter().filter(|a| !a.inline).map(|a| a.name.as_str()).collect();
    if files.is_empty() { String::new() } else { format!("Attached: {}", files.join(", ")) }
}

#[cfg(test)]
mod tests {
    use super::*;

    const OUTLOOK_REPLY: &[u8] = b"From: =?utf-8?Q?Jos=C3=A9_P=C3=A9rez?= <jose@uni.example.org>\r\nTo: \"Me, Myself\" <me@example.org>, other@example.org\r\nCc: =?iso-8859-1?q?Andr=E9?= <andre@example.org>\r\nSubject: RE: TR: =?utf-8?B?UsOpdW5pb24=?=\r\nDate: Tue, 15 Sep 2026 10:02:00 -0400\r\nMessage-ID: <AB12@outlook.example>\r\nIn-Reply-To: <first@example.org>\r\nReferences: <root@example.org>\r\n <first@example.org>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=\"b1\"\r\n\r\n--b1\r\nContent-Type: text/plain; charset=\"iso-8859-1\"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nD'accord pour mardi =E0 10h.\r\n\r\n-- \r\nJos=E9\r\n\r\nFrom: Me <me@example.org>\r\nSent: Monday\r\n\r\n> old\r\n--b1\r\nContent-Type: text/html; charset=\"utf-8\"\r\n\r\n<html><head><style>p{color:red}</style></head><body><p>D'accord pour mardi \xc3\xa0 10h.</p><div id=\"appendonsend\"></div><hr><div id=\"divRplyFwdMsg\">From: Me</div></body></html>\r\n--b1--\r\n";

    #[test]
    fn an_outlook_reply_with_encoded_words_and_folded_references() {
        let e = envelope(OUTLOOK_REPLY, None);
        assert_eq!(e.message_id, "AB12@outlook.example");
        assert_eq!(e.subject, "RE: TR: Réunion");
        assert_eq!(e.from, vec![Person { name: "José Pérez".into(), addr: "jose@uni.example.org".into() }]);
        assert_eq!(e.to.len(), 2);
        assert_eq!(e.to[0].name, "Me, Myself");
        assert_eq!(e.cc[0].name, "André");
        assert_eq!(e.in_reply_to, vec!["first@example.org"]);
        assert_eq!(e.references, vec!["root@example.org", "first@example.org"]);
        assert_eq!(e.date, 1789480920);
        assert_eq!(e.kind, Kind::Person);
        assert!(!e.has_attachments);
        assert_eq!(thread_subject(&e.subject), "réunion");
        assert!(is_reply_subject(&e.subject));
        let b = body(OUTLOOK_REPLY).unwrap();
        assert!(b.html.as_deref().unwrap().contains("mardi à 10h"));
        assert!(b.text.starts_with("D'accord pour mardi à 10h."));
        assert_eq!(snippet(&b.text, 140), "D'accord pour mardi à 10h.");
    }

    #[test]
    fn subjects_fold_to_their_conversation() {
        assert_eq!(thread_subject("Re: Fwd: RE[2]: Hello  World"), "hello world");
        assert_eq!(thread_subject("[physics-l] Re: Seminar"), "seminar");
        assert_eq!(thread_subject("TR : Réunion"), "réunion");
        assert_eq!(thread_subject("AW: WG: Termin"), "termin");
        assert!(!is_reply_subject("Seminar"));
        assert!(!is_reply_subject("[list] Seminar"));
        assert!(is_reply_subject("[list] Re: Seminar"));
        assert!(!is_reply_subject("Recruiting: new posts"), "a word that starts with re is no prefix");
    }

    #[test]
    fn broken_and_missing_headers_still_make_an_envelope() {
        let raw = b"From: someone\r\nSubject: no id, bad date\r\nDate: yesterday-ish\r\nReferences: bare@id.example\r\n\r\nhello\r\n";
        let e = envelope(raw, Some(1_700_000_000));
        assert!(e.message_id.starts_with("atlas.") && e.message_id.ends_with("@local"));
        assert_eq!(e.date, 1_700_000_000, "the arrival date stands in for a date that cannot be read");
        assert_eq!(e.references, vec!["bare@id.example"]);
        assert_eq!(envelope(raw, None).message_id, e.message_id, "the made-up id is stable");
    }

    #[test]
    fn kinds_by_the_headers_shape() {
        let n = envelope(b"From: GitHub <notifications@github.example>\r\nSubject: x\r\n\r\n", None);
        assert_eq!(n.kind, Kind::Notification);
        let l = envelope(b"From: News <news@shop.example>\r\nList-Unsubscribe: <mailto:u@shop.example>, <https://shop.example/u?x=1>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\nSubject: x\r\n\r\n", None);
        assert_eq!(l.kind, Kind::Newsletter);
        let u = l.unsubscribe.unwrap();
        assert_eq!(u.url.as_deref(), Some("https://shop.example/u?x=1"));
        assert_eq!(u.mailto.as_deref(), Some("mailto:u@shop.example"));
        assert!(u.one_click);
        let r = envelope(b"From: no-reply@bank.example\r\nSubject: x\r\n\r\n", None);
        assert_eq!(r.kind, Kind::Notification);
    }

    #[test]
    fn attachments_inline_images_invites_and_forwarded_messages() {
        let raw = b"From: a@b.c\r\nSubject: s\r\nContent-Type: multipart/mixed; boundary=\"m\"\r\n\r\n--m\r\nContent-Type: multipart/related; boundary=\"r\"\r\n\r\n--r\r\nContent-Type: text/html\r\n\r\n<p>see <img src=\"cid:logo@x\"></p>\r\n--r\r\nContent-Type: image/png\r\nContent-ID: <logo@x>\r\nContent-Transfer-Encoding: base64\r\n\r\niVBORw0KGgo=\r\n--r--\r\n--m\r\nContent-Type: application/pdf; name=\"paper.pdf\"\r\nContent-Disposition: attachment; filename=\"paper.pdf\"\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0xLjQK\r\n--m\r\nContent-Type: text/calendar; method=REQUEST\r\n\r\nBEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nSUMMARY:Group meeting\\, room 3\r\nDTSTART;TZID=America/Toronto:20261023T090000\r\nDTEND:20261023T100000Z\r\nLOCATION:D3-20\r\nORGANIZER;CN=\"Ana\":mailto:ana@uni.example\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n--m\r\nContent-Type: message/rfc822\r\n\r\nFrom: inner@x.example\r\nSubject: The original\r\nMessage-ID: <inner@x.example>\r\n\r\nInner text\r\n--m--\r\n";
        let e = envelope(raw, None);
        assert!(e.has_attachments);
        let b = body(raw).unwrap();
        let names: Vec<_> = b.attachments.iter().map(|a| (a.name.as_str(), a.inline)).collect();
        assert!(names.contains(&("paper.pdf", false)), "{names:?}");
        assert!(names.contains(&("invite.ics", false)), "the invitation is a file too: {names:?}");
        assert!(b.attachments.iter().any(|a| a.cid.as_deref() == Some("logo@x") && a.inline), "{names:?}");
        let inv = b.invite.unwrap();
        assert_eq!(inv.summary, "Group meeting, room 3");
        assert_eq!(chrono::DateTime::parse_from_rfc3339(&inv.start).unwrap().timestamp(), 1_792_760_400, "09:00 in Toronto");
        assert_eq!(chrono::DateTime::parse_from_rfc3339(&inv.end).unwrap().timestamp(), 1_792_749_600, "10:00 UTC");
        assert_eq!(inv.organizer, "Ana");
        assert_eq!(inv.method, "REQUEST");
        assert_eq!(b.forwarded.len(), 1);
        assert_eq!(b.forwarded[0].0.subject, "The original");
        assert!(b.forwarded[0].1.text.contains("Inner text"));
        let pdf = b.attachments.iter().find(|a| a.name == "paper.pdf").unwrap();
        let (bytes, name, mime) = part_bytes(raw, pdf.part).unwrap();
        assert_eq!((bytes.as_slice(), name.as_str(), mime.as_str()), (&b"%PDF-1.4\n"[..], "paper.pdf", "application/pdf"));
        assert_eq!(inline_images(raw)[0].0, "logo@x");
    }

    #[test]
    fn html_becomes_text_without_its_style_and_with_its_entities() {
        let t = html_text("<html><head><style>.a{}</style><title>T</title></head><body><p>Caf&eacute; &amp; &#8364;5</p><br><div>Next&nbsp;line</div><!-- hidden --></body></html>");
        assert_eq!(t, "Café & €5\n\nNext line");
    }

    #[test]
    fn snippets_skip_quotes_signatures_and_preheader_padding() {
        assert_eq!(snippet("Thanks!\n\nOn Tue, Ana wrote:\n> the question", 140), "Thanks!");
        assert_eq!(snippet("Le mar. 15 sept., Ana a écrit :\n> x", 140), "x", "no words of its own: the quote it carries");
        assert_eq!(snippet("Hello\u{200c} \u{200c} world\n-- \nsig", 140), "Hello world");
        assert_eq!(snippet("a b c d e f", 5), "a b c…");
    }

    #[test]
    fn a_shift_jis_message_is_read() {
        // 「会議」 in Shift_JIS
        let raw = b"From: a@b.jp\r\nSubject: =?Shift_JIS?B?ie+LYw==?=\r\nContent-Type: text/plain; charset=Shift_JIS\r\n\r\n\x89\xef\x8b\x63\r\n";
        let e = envelope(raw, None);
        assert_eq!(e.subject, "会議");
        assert_eq!(body(raw).unwrap().text.trim(), "会議");
    }

    #[test]
    fn previews_found_wanting_in_real_mail() {
        // Outlook's inline-picture marks, link marks, rules and tracking links (seen in real mail)
        assert_eq!(snippet("All good, let me know KR [cid:46a7f855-9633-4879] Audrey", 200), "All good, let me know KR Audrey");
        assert_eq!(snippet("VOIR VERSION NAVIGATEUR {1} {2} PRIX", 200), "VOIR VERSION NAVIGATEUR PRIX");
        assert_eq!(snippet("============ RELEVÉ ============\nHi [image: Logo] there", 200), "RELEVÉ Hi there");
        assert_eq!(snippet("New link: https://filesender.renater.fr/?s=download&token=7a1b1b01 ok", 200), "New link: filesender.renater.fr… ok");
        // entities in a text part, Latin-1 names included
        let b = body(b"Content-Type: text/plain\r\n\r\nNous avons bien enregistr&eacute; votre paiement, n&deg;5 &Uuml;ber\r\n").unwrap();
        assert_eq!(b.text.trim(), "Nous avons bien enregistré votre paiement, n°5 Über");
        // a text part that is HTML source is drawn as HTML and read as text
        let h = body(b"Content-Type: text/plain\r\n\r\n<html> <body style='font-size:10pt'><p>Bonjour <b>Alice</b></p></body></html>\r\n").unwrap();
        assert!(h.html.as_deref().is_some_and(|x| x.contains("<b>Alice</b>")));
        assert_eq!(h.text, "Bonjour Alice");
        assert_eq!(html_text("<p>Your <img alt=\"N*306>01K09\" src=x> pass</p>"), "Your pass");
        // nothing of its own: what it forwards, else its files
        assert_eq!(snippet("\n________________________________\nFrom: Abdu <a@x.example>\nSent: Wednesday\nTo: M <m@x.example>\nSubject: Summary\n\nSalut!\n\nHere it is.\n", 200), "Salut! Here it is.");
        assert_eq!(snippet("\n\nLe Mercredi, Janvier 21, 2026 15:15 CET, \"H D\" <h@x.example> a écrit:\n\nEnclosed are the guidelines.\n\n-- \nProf. H\n", 200), "Enclosed are the guidelines.");
        // ordinary text with an ampersand stays as it is
        assert_eq!(body(b"Content-Type: text/plain\r\n\r\nTom & Jerry; fine\r\n").unwrap().text.trim(), "Tom & Jerry; fine");
    }
}
