//! ICS subscriptions: a public `.ics` by
//! `http(s)://` or `webcal://`, read-only, fetched again every N minutes — conditionally (ETag / Last-Modified), so an
//! unchanged calendar costs a 304.
use crate::ics;
use std::time::Duration;

/// What a fetch brought.
#[derive(Debug, PartialEq)]
pub enum Fetched {
    /// 304: what the cache has is current
    Same,
    Body { text: String, etag: Option<String>, modified: Option<String> },
}

/// `webcal://` and `webcals://` are `https://` (Apple's convention; servers rarely speak plain http any more).
pub fn address(url: &str) -> Result<String, String> {
    let t = url.trim();
    let lower = t.to_ascii_lowercase();
    let out = if let Some(rest) = lower.strip_prefix("webcals://").or_else(|| lower.strip_prefix("webcal://")) {
        let skip = t.len() - rest.len();
        format!("https://{}", &t[skip..])
    } else if lower.starts_with("http://") || lower.starts_with("https://") {
        t.to_string()
    } else if !t.is_empty() && !t.contains("://") {
        format!("https://{t}")
    } else {
        return Err(format!("{t:?} is not a calendar address: give an https:// or webcal:// one"));
    };
    url::Url::parse(&out).map(|u| u.to_string()).map_err(|e| format!("{t:?} is not an address: {e}"))
}

/// GET the calendar, conditionally.
pub fn fetch(url: &str, etag: Option<&str>, modified: Option<&str>) -> Result<Fetched, String> {
    let to = address(url)?;
    let http = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .user_agent(concat!("Atlas-calendar/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = http.get(&to).header("Accept", "text/calendar, */*;q=0.5");
    if let Some(e) = etag {
        req = req.header("If-None-Match", e);
    }
    if let Some(m) = modified {
        req = req.header("If-Modified-Since", m);
    }
    let host = url::Url::parse(&to).ok().and_then(|u| u.host_str().map(str::to_string)).unwrap_or_default();
    let r = req.send().map_err(|e| format!("cannot reach {host}: {e}"))?;
    let status = r.status().as_u16();
    if status == 304 {
        return Ok(Fetched::Same);
    }
    if !(200..300).contains(&status) {
        return Err(format!("{host} answered {status} for the subscription"));
    }
    let header = |k: &str| r.headers().get(k).and_then(|v| v.to_str().ok()).map(str::to_string);
    let (etag, modified) = (header("etag"), header("last-modified"));
    let text = r.text().map_err(|e| format!("{host}: the calendar could not be read: {e}"))?;
    if !text.contains("BEGIN:VCALENDAR") {
        return Err(format!("{host} did not answer a calendar (no BEGIN:VCALENDAR): is it the .ics address?"));
    }
    Ok(Fetched::Body { text, etag, modified })
}

/// A subscription's file as one calendar object per event UID: (key, text). The key is the UID (a subscription is
/// never written back, so it needs no server address).
pub fn objects(text: &str) -> Result<Vec<(String, String)>, String> {
    Ok(ics::split_invite(text)?.into_iter().map(|i| (i.uid, i.ics)).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn webcal_addresses_are_https_and_a_feed_splits_per_event() {
        assert_eq!(address("webcal://example.org/holidays.ics").unwrap(), "https://example.org/holidays.ics");
        assert_eq!(address("WEBCALS://Example.org/A.ics").unwrap(), "https://example.org/A.ics");
        assert_eq!(address("http://example.org/x.ics").unwrap(), "http://example.org/x.ics");
        assert!(address("ftp://x").is_err());
        let feed = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:Holidays\r\nBEGIN:VEVENT\r\nUID:h1@example.org\r\nSUMMARY:New Year\r\nDTSTART;VALUE=DATE:20270101\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:h2@example.org\r\nSUMMARY:Canada Day\r\nDTSTART;VALUE=DATE:20270701\r\nRRULE:FREQ=YEARLY\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let o = objects(feed).unwrap();
        assert_eq!(o.len(), 2);
        assert_eq!(o[1].0, "h2@example.org");
        assert!(o[1].1.contains("RRULE:FREQ=YEARLY") && !o[1].1.contains("METHOD"));
    }
}
