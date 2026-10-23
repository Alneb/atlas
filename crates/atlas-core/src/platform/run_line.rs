//! A `run =` line (a plugin's helper or data script, a vault command) turned into a process, without a shell when it
//! can be: a program and its arguments, quoted with `"…"` or `'…'`, `\` escapes, `$VAR`, `${VAR}`, `${VAR:-default}`
//! and a leading `~/` — the shape every plugin line has. Windows has no `sh`, so this is how Atlas starts them there;
//! one parser serves every OS. A line using more of the shell (pipes, `&&`, `if`, redirects, `$(…)`) is
//! [`Launch::Shell`]: `sh -c` on Unix, and on Windows the `sh` of Git for Windows when it is on the PATH.
//!
//! Unlike `sh`, an expanded variable is never split into words (a path with spaces stays one argument).
use std::ffi::OsString;
use std::path::{Path, PathBuf};

/// How a line is started.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Launch {
    /// A program and its arguments, variables already expanded.
    Direct { program: String, args: Vec<String> },
    /// The line needs a POSIX shell; `why` names the first construct that does.
    Shell { line: String, why: &'static str },
}

/// Reads `line`, expanding variables with `var` (unset → empty, as in `sh`).
pub fn parse(line: &str, var: &dyn Fn(&str) -> Option<String>) -> Launch {
    let shell = |why| Launch::Shell { line: line.to_string(), why };
    let mut words: Vec<String> = Vec::new();
    let mut cur = String::new();
    // whether `cur` is a word even if empty (it had quotes): `""` is an argument, an empty `$X` is not
    let mut started = false;
    let mut chars = line.chars().peekable();
    let mut quote: Option<char> = None;
    while let Some(c) = chars.next() {
        match (quote, c) {
            (None, ' ' | '\t') => {
                if started || !cur.is_empty() {
                    words.push(std::mem::take(&mut cur));
                }
                started = false;
            }
            (None, '\'' | '"') => {
                quote = Some(c);
                started = true;
            }
            (Some(q), c) if c == q => quote = None,
            (Some('\''), c) => cur.push(c),
            (None, '\\') => match chars.next() {
                Some(n) => cur.push(n),
                None => return shell("a trailing backslash"),
            },
            (Some('"'), '\\') => match chars.peek() {
                Some(&n @ ('"' | '\\' | '$' | '`')) => {
                    cur.push(n);
                    chars.next();
                }
                _ => cur.push('\\'),
            },
            (_, '$') => match variable(&mut chars, var) {
                Some(v) => cur.push_str(&v),
                None => return shell("`$(…)` or a special variable"),
            },
            (_, '`') => return shell("a backtick command"),
            (None, '~') if cur.is_empty() && !started && matches!(chars.peek(), Some('/')) => {
                cur.push_str(&super::dirs::home().unwrap_or_default().to_string_lossy());
            }
            (None, '|' | '&' | ';' | '<' | '>' | '(' | ')' | '*' | '?' | '[' | '#' | '\n' | '{' | '}' | '!') => {
                return shell("shell syntax (a pipe, `&&`, `;`, a redirect, a glob or a block)")
            }
            (None, '=') if words.is_empty() && !started && is_name(&cur) => return shell("a `NAME=value` prefix"),
            (_, c) => cur.push(c),
        }
    }
    if quote.is_some() {
        return shell("an unclosed quote");
    }
    if started || !cur.is_empty() {
        words.push(cur);
    }
    let mut words = words.into_iter();
    match words.next() {
        Some(program) => Launch::Direct { program, args: words.collect() },
        None => shell("an empty line"),
    }
}

/// A bare name that is no program on the PATH (`exit`, `cd`, `export`: the shell's own words) is the shell's to run, as
/// `sh -c` always did; a program that is truly missing is then reported by the shell, as before. Windows finds
/// `python3` as `python` (program_path), so such a name is a program there.
fn not_a_program(program: &str) -> bool {
    let bare = program.trim_end_matches(|c: char| c.is_ascii_digit() || c == '.');
    let windows_finds = cfg!(windows) && bare != program && !bare.is_empty() && find_on_path(bare).is_some();
    Path::new(program).components().count() == 1 && find_on_path(program).is_none() && !windows_finds
}

/// After a `$`: `NAME`, `{NAME}` or `{NAME:-default}` (the default taken literally). None: anything else.
fn variable(chars: &mut std::iter::Peekable<std::str::Chars>, var: &dyn Fn(&str) -> Option<String>) -> Option<String> {
    let mut name = String::new();
    if chars.peek() == Some(&'{') {
        chars.next();
        let mut default = None;
        loop {
            match chars.next()? {
                '}' => break,
                ':' if default.is_none() && chars.peek() == Some(&'-') => {
                    chars.next();
                    let mut d = String::new();
                    loop {
                        match chars.next()? {
                            '}' => break,
                            '$' => d.push_str(&variable(chars, var)?),
                            c => d.push(c),
                        }
                    }
                    default = Some(d);
                    break;
                }
                c if c.is_ascii_alphanumeric() || c == '_' => name.push(c),
                _ => return None,
            }
        }
        if !is_name(&name) {
            return None;
        }
        let v = var(&name).filter(|v| !v.is_empty());
        return Some(v.or(default).unwrap_or_default());
    }
    while let Some(&c) = chars.peek() {
        if !(c.is_ascii_alphanumeric() || c == '_') {
            break;
        }
        name.push(c);
        chars.next();
    }
    is_name(&name).then(|| var(&name).unwrap_or_default())
}

fn is_name(s: &str) -> bool {
    s.chars().next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_') && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// A process for `line`, run in `cwd`, with `env` set and visible to the line's own `$VAR`s (before the process
/// environment). Err: the line needs a shell this machine does not have, in words.
pub fn command(line: &str, cwd: &Path, env: &[(String, OsString)]) -> Result<tokio::process::Command, String> {
    let lookup = |name: &str| {
        env.iter().find(|(k, _)| k == name).map(|(_, v)| v.to_string_lossy().into_owned()).or_else(|| std::env::var(name).ok())
    };
    let launch = match parse(line, &lookup) {
        Launch::Direct { program, .. } if not_a_program(&program) => {
            Launch::Shell { line: line.to_string(), why: "a name that is no program on the PATH (a shell builtin?)" }
        }
        other => other,
    };
    let mut cmd = match launch {
        Launch::Direct { program, args } => {
            let mut c = tokio::process::Command::new(program_path(&program, cwd));
            c.args(args);
            c
        }
        Launch::Shell { line, why } => {
            let sh = if cfg!(windows) { find_on_path("sh") } else { Some(PathBuf::from("sh")) };
            let Some(sh) = sh else {
                return Err(format!("this command uses {why}, which needs a POSIX shell: install Git for Windows (its sh) or write the line as a program and its arguments"));
            };
            let mut c = tokio::process::Command::new(sh);
            c.arg("-c").arg(line);
            c
        }
    };
    cmd.current_dir(cwd).envs(env.iter().map(|(k, v)| (k, v)));
    Ok(cmd)
}

/// The program to start. On Unix the name as written (the OS searches PATH). On Windows, a name is looked up
/// on PATH with its executable extensions, and a versioned name that is not there falls back to the bare one
/// (`python3` → `python`): Windows installs rarely carry the version in the name.
fn program_path(program: &str, cwd: &Path) -> PathBuf {
    if !cfg!(windows) {
        return PathBuf::from(program);
    }
    let named = Path::new(program);
    if named.components().count() > 1 {
        let p = cwd.join(named);
        return executable(&p).unwrap_or(p);
    }
    let bare = program.trim_end_matches(|c: char| c.is_ascii_digit() || c == '.');
    find_on_path(program).or_else(|| (bare != program && !bare.is_empty()).then(|| find_on_path(bare)).flatten()).unwrap_or_else(|| PathBuf::from(program))
}

/// The program file `p` names: `p` itself when it is a file, else (Windows) `p` with the first of `%PATHEXT%`'s
/// extensions that exists, as the shell would find it.
pub fn executable(p: &Path) -> Option<PathBuf> {
    if p.is_file() {
        return Some(p.to_path_buf());
    }
    if !cfg!(windows) {
        return None;
    }
    let exts = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
    exts.split(';').filter(|e| !e.is_empty()).map(|e| PathBuf::from(format!("{}{}", p.display(), e.to_ascii_lowercase()))).find(|c| c.is_file())
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    std::env::split_paths(&std::env::var_os("PATH")?).find_map(|d| executable(&d.join(name)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars(name: &str) -> Option<String> {
        match name {
            "ATLAS_PLUGIN_DIR" => Some("/v/.atlas/plugins/my plugin".into()),
            "ATLAS_PLUGIN_TARGET" => Some("x86_64-linux".into()),
            "EMPTY" => Some(String::new()),
            _ => None,
        }
    }

    fn direct(line: &str) -> (String, Vec<String>) {
        match parse(line, &vars) {
            Launch::Direct { program, args } => (program, args),
            other => panic!("{line:?} → {other:?}"),
        }
    }

    #[test]
    fn plugin_lines_are_direct() {
        assert_eq!(direct(r#"python3 -u "$ATLAS_PLUGIN_DIR/helper.py""#), ("python3".into(), vec!["-u".into(), "/v/.atlas/plugins/my plugin/helper.py".into()]));
        assert_eq!(direct(r#""$ATLAS_PLUGIN_DIR/bin/$ATLAS_PLUGIN_TARGET/ocr""#).0, "/v/.atlas/plugins/my plugin/bin/x86_64-linux/ocr");
        assert_eq!(direct(r#""${ATLAS_PLUGIN_BIN:-$ATLAS_PLUGIN_DIR/bin/$ATLAS_PLUGIN_TARGET}/catalog""#).0, "/v/.atlas/plugins/my plugin/bin/x86_64-linux/catalog");
        assert_eq!(direct("python3 .atlas/plugins/runs/poll.py --root runs").1, [".atlas/plugins/runs/poll.py", "--root", "runs"]);
    }

    #[test]
    fn quoting_and_empties() {
        assert_eq!(direct(r#"echo 'a "b" $X' "c \"d\" \$e" f\ g"#).1, [r#"a "b" $X"#, r#"c "d" $e"#, "f g"]);
        assert_eq!(direct(r#"echo "" $EMPTY $UNSET x"#).1, ["", "x"]);
        assert_eq!(direct("echo ${EMPTY:-fallback}").1, ["fallback"]);
        // a variable is one word, spaces and all
        assert_eq!(direct("ls $ATLAS_PLUGIN_DIR").1, ["/v/.atlas/plugins/my plugin"]);
    }

    #[test]
    fn tilde_at_a_word_start_only() {
        let Some(h) = super::super::dirs::home() else { return };
        assert_eq!(direct("uv run ~/x.py a~/b '~/c'").1, ["run".into(), format!("{}/x.py", h.display()), "a~/b".into(), "~/c".into()]);
    }

    #[test]
    fn shell_lines_say_why() {
        for line in [
            "a && b",
            "a | b",
            "mkdir -p x; ls",
            "a > log 2>&1",
            "if true; then x; fi",
            "echo $(date)",
            "echo `date`",
            "FOO=1 cmd",
            "ls *.md",
            "echo 'unclosed",
            "echo $?",
            "",
        ] {
            assert!(matches!(parse(line, &vars), Launch::Shell { .. }), "{line:?} should need a shell");
        }
        // `=` past the program is an argument, not an assignment
        assert_eq!(direct("cmd --opt=1").1, ["--opt=1"]);
    }

    /// Every `run =` and `data =` line the repo's plugins carry starts without a shell, so they work on Windows.
    #[test]
    fn every_bundled_plugin_line_is_direct() {
        let plugins = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../plugins");
        let mut seen = 0;
        for e in walkdir::WalkDir::new(&plugins).into_iter().flatten().filter(|e| e.file_name() == "plugin.toml") {
            let text = std::fs::read_to_string(e.path()).unwrap();
            let doc: toml::Value = toml::from_str(&text).unwrap();
            let helper = doc.get("helper").and_then(|h| h.get("run"));
            for line in [helper, doc.get("data")].into_iter().flatten().filter_map(|v| v.as_str()) {
                seen += 1;
                assert!(matches!(parse(line, &vars), Launch::Direct { .. }), "{}: {line:?} needs a shell", e.path().display());
            }
        }
        assert!(seen >= 20, "found only {seen} plugin run lines under {}", plugins.display());
    }
}
