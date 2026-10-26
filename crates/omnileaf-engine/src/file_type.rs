use std::{fmt, path::Path};

const READ_BOOK_TYPES: [&str; 2] = ["cbz", "cb7"];
const BOOK_TYPES_NOT_READ_YET: [&str; 1] = ["cbr"];

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct FileType(String);

impl FileType {
    pub(crate) fn of(path: &Path) -> Option<Self> {
        let extension = path.extension()?.to_str()?;
        Some(Self(extension.to_ascii_lowercase()))
    }

    pub(crate) fn is_read(&self) -> bool {
        READ_BOOK_TYPES.contains(&self.0.as_str())
    }

    pub(crate) fn is_book(&self) -> bool {
        self.is_read() || BOOK_TYPES_NOT_READ_YET.contains(&self.0.as_str())
    }
}

impl fmt::Display for FileType {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn type_of(name: &str) -> Option<FileType> {
        FileType::of(Path::new(name))
    }

    #[test]
    fn names_a_files_type_by_its_extension_in_lowercase() {
        let found = type_of("Sample Series 01/v01.CbR");

        assert_eq!(found, Some(FileType("cbr".to_owned())));
    }

    #[test]
    fn names_no_type_for_a_file_without_an_extension() {
        let found = type_of("Sample Series 01/Chapter 1");

        assert_eq!(found, None);
    }

    #[test]
    fn reads_cbz_and_cb7_files_but_not_cbr_ones_yet() {
        let read = ["v01.cbz", "v01.cb7", "v01.cbr"]
            .map(|name| type_of(name).is_some_and(|found| found.is_read()));

        assert_eq!(read, [true, true, false]);
    }

    #[test]
    fn finds_books_in_cbz_cb7_and_cbr_files_only() {
        let books = ["v01.cbz", "v01.cb7", "v01.cbr", "notes.txt", "v01.zip"]
            .map(|name| type_of(name).is_some_and(|found| found.is_book()));

        assert_eq!(books, [true, true, true, false, false]);
    }
}
