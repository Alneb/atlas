//! Pages (`.page`, docs/guides/MALLEABLE.md): a layout file that is not markdown — rows of blocks and
//! columns of blocks, each block a Today part, a view, an embedded note, a base or free text. The
//! home screen is one (`Home.page`), so the dashboard the user liked is a file they can reshape.
//! ```yaml
//! title: Today
//! rows:
//!   - [greeting]
//!   - [capture]
//!   - columns:
//!       - [focus, log]
//!       - [tasks, activity]
//!   - [{ view: calendar, from: tasks, dated: true, title: This week }]
//! ```
use crate::api::{PageBlock, PageDoc, PageRow};
use crate::{Error, Result};
use serde::Deserialize;
use serde_yaml::Value;

#[derive(Deserialize)]
struct Raw {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    rows: Vec<Value>,
}

fn block(v: &Value) -> Result<PageBlock> {
    match v {
        // a bare name: a Today part or a registered view with its defaults
        Value::String(s) => Ok(PageBlock::View { view: s.clone(), title: None, src: format!("type: {s}\n") }),
        Value::Mapping(m) => {
            let get = |k: &str| m.get(k).and_then(Value::as_str).map(str::to_string);
            let title = get("title");
            if let Some(note) = get("note") {
                return Ok(PageBlock::Note { path: note, title });
            }
            if let Some(base) = get("base") {
                return Ok(PageBlock::Base { path: base, view: get("table"), title });
            }
            if let Some(text) = get("text") {
                return Ok(PageBlock::Text { text, title });
            }
            let Some(view) = get("view") else {
                return Err(Error::BadRequest("a page block needs view, note, base or text".into()));
            };
            // the rest of the mapping is the view's YAML (from, filters, dated…), as in a ```view block
            let mut spec = m.clone();
            spec.remove("view");
            spec.remove("title");
            spec.insert("type".into(), view.as_str().into());
            Ok(PageBlock::View { view, title, src: serde_yaml::to_string(&spec).unwrap_or_default() })
        }
        _ => Err(Error::BadRequest(format!("a page block is a name or a mapping, not {v:?}"))),
    }
}

fn blocks(v: &Value) -> Result<Vec<PageBlock>> {
    match v {
        Value::Sequence(s) => s.iter().map(block).collect(),
        other => Ok(vec![block(other)?]),
    }
}

/// Parses a `.page` file. Errors name the problem, so the page can show it instead of going blank.
pub fn parse(src: &str) -> Result<PageDoc> {
    let raw: Raw = serde_yaml::from_str(src).map_err(|e| Error::BadRequest(format!("page: {e}")))?;
    let rows = raw
        .rows
        .iter()
        .map(|r| match r.get("columns") {
            Some(Value::Sequence(cols)) => Ok(PageRow { columns: cols.iter().map(blocks).collect::<Result<_>>()? }),
            _ => Ok(PageRow { columns: vec![blocks(r)?] }),
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(PageDoc { title: raw.title, rows })
}

/// The home page Atlas writes once: the Today dashboard, as a file.
pub const HOME_TEMPLATE: &str = r#"# Your home screen, as a file: reorder, remove or add blocks and save — it updates at once.
# A block is a name (greeting, capture, focus, log, tasks, activity, suggestions, calendar, list,
# table), or { view: calendar, from: tasks, dated: true, title: … }, { view: settings, page: appearance },
# { note: path.md }, { base: x.base }, { text: "markdown" }. A row is a list of blocks, or `columns:`
# (a list of block lists).
title: Today
rows:
  - [greeting]
  - [capture]
  - columns:
      - [focus, log]
      - [tasks, activity, { view: suggestions, title: Drafted for you }]
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_home_template_is_the_today_dashboard() {
        let p = parse(HOME_TEMPLATE).unwrap();
        assert_eq!(p.title.as_deref(), Some("Today"));
        assert_eq!(p.rows.len(), 3);
        assert_eq!(p.rows[2].columns.len(), 2);
        assert!(matches!(&p.rows[2].columns[1][0], PageBlock::View { view, .. } if view == "tasks"));
    }

    #[test]
    fn blocks_of_every_kind_and_errors_that_say_why() {
        let p = parse("rows:\n  - [{ view: calendar, from: tasks, dated: true, title: Week }, { note: FOCUS.md }, { text: hi }, { base: a.base }]\n").unwrap();
        let b = &p.rows[0].columns[0];
        assert!(matches!(&b[0], PageBlock::View { view, title, src } if view == "calendar" && title.as_deref() == Some("Week") && src.contains("from: tasks") && src.contains("type: calendar") && !src.contains("title")));
        assert!(matches!(&b[1], PageBlock::Note { path, .. } if path == "FOCUS.md"));
        assert!(matches!(&b[2], PageBlock::Text { text, .. } if text == "hi"));
        assert!(matches!(&b[3], PageBlock::Base { path, .. } if path == "a.base"));
        assert!(parse("rows:\n  - [{ nope: 1 }]\n").unwrap_err().to_string().contains("needs view"));
        assert!(parse("rows: [").is_err());
    }
}
