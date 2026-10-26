//! How Settings names the config's fields, for every client: each setting's label (`title`), its choices' labels
//! (`x-labels`) and the clients it does something on (`x-hosts`), written into the schema the core serves
//! (`Config::schema`). The web's Settings and the phone's draw the same words and leave out the same fields from it;
//! neither keeps a table of its own.
use serde_json::{json, Map, Value};

/// Acronyms and names that keep their casing in a label ("vscode_theme" → "VS Code theme").
const WORDS: &[(&str, &str)] = &[
    ("eink", "e-ink"), ("oidc", "OpenID"), ("vscode", "VS Code"), ("ui", "UI"), ("lsp", "LSP"), ("pdf", "PDF"), ("svg", "SVG"),
    ("gpu", "GPU"), ("css", "CSS"), ("url", "URL"), ("bib", "BibTeX"), ("rnote", "Rnote"), ("latex", "LaTeX"), ("id", "ID"),
    ("api", "API"), ("ssh", "SSH"), ("html", "HTML"), ("js", "JS"), ("ocr", "OCR"), ("mcp", "MCP"), ("dpi", "DPI"), ("ai", "AI"),
];

/// Keys whose label reads better than the key, wherever they are.
const LABELS: &[(&str, &str)] = &[
    ("ui_font", "Interface font"), ("font_size", "Text size"), ("min_size", "Minimum size"), ("off", "Switched off"),
    ("index_exclude", "Agent files (kept apart from your notes)"), ("side_panel", "Side panel: where it sits"),
    ("restore_layout", "Reopen the last tabs at start"), ("tab_preview", "Preview a tab on hover"), ("link_preview", "Preview a link on hover"),
    ("tab_switcher", "Ctrl+Tab"), ("libraries", "Libraries shown"), ("properties", "Properties"), ("properties_spec", "Property spec (file)"),
    ("dir", "Folder"), ("templates", "Templates folder"), ("template_rules", "Templates by name or folder"),
    ("default_template", "Default template (a plain note starts from it)"), ("strict_line_breaks", "Strict line breaks"),
];

/// One field's label, where its key alone is vague or would collide ("dir" is the notes' and the drawings' folder).
const FIELD_LABELS: &[(&str, &str)] = &[
    ("log_dir", "Daily log folder"), ("log_folders", "Daily logs filed in (YYYY/MM-MMMM)"), ("log_template", "Daily log template"),
    ("notes.dir", "Notes folder"), ("draw.dir", "Drawings folder"), ("notes.capture", "Capture writes"), ("notes.inbox", "Inbox folder (fleeting notes)"),
    ("notes.capture_template", "Fleeting note template"), ("notes.capture_thumbnail", "Captured pictures in the log, width (px)"),
    ("editor.live", "Live editing between devices"), ("editor.code_bar", "Tool bar above code files"), ("editor.task_chips", "Task dates as chips"),
    ("activity.show_claude", "AI agents' commits"), ("activity.show_housekeeping", "Housekeeping commits"), ("activity.group_threshold", "Group a folder's changes from"),
    ("plugins.oidc_issuer", "Sign-in provider (OpenID Connect)"), ("plugins.oidc_client_id", "Sign-in client id"), ("plugins.oidc_redirect", "Sign-in return address"),
    ("ui.eink", "E-ink screen"), ("ui.eink_refresh", "E-ink full refresh"), ("terminal.min_size", "Terminal's smallest size (px)"),
    ("lsp.c", "C / C++ server"), ("lsp.rust", "Rust server"), ("lsp.python", "Python server"), ("lsp.latex", "LaTeX server"),
    ("lsp.language", "Servers' message language"), ("lsp.inlay_hints", "Inlay hints"), ("lsp.python_env", "Python environment"),
    ("latex.snippets", "Snippets while typing math"), ("latex.snippets_file", "Snippets file"), ("latex.variables_file", "Snippet variables file"),
    ("draw.page_format", "A new drawing's pages"), ("web.open_links", "Web links open in"), ("pdf.export_on_save", "Export annotations on save"),
];

/// Where Settings runs (the web's `hostOf`): this machine's app, a server's vault through it, the phone apps, a
/// server's page in a browser.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Host {
    App,
    Bridged,
    Phone,
    Browser,
}

/// Settings that do something only on some clients (a dotted path, or a section and everything in it): terminals and
/// language servers run where a desktop page does, the GPU and the web window's ad blocker are the desktop app's.
const ONLY: &[(&str, &[Host])] = &[
    ("terminal", &[Host::App, Host::Bridged, Host::Browser]),
    ("lsp", &[Host::App, Host::Bridged, Host::Browser]),
    ("ui.gpu_rendering", &[Host::App, Host::Bridged]),
    ("web.block_ads", &[Host::App, Host::Bridged]),
];

fn find<'a>(table: &'a [(&str, &str)], key: &str) -> Option<&'a str> {
    table.iter().find(|(k, _)| *k == key).map(|(_, v)| *v)
}

/// A key or a choice in words: `vscode_theme` → "VS Code theme", `side_panel` → its own label.
pub fn human(key: &str) -> String {
    if let Some(l) = find(LABELS, key) {
        return l.to_string();
    }
    key.split('_')
        .enumerate()
        .map(|(i, w)| match find(WORDS, w) {
            Some(x) => x.to_string(),
            None if i == 0 => w.chars().take(1).flat_map(char::to_uppercase).chain(w.chars().skip(1)).collect(),
            None => w.to_string(),
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// A field's label from its dotted path.
pub fn label(path: &str) -> String {
    find(FIELD_LABELS, path).map(String::from).unwrap_or_else(|| human(path.rsplit('.').next().unwrap_or(path)))
}

fn hosts(path: &str) -> Option<&'static [Host]> {
    ONLY.iter().find(|(p, _)| path == *p || path.starts_with(&format!("{p}."))).map(|(_, h)| *h)
}

/// The schema with every setting's `title`, its choices' `x-labels` and, where it applies, its `x-hosts`: the
/// top-level settings first, then each section's, which live in `$defs` behind the section's `$ref`.
pub fn annotate(schema: &mut Value) {
    let defs = schema.get("$defs").cloned().unwrap_or(Value::Null);
    let sections: Vec<(String, String)> = schema
        .get("properties")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter_map(|(k, v)| Some((k.clone(), def_of(v, &defs)?.0)))
        .collect();
    if let Some(props) = schema.get_mut("properties").and_then(Value::as_object_mut) {
        walk(props, "", &defs);
    }
    for (section, def) in sections {
        if let Some(props) = schema.pointer_mut(&format!("/$defs/{def}/properties")).and_then(Value::as_object_mut) {
            walk(props, &format!("{section}."), &defs);
        }
    }
}

/// The `$defs` entry a property's type is, by its `$ref` (schemars wraps a described one in a one-item `allOf`).
fn target<'a>(v: &Value, defs: &'a Value) -> Option<(String, &'a Value)> {
    let r = v.get("$ref").or_else(|| v.get("allOf").and_then(Value::as_array).filter(|a| a.len() == 1).and_then(|a| a[0].get("$ref")));
    let name = r.and_then(Value::as_str)?.rsplit('/').next()?.to_string();
    Some((name.clone(), defs.get(&name)?))
}

/// The `$defs` entry a property points at when it is a section (an object with properties): its name and schema.
fn def_of<'a>(v: &Value, defs: &'a Value) -> Option<(String, &'a Value)> {
    target(v, defs).filter(|(_, d)| d.get("properties").is_some())
}

/// Each setting of `props` (at `prefix`): its label, its choices' labels, its hosts. Sections are skipped here.
fn walk(props: &mut Map<String, Value>, prefix: &str, defs: &Value) {
    for (k, v) in props.iter_mut() {
        if def_of(v, defs).is_some() {
            // a section: its name here, its settings in its own pass
            if let Some(o) = v.as_object_mut() {
                o.insert("title".into(), json!(human(k)));
            }
            continue;
        }
        let path = format!("{prefix}{k}");
        let ty = target(v, defs).map(|(_, d)| d.clone());
        let Some(o) = v.as_object_mut() else { continue };
        o.insert("title".into(), json!(label(&path)));
        let choices = choices_of(o, ty.as_ref());
        if !choices.is_empty() {
            o.insert("x-labels".into(), Value::Object(choices.into_iter().map(|c| { let l = human(&c); (c, json!(l)) }).collect()));
        }
        if let Some(h) = hosts(&path) {
            o.insert("x-hosts".into(), json!(h));
        }
    }
}

/// The values a field can take: its own `enum`, or its type's (`oneOf` of `const`s, or `enum`).
fn choices_of(field: &Map<String, Value>, target: Option<&Value>) -> Vec<String> {
    let from = |s: &Value| -> Vec<String> {
        let mut out: Vec<String> = s.get("enum").and_then(Value::as_array).into_iter().flatten().filter_map(|v| v.as_str().map(String::from)).collect();
        for o in s.get("oneOf").and_then(Value::as_array).into_iter().flatten() {
            out.extend(o.get("const").and_then(Value::as_str).map(String::from));
            out.extend(o.get("enum").and_then(Value::as_array).into_iter().flatten().filter_map(|v| v.as_str().map(String::from)));
        }
        out
    };
    let own = from(&Value::Object(field.clone()));
    if own.is_empty() { target.map(from).unwrap_or_default() } else { own }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_setting_carries_its_words_and_where_it_matters() {
        let s = crate::config::Config::schema();
        let notes = s.pointer("/$defs/NotesConfig/properties/dir").expect("notes.dir");
        assert_eq!(notes["title"], "Notes folder");
        let theme = s.pointer("/$defs/UiConfig/properties/theme").expect("ui.theme");
        assert_eq!(theme["title"], "Theme");
        assert!(theme["x-labels"].get("light").is_some(), "{theme}");
        assert_eq!(s.pointer("/$defs/UiConfig/properties/gpu_rendering/x-hosts"), Some(&json!(["app", "bridged"])));
        let font = s.pointer("/$defs/TerminalConfig/properties/font_size").expect("terminal.font_size");
        assert_eq!(font["x-hosts"], json!(["app", "bridged", "browser"]), "a whole section's");
        assert_eq!(human("vscode_theme"), "VS Code theme");
        assert_eq!(label("draw.dir"), "Drawings folder");
    }
}
