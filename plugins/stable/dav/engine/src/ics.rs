//! iCalendar (RFC 5545) as far as the plugin needs it: an event written as a VCALENDAR (escaped, folded at 75
//! octets, CRLF), calendar data read back into components, and a mail's invite split into one calendar object per UID.
use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, Utc};
use serde::Serialize;
use sha2::{Digest, Sha256};

pub const PRODID: &str = "-//Atlas//DAV plugin//EN";

/// When an event starts or ends: a whole day, a wall-clock time (floating: shown at that hour wherever the user is),
/// or an instant.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum When {
    Day(NaiveDate),
    Local(NaiveDateTime),
    Utc(DateTime<Utc>),
}

impl When {
    /// `2026-11-03` (a day), `2026-11-03 14:00` / `2026-11-03T14:00:00` (a wall-clock time), or with `Z` / `+01:00`
    /// (an instant). Quotes around it (a YAML string) are ignored.
    pub fn parse(s: &str) -> Result<When, String> {
        let t = s.trim().trim_matches(|c| c == '"' || c == '\'').trim();
        if let Ok(d) = NaiveDate::parse_from_str(t, "%Y-%m-%d") {
            return Ok(When::Day(d));
        }
        let iso = t.replacen(' ', "T", 1);
        if let Ok(x) = DateTime::parse_from_rfc3339(&iso) {
            return Ok(When::Utc(x.with_timezone(&Utc)));
        }
        for f in ["%Y-%m-%dT%H:%M%:z", "%Y-%m-%dT%H:%M%#z"] {
            if let Ok(x) = DateTime::parse_from_str(&iso, f) {
                return Ok(When::Utc(x.with_timezone(&Utc)));
            }
        }
        if let Some(z) = iso.strip_suffix('Z').or_else(|| iso.strip_suffix('z')) {
            if let Ok(x) = NaiveDateTime::parse_from_str(z, "%Y-%m-%dT%H:%M") {
                return Ok(When::Utc(x.and_utc()));
            }
        }
        for f in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"] {
            if let Ok(x) = NaiveDateTime::parse_from_str(&iso, f) {
                return Ok(When::Local(x));
            }
        }
        Err(format!("{t:?} is not a date: write 2026-11-03, 2026-11-03 14:00 or 2026-11-03T14:00+01:00"))
    }

    /// The value as a DTSTART / DTEND line's parameters and value.
    pub fn ical(&self) -> (&'static str, String) {
        match self {
            When::Day(d) => (";VALUE=DATE", d.format("%Y%m%d").to_string()),
            When::Local(t) => ("", t.format("%Y%m%dT%H%M%S").to_string()),
            When::Utc(t) => ("", t.format("%Y%m%dT%H%M%SZ").to_string()),
        }
    }

    /// A DTSTART / DTEND value read back (`VALUE=DATE`, a `TZID` time is kept as its wall-clock time).
    pub fn from_ical(value: &str) -> Option<When> {
        let v = value.trim();
        if v.len() == 8 {
            return NaiveDate::parse_from_str(v, "%Y%m%d").ok().map(When::Day);
        }
        if let Some(z) = v.strip_suffix('Z') {
            return NaiveDateTime::parse_from_str(z, "%Y%m%dT%H%M%S").ok().map(|t| When::Utc(t.and_utc()));
        }
        NaiveDateTime::parse_from_str(v, "%Y%m%dT%H%M%S").ok().map(When::Local)
    }

    pub fn is_day(&self) -> bool {
        matches!(self, When::Day(_))
    }

    /// Its day (an instant's in UTC).
    pub fn date(&self) -> NaiveDate {
        match self {
            When::Day(d) => *d,
            When::Local(t) => t.date(),
            When::Utc(t) => t.date_naive(),
        }
    }

    /// For ordering and comparing: the naive time (an instant's in UTC; a day at midnight).
    pub fn naive(&self) -> NaiveDateTime {
        match self {
            When::Day(d) => d.and_hms_opt(0, 0, 0).unwrap_or_default(),
            When::Local(t) => *t,
            When::Utc(t) => t.naive_utc(),
        }
    }

    /// The end an event gets when none is given: the next day for a day, an hour later for a time.
    pub fn default_end(&self) -> When {
        match self {
            When::Day(d) => When::Day(*d + Duration::days(1)),
            When::Local(t) => When::Local(*t + Duration::hours(1)),
            When::Utc(t) => When::Utc(*t + Duration::hours(1)),
        }
    }

    /// As a person writes it: `2026-11-03`, `2026-11-03 14:00`, `2026-11-03 13:00Z`.
    pub fn human(&self) -> String {
        match self {
            When::Day(d) => d.format("%Y-%m-%d").to_string(),
            When::Local(t) => t.format("%Y-%m-%d %H:%M").to_string(),
            When::Utc(t) => t.format("%Y-%m-%d %H:%MZ").to_string(),
        }
    }
}

/// An event as the plugin writes it.
#[derive(Debug, Clone, PartialEq)]
pub struct Event {
    pub uid: String,
    pub summary: String,
    pub start: When,
    /// DTEND exactly (exclusive: an all-day event's is the day after its last); None: `start.default_end()`
    pub end: Option<When>,
    pub description: Option<String>,
    pub location: Option<String>,
    /// where it came from (a vault path, a Message-ID), kept as X-ATLAS-SOURCE
    pub source: Option<String>,
}

impl Event {
    pub fn end(&self) -> When {
        self.end.unwrap_or_else(|| self.start.default_end())
    }

    /// What the event says, hashed: kept as X-ATLAS-HASH so a sync can tell "nothing changed" (also when the user moved
    /// the event in a calendar app, which keeps the property) from "the note changed".
    pub fn hash(&self) -> String {
        let (_, s) = self.start.ical();
        let (_, e) = self.end().ical();
        let parts = [
            self.summary.as_str(),
            &s,
            &e,
            self.description.as_deref().unwrap_or(""),
            self.location.as_deref().unwrap_or(""),
        ];
        hex(&Sha256::digest(parts.join("\u{1f}").as_bytes()))[..16].to_string()
    }

    /// The event as a whole calendar object (CRLF lines, folded).
    pub fn to_ics(&self, stamp: DateTime<Utc>) -> String {
        let mut lines = vec![
            "BEGIN:VCALENDAR".to_string(),
            "VERSION:2.0".into(),
            format!("PRODID:{PRODID}"),
            "CALSCALE:GREGORIAN".into(),
            "BEGIN:VEVENT".into(),
        ];
        lines.push(format!("UID:{}", escape(&self.uid)));
        lines.push(format!("DTSTAMP:{}", stamp.format("%Y%m%dT%H%M%SZ")));
        let (p, v) = self.start.ical();
        lines.push(format!("DTSTART{p}:{v}"));
        let (p, v) = self.end().ical();
        lines.push(format!("DTEND{p}:{v}"));
        lines.push(format!("SUMMARY:{}", escape(&self.summary)));
        if let Some(d) = self.description.as_deref().filter(|d| !d.trim().is_empty()) {
            lines.push(format!("DESCRIPTION:{}", escape(d)));
        }
        if let Some(l) = self.location.as_deref().filter(|l| !l.trim().is_empty()) {
            lines.push(format!("LOCATION:{}", escape(l)));
        }
        if self.start.is_day() {
            lines.push("TRANSP:TRANSPARENT".into()); // a deadline does not make the user busy all day
        }
        if let Some(s) = &self.source {
            lines.push(format!("X-ATLAS-SOURCE:{}", escape(s)));
        }
        lines.push(format!("X-ATLAS-HASH:{}", self.hash()));
        lines.extend(["END:VEVENT".to_string(), "END:VCALENDAR".into()]);
        lines.iter().map(|l| fold(l)).collect::<Vec<_>>().join("\r\n") + "\r\n"
    }
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

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

/// A component (`VCALENDAR`, `VEVENT`, `VTIMEZONE`…): its properties in order and the components inside it.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Component {
    pub name: String,
    pub props: Vec<Line>,
    pub subs: Vec<Component>,
}

impl Component {
    pub fn prop(&self, name: &str) -> Option<&Line> {
        self.props.iter().find(|l| l.name == name)
    }

    pub fn text(&self, name: &str) -> Option<String> {
        self.prop(name).map(|l| unescape(&l.value)).filter(|t| !t.trim().is_empty())
    }

    /// Replaces every `name` line by one (kept where the first was, else at the end).
    pub fn set(&mut self, name: &str, params: Vec<(String, String)>, value: impl Into<String>) {
        let line = Line { name: name.into(), params, value: value.into() };
        match self.props.iter().position(|l| l.name == name) {
            Some(i) => {
                self.props[i] = line;
                let mut seen = false;
                self.props.retain(|l| l.name != name || !std::mem::replace(&mut seen, true));
            }
            None => self.props.push(line),
        }
    }

    /// A TEXT property set (escaped), or taken out when empty.
    pub fn set_text(&mut self, name: &str, text: Option<&str>) {
        match text.map(str::trim).filter(|t| !t.is_empty()) {
            Some(t) => self.set(name, vec![], escape(t)),
            None => self.remove(name),
        }
    }

    pub fn remove(&mut self, name: &str) {
        self.props.retain(|l| l.name != name);
    }

    fn write_into(&self, out: &mut Vec<String>) {
        out.push(format!("BEGIN:{}", self.name));
        out.extend(self.props.iter().map(Line::write));
        for s in &self.subs {
            s.write_into(out);
        }
        out.push(format!("END:{}", self.name));
    }

    pub fn write(&self) -> String {
        let mut out = Vec::new();
        self.write_into(&mut out);
        out.join("\r\n") + "\r\n"
    }
}

/// The top-level components of iCalendar text (usually one VCALENDAR).
pub fn parse(text: &str) -> Result<Vec<Component>, String> {
    let mut top = Vec::new();
    let mut stack: Vec<Component> = Vec::new();
    for raw in unfold(text).lines() {
        let raw = raw.trim_end_matches('\r');
        if raw.trim().is_empty() {
            continue;
        }
        let Some(line) = Line::parse(raw) else { continue };
        match line.name.as_str() {
            "BEGIN" => stack.push(Component { name: line.value.trim().to_ascii_uppercase(), ..Component::default() }),
            "END" => {
                let c = stack.pop().ok_or("an END with no BEGIN in the calendar data")?;
                if c.name != line.value.trim().to_ascii_uppercase() {
                    return Err(format!("calendar data: BEGIN:{} closed by END:{}", c.name, line.value.trim()));
                }
                match stack.last_mut() {
                    Some(parent) => parent.subs.push(c),
                    None => top.push(c),
                }
            }
            _ => {
                if let Some(c) = stack.last_mut() {
                    c.props.push(line);
                }
            }
        }
    }
    if let Some(c) = stack.last() {
        return Err(format!("calendar data: BEGIN:{} is never closed", c.name));
    }
    if top.is_empty() {
        return Err("no calendar in it (no BEGIN:VCALENDAR)".into());
    }
    Ok(top)
}

/// An event as a listing shows it.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Listed {
    pub uid: String,
    pub summary: String,
    pub start: String,
    pub end: Option<String>,
    pub all_day: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tzid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub recurring: bool,
    /// set on events the plugin wrote: the note or mail they came from
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip)]
    pub hash: Option<String>,
}

/// The VEVENTs of a calendar object (a recurrence's overrides are left out: the master stands for them).
pub fn events_of(text: &str) -> Result<Vec<Listed>, String> {
    let mut out = Vec::new();
    for cal in parse(text)? {
        for ev in cal.subs.iter().filter(|c| c.name == "VEVENT" && c.prop("RECURRENCE-ID").is_none()) {
            let start_line = ev.prop("DTSTART");
            let start = start_line.and_then(|l| When::from_ical(&l.value));
            let end = ev.prop("DTEND").and_then(|l| When::from_ical(&l.value));
            out.push(Listed {
                uid: ev.text("UID").unwrap_or_default(),
                summary: ev.text("SUMMARY").unwrap_or_default(),
                start: start.map(|w| w.human()).unwrap_or_default(),
                end: end.map(|w| w.human()),
                all_day: start.is_some_and(|w| w.is_day()),
                tzid: start_line.and_then(|l| l.param("TZID")).map(str::to_string),
                location: ev.text("LOCATION"),
                description: ev.text("DESCRIPTION"),
                recurring: ev.prop("RRULE").is_some() || ev.prop("RDATE").is_some(),
                source: ev.text("X-ATLAS-SOURCE"),
                hash: ev.prop("X-ATLAS-HASH").map(|l| l.value.trim().to_string()),
            });
        }
    }
    Ok(out)
}

/// One event of an invite, as its own calendar object.
#[derive(Debug, Clone, PartialEq)]
pub struct Invite {
    pub uid: String,
    pub summary: String,
    pub start: Option<When>,
    pub end: Option<When>,
    /// the invite's METHOD (REQUEST, PUBLISH, CANCEL, REPLY…), None for a plain calendar file
    pub method: Option<String>,
    /// VCALENDAR text for the server: no METHOD (RFC 4791 §4.1), the time zones it uses, every VEVENT of this UID
    pub ics: String,
}

impl Invite {
    /// An invite that is a calendar entry to keep (not a cancellation, nor someone's answer to the user's invite).
    pub fn is_entry(&self) -> bool {
        matches!(self.method.as_deref(), None | Some("REQUEST") | Some("PUBLISH") | Some("ADD"))
    }
}

/// A mail's .ics (an invite, or any calendar file) split into one calendar object per event UID.
pub fn split_invite(text: &str) -> Result<Vec<Invite>, String> {
    let mut out: Vec<Invite> = Vec::new();
    for cal in parse(text)?.into_iter().filter(|c| c.name == "VCALENDAR") {
        let method = cal.prop("METHOD").map(|l| l.value.trim().to_ascii_uppercase());
        let zones: Vec<&Component> = cal.subs.iter().filter(|c| c.name == "VTIMEZONE").collect();
        // an event with no UID gets one from its text, so the same file always gives the same entry
        let tagged: Vec<(String, &Component)> = cal
            .subs
            .iter()
            .filter(|c| c.name == "VEVENT")
            .map(|ev| {
                (
                    ev.text("UID")
                        .unwrap_or_else(|| format!("atlas-ics-{}", &hex(&Sha256::digest(ev.write().as_bytes()))[..24])),
                    ev,
                )
            })
            .collect();
        let mut uids: Vec<&String> = Vec::new();
        for (u, _) in &tagged {
            if !uids.contains(&u) {
                uids.push(u);
            }
        }
        for uid in uids {
            let uid = uid.clone();
            let evs: Vec<&Component> = tagged.iter().filter(|(u, _)| *u == uid).map(|(_, e)| *e).collect();
            let master = evs.iter().find(|e| e.prop("RECURRENCE-ID").is_none()).or(evs.first()).copied();
            let Some(master) = master else { continue };
            let mut obj = Component { name: "VCALENDAR".into(), ..Component::default() };
            obj.props = cal.props.iter().filter(|l| l.name != "METHOD").cloned().collect();
            if obj.prop("VERSION").is_none() {
                obj.props.insert(0, Line { name: "VERSION".into(), params: vec![], value: "2.0".into() });
            }
            if obj.prop("PRODID").is_none() {
                obj.props.insert(1, Line { name: "PRODID".into(), params: vec![], value: PRODID.into() });
            }
            let used: Vec<String> =
                evs.iter().flat_map(|e| e.props.iter().filter_map(|l| l.param("TZID").map(str::to_string))).collect();
            obj.subs.extend(
                zones.iter().filter(|z| z.text("TZID").is_some_and(|t| used.contains(&t))).map(|z| (*z).clone()),
            );
            for e in &evs {
                let mut e = (*e).clone();
                if e.prop("UID").is_none() {
                    e.props.insert(0, Line { name: "UID".into(), params: vec![], value: uid.clone() });
                }
                // required (RFC 5545 §3.6.1); strict servers (RustiCal) refuse an event without it
                if e.prop("DTSTAMP").is_none() {
                    let at = e
                        .prop("LAST-MODIFIED")
                        .or(e.prop("CREATED"))
                        .map(|l| l.value.clone())
                        .unwrap_or_else(|| Utc::now().format("%Y%m%dT%H%M%SZ").to_string());
                    e.props.insert(1, Line { name: "DTSTAMP".into(), params: vec![], value: at });
                }
                obj.subs.push(e);
            }
            out.push(Invite {
                summary: master.text("SUMMARY").unwrap_or_else(|| "(no title)".into()),
                start: master.prop("DTSTART").and_then(|l| When::from_ical(&l.value)),
                end: master.prop("DTEND").and_then(|l| When::from_ical(&l.value)),
                method: method.clone(),
                ics: obj.write(),
                uid,
            });
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stamp() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-10-21T10:00:00Z").unwrap().with_timezone(&Utc)
    }

    #[test]
    fn dates_are_read_as_days_wall_clock_times_or_instants() {
        assert_eq!(When::parse("2026-11-03").unwrap(), When::Day(NaiveDate::from_ymd_opt(2026, 11, 3).unwrap()));
        assert_eq!(When::parse("\"2026-11-03 14:00\"").unwrap().ical(), ("", "20261103T140000".into()));
        assert_eq!(When::parse("2026-11-03T14:00:30").unwrap().ical(), ("", "20261103T140030".into()));
        assert_eq!(When::parse("2026-11-03T14:00+01:00").unwrap().ical(), ("", "20261103T130000Z".into()));
        assert_eq!(When::parse("2026-11-03 14:00:00-05:00").unwrap().ical(), ("", "20261103T190000Z".into()));
        assert_eq!(When::parse("2026-11-03T14:00Z").unwrap().ical(), ("", "20261103T140000Z".into()));
        assert!(When::parse("next tuesday").unwrap_err().contains("not a date"));
        assert!(When::parse("2026-13-01").is_err());
    }

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
    fn an_event_becomes_a_calendar_object_that_reads_back() {
        let ev = Event {
            uid: "atlas-1".into(),
            summary: "Due: thesis chapter, draft; v2".into(),
            start: When::parse("2026-11-03").unwrap(),
            end: None,
            description: Some("From mail/uni/Inbox/a.md\nsecond line".into()),
            location: Some("Room 204, Main Building".into()),
            source: Some("mail/uni/Inbox/a.md".into()),
        };
        let ics = ev.to_ics(stamp());
        assert!(ics.starts_with("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
        assert!(ics.ends_with("END:VCALENDAR\r\n"));
        assert!(ics.contains("DTSTART;VALUE=DATE:20261103\r\nDTEND;VALUE=DATE:20261104\r\n"), "{ics}");
        assert!(ics.contains("SUMMARY:Due: thesis chapter\\, draft\\; v2\r\n"));
        assert!(ics.contains("DTSTAMP:20261021T100000Z"));
        assert!(!ics.replace("\r\n", "").contains('\n'), "only CRLF line ends");
        let back = &events_of(&ics).unwrap()[0];
        assert_eq!(back.uid, "atlas-1");
        assert_eq!(back.summary, ev.summary);
        assert_eq!(back.description.as_deref(), ev.description.as_deref());
        assert_eq!(back.location.as_deref(), Some("Room 204, Main Building"));
        assert_eq!((back.start.as_str(), back.end.as_deref(), back.all_day), ("2026-11-03", Some("2026-11-04"), true));
        assert_eq!(back.hash.as_deref(), Some(ev.hash().as_str()));
        assert_eq!(back.source.as_deref(), Some("mail/uni/Inbox/a.md"));
    }

    #[test]
    fn the_hash_follows_what_the_event_says_not_when_it_was_written() {
        let a = Event {
            uid: "u".into(),
            summary: "A".into(),
            start: When::parse("2026-11-03 14:00").unwrap(),
            end: None,
            description: None,
            location: None,
            source: None,
        };
        let mut b = a.clone();
        assert_eq!(a.hash(), b.hash());
        assert_ne!(a.to_ics(stamp()), a.to_ics(stamp() + Duration::seconds(1)), "DTSTAMP moves");
        b.start = When::parse("2026-11-03 15:00").unwrap();
        assert_ne!(a.hash(), b.hash());
        assert!(a.to_ics(stamp()).contains("DTEND:20261103T150000\r\n"), "an hour by default");
    }

    // shaped as Outlook / Exchange sends a meeting invite (METHOD:REQUEST, a VTIMEZONE, a folded description)
    const INVITE: &str = "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nPRODID:Microsoft Exchange Server 2010\r\nVERSION:2.0\r\nBEGIN:VTIMEZONE\r\nTZID:Eastern Standard Time\r\nBEGIN:STANDARD\r\nDTSTART:16010101T020000\r\nTZOFFSETFROM:-0400\r\nTZOFFSETTO:-0500\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\nBEGIN:VTIMEZONE\r\nTZID:Unused Zone\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT\r\nORGANIZER;CN=\"Doe, J.\":mailto:jdoe@uni.example.org\r\nDESCRIPTION;LANGUAGE=en-US:Group meeting on cluster DMFT\\, bring \r\n the plots\\n\r\nUID:040000008200E00074C5B7101A82E00800000000\r\nSUMMARY;LANGUAGE=en-US:Group meeting\r\nDTSTART;TZID=Eastern Standard Time:20261104T100000\r\nDTEND;TZID=Eastern Standard Time:20261104T113000\r\nLOCATION:D3-2041\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:second@example.org\r\nSUMMARY:Another\r\nDTSTART;VALUE=DATE:20261201\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

    #[test]
    fn an_invite_is_split_per_uid_without_its_method_and_with_only_the_zones_it_uses() {
        let got = split_invite(INVITE).unwrap();
        assert_eq!(got.len(), 2);
        let m = &got[0];
        assert_eq!(m.uid, "040000008200E00074C5B7101A82E00800000000");
        assert_eq!(m.summary, "Group meeting");
        assert_eq!(m.method.as_deref(), Some("REQUEST"));
        assert!(m.is_entry());
        assert_eq!(m.start.unwrap().human(), "2026-11-04 10:00");
        assert!(!m.ics.contains("METHOD"), "{}", m.ics);
        assert!(m.ics.contains("TZID:Eastern Standard Time") && !m.ics.contains("Unused Zone"));
        assert!(m.ics.contains("ORGANIZER;CN=\"Doe, J.\":mailto:jdoe@uni.example.org"), "{}", m.ics);
        assert!(!m.ics.contains("Another"));
        let listed = &events_of(&m.ics).unwrap()[0];
        assert_eq!(listed.description.as_deref(), Some("Group meeting on cluster DMFT, bring the plots\n"));
        assert_eq!(listed.tzid.as_deref(), Some("Eastern Standard Time"));
        assert_eq!(got[1].uid, "second@example.org");
        assert!(got[1].start.unwrap().is_day());
    }

    #[test]
    fn a_cancellation_or_a_reply_is_not_an_entry_and_bad_data_is_a_reason() {
        let cancel = INVITE.replace("METHOD:REQUEST", "METHOD:CANCEL");
        assert!(!split_invite(&cancel).unwrap()[0].is_entry());
        assert!(split_invite("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nEND:VCALENDAR\r\n").is_err());
        assert!(split_invite("hello").is_err());
        let lf = INVITE.replace("\r\n", "\n");
        assert_eq!(split_invite(&lf).unwrap().len(), 2, "LF-only files read too");
    }

    #[test]
    fn an_event_without_uid_gets_the_same_one_every_time() {
        let t = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:x\nDTSTART:20261101T090000Z\nEND:VEVENT\nEND:VCALENDAR\n";
        let (a, b) = (split_invite(t).unwrap(), split_invite(t).unwrap());
        assert!(a[0].uid.starts_with("atlas-ics-"));
        assert_eq!(a[0].uid, b[0].uid);
        assert!(a[0].ics.contains(&format!("UID:{}", a[0].uid)));
        assert!(a[0].ics.contains("DTSTAMP:"), "a required DTSTAMP is added");
    }
}
