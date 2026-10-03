//! The library database: SQLite, written through one thread and read through a small pool.

mod backup;
pub mod catalog;
mod config;
mod connection;
mod database;
mod error;
pub mod first_launch;
#[cfg(test)]
#[path = "../build/icu_versions.rs"]
mod icu_versions;
mod migration;
#[cfg(test)]
mod scratch;
pub mod store;
mod title_key;
mod title_sort;
mod workers;

pub use config::Config;
pub use database::Database;
pub use error::Error;
pub use rusqlite::{self, Connection, Transaction};
pub use title_key::Language;
