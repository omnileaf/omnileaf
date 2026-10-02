use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    pub path: PathBuf,
    /// How much of the file SQLite may map into memory, in bytes; zero turns mapping off.
    pub mmap_size_bytes: u32,
}
