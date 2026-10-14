//! Backend logic that does not depend on Tauri, so it can be unit tested and
//! reused (for example by a future command-line tool).

pub mod engine;
pub mod files;
