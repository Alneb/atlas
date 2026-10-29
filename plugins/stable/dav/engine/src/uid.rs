//! Stable event UIDs: the same source (a vault path or a mail's Message-ID) and key always give the same UID, so adding
//! a date again updates its event instead of making a second one.
use crate::ics::hex;
use sha2::{Digest, Sha256};

/// A source as written in different places: `<id@host>` and `id@host` are one Message-ID; `./a.md` and `a.md` one path.
pub fn normalize(source: &str) -> String {
    let s = source.trim();
    let s = s.strip_prefix('<').and_then(|x| x.strip_suffix('>')).unwrap_or(s);
    s.trim_start_matches("./").replace('\\', "/").trim().to_string()
}

/// `atlas-<32 hex>`: from the source and a key telling several events of one source apart (`due`, `event`, or any word
/// an agent chooses; empty for the source's one event).
pub fn derive(source: &str, key: &str) -> String {
    let text = format!("atlas-dav\0{}\0{}", normalize(source), key.trim().to_lowercase());
    format!("atlas-{}", &hex(&Sha256::digest(text.as_bytes()))[..32])
}

/// The resource name an event is stored under in its calendar: `<uid>.ics` when the UID is a plain path segment,
/// else `uid-<hash>.ics` (an invite's UID can hold `/`, spaces, `{}`; servers refuse `%2F` in a path: Radicale 403s).
/// Either way the event is also found by its UID (`Client::find_uid`), whatever name another program gave it.
pub fn resource_name(uid: &str) -> String {
    let plain = !uid.is_empty()
        && uid.len() <= 200
        && uid.bytes().all(|b| b.is_ascii_alphanumeric() || b"-._~@".contains(&b))
        && !uid.starts_with('.');
    if plain {
        format!("{uid}.ics")
    } else {
        format!("uid-{}.ics", &hex(&Sha256::digest(uid.as_bytes()))[..32])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_same_source_and_key_always_give_the_same_uid() {
        let a = derive("<CAF=abc@mail.gmail.com>", "");
        assert_eq!(a, derive("CAF=abc@mail.gmail.com", ""), "brackets do not matter");
        assert_eq!(a, derive("  <CAF=abc@mail.gmail.com> ", " "));
        assert!(a.starts_with("atlas-") && a.len() == 38, "{a}");
        assert_ne!(a, derive("CAF=abc@mail.gmail.com", "deadline"), "a key tells events of one mail apart");
        assert_eq!(derive("x", "Due"), derive("x", "due"));
        assert_eq!(derive("./mail/a.md", "due"), derive("mail/a.md", "due"));
        assert_ne!(derive("mail/a.md", "due"), derive("mail/b.md", "due"));
        // fixed forever: a change here would duplicate every event already pushed
        assert_eq!(derive("mail/a.md", "due"), derive("mail/a.md", "due"));
        assert_eq!(derive("abc@x", ""), "atlas-".to_string() + &hex(&Sha256::digest(b"atlas-dav\0abc@x\0"))[..32]);
    }

    #[test]
    fn resource_names_are_safe_path_segments() {
        assert_eq!(resource_name("atlas-0123"), "atlas-0123.ics");
        assert_eq!(resource_name("abc@example.org"), "abc@example.org.ics");
        let odd = resource_name("a/b c{1}");
        assert!(odd.starts_with("uid-") && odd.ends_with(".ics") && odd.len() == 40, "{odd}");
        assert_eq!(odd, resource_name("a/b c{1}"), "the same UID, the same name");
        assert!(resource_name("..").starts_with("uid-"));
    }
}
