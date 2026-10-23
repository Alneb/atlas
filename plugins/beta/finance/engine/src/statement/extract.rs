//! A file's fields, as its preset places them, still as the bank's text: one reader per file format. What the fields
//! mean (dates, signs, amounts) is `map`'s, the same for every format.
use super::preset::{Encoding, Layout, Record, Role, Preset, TextLayout};
use regex::Regex;
use std::collections::BTreeMap;

pub type Fields = BTreeMap<String, String>;

#[derive(Debug, Default, Clone)]
pub struct Extracted {
    pub statement: Fields,
    pub rows: Vec<Fields>,
}

/// One statement's fields per account the file holds (a Norma 43 file may hold several; `split_by` splits an app's
/// export by its account column).
pub fn extract(preset: &Preset, bytes: &[u8], pdf_text: &dyn Fn(&[u8]) -> Result<String, String>) -> Result<Vec<Extracted>, String> {
    let all = by_format(preset, bytes, pdf_text)?;
    let Some(field) = &preset.split_by else { return Ok(all) };
    let mut out: Vec<Extracted> = vec![];
    for e in all {
        let mut by: BTreeMap<String, Vec<Fields>> = BTreeMap::new();
        for r in e.rows {
            by.entry(r.get(field).cloned().unwrap_or_default()).or_default().push(r);
        }
        for (name, rows) in by {
            let mut statement = e.statement.clone();
            statement.insert("account".into(), name);
            out.push(Extracted { statement, rows });
        }
    }
    Ok(out)
}

fn by_format(preset: &Preset, bytes: &[u8], pdf_text: &dyn Fn(&[u8]) -> Result<String, String>) -> Result<Vec<Extracted>, String> {
    match &preset.layout {
        Layout::Csv { delimiter, encoding, columns } => csv(&decode(bytes, *encoding), *delimiter, columns).map(|e| vec![e]),
        Layout::Sheet { labels, columns } => sheet(&cells(bytes)?, labels, columns).map(|e| vec![e]),
        Layout::Fixed { encoding, records } => Ok(fixed(&decode(bytes, *encoding), records, &preset.empty_text)),
        Layout::Pdf(t) => text(&pdf_text(pdf_part(bytes).ok_or("not a PDF")?)?, t),
        Layout::Text(t) => text(&decode(bytes, t.encoding), t),
    }
}

/// The text a preset's `detect` is tested on: the start of the file as text, a sheet's first rows, a PDF's text.
pub fn first_text(preset: &Preset, bytes: &[u8], pdf_text: &dyn Fn(&[u8]) -> Result<String, String>) -> Option<String> {
    let is_sheet = bytes.starts_with(&[0xD0, 0xCF, 0x11, 0xE0]) || bytes.starts_with(b"PK\x03\x04");
    let is_pdf = pdf_part(bytes).is_some();
    match &preset.layout {
        Layout::Sheet { .. } if is_sheet => cells(bytes).ok().map(|rows| rows.iter().take(40).map(|r| r.join("\t")).collect::<Vec<_>>().join("\n")),
        Layout::Pdf(_) if is_pdf => pdf_text(pdf_part(bytes)?).ok(),
        Layout::Csv { encoding, .. } | Layout::Fixed { encoding, .. } | Layout::Text(TextLayout { encoding, .. }) if !is_sheet && !is_pdf => {
            Some(decode(&bytes[..bytes.len().min(8192)], *encoding))
        }
        _ => None,
    }
}

/// The PDF in a file: from its `%PDF-` on, which a download may wrap (Desjardins serves it inside a Java object).
pub fn pdf_part(bytes: &[u8]) -> Option<&[u8]> {
    let head = &bytes[..bytes.len().min(4096)];
    head.windows(5).position(|w| w == b"%PDF-").map(|i| &bytes[i..])
}

fn decode(bytes: &[u8], enc: Encoding) -> String {
    match enc {
        Encoding::Utf8 => String::from_utf8_lossy(bytes).trim_start_matches('\u{feff}').to_string(),
        Encoding::Latin1 => bytes.iter().map(|&b| b as char).collect(),
    }
}

/// Header text compared loosely: case, accents and spacing ignored (`Fecha operación` = `FECHA OPERACION`).
pub fn loose(s: &str) -> String {
    let folded: String = s.chars().map(|c| match c {
        'á' | 'à' | 'â' | 'ä' | 'Á' | 'À' | 'Â' | 'Ä' => 'a',
        'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => 'e',
        'í' | 'ì' | 'î' | 'ï' | 'Í' | 'Ì' | 'Î' | 'Ï' => 'i',
        'ó' | 'ò' | 'ô' | 'ö' | 'Ó' | 'Ò' | 'Ô' | 'Ö' => 'o',
        'ú' | 'ù' | 'û' | 'ü' | 'Ú' | 'Ù' | 'Û' | 'Ü' => 'u',
        'ñ' | 'Ñ' => 'n',
        'ç' | 'Ç' => 'c',
        c => c.to_ascii_lowercase(),
    }).collect();
    folded.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Which column holds each field: the first header equal to the preset's text, loosely.
fn find_columns(header: &[String], columns: &BTreeMap<String, String>) -> Result<Vec<(String, usize)>, String> {
    columns.iter().map(|(field, name)| {
        header.iter().position(|h| loose(h) == loose(name)).map(|i| (field.clone(), i))
            .ok_or_else(|| format!("no column `{name}` (for {field}); the header has: {}", header.join(", ")))
    }).collect()
}

fn table(rows: &[Vec<String>], columns: &BTreeMap<String, String>) -> Result<Vec<Fields>, String> {
    let at = rows.iter().position(|r| columns.values().all(|name| r.iter().any(|c| loose(c) == loose(name))))
        .ok_or_else(|| format!("no header row with the columns {}", columns.values().cloned().collect::<Vec<_>>().join(", ")))?;
    let cols = find_columns(&rows[at], columns)?;
    Ok(rows[at + 1..].iter().filter(|r| r.iter().any(|c| !c.trim().is_empty()))
        .map(|r| cols.iter().map(|(f, i)| (f.clone(), r.get(*i).map(|c| c.trim().to_string()).unwrap_or_default())).collect())
        .collect())
}

fn csv(text: &str, delimiter: char, columns: &BTreeMap<String, String>) -> Result<Extracted, String> {
    let mut r = csv::ReaderBuilder::new().has_headers(false).flexible(true).delimiter(delimiter as u8).from_reader(text.as_bytes());
    let rows: Vec<Vec<String>> = r.records().map(|rec| rec.map(|x| x.iter().map(str::to_string).collect()).map_err(|e| e.to_string())).collect::<Result<_, _>>()?;
    Ok(Extracted { statement: Fields::new(), rows: table(&rows, columns)? })
}

fn cells(bytes: &[u8]) -> Result<Vec<Vec<String>>, String> {
    use calamine::Reader;
    let mut book = calamine::open_workbook_auto_from_rs(std::io::Cursor::new(bytes.to_vec())).map_err(|e| e.to_string())?;
    let range = book.worksheet_range_at(0).ok_or("the workbook has no sheet")?.map_err(|e| e.to_string())?;
    Ok(range.rows().map(|r| r.iter().map(|c| c.to_string()).collect()).collect())
}

fn sheet(rows: &[Vec<String>], labels: &BTreeMap<String, String>, columns: &BTreeMap<String, String>) -> Result<Extracted, String> {
    // A label's value is the next non-empty cell on its row.
    let statement = labels.iter().filter_map(|(field, label)| {
        rows.iter().find_map(|r| {
            let i = r.iter().position(|c| loose(c).trim_end_matches(':') == loose(label).trim_end_matches(':'))?;
            r[i + 1..].iter().find(|c| !c.trim().is_empty()).map(|v| (field.clone(), v.trim().to_string()))
        })
    }).collect();
    Ok(Extracted { statement, rows: table(rows, columns)? })
}

fn cut(line: &str, [a, b]: [usize; 2]) -> String {
    line.chars().skip(a).take(b.saturating_sub(a)).collect::<String>().trim().to_string()
}

fn fixed(text: &str, records: &BTreeMap<String, Record>, empty: &[String]) -> Vec<Extracted> {
    let mut out: Vec<Extracted> = vec![];
    // Longer codes first, so `2301` is tried before `23`.
    let mut codes: Vec<(&String, &Record)> = records.iter().collect();
    codes.sort_by_key(|(c, _)| std::cmp::Reverse(c.len()));
    for line in text.lines() {
        let Some((_, rec)) = codes.iter().find(|(c, _)| line.starts_with(c.as_str())) else { continue };
        let values = rec.fields.iter().map(|(f, s)| (f.clone(), cut(line, *s))).filter(|(_, v)| !v.is_empty() && !empty.iter().any(|e| loose(e) == loose(v)));
        match rec.role {
            Role::Statement => {
                if rec.begins || out.is_empty() {
                    out.push(Extracted::default());
                }
                out.last_mut().unwrap().statement.extend(values);
            }
            Role::Movement => {
                if out.is_empty() {
                    out.push(Extracted::default());
                }
                out.last_mut().unwrap().rows.push(values.collect());
            }
            Role::Detail => {
                if let Some(row) = out.last_mut().and_then(|e| e.rows.last_mut()) {
                    for (f, v) in values {
                        // Several detail lines: their texts join, in order.
                        row.entry(f).and_modify(|old| { old.push(' '); old.push_str(&v) }).or_insert(v);
                    }
                }
            }
        }
    }
    out
}

fn finds(text: &str, find: &BTreeMap<String, String>, into: &mut Fields) -> Result<(), String> {
    for (field, re) in find {
        let re = Regex::new(re).map_err(|e| e.to_string())?;
        if let Some(v) = re.captures(text).and_then(|c| c.get(1)) {
            into.insert(field.clone(), v.as_str().trim().to_string());
        }
    }
    Ok(())
}

/// One statement per section (or one for the whole text): the text's fields, the section's, and its rows.
fn text(text: &str, t: &TextLayout) -> Result<Vec<Extracted>, String> {
    let mut global = Fields::new();
    finds(text, &t.find, &mut global)?;
    // (section fields, its lines), sections of the same account joined.
    let mut sections: Vec<(Fields, Vec<&str>)> = vec![];
    match &t.section {
        None => sections.push((Fields::new(), text.lines().collect())),
        Some(re) => {
            let re = Regex::new(re).map_err(|e| e.to_string())?;
            let names: Vec<&str> = re.capture_names().flatten().collect();
            let mut at: Option<usize> = None;
            for line in text.lines() {
                if let Some(c) = re.captures(line) {
                    let f: Fields = names.iter().filter_map(|n| c.name(n).map(|m| (n.to_string(), m.as_str().trim().to_string()))).collect();
                    let same = sections.iter().position(|(g, _)| g.get("account").is_some() && g.get("account") == f.get("account"));
                    at = Some(same.unwrap_or_else(|| { sections.push((f, vec![])); sections.len() - 1 }));
                }
                if let Some(i) = at {
                    sections[i].1.push(line);
                }
            }
        }
    }
    let row = Regex::new(&t.row).map_err(|e| e.to_string())?;
    let names: Vec<&str> = row.capture_names().flatten().collect();
    let sectioned = t.section.is_some();
    let all: Vec<Extracted> = sections.into_iter().map(|(own, lines)| {
        let mut statement = global.clone();
        let mut found = Fields::new();
        finds(&lines.join("\n"), &t.section_find, &mut found)?;
        let found_any = !found.is_empty();
        statement.extend(found);
        statement.extend(own);
        let (mut rows, mut before): (Vec<Fields>, Vec<&str>) = (vec![], vec![]);
        for line in lines {
            let Some(c) = row.captures(line) else {
                if !line.trim().is_empty() {
                    before.push(line.trim());
                }
                continue;
            };
            let mut f: Fields = names.iter().filter_map(|n| c.name(n).map(|m| (n.to_string(), m.as_str().trim().to_string()))).collect();
            for k in &t.fill_from_previous {
                // A wrapped value sits on the line just before its row.
                if f.get(k).is_none_or(String::is_empty) {
                    if let Some(prev) = before.last() {
                        f.insert(k.clone(), prev.to_string());
                    }
                }
            }
            before.clear();
            rows.push(f);
        }
        // A line that only looked like a section's start (a name in capitals) holds no rows and no balance.
        if sectioned && rows.is_empty() && !found_any {
            return Ok(None);
        }
        Ok(Some(Extracted { statement, rows }))
    }).collect::<Result<Vec<Option<Extracted>>, String>>()?.into_iter().flatten().collect();
    Ok(all)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn headers_match_loosely() {
        assert_eq!(loose("Fecha  operación"), loose("FECHA OPERACION"));
        assert_eq!(loose("Nъmero"), "nъmero"); // a mis-decoded letter is kept, not guessed
    }

    #[test]
    fn fixed_records_join_their_details() {
        let records: BTreeMap<String, Record> = serde_yaml::from_str("'11': {role: statement, begins: true, fields: {number: [2, 6]}}\n'22': {role: movement, fields: {amount: [2, 6]}}\n'23': {role: detail, fields: {text: [2, 8]}}\n'33': {role: statement, fields: {closing: [2, 6]}}").unwrap();
        let e = fixed("11ABCD\n220012\n23one\n23NOPE\n23two\n33XYZW\n", &records, &["NOPE".into()]);
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].rows[0]["text"], "one two");
        assert_eq!(e[0].statement["closing"], "XYZW");
    }
}
