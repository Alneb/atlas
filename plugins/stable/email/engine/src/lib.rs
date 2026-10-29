//! The Email plugin's engine (docs/refactor/REFACTOR-email-rust.md): the servers are the mail's store; this keeps a
//! local index of them (index.rs) so the pane answers at once, talks IMAP and SMTP, parses, threads and renders mail,
//! and writes a conversation as a note only when the user saves it.

pub mod account;
pub mod index;
pub mod parse;
pub mod ical;
pub mod render;
pub mod search;
pub mod compose;
pub mod imap;
pub mod oauth;
pub mod smtp;
pub mod fake;
pub mod mail;
pub mod notes;
pub mod ops;
pub mod rules;
pub mod send;
pub mod sync;
pub mod thunderbird;
pub mod api;
