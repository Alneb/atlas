//! Exchange accounts (Outlook / Microsoft 365) over Exchange Web Services: the same calls as the CalDAV client
//! (`remote::Remote` picks one), so pulling, editing and invitations are unchanged.
//!
//! - **Sign-in**: none of its own. The Email plugin redeems its Outlook account's refresh token (same address) for an
//!   EWS token (`calendar_token`); Thunderbird's application, which Email signs in as, is granted EWS on that sign-in.
//! - **Addresses**: a calendar is `ENDPOINT/<mailbox>/<slug of its name>/`, an event `<calendar>/<uid>.ics` as on a
//!   CalDAV server; the folder and item ids behind them are kept in memory (`FOLDERS`, `ITEMS`), filled by
//!   listing. The ETag is the item's ChangeKey.
//! - **Content**: iCalendar both ways (`MimeContent`). Exchange takes iCalendar on create but ignores it on update, so
//!   an update writes the new version first, then removes the old one (same UID: for attendees it is the meeting
//!   updated). A meeting the mailbox organises sends its invitations and cancellations; anything else sends nothing.
use crate::caldav::{network_why, Calendar, CollectionState, Delta, DavError, Existing, Outcome, Result};
use crate::ics;
use crate::uid::resource_name;
use crate::xml::{self, Node};
use base64::Engine;
use reqwest::blocking::Client as Http;
use serde_json::json;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use url::Url;

/// Exchange Online's EWS address.
pub const ENDPOINT: &str = "https://outlook.office365.com/EWS/Exchange.asmx";
const T: &str = "http://schemas.microsoft.com/exchange/services/2006/types";
const M: &str = "http://schemas.microsoft.com/exchange/services/2006/messages";
/// Items per FindItem page and per GetItem.
const PAGE: usize = 250;
const BATCH: usize = 50;

/// A calendar's address → its folder id (filled by `discover`).
static FOLDERS: LazyLock<Mutex<HashMap<String, String>>> = LazyLock::new(Default::default);
/// An event's address → (item id, ChangeKey) (filled by listing, kept by writes).
static ITEMS: LazyLock<Mutex<HashMap<String, (String, String)>>> = LazyLock::new(Default::default);

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|p| p.into_inner())
}

pub struct Client {
    http: Http,
    user: String,
    token: String,
    base: Url,
}

/// What to tell attendees when writing or removing an item: only a meeting this mailbox organises has anyone to tell.
fn tells(text: &str, user: &str) -> &'static str {
    let t = ics::unfold(text).to_ascii_lowercase();
    let mine = t.lines().any(|l| l.starts_with("organizer") && l.ends_with(&format!("mailto:{}", user.to_ascii_lowercase())));
    if mine && t.lines().any(|l| l.starts_with("attendee")) { "SendToAllAndSaveCopy" } else { "SendToNone" }
}

/// A calendar's name as an address segment: `Calendrier` → `calendrier`, `Team (old)` → `team-old`.
fn slug(name: &str) -> String {
    let mut s = String::new();
    for c in name.to_lowercase().chars() {
        if c.is_alphanumeric() {
            s.push(c);
        } else if !s.ends_with('-') && !s.is_empty() {
            s.push('-');
        }
    }
    let s = s.trim_end_matches('-').to_string();
    if s.is_empty() { "calendar".into() } else { s }
}

/// Every element with this name below `n`, depth first.
fn all<'a>(n: &'a Node, ns: &str, name: &str, out: &mut Vec<&'a Node>) {
    for c in &n.children {
        if c.is(ns, name) {
            out.push(c);
        }
        all(c, ns, name, out);
    }
}

fn found<'a>(n: &'a Node, ns: &str, name: &str) -> Vec<&'a Node> {
    let mut v = Vec::new();
    all(n, ns, name, &mut v);
    v
}

/// One response message's failure, when it failed: (code, text).
fn failure(msg: &Node) -> Option<(String, String)> {
    (msg.attr("ResponseClass") == Some("Error")).then(|| {
        let code = msg.child(M, "ResponseCode").map(|c| c.trimmed().to_string()).unwrap_or_default();
        let text = msg.child(M, "MessageText").map(|c| c.trimmed().to_string()).unwrap_or_default();
        (code, text)
    })
}

fn item_id(n: &Node) -> Option<(String, String)> {
    let id = n.find(T, "ItemId")?;
    Some((id.attr("Id")?.to_string(), id.attr("ChangeKey").unwrap_or_default().to_string()))
}

fn changed_meanwhile(what: &str) -> DavError {
    DavError::Status { what: what.into(), code: 412, body: String::new() }
}

impl Client {
    /// A client for the mailbox `user`, signed in through Email's Outlook account of that address.
    pub fn new(user: &str) -> Result<Client> {
        let user = user.trim();
        if !user.contains('@') {
            return Err(DavError::Setup("the Exchange account needs its mailbox's address as the user name (Settings → Calendar → Accounts)".into()));
        }
        Self::with_token(user, Self::token(user)?)
    }

    /// A client with a token already in hand (tests, probes).
    pub fn with_token(user: &str, token: String) -> Result<Client> {
        let http = Http::builder().timeout(std::time::Duration::from_secs(60)).build().map_err(|e| DavError::Setup(e.to_string()))?;
        let base = Url::parse(&format!("{ENDPOINT}/{}/", user.replace('/', "_"))).map_err(|e| DavError::Setup(e.to_string()))?;
        Ok(Client { http, user: user.to_string(), token, base })
    }

    /// Email's token for this mailbox (it keeps and renews the sign-in).
    fn token(user: &str) -> Result<String> {
        if !crate::conf::serving() {
            return Err(DavError::Setup("an Exchange calendar needs Atlas running (its sign-in is the Email plugin's)".into()));
        }
        let a = atlas_plugin::Atlas::new()
            .post("/api/plugins/@mail/helper", &json!({ "method": "calendar_token", "params": { "user": user }, "timeout_secs": 60 }))
            .map_err(|e| DavError::Setup(format!("Exchange sign-in through Email: {e}")))?;
        a["token"].as_str().map(str::to_string).ok_or_else(|| DavError::Setup(format!("Exchange sign-in through Email: {}", a["error"].as_str().unwrap_or("no token"))))
    }

    pub fn base(&self) -> &Url {
        &self.base
    }

    /// One SOAP call → the answer's body element (the response messages under it).
    fn call(&self, what: &str, body: &str) -> Result<Node> {
        let envelope = format!(
            r#"<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:t="{T}" xmlns:m="{M}"><soap:Header><t:RequestServerVersion Version="Exchange2016"/></soap:Header><soap:Body>{body}</soap:Body></soap:Envelope>"#
        );
        let r = self
            .http
            .post(ENDPOINT)
            .bearer_auth(&self.token)
            .header("Content-Type", "text/xml; charset=utf-8")
            .body(envelope)
            .send()
            .map_err(|e| DavError::Network { host: "outlook.office365.com".into(), why: network_why(&e) })?;
        let status = r.status().as_u16();
        let text = r.text().unwrap_or_default();
        if status == 401 || status == 403 {
            return Err(DavError::Setup(format!("Exchange refused the sign-in of {} ({status}): sign in again in Email (Settings → Email → Accounts → Sign in to Outlook)", self.user)));
        }
        let root = xml::parse(&text).map_err(|e| DavError::Status { what: what.into(), code: status, body: e })?;
        if status != 200 {
            let fault = root.find("", "faultstring").or_else(|| root.find(M, "MessageText")).map(|n| n.trimmed().to_string()).unwrap_or_default();
            return Err(DavError::Status { what: what.into(), code: status, body: fault });
        }
        Ok(root)
    }

    /// The mailbox's calendars (folders of class IPF.Appointment, the default one first).
    pub fn discover(&self) -> Result<Vec<Calendar>> {
        let shape = r#"<m:FolderShape><t:BaseShape>IdOnly</t:BaseShape><t:AdditionalProperties><t:FieldURI FieldURI="folder:DisplayName"/><t:FieldURI FieldURI="folder:FolderClass"/><t:FieldURI FieldURI="folder:EffectiveRights"/></t:AdditionalProperties></m:FolderShape>"#;
        let main = self.call("GetFolder calendar", &format!(r#"<m:GetFolder>{shape}<m:FolderIds><t:DistinguishedFolderId Id="calendar"/></m:FolderIds></m:GetFolder>"#))?;
        let all = self.call("FindFolder", &format!(r#"<m:FindFolder Traversal="Deep">{shape}<m:ParentFolderIds><t:DistinguishedFolderId Id="msgfolderroot"/></m:ParentFolderIds></m:FindFolder>"#))?;
        let mut folders: Vec<&Node> = found(&main, T, "CalendarFolder");
        folders.extend(found(&all, T, "CalendarFolder").into_iter().filter(|f| f.child(T, "FolderClass").is_some_and(|c| c.trimmed() == "IPF.Appointment")));
        let mut out: Vec<Calendar> = Vec::new();
        let mut ids: Vec<String> = Vec::new();
        for f in folders {
            let Some(id) = f.child(T, "FolderId").and_then(|i| i.attr("Id")).map(str::to_string) else { continue };
            if ids.contains(&id) {
                continue;
            }
            let name = f.child(T, "DisplayName").map(|n| n.trimmed().to_string()).unwrap_or_else(|| "Calendar".into());
            let mut seg = slug(&name);
            let mut n = 2;
            while out.iter().any(|c| c.url.ends_with(&format!("/{seg}/"))) {
                seg = format!("{}-{n}", slug(&name));
                n += 1;
            }
            let url = self.base.join(&format!("{seg}/")).map_err(|e| DavError::Setup(e.to_string()))?;
            let writable = f.find(T, "CreateContents").is_some_and(|c| c.trimmed() == "true");
            lock(&FOLDERS).insert(url.to_string(), id.clone());
            ids.push(id);
            out.push(Calendar { url: url.to_string(), name, color: None, components: vec!["VEVENT".into()], writable });
        }
        Ok(out)
    }

    fn folder(&self, cal: &Url) -> Result<String> {
        let key = crate::caldav::as_dir(cal.clone()).to_string();
        if let Some(id) = lock(&FOLDERS).get(&key).cloned() {
            return Ok(id);
        }
        self.discover()?;
        lock(&FOLDERS).get(&key).cloned().ok_or_else(|| DavError::Status { what: format!("the calendar {key}"), code: 404, body: "not in the mailbox any more".into() })
    }

    /// No change tag or sync-token: the ChangeKey listing decides what is fetched.
    pub fn state(&self, _coll: &Url) -> Result<CollectionState> {
        Ok((None, None))
    }

    pub fn changes(&self, _coll: &Url, _token: &str) -> Result<Delta> {
        Err(DavError::Setup("Exchange has no sync-token here".into()))
    }

    /// Every event of a calendar: (address, ChangeKey); recurring series once (their master).
    pub fn listing(&self, coll: &Url) -> Result<Vec<(String, Option<String>)>> {
        let coll = crate::caldav::as_dir(coll.clone());
        let folder = self.folder(&coll)?;
        let mut out = Vec::new();
        let mut offset = 0;
        loop {
            let a = self.call(
                "FindItem",
                &format!(
                    r#"<m:FindItem Traversal="Shallow"><m:ItemShape><t:BaseShape>IdOnly</t:BaseShape><t:AdditionalProperties><t:FieldURI FieldURI="calendar:UID"/></t:AdditionalProperties></m:ItemShape><m:IndexedPageItemView MaxEntriesReturned="{PAGE}" Offset="{offset}" BasePoint="Beginning"/><m:ParentFolderIds><t:FolderId Id="{}"/></m:ParentFolderIds></m:FindItem>"#,
                    xml::escape(&folder)
                ),
            )?;
            if let Some((code, text)) = found(&a, M, "FindItemResponseMessage").first().and_then(|m| failure(m)) {
                return Err(DavError::Status { what: "FindItem".into(), code: 500, body: format!("{code}: {text}") });
            }
            let items = found(&a, T, "CalendarItem");
            let mut map = lock(&ITEMS);
            for it in &items {
                let (Some((id, ck)), Some(uid)) = (item_id(it), it.child(T, "UID").map(|u| u.trimmed().to_string())) else { continue };
                let Ok(href) = coll.join(&resource_name(&uid)) else { continue };
                map.insert(href.to_string(), (id, ck.clone()));
                out.push((href.to_string(), Some(ck)));
            }
            let last = a.find(M, "RootFolder").and_then(|r| r.attr("IncludesLastItemInRange")) != Some("false");
            if last || items.is_empty() {
                break;
            }
            offset += items.len();
        }
        Ok(out)
    }

    /// The item behind an address, listing its calendar again when it is not known yet.
    fn item(&self, href: &Url) -> Result<Option<(String, String)>> {
        if let Some(x) = lock(&ITEMS).get(href.as_str()).cloned() {
            return Ok(Some(x));
        }
        let coll = href.join("./").map_err(|e| DavError::Setup(e.to_string()))?;
        self.listing(&coll)?;
        Ok(lock(&ITEMS).get(href.as_str()).cloned())
    }

    /// The items with these ids, whole: (id, ChangeKey, iCalendar); one missing is left out.
    fn get(&self, ids: &[String]) -> Result<Vec<(String, String, String)>> {
        let mut out = Vec::new();
        for chunk in ids.chunks(BATCH) {
            let list: String = chunk.iter().map(|i| format!(r#"<t:ItemId Id="{}"/>"#, xml::escape(i))).collect();
            let a = self.call("GetItem", &format!(r#"<m:GetItem><m:ItemShape><t:BaseShape>IdOnly</t:BaseShape><t:IncludeMimeContent>true</t:IncludeMimeContent></m:ItemShape><m:ItemIds>{list}</m:ItemIds></m:GetItem>"#))?;
            for msg in found(&a, M, "GetItemResponseMessage") {
                if failure(msg).is_some() {
                    continue;
                }
                let Some((id, ck)) = item_id(msg) else { continue };
                let Some(mime) = msg.find(T, "MimeContent") else { continue };
                let raw: String = mime.text.chars().filter(|c| !c.is_whitespace()).collect();
                let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(raw) else { continue };
                out.push((id, ck, String::from_utf8_lossy(&bytes).into_owned()));
            }
        }
        Ok(out)
    }

    /// The events at these addresses, whole: (address, ChangeKey, iCalendar).
    pub fn multiget(&self, coll: &Url, hrefs: &[String], _card: bool) -> Result<Vec<(String, Option<String>, String)>> {
        if hrefs.iter().any(|h| !lock(&ITEMS).contains_key(h)) {
            self.listing(coll)?;
        }
        let map = lock(&ITEMS).clone();
        let wanted: Vec<(String, String)> = hrefs.iter().filter_map(|h| map.get(h).map(|(id, _)| (id.clone(), h.clone()))).collect();
        let by_id: HashMap<&str, &str> = wanted.iter().map(|(i, h)| (i.as_str(), h.as_str())).collect();
        let ids: Vec<String> = wanted.iter().map(|(i, _)| i.clone()).collect();
        Ok(self.get(&ids)?.into_iter().filter_map(|(id, ck, text)| by_id.get(id.as_str()).map(|h| (h.to_string(), Some(ck), text))).collect())
    }

    /// One event: (ChangeKey, iCalendar), None when gone.
    pub fn fetch(&self, href: &Url) -> Result<Option<(Option<String>, String)>> {
        let Some((id, _)) = self.item(href)? else { return Ok(None) };
        Ok(self.get(&[id])?.into_iter().next().map(|(_, ck, text)| (Some(ck), text)))
    }

    /// A new item from iCalendar in the calendar holding `href` → its (id, ChangeKey).
    fn create(&self, href: &Url, text: &str) -> Result<(String, String)> {
        let coll = href.join("./").map_err(|e| DavError::Setup(e.to_string()))?;
        let folder = self.folder(&coll)?;
        let mime = base64::engine::general_purpose::STANDARD.encode(text.as_bytes());
        let a = self.call(
            "CreateItem",
            &format!(
                r#"<m:CreateItem SendMeetingInvitations="{}"><m:SavedItemFolderId><t:FolderId Id="{}"/></m:SavedItemFolderId><m:Items><t:CalendarItem><t:MimeContent CharacterSet="UTF-8">{mime}</t:MimeContent></t:CalendarItem></m:Items></m:CreateItem>"#,
                tells(text, &self.user),
                xml::escape(&folder)
            ),
        )?;
        let msg = found(&a, M, "CreateItemResponseMessage");
        let msg = msg.first().ok_or_else(|| DavError::Setup("Exchange gave no answer to CreateItem".into()))?;
        if let Some((code, why)) = failure(msg) {
            return Err(DavError::Status { what: "CreateItem".into(), code: 400, body: format!("{code}: {why}") });
        }
        let made = item_id(msg).ok_or_else(|| DavError::Setup("Exchange made the event but gave no id".into()))?;
        lock(&ITEMS).insert(href.to_string(), made.clone());
        Ok(made)
    }

    /// Removes an item: `hard` (an old version replaced) or to Deleted Items (a removal the user asked for).
    fn drop(&self, id: &str, hard: bool, tell: &str) -> Result<bool> {
        let kind = if hard { "HardDelete" } else { "MoveToDeletedItems" };
        let a = self.call(
            "DeleteItem",
            &format!(r#"<m:DeleteItem DeleteType="{kind}" SendMeetingCancellations="{tell}"><m:ItemIds><t:ItemId Id="{}"/></m:ItemIds></m:DeleteItem>"#, xml::escape(id)),
        )?;
        match found(&a, M, "DeleteItemResponseMessage").first().and_then(|m| failure(m)) {
            None => Ok(true),
            Some((code, _)) if code == "ErrorItemNotFound" => Ok(false),
            Some((code, why)) => Err(DavError::Status { what: "DeleteItem".into(), code: 400, body: format!("{code}: {why}") }),
        }
    }

    /// Writes a whole event: new (`if_match` None: only if nothing is there) or over the version read
    /// (`*`: whatever is there). Answers the new ChangeKey.
    pub fn write(&self, href: &Url, text: &str, if_match: Option<&str>) -> Result<Option<String>> {
        let what = format!("writing {}", href.path());
        match (self.item(href)?, if_match) {
            (Some(_), None) => Err(changed_meanwhile(&what)),
            (Some((_, ck)), Some(m)) if m != "*" && m != ck => Err(changed_meanwhile(&what)),
            (Some((old, _)), Some(_)) => {
                // Exchange ignores iCalendar on update: the new version first, then the old one goes (never none)
                let made = self.create(href, text)?;
                if let Err(e) = self.drop(&old, true, "SendToNone") {
                    eprintln!("dav: {}: the new version is in, the old one could not be removed ({e})", href.path());
                }
                Ok(Some(made.1))
            }
            (None, Some(m)) if m != "*" => Err(changed_meanwhile(&what)),
            (None, _) => Ok(Some(self.create(href, text)?.1)),
        }
    }

    /// Removes an event (to Deleted Items), only if it is still the version read.
    pub fn erase(&self, href: &Url, etag: Option<&str>) -> Result<bool> {
        let Some((id, ck)) = self.item(href)? else { return Ok(false) };
        if etag.is_some_and(|e| e != "*" && e != ck) {
            return Err(changed_meanwhile(&format!("removing {}", href.path())));
        }
        let tell = self.get(std::slice::from_ref(&id))?.first().map_or("SendToNone", |(_, _, t)| tells(t, &self.user));
        let gone = self.drop(&id, false, tell)?;
        lock(&ITEMS).remove(href.as_str());
        Ok(gone)
    }

    /// Answers a meeting in the calendar (`ACCEPTED`, `TENTATIVE`, `DECLINED`) the way Outlook does: the organiser gets
    /// the answer from Exchange, the item stays linked to the meeting (its later updates land on it); a declined one
    /// leaves the calendar.
    pub fn respond(&self, href: &Url, partstat: &str) -> Result<()> {
        let kind = match partstat {
            "ACCEPTED" => "AcceptItem",
            "TENTATIVE" => "TentativelyAcceptItem",
            "DECLINED" => "DeclineItem",
            other => return Err(DavError::Setup(format!("not an answer: {other}"))),
        };
        let (id, ck) = self.item(href)?.ok_or_else(|| DavError::Status { what: format!("answering {}", href.path()), code: 404, body: "not in the calendar".into() })?;
        let a = self.call(
            kind,
            &format!(r#"<m:CreateItem MessageDisposition="SendAndSaveCopy"><m:Items><t:{kind}><t:ReferenceItemId Id="{}" ChangeKey="{}"/></t:{kind}></m:Items></m:CreateItem>"#, xml::escape(&id), xml::escape(&ck)),
        )?;
        if let Some((code, why)) = found(&a, M, "CreateItemResponseMessage").first().and_then(|m| failure(m)) {
            return Err(DavError::Status { what: kind.into(), code: 400, body: format!("{code}: {why}") });
        }
        // the item changed (its answer) or went (declined): listed again on the next pull
        lock(&ITEMS).remove(href.as_str());
        Ok(())
    }

    pub fn find_uid(&self, cal: &Url, uid: &str) -> Result<Option<(Url, Option<String>, String)>> {
        let href = crate::caldav::as_dir(cal.clone()).join(&resource_name(uid)).map_err(|e| DavError::Setup(e.to_string()))?;
        Ok(self.fetch(&href)?.map(|(etag, text)| (href, etag, text)))
    }

    /// As the CalDAV client's: added under `<uid>.ics`, or kept, or updated when its X-ATLAS-HASH differs.
    pub fn upsert(&self, cal: &Url, uid: &str, text: &str, hash: Option<&str>, existing: Existing) -> Result<(Outcome, Url)> {
        let href = crate::caldav::as_dir(cal.clone()).join(&resource_name(uid)).map_err(|e| DavError::Setup(e.to_string()))?;
        match self.fetch(&href)? {
            None => {
                self.write(&href, text, None)?;
                Ok((Outcome::Added, href))
            }
            Some((etag, old)) => {
                if existing == Existing::Keep || hash.is_some_and(|h| ics::unfold(&old).contains(&format!("X-ATLAS-HASH:{h}"))) {
                    return Ok((Outcome::Unchanged, href));
                }
                self.write(&href, text, etag.as_deref().or(Some("*")))?;
                Ok((Outcome::Updated, href))
            }
        }
    }

    pub fn remove(&self, cal: &Url, uid: &str) -> Result<bool> {
        let href = crate::caldav::as_dir(cal.clone()).join(&resource_name(uid)).map_err(|e| DavError::Setup(e.to_string()))?;
        self.erase(&href, None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calendar_names_become_address_segments() {
        assert_eq!(slug("Calendrier"), "calendrier");
        assert_eq!(slug("Team (old) "), "team-old");
        assert_eq!(slug("日本"), "日本");
        assert_eq!(slug("!!"), "calendar");
    }

    #[test]
    fn only_a_meeting_the_mailbox_organises_tells_anyone() {
        let me = "a@uni.example";
        let mine = "BEGIN:VEVENT\r\nORGANIZER;CN=A:mailto:A@uni.example\r\nATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:b@uni.example\r\nEND:VEVENT\r\n";
        assert_eq!(tells(mine, me), "SendToAllAndSaveCopy");
        let theirs = mine.replace("mailto:A@uni.example", "mailto:c@uni.example");
        assert_eq!(tells(&theirs, me), "SendToNone", "an invitation received: the organiser is told only by an answer");
        assert_eq!(tells("BEGIN:VEVENT\r\nSUMMARY:x\r\nEND:VEVENT\r\n", me), "SendToNone");
    }

    #[test]
    fn answers_are_read_by_namespace() {
        let x = r#"<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><m:FindItemResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages" xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"><m:ResponseMessages><m:FindItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:RootFolder TotalItemsInView="1" IncludesLastItemInRange="true"><t:Items><t:CalendarItem><t:ItemId Id="AAA=" ChangeKey="CK1"/><t:UID>u-1@example.org</t:UID></t:CalendarItem></t:Items></m:RootFolder></m:FindItemResponseMessage></m:ResponseMessages></m:FindItemResponse></s:Body></s:Envelope>"#;
        let root = xml::parse(x).unwrap();
        let items = found(&root, T, "CalendarItem");
        assert_eq!(items.len(), 1);
        assert_eq!(item_id(items[0]), Some(("AAA=".into(), "CK1".into())));
        assert_eq!(items[0].child(T, "UID").map(|u| u.trimmed()), Some("u-1@example.org"));
        assert!(failure(found(&root, M, "FindItemResponseMessage")[0]).is_none());
        let err = xml::parse(r#"<m:X xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages" ResponseClass="Error"><m:MessageText>gone</m:MessageText><m:ResponseCode>ErrorItemNotFound</m:ResponseCode></m:X>"#).unwrap();
        assert_eq!(failure(&err), Some(("ErrorItemNotFound".into(), "gone".into())));
    }
}
