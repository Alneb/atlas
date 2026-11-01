//! A time on the wall clock as an instant, for the core and the calendar and mail engines alike. One the clocks skip (a
//! spring-forward gap) is read as the wall clock reads an hour later, just past the gap (RFC 5545 reads it with the
//! offset before the gap: the same instant for an hour's change); one they pass twice (falling back) is its first.
use chrono::{DateTime, NaiveDateTime, TimeZone};

/// `at` in `tz`; None only when neither it nor an hour later is a time there.
pub fn at<Tz: TimeZone>(at: NaiveDateTime, tz: &Tz) -> Option<DateTime<Tz>> {
    at.and_local_timezone(tz.clone()).earliest().or_else(|| (at + chrono::Duration::hours(1)).and_local_timezone(tz.clone()).earliest())
}
