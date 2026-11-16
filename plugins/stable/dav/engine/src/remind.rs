//! Event reminders (docs/design/DESIGN-calendar-tasks-nudges.md, "Added slice: event reminders"): when the cached
//! events' VALARMs ring in the next hours, as the core's planned notices (docs/guides/PLUGIN-API.md, "Planned
//! notices"). This module only says when and what; the core fires each once at its time and asks again just before,
//! so an event moved or deleted since moves or drops its reminder.
use crate::ics::Component;
use crate::recur::{self, Instance, Range, Stamp};
use crate::zone::Zone;
use chrono::{DateTime, Duration, Utc};
use serde_json::{json, Value};

/// How far ahead the plan looks (the core asks again every few minutes, so this only has to cover a computer that
/// sleeps between two runs).
pub const HORIZON_HOURS: i64 = 36;

/// A reminder whose moment passed less than this long ago still rings (Atlas started late, the laptop woke up); after
/// that it is noise and is left out.
pub const LATE: Duration = Duration::minutes(30);

/// When a VALARM rings.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Trigger {
    /// An offset from the occurrence's start, or from its end (`RELATED=END`); negative is before.
    Offset { by: Duration, from_end: bool },
    /// A moment (`VALUE=DATE-TIME`): once, whichever occurrence it is read with.
    At(DateTime<Utc>),
}

impl Trigger {
    /// The trigger of a VALARM that shows something to the user: DISPLAY and AUDIO (and one that names no action);
    /// EMAIL is the server's to send, PROCEDURE and NONE never ring. None when it cannot be read, or when it was
    /// acknowledged (RFC 9074 `ACKNOWLEDGED`, written by a client that dismissed it) at or after its moment for a
    /// moment trigger.
    pub fn of(alarm: &Component, user: &Zone) -> Option<Trigger> {
        let action = alarm.text("ACTION").unwrap_or_default().to_ascii_uppercase();
        if !matches!(action.as_str(), "" | "DISPLAY" | "AUDIO") {
            return None;
        }
        let line = alarm.prop("TRIGGER")?;
        let moment = line.param("VALUE").is_some_and(|v| v.eq_ignore_ascii_case("DATE-TIME")) || line.value.trim().starts_with(|c: char| c.is_ascii_digit());
        let t = if moment {
            Trigger::At(instant(recur::stamp_value(&line.value, None, &[])?, user))
        } else {
            let from_end = line.param("RELATED").is_some_and(|r| r.eq_ignore_ascii_case("END"));
            Trigger::Offset { by: recur::duration(&line.value)?, from_end }
        };
        if let (Trigger::At(at), Some(ack)) = (t, alarm.prop("ACKNOWLEDGED").and_then(|l| recur::stamp_value(&l.value, None, &[]))) {
            if instant(ack, user) >= at {
                return None;
            }
        }
        Some(t)
    }

    /// The moment it rings for one occurrence.
    pub fn when(&self, i: &Instance) -> DateTime<Utc> {
        match *self {
            Trigger::At(t) => t,
            Trigger::Offset { by, from_end } => {
                let base = if from_end { i.to } else { i.from };
                DateTime::from_timestamp(base, 0).unwrap_or_default() + by
            }
        }
    }

    /// `minutes` before the start.
    pub fn before(minutes: i64) -> Trigger {
        Trigger::Offset { by: -Duration::minutes(minutes), from_end: false }
    }
}

fn instant(s: Stamp, user: &Zone) -> DateTime<Utc> {
    match s {
        Stamp::At(t, _) => t,
        Stamp::Floating(t) => user.instant(t),
        Stamp::Day(d) => user.instant(d.and_hms_opt(0, 0, 0).unwrap_or_default()),
    }
}

/// What rings for an event that has no alert of its own: its calendar's default from the server (timed and
/// all-day apart), else the one Settings names (timed events only: "15 minutes before" an all-day event is midnight).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Defaults {
    pub timed: Vec<Trigger>,
    pub day: Vec<Trigger>,
}

impl Defaults {
    /// A calendar's: the server's VALARM texts (caldav::Calendar), each side falling back to `setting` when the
    /// server says nothing (timed only).
    pub fn of(server_timed: Option<&str>, server_day: Option<&str>, setting: Option<Trigger>, user: &Zone) -> Defaults {
        let read = |text: Option<&str>| -> Vec<Trigger> {
            let Some(t) = text else { return vec![] };
            let Ok(top) = crate::ics::parse(t) else { return vec![] };
            top.iter().flat_map(|c| if c.name == "VALARM" { vec![c] } else { c.subs.iter().filter(|s| s.name == "VALARM").collect() }).filter_map(|a| Trigger::of(a, user)).collect()
        };
        let timed = read(server_timed);
        Defaults { timed: if timed.is_empty() { setting.into_iter().collect() } else { timed }, day: read(server_day) }
    }
}

/// One coming reminder: the occurrence and when it rings.
#[derive(Debug, Clone, PartialEq)]
pub struct Ring {
    pub at: DateTime<Utc>,
    /// which of the occurrence's alerts (several may ring for one event)
    pub n: usize,
    pub event: Instance,
}

impl Ring {
    /// Names this reminder across runs: the event, its occurrence and which alert. The core keeps "fired" by this
    /// and the moment, so a moved event's reminder rings again at its new time and never twice at the same one.
    pub fn id(&self) -> String {
        format!("dav:{}:{}:{}", self.event.uid, self.event.rid.as_deref().unwrap_or(""), self.n)
    }
}

/// The reminders of one calendar object that ring between `now - LATE` and `now + horizon`, earliest first.
pub fn coming(cal: &Component, user: &Zone, now: DateTime<Utc>, horizon: Duration, defaults: &Defaults) -> Vec<Ring> {
    // occurrences whose alerts can fall in the window: an alert a week before (-P1W), or a day after the end
    let range = Range { from: now - LATE - Duration::days(2), to: now + horizon + Duration::days(8) };
    let mut out = Vec::new();
    for i in recur::expand(cal, range, user) {
        let own: Vec<Trigger> = i.alarms.iter().filter_map(|a| Trigger::of(a, user)).collect();
        // an event that has VALARMs of its own, all of them e-mails, has said what it wants: no default
        let triggers = if !own.is_empty() || !i.alarms.is_empty() { own } else if i.all_day { defaults.day.clone() } else { defaults.timed.clone() };
        for (n, t) in triggers.iter().enumerate() {
            let at = t.when(&i);
            if at > now - LATE && at <= now + horizon {
                out.push(Ring { at, n, event: i.clone() });
            }
        }
    }
    // a moment trigger is the same for every occurrence: once
    out.sort_by(|a, b| (a.at, a.id()).cmp(&(b.at, b.id())));
    out.dedup_by(|a, b| a.at == b.at && a.event.uid == b.event.uid && a.n == b.n);
    out
}

/// A clock time as the user's setting says (`24h` / `12h`).
fn clock(t: chrono::NaiveDateTime, twelve: bool) -> String {
    if twelve { t.format("%-I:%M %p").to_string() } else { t.format("%H:%M").to_string() }
}

/// "in 15 min", "in 2 h", "now", "started 5 min ago": the time from the ring to the start.
fn lead(d: Duration) -> String {
    let m = d.num_minutes();
    let say = |m: i64| if m < 60 || m % 60 != 0 && m < 180 { format!("{m} min") } else if m < 48 * 60 { format!("{} h", (m + 30) / 60) } else { format!("{} days", (m + 720) / 1440) };
    match m {
        0 => "now".into(),
        m if m > 0 => format!("in {}", say(m)),
        m => format!("started {} ago", say(-m)),
    }
}

/// The planned notice for a ring (the core's shape: `at`, `until`, and a notice's title, body, open, id): the
/// event's title; when (relative to the ring, then the clock times, the day when it is not the ring's), and where;
/// a click opens the note the event came from when it is a vault note.
pub fn planned(r: &Ring, user: &Zone, twelve: bool) -> Value {
    let e = &r.event;
    let start = DateTime::from_timestamp(e.from, 0).unwrap_or_default();
    let end = DateTime::from_timestamp(e.to, 0).unwrap_or_default();
    let (ws, we, wr) = (user.wall(start), user.wall(end), user.wall(r.at));
    let day = |d: chrono::NaiveDate| {
        let k = (d - wr.date()).num_days();
        match k {
            0 => None,
            1 => Some("tomorrow".to_string()),
            _ => Some(d.format("%a %-d %b").to_string()),
        }
    };
    let mut parts: Vec<String> = Vec::new();
    if e.all_day {
        parts.push(match day(ws.date()) {
            None => "today, all day".into(),
            Some(d) => format!("{d}, all day"),
        });
    } else {
        parts.push(lead(start - r.at));
        let span = if ws.date() == we.date() || we == ws { format!("{}–{}", clock(ws, twelve), clock(we, twelve)) } else { clock(ws, twelve) };
        parts.push(match day(ws.date()) {
            None => span,
            Some(d) => format!("{d} {span}"),
        });
    }
    if let Some(l) = e.location.as_deref().map(str::trim).filter(|l| !l.is_empty()) {
        parts.push(l.to_string());
    }
    let title = if e.summary.trim().is_empty() { "(no title)".to_string() } else { e.summary.trim().to_string() };
    let mut v = json!({
        "at": r.at.to_rfc3339(),
        "until": (r.at + LATE).to_rfc3339(),
        "id": r.id(),
        "title": title,
        "body": parts.join(" · "),
    });
    if let Some(note) = e.source.as_deref().filter(|s| !s.contains('@') && s.to_ascii_lowercase().ends_with(".md")) {
        v["open"] = json!(note);
    }
    v
}

/// Settings' "Default alert" (`default_alert`): "off" (or empty), "at start", "5 minutes", "1 hour", "1 day", or a
/// number of minutes. None for off or what cannot be read.
pub fn setting(v: &Value) -> Option<Trigger> {
    if let Some(n) = v.as_i64() {
        return (n >= 0).then(|| Trigger::before(n));
    }
    let s = v.as_str()?.trim().to_ascii_lowercase();
    if s.is_empty() || s == "off" {
        return None;
    }
    if s == "at start" {
        return Some(Trigger::before(0));
    }
    let (num, unit) = s.split_once(' ').unwrap_or((s.as_str(), "minutes"));
    let n: i64 = num.parse().ok()?;
    let per = match unit.trim_end_matches('s') {
        "minute" | "min" => 1,
        "hour" => 60,
        "day" => 1440,
        _ => return None,
    };
    Some(Trigger::before(n * per))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ics;

    fn cal(text: &str) -> Component {
        ics::parse(text).unwrap().into_iter().find(|c| c.name == "VCALENDAR").unwrap()
    }

    fn ev(body: &str) -> Component {
        cal(&format!("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n{body}END:VCALENDAR\r\n"))
    }

    fn t(s: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(s).unwrap().with_timezone(&Utc)
    }

    const ALARM_15: &str = "BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:x\r\nTRIGGER:-PT15M\r\nEND:VALARM\r\n";
    const MEETING: &str = "BEGIN:VEVENT\r\nUID:m1\r\nSUMMARY:Group meeting\r\nLOCATION:D3-2041\r\nDTSTART:20261116T150000Z\r\nDTEND:20261116T160000Z\r\n";

    fn rings(c: &Component, now: &str, d: &Defaults) -> Vec<(String, String)> {
        coming(c, &Zone::UTC, t(now), Duration::hours(HORIZON_HOURS), d).iter().map(|r| (r.at.to_rfc3339(), r.id())).collect()
    }

    #[test]
    fn fifteen_minutes_before_the_start() {
        let c = ev(&format!("{MEETING}{ALARM_15}END:VEVENT\r\n"));
        assert_eq!(rings(&c, "2026-11-16T09:00:00Z", &Defaults::default()), vec![("2026-11-16T14:45:00+00:00".into(), "dav:m1::0".into())]);
        let r = &coming(&c, &Zone::UTC, t("2026-11-16T09:00:00Z"), Duration::hours(36), &Defaults::default())[0];
        let n = planned(r, &Zone::UTC, false);
        assert_eq!(n["title"], "Group meeting");
        assert_eq!(n["body"], "in 15 min · 15:00–16:00 · D3-2041");
        assert_eq!(n["until"], "2026-11-16T15:15:00+00:00");
        assert!(n.get("open").is_none(), "no note: a click shows Atlas");
        // past the horizon, or rung more than LATE ago: not listed
        assert!(rings(&c, "2026-11-14T09:00:00Z", &Defaults::default()).is_empty());
        assert!(rings(&c, "2026-11-16T15:20:00Z", &Defaults::default()).is_empty());
        assert_eq!(rings(&c, "2026-11-16T15:00:00Z", &Defaults::default()).len(), 1, "15 minutes late still rings");
    }

    #[test]
    fn an_absolute_trigger_rings_at_its_moment() {
        let c = ev(&format!("{MEETING}BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER;VALUE=DATE-TIME:20261116T080000Z\r\nEND:VALARM\r\nEND:VEVENT\r\n"));
        assert_eq!(rings(&c, "2026-11-16T07:00:00Z", &Defaults::default()), vec![("2026-11-16T08:00:00+00:00".into(), "dav:m1::0".into())]);
        let r = &coming(&c, &Zone::UTC, t("2026-11-16T07:00:00Z"), Duration::hours(36), &Defaults::default())[0];
        assert_eq!(planned(r, &Zone::UTC, true)["body"], "in 7 h · 3:00 PM–4:00 PM · D3-2041");
        // acknowledged after its moment (dismissed in another client): not again
        let acked = ev(&format!("{MEETING}BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER;VALUE=DATE-TIME:20261116T080000Z\r\nACKNOWLEDGED:20261116T080100Z\r\nEND:VALARM\r\nEND:VEVENT\r\n"));
        assert!(rings(&acked, "2026-11-16T07:00:00Z", &Defaults::default()).is_empty());
    }

    #[test]
    fn related_end_counts_from_the_end_and_email_alarms_do_not_ring() {
        let c = ev(&format!(
            "{MEETING}BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER;RELATED=END:-PT5M\r\nEND:VALARM\r\nBEGIN:VALARM\r\nACTION:EMAIL\r\nTRIGGER:-PT1H\r\nEND:VALARM\r\nEND:VEVENT\r\n"
        ));
        assert_eq!(rings(&c, "2026-11-16T09:00:00Z", &Defaults::default()), vec![("2026-11-16T15:55:00+00:00".into(), "dav:m1::0".into())]);
        let r = &coming(&c, &Zone::UTC, t("2026-11-16T09:00:00Z"), Duration::hours(36), &Defaults::default())[0];
        assert_eq!(planned(r, &Zone::UTC, false)["body"], "started 55 min ago · 15:00–16:00 · D3-2041");
        // only an e-mail alarm: the event said what it wants, no default added
        let mail = ev(&format!("{MEETING}BEGIN:VALARM\r\nACTION:EMAIL\r\nTRIGGER:-PT1H\r\nEND:VALARM\r\nEND:VEVENT\r\n"));
        assert!(rings(&mail, "2026-11-16T09:00:00Z", &Defaults { timed: vec![Trigger::before(10)], day: vec![] }).is_empty());
    }

    #[test]
    fn a_recurring_event_rings_for_its_next_occurrences_in_its_own_zone() {
        // weekly on Mondays 10:00 Montreal time; a moved occurrence (the 23rd at 14:00) keeps its master's alert
        let c = ev(&format!(
            "BEGIN:VEVENT\r\nUID:w1\r\nSUMMARY:Seminar\r\nDTSTART;TZID=America/Toronto:20261102T100000\r\nDTEND;TZID=America/Toronto:20261102T110000\r\nRRULE:FREQ=WEEKLY\r\n{ALARM_15}END:VEVENT\r\n\
             BEGIN:VEVENT\r\nUID:w1\r\nRECURRENCE-ID;TZID=America/Toronto:20261123T100000\r\nSUMMARY:Seminar (moved)\r\nDTSTART;TZID=America/Toronto:20261123T140000\r\nDTEND;TZID=America/Toronto:20261123T150000\r\nEND:VEVENT\r\n"
        ));
        let user = Zone::Tz(chrono_tz::America::Toronto);
        let at = |now: &str| coming(&c, &user, t(now), Duration::hours(36), &Defaults::default()).iter().map(|r| (user.rfc3339(r.at), r.id())).collect::<Vec<_>>();
        assert_eq!(at("2026-11-16T00:00:00-05:00"), vec![("2026-11-16T09:45:00-05:00".into(), "dav:w1:20261116T100000:0".into())]);
        assert_eq!(at("2026-11-23T00:00:00-05:00"), vec![("2026-11-23T13:45:00-05:00".into(), "dav:w1:20261123T100000:0".into())], "the moved one, at its new time");
        assert!(at("2026-11-17T00:00:00-05:00").is_empty(), "nothing until next Monday");
    }

    #[test]
    fn defaults_ring_only_for_events_without_alerts() {
        let bare = ev(&format!("{MEETING}END:VEVENT\r\n"));
        assert!(rings(&bare, "2026-11-16T09:00:00Z", &Defaults::default()).is_empty(), "off by default");
        let server = "BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT30M\r\nEND:VALARM\r\n";
        let d = Defaults::of(Some(server), None, Some(Trigger::before(10)), &Zone::UTC);
        assert_eq!(d.timed, vec![Trigger::before(30)], "the server's default over the setting");
        assert_eq!(rings(&bare, "2026-11-16T09:00:00Z", &d)[0].0, "2026-11-16T14:30:00+00:00");
        let d = Defaults::of(None, None, setting(&json!("10 minutes")), &Zone::UTC);
        assert_eq!(rings(&bare, "2026-11-16T09:00:00Z", &d)[0].0, "2026-11-16T14:50:00+00:00");
        let own = ev(&format!("{MEETING}{ALARM_15}END:VEVENT\r\n"));
        assert_eq!(rings(&own, "2026-11-16T09:00:00Z", &d)[0].0, "2026-11-16T14:45:00+00:00", "an event's own alert wins");
        // all-day events take only the server's all-day default
        let day = ev("BEGIN:VEVENT\r\nUID:d1\r\nSUMMARY:Holiday\r\nDTSTART;VALUE=DATE:20261117\r\nDTEND;VALUE=DATE:20261118\r\nEND:VEVENT\r\n");
        assert!(rings(&day, "2026-11-16T09:00:00Z", &d).is_empty());
        let dd = Defaults::of(None, Some("BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT6H\r\nEND:VALARM\r\n"), None, &Zone::UTC);
        let r = &coming(&day, &Zone::UTC, t("2026-11-16T09:00:00Z"), Duration::hours(36), &dd)[0];
        assert_eq!(r.at, t("2026-11-16T18:00:00Z"));
        assert_eq!(planned(r, &Zone::UTC, false)["body"], "tomorrow, all day");
    }

    #[test]
    fn a_moved_event_rings_at_its_new_time_and_a_deleted_one_not_at_all() {
        // the plan is made again from the cache each time: what it says is what the event says now
        let before = ev(&format!("{MEETING}{ALARM_15}END:VEVENT\r\n"));
        let moved = ev(&format!("{}{ALARM_15}END:VEVENT\r\n", MEETING.replace("T150000Z", "T170000Z").replace("T160000Z", "T180000Z")));
        let now = "2026-11-16T09:00:00Z";
        let (a, b) = (rings(&before, now, &Defaults::default()), rings(&moved, now, &Defaults::default()));
        assert_eq!(a[0].1, b[0].1, "the same reminder");
        assert_eq!(b[0].0, "2026-11-16T16:45:00+00:00", "at its new time");
        let cancelled = ev(&format!("{MEETING}STATUS:CANCELLED\r\n{ALARM_15}END:VEVENT\r\n"));
        assert!(rings(&cancelled, now, &Defaults::default()).is_empty(), "a cancelled event does not ring");
    }

    #[test]
    fn a_note_event_opens_its_note() {
        let c = ev(&format!("{MEETING}X-ATLAS-SOURCE:notes/Defence.md\r\n{ALARM_15}END:VEVENT\r\n"));
        let r = &coming(&c, &Zone::UTC, t("2026-11-16T09:00:00Z"), Duration::hours(36), &Defaults::default())[0];
        assert_eq!(planned(r, &Zone::UTC, false)["open"], "notes/Defence.md");
        let mail = ev(&format!("{MEETING}X-ATLAS-SOURCE:<abc@mail.example.org>\r\n{ALARM_15}END:VEVENT\r\n"));
        let r = &coming(&mail, &Zone::UTC, t("2026-11-16T09:00:00Z"), Duration::hours(36), &Defaults::default())[0];
        assert!(planned(r, &Zone::UTC, false).get("open").is_none(), "a Message-ID is not a note");
    }

    #[test]
    fn the_settings_words_read_as_minutes_before() {
        assert_eq!(setting(&json!("off")), None);
        assert_eq!(setting(&json!("")), None);
        assert_eq!(setting(&json!("at start")), Some(Trigger::before(0)));
        assert_eq!(setting(&json!("5 minutes")), Some(Trigger::before(5)));
        assert_eq!(setting(&json!("1 hour")), Some(Trigger::before(60)));
        assert_eq!(setting(&json!("1 day")), Some(Trigger::before(1440)));
        assert_eq!(setting(&json!(15)), Some(Trigger::before(15)));
        assert_eq!(setting(&json!("soon")), None);
    }
}
