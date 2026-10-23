//! The catalog-papers plugin's engine: the references library moved out of the core
//! (docs/refactor/REFACTOR-references-plugin.md). Entries are notes (entry.rs), the library's operations (refs.rs),
//! what the indexes say (remote.rs), the catalog's tools (catalog.rs), the Zotero Connector (connector.rs); the
//! network, a new entry's note and the Trash are seams (net.rs, entry.rs, refs.rs) that the helper fills through the
//! core (core_api.rs) and the tests with a temp vault.
pub mod catalog;
pub mod connector;
pub mod core_api;
pub mod entry;
pub mod net;
pub mod refs;
pub mod remote;
pub mod settings;
