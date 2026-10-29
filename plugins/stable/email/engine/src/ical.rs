//! Calendar invitations (text/calendar, RFC 5545 / iTIP RFC 5546): read for the reader's card, with every time turned
//! into an instant so the page shows it in the user's own hour; and the REPLY an Accept / Maybe / Decline sends.

use chrono::{DateTime, FixedOffset, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Tz;
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
pub struct Attendee {
    pub name: String,
    pub addr: String,
    /// NEEDS-ACTION, ACCEPTED, TENTATIVE, DECLINED, DELEGATED
    pub partstat: String,
}

/// A calendar invitation, as a card above the body.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
pub struct Invite {
    /// REQUEST (an invitation), CANCEL, REPLY (someone's answer), PUBLISH, COUNTER…
    pub method: String,
    pub uid: String,
    pub sequence: u32,
    pub summary: String,
    /// RFC 3339 with an offset (an instant: the page shows it in local time), or YYYY-MM-DD for a whole day
    pub start: String,
    pub end: String,
    pub all_day: bool,
    /// the zone the organiser wrote it in, when it is not the user's (the card says "15:00 (09:00 Toronto)")
    pub zone: String,
    pub location: String,
    pub organizer: String,
    pub organizer_addr: String,
    pub attendees: Vec<Attendee>,
    /// RRULE as written: the card says "repeats"
    pub repeats: String,
    pub description: String,
    /// the calendar text itself, for the calendar plugin's import
    pub ics: String,
}

/// RFC 5545 3.1: a line starting with a space or tab continues the one before.
fn unfold(ics: &str) -> String {
    ics.replace("\r\n ", "").replace("\n ", "").replace("\r\n\t", "").replace("\n\t", "")
}

fn unescape(v: &str) -> String {
    v.replace("\\,", ",").replace("\\;", ";").replace("\\n", "\n").replace("\\N", "\n").replace("\\\\", "\\")
}

/// A content line's parameters, in order: `(NAME, value)`.
type Params = Vec<(String, String)>;
/// A property's value with its parameters.
type Prop = (String, Params);

/// `NAME;P1=a;P2="b:c":value` → (NAME, params, value); a colon inside a quoted parameter is not the separator.
fn split(line: &str) -> Option<(String, Params, String)> {
    let mut quoted = false;
    let colon = line.char_indices().find(|&(_, c)| {
        if c == '"' {
            quoted = !quoted;
        }
        c == ':' && !quoted
    })?.0;
    let (head, value) = (&line[..colon], &line[colon + 1..]);
    let mut parts = head.split(';');
    let name = parts.next()?.trim().to_uppercase();
    let params = parts.filter_map(|p| p.split_once('=')).map(|(k, v)| (k.trim().to_uppercase(), v.trim().trim_matches('"').to_string())).collect();
    Some((name, params, value.to_string()))
}

fn param<'a>(params: &'a [(String, String)], key: &str) -> Option<&'a str> {
    params.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
}

/// Outlook / Exchange write Windows zone names; the common ones, to IANA (CLDR's windowsZones, the "001" territory).
const WINDOWS: &[(&str, &str)] = &[
    ("Eastern Standard Time", "America/New_York"),
    ("Central Standard Time", "America/Chicago"),
    ("Mountain Standard Time", "America/Denver"),
    ("US Mountain Standard Time", "America/Phoenix"),
    ("Pacific Standard Time", "America/Los_Angeles"),
    ("Atlantic Standard Time", "America/Halifax"),
    ("Newfoundland Standard Time", "America/St_Johns"),
    ("Alaskan Standard Time", "America/Anchorage"),
    ("Hawaiian Standard Time", "Pacific/Honolulu"),
    ("Canada Central Standard Time", "America/Regina"),
    ("Central America Standard Time", "America/Guatemala"),
    ("Mexico Standard Time", "America/Mexico_City"),
    ("Central Standard Time (Mexico)", "America/Mexico_City"),
    ("SA Pacific Standard Time", "America/Bogota"),
    ("SA Eastern Standard Time", "America/Cayenne"),
    ("E. South America Standard Time", "America/Sao_Paulo"),
    ("Argentina Standard Time", "America/Buenos_Aires"),
    ("Pacific SA Standard Time", "America/Santiago"),
    ("UTC", "UTC"),
    ("Coordinated Universal Time", "UTC"),
    ("GMT Standard Time", "Europe/London"),
    ("Greenwich Standard Time", "Atlantic/Reykjavik"),
    ("W. Europe Standard Time", "Europe/Berlin"),
    ("Romance Standard Time", "Europe/Paris"),
    ("Central Europe Standard Time", "Europe/Budapest"),
    ("Central European Standard Time", "Europe/Warsaw"),
    ("GTB Standard Time", "Europe/Bucharest"),
    ("E. Europe Standard Time", "Europe/Chisinau"),
    ("FLE Standard Time", "Europe/Kiev"),
    ("Russian Standard Time", "Europe/Moscow"),
    ("Turkey Standard Time", "Europe/Istanbul"),
    ("Israel Standard Time", "Asia/Jerusalem"),
    ("Morocco Standard Time", "Africa/Casablanca"),
    ("South Africa Standard Time", "Africa/Johannesburg"),
    ("Egypt Standard Time", "Africa/Cairo"),
    ("Arabian Standard Time", "Asia/Dubai"),
    ("India Standard Time", "Asia/Calcutta"),
    ("China Standard Time", "Asia/Shanghai"),
    ("Singapore Standard Time", "Asia/Singapore"),
    ("Tokyo Standard Time", "Asia/Tokyo"),
    ("Korea Standard Time", "Asia/Seoul"),
    ("AUS Eastern Standard Time", "Australia/Sydney"),
    ("New Zealand Standard Time", "Pacific/Auckland"),
];

/// A VTIMEZONE's offsets when its name is no zone we know: the STANDARD and DAYLIGHT `TZOFFSETTO`, and the months
/// daylight time starts and ends (from their RRULE's BYMONTH) — enough for the invitations seen in practice.
#[derive(Debug, Default, Clone)]
struct Vtz {
    standard: Option<i32>,
    daylight: Option<i32>,
    dst_from: Option<u32>,
    dst_to: Option<u32>,
}

fn offset_secs(v: &str) -> Option<i32> {
    let v = v.trim();
    let sign = if v.starts_with('-') { -1 } else { 1 };
    let d: String = v.chars().filter(|c| c.is_ascii_digit()).collect();
    if d.len() < 4 {
        return None;
    }
    let h: i32 = d[0..2].parse().ok()?;
    let m: i32 = d[2..4].parse().ok()?;
    Some(sign * (h * 3600 + m * 60))
}

/// Which zone a TZID names: IANA (also with Outlook's `/…/` prefixes), a Windows name, else none.
fn zone(tzid: &str) -> Option<Tz> {
    let t = tzid.trim().trim_matches('"');
    let t = t.rsplit_once("/mozilla.org/").map(|(_, z)| z).unwrap_or(t).trim_start_matches('/');
    t.parse::<Tz>().ok().or_else(|| WINDOWS.iter().find(|(w, _)| w.eq_ignore_ascii_case(t)).and_then(|(_, i)| i.parse().ok()))
}

/// A DTSTART/DTEND → (RFC 3339 or a day, whole day?, the zone's name when one was given).
fn when(value: &str, params: &[(String, String)], vtz: &HashMap<String, Vtz>) -> (String, bool, String) {
    let v: String = value.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    if param(params, "VALUE").is_some_and(|x| x.eq_ignore_ascii_case("DATE")) || (v.len() == 8 && v.chars().all(|c| c.is_ascii_digit())) {
        return match NaiveDate::parse_from_str(&v[..8.min(v.len())], "%Y%m%d") {
            Ok(d) => (d.format("%Y-%m-%d").to_string(), true, String::new()),
            Err(_) => (value.to_string(), true, String::new()),
        };
    }
    let Ok(naive) = NaiveDateTime::parse_from_str(v.trim_end_matches('Z'), "%Y%m%dT%H%M%S") else {
        return (value.to_string(), false, String::new());
    };
    let rfc = |d: DateTime<FixedOffset>| d.to_rfc3339();
    if v.ends_with('Z') {
        return (rfc(Utc.from_utc_datetime(&naive).fixed_offset()), false, String::new());
    }
    match param(params, "TZID") {
        Some(id) => {
            if let Some(tz) = zone(id) {
                if let Some(d) = tz.from_local_datetime(&naive).earliest() {
                    return (rfc(d.fixed_offset()), false, tz.name().to_string());
                }
            }
            if let Some(z) = vtz.get(id) {
                let dst = matches!((z.dst_from, z.dst_to), (Some(a), Some(b)) if {
                    use chrono::Datelike;
                    let m = naive.month();
                    if a < b { m >= a && m < b } else { m >= a || m < b }
                });
                let off = if dst { z.daylight.or(z.standard) } else { z.standard.or(z.daylight) };
                if let Some(o) = off.and_then(FixedOffset::east_opt) {
                    if let Some(d) = o.from_local_datetime(&naive).earliest() {
                        return (rfc(d), false, id.to_string());
                    }
                }
            }
            floating(naive)
        }
        None => floating(naive),
    }
}

/// A time with no zone is wall-clock (RFC 5545 "floating"): the user's own hour.
fn floating(naive: NaiveDateTime) -> (String, bool, String) {
    match Local.from_local_datetime(&naive).earliest() {
        Some(d) => (d.fixed_offset().to_rfc3339(), false, String::new()),
        None => (naive.format("%Y-%m-%dT%H:%M:%S").to_string(), false, String::new()),
    }
}

fn person(params: &[(String, String)], value: &str) -> (String, String) {
    let addr = value.trim().trim_start_matches("mailto:").trim_start_matches("MAILTO:").to_string();
    (param(params, "CN").unwrap_or("").to_string(), addr)
}

/// The first event of a calendar text (an invitation carries one, plus overrides of a series we do not show).
pub fn read(ics: &str) -> Invite {
    let text = unfold(ics);
    let mut inv = Invite { ics: ics.to_string(), ..Default::default() };
    let mut vtz: HashMap<String, Vtz> = HashMap::new();
    let (mut tzid, mut sub, mut cur) = (String::new(), String::new(), Vtz::default());
    let mut in_event = false;
    let (mut start, mut end): (Option<Prop>, Option<Prop>) = (None, None);
    for line in text.lines() {
        let line = line.trim_end_matches('\r');
        let Some((name, params, value)) = split(line) else { continue };
        match (name.as_str(), value.trim().to_uppercase().as_str()) {
            ("BEGIN", "VEVENT") if inv.uid.is_empty() && start.is_none() => in_event = true,
            ("END", "VEVENT") => in_event = false,
            ("BEGIN", "VTIMEZONE") => (tzid, cur) = (String::new(), Vtz::default()),
            ("END", "VTIMEZONE") => {
                vtz.insert(tzid.clone(), cur.clone());
            }
            ("BEGIN", s @ ("STANDARD" | "DAYLIGHT")) => sub = s.to_string(),
            ("END", "STANDARD" | "DAYLIGHT") => sub.clear(),
            _ => {}
        }
        if !in_event {
            match name.as_str() {
                "METHOD" => inv.method = value.trim().to_uppercase(),
                "TZID" => tzid = value.trim().to_string(),
                "TZOFFSETTO" => {
                    let o = offset_secs(&value);
                    if sub == "DAYLIGHT" { cur.daylight = o } else { cur.standard = o }
                }
                "RRULE" if !sub.is_empty() => {
                    let month = value.split(';').find_map(|p| p.strip_prefix("BYMONTH=")).and_then(|m| m.parse().ok());
                    if sub == "DAYLIGHT" { cur.dst_from = month } else { cur.dst_to = month }
                }
                _ => {}
            }
            continue;
        }
        let v = unescape(&value);
        match name.as_str() {
            "UID" => inv.uid = v.trim().to_string(),
            "SEQUENCE" => inv.sequence = v.trim().parse().unwrap_or(0),
            "SUMMARY" => inv.summary = v,
            "DTSTART" => start = Some((value, params)),
            "DTEND" => end = Some((value, params)),
            "LOCATION" => inv.location = v,
            "DESCRIPTION" => inv.description = v,
            "RRULE" => inv.repeats = value.trim().to_string(),
            "ORGANIZER" => (inv.organizer, inv.organizer_addr) = person(&params, &value),
            "ATTENDEE" => {
                let (name, addr) = person(&params, &value);
                inv.attendees.push(Attendee { name, addr, partstat: param(&params, "PARTSTAT").unwrap_or("NEEDS-ACTION").to_uppercase() });
            }
            _ => {}
        }
    }
    if inv.organizer.is_empty() {
        inv.organizer = inv.organizer_addr.clone();
    }
    if let Some((v, p)) = start {
        (inv.start, inv.all_day, inv.zone) = when(&v, &p, &vtz);
    }
    if let Some((v, p)) = end {
        inv.end = when(&v, &p, &vtz).0;
    }
    // the zone is said only when it is not the user's hour at that moment
    if let Ok(d) = DateTime::parse_from_rfc3339(&inv.start) {
        if Local.offset_from_utc_datetime(&d.naive_utc()).local_minus_utc() == d.offset().local_minus_utc() {
            inv.zone.clear();
        }
    }
    inv
}

/// iTIP REPLY (RFC 5546 3.2.3): the event's identity and the user's own ATTENDEE line with their answer — what
/// Thunderbird, Outlook and Google send. `partstat`: ACCEPTED, TENTATIVE, DECLINED.
pub fn reply(inv: &Invite, me: &str, my_name: &str, partstat: &str) -> String {
    let text = unfold(&inv.ics);
    let mut out = String::from("BEGIN:VCALENDAR\r\nPRODID:-//Atlas//Email//EN\r\nVERSION:2.0\r\nMETHOD:REPLY\r\n");
    let (mut depth, mut in_event, mut done) = (0, false, false);
    for line in text.lines() {
        let line = line.trim_end_matches('\r');
        let Some((name, params, value)) = split(line) else { continue };
        let upper = value.trim().to_uppercase();
        if name == "BEGIN" && upper == "VTIMEZONE" {
            depth += 1;
        }
        if depth > 0 {
            out.push_str(line);
            out.push_str("\r\n");
            if name == "END" && upper == "VTIMEZONE" {
                depth -= 1;
            }
            continue;
        }
        if name == "BEGIN" && upper == "VEVENT" && !done {
            in_event = true;
            out.push_str("BEGIN:VEVENT\r\n");
            continue;
        }
        if !in_event {
            continue;
        }
        if name == "END" && upper == "VEVENT" {
            let cn = if my_name.is_empty() { String::new() } else { format!(";CN=\"{}\"", my_name.replace('"', "")) };
            out.push_str(&format!("ATTENDEE;PARTSTAT={partstat}{cn}:mailto:{me}\r\n"));
            out.push_str(&format!("DTSTAMP:{}\r\n", Utc::now().format("%Y%m%dT%H%M%SZ")));
            out.push_str("END:VEVENT\r\n");
            (in_event, done) = (false, true);
            continue;
        }
        // keep what identifies the event (RFC 5546 table 3.2.3); the user's ATTENDEE is written anew above
        if matches!(name.as_str(), "UID" | "SEQUENCE" | "RECURRENCE-ID" | "ORGANIZER" | "DTSTART" | "DTEND" | "DURATION" | "SUMMARY") {
            let _ = params;
            out.push_str(line);
            out.push_str("\r\n");
        }
    }
    out.push_str("END:VCALENDAR\r\n");
    out
}

/// The user's answer already in the invitation (their ATTENDEE's PARTSTAT), when it names one of their addresses.
pub fn my_answer(inv: &Invite, own: &[String]) -> Option<String> {
    inv.attendees.iter().find(|a| own.iter().any(|o| o.eq_ignore_ascii_case(&a.addr))).map(|a| a.partstat.clone()).filter(|p| p != "NEEDS-ACTION")
}

#[cfg(test)]
mod tests {
    use super::*;

    const OUTLOOK: &str = "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nBEGIN:VTIMEZONE\r\nTZID:Eastern Standard Time\r\nBEGIN:STANDARD\r\nDTSTART:16010101T020000\r\nTZOFFSETFROM:-0400\r\nTZOFFSETTO:-0500\r\nRRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11\r\nEND:STANDARD\r\nBEGIN:DAYLIGHT\r\nDTSTART:16010101T020000\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0400\r\nRRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3\r\nEND:DAYLIGHT\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT\r\nORGANIZER;CN=\"Tremblay, V\u{e9}ronique\":mailto:vt@uni.example\r\nATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Me:mailto:me@uni.example\r\nATTENDEE;PARTSTAT=ACCEPTED;CN=Bo:mailto:bo@uni.example\r\nSUMMARY;LANGUAGE=fr-CA:R\u{e9}union d'\u{e9}quipe\r\nDTSTART;TZID=Eastern Standard Time:20261027T090000\r\nDTEND;TZID=Eastern Standard Time:20261027T100000\r\nUID:040000008200E00074C5B7101A82E008\r\nSEQUENCE:2\r\nLOCATION:D3-20\r\nRRULE:FREQ=WEEKLY;BYDAY=TU\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

    #[test]
    fn an_outlook_invitation_is_an_instant_in_its_zone() {
        let i = read(OUTLOOK);
        assert_eq!(i.method, "REQUEST");
        // 09:00 in Toronto/New York on 27 Oct (daylight time, -4) = 13:00 UTC
        assert_eq!(DateTime::parse_from_rfc3339(&i.start).unwrap().timestamp(), Utc.with_ymd_and_hms(2026, 10, 27, 13, 0, 0).unwrap().timestamp());
        assert_eq!(i.zone, "America/New_York");
        assert_eq!(i.organizer, "Tremblay, Véronique");
        assert_eq!(i.organizer_addr, "vt@uni.example");
        assert_eq!(i.summary, "Réunion d'équipe");
        assert_eq!(i.sequence, 2);
        assert_eq!(i.repeats, "FREQ=WEEKLY;BYDAY=TU");
        assert_eq!(i.attendees.len(), 2);
        assert_eq!(my_answer(&i, &["bo@uni.example".into()]).as_deref(), Some("ACCEPTED"));
        assert_eq!(my_answer(&i, &["me@uni.example".into()]), None);
    }

    #[test]
    fn iana_utc_whole_days_and_unknown_zones_from_their_vtimezone() {
        let iana = read("BEGIN:VEVENT\r\nDTSTART;TZID=America/Toronto:20260115T090000\r\nDTEND:20260115T150000Z\r\nEND:VEVENT\r\n");
        assert_eq!(DateTime::parse_from_rfc3339(&iana.start).unwrap().timestamp(), Utc.with_ymd_and_hms(2026, 1, 15, 14, 0, 0).unwrap().timestamp());
        assert_eq!(DateTime::parse_from_rfc3339(&iana.end).unwrap().timestamp(), Utc.with_ymd_and_hms(2026, 1, 15, 15, 0, 0).unwrap().timestamp());
        let day = read("BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261224\r\nDTEND;VALUE=DATE:20261225\r\nEND:VEVENT\r\n");
        assert_eq!((day.start.as_str(), day.all_day), ("2026-12-24", true));
        let odd = read("BEGIN:VTIMEZONE\r\nTZID:Customized Time Zone\r\nBEGIN:STANDARD\r\nTZOFFSETTO:+0100\r\nRRULE:FREQ=YEARLY;BYMONTH=10\r\nEND:STANDARD\r\nBEGIN:DAYLIGHT\r\nTZOFFSETTO:+0200\r\nRRULE:FREQ=YEARLY;BYMONTH=3\r\nEND:DAYLIGHT\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT\r\nDTSTART;TZID=\"Customized Time Zone\":20260701T100000\r\nEND:VEVENT\r\n");
        assert_eq!(DateTime::parse_from_rfc3339(&odd.start).unwrap().timestamp(), Utc.with_ymd_and_hms(2026, 7, 1, 8, 0, 0).unwrap().timestamp());
    }

    #[test]
    fn a_reply_names_the_event_and_only_my_answer() {
        let r = reply(&read(OUTLOOK), "me@uni.example", "Me", "ACCEPTED");
        assert!(r.contains("METHOD:REPLY\r\n"));
        assert!(r.contains("UID:040000008200E00074C5B7101A82E008\r\n"));
        assert!(r.contains("SEQUENCE:2\r\n"));
        assert!(r.contains("ATTENDEE;PARTSTAT=ACCEPTED;CN=\"Me\":mailto:me@uni.example\r\n"));
        assert!(!r.contains("bo@uni.example"), "other attendees are not in a reply");
        assert!(r.contains("BEGIN:VTIMEZONE"), "the zone its times use goes with it");
        assert_eq!(r.matches("BEGIN:VEVENT").count(), 1);
    }
}
