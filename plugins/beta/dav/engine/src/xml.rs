//! The WebDAV XML a CalDAV server answers (RFC 4918 multistatus, RFC 4791 calendar properties), read into a small
//! namespace-resolved tree: servers differ in prefixes (`d:`, `D:`, none, `cal:`), never in namespaces.
use quick_xml::escape::resolve_predefined_entity;
use quick_xml::events::{BytesStart, Event};
use quick_xml::name::ResolveResult;
use quick_xml::NsReader;

pub const DAV: &str = "DAV:";
pub const CALDAV: &str = "urn:ietf:params:xml:ns:caldav";
pub const APPLE: &str = "http://apple.com/ns/ical/";
pub const CS: &str = "http://calendarserver.org/ns/";
pub const CARDDAV: &str = "urn:ietf:params:xml:ns:carddav";
/// WebDAV Push (bitfireAT's draft: RustiCal, DAVx5)
pub const PUSH: &str = "https://bitfire.at/webdav-push";

/// An element: its namespace, local name, attributes (by local name), text and children.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Node {
    pub ns: String,
    pub name: String,
    pub attrs: Vec<(String, String)>,
    pub text: String,
    pub children: Vec<Node>,
}

impl Node {
    pub fn is(&self, ns: &str, name: &str) -> bool {
        self.ns == ns && self.name == name
    }

    pub fn child(&self, ns: &str, name: &str) -> Option<&Node> {
        self.children.iter().find(|c| c.is(ns, name))
    }

    pub fn all<'a>(&'a self, ns: &'a str, name: &'a str) -> impl Iterator<Item = &'a Node> + 'a {
        self.children.iter().filter(move |c| c.is(ns, name))
    }

    /// The first descendant (depth first) with this name.
    pub fn find(&self, ns: &str, name: &str) -> Option<&Node> {
        self.children.iter().find_map(|c| if c.is(ns, name) { Some(c) } else { c.find(ns, name) })
    }

    pub fn attr(&self, name: &str) -> Option<&str> {
        self.attrs.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
    }

    pub fn trimmed(&self) -> &str {
        self.text.trim()
    }
}

fn element(ns: ResolveResult, e: &BytesStart) -> Node {
    let ns = match ns {
        ResolveResult::Bound(n) => String::from_utf8_lossy(n.as_ref()).into_owned(),
        _ => String::new(),
    };
    let mut node = Node { ns, name: String::from_utf8_lossy(e.local_name().as_ref()).into_owned(), ..Node::default() };
    for a in e.attributes().flatten() {
        let raw = String::from_utf8_lossy(&a.value).into_owned();
        let v = quick_xml::escape::unescape(&raw).map(|v| v.into_owned()).unwrap_or(raw);
        node.attrs.push((String::from_utf8_lossy(a.key.local_name().as_ref()).into_owned(), v));
    }
    node
}

/// The document's root element.
pub fn parse(xml: &str) -> Result<Node, String> {
    let bad = |e: &dyn std::fmt::Display| format!("the server's XML could not be read: {e}");
    let mut r = NsReader::from_str(xml);
    let mut stack: Vec<Node> = Vec::new();
    let mut root: Option<Node> = None;
    let mut buf = Vec::new();
    // a finished element goes into its parent, or is the root
    let close = |stack: &mut Vec<Node>, root: &mut Option<Node>, node: Node| match stack.last_mut() {
        Some(parent) => parent.children.push(node),
        None => *root = Some(node),
    };
    loop {
        let (ns, ev) = r.read_resolved_event_into(&mut buf).map_err(|e| bad(&e))?;
        match ev {
            Event::Start(e) => {
                let node = element(ns, &e);
                stack.push(node);
            }
            Event::Empty(e) => {
                let node = element(ns, &e);
                close(&mut stack, &mut root, node);
            }
            Event::End(_) => {
                let node = stack.pop().ok_or_else(|| bad(&"an end tag with no start"))?;
                close(&mut stack, &mut root, node);
            }
            Event::Text(t) => {
                if let Some(top) = stack.last_mut() {
                    top.text.push_str(&t.decode().map_err(|e| bad(&e))?);
                }
            }
            Event::CData(t) => {
                if let Some(top) = stack.last_mut() {
                    top.text.push_str(&t.decode().map_err(|e| bad(&e))?);
                }
            }
            Event::GeneralRef(g) => {
                let Some(top) = stack.last_mut() else { continue };
                if let Some(c) = g.resolve_char_ref().map_err(|e| bad(&e))? {
                    top.text.push(c);
                } else {
                    let name = g.decode().map_err(|e| bad(&e))?;
                    top.text.push_str(
                        resolve_predefined_entity(&name).ok_or_else(|| bad(&format!("unknown entity &{name};")))?,
                    );
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    if !stack.is_empty() {
        return Err(bad(&"the document ends inside an element"));
    }
    root.ok_or_else(|| bad(&"no element in it"))
}

/// One `<response>` of a multistatus: its href and the properties found (from 2xx propstats only).
#[derive(Debug, Clone, PartialEq)]
pub struct Response {
    pub href: String,
    pub props: Vec<Node>,
    /// the response's own status line, when it has one instead of propstats (a 404 for a missing resource)
    pub status: Option<u16>,
}

impl Response {
    pub fn prop(&self, ns: &str, name: &str) -> Option<&Node> {
        self.props.iter().find(|p| p.is(ns, name))
    }

    /// The text of a property's `<href>` (current-user-principal, calendar-home-set).
    pub fn href_in(&self, ns: &str, name: &str) -> Option<String> {
        self.prop(ns, name).and_then(|p| p.find(DAV, "href")).map(|h| h.trimmed().to_string()).filter(|h| !h.is_empty())
    }

    pub fn text(&self, ns: &str, name: &str) -> Option<String> {
        self.prop(ns, name).map(|p| p.trimmed().to_string()).filter(|t| !t.is_empty())
    }
}

/// `HTTP/1.1 200 OK` → 200.
fn status_code(line: &str) -> Option<u16> {
    line.split_whitespace().nth(1)?.parse().ok()
}

/// A 207 Multi-Status body's responses.
pub fn multistatus(xml: &str) -> Result<Vec<Response>, String> {
    let root = parse(xml)?;
    if !root.is(DAV, "multistatus") {
        return Err(format!("the server answered <{}> where a WebDAV multistatus was expected", root.name));
    }
    let mut out = Vec::new();
    for r in root.all(DAV, "response") {
        let href = r.child(DAV, "href").map(|h| h.trimmed().to_string()).unwrap_or_default();
        let mut props = Vec::new();
        for ps in r.all(DAV, "propstat") {
            let ok =
                ps.child(DAV, "status").and_then(|s| status_code(s.trimmed())).is_none_or(|c| (200..300).contains(&c));
            if let (true, Some(prop)) = (ok, ps.child(DAV, "prop")) {
                props.extend(prop.children.iter().cloned());
            }
        }
        let status = r.child(DAV, "status").and_then(|s| status_code(s.trimmed()));
        out.push(Response { href, props, status });
    }
    Ok(out)
}

/// Text made safe inside an XML element or attribute.
pub fn escape(s: &str) -> String {
    quick_xml::escape::escape(s).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    // shaped as Nextcloud answers a calendar home's Depth: 1 PROPFIND (prefixes d:, cal:, x1:, a 404 propstat)
    const HOME: &str = r#"<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:cal="urn:ietf:params:xml:ns:caldav" xmlns:x1="http://apple.com/ns/ical/">
 <d:response>
  <d:href>/remote.php/dav/calendars/alice/</d:href>
  <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  <d:propstat><d:prop><d:displayname/><cal:supported-calendar-component-set/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>
 </d:response>
 <d:response>
  <d:href>/remote.php/dav/calendars/alice/personal/</d:href>
  <d:propstat><d:prop>
    <d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>
    <d:displayname>Personal &amp; work</d:displayname>
    <cal:supported-calendar-component-set><cal:comp name="VEVENT"/><cal:comp name="VTODO"/></cal:supported-calendar-component-set>
    <x1:calendar-color>#0082c9</x1:calendar-color>
  </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
 </d:response>
</d:multistatus>"#;

    #[test]
    fn a_multistatus_is_read_whatever_the_prefixes_and_failed_propstats_are_left_out() {
        let rs = multistatus(HOME).unwrap();
        assert_eq!(rs.len(), 2);
        assert!(rs[0].prop(DAV, "displayname").is_none(), "the 404 propstat's empty props are not taken");
        let cal = &rs[1];
        assert_eq!(cal.href, "/remote.php/dav/calendars/alice/personal/");
        assert!(cal.prop(DAV, "resourcetype").unwrap().child(CALDAV, "calendar").is_some());
        assert_eq!(cal.text(DAV, "displayname").as_deref(), Some("Personal & work"), "entities resolved");
        let comps: Vec<_> = cal
            .prop(CALDAV, "supported-calendar-component-set")
            .unwrap()
            .all(CALDAV, "comp")
            .filter_map(|c| c.attr("name"))
            .collect();
        assert_eq!(comps, ["VEVENT", "VTODO"]);
        assert_eq!(cal.text(APPLE, "calendar-color").as_deref(), Some("#0082c9"));
    }

    #[test]
    fn default_namespaces_and_uppercase_prefixes_resolve_the_same() {
        // Radicale and Apple use a default namespace; some servers `D:` and `C:`
        let a = r#"<multistatus xmlns="DAV:"><response><href>/p/</href><propstat><prop><current-user-principal><href>/alice/</href></current-user-principal></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>"#;
        let b = r#"<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:response><D:href>/p/</D:href><D:propstat><D:prop><C:calendar-home-set><D:href>/alice/cals/</D:href></C:calendar-home-set></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>"#;
        assert_eq!(multistatus(a).unwrap()[0].href_in(DAV, "current-user-principal").as_deref(), Some("/alice/"));
        assert_eq!(multistatus(b).unwrap()[0].href_in(CALDAV, "calendar-home-set").as_deref(), Some("/alice/cals/"));
    }

    #[test]
    fn calendar_data_keeps_its_lines_and_cdata_is_read() {
        let x = "<d:multistatus xmlns:d=\"DAV:\" xmlns:c=\"urn:ietf:params:xml:ns:caldav\"><d:response><d:href>/c/a.ics</d:href><d:propstat><d:prop><d:getetag>\"e1\"</d:getetag><c:calendar-data><![CDATA[BEGIN:VCALENDAR\r\nSUMMARY:a <b>\r\nEND:VCALENDAR\r\n]]></c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>";
        let r = &multistatus(x).unwrap()[0];
        assert_eq!(r.text(DAV, "getetag").as_deref(), Some("\"e1\""));
        assert!(r.prop(CALDAV, "calendar-data").unwrap().text.contains("SUMMARY:a <b>\r\n"));
    }

    #[test]
    fn not_a_multistatus_or_broken_xml_is_a_reason() {
        assert!(multistatus("<html><body>login</body></html>").unwrap_err().contains("multistatus"));
        assert!(parse("<a><b></a>").is_err());
        assert!(multistatus("").is_err());
    }
}
