use std::{fmt, str::FromStr};

use omnileaf_sync_proto::BookId;
use serde::Serialize;
use specta::{Type, Types, datatype::DataType};

use crate::ipc_brand::branded_string;

const PAGE_ROUTE: &str = "page";
/// Changes whenever pages are served differently, so no cache keeps serving the old ones under the same path.
const PAGE_VERSION: &str = "v1";

/// Where the interface finds one page of a book, relative to the app's `omni` protocol, naming ids and never a path on disk.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(into = "String")]
pub struct PagePath {
    pub(crate) book: BookId,
    /// The revision of the book's file the page was read from.
    pub(crate) rev: u32,
    /// Counting from 0, in reading order.
    pub(crate) index: u32,
}

#[derive(Debug, thiserror::Error)]
#[error("read {text:?} as a page path, which isn't one the library gave out")]
pub struct MalformedPagePath {
    text: String,
}

impl fmt::Display for PagePath {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self { book, rev, index } = self;
        write!(
            formatter,
            "{PAGE_ROUTE}/{PAGE_VERSION}/{book}/{rev}/{index}"
        )
    }
}

impl FromStr for PagePath {
    type Err = MalformedPagePath;

    fn from_str(text: &str) -> Result<Self, MalformedPagePath> {
        let malformed = || MalformedPagePath {
            text: text.to_owned(),
        };
        let [PAGE_ROUTE, PAGE_VERSION, book, rev, index] = text.split('/').collect::<Vec<_>>()[..]
        else {
            return Err(malformed());
        };
        Ok(Self {
            book: book.parse().map_err(|_| malformed())?,
            rev: rev.parse().map_err(|_| malformed())?,
            index: index.parse().map_err(|_| malformed())?,
        })
    }
}

impl From<PagePath> for String {
    fn from(path: PagePath) -> Self {
        path.to_string()
    }
}

impl Type for PagePath {
    fn definition(types: &mut Types) -> DataType {
        branded_string("PagePath", types)
    }
}

#[cfg(test)]
mod tests {
    use omnileaf_sync_proto::{Fingerprint, ImageEntry};
    use proptest::prelude::*;

    use super::*;

    fn book(crc32: u32) -> BookId {
        BookId::local(&Fingerprint::pmf1([ImageEntry { crc32, size: 1 }]).unwrap())
    }

    #[test]
    fn names_the_route_the_version_the_book_its_revision_and_the_page() {
        let path = PagePath {
            book: book(1),
            rev: 2,
            index: 13,
        };

        let text = path.to_string();

        assert_eq!(text, format!("page/v1/{}/2/13", book(1)));
    }

    proptest! {
        #[test]
        fn reads_back_the_path_it_wrote(crc32 in any::<u32>(), rev in any::<u32>(), index in any::<u32>()) {
            let path = PagePath { book: book(crc32), rev, index };

            let read = path.to_string().parse::<PagePath>();

            prop_assert_eq!(read.ok(), Some(path));
        }
    }

    #[test]
    fn refuses_a_path_the_library_never_gave_out() {
        let book = book(1);
        let refused = [
            String::new(),
            "page".to_owned(),
            format!("page/v2/{book}/2/13"),
            format!("thumb/v1/{book}/2/13"),
            format!("page/v1/{book}/2"),
            format!("page/v1/{book}/2/13/4"),
            format!("page/v1/{book}/two/13"),
            format!("page/v1/{book}/2/-13"),
            "page/v1/not-a-book/2/13".to_owned(),
            format!("page/v1/{book}/../13"),
        ];

        let read: Vec<_> = refused
            .iter()
            .map(|text| text.parse::<PagePath>())
            .collect();

        assert!(read.iter().all(Result::is_err), "{read:?}");
    }
}
