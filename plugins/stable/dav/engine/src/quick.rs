//! Quick add (DESIGN-calendar §1, Fantastical's idea): an event from a line of text in English, Spanish or French —
//! "lunch with Ana tomorrow 13:00", "exam 15 nov", "réunion lundi à 10h pendant 2h @ D3", "gym cada lunes 7:00".
//! What is understood is cut out of the text; what is left is the title. Times are the user's wall clock.
use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime, Weekday};
use regex::Regex;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Quick {
    pub title: String,
    pub all_day: bool,
    /// `2026-11-15` (all-day) or `2026-11-15T13:00`
    pub start: String,
    /// exclusive for all-day events (the day after)
    pub end: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rrule: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    /// the pieces read, for the preview ("tomorrow", "13:00")
    pub understood: Vec<String>,
}

const MONTHS: &[(&str, u32)] = &[
    ("january", 1), ("janvier", 1), ("janv", 1), ("enero", 1), ("jan", 1), ("ene", 1),
    ("february", 2), ("février", 2), ("fevrier", 2), ("febrero", 2), ("févr", 2), ("fev", 2), ("feb", 2),
    ("march", 3), ("marzo", 3), ("mars", 3), ("mar", 3),
    ("april", 4), ("abril", 4), ("avril", 4), ("apr", 4), ("abr", 4), ("avr", 4),
    ("mayo", 5), ("may", 5), ("mai", 5),
    ("june", 6), ("junio", 6), ("juin", 6), ("jun", 6),
    ("july", 7), ("julio", 7), ("juillet", 7), ("juil", 7), ("jul", 7),
    ("august", 8), ("agosto", 8), ("août", 8), ("aout", 8), ("aug", 8), ("ago", 8),
    ("september", 9), ("septiembre", 9), ("setiembre", 9), ("septembre", 9), ("sept", 9), ("sep", 9), ("set", 9),
    ("october", 10), ("octubre", 10), ("octobre", 10), ("oct", 10),
    ("november", 11), ("noviembre", 11), ("novembre", 11), ("nov", 11),
    ("december", 12), ("diciembre", 12), ("décembre", 12), ("decembre", 12), ("déc", 12), ("dec", 12), ("dic", 12),
];

const DAYS: &[(&str, Weekday)] = &[
    ("monday", Weekday::Mon), ("lunes", Weekday::Mon), ("lundi", Weekday::Mon), ("mon", Weekday::Mon),
    ("tuesday", Weekday::Tue), ("martes", Weekday::Tue), ("mardi", Weekday::Tue), ("tues", Weekday::Tue), ("tue", Weekday::Tue),
    ("wednesday", Weekday::Wed), ("miércoles", Weekday::Wed), ("miercoles", Weekday::Wed), ("mercredi", Weekday::Wed), ("wed", Weekday::Wed),
    ("thursday", Weekday::Thu), ("jueves", Weekday::Thu), ("jeudi", Weekday::Thu), ("thurs", Weekday::Thu), ("thu", Weekday::Thu),
    ("friday", Weekday::Fri), ("viernes", Weekday::Fri), ("vendredi", Weekday::Fri), ("fri", Weekday::Fri),
    ("saturday", Weekday::Sat), ("sábado", Weekday::Sat), ("sabado", Weekday::Sat), ("samedi", Weekday::Sat), ("sat", Weekday::Sat),
    ("sunday", Weekday::Sun), ("domingo", Weekday::Sun), ("dimanche", Weekday::Sun), ("sun", Weekday::Sun),
];

fn alt<T>(list: &[(&str, T)]) -> String {
    list.iter().map(|(w, _)| regex::escape(w)).collect::<Vec<_>>().join("|")
}

fn month(w: &str) -> Option<u32> {
    let w = w.to_lowercase();
    MONTHS.iter().find(|(m, _)| *m == w.trim_end_matches('.')).map(|(_, n)| *n)
}

fn weekday(w: &str) -> Option<Weekday> {
    let w = w.to_lowercase();
    DAYS.iter().find(|(d, _)| *d == w).map(|(_, n)| *n)
}

fn byday(w: Weekday) -> &'static str {
    ["MO", "TU", "WE", "TH", "FR", "SA", "SU"][w.num_days_from_monday() as usize]
}

/// The text with matched pieces blanked out (same length, so later matches keep their places).
struct Text {
    s: String,
    understood: Vec<String>,
}

impl Text {
    /// The first match of `re`, cut out; its captures handed to `f`, which says whether it is taken.
    fn take<T>(&mut self, re: &str, f: impl Fn(&regex::Captures) -> Option<T>) -> Option<T> {
        let re = Regex::new(&format!("(?i){re}")).expect("pattern");
        let (range, value) = re.captures_iter(&self.s).find_map(|c| {
            let m = c.get(0)?;
            f(&c).map(|v| (m.range(), v))
        })?;
        self.understood.push(self.s[range.clone()].trim().to_string());
        let blank = " ".repeat(self.s[range.clone()].len());
        self.s.replace_range(range, &blank);
        Some(value)
    }
}

const B: &str = r"(?:^|\b|\s)";
const E: &str = r"(?:\b|$)";

fn hm(h: &str, m: Option<&str>, ampm: Option<&str>, bare: bool) -> Option<NaiveTime> {
    let mut h: u32 = h.parse().ok()?;
    let m: u32 = m.map(|x| x.parse().unwrap_or(0)).unwrap_or(0);
    match ampm.map(|x| x.to_lowercase().replace('.', "")) {
        Some(p) if p == "pm" && h < 12 => h += 12,
        Some(p) if p == "am" && h == 12 => h = 0,
        // "at 3" with no am/pm: an afternoon hour, as calendars read it
        None if bare && (1..=7).contains(&h) => h += 12,
        _ => {}
    }
    NaiveTime::from_hms_opt(h, m, 0)
}

const T: &str = r"(\d{1,2})(?:[:h.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|h(?:rs?)?)?";

/// A time token's captures from index `i`: (hour, minute, am/pm or h).
fn time_at(c: &regex::Captures, i: usize, bare: bool) -> Option<NaiveTime> {
    let suffix = c.get(i + 2).map(|x| x.as_str());
    let ampm = suffix.filter(|s| !s.to_lowercase().starts_with('h'));
    // a bare number is a time only after "at" / "à" / "a las", or with ':' / 'h' / am-pm
    let marked = c.get(i + 1).is_some() || suffix.is_some();
    if !bare && !marked {
        return None;
    }
    hm(c.get(i)?.as_str(), c.get(i + 1).map(|x| x.as_str()), ampm, bare && !marked)
}

/// Reads `text` relative to `now`.
pub fn parse(text: &str, now: NaiveDateTime) -> Quick {
    let today = now.date();
    let mut t = Text { s: format!(" {} ", text.trim()), understood: vec![] };
    let months = alt(MONTHS);
    let days = alt(DAYS);

    let location = t.take(r"\s@\s*([^@]+?)\s*$", |c| Some(c[1].trim().to_string()));

    // repeats: "every monday", "cada lunes", "chaque lundi", "tous les lundis", "daily"…
    let mut repeat_day: Option<Weekday> = None;
    let rrule = t
        .take(&format!(r"{B}(?:every|each|cada|chaque|tous\s+les|todos\s+los)\s+({days})s?{E}"), |c| {
            let w = weekday(&c[1])?;
            Some((format!("FREQ=WEEKLY;BYDAY={}", byday(w)), Some(w)))
        })
        .or_else(|| {
            t.take(
                r"(?:^|\s)(?:(?:every|each|cada|chaque|tous\s+les|todos\s+los)\s+(day|days|week|month|year|día|dias|días|semana|mes|año|jour|jours|semaine|mois|an|ans|année)|(daily|weekly|monthly|yearly|annually|diario|diariamente|semanal|semanalmente|mensual|anual|quotidien|hebdomadaire|mensuel|annuel))\b",
                |c| {
                    let w = c.get(1).or(c.get(2))?.as_str().to_lowercase();
                    let f = match w.as_str() {
                        "day" | "days" | "día" | "dias" | "días" | "jour" | "jours" | "daily" | "diario" | "diariamente" | "quotidien" => "DAILY",
                        "week" | "semana" | "semaine" | "weekly" | "semanal" | "semanalmente" | "hebdomadaire" => "WEEKLY",
                        "month" | "mes" | "mois" | "monthly" | "mensual" | "mensuel" => "MONTHLY",
                        _ => "YEARLY",
                    };
                    Some((format!("FREQ={f}"), None))
                },
            )
        })
        .map(|(r, w)| {
            repeat_day = w;
            r
        });

    let all_day = t.take(r"(?:^|\s)(all[\s-]day|todo\s+el\s+d[ií]a|toute\s+la\s+journ[ée]e)\b", |_| Some(())).is_some();

    // a time range: "13:00-14:30", "from 10 to 12", "de 10h à 12h", "de 10 a 12"
    let mut range = t.take(
        &format!(r"(?:^|\s)(?:from|de|desde|entre)?\s*{T}\s*(?:-|–|to|until|till|à|a|hasta|jusqu'à|y)\s*{T}{E}"),
        |c| {
            let has_from = c.get(0).is_some_and(|m| {
                let w = m.as_str().trim_start().to_lowercase();
                ["from", "de", "desde", "entre"].iter().any(|p| w.starts_with(p))
            });
            let a = time_at(c, 1, has_from)?;
            let b = time_at(c, 4, true)?;
            Some((a, b))
        },
    );
    let at = if range.is_some() {
        None
    } else {
        t.take(&format!(r"(?:^|\s)(?:at|a\s+las|a\s+la|à|vers|around|@)\s*{T}{E}"), |c| time_at(c, 1, true))
            .or_else(|| t.take(r"(?:^|\s)(?:at\s+|à\s+|a\s+las\s+)?(noon|midday|mediod[ií]a|midi)\b", |_| NaiveTime::from_hms_opt(12, 0, 0)))
            .or_else(|| t.take(&format!(r"(?:^|\s){T}{E}"), |c| time_at(c, 1, false)))
    };
    let length = t.take(
        r"(?:^|\s)(?:for|durante|pendant|during)\s+(\d+(?:[.,]\d+)?)\s*(h|hrs?|hours?|horas?|heures?|m|mins?|minutes?|minutos?)\b",
        |c| {
            let n: f64 = c[1].replace(',', ".").parse().ok()?;
            let mins = if c[2].to_lowercase().starts_with('m') { n } else { n * 60.0 };
            Some(Duration::minutes(mins.round() as i64))
        },
    );

    // the day
    let next_year = |d: NaiveDate| if d < today - Duration::days(1) { d.with_year(d.year() + 1).unwrap_or(d) } else { d };
    let date = t
        .take(r"(?:^|\s)(\d{4})-(\d{2})-(\d{2})\b", |c| NaiveDate::from_ymd_opt(c[1].parse().ok()?, c[2].parse().ok()?, c[3].parse().ok()?))
        .or_else(|| {
            t.take(&format!(r"(?:^|\s)(?:on\s+|the\s+|el\s+|le\s+)?(\d{{1,2}})(?:st|nd|rd|th|er|º|°)?\s+(?:de\s+|of\s+)?({months})\.?(?:\s+(?:de\s+)?(\d{{4}}))?{E}"), |c| {
                let d = NaiveDate::from_ymd_opt(c.get(3).map_or(Some(today.year()), |y| y.as_str().parse().ok())?, month(&c[2])?, c[1].parse().ok()?)?;
                Some(if c.get(3).is_some() { d } else { next_year(d) })
            })
        })
        .or_else(|| {
            t.take(&format!(r"(?:^|\s)(?:on\s+)?({months})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:,?\s+(\d{{4}}))?{E}"), |c| {
                let d = NaiveDate::from_ymd_opt(c.get(3).map_or(Some(today.year()), |y| y.as_str().parse().ok())?, month(&c[1])?, c[2].parse().ok()?)?;
                Some(if c.get(3).is_some() { d } else { next_year(d) })
            })
        })
        .or_else(|| {
            // 15/11 or 15/11/2026: day first, as the user writes it
            t.take(r"(?:^|\s)(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", |c| {
                let y = match c.get(3) {
                    Some(y) => {
                        let y: i32 = y.as_str().parse().ok()?;
                        if y < 100 { 2000 + y } else { y }
                    }
                    None => today.year(),
                };
                let d = NaiveDate::from_ymd_opt(y, c[2].parse().ok()?, c[1].parse().ok()?)?;
                Some(if c.get(3).is_some() { d } else { next_year(d) })
            })
        })
        .or_else(|| t.take(r"(?:^|\s)(day\s+after\s+tomorrow|pasado\s+mañana|pasado\s+manana|après-demain|apres-demain)\b", |_| Some(today + Duration::days(2))))
        .or_else(|| t.take(r"(?:^|\s)(today|tonight|hoy|esta\s+noche|aujourd'hui|ce\s+soir)(?:\s|$)", |_| Some(today)))
        .or_else(|| t.take(r"(?:^|\s)(tomorrow|tmrw|mañana|manana|demain)(?:\s|$)", |_| Some(today + Duration::days(1))))
        .or_else(|| {
            t.take(r"(?:^|\s)(?:in|en|dans)\s+(\d+)\s+(days?|d[ií]as|jours?|weeks?|semanas?|semaines?)\b", |c| {
                let n: i64 = c[1].parse().ok()?;
                let w = c[2].to_lowercase();
                Some(today + if w.starts_with('d') || w.starts_with('j') { Duration::days(n) } else { Duration::weeks(n) })
            })
        })
        .or_else(|| {
            t.take(&format!(r"(?:^|\s)(?:(next|this|on|el|le|ce|este|el\s+pr[oó]ximo|pr[oó]ximo)\s+)?({days}){E}(?:\s+(prochain|que\s+viene|pr[oó]ximo))?"), |c| {
                let w = weekday(&c[2])?;
                let ahead = (w.num_days_from_monday() as i64 - today.weekday().num_days_from_monday() as i64 + 7) % 7;
                let this = c.get(1).is_some_and(|p| matches!(p.as_str().to_lowercase().as_str(), "this" | "ce" | "este"));
                Some(today + Duration::days(if ahead == 0 && !this { 7 } else { ahead }))
            })
        })
        .or_else(|| {
            repeat_day.map(|w| {
                let ahead = (w.num_days_from_monday() as i64 - today.weekday().num_days_from_monday() as i64 + 7) % 7;
                today + Duration::days(ahead)
            })
        });

    // the title: what is left, without the little words the cuts left at its ends
    let glue = ["at", "on", "from", "to", "in", "el", "la", "le", "a", "à", "de", "des", "du", "en", "the", "las", "los", "et", "y", "and", "por", "pour", "for", "vers", "around", "the", "of", "next", "this", "ce", "este", ",", "-"];
    let mut words: Vec<&str> = t.s.split_whitespace().collect();
    while words.last().is_some_and(|w| glue.contains(&w.to_lowercase().as_str())) {
        words.pop();
    }
    while words.first().is_some_and(|w| glue.contains(&w.to_lowercase().as_str())) {
        words.remove(0);
    }
    let title = words.join(" ");

    let timed_start = range.as_ref().map(|r| r.0).or(at);
    let (all_day, start, end) = match (timed_start, date) {
        (Some(st), d) if !all_day => {
            let day = d.unwrap_or(today);
            let s = day.and_time(st);
            let e = match (range.take(), length) {
                (Some((_, b)), _) => {
                    let e = day.and_time(b);
                    if e <= s { e + Duration::days(1) } else { e }
                }
                (None, Some(l)) => s + l,
                (None, None) => s + Duration::hours(1),
            };
            (false, s.format("%Y-%m-%dT%H:%M").to_string(), e.format("%Y-%m-%dT%H:%M").to_string())
        }
        (_, Some(d)) => {
            let days = length.map(|l| (l.num_hours() / 24).max(1)).unwrap_or(1);
            (true, d.to_string(), (d + Duration::days(days)).to_string())
        }
        (_, None) if all_day => (true, today.to_string(), (today + Duration::days(1)).to_string()),
        (_, None) => {
            // nothing said about when: the next full hour, as a calendar's new event
            let s = (now + Duration::hours(1)).date().and_hms_opt((now + Duration::hours(1)).time().format("%H").to_string().parse().unwrap_or(0), 0, 0).unwrap_or(now);
            let e = s + length.unwrap_or(Duration::hours(1));
            (false, s.format("%Y-%m-%dT%H:%M").to_string(), e.format("%Y-%m-%dT%H:%M").to_string())
        }
    };
    Quick { title, all_day, start, end, rrule, location, understood: t.understood }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Friday 2026-10-23, 09:30
    fn now() -> NaiveDateTime {
        NaiveDateTime::parse_from_str("2026-10-23 09:30", "%Y-%m-%d %H:%M").unwrap()
    }
    fn q(s: &str) -> (String, String, String, bool) {
        let r = parse(s, now());
        (r.title, r.start, r.end, r.all_day)
    }
    fn tup(a: &str, b: &str, c: &str, d: bool) -> (String, String, String, bool) {
        (a.into(), b.into(), c.into(), d)
    }

    #[test]
    fn english() {
        assert_eq!(q("lunch with Ana tomorrow 13:00"), tup("lunch with Ana", "2026-10-24T13:00", "2026-10-24T14:00", false));
        assert_eq!(q("exam 15 nov"), tup("exam", "2026-11-15", "2026-11-16", true));
        assert_eq!(q("Call Bo at 3pm for 30 min"), tup("Call Bo", "2026-10-23T15:00", "2026-10-23T15:30", false));
        assert_eq!(q("seminar next tuesday from 10 to 11:30"), tup("seminar", "2026-10-27T10:00", "2026-10-27T11:30", false));
        assert_eq!(q("Dentist on December 3rd at 9am"), tup("Dentist", "2026-12-03T09:00", "2026-12-03T10:00", false));
        assert_eq!(q("trip 2027-01-10 all day"), tup("trip", "2027-01-10", "2027-01-11", true));
        assert_eq!(q("party friday at 7"), tup("party", "2026-10-30T19:00", "2026-10-30T20:00", false), "a bare 7 after 'at' is the evening");
        assert_eq!(q("report due in 3 days"), tup("report due", "2026-10-26", "2026-10-27", true));
        assert_eq!(q("Old thing 1 jan"), tup("Old thing", "2027-01-01", "2027-01-02", true), "a passed date is next year's");
    }

    #[test]
    fn spanish_and_french() {
        assert_eq!(q("comida con Ana mañana a las 14"), tup("comida con Ana", "2026-10-24T14:00", "2026-10-24T15:00", false));
        assert_eq!(q("examen el 15 de noviembre"), tup("examen", "2026-11-15", "2026-11-16", true));
        assert_eq!(q("réunion lundi à 10h pendant 2h"), tup("réunion", "2026-10-26T10:00", "2026-10-26T12:00", false));
        assert_eq!(q("cours de 10h à 12h demain"), tup("cours", "2026-10-24T10:00", "2026-10-24T12:00", false));
        assert_eq!(q("dîner après-demain 19h30"), tup("dîner", "2026-10-25T19:30", "2026-10-25T20:30", false));
        assert_eq!(q("cita médica 3/11 9:15"), tup("cita médica", "2026-11-03T09:15", "2026-11-03T10:15", false));
        assert_eq!(q("congreso 2 de diciembre de 2026"), tup("congreso", "2026-12-02", "2026-12-03", true));
    }

    #[test]
    fn repeats_places_and_nothing_said() {
        let r = parse("gym cada lunes 7:00 @ Sports centre", now());
        assert_eq!((r.title.as_str(), r.start.as_str(), r.rrule.as_deref(), r.location.as_deref()), ("gym", "2026-10-26T07:00", Some("FREQ=WEEKLY;BYDAY=MO"), Some("Sports centre")));
        assert_eq!(parse("standup every day 9:15", now()).rrule.as_deref(), Some("FREQ=DAILY"));
        assert_eq!(parse("réunion chaque mardi à 14h", now()).start, "2026-10-27T14:00");
        let r = parse("think about chapter 3", now());
        assert_eq!((r.title.as_str(), r.start.as_str(), r.all_day), ("think about chapter 3", "2026-10-23T10:00", false));
        assert!(parse("lunch tomorrow 13:00", now()).understood.contains(&"tomorrow".to_string()));
    }
}
