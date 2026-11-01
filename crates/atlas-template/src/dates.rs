//! # Date parsing & formatting
//!
//! Bases formulas and the daily-note path need to (a) read the many date shapes
//! Obsidian writes (`2026-06-04`, `2026-06-04T05:00:00.000Z`, …) and (b) format a
//! date with moment.js-style tokens (`YYYY-MM-DD dddd`). This module does both,
//! using the `chrono` crate for the calendar arithmetic.
//!
//! `NaiveDateTime` is chrono's "a date+time with no timezone attached". We use it
//! everywhere because Obsidian's day-granularity comparisons don't need zones.
//!
//! **Locale**: month/day *names* follow `editor.date_names` (Atlas: set per
//! evaluation by `bases::evaluate`; obsidian-web set it once from `--locale`).

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime, Timelike};

/// Try to parse the common date shapes that show up in Obsidian frontmatter.
pub fn parse(s: &str) -> Option<NaiveDateTime> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    // ISO-8601 / RFC 3339 with timezone, e.g. "2026-05-23T05:04:46.000Z" or
    // "...+02:00". Normalised to naive UTC (we only need day granularity).
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(dt.naive_utc());
    }
    // A trailing "Z" without other tz info — strip and parse as naive.
    if let Some(stripped) = s.strip_suffix('Z') {
        for f in ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"] {
            if let Ok(dt) = NaiveDateTime::parse_from_str(stripped, f) {
                return Some(dt);
            }
        }
    }
    const DT: &[&str] = &[
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y/%m/%d %H:%M",
    ];
    for f in DT {
        if let Ok(dt) = NaiveDateTime::parse_from_str(s, f) {
            return Some(dt);
        }
    }
    const D: &[&str] = &["%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y", "%m/%d/%Y"];
    for f in D {
        if let Ok(d) = NaiveDate::parse_from_str(s, f) {
            return Some(d.and_time(NaiveTime::from_hms_opt(0, 0, 0).unwrap()));
        }
    }
    None
}

/// `dt` moved by a length written as Obsidian's Bases write it (`date + "1 month"`, `now() - "2w"`), `sign` 1 or -1:
/// a count and a unit, apart or together — `y`/`year`, `M`/`month`, `w`/`week`, `d`/`day`, `h`/`hour`, `m`/`minute`,
/// `s`/`second` (the one-letter forms by their case: `M` months, `m` minutes; the words in any case and number); a bare
/// count is days. Months and years move on the calendar (January 31st plus a month is February's last day). None:
/// not a length.
pub fn shift(dt: NaiveDateTime, s: &str, sign: i64) -> Option<NaiveDateTime> {
    let s = s.trim();
    let split = s.char_indices().skip(1).find(|(_, c)| !c.is_ascii_digit()).map_or(s.len(), |(i, _)| i);
    let n: i64 = s[..split].parse().ok()?;
    let unit = s[split..].trim();
    let n = n.checked_mul(sign)?;
    enum U { Months(i64), Span(Duration) }
    let u = match unit {
        "M" => U::Months(n),
        "m" => U::Span(Duration::try_minutes(n)?),
        "" => U::Span(Duration::try_days(n)?),
        _ => match unit.to_lowercase().trim_end_matches('s') {
            "y" | "year" | "yr" => U::Months(n.checked_mul(12)?),
            "month" | "mo" => U::Months(n),
            "w" | "week" | "wk" => U::Span(Duration::try_weeks(n)?),
            "d" | "day" => U::Span(Duration::try_days(n)?),
            "h" | "hour" | "hr" => U::Span(Duration::try_hours(n)?),
            "minute" | "min" => U::Span(Duration::try_minutes(n)?),
            "" | "second" | "sec" => U::Span(Duration::try_seconds(n)?), // `s` alone trims to ""
            _ => return None,
        },
    };
    match u {
        U::Months(m) if m >= 0 => dt.checked_add_months(chrono::Months::new(u32::try_from(m).ok()?)),
        U::Months(m) => dt.checked_sub_months(chrono::Months::new(u32::try_from(-m).ok()?)),
        U::Span(d) => dt.checked_add_signed(d),
    }
}

/// Format a datetime using a subset of moment.js tokens.
pub fn format(dt: &NaiveDateTime, fmt: &str) -> String {
    let mut out = String::new();
    let bytes: Vec<char> = fmt.chars().collect();
    let mut i = 0;
    // Longest tokens first so YYYY beats YY, etc.
    const TOKENS: &[&str] = &[
        "YYYY", "YY", "MMMM", "MMM", "MM", "M", "DD", "D", "dddd", "ddd", "WW", "W", "ww", "w", "HH", "H", "hh", "h",
        "mm", "m", "ss", "s", "A", "a",
    ];
    'outer: while i < bytes.len() {
        // escaped literals inside [ ... ]
        if bytes[i] == '[' {
            i += 1;
            while i < bytes.len() && bytes[i] != ']' {
                out.push(bytes[i]);
                i += 1;
            }
            i += 1;
            continue;
        }
        let rest: String = bytes[i..].iter().collect();
        for tok in TOKENS {
            if rest.starts_with(tok) {
                out.push_str(&render_token(dt, tok));
                i += tok.len();
                continue 'outer;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    out
}

use std::cell::Cell;
thread_local!(static LOCALE_ES: Cell<bool> = const { Cell::new(false) });

/// Spanish (`true`) or English month/day names for [`format`] on this thread until the guard drops. Per thread and
/// scoped, not process-wide: one core serving an English and a Spanish vault must not flip the other's names.
#[must_use = "the names hold only while the guard lives"]
pub fn names(es: bool) -> NamesGuard {
    NamesGuard(LOCALE_ES.with(|c| c.replace(es)))
}

/// Restores the names that held before [`names`].
pub struct NamesGuard(bool);

impl Drop for NamesGuard {
    fn drop(&mut self) {
        LOCALE_ES.with(|c| c.set(self.0));
    }
}

pub fn spanish_locale() -> bool {
    LOCALE_ES.with(Cell::get)
}

fn render_token(dt: &NaiveDateTime, tok: &str) -> String {
    const MON_EN: [&str; 12] = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    const DOW_EN: [&str; 7] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    // Spanish (moment "es"): lowercase, abbreviations carry a trailing period.
    const MON_ES: [&str; 12] = [
        "enero",
        "febrero",
        "marzo",
        "abril",
        "mayo",
        "junio",
        "julio",
        "agosto",
        "septiembre",
        "octubre",
        "noviembre",
        "diciembre",
    ];
    const MON_ES_SHORT: [&str; 12] =
        ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."];
    const DOW_ES: [&str; 7] = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
    const DOW_ES_SHORT: [&str; 7] = ["lun.", "mar.", "mié.", "jue.", "vie.", "sáb.", "dom."];
    let es = spanish_locale();
    let mon = if es { MON_ES } else { MON_EN };
    let dow = if es { DOW_ES } else { DOW_EN };
    let dow_i = dt.weekday().num_days_from_monday() as usize;
    let mon_i = dt.month0() as usize;
    let h12 = {
        let h = dt.hour() % 12;
        if h == 0 {
            12
        } else {
            h
        }
    };
    match tok {
        "YYYY" => format!("{:04}", dt.year()),
        "YY" => format!("{:02}", dt.year() % 100),
        "MMMM" => mon[mon_i].to_string(),
        "MMM" => {
            if es {
                MON_ES_SHORT[mon_i].to_string()
            } else {
                MON_EN[mon_i][..3].to_string()
            }
        }
        "MM" => format!("{:02}", dt.month()),
        "M" => dt.month().to_string(),
        "DD" => format!("{:02}", dt.day()),
        "D" => dt.day().to_string(),
        "dddd" => dow[dow_i].to_string(),
        "ddd" => {
            if es {
                DOW_ES_SHORT[dow_i].to_string()
            } else {
                DOW_EN[dow_i][..3].to_string()
            }
        }
        // ISO-8601 week of year (matches Obsidian's W/WW; also used for w/ww)
        "WW" | "ww" => format!("{:02}", dt.iso_week().week()),
        "W" | "w" => dt.iso_week().week().to_string(),
        "HH" => format!("{:02}", dt.hour()),
        "H" => dt.hour().to_string(),
        "hh" => format!("{:02}", h12),
        "h" => h12.to_string(),
        "mm" => format!("{:02}", dt.minute()),
        "m" => dt.minute().to_string(),
        "ss" => format!("{:02}", dt.second()),
        "s" => dt.second().to_string(),
        "A" => if dt.hour() < 12 { "AM" } else { "PM" }.to_string(),
        "a" => if dt.hour() < 12 { "am" } else { "pm" }.to_string(),
        _ => tok.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dt(s: &str) -> NaiveDateTime {
        parse(s).unwrap()
    }

    #[test]
    fn parses_common_shapes() {
        assert_eq!(parse("2026-06-04").unwrap().date(), NaiveDate::from_ymd_opt(2026, 6, 4).unwrap());
        assert_eq!(parse("2026-06-04T10:30:00Z").unwrap().date(), NaiveDate::from_ymd_opt(2026, 6, 4).unwrap());
        assert_eq!(parse("2026/06/04 10:30").unwrap().hour(), 10);
        assert!(parse("").is_none());
        assert!(parse("not a date").is_none());
    }

    #[test]
    fn shifts_on_the_calendar() {
        let at = |s: &str| parse(s).unwrap();
        let day = |d: Option<NaiveDateTime>| d.map(|d| d.format("%Y-%m-%d %H:%M").to_string());
        assert_eq!(day(shift(at("2026-01-31"), "1 month", 1)).as_deref(), Some("2026-02-28 00:00"), "the month's last day");
        assert_eq!(day(shift(at("2026-03-31"), "1M", -1)).as_deref(), Some("2026-02-28 00:00"));
        assert_eq!(day(shift(at("2024-02-29"), "1y", 1)).as_deref(), Some("2025-02-28 00:00"));
        assert_eq!(day(shift(at("2026-01-01"), "2w", 1)).as_deref(), Some("2026-01-15 00:00"));
        assert_eq!(day(shift(at("2026-01-01 10:00"), "30m", 1)).as_deref(), Some("2026-01-01 10:30"), "m: minutes");
        assert_eq!(day(shift(at("2026-01-01"), "3 Days", 1)).as_deref(), Some("2026-01-04 00:00"));
        assert_eq!(day(shift(at("2026-01-01"), "5", -1)).as_deref(), Some("2025-12-27 00:00"), "a bare count is days");
        assert_eq!(day(shift(at("2026-01-01 00:00"), "10s", 1)).as_deref(), Some("2026-01-01 00:00"));
        assert_eq!(shift(at("2026-01-01"), "1 fortnight", 1), None);
        assert_eq!(shift(at("2026-01-01"), "x", 1), None);
        assert_eq!(shift(at("2026-01-01"), "99999999999 years", 1), None, "too far: no panic");
    }

    #[test]
    fn formats_tokens_longest_first() {
        // YYYY must beat YY; MMMM beats MM, etc.
        let d = dt("2026-06-04T09:05:07");
        assert_eq!(format(&d, "YYYY-MM-DD"), "2026-06-04");
        assert_eq!(format(&d, "HH:mm:ss"), "09:05:07");
        // bracketed literals pass through untouched
        assert_eq!(format(&d, "[year] YYYY"), "year 2026");
    }

    #[test]
    fn twelve_hour_and_meridiem() {
        let midnight = dt("2026-06-04T00:30:00");
        assert_eq!(format(&midnight, "h:mm a"), "12:30 am");
        let noon = dt("2026-06-04T12:00:00");
        assert_eq!(format(&noon, "h A"), "12 PM");
    }
}
