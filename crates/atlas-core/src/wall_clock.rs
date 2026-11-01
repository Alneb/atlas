//! A wall-clock time as an instant: atlas-text's one rule (a time the clocks skip is read an hour later).
pub use atlas_text::wall_clock::at;

#[cfg(test)]
mod tests {
    #[test]
    fn a_midnight_the_clocks_skip_is_one_oclock() {
        // Santiago de Chile moved its clocks from 00:00 to 01:00 on 2026-09-06
        let tz: chrono_tz::Tz = "America/Santiago".parse().unwrap();
        let day = chrono::NaiveDate::from_ymd_opt(2026, 9, 6).unwrap().and_hms_opt(0, 0, 0).unwrap();
        assert_eq!(super::at(day, &tz).map(|d| d.naive_local().format("%H:%M").to_string()).as_deref(), Some("01:00"));
    }
}
