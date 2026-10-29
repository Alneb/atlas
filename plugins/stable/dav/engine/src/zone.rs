//! Time zones: a TZID as calendars write it (IANA, Outlook's Windows names, Mozilla's prefixed ones, or only the
//! calendar's own VTIMEZONE) resolved to a zone; the user's zone; and a VTIMEZONE written for a zone, so an event Atlas
//! makes carries its TZID as RFC 5545 asks.
use crate::ics::{Component, Line};
use chrono::{DateTime, Datelike, Duration, FixedOffset, LocalResult, NaiveDate, NaiveDateTime, Offset, TimeZone, Utc, Weekday};
use chrono_tz::{OffsetComponents, Tz};

/// A zone an event's times are in.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Zone {
    Tz(Tz),
    /// a VTIMEZONE no name could be found for: its standard offset (approximate across DST, said in the log)
    Fixed(FixedOffset),
}

impl Zone {
    pub const UTC: Zone = Zone::Tz(Tz::UTC);

    /// A wall-clock time in this zone as an instant: in a DST gap the time after it, in a fold the first.
    pub fn instant(&self, t: NaiveDateTime) -> DateTime<Utc> {
        match self {
            Zone::Tz(z) => match z.from_local_datetime(&t) {
                LocalResult::Single(x) | LocalResult::Ambiguous(x, _) => x.with_timezone(&Utc),
                LocalResult::None => z
                    .from_local_datetime(&(t + Duration::hours(1)))
                    .earliest()
                    .map(|x| x.with_timezone(&Utc))
                    .unwrap_or_else(|| t.and_utc()),
            },
            Zone::Fixed(o) => (t - Duration::seconds(o.local_minus_utc() as i64)).and_utc(),
        }
    }

    /// An instant as this zone's wall-clock time.
    pub fn wall(&self, t: DateTime<Utc>) -> NaiveDateTime {
        match self {
            Zone::Tz(z) => t.with_timezone(z).naive_local(),
            Zone::Fixed(o) => t.with_timezone(o).naive_local(),
        }
    }

    /// The instant written for people: `2026-11-04T10:00:00-05:00`.
    pub fn rfc3339(&self, t: DateTime<Utc>) -> String {
        match self {
            Zone::Tz(z) => t.with_timezone(z).format("%Y-%m-%dT%H:%M:%S%:z").to_string(),
            Zone::Fixed(o) => t.with_timezone(o).format("%Y-%m-%dT%H:%M:%S%:z").to_string(),
        }
    }

    pub fn name(&self) -> String {
        match self {
            Zone::Tz(z) => z.name().to_string(),
            Zone::Fixed(o) => o.to_string(),
        }
    }
}

/// Outlook / Exchange write Windows zone names; the ones people meet (CLDR's windowsZones, the territory "001" row).
const WINDOWS: &[(&str, &str)] = &[
    ("Dateline Standard Time", "Etc/GMT+12"),
    ("Hawaiian Standard Time", "Pacific/Honolulu"),
    ("Alaskan Standard Time", "America/Anchorage"),
    ("Pacific Standard Time", "America/Los_Angeles"),
    ("Pacific Standard Time (Mexico)", "America/Tijuana"),
    ("US Mountain Standard Time", "America/Phoenix"),
    ("Mountain Standard Time", "America/Denver"),
    ("Central America Standard Time", "America/Guatemala"),
    ("Central Standard Time", "America/Chicago"),
    ("Central Standard Time (Mexico)", "America/Mexico_City"),
    ("Canada Central Standard Time", "America/Regina"),
    ("SA Pacific Standard Time", "America/Bogota"),
    ("Eastern Standard Time", "America/New_York"),
    ("Eastern Standard Time (Mexico)", "America/Cancun"),
    ("US Eastern Standard Time", "America/Indianapolis"),
    ("Atlantic Standard Time", "America/Halifax"),
    ("Venezuela Standard Time", "America/Caracas"),
    ("SA Western Standard Time", "America/La_Paz"),
    ("Pacific SA Standard Time", "America/Santiago"),
    ("Newfoundland Standard Time", "America/St_Johns"),
    ("E. South America Standard Time", "America/Sao_Paulo"),
    ("Argentina Standard Time", "America/Buenos_Aires"),
    ("SA Eastern Standard Time", "America/Cayenne"),
    ("Greenland Standard Time", "America/Godthab"),
    ("Montevideo Standard Time", "America/Montevideo"),
    ("UTC", "Etc/UTC"),
    ("Coordinated Universal Time", "Etc/UTC"),
    ("Azores Standard Time", "Atlantic/Azores"),
    ("Cape Verde Standard Time", "Atlantic/Cape_Verde"),
    ("GMT Standard Time", "Europe/London"),
    ("Greenwich Standard Time", "Atlantic/Reykjavik"),
    ("Morocco Standard Time", "Africa/Casablanca"),
    ("W. Europe Standard Time", "Europe/Berlin"),
    ("Central Europe Standard Time", "Europe/Budapest"),
    ("Romance Standard Time", "Europe/Paris"),
    ("Central European Standard Time", "Europe/Warsaw"),
    ("W. Central Africa Standard Time", "Africa/Lagos"),
    ("GTB Standard Time", "Europe/Bucharest"),
    ("E. Europe Standard Time", "Europe/Chisinau"),
    ("FLE Standard Time", "Europe/Kiev"),
    ("Israel Standard Time", "Asia/Jerusalem"),
    ("Egypt Standard Time", "Africa/Cairo"),
    ("South Africa Standard Time", "Africa/Johannesburg"),
    ("Turkey Standard Time", "Europe/Istanbul"),
    ("Russian Standard Time", "Europe/Moscow"),
    ("Arab Standard Time", "Asia/Riyadh"),
    ("Arabian Standard Time", "Asia/Dubai"),
    ("Iran Standard Time", "Asia/Tehran"),
    ("Pakistan Standard Time", "Asia/Karachi"),
    ("India Standard Time", "Asia/Calcutta"),
    ("Nepal Standard Time", "Asia/Katmandu"),
    ("Bangladesh Standard Time", "Asia/Dhaka"),
    ("SE Asia Standard Time", "Asia/Bangkok"),
    ("China Standard Time", "Asia/Shanghai"),
    ("Singapore Standard Time", "Asia/Singapore"),
    ("Taipei Standard Time", "Asia/Taipei"),
    ("W. Australia Standard Time", "Australia/Perth"),
    ("Tokyo Standard Time", "Asia/Tokyo"),
    ("Korea Standard Time", "Asia/Seoul"),
    ("Cen. Australia Standard Time", "Australia/Adelaide"),
    ("AUS Eastern Standard Time", "Australia/Sydney"),
    ("E. Australia Standard Time", "Australia/Brisbane"),
    ("New Zealand Standard Time", "Pacific/Auckland"),
];

/// A zone by its IANA name, case and spacing forgiven.
pub fn iana(name: &str) -> Option<Tz> {
    let n = name.trim().trim_matches('"');
    n.parse::<Tz>().ok().or_else(|| n.replace(' ', "_").parse::<Tz>().ok())
}

/// What a TZID names: an IANA zone (also inside a longer id: `/mozilla.org/20050126_1/Europe/Madrid`), a Windows
/// name, else the calendar's VTIMEZONE of that id by its offsets.
pub fn resolve(tzid: &str, zones: &[Component]) -> Option<Zone> {
    if let Some(z) = iana(tzid) {
        return Some(Zone::Tz(z));
    }
    let t = tzid.trim().trim_matches('"');
    if let Some((_, z)) = WINDOWS.iter().find(|(w, _)| w.eq_ignore_ascii_case(t)) {
        return iana(z).map(Zone::Tz);
    }
    // the longest tail of the id that is a zone name ("…/Europe/Madrid", "(UTC+01:00) Amsterdam…" is not)
    let parts: Vec<&str> = t.split('/').collect();
    for i in 1..parts.len() {
        if let Some(z) = iana(&parts[i..].join("/")) {
            return Some(Zone::Tz(z));
        }
    }
    let vt = zones.iter().find(|z| z.text("TZID").is_some_and(|id| id.trim() == t))?;
    // a VTIMEZONE whose own name (X-LIC-LOCATION) is a zone, else its standard offset
    if let Some(z) = vt.text("X-LIC-LOCATION").and_then(|l| iana(&l)) {
        return Some(Zone::Tz(z));
    }
    let std = vt.subs.iter().find(|c| c.name == "STANDARD").or(vt.subs.first())?;
    let off = std.text("TZOFFSETTO").and_then(|o| offset(&o))?;
    // a fixed offset that is a whole number of hours with no DST is exactly an Etc/GMT zone
    Some(Zone::Fixed(off))
}

/// `-0500`, `+0530`, `+01:00` → an offset.
pub fn offset(s: &str) -> Option<FixedOffset> {
    let t = s.trim().replace(':', "");
    let (sign, rest) = match t.as_bytes().first()? {
        b'+' => (1, &t[1..]),
        b'-' => (-1, &t[1..]),
        _ => (1, t.as_str()),
    };
    if rest.len() < 4 {
        return None;
    }
    let h: i32 = rest[..2].parse().ok()?;
    let m: i32 = rest[2..4].parse().ok()?;
    let sec: i32 = rest.get(4..6).and_then(|x| x.parse().ok()).unwrap_or(0);
    FixedOffset::east_opt(sign * (h * 3600 + m * 60 + sec))
}

/// The user's zone: the one the page gives (`Intl…timeZone`), else `$TZ`, else `/etc/localtime`, else UTC.
pub fn user_zone(given: Option<&str>) -> Zone {
    if let Some(z) = given.and_then(iana) {
        return Zone::Tz(z);
    }
    if let Some(z) = std::env::var("TZ").ok().and_then(|t| iana(t.trim_start_matches(':'))) {
        return Zone::Tz(z);
    }
    if let Ok(target) = std::fs::read_link("/etc/localtime") {
        let t = target.to_string_lossy();
        if let Some(i) = t.find("zoneinfo/") {
            if let Some(z) = iana(&t[i + "zoneinfo/".len()..]) {
                return Zone::Tz(z);
            }
        }
    }
    Zone::UTC
}

fn utc_offset_line(name: &str, secs: i64) -> Line {
    let sign = if secs < 0 { '-' } else { '+' };
    let a = secs.abs();
    Line { name: name.into(), params: vec![], value: format!("{sign}{:02}{:02}", a / 3600, (a % 3600) / 60) }
}

fn total(z: &Tz, t: DateTime<Utc>) -> i64 {
    let o = z.offset_from_utc_datetime(&t.naive_utc());
    o.fix().local_minus_utc() as i64
}

/// The `n`th weekday of its month as RRULE's BYDAY (`2SU`, `-1SU` for the last).
fn byday(d: NaiveDate) -> String {
    let wd = match d.weekday() {
        Weekday::Mon => "MO",
        Weekday::Tue => "TU",
        Weekday::Wed => "WE",
        Weekday::Thu => "TH",
        Weekday::Fri => "FR",
        Weekday::Sat => "SA",
        Weekday::Sun => "SU",
    };
    let last = (d + Duration::days(7)).month() != d.month();
    if last && d.day() > 21 {
        format!("-1{wd}")
    } else {
        format!("{}{wd}", (d.day() - 1) / 7 + 1)
    }
}

/// A VTIMEZONE for `z` around `year`: its DST changes found hour by hour in that year and written as yearly rules
/// (the shape every calendar writes), or one STANDARD part for a zone without DST.
pub fn vtimezone(z: Tz, year: i32) -> Component {
    let mut parts = Vec::new();
    let start = Utc.with_ymd_and_hms(year, 1, 1, 0, 0, 0).single().unwrap_or_else(Utc::now);
    let mut prev = total(&z, start);
    let mut t = start;
    let end = start + Duration::days(366);
    while t < end && parts.len() < 2 {
        let next = t + Duration::hours(1);
        let now = total(&z, next);
        if now != prev {
            // the exact minute of the change
            let mut m = t;
            while total(&z, m) == prev {
                m += Duration::minutes(15);
            }
            let dst = z.offset_from_utc_datetime(&m.naive_utc()).dst_offset().num_seconds() != 0;
            let local = (m + Duration::seconds(prev)).naive_utc();
            parts.push(Component {
                name: if dst { "DAYLIGHT" } else { "STANDARD" }.into(),
                props: vec![
                    Line { name: "DTSTART".into(), params: vec![], value: local.format("%Y%m%dT%H%M%S").to_string() },
                    utc_offset_line("TZOFFSETFROM", prev),
                    utc_offset_line("TZOFFSETTO", now),
                    Line {
                        name: "RRULE".into(),
                        params: vec![],
                        value: format!("FREQ=YEARLY;BYMONTH={};BYDAY={}", local.month(), byday(local.date())),
                    },
                ],
                subs: vec![],
            });
            prev = now;
        }
        t = next;
    }
    if parts.is_empty() {
        let o = total(&z, start);
        parts.push(Component {
            name: "STANDARD".into(),
            props: vec![
                Line { name: "DTSTART".into(), params: vec![], value: "19700101T000000".into() },
                utc_offset_line("TZOFFSETFROM", o),
                utc_offset_line("TZOFFSETTO", o),
            ],
            subs: vec![],
        });
    }
    Component {
        name: "VTIMEZONE".into(),
        props: vec![Line { name: "TZID".into(), params: vec![], value: z.name().into() }],
        subs: parts,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tzids_resolve_whatever_wrote_them() {
        assert_eq!(resolve("Europe/Madrid", &[]), Some(Zone::Tz(Tz::Europe__Madrid)));
        assert_eq!(resolve("Eastern Standard Time", &[]), Some(Zone::Tz(Tz::America__New_York)));
        assert_eq!(resolve("/mozilla.org/20050126_1/Europe/Paris", &[]), Some(Zone::Tz(Tz::Europe__Paris)));
        let vt = crate::ics::parse("BEGIN:VTIMEZONE\r\nTZID:Custom Zone\r\nBEGIN:STANDARD\r\nDTSTART:16010101T020000\r\nTZOFFSETFROM:-0400\r\nTZOFFSETTO:-0500\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n").unwrap();
        assert_eq!(resolve("Custom Zone", &vt), Some(Zone::Fixed(FixedOffset::west_opt(5 * 3600).unwrap())));
        assert_eq!(resolve("Nowhere", &[]), None);
        assert_eq!(offset("+0530"), FixedOffset::east_opt(5 * 3600 + 1800));
    }

    #[test]
    fn wall_clock_times_become_instants_across_dst() {
        let z = Zone::Tz(Tz::America__Toronto);
        let t = |s: &str| NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").unwrap();
        assert_eq!(z.rfc3339(z.instant(t("2026-07-01 10:00"))), "2026-07-01T10:00:00-04:00");
        assert_eq!(z.rfc3339(z.instant(t("2026-12-01 10:00"))), "2026-12-01T10:00:00-05:00");
        // 2026-03-08 02:30 does not exist in Toronto: the hour after it
        assert_eq!(z.rfc3339(z.instant(t("2026-03-08 02:30"))), "2026-03-08T03:30:00-04:00");
    }

    #[test]
    fn a_vtimezone_is_written_with_the_zones_rules() {
        let vt = vtimezone(Tz::America__Toronto, 2026).write();
        assert!(vt.contains("TZID:America/Toronto"), "{vt}");
        assert!(vt.contains("BEGIN:DAYLIGHT\r\nDTSTART:20260308T020000\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0400\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU"), "{vt}");
        assert!(vt.contains("BEGIN:STANDARD\r\nDTSTART:20261101T020000\r\nTZOFFSETFROM:-0400\r\nTZOFFSETTO:-0500\r\nRRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU"), "{vt}");
        let madrid = vtimezone(Tz::Europe__Madrid, 2026).write();
        assert!(madrid.contains("BYMONTH=3;BYDAY=-1SU") && madrid.contains("BYMONTH=10;BYDAY=-1SU"), "{madrid}");
        assert!(vtimezone(Tz::Asia__Tokyo, 2026).write().contains("TZOFFSETTO:+0900"));
    }
}
