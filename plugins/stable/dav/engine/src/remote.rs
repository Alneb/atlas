//! An account's server, whatever it speaks: CalDAV (`caldav::Client`) or Exchange (`ews::Client`). Both offer the
//! same calls, so pulling (`pull`), editing (`api`) and the vault's dates (`sync`) are written once; address books
//! and WebDAV Push are CalDAV's only (`dav()`).
use crate::caldav::{Calendar, Client, CollectionState, Delta, Existing, Outcome, Result};
use crate::conf::{Card, Server};
use crate::ews;
use url::Url;

pub enum Remote {
    Dav(Client),
    Ews(ews::Client),
}

/// The same call on either client.
macro_rules! either {
    ($self:ident, $c:ident => $e:expr) => {
        match $self {
            Remote::Dav($c) => $e,
            Remote::Ews($c) => $e,
        }
    };
}

impl Remote {
    /// The client of an account card.
    pub fn of(card: &Card) -> Result<Remote> {
        match card.server {
            Server::Caldav => Client::new(&card.account).map(Remote::Dav),
            Server::Exchange => ews::Client::new(&card.account.user).map(Remote::Ews),
        }
    }

    /// The CalDAV client, for what only CalDAV has (contacts, push).
    pub fn dav(&self) -> Option<&Client> {
        match self {
            Remote::Dav(c) => Some(c),
            Remote::Ews(_) => None,
        }
    }

    pub fn base(&self) -> &Url {
        either!(self, c => c.base())
    }
    pub fn discover(&self) -> Result<Vec<Calendar>> {
        either!(self, c => c.discover())
    }
    pub fn state(&self, coll: &Url) -> Result<CollectionState> {
        either!(self, c => c.state(coll))
    }
    pub fn listing(&self, coll: &Url) -> Result<Vec<(String, Option<String>)>> {
        either!(self, c => c.listing(coll))
    }
    pub fn changes(&self, coll: &Url, token: &str) -> Result<Delta> {
        either!(self, c => c.changes(coll, token))
    }
    pub fn multiget(&self, coll: &Url, hrefs: &[String], card: bool) -> Result<Vec<(String, Option<String>, String)>> {
        either!(self, c => c.multiget(coll, hrefs, card))
    }
    pub fn fetch(&self, href: &Url) -> Result<Option<(Option<String>, String)>> {
        either!(self, c => c.fetch(href))
    }
    pub fn write(&self, href: &Url, text: &str, if_match: Option<&str>) -> Result<Option<String>> {
        either!(self, c => c.write(href, text, if_match))
    }
    pub fn erase(&self, href: &Url, etag: Option<&str>) -> Result<bool> {
        either!(self, c => c.erase(href, etag))
    }
    pub fn find_uid(&self, cal: &Url, uid: &str) -> Result<Option<(Url, Option<String>, String)>> {
        either!(self, c => c.find_uid(cal, uid))
    }
    pub fn upsert(&self, cal: &Url, uid: &str, text: &str, hash: Option<&str>, existing: Existing) -> Result<(Outcome, Url)> {
        either!(self, c => c.upsert(cal, uid, text, hash, existing))
    }
    pub fn remove(&self, cal: &Url, uid: &str) -> Result<bool> {
        either!(self, c => c.remove(cal, uid))
    }
}
