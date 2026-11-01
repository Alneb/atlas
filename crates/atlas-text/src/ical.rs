//! iCalendar (RFC 5545) at the level of text, shared by the plugin engines that read or write it (the calendar's
//! events, the mail's invitations): TEXT escaping, line folding at 75 octets, and one content line with its
//! parameters (a quoted parameter value may hold `:`, `;` and `,`).

/// TEXT value escaping (RFC 5545 §3.3.11): backslash, `;`, `,` and line breaks.
pub fn escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\\' => out.push_str("\\\\"),
            ';' => out.push_str("\\;"),
            ',' => out.push_str("\\,"),
            '\r' => {
                if chars.peek() == Some(&'\n') {
                    chars.next();
                }
                out.push_str("\\n");
            }
            '\n' => out.push_str("\\n"),
            c if c.is_control() && c != '\t' => {}
            c => out.push(c),
        }
    }
    out
}

pub fn unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('n') | Some('N') => out.push('\n'),
            Some(x) => out.push(x),
            None => out.push('\\'),
        }
    }
    out
}

/// One content line folded so no physical line passes 75 octets (§3.1), never inside a UTF-8 character.
pub fn fold(line: &str) -> String {
    let mut out = String::with_capacity(line.len() + line.len() / 70 * 3);
    let mut width = 0;
    for c in line.chars() {
        let n = c.len_utf8();
        if width + n > 75 {
            out.push_str("\r\n ");
            width = 1; // the leading space counts
        }
        out.push(c);
        width += n;
    }
    out
}

/// Folded lines joined again (CRLF or LF, then a space or a tab).
pub fn unfold(text: &str) -> String {
    text.replace("\r\n ", "").replace("\r\n\t", "").replace("\n ", "").replace("\n\t", "")
}

/// One content line: `NAME;PARAM=value:VALUE`.
#[derive(Debug, Clone, PartialEq)]
pub struct Line {
    pub name: String,
    pub params: Vec<(String, String)>,
    pub value: String,
}

impl Line {
    pub fn parse(raw: &str) -> Option<Line> {
        // the value starts at the first ':' outside a quoted parameter value
        let mut quoted = false;
        let mut split = None;
        for (i, c) in raw.char_indices() {
            match c {
                '"' => quoted = !quoted,
                ':' if !quoted => {
                    split = Some(i);
                    break;
                }
                _ => {}
            }
        }
        let i = split?;
        let (head, value) = (&raw[..i], &raw[i + 1..]);
        let mut parts = Vec::new();
        let (mut cur, mut quoted) = (String::new(), false);
        for c in head.chars() {
            match c {
                '"' => {
                    quoted = !quoted;
                    cur.push(c);
                }
                ';' if !quoted => parts.push(std::mem::take(&mut cur)),
                c => cur.push(c),
            }
        }
        parts.push(cur);
        let name = parts.remove(0).trim().to_ascii_uppercase();
        if name.is_empty() {
            return None;
        }
        let params = parts
            .into_iter()
            .filter_map(|p| {
                p.split_once('=').map(|(k, v)| (k.trim().to_ascii_uppercase(), v.trim().trim_matches('"').to_string()))
            })
            .collect();
        Some(Line { name, params, value: value.to_string() })
    }

    pub fn param(&self, name: &str) -> Option<&str> {
        self.params.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
    }

    pub fn write(&self) -> String {
        let mut s = self.name.clone();
        for (k, v) in &self.params {
            let q = v.contains([':', ';', ',']);
            s.push_str(&if q { format!(";{k}=\"{v}\"") } else { format!(";{k}={v}") });
        }
        s.push(':');
        s.push_str(&self.value);
        fold(&s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_is_escaped_and_unescaped_symmetrically() {
        let s = "Exam; room 3, \"B\" \\ notes\r\nline two\nthree";
        assert_eq!(escape(s), "Exam\\; room 3\\, \"B\" \\\\ notes\\nline two\\nthree");
        assert_eq!(unescape(&escape(s)), s.replace("\r\n", "\n"));
    }

    #[test]
    fn long_lines_fold_at_75_octets_without_splitting_a_character_and_unfold_back() {
        let line = format!("SUMMARY:{}", "Réunion du séminaire de physique — ".repeat(5));
        let folded = fold(&line);
        for l in folded.split("\r\n") {
            assert!(l.len() <= 75, "{} octets: {l:?}", l.len());
        }
        assert!(folded.split("\r\n").skip(1).all(|l| l.starts_with(' ')));
        assert_eq!(unfold(&folded), line);
        assert_eq!(fold("SHORT:x"), "SHORT:x");
    }

    #[test]
    fn an_escaped_backslash_before_an_n_is_not_a_line_break() {
        assert_eq!(unescape(r"C:\\new\, folder\nnext"), "C:\\new, folder\nnext");
    }

    #[test]
    fn a_quoted_parameter_keeps_its_semicolons_and_colons() {
        let l = Line::parse(r#"ATTENDEE;CN="Doe; John";PARTSTAT=ACCEPTED:mailto:j@example.org"#).unwrap();
        assert_eq!(l.name, "ATTENDEE");
        assert_eq!(l.param("CN"), Some("Doe; John"));
        assert_eq!(l.param("PARTSTAT"), Some("ACCEPTED"));
        assert_eq!(l.value, "mailto:j@example.org");
        assert_eq!(Line::parse(&l.write()), Some(l));
        assert_eq!(Line::parse("no colon"), None);
    }
}
