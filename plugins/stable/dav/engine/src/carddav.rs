//! Contacts (CardDAV, RFC 6352) on the same server, user and app password as the calendars: the address books found
//! from the account (addressbook-home-set), their vCards read for name, addresses and organisation — for Email's
//! address autocomplete.
use crate::caldav::{as_dir, Client, DavError, Result};
use crate::ics;
use crate::store::Contact;
use crate::xml::{CARDDAV, DAV};
use url::Url;

/// An address book collection.
#[derive(Debug, Clone, PartialEq)]
pub struct Book {
    pub url: Url,
    pub name: String,
}

impl Client {
    /// The user's address books: the principal's addressbook-home-set (from the address given, the server's
    /// `/.well-known/carddav`, or the CalDAV address with `caldav` read as `carddav`, as RustiCal lays them out).
    pub fn books(&self) -> Result<Vec<Book>> {
        let base = self.base().clone();
        let mut tries: Vec<Url> = vec![base.clone()];
        if let Ok(w) = base.join("/.well-known/carddav") {
            tries.push(w);
        }
        if base.path().contains("caldav") {
            if let Ok(u) = base.join(&base.path().replace("caldav", "carddav")) {
                tries.push(u);
            }
        }
        let mut last = None;
        for at in tries {
            match self.book_home(&at) {
                Ok(Some(home)) => {
                    let (at, rs) = self.propfind(&home, "1", "<d:resourcetype/><d:displayname/>")?;
                    return Ok(rs
                        .iter()
                        .filter(|r| r.prop(DAV, "resourcetype").is_some_and(|t| t.child(CARDDAV, "addressbook").is_some()))
                        .filter_map(|r| {
                            let url = as_dir(at.join(&r.href).ok()?);
                            let name = r.text(DAV, "displayname").unwrap_or_else(|| url.path().to_string());
                            Some(Book { url, name })
                        })
                        .collect());
                }
                Ok(None) => {}
                Err(e @ DavError::Auth { .. }) | Err(e @ DavError::Network { .. }) => return Err(e),
                Err(e) => last = Some(e),
            }
        }
        match last {
            Some(e) => Err(e),
            None => Ok(vec![]),
        }
    }

    fn book_home(&self, at: &Url) -> Result<Option<Url>> {
        let (u, rs) = self.propfind(at, "0", "<d:current-user-principal/><card:addressbook-home-set/>")?;
        if let Some(h) = rs.iter().find_map(|r| r.href_in(CARDDAV, "addressbook-home-set")) {
            return Ok(u.join(&h).ok().map(as_dir));
        }
        let Some(p) = rs.iter().find_map(|r| r.href_in(DAV, "current-user-principal")).and_then(|h| u.join(&h).ok()) else {
            return Ok(None);
        };
        let (u, rs) = self.propfind(&p, "0", "<card:addressbook-home-set/>")?;
        Ok(rs.iter().find_map(|r| r.href_in(CARDDAV, "addressbook-home-set")).and_then(|h| u.join(&h).ok()).map(as_dir))
    }

    /// Every card of an address book: (address, ETag, contact).
    pub fn cards(&self, book: &Url) -> Result<Vec<(String, Option<String>, Contact)>> {
        let hrefs: Vec<String> = self.listing(book)?.into_iter().map(|(h, _)| h).collect();
        let got = self.multiget(book, &hrefs, true)?;
        Ok(got.into_iter().flat_map(|(h, e, text)| vcards(&text).into_iter().map(move |c| (h.clone(), e.clone(), c))).collect())
    }
}

/// The contacts of vCard text (3.0 / 4.0): FN (else N), every EMAIL, ORG's first part.
pub fn vcards(text: &str) -> Vec<Contact> {
    let Ok(top) = ics::parse(text) else { return vec![] };
    top.iter()
        .filter(|c| c.name == "VCARD")
        .filter_map(|c| {
            let emails: Vec<String> = c
                .props
                .iter()
                .filter(|l| l.name == "EMAIL" || l.name.ends_with(".EMAIL"))
                .map(|l| ics::unescape(l.value.trim().trim_start_matches("mailto:")))
                .filter(|e| e.contains('@'))
                .collect();
            let name = c.text("FN").or_else(|| {
                // N: family;given;additional;prefix;suffix
                c.prop("N").map(|l| {
                    let p: Vec<String> = l.value.split(';').map(ics::unescape).collect();
                    [p.get(1), p.first()].iter().flatten().filter(|s| !s.is_empty()).map(|s| s.as_str()).collect::<Vec<_>>().join(" ")
                })
            });
            let name = name.filter(|n| !n.trim().is_empty()).or_else(|| emails.first().cloned())?;
            let org = c.prop("ORG").map(|l| ics::unescape(l.value.split(';').next().unwrap_or(""))).filter(|o| !o.is_empty());
            Some(Contact { name: name.trim().to_string(), emails, org })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vcards_give_names_addresses_and_organisations() {
        let t = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ana Ruiz\r\nN:Ruiz;Ana;;;\r\nEMAIL;TYPE=INTERNET;TYPE=WORK:ana@example.org\r\nitem1.EMAIL:ana.ruiz@example.net\r\nORG:Physics\\, UdeS;Theory\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:4.0\r\nN:Lee;Bo;;;\r\nEMAIL:mailto:bo@example.com\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:4.0\r\nEMAIL:only@example.com\r\nEND:VCARD\r\n";
        let c = vcards(t);
        assert_eq!(c.len(), 3);
        assert_eq!(c[0], Contact { name: "Ana Ruiz".into(), emails: vec!["ana@example.org".into(), "ana.ruiz@example.net".into()], org: Some("Physics, UdeS".into()) });
        assert_eq!((c[1].name.as_str(), c[1].emails[0].as_str()), ("Bo Lee", "bo@example.com"));
        assert_eq!(c[2].name, "only@example.com", "no name: the address");
    }
}
