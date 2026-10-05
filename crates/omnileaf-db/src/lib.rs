//! The library database: SQLite, written through one thread and read through a small pool.

mod backup;
mod config;
mod connection;
mod database;
mod error;
mod migration;
#[cfg(test)]
mod scratch;
mod workers;

pub use config::Config;
pub use database::Database;
pub use error::Error;
pub use rusqlite::{self, Connection, Transaction};
