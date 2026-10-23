//! The engine's network, behind a trait: the helper's goes through the core's plugin fetch (the plugin's `net`
//! permissions, shown in Settings; core_api.rs); tests answer from a table. Errors say why, for the user.
use serde_json::Value;

pub trait Net {
    /// The JSON an address answers (Err: not found, not JSON, refused — and why).
    fn json(&self, url: &str) -> Result<Value, String>;
    /// The text an address answers (arXiv's Atom).
    fn text(&self, url: &str) -> Result<String, String>;
    /// A PDF's bytes from `url`, when what answers is one.
    fn pdf(&self, url: &str) -> Result<Vec<u8>, String>;
    /// JSON from an index that wants a key: the plugin's secret `secret`, sent as `Authorization: <prefix><secret>`
    /// (the core fills it in; the engine never sees it). No such secret: an error.
    fn json_with_secret(&self, url: &str, secret: &str, prefix: &str) -> Result<Value, String>;
}

/// A PDF's bytes, or why not: what answered is not a PDF (a paywall's page, a login).
pub fn only_pdf(url: &str, bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    if bytes.starts_with(b"%PDF") {
        Ok(bytes)
    } else {
        Err(format!("{url}: not a PDF"))
    }
}

#[cfg(test)]
pub mod fake {
    //! A network from a table: an address answers what the test put under it (a prefix match), else nothing.
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    pub struct Table {
        pub answers: Vec<(String, Answer)>,
        pub asked: RefCell<Vec<String>>,
    }

    pub enum Answer {
        Json(Value),
        Text(String),
        Bytes(Vec<u8>),
    }

    impl Table {
        pub fn on(mut self, prefix: &str, a: Answer) -> Self {
            self.answers.push((prefix.to_string(), a));
            self
        }
        fn find(&self, url: &str) -> Result<&Answer, String> {
            self.asked.borrow_mut().push(url.to_string());
            self.answers.iter().find(|(p, _)| url.starts_with(p.as_str())).map(|(_, a)| a).ok_or_else(|| format!("{url}: 404"))
        }
    }

    impl Net for Table {
        fn json(&self, url: &str) -> Result<Value, String> {
            match self.find(url)? {
                Answer::Json(v) => Ok(v.clone()),
                _ => Err(format!("{url}: not JSON")),
            }
        }
        fn text(&self, url: &str) -> Result<String, String> {
            match self.find(url)? {
                Answer::Text(t) => Ok(t.clone()),
                Answer::Json(v) => Ok(v.to_string()),
                Answer::Bytes(b) => Ok(String::from_utf8_lossy(b).into_owned()),
            }
        }
        fn pdf(&self, url: &str) -> Result<Vec<u8>, String> {
            match self.find(url)? {
                Answer::Bytes(b) => only_pdf(url, b.clone()),
                _ => Err(format!("{url}: not a PDF")),
            }
        }
        // recorded with the secret's name, so a test sees it was asked for
        fn json_with_secret(&self, url: &str, secret: &str, _prefix: &str) -> Result<Value, String> {
            let r = self.json(url);
            if let Some(last) = self.asked.borrow_mut().last_mut() {
                last.push_str(&format!("#secret={secret}"));
            }
            r
        }
    }
}
