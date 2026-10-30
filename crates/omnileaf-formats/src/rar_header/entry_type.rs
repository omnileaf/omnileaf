const WINDOWS_DIRECTORY_ATTRIBUTE: u64 = 0x10;
const UNIX_FILE_TYPE: u64 = 0o170_000;
const UNIX_DIRECTORY: u64 = 0o040_000;
const UNIX_REGULAR_FILE: u64 = 0o100_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum EntryType {
    File,
    Folder,
    Other,
}

impl EntryType {
    pub(super) const fn of_windows_attributes(attributes: u64) -> Self {
        if attributes & WINDOWS_DIRECTORY_ATTRIBUTE == 0 {
            Self::File
        } else {
            Self::Folder
        }
    }

    /// libarchive takes a Unix entry's type from the `st_mode` stored as its attributes.
    pub(super) const fn of_unix_mode(mode: u64) -> Self {
        match mode & UNIX_FILE_TYPE {
            UNIX_DIRECTORY => Self::Folder,
            UNIX_REGULAR_FILE => Self::File,
            _ => Self::Other,
        }
    }
}
