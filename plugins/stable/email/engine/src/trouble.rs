//! Why an account cannot be reached, by what the person can do about it: sign in again, or wait for the network.
//! Reaching a server (`Imap::connect`, the token renewal) answers a [`Fail`], which carries the kind beside the
//! sentence; everything after the sign-in stays a plain sentence and reads as [`Trouble::Other`].
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Trouble {
    /// The credentials: none yet, refused, expired or revoked. Trying again cannot help; the person signs in.
    SignIn,
    /// The way to the server: no network, no answer, a connection that died. Tried again by itself.
    Connection,
    /// The server answered and signed us in, then refused something.
    Other,
}

/// A failure and its kind. Turns into its sentence wherever only the sentence is wanted (`?` into a `String` error).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Fail {
    pub trouble: Trouble,
    pub text: String,
}

impl Fail {
    pub fn sign_in(text: impl Into<String>) -> Fail {
        Fail { trouble: Trouble::SignIn, text: text.into() }
    }
    pub fn connection(text: impl Into<String>) -> Fail {
        Fail { trouble: Trouble::Connection, text: text.into() }
    }
}

impl std::fmt::Display for Fail {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.text)
    }
}

impl From<Fail> for String {
    fn from(f: Fail) -> String {
        f.text
    }
}

/// A sentence from past the sign-in: a connection that died there is still the connection's trouble.
impl From<String> for Fail {
    fn from(text: String) -> Fail {
        let trouble = if crate::imap::connection_lost(&text) { Trouble::Connection } else { Trouble::Other };
        Fail { trouble, text }
    }
}

/// A server's `NO` to a sign-in that is not about the credentials (RFC 5530): it is busy, down or over a limit.
pub fn server_busy(why: &str) -> bool {
    let up = why.to_uppercase();
    ["[UNAVAILABLE]", "[INUSE]", "[LIMIT]", "[SERVERBUG]"].iter().any(|code| up.contains(code))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_sentence_keeps_its_kind_and_a_dead_connection_is_the_connections_trouble() {
        assert_eq!(Fail::from("the server closed the connection during FETCH".to_string()).trouble, Trouble::Connection);
        assert_eq!(Fail::from("SELECT: no such folder".to_string()).trouble, Trouble::Other);
        assert_eq!(String::from(Fail::sign_in("refused")), "refused");
        assert_eq!(serde_json::to_value(Trouble::SignIn).unwrap(), "sign-in");
        assert!(server_busy("NO [UNAVAILABLE] try later") && !server_busy("NO [AUTHENTICATIONFAILED] wrong password"));
    }
}
