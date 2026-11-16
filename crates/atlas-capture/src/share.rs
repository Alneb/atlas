//! What a share or a selection brings into a capture box as text: the desktop box's and the phone's one rule.

/// Text as a Markdown quote, line by line (a blank line stays a bare `>`).
pub fn quote(t: &str) -> String {
    t.lines().map(|l| if l.trim().is_empty() { ">".to_string() } else { format!("> {l}") }).collect::<Vec<_>>().join("\n")
}

/// A share's text, its subject first when the text does not already hold it (a page's title before its address).
pub fn with_subject(subject: &str, text: &str) -> String {
    if text.is_empty() {
        subject.to_string()
    } else if subject.is_empty() || text.contains(subject) {
        text.to_string()
    } else {
        format!("{subject}\n{text}")
    }
}

/// What a share sheet brings, as the box shows it: the subject cleaned ([`title_of`]) and put first when the text does
/// not already say it ([`with_subject`]). The addresses' tracking parameters are taken off by the caller (atlas-text).
pub fn shared(subject: &str, text: &str) -> String {
    let text = text.replace("\r\n", "\n");
    let text = text.trim();
    let subject = title_of(subject.trim(), text);
    with_subject(&subject, text)
}

/// A share's subject as a title, by its shape — never by the app it came from:
/// - an address, or a word the text's address names (`Spotify` beside `open.spotify.com/…`): nothing a title adds;
/// - one quoted part in a few words around it (`Watch "Dune" on YouTube`, `“Dune” on Letterboxd`): the quoted part;
/// - the same text again, in any case: nothing.
pub fn title_of(subject: &str, text: &str) -> String {
    if subject.is_empty() {
        return String::new();
    }
    if subject.starts_with("http://") || subject.starts_with("https://") {
        return if text.contains(subject) { String::new() } else { subject.to_string() };
    }
    let lower = subject.to_lowercase();
    if !subject.contains(char::is_whitespace) && hosts(text).iter().any(|h| h.split('.').any(|part| part == lower)) {
        return String::new();
    }
    if text.to_lowercase().contains(&lower) {
        return String::new();
    }
    quoted(subject).unwrap_or_else(|| subject.to_string())
}

/// The one quoted part of a short phrase (at most four words outside it), straight or curly quotes.
fn quoted(s: &str) -> Option<String> {
    for (open, close) in [('"', '"'), ('“', '”'), ('«', '»'), ('„', '“')] {
        let Some(a) = s.find(open) else { continue };
        let inner = &s[a + open.len_utf8()..];
        let Some(b) = inner.rfind(close) else { continue };
        let (title, after) = (&inner[..b], &inner[b + close.len_utf8()..]);
        let around = s[..a].split_whitespace().count() + after.split_whitespace().count();
        if !title.trim().is_empty() && around <= 4 && !title.contains(open) {
            return Some(title.trim().to_string());
        }
    }
    None
}

/// The hosts of the addresses in `text`, lower case (`www.` kept: the parts are compared one by one).
fn hosts(text: &str) -> Vec<String> {
    text.split_whitespace()
        .filter_map(|w| w.split_once("://").map(|(_, r)| r))
        .map(|r| r[..r.find(['/', '?', '#']).unwrap_or(r.len())].to_lowercase())
        .collect()
}

/// A share never replaces an unsent draft (leaving would then save over it): it goes under the draft.
pub fn under_draft(draft: &str, shared: &str) -> String {
    if shared.is_empty() {
        draft.to_string()
    } else if draft.trim().is_empty() {
        shared.to_string()
    } else {
        format!("{}\n{shared}", draft.trim_end())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_share_goes_under_a_draft_with_its_subject_first() {
        assert_eq!(with_subject("Dune", "https://example.org/dune"), "Dune\nhttps://example.org/dune");
        assert_eq!(with_subject("Dune", "Dune https://example.org/dune"), "Dune https://example.org/dune");
        assert_eq!(with_subject("Dune", ""), "Dune");
        assert_eq!(under_draft("call the lab\n", "https://example.org/x"), "call the lab\nhttps://example.org/x");
        assert_eq!(under_draft("  ", "https://example.org/x"), "https://example.org/x");
        assert_eq!(under_draft("call the lab", ""), "call the lab");
        assert_eq!(quote("spin liquid\n\nground state"), "> spin liquid\n>\n> ground state");
    }

    #[test]
    fn a_shares_subject_is_its_title_by_shape() {
        let yt = "https://youtu.be/dQw4w9WgXcQ";
        assert_eq!(shared("Watch \"Never Gonna Give You Up\" on YouTube", yt), format!("Never Gonna Give You Up\n{yt}"));
        assert_eq!(shared("Never Gonna Give You Up", yt), format!("Never Gonna Give You Up\n{yt}"));
        assert_eq!(shared("Spotify", "https://open.spotify.com/track/4u"), "https://open.spotify.com/track/4u", "the app's name");
        assert_eq!(shared(yt, yt), yt, "the address again");
        assert_eq!(shared("dune", "Dune https://example.org/dune"), "Dune https://example.org/dune", "any case");
        assert_eq!(shared("“Dune” on Letterboxd", "https://boxd.it/AbC"), "Dune\nhttps://boxd.it/AbC");
        // a long sentence with a quote in it is not a title wrapper
        let long = "He said \"go\" and then we all left the room together quietly";
        assert_eq!(title_of(long, ""), long);
        assert_eq!(shared("A note", ""), "A note");
        assert_eq!(shared("", "  text\r\nmore  "), "text\nmore");
    }
}
