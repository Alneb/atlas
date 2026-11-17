//! The catalog meta plugin's engine (docs/refactor/REFACTOR-catalog.md): anything captured is recognised, looked up in every
//! source the switched-on subplugins offer, merged, written as one note of its kind and kept in step with the
//! services that hold it. The binary (`main.rs`) serves it as the plugin's helper; this library is the logic.
pub mod clip;
pub mod collection;
pub mod contrib;
pub mod document;
pub mod engine;
/// A PDF's naming (its first page, its Info dictionary): the catalog's, linked by catalog-papers for its references.
pub mod first_page;
pub mod kind;
pub mod merge;
pub mod model;
pub mod note;
pub mod recognize;
pub mod rules;
pub mod thing;
