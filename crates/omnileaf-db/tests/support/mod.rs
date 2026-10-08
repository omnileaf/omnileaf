use omnileaf_db::Config;
pub(crate) use omnileaf_testkit::ScratchFolder;

pub(crate) const MMAP_SIZE_BYTES: u32 = 1 << 20;

pub(crate) fn library_config(folder: &ScratchFolder) -> Config {
    Config {
        path: folder.path().join("library.sqlite"),
        backup_dir: folder.path().join("backups"),
        mmap_size_bytes: MMAP_SIZE_BYTES,
    }
}
