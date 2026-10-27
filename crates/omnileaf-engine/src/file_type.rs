use std::{collections::BTreeSet, fmt, path::Path};

use omnileaf_formats::FormatError;
use serde::{Deserialize, Serialize};
use specta::Type;

const READ_BOOK_TYPES: [&str; 2] = ["cbz", "cb7"];
const BOOK_TYPES_NOT_READ_YET: [&str; 2] = ["cbr", "rar"];

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Type)]
#[serde(try_from = "String", into = "String")]
pub struct FileType(String);

#[derive(Debug, thiserror::Error)]
#[error("{text:?} isn't a file type")]
pub struct NotAFileType {
    text: String,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct HiddenFileTypes(BTreeSet<String>);

impl FileType {
    #[must_use]
    pub fn of(path: &Path) -> Option<Self> {
        let extension = path.extension()?.to_str()?;
        Some(Self(extension.to_ascii_lowercase()))
    }

    pub(crate) fn is_read(&self) -> bool {
        READ_BOOK_TYPES.contains(&self.0.as_str())
    }

    pub(crate) fn is_book(&self) -> bool {
        self.is_read() || BOOK_TYPES_NOT_READ_YET.contains(&self.0.as_str())
    }

    pub(crate) fn can_be_hidden(&self) -> bool {
        self.is_book() && !self.is_read()
    }

    pub(crate) fn is_unsupported_given(&self, failure: &FormatError) -> bool {
        let is_archive_not_read_yet = matches!(failure, FormatError::ArchiveNotSupportedYet { .. });
        is_archive_not_read_yet && self.can_be_hidden()
    }

    pub(crate) fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for FileType {
    type Error = NotAFileType;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        let is_lowercase_extension = !text.is_empty()
            && text
                .chars()
                .all(|letter| letter.is_ascii_lowercase() || letter.is_ascii_digit());
        if is_lowercase_extension {
            Ok(Self(text))
        } else {
            Err(NotAFileType { text })
        }
    }
}

impl From<FileType> for String {
    fn from(file_type: FileType) -> Self {
        file_type.0
    }
}

impl HiddenFileTypes {
    pub(crate) fn hides(&self, path: &Path) -> bool {
        FileType::of(path).is_some_and(|found| self.0.contains(found.as_str()))
    }
}

impl FromIterator<String> for HiddenFileTypes {
    fn from_iter<Types: IntoIterator<Item = String>>(types: Types) -> Self {
        Self(types.into_iter().collect())
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
    fn reads_cbz_and_cb7_files_but_not_cbr_or_rar_ones_yet() {
        let read = ["v01.cbz", "v01.cb7", "v01.cbr", "v01.rar"]
            .map(|name| type_of(name).is_some_and(|found| found.is_read()));

        assert_eq!(read, [true, true, false, false]);
    }

    #[test]
    fn hides_only_the_book_types_it_does_not_read() {
        let hideable = ["v01.cbz", "v01.cb7", "v01.cbr", "v01.rar", "notes.txt"]
            .map(|name| type_of(name).is_some_and(|found| found.can_be_hidden()));

        assert_eq!(hideable, [false, false, true, true, false]);
    }

    #[test]
    fn takes_back_a_file_type_it_handed_over() {
        let file_type = type_of("v01.cbr").unwrap();

        let sent = serde_json::to_string(&file_type).unwrap();

        assert_eq!(sent, r#""cbr""#);
        assert_eq!(serde_json::from_str::<FileType>(&sent).unwrap(), file_type);
    }

    #[test]
    fn refuses_text_that_is_no_lowercase_extension() {
        let parsed = ["", "CBR", "c.br", "../cbr", "c br"]
            .map(|text| serde_json::from_value::<FileType>(serde_json::Value::from(text)).is_err());

        assert_eq!(parsed, [true; 5]);
    }

    #[test]
    fn hides_the_files_of_the_types_it_holds() {
        let hidden = HiddenFileTypes::from_iter(["cbr".to_owned()]);

        let hides = ["Sample Series 01/v01.CBR", "v01.cbz", "Chapter 1"]
            .map(|name| hidden.hides(Path::new(name)));

        assert_eq!(hides, [true, false, false]);
    }

    #[test]
    fn finds_books_in_cbz_cb7_cbr_and_rar_files_only() {
        let books = [
            "v01.cbz",
            "v01.cb7",
            "v01.cbr",
            "v01.rar",
            "notes.txt",
            "v01.zip",
        ]
        .map(|name| type_of(name).is_some_and(|found| found.is_book()));

        assert_eq!(books, [true, true, true, true, false, false]);
    }
}
