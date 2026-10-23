//! The finance plugin's engine (docs/design/DESIGN-finance.md): the `.fin` journal (DESIGN-finance-format.md) read,
//! booked and checked; reports; the canonical writer; the hledger export; the Paisa migration.
pub mod bank;
pub mod book;
pub mod classify;
pub mod budget;
pub mod capture;
pub mod edit;
pub mod entry;
pub mod export;
pub mod import;
pub mod invest;
pub mod load;
pub mod migrate;
pub mod model;
pub mod notes;
pub mod parse;
pub mod pricefeed;
pub mod prices;
pub mod report;
pub mod rules;
pub mod statement;
pub mod write;
