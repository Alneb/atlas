//! One-time migrations of the user's earlier ledgers into the finance folder. Each writes only new files, after the
//! user says yes, and reports what it mapped, merged and could not place.
pub mod paisa;
