//! Words as a POSIX shell reads them: quoting a word for a command line, splitting a config value into words.

/// `s` as one word for `sh`: as it is when nothing in it is special, else in single quotes.
pub fn quote(s: &str) -> String {
    if !s.is_empty() && s.chars().all(|c| c.is_alphanumeric() || "_@%+=:,./-".contains(c)) {
        s.to_string()
    } else {
        format!("'{}'", s.replace('\'', "'\"'\"'"))
    }
}

/// Words as one command line.
pub fn join(words: &[String]) -> String {
    words.iter().map(|w| quote(w)).collect::<Vec<_>>().join(" ")
}

/// A line split into words: blanks between them, `'…'` taken as it is, `"…"` with `\"` and `\\`, `\x` outside quotes.
pub fn split(s: &str) -> Vec<String> {
    let (mut words, mut word, mut started) = (Vec::new(), String::new(), false);
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        match c {
            c if c.is_whitespace() => {
                if started {
                    words.push(std::mem::take(&mut word));
                    started = false;
                }
            }
            '\'' => {
                started = true;
                for c in chars.by_ref() {
                    if c == '\'' {
                        break;
                    }
                    word.push(c);
                }
            }
            '"' => {
                started = true;
                while let Some(c) = chars.next() {
                    match c {
                        '"' => break,
                        '\\' => match chars.next() {
                            Some(n @ ('"' | '\\')) => word.push(n),
                            Some(n) => {
                                word.push('\\');
                                word.push(n);
                            }
                            None => word.push('\\'),
                        },
                        c => word.push(c),
                    }
                }
            }
            '\\' => {
                started = true;
                if let Some(n) = chars.next() {
                    word.push(n);
                }
            }
            c => {
                started = true;
                word.push(c);
            }
        }
    }
    if started {
        words.push(word);
    }
    words
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn words_are_quoted_and_split_as_a_shell_reads_them() {
        assert_eq!(quote("iq"), "iq");
        assert_eq!(quote("user@host:22"), "user@host:22");
        assert_eq!(quote("it's here"), "'it'\"'\"'s here'");
        assert_eq!(quote(""), "''");
        assert_eq!(split(r#"a "b c" 'd e' f\ g "h\"i""#), ["a", "b c", "d e", "f g", "h\"i"]);
        assert_eq!(split("  "), Vec::<String>::new());
    }
}
