use omnileaf_testkit::ArchiveEntry;
pub(crate) use omnileaf_testkit::ScratchFolder;

pub(crate) fn entry(name: &str, bytes: Vec<u8>) -> ArchiveEntry {
    ArchiveEntry {
        name: name.to_owned(),
        bytes,
    }
}
