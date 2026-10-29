//! The Calendar (DAV) plugin's engine (plugins/stable/dav/README.md, docs/refactor/REFACTOR-calendar.md): a local cache
//! (`store`) filled from CalDAV (`caldav`, `xml`) and ICS subscriptions (`subs`) by `pull`; recurrence and zones
//! (`recur`, `zone`); changes with their scopes (`edit`); quick add (`quick`); invitations (`invite`); contacts
//! (`carddav`); the vault's important dates (`sync`, `uid`). `api` is every method; `main.rs` serves them.
pub mod api;
pub mod caldav;
pub mod carddav;
pub mod conf;
pub mod edit;
pub mod ics;
pub mod invite;
pub mod pull;
pub mod push;
pub mod quick;
pub mod recur;
pub mod store;
pub mod subs;
pub mod sync;
pub mod uid;
pub mod xml;
pub mod zone;
