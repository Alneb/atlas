//! A calendar object's events as the instances a range shows (RFC 5545 §3.8.5): RRULE (the `rrule` crate), RDATE,
//! EXDATE and RECURRENCE-ID overrides, every time in its own zone and every instance said in the user's zone.
//!
//! A recurrence is computed in its master's *frame*: dates for an all-day event, wall-clock times for a floating one,
//! wall-clock times of its TZID otherwise — so a weekly 10:00 meeting stays at 10:00 across DST.
use crate::ics::{unescape, Component, Line};
use crate::zone::{self, Zone};
use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};
use serde::Serialize;

/// A date-time property as written.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Stamp {
    Day(NaiveDate),
    /// no zone: the same wall-clock hour wherever the user is
    Floating(NaiveDateTime),
    /// an instant, and the zone it was written in (UTC for `Z`)
    At(DateTime<Utc>, Zone),
}

/// Where a recurrence is counted.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Frame {
    Day,
    Floating,
    Zoned(Zone),
}

/// One value (`20261104T100000`, `…Z`, `20261104`) with the line's TZID.
pub fn stamp_value(value: &str, tzid: Option<&str>, zones: &[Component]) -> Option<Stamp> {
    let v = value.trim();
    if v.len() == 8 {
        return NaiveDate::parse_from_str(v, "%Y%m%d").ok().map(Stamp::Day);
    }
    if let Some(z) = v.strip_suffix('Z').or_else(|| v.strip_suffix('z')) {
        return NaiveDateTime::parse_from_str(z, "%Y%m%dT%H%M%S").ok().map(|t| Stamp::At(t.and_utc(), Zone::UTC));
    }
    let t = NaiveDateTime::parse_from_str(v, "%Y%m%dT%H%M%S")
        .or_else(|_| NaiveDateTime::parse_from_str(v, "%Y%m%dT%H%M"))
        .ok()?;
    match tzid.and_then(|id| zone::resolve(id, zones)) {
        Some(z) => Some(Stamp::At(z.instant(t), z)),
        None => {
            if let Some(id) = tzid {
                eprintln!("dav: unknown time zone {id:?}: {v} read as wall-clock time");
            }
            Some(Stamp::Floating(t))
        }
    }
}

pub fn stamp(line: &Line, zones: &[Component]) -> Option<Stamp> {
    stamp_value(&line.value, line.param("TZID"), zones)
}

/// Every value of a list property (`EXDATE:a,b`, several lines).
fn stamps(ev: &Component, name: &str, zones: &[Component]) -> Vec<Stamp> {
    ev.props
        .iter()
        .filter(|l| l.name == name)
        .flat_map(|l| {
            l.value
                .split(',')
                // a PERIOD's start (RDATE;VALUE=PERIOD:start/end)
                .filter_map(|v| stamp_value(v.split('/').next().unwrap_or(v), l.param("TZID"), zones))
                .collect::<Vec<_>>()
        })
        .collect()
}

impl Frame {
    pub fn of(s: Stamp) -> Frame {
        match s {
            Stamp::Day(_) => Frame::Day,
            Stamp::Floating(_) => Frame::Floating,
            Stamp::At(_, z) => Frame::Zoned(z),
        }
    }

    /// A stamp as this frame's wall-clock time.
    pub fn naive(&self, s: Stamp) -> NaiveDateTime {
        match (self, s) {
            (_, Stamp::Day(d)) => d.and_hms_opt(0, 0, 0).unwrap_or_default(),
            (_, Stamp::Floating(t)) => t,
            (Frame::Zoned(z), Stamp::At(t, _)) => z.wall(t),
            (_, Stamp::At(t, z)) => z.wall(t),
        }
    }

    /// A wall-clock time of this frame as an instant (floating: in the user's zone).
    pub fn instant(&self, t: NaiveDateTime, user: &Zone) -> DateTime<Utc> {
        match self {
            Frame::Zoned(z) => z.instant(t),
            _ => user.instant(t),
        }
    }

    /// RECURRENCE-ID / EXDATE as this frame writes it: (params, value).
    pub fn write(&self, t: NaiveDateTime) -> (Vec<(String, String)>, String) {
        match self {
            Frame::Day => (vec![("VALUE".into(), "DATE".into())], t.format("%Y%m%d").to_string()),
            Frame::Floating => (vec![], t.format("%Y%m%dT%H%M%S").to_string()),
            Frame::Zoned(z) if *z == Zone::UTC => (vec![], t.format("%Y%m%dT%H%M%SZ").to_string()),
            Frame::Zoned(z) => (vec![("TZID".into(), z.name())], t.format("%Y%m%dT%H%M%S").to_string()),
        }
    }
}

/// `PT1H30M`, `P1D`, `-PT15M`, `P2W` → a duration.
pub fn duration(s: &str) -> Option<Duration> {
    let t = s.trim();
    let (neg, t) = match t.strip_prefix('-') {
        Some(r) => (true, r),
        None => (false, t.strip_prefix('+').unwrap_or(t)),
    };
    let t = t.strip_prefix('P')?;
    let (mut total, mut num, mut in_time) = (Duration::zero(), String::new(), false);
    for c in t.chars() {
        match c {
            'T' => in_time = true,
            '0'..='9' => num.push(c),
            u => {
                let n: i64 = num.parse().ok()?;
                num.clear();
                total += match (u, in_time) {
                    ('W', _) => Duration::weeks(n),
                    ('D', _) => Duration::days(n),
                    ('H', true) => Duration::hours(n),
                    ('M', true) => Duration::minutes(n),
                    ('S', true) => Duration::seconds(n),
                    _ => return None,
                };
            }
        }
    }
    Some(if neg { -total } else { total })
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Person {
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub partstat: Option<String>,
}

fn person(l: &Line) -> Person {
    let v = l.value.trim();
    let email = v.strip_prefix("mailto:").or_else(|| v.strip_prefix("MAILTO:")).unwrap_or(v).to_string();
    Person { email, name: l.param("CN").map(str::to_string), partstat: l.param("PARTSTAT").map(str::to_ascii_uppercase) }
}

/// One occurrence as the pane and the tools see it, in the user's zone.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Instance {
    pub uid: String,
    /// the occurrence's RECURRENCE-ID value (its original start in the master's frame); None for a single event
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rid: Option<String>,
    pub summary: String,
    /// `2026-11-04` for an all-day event, else `2026-11-04T10:00:00-05:00` in the user's zone
    pub start: String,
    /// exclusive: an all-day event's is the day after its last
    pub end: String,
    pub all_day: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub recurring: bool,
    /// the master's RRULE (the editor's "repeat")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rrule: Option<String>,
    /// the note or mail it came from (X-ATLAS-SOURCE)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    /// TRANSP:TRANSPARENT — does not make the user busy
    pub free: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub organizer: Option<Person>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub attendees: Vec<Person>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// the zone its times were written in (shown when it differs from the user's)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tzid: Option<String>,
    /// for ordering and overlap: the instants (an all-day event's midnights in the user's zone)
    #[serde(skip)]
    pub from: i64,
    #[serde(skip)]
    pub to: i64,
}

/// The range asked for, as instants.
#[derive(Debug, Clone, Copy)]
pub struct Range {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
}

impl Range {
    /// Whole days `from..=to` in the user's zone.
    pub fn days(from: NaiveDate, to: NaiveDate, user: &Zone) -> Range {
        let at = |d: NaiveDate| user.instant(d.and_hms_opt(0, 0, 0).unwrap_or_default());
        Range { from: at(from), to: at(to + Duration::days(1)) }
    }
}

struct Times {
    start: Stamp,
    /// DTEND, or DTSTART + DURATION; None: zero length (a timed one) or one day (a date)
    end: Option<Stamp>,
    dur: Option<Duration>,
}

fn times(ev: &Component, zones: &[Component]) -> Option<Times> {
    let start = stamp(ev.prop("DTSTART")?, zones)?;
    let end = ev.prop("DTEND").and_then(|l| stamp(l, zones));
    let dur = ev.prop("DURATION").and_then(|l| duration(&l.value));
    Some(Times { start, end, dur })
}

/// An occurrence's instants (timed) or dates (all-day), from its start in the frame and the master's length.
fn place(frame: Frame, at: NaiveDateTime, len: Duration, user: &Zone) -> (Option<(NaiveDate, NaiveDate)>, DateTime<Utc>, DateTime<Utc>) {
    match frame {
        Frame::Day => {
            let d = at.date();
            let days = len.num_days().max(1);
            let e = d + Duration::days(days);
            let midnight = |x: NaiveDate| user.instant(x.and_hms_opt(0, 0, 0).unwrap_or_default());
            (Some((d, e)), midnight(d), midnight(e))
        }
        f => {
            let s = f.instant(at, user);
            (None, s, s + len)
        }
    }
}

/// The master's length: exact for timed events, in days for dates.
fn length(t: &Times, frame: Frame, user: &Zone) -> Duration {
    if let Some(d) = t.dur {
        return d.max(Duration::zero());
    }
    match (frame, t.end) {
        (Frame::Day, Some(e)) => {
            let days = (frame.naive(e).date() - frame.naive(t.start).date()).num_days();
            Duration::days(days.max(1))
        }
        (Frame::Day, None) => Duration::days(1),
        (_, Some(e)) => {
            let s = frame.instant(frame.naive(t.start), user);
            let e = match e {
                Stamp::At(x, _) => x,
                other => frame.instant(frame.naive(other), user),
            };
            (e - s).max(Duration::zero())
        }
        (_, None) => Duration::zero(),
    }
}

fn instance(ev: &Component, rid: Option<String>, dates: Option<(NaiveDate, NaiveDate)>, s: DateTime<Utc>, e: DateTime<Utc>, master: &Component, user: &Zone) -> Instance {
    let text = |name: &str| ev.text(name).or_else(|| master.text(name));
    let (start, end) = match dates {
        Some((a, b)) => (a.format("%Y-%m-%d").to_string(), b.format("%Y-%m-%d").to_string()),
        None => (user.rfc3339(s), user.rfc3339(e)),
    };
    let rrule = master.prop("RRULE").map(|l| l.value.clone());
    Instance {
        uid: ev.text("UID").unwrap_or_default(),
        recurring: rid.is_some(),
        rid,
        summary: ev.text("SUMMARY").or_else(|| master.text("SUMMARY")).unwrap_or_default(),
        start,
        end,
        all_day: dates.is_some(),
        location: text("LOCATION"),
        description: text("DESCRIPTION"),
        rrule,
        source: text("X-ATLAS-SOURCE"),
        status: text("STATUS").map(|s| s.to_ascii_uppercase()),
        free: text("TRANSP").is_some_and(|t| t.eq_ignore_ascii_case("TRANSPARENT")),
        organizer: ev.prop("ORGANIZER").or(master.prop("ORGANIZER")).map(person),
        attendees: {
            let own: Vec<Person> = ev.props.iter().filter(|l| l.name == "ATTENDEE").map(person).collect();
            if own.is_empty() { master.props.iter().filter(|l| l.name == "ATTENDEE").map(person).collect() } else { own }
        },
        url: text("URL"),
        tzid: ev.prop("DTSTART").and_then(|l| l.param("TZID")).map(str::to_string),
        from: s.timestamp(),
        to: e.timestamp(),
    }
}

/// The occurrences' starts (in the frame) of a master's RRULE / RDATE within `lo..=hi`, DTSTART first.
fn starts(master: &Component, frame: Frame, first: NaiveDateTime, lo: NaiveDateTime, hi: NaiveDateTime, zones: &[Component]) -> Vec<NaiveDateTime> {
    let mut out: Vec<NaiveDateTime> = Vec::new();
    if first >= lo && first <= hi {
        out.push(first);
    }
    // the rule is counted in the frame's wall clock: a real zone where there is one, else UTC standing in for it
    let rtz: rrule::Tz = match frame {
        Frame::Zoned(Zone::Tz(z)) => z.into(),
        _ => rrule::Tz::UTC,
    };
    let at = |t: NaiveDateTime| rtz.from_local_datetime(&t).earliest();
    for line in master.props.iter().filter(|l| l.name == "RRULE") {
        // UNTIL is applied by hand: the crate wants it in UTC, calendars write it as a date or a floating time too
        let mut until = None;
        let rule: String = line
            .value
            .split(';')
            .filter(|part| {
                if let Some(v) = part.strip_prefix("UNTIL=") {
                    until = stamp_value(v, None, zones).map(|s| match s {
                        Stamp::Day(d) => d.and_hms_opt(23, 59, 59).unwrap_or_default(),
                        other => frame.naive(other),
                    });
                    false
                } else {
                    !part.is_empty()
                }
            })
            .collect::<Vec<_>>()
            .join(";");
        if until.is_some_and(|u| u < first) {
            continue;
        }
        let parsed: Result<rrule::RRule<rrule::Unvalidated>, _> = rule.parse();
        let (Ok(mut r), Some(start)) = (parsed, at(first)) else {
            eprintln!("dav: RRULE {:?} could not be read; the event is shown once", line.value);
            continue;
        };
        if let Some(u) = until.and_then(at) {
            r = r.until(u.with_timezone(&rrule::Tz::UTC));
        }
        let (Some(a), Some(b)) = (at(lo), at(hi)) else { continue };
        match r.build(start) {
            Ok(set) => {
                let got = set.after(a).before(b).all(u16::MAX);
                out.extend(got.dates.iter().map(|d| d.naive_local()));
            }
            Err(e) => eprintln!("dav: RRULE {:?}: {e}; the event is shown once", line.value),
        }
    }
    for s in stamps(master, "RDATE", zones) {
        let t = frame.naive(s);
        if t >= lo && t <= hi {
            out.push(t);
        }
    }
    out.sort();
    out.dedup();
    out
}

/// The instances of one calendar object's events that overlap `range`, said in `user`'s zone; cancelled
/// occurrences left out.
pub fn expand(cal: &Component, range: Range, user: &Zone) -> Vec<Instance> {
    let zones: Vec<Component> = cal.subs.iter().filter(|c| c.name == "VTIMEZONE").cloned().collect();
    let events: Vec<&Component> = cal.subs.iter().filter(|c| c.name == "VEVENT").collect();
    let mut out = Vec::new();
    let overlaps = |s: DateTime<Utc>, e: DateTime<Utc>| {
        if e > s { s < range.to && e > range.from } else { s >= range.from && s < range.to }
    };
    let mut uids: Vec<String> = events.iter().filter_map(|e| e.text("UID")).collect();
    uids.dedup();
    if uids.is_empty() {
        uids.push(String::new());
    }
    for uid in uids {
        let same: Vec<&Component> = events.iter().filter(|e| e.text("UID").unwrap_or_default() == uid).copied().collect();
        let master = same.iter().find(|e| e.prop("RECURRENCE-ID").is_none()).copied();
        let overrides: Vec<&Component> = same.iter().filter(|e| e.prop("RECURRENCE-ID").is_some()).copied().collect();
        let Some(master) = master else {
            // overrides alone (an invite for one occurrence): each on its own
            for o in overrides {
                let Some(t) = times(o, &zones) else { continue };
                let f = Frame::of(t.start);
                let (dates, s, e) = place(f, f.naive(t.start), length(&t, f, user), user);
                if overlaps(s, e) && !cancelled(o) {
                    let rid = o.prop("RECURRENCE-ID").and_then(|l| stamp(l, &zones)).map(|r| f.write(f.naive(r)).1);
                    out.push(instance(o, rid, dates, s, e, o, user));
                }
            }
            continue;
        };
        let Some(t) = times(master, &zones) else { continue };
        let frame = Frame::of(t.start);
        let first = frame.naive(t.start);
        let len = length(&t, frame, user);
        let repeats = master.prop("RRULE").is_some() || master.prop("RDATE").is_some();
        if !repeats {
            let (dates, s, e) = place(frame, first, len, user);
            if overlaps(s, e) && !cancelled(master) {
                out.push(instance(master, None, dates, s, e, master, user));
            }
            continue;
        }
        let rid_of = |o: &Component| o.prop("RECURRENCE-ID").and_then(|l| stamp(l, &zones)).map(|r| frame.naive(r));
        let moved: Vec<NaiveDateTime> = overrides.iter().filter_map(|o| rid_of(o)).collect();
        let ex = stamps(master, "EXDATE", &zones);
        let excluded = |t: NaiveDateTime| {
            ex.iter().any(|x| match x {
                // a date EXDATE on a timed series takes out that day's occurrence
                Stamp::Day(d) => t.date() == *d,
                other => frame.naive(*other) == t,
            })
        };
        // the window in the frame, widened by the length and a day for the zones in between
        let margin = len + Duration::days(1);
        let lo = user.wall(range.from) - margin;
        let hi = user.wall(range.to) + Duration::days(1);
        for at in starts(master, frame, first, lo, hi, &zones) {
            if excluded(at) || moved.contains(&at) {
                continue;
            }
            let (dates, s, e) = place(frame, at, len, user);
            if overlaps(s, e) && !cancelled(master) {
                out.push(instance(master, Some(frame.write(at).1), dates, s, e, master, user));
            }
        }
        for o in overrides {
            let Some(ot) = times(o, &zones) else { continue };
            let of = Frame::of(ot.start);
            let olen = if ot.end.is_some() || ot.dur.is_some() { length(&ot, of, user) } else { len };
            let (dates, s, e) = place(of, of.naive(ot.start), olen, user);
            if overlaps(s, e) && !cancelled(o) {
                let rid = rid_of(o).map(|r| frame.write(r).1);
                let mut i = instance(o, rid, dates, s, e, master, user);
                i.recurring = true;
                out.push(i);
            }
        }
    }
    out.sort_by(|a, b| (a.from, a.to, &a.summary).cmp(&(b.from, b.to, &b.summary)));
    out
}

fn cancelled(ev: &Component) -> bool {
    ev.text("STATUS").is_some_and(|s| s.eq_ignore_ascii_case("CANCELLED"))
}

/// A bound on when an object's events happen, for the cache's range query: (first start, last end), None for no end.
pub fn bounds(cal: &Component, user: &Zone) -> (i64, Option<i64>) {
    let zones: Vec<Component> = cal.subs.iter().filter(|c| c.name == "VTIMEZONE").cloned().collect();
    let (mut lo, mut hi): (Option<i64>, Option<i64>) = (None, Some(i64::MIN));
    let day = 86_400;
    for ev in cal.subs.iter().filter(|c| c.name == "VEVENT") {
        let Some(t) = times(ev, &zones) else { continue };
        let f = Frame::of(t.start);
        let s = f.instant(f.naive(t.start), user).timestamp();
        let len = length(&t, f, user).num_seconds();
        lo = Some(lo.map_or(s, |x| x.min(s)));
        // a recurrence's end: its UNTIL, else none (COUNT is counted at query time)
        let end = match ev.prop("RRULE") {
            None => Some(s + len),
            Some(r) => r
                .value
                .split(';')
                .find_map(|p| p.strip_prefix("UNTIL="))
                .and_then(|u| stamp_value(u, None, &zones))
                .map(|u| f.instant(f.naive(u), user).timestamp() + len + day),
        };
        let rdates = stamps(ev, "RDATE", &zones).iter().map(|r| f.instant(f.naive(*r), user).timestamp() + len).max();
        hi = match (hi, end) {
            (Some(h), Some(e)) => Some(h.max(e).max(rdates.unwrap_or(i64::MIN))),
            _ => None,
        };
    }
    if lo.is_none() {
        return (0, Some(0)); // no event in it (a to-do): never in a range
    }
    // a day of slack for floating times read in another zone
    (lo.unwrap_or(0) - day, hi.filter(|h| *h != i64::MIN).map(|h| h + day))
}

/// Text of a property, unescaped (for search).
pub fn texts(cal: &Component, name: &str) -> String {
    cal.subs
        .iter()
        .filter(|c| c.name == "VEVENT")
        .flat_map(|e| e.props.iter().filter(|l| l.name == name).map(|l| unescape(&l.value)))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ics;
    use chrono_tz::Tz;

    fn cal(body: &str) -> Component {
        let text = format!("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n{}END:VCALENDAR\r\n", body.replace('\n', "\r\n"));
        ics::parse(&text).unwrap().remove(0)
    }
    fn days(a: &str, b: &str, z: &Zone) -> Range {
        Range::days(NaiveDate::parse_from_str(a, "%Y-%m-%d").unwrap(), NaiveDate::parse_from_str(b, "%Y-%m-%d").unwrap(), z)
    }
    const TORONTO: Zone = Zone::Tz(Tz::America__Toronto);

    #[test]
    fn a_weekly_meeting_keeps_its_hour_across_dst_with_exdate_and_an_override() {
        let c = cal("BEGIN:VEVENT\nUID:w1\nSUMMARY:Group meeting\nDTSTART;TZID=America/Toronto:20261021T100000\nDTEND;TZID=America/Toronto:20261021T113000\nRRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=6\nEXDATE;TZID=America/Toronto:20261028T100000\nEND:VEVENT\nBEGIN:VEVENT\nUID:w1\nRECURRENCE-ID;TZID=America/Toronto:20261111T100000\nSUMMARY:Group meeting (room 2)\nDTSTART;TZID=America/Toronto:20261111T140000\nDTEND;TZID=America/Toronto:20261111T150000\nEND:VEVENT\n");
        let got = expand(&c, days("2026-10-01", "2026-12-31", &TORONTO), &TORONTO);
        let starts: Vec<&str> = got.iter().map(|i| i.start.as_str()).collect();
        assert_eq!(
            starts,
            [
                "2026-10-21T10:00:00-04:00",
                "2026-11-04T10:00:00-05:00", // DST ended on Nov 1: still 10:00
                "2026-11-11T14:00:00-05:00", // the override, moved
                "2026-11-18T10:00:00-05:00",
                "2026-11-25T10:00:00-05:00",
            ]
        );
        assert_eq!(got[1].end, "2026-11-04T11:30:00-05:00");
        assert_eq!(got[2].summary, "Group meeting (room 2)");
        assert_eq!(got[2].rid.as_deref(), Some("20261111T100000"));
        assert!(got.iter().all(|i| i.recurring));
        // the same series seen from Madrid: the instants, in Madrid's hours
        let madrid = Zone::Tz(Tz::Europe__Madrid);
        let m = expand(&c, days("2026-10-21", "2026-10-21", &madrid), &madrid);
        assert_eq!(m[0].start, "2026-10-21T16:00:00+02:00");
    }

    #[test]
    fn all_day_and_floating_events_and_rdate() {
        let c = cal("BEGIN:VEVENT\nUID:d1\nSUMMARY:Conference\nDTSTART;VALUE=DATE:20261130\nDTEND;VALUE=DATE:20261203\nEND:VEVENT\n");
        let got = expand(&c, days("2026-12-02", "2026-12-02", &TORONTO), &TORONTO);
        assert_eq!((got[0].start.as_str(), got[0].end.as_str(), got[0].all_day), ("2026-11-30", "2026-12-03", true));
        assert!(expand(&c, days("2026-12-03", "2026-12-05", &TORONTO), &TORONTO).is_empty(), "DTEND is exclusive");
        let f = cal("BEGIN:VEVENT\nUID:f1\nSUMMARY:Gym\nDTSTART:20261102T070000\nDURATION:PT1H\nRRULE:FREQ=DAILY;UNTIL=20261104\nRDATE:20261110T070000\nEND:VEVENT\n");
        let madrid = Zone::Tz(Tz::Europe__Madrid);
        let got = expand(&f, days("2026-11-01", "2026-11-30", &madrid), &madrid);
        let s: Vec<&str> = got.iter().map(|i| i.start.as_str()).collect();
        assert_eq!(s, ["2026-11-02T07:00:00+01:00", "2026-11-03T07:00:00+01:00", "2026-11-04T07:00:00+01:00", "2026-11-10T07:00:00+01:00"], "floating: 07:00 wherever");
        assert_eq!(got[0].end, "2026-11-02T08:00:00+01:00");
    }

    #[test]
    fn a_yearly_birthday_a_utc_event_and_a_cancelled_occurrence() {
        let b = cal("BEGIN:VEVENT\nUID:b\nSUMMARY:Ana\nDTSTART;VALUE=DATE:20000229\nRRULE:FREQ=YEARLY\nEND:VEVENT\n");
        let got = expand(&b, days("2026-01-01", "2028-12-31", &TORONTO), &TORONTO);
        assert_eq!(got.iter().map(|i| i.start.as_str()).collect::<Vec<_>>(), ["2028-02-29"], "RFC 5545: an invalid date is skipped");
        let u = cal("BEGIN:VEVENT\nUID:u\nSUMMARY:Call\nDTSTART:20261104T150000Z\nDTEND:20261104T160000Z\nEND:VEVENT\n");
        assert_eq!(expand(&u, days("2026-11-04", "2026-11-04", &TORONTO), &TORONTO)[0].start, "2026-11-04T10:00:00-05:00");
        let x = cal("BEGIN:VEVENT\nUID:x\nSUMMARY:Daily\nDTSTART:20261102T090000Z\nRRULE:FREQ=DAILY;COUNT=3\nEND:VEVENT\nBEGIN:VEVENT\nUID:x\nRECURRENCE-ID:20261103T090000Z\nSTATUS:CANCELLED\nDTSTART:20261103T090000Z\nEND:VEVENT\n");
        assert_eq!(expand(&x, days("2026-11-01", "2026-11-30", &Zone::UTC), &Zone::UTC).len(), 2);
    }

    #[test]
    fn outlook_windows_zone_names_and_bounds() {
        let c = cal("BEGIN:VTIMEZONE\nTZID:W. Europe Standard Time\nBEGIN:STANDARD\nDTSTART:16010101T030000\nTZOFFSETFROM:+0200\nTZOFFSETTO:+0100\nEND:STANDARD\nEND:VTIMEZONE\nBEGIN:VEVENT\nUID:o\nSUMMARY:Review\nDTSTART;TZID=W. Europe Standard Time:20261104T100000\nDTEND;TZID=W. Europe Standard Time:20261104T110000\nEND:VEVENT\n");
        let got = expand(&c, days("2026-11-04", "2026-11-04", &TORONTO), &TORONTO);
        assert_eq!(got[0].start, "2026-11-04T04:00:00-05:00");
        let (lo, hi) = bounds(&c, &TORONTO);
        assert!(lo < got[0].from && hi.unwrap() > got[0].to);
        let open = cal("BEGIN:VEVENT\nUID:r\nDTSTART:20260101T090000Z\nRRULE:FREQ=DAILY\nEND:VEVENT\n");
        assert_eq!(bounds(&open, &TORONTO).1, None, "an endless series has no last end");
        assert_eq!(duration("PT1H30M"), Some(Duration::minutes(90)));
        assert_eq!(duration("P1W"), Some(Duration::weeks(1)));
        assert_eq!(duration("-PT15M"), Some(-Duration::minutes(15)));
    }
}
