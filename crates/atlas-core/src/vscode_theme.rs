//! VS Code color themes: discovery (for the Settings dropdown) and JSONC → JSON loading. The UI
//! maps the theme's `colors` / `tokenColors` onto Atlas's CSS tokens.
use crate::api::Suggestion;
use crate::{Error, Result};
use std::path::{Path, PathBuf};

/// JSON with comments and trailing commas (the VS Code theme dialect) → plain JSON.
pub fn strip_jsonc(src: &str) -> String {
    let (mut out, mut chars) = (String::with_capacity(src.len()), src.chars().peekable());
    let mut in_str = false;
    while let Some(c) = chars.next() {
        if in_str {
            out.push(c);
            if c == '\\' {
                if let Some(n) = chars.next() {
                    out.push(n);
                }
            } else if c == '"' {
                in_str = false;
            }
            continue;
        }
        match (c, chars.peek()) {
            ('"', _) => {
                in_str = true;
                out.push(c);
            }
            ('/', Some('/')) => {
                for n in chars.by_ref() {
                    if n == '\n' {
                        out.push('\n');
                        break;
                    }
                }
            }
            ('/', Some('*')) => {
                chars.next();
                let mut prev = ' ';
                for n in chars.by_ref() {
                    if prev == '*' && n == '/' {
                        break;
                    }
                    prev = n;
                }
            }
            _ => out.push(c),
        }
    }
    // trailing commas: `,` followed only by whitespace before `}` or `]`
    let mut res = String::with_capacity(out.len());
    let b: Vec<char> = out.chars().collect();
    let mut in_str = false;
    for (i, &c) in b.iter().enumerate() {
        if c == '"' && (i == 0 || b[i - 1] != '\\') {
            in_str = !in_str;
        }
        if !in_str && c == ',' && b[i + 1..].iter().find(|x| !x.is_whitespace()).is_some_and(|x| *x == '}' || *x == ']')
        {
            continue;
        }
        res.push(c);
    }
    res
}

fn expand(p: &str) -> PathBuf {
    match (p.strip_prefix("~/"), std::env::var("HOME")) {
        (Some(rest), Ok(h)) => Path::new(&h).join(rest),
        _ => PathBuf::from(p),
    }
}

/// The configured theme as JSON (an empty path is a 404 so the UI keeps its own palette).
/// `path`: `~/…`, absolute, or relative to the vault (`root`) — so a theme copied into the vault travels with it.
pub fn load(root: &Path, path: &str) -> Result<serde_json::Value> {
    if path.trim().is_empty() {
        return Err(Error::NotFound("no VS Code theme configured".into()));
    }
    let p = expand(path.trim());
    let p = if p.is_relative() { root.join(p) } else { p };
    let p = if p.exists() { p } else { in_this_vault(root, &p).unwrap_or(p) };
    if p.extension().and_then(|e| e.to_str()) != Some("json") {
        return Err(Error::BadRequest(format!("not a .json theme: {}", p.display())));
    }
    let text = std::fs::read_to_string(&p).map_err(|e| Error::NotFound(format!("{}: {e}", p.display())))?;
    serde_json::from_str(&strip_jsonc(&text)).map_err(|e| Error::BadRequest(format!("{}: {e}", p.display())))
}

/// A theme path written on another machine (`~/Notes/.atlas/themes/x.json` read by the server or the phone,
/// where that home does not exist): the same file inside this vault — the part from `.atlas/` on, else
/// `.atlas/themes/<file name>`. Only an existing file is returned.
fn in_this_vault(root: &Path, p: &Path) -> Option<PathBuf> {
    let parts: Vec<_> = p.components().collect();
    let tail = parts.iter().position(|c| c.as_os_str() == ".atlas").map(|i| parts[i..].iter().collect::<PathBuf>());
    let by_name = p.file_name().map(|n| root.join(".atlas/themes").join(n));
    tail.map(|t| root.join(t)).into_iter().chain(by_name).find(|c| c.is_file())
}

/// Theme files: VS Code / VSCodium extension folders and any `*color-theme*.json` a few levels
/// under home (themes kept next to a project, like the TFM workspace's). Bounded walk.
pub fn discover() -> Vec<Suggestion> {
    let Ok(home) = std::env::var("HOME") else { return Vec::new() };
    let home = PathBuf::from(home);
    let mut found: Vec<PathBuf> = Vec::new();
    for ext in [".vscode/extensions", ".vscode-oss/extensions", ".cursor/extensions"] {
        for e in walkdir::WalkDir::new(home.join(ext)).max_depth(3).into_iter().flatten() {
            let p = e.path();
            if p.parent().and_then(|d| d.file_name()).is_some_and(|n| n == "themes")
                && p.extension().is_some_and(|x| x == "json")
            {
                found.push(p.to_path_buf());
            }
        }
    }
    let skip = ["node_modules", "target", "runs", "lib", "archive", "venv", ".git"];
    let mut seen = 0usize;
    for e in walkdir::WalkDir::new(&home)
        .max_depth(5)
        .into_iter()
        .filter_entry(|e| {
            let n = e.file_name().to_string_lossy();
            e.depth() == 0 || !(n.starts_with('.') || skip.contains(&n.as_ref()))
        })
        .flatten()
    {
        seen += 1;
        if seen > 300_000 {
            break; // bounded: discovery must never stall Settings
        }
        let n = e.file_name().to_string_lossy();
        if n.ends_with(".json") && n.contains("color-theme") {
            found.push(e.path().to_path_buf());
        }
    }
    found.sort();
    found.dedup();
    let mut out = vec![Suggestion { value: String::new(), label: "None (Atlas palette)".into() }];
    for p in found {
        let name = load(Path::new("/"), &p.to_string_lossy()).ok().and_then(|v| v["name"].as_str().map(String::from));
        let tilde =
            p.strip_prefix(&home).map(|r| format!("~/{}", r.display())).unwrap_or_else(|_| p.display().to_string());
        let label = match name {
            Some(n) => format!("{n} — {tilde}"),
            None => tilde.clone(),
        };
        out.push(Suggestion { value: tilde, label });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_relative_theme_path_is_the_vaults() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".atlas/themes")).unwrap();
        std::fs::write(dir.path().join(".atlas/themes/t.json"), r#"{ "name": "Mine", // a comment
        }"#).unwrap();
        let v = load(dir.path(), ".atlas/themes/t.json").unwrap();
        assert_eq!(v["name"], "Mine", "found inside the vault, wherever the program was started");
    }

    #[test]
    fn a_theme_path_from_another_machine_finds_the_vaults_copy() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".atlas/themes")).unwrap();
        std::fs::write(dir.path().join(".atlas/themes/t.json"), r#"{ "name": "Mine" }"#).unwrap();
        let v = load(dir.path(), "/elsewhere/Notes/.atlas/themes/t.json").unwrap();
        assert_eq!(v["name"], "Mine", "the desktop's path, read on the server");
        let v = load(dir.path(), "/elsewhere/t.json").unwrap();
        assert_eq!(v["name"], "Mine", "by name in .atlas/themes");
        assert!(load(dir.path(), "/elsewhere/other.json").is_err(), "nothing invented");
    }

    #[test]
    fn strips_comments_and_trailing_commas_but_not_inside_strings() {
        let src = "{\n // c\n \"a\": \"x // not a comment\", /* b */ \"u\": \"http://h/*x*/\",\n \"l\": [1, 2,],\n}";
        let v: serde_json::Value = serde_json::from_str(&strip_jsonc(src)).unwrap();
        assert_eq!(v["a"], "x // not a comment");
        assert_eq!(v["u"], "http://h/*x*/");
        assert_eq!(v["l"].as_array().unwrap().len(), 2);
    }
}
