//! Invitations answered from Email (DESIGN-calendar §4): the user's answer written on their ATTENDEE line, the mail
//! it came from kept as X-ATLAS-SOURCE, and "is this the same as what the calendar has" without the stamps.
use crate::ics::{self, escape};

/// `mailto:Ana@Example.org` and `ana@example.org` are one address.
pub fn same_address(a: &str, b: &str) -> bool {
    let n = |s: &str| {
        let t = s.trim();
        t.strip_prefix("mailto:").or_else(|| t.strip_prefix("MAILTO:")).unwrap_or(t).trim().to_lowercase()
    };
    n(a) == n(b)
}

/// The calendar object with the user's PARTSTAT on their ATTENDEE line(s) (RSVP answered), the mail as
/// X-ATLAS-SOURCE, and — for a cancellation — every event marked cancelled.
pub fn prepare(text: &str, attendee: Option<&str>, partstat: Option<&str>, source: Option<&str>, cancel: bool) -> Result<String, String> {
    let mut cal = ics::parse(text)?.into_iter().find(|c| c.name == "VCALENDAR").ok_or("no calendar in the invitation")?;
    for ev in cal.subs.iter_mut().filter(|c| c.name == "VEVENT") {
        if let Some(me) = attendee.map(str::trim).filter(|m| !m.is_empty()) {
            // who the user is in this event, so a later look (invite_status with only the ics) finds their answer
            ev.set("X-ATLAS-ME", vec![], format!("mailto:{}", me.trim_start_matches("mailto:")));
        }
        if let (Some(me), Some(ps)) = (attendee, partstat) {
            for l in ev.props.iter_mut().filter(|l| l.name == "ATTENDEE" && same_address(&l.value, me)) {
                l.params.retain(|(k, _)| k != "PARTSTAT" && k != "RSVP");
                l.params.push(("PARTSTAT".into(), ps.to_ascii_uppercase()));
            }
        }
        if let Some(s) = source.map(str::trim).filter(|s| !s.is_empty()) {
            if ev.prop("X-ATLAS-SOURCE").is_none() {
                ev.set("X-ATLAS-SOURCE", vec![], escape(s));
            }
        }
        if cancel {
            ev.set("STATUS", vec![], "CANCELLED");
        }
    }
    Ok(cal.write())
}

/// The user's address recorded by `prepare` (X-ATLAS-ME).
pub fn me(text: &str) -> Option<String> {
    let cal = ics::parse(text).ok()?;
    cal.iter().flat_map(|c| c.subs.iter()).find_map(|e| e.text("X-ATLAS-ME"))
}

/// The user's PARTSTAT in a calendar object.
pub fn partstat(text: &str, attendee: &str) -> Option<String> {
    let cal = ics::parse(text).ok()?;
    cal.iter().flat_map(|c| c.subs.iter()).filter(|c| c.name == "VEVENT").flat_map(|e| e.props.iter()).find(|l| l.name == "ATTENDEE" && same_address(&l.value, attendee)).map(|l| l.param("PARTSTAT").unwrap_or("NEEDS-ACTION").to_ascii_uppercase())
}

/// The object's text without what changes on every write (stamps), its lines sorted: two equal ones say the same.
pub fn canonical(text: &str) -> String {
    let mut lines: Vec<String> = ics::unfold(text)
        .lines()
        .map(|l| l.trim_end().to_string())
        .filter(|l| !l.is_empty() && !["DTSTAMP", "LAST-MODIFIED", "PRODID", "X-ATLAS-SOURCE"].iter().any(|k| l.starts_with(&format!("{k}:")) || l.starts_with(&format!("{k};"))))
        .collect();
    lines.sort();
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const INV: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:m1@example.org\r\nDTSTAMP:20261020T100000Z\r\nSUMMARY:Committee\r\nDTSTART:20261104T150000Z\r\nORGANIZER;CN=Prof:mailto:prof@example.org\r\nATTENDEE;CN=Me;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:ME@example.org\r\nATTENDEE;PARTSTAT=ACCEPTED:mailto:other@example.org\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

    #[test]
    fn the_answer_goes_on_the_users_line_only() {
        let t = prepare(INV, Some("me@example.org"), Some("accepted"), Some("<m1@mail.example.org>"), false).unwrap();
        assert!(t.contains("ATTENDEE;CN=Me;PARTSTAT=ACCEPTED:mailto:ME@example.org"), "{t}");
        assert!(t.contains("ATTENDEE;PARTSTAT=ACCEPTED:mailto:other@example.org"));
        assert!(t.contains("X-ATLAS-SOURCE:<m1@mail.example.org>"));
        assert_eq!(me(&t).as_deref(), Some("mailto:me@example.org"));
        assert_eq!(partstat(&t, "mailto:me@example.org").as_deref(), Some("ACCEPTED"));
        assert_eq!(partstat(INV, "me@example.org").as_deref(), Some("NEEDS-ACTION"));
        assert!(prepare(INV, None, None, None, true).unwrap().contains("STATUS:CANCELLED"));
    }

    #[test]
    fn stamps_do_not_make_a_difference() {
        let a = canonical(INV);
        assert_eq!(a, canonical(&INV.replace("DTSTAMP:20261020T100000Z", "DTSTAMP:20261023T080000Z")));
        assert_ne!(a, canonical(&INV.replace("T150000Z", "T160000Z")));
    }
}
