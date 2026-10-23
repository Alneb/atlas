//! Changing calendar objects as the pane asks (DESIGN-calendar §2): a new event; an event changed or deleted — for a
//! recurring one "this event", "this and following" or "all events", as Google Calendar asks. Every property the change
//! does not touch is kept (attendees, alarms, X- properties), and SEQUENCE / DTSTAMP / LAST-MODIFIED move.
use crate::ics::{self, escape, Component, Line, PRODID};
use crate::recur::{self, Frame};
use crate::zone::{self, Zone};
use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveDateTime, Utc};
use serde::Deserialize;

/// Which occurrences a change is for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    /// the one occurrence (or the event, when it does not repeat)
    #[default]
    This,
    /// this occurrence and every later one: the series is split
    Following,
    /// the whole series
    All,
}

/// What the editor or a drag says about an event. `None`: unchanged.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Change {
    pub summary: Option<String>,
    /// `2026-11-04` (all-day) or `2026-11-04T10:00`
    pub start: Option<String>,
    /// exclusive for all-day events
    pub end: Option<String>,
    pub all_day: Option<bool>,
    pub location: Option<String>,
    pub description: Option<String>,
    /// an RRULE value; `""` stops the repeat
    pub rrule: Option<String>,
    /// the occurrence's start as the pane showed it (what "all events" shifts the series by)
    pub from_start: Option<String>,
}

/// A time the pane wrote: a day, or the user's wall clock.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Local {
    Day(NaiveDate),
    At(NaiveDateTime),
}

impl Local {
    pub fn parse(s: &str) -> Result<Local, String> {
        let t = s.trim();
        if let Ok(d) = NaiveDate::parse_from_str(t, "%Y-%m-%d") {
            return Ok(Local::Day(d));
        }
        // an instant with an offset (an instance's start as the engine gave it) is the user's wall clock already
        let wall = t.get(..16).unwrap_or(t).replace(' ', "T");
        NaiveDateTime::parse_from_str(&wall, "%Y-%m-%dT%H:%M").map(Local::At).map_err(|_| format!("{t:?} is not a date or a time (2026-11-04, 2026-11-04T10:00)"))
    }

    fn naive(&self) -> NaiveDateTime {
        match self {
            Local::Day(d) => d.and_hms_opt(0, 0, 0).unwrap_or_default(),
            Local::At(t) => *t,
        }
    }
}

/// A DTSTART / DTEND line for a time the user gave, in their zone (a VTIMEZONE is then needed: `ensure_zone`).
fn time_line(name: &str, t: Local, user: &Zone) -> Line {
    match t {
        Local::Day(d) => Line { name: name.into(), params: vec![("VALUE".into(), "DATE".into())], value: d.format("%Y%m%d").to_string() },
        Local::At(x) => match user {
            z if *z == Zone::UTC => Line { name: name.into(), params: vec![], value: x.format("%Y%m%dT%H%M%SZ").to_string() },
            Zone::Tz(z) => Line { name: name.into(), params: vec![("TZID".into(), z.name().into())], value: x.format("%Y%m%dT%H%M%S").to_string() },
            Zone::Fixed(_) => Line { name: name.into(), params: vec![], value: user.instant(x).format("%Y%m%dT%H%M%SZ").to_string() },
        },
    }
}

/// The user's zone's VTIMEZONE in the calendar, when its times use it.
fn ensure_zone(cal: &mut Component, user: &Zone, year: i32) {
    let Zone::Tz(z) = user else { return };
    if *user == Zone::UTC || cal.subs.iter().any(|c| c.name == "VTIMEZONE" && c.text("TZID").as_deref() == Some(z.name())) {
        return;
    }
    let used = cal.subs.iter().any(|e| e.props.iter().any(|l| l.param("TZID") == Some(z.name())));
    if used {
        cal.subs.insert(0, zone::vtimezone(*z, year));
    }
}

fn touch(ev: &mut Component, now: DateTime<Utc>) {
    let stamp = now.format("%Y%m%dT%H%M%SZ").to_string();
    ev.set("DTSTAMP", vec![], stamp.clone());
    ev.set("LAST-MODIFIED", vec![], stamp);
    let seq = ev.prop("SEQUENCE").and_then(|l| l.value.trim().parse::<i64>().ok());
    if let Some(n) = seq {
        ev.set("SEQUENCE", vec![], (n + 1).to_string());
    }
}

/// A new calendar object for one event.
pub fn create(uid: &str, c: &Change, user: &Zone, now: DateTime<Utc>) -> Result<String, String> {
    let start = Local::parse(c.start.as_deref().ok_or("start: required")?)?;
    let start = if c.all_day == Some(true) { Local::Day(start.naive().date()) } else { start };
    let end = match c.end.as_deref().map(Local::parse).transpose()? {
        Some(e) => e,
        None => match start {
            Local::Day(d) => Local::Day(d + Duration::days(1)),
            Local::At(t) => Local::At(t + Duration::hours(1)),
        },
    };
    let end = match (start, end) {
        (Local::Day(_), Local::At(t)) => Local::Day(t.date() + Duration::days(1)),
        (_, e) => e,
    };
    if end.naive() <= start.naive() {
        return Err("end: must be after start".into());
    }
    let mut ev = Component { name: "VEVENT".into(), ..Default::default() };
    ev.set("UID", vec![], escape(uid));
    ev.set("DTSTAMP", vec![], now.format("%Y%m%dT%H%M%SZ").to_string());
    ev.set("CREATED", vec![], now.format("%Y%m%dT%H%M%SZ").to_string());
    ev.props.push(time_line("DTSTART", start, user));
    ev.props.push(time_line("DTEND", end, user));
    ev.set_text("SUMMARY", Some(c.summary.as_deref().filter(|s| !s.trim().is_empty()).unwrap_or("(no title)")));
    ev.set_text("LOCATION", c.location.as_deref());
    ev.set_text("DESCRIPTION", c.description.as_deref());
    if let Some(r) = c.rrule.as_deref().map(str::trim).filter(|r| !r.is_empty()) {
        ev.set("RRULE", vec![], r.trim_start_matches("RRULE:").to_string());
    }
    if matches!(start, Local::Day(_)) {
        ev.set("TRANSP", vec![], "TRANSPARENT");
    }
    ev.set("SEQUENCE", vec![], "0");
    let mut cal = Component {
        name: "VCALENDAR".into(),
        props: vec![
            Line { name: "VERSION".into(), params: vec![], value: "2.0".into() },
            Line { name: "PRODID".into(), params: vec![], value: PRODID.into() },
            Line { name: "CALSCALE".into(), params: vec![], value: "GREGORIAN".into() },
        ],
        subs: vec![ev],
    };
    ensure_zone(&mut cal, user, start.naive().year());
    Ok(cal.write())
}

/// What a change does to the server: the object rewritten, and for a split the new series' object.
#[derive(Debug, Clone, PartialEq)]
pub struct Written {
    /// None: delete the object (the whole series went)
    pub object: Option<String>,
    /// (new UID, its object): the following occurrences, split off as a series of their own
    pub split: Option<(String, String)>,
}

fn zones_of(cal: &Component) -> Vec<Component> {
    cal.subs.iter().filter(|c| c.name == "VTIMEZONE").cloned().collect()
}

fn master_index(cal: &Component, uid: &str) -> Option<usize> {
    cal.subs.iter().position(|c| c.name == "VEVENT" && c.prop("RECURRENCE-ID").is_none() && c.text("UID").unwrap_or_default() == uid)
}

/// The frame of the master, and an occurrence's id read in it.
fn frame_of(master: &Component, zones: &[Component]) -> Result<(Frame, NaiveDateTime), String> {
    let s = master.prop("DTSTART").and_then(|l| recur::stamp(l, zones)).ok_or("the event has no start")?;
    let f = Frame::of(s);
    Ok((f, f.naive(s)))
}

fn rid_naive(rid: &str, master: &Component, frame: Frame, zones: &[Component]) -> Result<NaiveDateTime, String> {
    let tzid = master.prop("DTSTART").and_then(|l| l.param("TZID"));
    recur::stamp_value(rid, tzid, zones).map(|s| frame.naive(s)).ok_or_else(|| format!("{rid:?} is not an occurrence"))
}

fn rid_line(name: &str, frame: Frame, t: NaiveDateTime) -> Line {
    let (params, value) = frame.write(t);
    Line { name: name.into(), params, value }
}

/// UNTIL for a series that stops just before `t` (in the frame): UTC for zoned times, as RFC 5545 asks.
fn until_before(frame: Frame, t: NaiveDateTime, user: &Zone) -> String {
    match frame {
        Frame::Day => (t.date() - Duration::days(1)).format("%Y%m%d").to_string(),
        Frame::Floating => (t - Duration::seconds(1)).format("%Y%m%dT%H%M%S").to_string(),
        f => (f.instant(t, user) - Duration::seconds(1)).format("%Y%m%dT%H%M%SZ").to_string(),
    }
}

/// A wall-clock time `len` after `t` in the frame (exact time for a zoned one, across DST).
fn later(frame: Frame, t: NaiveDateTime, len: Duration, user: &Zone) -> NaiveDateTime {
    match frame {
        Frame::Zoned(z) => z.wall(frame.instant(t, user) + len),
        _ => t + len,
    }
}

/// The rule with UNTIL / COUNT replaced.
fn rule_with(rule: &str, until: Option<&str>, count: Option<usize>) -> String {
    let mut parts: Vec<String> = rule.split(';').filter(|p| !p.starts_with("UNTIL=") && !p.starts_with("COUNT=") && !p.is_empty()).map(str::to_string).collect();
    if let Some(u) = until {
        parts.push(format!("UNTIL={u}"));
    }
    if let Some(c) = count {
        parts.push(format!("COUNT={c}"));
    }
    parts.join(";")
}

/// How many occurrences of the master come before `t`.
fn count_before(cal: &Component, uid: &str, t: NaiveDateTime, frame: Frame, user: &Zone) -> usize {
    let mut one = cal.clone();
    one.subs.retain(|c| c.name != "VEVENT" || (c.prop("RECURRENCE-ID").is_none() && c.text("UID").unwrap_or_default() == uid));
    for e in one.subs.iter_mut().filter(|c| c.name == "VEVENT") {
        e.remove("EXDATE"); // COUNT counts excluded occurrences too
    }
    let first = cal.subs.iter().find(|c| c.name == "VEVENT").and_then(|m| frame_of(m, &zones_of(cal)).ok()).map(|x| x.1).unwrap_or(t);
    let range = recur::Range { from: frame.instant(first, user) - Duration::seconds(1), to: frame.instant(t, user) };
    recur::expand(&one, range, user).iter().filter(|i| i.from < frame.instant(t, user).timestamp()).count()
}

/// Applies the editor's change to one event (`rid`: the occurrence, for a recurring one).
pub fn update(text: &str, uid: &str, rid: Option<&str>, scope: Scope, c: &Change, user: &Zone, now: DateTime<Utc>) -> Result<Written, String> {
    let mut cal = ics::parse(text)?.into_iter().find(|x| x.name == "VCALENDAR").ok_or("no calendar in the object")?;
    let zones = zones_of(&cal);
    let mi = master_index(&cal, uid).ok_or_else(|| format!("no event {uid} in the object"))?;
    let repeats = cal.subs[mi].prop("RRULE").is_some() || cal.subs[mi].prop("RDATE").is_some();
    let (frame, first) = frame_of(&cal.subs[mi], &zones)?;
    let at = match (rid, repeats) {
        (Some(r), true) => Some(rid_naive(r, &cal.subs[mi], frame, &zones)?),
        _ => None,
    };
    let scope = match at {
        None => Scope::All,
        Some(t) if scope == Scope::Following && t <= first => Scope::All,
        _ => scope,
    };
    let year = now.year();
    match (scope, at) {
        (Scope::This, Some(t)) => {
            // an override for this occurrence: the one there, or a copy of the master without its repeat
            let idx = cal.subs.iter().position(|e| {
                e.name == "VEVENT" && e.text("UID").unwrap_or_default() == uid && e.prop("RECURRENCE-ID").and_then(|l| recur::stamp(l, &zones)).map(|s| frame.naive(s)) == Some(t)
            });
            let idx = match idx {
                Some(i) => i,
                None => {
                    let mut o = cal.subs[mi].clone();
                    for k in ["RRULE", "RDATE", "EXDATE", "EXRULE"] {
                        o.remove(k);
                    }
                    let len = recur::expand(&cal, recur::Range { from: frame.instant(t, user) - Duration::seconds(1), to: frame.instant(t, user) + Duration::days(1) }, user)
                        .into_iter()
                        .find(|i| i.rid.as_deref() == Some(frame.write(t).1.as_str()))
                        .map(|i| Duration::seconds(i.to - i.from))
                        .unwrap_or(Duration::hours(1));
                    o.set("DTSTART", rid_line("DTSTART", frame, t).params, frame.write(t).1);
                    let end = match frame {
                        Frame::Day => Local::Day(t.date() + Duration::days(len.num_days().max(1))),
                        f => Local::At(user.wall(f.instant(t, user) + len)),
                    };
                    o.remove("DTEND");
                    o.remove("DURATION");
                    o.props.push(time_line("DTEND", end, user));
                    o.props.insert(1.min(o.props.len()), rid_line("RECURRENCE-ID", frame, t));
                    cal.subs.push(o);
                    cal.subs.len() - 1
                }
            };
            apply_fields(&mut cal.subs[idx], c, user, false)?;
            touch(&mut cal.subs[idx], now);
            ensure_zone(&mut cal, user, year);
            Ok(Written { object: Some(cal.write()), split: None })
        }
        (Scope::Following, Some(t)) => {
            let old_rule = cal.subs[mi].prop("RRULE").map(|l| l.value.clone()).unwrap_or_default();
            let count = old_rule.split(';').find_map(|p| p.strip_prefix("COUNT=")).and_then(|n| n.parse::<usize>().ok());
            let before = count.map(|_| count_before(&cal, uid, t, frame, user));
            // the new series: the master from this occurrence on, the later overrides and exclusions with it
            let new_uid = format!("{}-{}", uid.split("-from-").next().unwrap_or(uid), format_args!("from-{}", t.format("%Y%m%dT%H%M%S")));
            let mut next = cal.clone();
            next.subs.retain(|e| {
                e.name != "VEVENT" || (e.text("UID").unwrap_or_default() == uid && e.prop("RECURRENCE-ID").and_then(|l| recur::stamp(l, &zones)).is_none_or(|s| frame.naive(s) >= t))
            });
            let nmi = master_index(&next, uid).ok_or("the series vanished")?;
            {
                let m = &mut next.subs[nmi];
                let len = recur::expand(&cal, recur::Range { from: frame.instant(first, user) - Duration::seconds(1), to: frame.instant(first, user) + Duration::days(1) }, user)
                    .first()
                    .map(|i| Duration::seconds(i.to - i.from))
                    .unwrap_or(Duration::hours(1));
                m.set("DTSTART", rid_line("DTSTART", frame, t).params, frame.write(t).1);
                m.remove("DURATION");
                match frame {
                    Frame::Day => m.set("DTEND", vec![("VALUE".into(), "DATE".into())], (t.date() + Duration::days(len.num_days().max(1))).format("%Y%m%d").to_string()),
                    f => {
                        let e = rid_line("DTEND", f, later(f, t, len, user));
                        m.set("DTEND", e.params, e.value);
                    }
                }
                if let (Some(n), Some(b)) = (count, before) {
                    m.set("RRULE", vec![], rule_with(&old_rule, None, Some(n.saturating_sub(b).max(1))));
                }
                let keep: Vec<Line> = m.props.iter().filter(|l| l.name == "EXDATE").filter(|l| recur::stamp(l, &zones).is_none_or(|s| frame.naive(s) >= t)).cloned().collect();
                m.remove("EXDATE");
                m.props.extend(keep);
                m.remove("CREATED");
            }
            for e in next.subs.iter_mut().filter(|e| e.name == "VEVENT") {
                e.set("UID", vec![], escape(&new_uid));
                e.set("SEQUENCE", vec![], "0");
            }
            apply_fields(&mut next.subs[nmi], c, user, true)?;
            touch(&mut next.subs[nmi], now);
            ensure_zone(&mut next, user, year);
            // the old series stops before it
            cal.subs.retain(|e| {
                e.name != "VEVENT" || e.text("UID").unwrap_or_default() != uid || e.prop("RECURRENCE-ID").and_then(|l| recur::stamp(l, &zones)).is_none_or(|s| frame.naive(s) < t)
            });
            let mi = master_index(&cal, uid).ok_or("the series vanished")?;
            cal.subs[mi].set("RRULE", vec![], rule_with(&old_rule, Some(&until_before(frame, t, user)), None));
            touch(&mut cal.subs[mi], now);
            Ok(Written { object: Some(cal.write()), split: Some((new_uid, next.write())) })
        }
        _ => {
            // the whole event: a series moves by what this occurrence moved by
            let m = &mut cal.subs[mi];
            if repeats {
                shift_series(m, &zones, frame, c, user)?;
                let delta = series_delta(c, frame, at.unwrap_or(first));
                if let Some(d) = delta {
                    for e in cal.subs.iter_mut().filter(|e| e.name == "VEVENT" && e.text("UID").unwrap_or_default() == uid && e.prop("RECURRENCE-ID").is_some()) {
                        if let Some(s) = e.prop("RECURRENCE-ID").and_then(|l| recur::stamp(l, &zones)) {
                            let l = rid_line("RECURRENCE-ID", frame, frame.naive(s) + d);
                            e.set("RECURRENCE-ID", l.params, l.value);
                        }
                    }
                }
                let m = &mut cal.subs[mi];
                apply_fields(m, &Change { start: None, end: None, all_day: None, ..c.clone() }, user, true)?;
                touch(m, now);
            } else {
                apply_fields(m, c, user, true)?;
                touch(m, now);
            }
            ensure_zone(&mut cal, user, year);
            Ok(Written { object: Some(cal.write()), split: None })
        }
    }
}

/// How far "all events" moves a series: the dragged occurrence's new start minus where it was.
fn series_delta(c: &Change, frame: Frame, _at: NaiveDateTime) -> Option<Duration> {
    let new = Local::parse(c.start.as_deref()?).ok()?;
    let was = Local::parse(c.from_start.as_deref()?).ok()?;
    let d = new.naive() - was.naive();
    let d = if frame == Frame::Day { Duration::days(d.num_days()) } else { d };
    (d != Duration::zero()).then_some(d)
}

/// A series' DTSTART / DTEND / EXDATEs moved by the change's shift (and its length set from the new start and end).
fn shift_series(m: &mut Component, zones: &[Component], frame: Frame, c: &Change, user: &Zone) -> Result<(), String> {
    let (Some(s), Some(e)) = (c.start.as_deref(), c.end.as_deref()) else { return Ok(()) };
    let (s, e) = (Local::parse(s)?, Local::parse(e)?);
    let became_day = matches!(s, Local::Day(_));
    let was_day = frame == Frame::Day;
    let (_, first) = frame_of(m, zones)?;
    let delta = series_delta(c, frame, first).unwrap_or(Duration::zero());
    if became_day != was_day {
        // all-day ↔ timed: the series' first day kept, the new times taken
        let day = (first + delta).date();
        let len = e.naive() - s.naive();
        let start = match s {
            Local::Day(_) => Local::Day(day),
            Local::At(t) => Local::At(day.and_time(t.time())),
        };
        let end = match start {
            Local::Day(d) => Local::Day(d + Duration::days(len.num_days().max(1))),
            Local::At(t) => Local::At(t + len),
        };
        m.props.retain(|l| !matches!(l.name.as_str(), "DTSTART" | "DTEND" | "DURATION" | "EXDATE"));
        m.props.push(time_line("DTSTART", start, user));
        m.props.push(time_line("DTEND", end, user));
        return Ok(());
    }
    let new_first = first + delta;
    let len = e.naive() - s.naive();
    let l = rid_line("DTSTART", frame, new_first);
    m.set("DTSTART", l.params, l.value);
    m.remove("DURATION");
    let end = match frame {
        Frame::Day => rid_line("DTEND", frame, new_first + Duration::days(len.num_days().max(1))),
        f => rid_line("DTEND", f, later(f, new_first, len, user)),
    };
    m.set("DTEND", end.params, end.value);
    if delta != Duration::zero() {
        let moved: Vec<Line> = m
            .props
            .iter()
            .filter(|l| l.name == "EXDATE")
            .flat_map(|l| l.value.split(',').filter_map(|v| recur::stamp_value(v, l.param("TZID"), zones)).collect::<Vec<_>>())
            .map(|x| rid_line("EXDATE", frame, frame.naive(x) + delta))
            .collect();
        m.remove("EXDATE");
        m.props.extend(moved);
    }
    Ok(())
}

/// The editor's fields onto one VEVENT; `series`: the repeat may change too.
fn apply_fields(ev: &mut Component, c: &Change, user: &Zone, series: bool) -> Result<(), String> {
    if let Some(s) = &c.summary {
        ev.set_text("SUMMARY", Some(if s.trim().is_empty() { "(no title)" } else { s }));
    }
    if c.location.is_some() {
        ev.set_text("LOCATION", c.location.as_deref());
    }
    if c.description.is_some() {
        ev.set_text("DESCRIPTION", c.description.as_deref());
    }
    if let Some(s) = c.start.as_deref() {
        let mut s = Local::parse(s)?;
        if c.all_day == Some(true) {
            s = Local::Day(s.naive().date());
        }
        let e = match c.end.as_deref().map(Local::parse).transpose()? {
            Some(Local::At(t)) if matches!(s, Local::Day(_)) => Local::Day(t.date() + Duration::days(1)),
            Some(Local::Day(d)) if matches!(s, Local::At(_)) => Local::At(d.and_hms_opt(0, 0, 0).unwrap_or_default()),
            Some(e) => e,
            None => match s {
                Local::Day(d) => Local::Day(d + Duration::days(1)),
                Local::At(t) => Local::At(t + Duration::hours(1)),
            },
        };
        if e.naive() <= s.naive() {
            return Err("end: must be after start".into());
        }
        let (ls, le) = (time_line("DTSTART", s, user), time_line("DTEND", e, user));
        ev.set("DTSTART", ls.params, ls.value);
        ev.remove("DURATION");
        ev.set("DTEND", le.params, le.value);
    }
    if series {
        if let Some(r) = c.rrule.as_deref() {
            let r = r.trim().trim_start_matches("RRULE:");
            if r.is_empty() {
                for k in ["RRULE", "RDATE", "EXDATE"] {
                    ev.remove(k);
                }
            } else {
                ev.set("RRULE", vec![], r.to_string());
            }
        }
    }
    Ok(())
}

/// Removes one event (`rid`: an occurrence of a recurring one). `None`: delete the whole object.
pub fn delete(text: &str, uid: &str, rid: Option<&str>, scope: Scope, user: &Zone, now: DateTime<Utc>) -> Result<Option<String>, String> {
    let mut cal = ics::parse(text)?.into_iter().find(|x| x.name == "VCALENDAR").ok_or("no calendar in the object")?;
    let zones = zones_of(&cal);
    let Some(mi) = master_index(&cal, uid) else {
        // only overrides of someone else's series: drop the one asked for
        cal.subs.retain(|e| e.name != "VEVENT" || e.text("UID").unwrap_or_default() != uid);
        return Ok(cal.subs.iter().any(|e| e.name == "VEVENT").then(|| cal.write()));
    };
    let repeats = cal.subs[mi].prop("RRULE").is_some() || cal.subs[mi].prop("RDATE").is_some();
    let (frame, first) = frame_of(&cal.subs[mi], &zones)?;
    let at = match (rid, repeats) {
        (Some(r), true) => rid_naive(r, &cal.subs[mi], frame, &zones)?,
        _ => return Ok(None),
    };
    let same = |e: &Component, keep: &dyn Fn(NaiveDateTime) -> bool| {
        e.name != "VEVENT" || e.text("UID").unwrap_or_default() != uid || e.prop("RECURRENCE-ID").and_then(|l| recur::stamp(l, &zones)).is_none_or(|s| keep(frame.naive(s)))
    };
    match scope {
        Scope::All => Ok(None),
        Scope::Following if at <= first => Ok(None),
        Scope::Following => {
            cal.subs.retain(|e| same(e, &|t| t < at));
            let mi = master_index(&cal, uid).ok_or("the series vanished")?;
            let rule = cal.subs[mi].prop("RRULE").map(|l| l.value.clone()).unwrap_or_default();
            cal.subs[mi].set("RRULE", vec![], rule_with(&rule, Some(&until_before(frame, at, user)), None));
            touch(&mut cal.subs[mi], now);
            Ok(Some(cal.write()))
        }
        Scope::This => {
            cal.subs.retain(|e| same(e, &|t| t != at));
            let mi = master_index(&cal, uid).ok_or("the series vanished")?;
            cal.subs[mi].props.push(rid_line("EXDATE", frame, at));
            touch(&mut cal.subs[mi], now);
            Ok(Some(cal.write()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recur::{expand, Range};
    use chrono_tz::Tz;

    const TORONTO: Zone = Zone::Tz(Tz::America__Toronto);
    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-10-23T12:00:00Z").unwrap().with_timezone(&Utc)
    }
    fn starts(text: &str, a: &str, b: &str) -> Vec<String> {
        let cal = ics::parse(text).unwrap().remove(0);
        let d = |s: &str| NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap();
        expand(&cal, Range::days(d(a), d(b), &TORONTO), &TORONTO).into_iter().map(|i| format!("{} {}", &i.start[..16], i.summary)).collect()
    }
    fn ch(start: &str, end: &str) -> Change {
        Change { start: Some(start.into()), end: Some(end.into()), ..Default::default() }
    }
    const SERIES: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:s1\r\nSUMMARY:Seminar\r\nATTENDEE;CN=Ana;PARTSTAT=ACCEPTED:mailto:ana@example.org\r\nDTSTART;TZID=America/Toronto:20261102T100000\r\nDTEND;TZID=America/Toronto:20261102T110000\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\nSEQUENCE:2\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

    #[test]
    fn a_new_event_carries_the_users_zone_and_reads_back() {
        let t = create("atlas-x", &Change { summary: Some("Lunch, with Ana".into()), start: Some("2026-11-04T13:00".into()), end: None, ..Default::default() }, &TORONTO, now()).unwrap();
        assert!(t.contains("BEGIN:VTIMEZONE\r\nTZID:America/Toronto") && t.contains("DTSTART;TZID=America/Toronto:20261104T130000"), "{t}");
        assert_eq!(starts(&t, "2026-11-04", "2026-11-04"), ["2026-11-04T13:00 Lunch, with Ana"]);
        let d = create("atlas-y", &Change { summary: Some("Exam".into()), start: Some("2026-11-15".into()), all_day: Some(true), ..Default::default() }, &TORONTO, now()).unwrap();
        assert!(d.contains("DTSTART;VALUE=DATE:20261115\r\nDTEND;VALUE=DATE:20261116") && !d.contains("VTIMEZONE"), "{d}");
        assert!(create("z", &ch("2026-11-04T13:00", "2026-11-04T12:00"), &TORONTO, now()).is_err());
    }

    #[test]
    fn this_occurrence_becomes_an_override_and_the_rest_keeps_its_hour() {
        let w = update(SERIES, "s1", Some("20261109T100000"), Scope::This, &Change { summary: Some("Seminar (moved)".into()), ..ch("2026-11-09T15:00", "2026-11-09T16:00") }, &TORONTO, now()).unwrap();
        let t = w.object.unwrap();
        assert_eq!(starts(&t, "2026-11-01", "2026-11-30"), ["2026-11-02T10:00 Seminar", "2026-11-09T15:00 Seminar (moved)", "2026-11-16T10:00 Seminar", "2026-11-23T10:00 Seminar"]);
        assert!(t.contains("RECURRENCE-ID;TZID=America/Toronto:20261109T100000"), "{t}");
        assert!(t.matches("ATTENDEE").count() == 2, "attendees kept on the override too");
        // changing the override again edits it, never a second one
        let t2 = update(&t, "s1", Some("20261109T100000"), Scope::This, &ch("2026-11-09T16:00", "2026-11-09T17:00"), &TORONTO, now()).unwrap().object.unwrap();
        assert_eq!(t2.matches("RECURRENCE-ID").count(), 1);
        assert!(starts(&t2, "2026-11-09", "2026-11-09")[0].starts_with("2026-11-09T16:00"));
    }

    #[test]
    fn all_events_move_by_the_drag_and_following_splits_with_the_count_left() {
        let mut c = ch("2026-11-09T11:00", "2026-11-09T12:30");
        c.from_start = Some("2026-11-09T10:00:00-05:00".into());
        let t = update(SERIES, "s1", Some("20261109T100000"), Scope::All, &c, &TORONTO, now()).unwrap().object.unwrap();
        assert_eq!(starts(&t, "2026-11-01", "2026-11-30").len(), 4);
        assert!(starts(&t, "2026-11-01", "2026-11-30").iter().all(|s| s.contains("T11:00")), "{t}");
        assert!(t.contains("SEQUENCE:3"));
        let w = update(SERIES, "s1", Some("20261116T100000"), Scope::Following, &Change { summary: Some("Seminar B".into()), ..ch("2026-11-16T14:00", "2026-11-16T15:00") }, &TORONTO, now()).unwrap();
        let (old, (uid, new)) = (w.object.unwrap(), w.split.unwrap());
        assert_eq!(starts(&old, "2026-11-01", "2026-12-31"), ["2026-11-02T10:00 Seminar", "2026-11-09T10:00 Seminar"]);
        assert_eq!(starts(&new, "2026-11-01", "2026-12-31"), ["2026-11-16T14:00 Seminar B", "2026-11-23T14:00 Seminar B"], "{new}");
        assert!(new.contains(&format!("UID:{uid}")) && new.contains("COUNT=2"), "{new}");
        assert!(old.contains("UNTIL=20261116T145959Z"), "{old}");
    }

    #[test]
    fn deleting_one_the_following_or_all() {
        let one = delete(SERIES, "s1", Some("20261109T100000"), Scope::This, &TORONTO, now()).unwrap().unwrap();
        assert_eq!(starts(&one, "2026-11-01", "2026-11-30").len(), 3);
        assert!(one.contains("EXDATE;TZID=America/Toronto:20261109T100000"));
        let following = delete(SERIES, "s1", Some("20261116T100000"), Scope::Following, &TORONTO, now()).unwrap().unwrap();
        assert_eq!(starts(&following, "2026-11-01", "2026-11-30").len(), 2);
        assert_eq!(delete(SERIES, "s1", Some("20261102T100000"), Scope::Following, &TORONTO, now()).unwrap(), None, "from the first: all of it");
        assert_eq!(delete(SERIES, "s1", None, Scope::This, &TORONTO, now()).unwrap(), None);
        // a single event changed in place keeps what the editor does not show
        let single = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:e\r\nSUMMARY:A\r\nX-ATLAS-SOURCE:notes/a.md\r\nDTSTART;VALUE=DATE:20261104\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let t = update(single, "e", None, Scope::This, &ch("2026-11-05", "2026-11-07"), &TORONTO, now()).unwrap().object.unwrap();
        assert!(t.contains("X-ATLAS-SOURCE:notes/a.md") && t.contains("DTSTART;VALUE=DATE:20261105") && t.contains("DTEND;VALUE=DATE:20261107"), "{t}");
    }
}
