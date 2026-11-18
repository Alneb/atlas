//! A note's searchable text: its HTML (a kept mail's body, pasted HTML) as the words a reader sees. Tags, their
//! attributes, comments, `<style>` and `<script>` are blanked; entities are decoded. **Every line break is kept**, so a
//! hit's line is the file's line. Fenced code blocks are left as written (HTML there is what the note is about).
//! The search's confirmation pass reads this (search.rs), and so will the index (docs/design/DESIGN-search-index.md).

use std::borrow::Cow;

/// `text` with its markup blanked (see the module); borrowed when there is none.
pub fn searchable(text: &str) -> Cow<'_, str> {
    if !text.contains('<') && !text.contains('&') {
        return Cow::Borrowed(text);
    }
    let mut out = String::with_capacity(text.len());
    let mut fence: Option<&str> = None;
    let mut skip_until: Option<&'static str> = None; // inside <style>/<script>/a comment: blank until this closes it
    let mut in_tag = false;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim_start();
        // fenced code: ``` or ~~~ opens, the same fence closes; outside any HTML being skipped
        if skip_until.is_none() && !in_tag {
            if let Some(f) = fence {
                out.push_str(line);
                if trimmed.starts_with(f) {
                    fence = None;
                }
                continue;
            }
            if let Some(f) = ["```", "~~~"].into_iter().find(|f| trimmed.starts_with(f)) {
                fence = Some(f);
                out.push_str(line);
                continue;
            }
        }
        blank_line(line, &mut out, &mut skip_until, &mut in_tag);
    }
    Cow::Owned(out)
}

/// One line's markup blanked into `out`, carrying the open tag / skipped element over to the next line.
fn blank_line(line: &str, out: &mut String, skip_until: &mut Option<&'static str>, in_tag: &mut bool) {
    let mut rest = line;
    while !rest.is_empty() {
        if let Some(end) = *skip_until {
            match find_ci(rest, end) {
                Some(i) => {
                    blank(&rest[..i + end.len()], out);
                    rest = &rest[i + end.len()..];
                    *skip_until = None;
                }
                None => return blank(rest, out),
            }
            continue;
        }
        if *in_tag {
            match rest.find('>') {
                Some(i) => {
                    blank(&rest[..=i], out);
                    rest = &rest[i + 1..];
                    *in_tag = false;
                }
                None => return blank(rest, out),
            }
            continue;
        }
        let Some(i) = rest.find(['<', '&']) else {
            out.push_str(rest);
            return;
        };
        out.push_str(&rest[..i]);
        rest = &rest[i..];
        if rest.starts_with('&') {
            match entity(rest) {
                Some((ch, len)) => {
                    // the decoded character: columns shift, lines do not
                    out.push(ch);
                    rest = &rest[len..];
                }
                None => {
                    out.push('&');
                    rest = &rest[1..];
                }
            }
            continue;
        }
        // `<` opens markup only before a letter, `/` or `!` — so `a < b` and `<3` stay text
        let next = rest[1..].chars().next();
        if rest.starts_with("<!--") {
            *skip_until = Some("-->");
            blank(&rest[..4], out);
            rest = &rest[4..];
        } else if next.is_some_and(|c| c.is_ascii_alphabetic() || c == '/' || c == '!') {
            let name: String = rest[1..].chars().take_while(|c| c.is_ascii_alphanumeric()).collect::<String>().to_ascii_lowercase();
            if name == "style" || name == "script" {
                *skip_until = Some(if name == "style" { "</style>" } else { "</script>" });
                blank(&rest[..1], out);
                rest = &rest[1..];
            } else {
                *in_tag = true;
            }
        } else {
            out.push('<');
            rest = &rest[1..];
        }
    }
}

/// Spaces for `s`, its line break kept.
fn blank(s: &str, out: &mut String) {
    for c in s.chars() {
        out.push(if c == '\n' { '\n' } else { ' ' });
    }
}

/// The first `needle` in `hay`, ASCII case ignored.
fn find_ci(hay: &str, needle: &str) -> Option<usize> {
    hay.as_bytes().windows(needle.len()).position(|w| w.eq_ignore_ascii_case(needle.as_bytes()))
}

/// The entity at the start of `s` (`&amp;`, `&#233;`, `&#xE9;`): its character and length.
fn entity(s: &str) -> Option<(char, usize)> {
    // bytes, not a slice of the text: the 12th byte may fall inside a character (`&` then accented words)
    let end = s.bytes().take(12).position(|b| b == b';')?;
    let name = &s[1..end];
    let ch = match name {
        "amp" => '&',
        "lt" => '<',
        "gt" => '>',
        "quot" => '"',
        "apos" => '\'',
        "nbsp" => ' ',
        _ => {
            let n = name.strip_prefix('#')?;
            let code = match n.strip_prefix(['x', 'X']) {
                Some(hex) => u32::from_str_radix(hex, 16).ok()?,
                None => n.parse().ok()?,
            };
            char::from_u32(code)?
        }
    };
    Some((ch, end + 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_kept_mail_is_its_words_on_its_lines() {
        let note = "# Booking\n<!-- mail {\"message_id\":\"<a@b>\"} -->\n<div class=\"email-html\">\n<style>\np { color: red }\n</style>\n<h3>Your booking &amp; <a href=\"https://x.example\">manage it</a></h3>\n</div>\n";
        let s = searchable(note);
        assert_eq!(s.lines().count(), note.lines().count(), "every line kept");
        let lines: Vec<&str> = s.lines().map(str::trim).collect();
        assert_eq!(lines[0], "# Booking");
        assert_eq!(lines[1], "", "the comment (and the ids in it) blanked");
        assert_eq!(lines[2], "");
        assert_eq!(lines[4], "", "a style's rules are not words");
        assert_eq!(lines[6].split_whitespace().collect::<Vec<_>>(), ["Your", "booking", "&", "manage", "it"]);
        assert!(!s.contains("href") && !s.contains("email-html") && !s.contains("color"));
    }

    #[test]
    fn plain_text_and_code_stay_as_written() {
        assert!(matches!(searchable("no markup here\n"), Cow::Borrowed(_)));
        assert_eq!(searchable("if a < b and 2<3 then\n"), "if a < b and 2<3 then\n");
        let code = "```html\n<div>kept</div>\n```\n<b>bold</b>\n";
        assert_eq!(searchable(code), "```html\n<div>kept</div>\n```\n   bold    \n");
        assert_eq!(searchable("caf&#233; &#xE9; &bogus; &\n"), "café é &bogus; &\n");
        assert_eq!(searchable("R&éééééééé;\n"), "R&éééééééé;\n", "an & before accented letters");
    }

    #[test]
    fn a_tag_across_lines_is_blanked_on_each() {
        let s = searchable("<a\n href=\"x\">link</a> after\nnext\n");
        assert_eq!(s.lines().map(str::trim).collect::<Vec<_>>(), ["", "link     after", "next"]);
    }
}
