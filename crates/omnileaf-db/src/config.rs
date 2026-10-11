use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    pub path: PathBuf,
    pub backup_dir: PathBuf,
    /// SQLite turns memory mapping off when this is zero.
    pub mmap_size_bytes: u32,
}
