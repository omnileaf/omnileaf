//! The library database: SQLite, written through one thread.

mod config;
mod connection;
mod database;
mod error;
mod workers;

pub use config::Config;
pub use database::Database;
pub use error::Error;
pub use rusqlite::{self, Connection, Transaction};
