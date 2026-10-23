//! A message the user wrote, built for sending (mail-builder): Markdown becomes the HTML part and stays the text part
//! (Markdown reads as plain text); the signature goes under "-- "; a reply quotes what it answers below it (HTML as a
//! cited blockquote, text with "> "), threads by In-Reply-To / References, and a forward carries the original's files.

use crate::parse::{escape, Person};
use mail_builder::headers::address::Address;
use mail_builder::headers::raw::Raw;
use mail_builder::MessageBuilder;
use serde::Deserialize;

#[derive(Debug, Clone, Default, Deserialize)]
pub struct File {
    pub name: String,
    #[serde(default)]
    pub mime: String,
    /// the bytes (the page sends them base64 in `data`; the engine reads vault files and the original's parts itself)
    #[serde(skip)]
    pub bytes: Vec<u8>,
}

/// What the composer sends.
#[derive(Debug, Clone, Default)]
pub struct Draft {
    pub from: Person,
    pub to: Vec<Person>,
    pub cc: Vec<Person>,
    pub bcc: Vec<Person>,
    pub subject: String,
    /// what the user typed (Markdown)
    pub body: String,
    pub signature: String,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
    /// the message answered or forwarded, quoted under the body: (who wrote it, when (unix), its HTML, its text, forward?)
    pub quote: Option<Quote>,
    pub files: Vec<File>,
    /// send at this time (unix seconds): kept in Drafts until then (X-Atlas-Send-At)
    pub send_at: Option<i64>,
}

#[derive(Debug, Clone, Default)]
pub struct Quote {
    pub from: Person,
    pub to: Vec<Person>,
    pub cc: Vec<Person>,
    pub subject: String,
    pub date: i64,
    pub html: Option<String>,
    pub text: String,
    pub forward: bool,
}

/// "Name <a@b>, c@d" → people (commas inside quotes kept).
pub fn people(list: &str) -> Vec<Person> {
    let mut out = vec![];
    let mut cur = String::new();
    let mut quoted = false;
    let mut angle = false;
    for c in list.chars() {
        match c {
            '"' => {
                quoted = !quoted;
                cur.push(c)
            }
            '<' => {
                angle = true;
                cur.push(c)
            }
            '>' => {
                angle = false;
                cur.push(c)
            }
            ',' | ';' | '\n' if !quoted && !angle => {
                out.extend(person(&cur));
                cur.clear();
            }
            _ => cur.push(c),
        }
    }
    out.extend(person(&cur));
    out
}

fn person(s: &str) -> Option<Person> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    let addr = crate::parse::bare(s);
    if !addr.contains('@') {
        return None;
    }
    let name = match s.rfind('<') {
        Some(i) => s[..i].trim().trim_matches('"').trim().to_string(),
        None => String::new(),
    };
    Some(Person { name, addr })
}

fn addresses(ps: &[Person]) -> Address<'static> {
    Address::new_list(ps.iter().map(|p| if p.name.is_empty() { Address::new_address(None::<String>, p.addr.clone()) } else { Address::new_address(Some(p.name.clone()), p.addr.clone()) }).collect())
}

fn when(t: i64) -> String {
    chrono::DateTime::from_timestamp(t, 0).map(|d| d.with_timezone(&chrono::Local).format("%a, %-d %b %Y at %H:%M").to_string()).unwrap_or_default()
}

/// Markdown → HTML for the message (tables, strikethrough, task lists; raw HTML the user typed is escaped).
pub fn markdown(md: &str) -> String {
    use pulldown_cmark::{html, Event, Options, Parser};
    let opts = Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS;
    let events = Parser::new_ext(md, opts).map(|e| match e {
        Event::Html(h) | Event::InlineHtml(h) => Event::Text(h),
        // a single line break is a line break in a mail, as people type them
        Event::SoftBreak => Event::HardBreak,
        e => e,
    });
    let mut out = String::new();
    html::push_html(&mut out, events);
    out
}

/// A fresh Message-ID on the sender's domain.
pub fn message_id(from: &str) -> String {
    let domain = from.rsplit('@').next().filter(|d| d.contains('.')).unwrap_or("atlas.local");
    format!("{:x}.{:x}@{domain}", chrono::Utc::now().timestamp_millis(), rand::random::<u64>())
}

/// The message as bytes → (raw, its Message-ID, envelope recipients).
pub fn build(d: &Draft) -> Result<(Vec<u8>, String, Vec<String>), String> {
    if d.from.addr.is_empty() {
        return Err("the account has no address to send from".into());
    }
    let id = message_id(&d.from.addr);
    let sig_html = if d.signature.trim().is_empty() { String::new() } else { format!("<div class=\"atlas-signature\">-- <br>{}</div>", escape(d.signature.trim()).replace('\n', "<br>")) };
    let sig_text = if d.signature.trim().is_empty() { String::new() } else { format!("\n\n-- \n{}", d.signature.trim()) };
    let (quote_html, quote_text) = match &d.quote {
        None => (String::new(), String::new()),
        Some(q) if q.forward => {
            let head = |h: bool| {
                let line = |k: &str, v: String| if v.is_empty() { String::new() } else if h { format!("<b>{k}:</b> {}<br>", escape(&v)) } else { format!("{k}: {v}\n") };
                let list = |ps: &[Person]| ps.iter().map(Person::display).collect::<Vec<_>>().join(", ");
                format!(
                    "{}{}{}{}{}",
                    line("From", q.from.display()),
                    line("Date", when(q.date)),
                    line("Subject", q.subject.clone()),
                    line("To", list(&q.to)),
                    line("Cc", list(&q.cc))
                )
            };
            (
                format!("<div class=\"atlas-forward\"><p>---------- Forwarded message ----------<br>{}</p>{}</div>", head(true), q.html.clone().unwrap_or_else(|| crate::render::text_html(&q.text, false))),
                format!("\n\n---------- Forwarded message ----------\n{}\n{}", head(false), q.text),
            )
        }
        Some(q) => {
            let who = if q.from.name.is_empty() { q.from.addr.clone() } else { format!("{} <{}>", q.from.name, q.from.addr) };
            let intro = format!("On {}, {who} wrote:", when(q.date));
            let body_html = q.html.clone().unwrap_or_else(|| crate::render::text_html(&q.text, false));
            let quoted_text: String = q.text.lines().map(|l| if l.starts_with('>') { format!(">{l}\n") } else { format!("> {l}\n") }).collect();
            (
                format!("<div class=\"atlas-quote\"><p>{}</p><blockquote type=\"cite\" style=\"margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex\">{body_html}</blockquote></div>", escape(&intro)),
                format!("\n\n{intro}\n{quoted_text}"),
            )
        }
    };
    let html = format!("<!doctype html><html><head><meta charset=\"utf-8\"></head><body><div class=\"atlas-body\">{}</div>{sig_html}{quote_html}</body></html>", markdown(&d.body));
    let text = format!("{}{sig_text}{quote_text}", d.body.trim_end());
    let from = if d.from.name.is_empty() { Address::new_address(None::<String>, d.from.addr.clone()) } else { Address::new_address(Some(d.from.name.clone()), d.from.addr.clone()) };
    let mut m = MessageBuilder::new().from(from).subject(d.subject.clone()).message_id(id.clone()).date(chrono::Utc::now().timestamp()).header("X-Mailer", Raw::new("Atlas"));
    if !d.to.is_empty() {
        m = m.to(addresses(&d.to));
    }
    if !d.cc.is_empty() {
        m = m.cc(addresses(&d.cc));
    }
    if !d.bcc.is_empty() {
        // kept in a draft (so a scheduled send knows them); stripped before the message is sent
        m = m.bcc(addresses(&d.bcc));
    }
    if let Some(irt) = &d.in_reply_to {
        m = m.in_reply_to(irt.clone());
        let mut refs = d.references.clone();
        if !refs.contains(irt) {
            refs.push(irt.clone());
        }
        m = m.references(refs);
    }
    if let Some(t) = d.send_at {
        m = m.header("X-Atlas-Send-At", Raw::new(t.to_string()));
    }
    m = m.text_body(text).html_body(html);
    for f in &d.files {
        let mime = if f.mime.is_empty() { mime_of(&f.name).to_string() } else { f.mime.clone() };
        m = m.attachment(mime, f.name.clone(), f.bytes.clone());
    }
    let raw = m.write_to_vec().map_err(|e| format!("cannot build the message: {e}"))?;
    let rcpt: Vec<String> = d.to.iter().chain(&d.cc).chain(&d.bcc).map(|p| p.addr.clone()).collect();
    Ok((raw, id, rcpt))
}

/// The message without its Bcc header (what the recipients get; the envelope still carries every address).
pub fn without_bcc(raw: &[u8]) -> Vec<u8> {
    let Some(end) = raw.windows(4).position(|w| w == b"\r\n\r\n") else { return raw.to_vec() };
    let head = String::from_utf8_lossy(&raw[..end]);
    let mut out = String::new();
    let mut skipping = false;
    for line in head.split("\r\n") {
        let cont = line.starts_with(' ') || line.starts_with('\t');
        if !cont {
            skipping = line.to_lowercase().starts_with("bcc:") || line.to_lowercase().starts_with("x-atlas-send-at:");
        }
        if !skipping {
            out.push_str(line);
            out.push_str("\r\n");
        }
    }
    let mut v = out.into_bytes();
    v.extend_from_slice(&raw[end + 2..]);
    v
}

/// A file's type from its name, for attachments the page did not type.
pub fn mime_of(name: &str) -> &'static str {
    match name.rsplit('.').next().map(|e| e.to_lowercase()).as_deref() {
        Some("pdf") => "application/pdf",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("txt" | "md") => "text/plain",
        Some("html" | "htm") => "text/html",
        Some("csv") => "text/csv",
        Some("ics") => "text/calendar",
        Some("zip") => "application/zip",
        Some("gz" | "tgz") => "application/gzip",
        Some("tex") => "application/x-tex",
        Some("bib") => "text/x-bibtex",
        Some("doc") => "application/msword",
        Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Some("xls") => "application/vnd.ms-excel",
        Some("xlsx") => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Some("ppt") => "application/vnd.ms-powerpoint",
        Some("pptx") => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        Some("mp3") => "audio/mpeg",
        Some("mp4") => "video/mp4",
        Some("json") => "application/json",
        _ => "application/octet-stream",
    }
}

/// "Re: " once (not "Re: Re:"), "Fwd: " for a forward.
pub fn reply_subject(subject: &str, forward: bool) -> String {
    let base = subject.trim();
    if forward {
        if base.to_lowercase().starts_with("fwd:") || base.to_lowercase().starts_with("fw:") { base.to_string() } else { format!("Fwd: {base}") }
    } else if crate::parse::is_reply_subject(base) && base.to_lowercase().starts_with("re") {
        base.to_string()
    } else {
        format!("Re: {base}")
    }
}

/// Who a reply goes to: Reply-To (else From) of the message; reply all adds its To and Cc, never the user's own.
pub fn reply_people(from: &[Person], reply_to: &[Person], to: &[Person], cc: &[Person], all: bool, own: &[String]) -> (Vec<Person>, Vec<Person>) {
    let mine = |p: &Person| own.contains(&p.addr.to_lowercase());
    let from_me = from.iter().any(mine);
    // answering my own message: to the ones I wrote to
    let mut first: Vec<Person> = if from_me { to.to_vec() } else if !reply_to.is_empty() { reply_to.to_vec() } else { from.to_vec() };
    first.retain(|p| !mine(p) || from_me && first_is_only_me(to, own));
    let mut seen: Vec<String> = first.iter().map(|p| p.addr.to_lowercase()).collect();
    let mut cc_out = vec![];
    if all {
        for p in to.iter().chain(cc) {
            let a = p.addr.to_lowercase();
            if !mine(p) && !seen.contains(&a) {
                seen.push(a);
                cc_out.push(p.clone());
            }
        }
    }
    (first, cc_out)
}

fn first_is_only_me(to: &[Person], own: &[String]) -> bool {
    to.iter().all(|p| own.contains(&p.addr.to_lowercase()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::{body, envelope};

    fn p(n: &str, a: &str) -> Person {
        Person { name: n.into(), addr: a.into() }
    }

    #[test]
    fn address_lists_with_commas_in_names() {
        assert_eq!(people("\"Lopez, Ana\" <ana@x.example>; bo@y.example,\nC <c@z.example>, nonsense"), vec![p("Lopez, Ana", "ana@x.example"), p("", "bo@y.example"), p("C", "c@z.example")]);
    }

    #[test]
    fn a_reply_threads_quotes_and_signs() {
        let d = Draft {
            from: p("Me", "me@x.example"),
            to: vec![p("Ana", "ana@x.example")],
            bcc: vec![p("", "secret@x.example")],
            subject: reply_subject("RE: Plan", false),
            body: "Sounds **good**.\nSee you".into(),
            signature: "Me\nLab".into(),
            in_reply_to: Some("a@x".into()),
            references: vec!["root@x".into()],
            quote: Some(Quote { from: p("Ana", "ana@x.example"), date: 1_789_480_920, text: "Shall we?\n> earlier".into(), ..Default::default() }),
            files: vec![File { name: "notes.pdf".into(), mime: String::new(), bytes: b"%PDF".to_vec() }],
            ..Default::default()
        };
        let (raw, id, rcpt) = build(&d).unwrap();
        assert!(id.ends_with("@x.example"));
        assert_eq!(rcpt, vec!["ana@x.example", "secret@x.example"]);
        let e = envelope(&raw, None);
        assert_eq!(e.subject, "RE: Plan");
        assert_eq!(e.in_reply_to, vec!["a@x"]);
        assert_eq!(e.references, vec!["root@x", "a@x"]);
        let b = body(&raw).unwrap();
        assert!(b.html.as_deref().unwrap().contains("Sounds <strong>good</strong>.<br />"), "{:?}", b.html);
        assert!(b.text.contains("Sounds **good**.\nSee you\n\n-- \nMe\nLab\n\nOn "), "{}", b.text);
        assert!(b.text.contains("Ana <ana@x.example> wrote:\n> Shall we?\n>> earlier"), "{:?}", b.text);
        assert_eq!(b.attachments.iter().map(|a| (a.name.as_str(), a.mime.as_str())).collect::<Vec<_>>(), vec![("notes.pdf", "application/pdf")]);
        let sent = without_bcc(&raw);
        assert!(!String::from_utf8_lossy(&sent).to_lowercase().contains("bcc:"));
        assert!(String::from_utf8_lossy(&raw).to_lowercase().contains("bcc:"));
        assert_eq!(envelope(&sent, None).message_id, id);
    }

    #[test]
    fn typed_html_is_text_not_markup() {
        assert!(markdown("<script>x</script> & <b>").contains("&lt;script&gt;"));
    }

    #[test]
    fn who_a_reply_goes_to() {
        let own = vec!["me@x.example".to_string()];
        let (to, cc) = reply_people(&[p("Ana", "ana@x.example")], &[], &[p("", "me@x.example"), p("", "bo@x.example")], &[p("", "cy@x.example"), p("", "ana@x.example")], true, &own);
        assert_eq!(to, vec![p("Ana", "ana@x.example")]);
        assert_eq!(cc.iter().map(|p| p.addr.as_str()).collect::<Vec<_>>(), vec!["bo@x.example", "cy@x.example"]);
        let (to, _) = reply_people(&[p("", "list@x.example")], &[p("", "reply@x.example")], &[], &[], false, &own);
        assert_eq!(to[0].addr, "reply@x.example");
        let (to, _) = reply_people(&[p("Me", "me@x.example")], &[], &[p("", "bo@x.example")], &[], false, &own);
        assert_eq!(to[0].addr, "bo@x.example", "answering my own message goes to whom I wrote");
        assert_eq!(reply_subject("Re: Plan", false), "Re: Plan");
        assert_eq!(reply_subject("Plan", true), "Fwd: Plan");
        assert_eq!(reply_subject("Recruiting", false), "Re: Recruiting");
    }
}
