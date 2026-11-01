//! Fenced code in Markdown, read the way CommonMark (and the editor) reads it: one reader for every walk over a note's
//! lines that must leave code out (links, tags, tasks, captures).

/// The state of a walk over a note's lines: whether it is inside a fence, and which one.
#[derive(Debug, Default, Clone, Copy)]
pub struct Fences {
    open: Option<(u8, usize)>,
}

impl Fences {
    /// Whether `line` (the next one) is code: a fence line, or a line inside a fence. A fence opens with three or more
    /// backticks or tildes (up to three spaces in) and closes with a run of the same mark at least as long, with nothing
    /// after it — a ```` ``` ```` inside a ```` ```` ```` block, a `~~~` inside a ```` ``` ```` one, or ```` ```js ```` do not close it.
    pub fn code(&mut self, line: &str) -> bool {
        let t = line.trim_start_matches(' ');
        let indented = line.len() - t.len() > 3;
        let t = t.trim_end_matches(['\n', '\r']);
        let run = |c: u8| t.bytes().take_while(|&b| b == c).count();
        match self.open {
            Some((c, n)) => {
                let r = run(c);
                if !indented && r >= n && t[r..].trim().is_empty() {
                    self.open = None;
                }
                true
            }
            None => {
                let opens = (*b"`~").into_iter().map(|c| (c, run(c))).find(|&(c, r)| r >= 3 && (c == b'~' || !t[r..].contains('`')));
                match opens {
                    Some(f) if !indented => {
                        self.open = Some(f);
                        true
                    }
                    _ => false,
                }
            }
        }
    }
}

/// The inline code spans of one line, backticks included, as CommonMark reads them: a run of N backticks is closed by
/// the next run of exactly N; a run never closed (or a backtick escaped with `\`) is literal text, not code to the end.
pub fn code_spans(line: &str) -> Vec<std::ops::Range<usize>> {
    let b = line.as_bytes();
    let run_at = |i: usize| b[i..].iter().take_while(|&&c| c == b'`').count();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'\\' {
            i += 2; // an escaped character, a backtick too, is text
            continue;
        }
        if b[i] != b'`' {
            i += 1;
            continue;
        }
        let n = run_at(i);
        let mut j = i + n;
        let close = loop {
            match b[j.min(b.len())..].iter().position(|&c| c == b'`') {
                None => break None,
                Some(k) => {
                    let m = run_at(j + k);
                    if m == n {
                        break Some(j + k + m);
                    }
                    j += k + m;
                }
            }
        };
        match close {
            Some(end) => {
                out.push(i..end);
                i = end;
            }
            None => i += n,
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn code(text: &str) -> Vec<bool> {
        let mut f = Fences::default();
        text.lines().map(|l| f.code(l)).collect()
    }

    #[test]
    fn fences_close_as_commonmark_says() {
        assert_eq!(code("a\n```js\nx\n```\nb"), [false, true, true, true, false]);
        assert_eq!(code("````\n```\nx\n````\nb"), [true, true, true, true, false], "a shorter run is text inside");
        assert_eq!(code("```\n~~~\nx\n```\nb"), [true, true, true, true, false], "the other mark is text inside");
        assert_eq!(code("```\n```js\nx\n```\nb"), [true, true, true, true, false], "a closing fence has nothing after it");
        assert_eq!(code("~~~\nx\n~~~~\nb"), [true, true, true, false], "a longer run closes");
        assert_eq!(code("``` a`b\nx"), [false, false], "a backtick in the info string: inline code, not a fence");
        assert_eq!(code("    ```\nx"), [false, false], "four spaces in: an indented code line, not a fence");
        assert_eq!(code("  ```\nx\r\n  ```\r\nb"), [true, true, true, false]);
    }

    #[test]
    fn code_spans_close_on_a_run_of_the_same_length() {
        fn spans(l: &str) -> Vec<&str> {
            code_spans(l).into_iter().map(|r| &l[r]).collect()
        }
        assert_eq!(spans("a `x` b ``y`z`` c"), ["`x`", "``y`z``"]);
        assert_eq!(spans("it` was [[X]]"), Vec::<&str>::new(), "a run never closed is text");
        assert_eq!(spans("``a` b"), Vec::<&str>::new(), "a shorter run does not close a longer one");
        assert_eq!(spans(r"\`no` `yes`"), ["` `"], "an escaped backtick opens nothing");
        assert_eq!(spans("é `ü` ö"), ["`ü`"]);
    }
}
