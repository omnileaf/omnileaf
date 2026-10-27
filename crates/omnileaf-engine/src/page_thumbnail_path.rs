use std::{fmt, str::FromStr};

use serde::Serialize;
use specta::{Type, Types, datatype::DataType};

use crate::{PageCrop, PagePath, cover_path::THUMBNAIL_VERSION, ipc_brand::branded_string};

const PAGE_THUMBNAIL_ROUTE: &str = "page-thumb";

/// Where the interface finds a small thumbnail of one page, relative to the app's `omni` protocol, naming ids and never a path on disk.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(into = "String")]
pub struct PageThumbnailPath(pub(crate) PagePath);

#[derive(Debug, thiserror::Error)]
#[error("read {text:?} as a page thumbnail path, which isn't one the library gave out")]
pub struct MalformedPageThumbnailPath {
    text: String,
}

impl fmt::Display for PageThumbnailPath {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let PagePath {
            book, rev, index, ..
        } = self.0;
        write!(
            formatter,
            "{PAGE_THUMBNAIL_ROUTE}/{THUMBNAIL_VERSION}/{book}/{rev}/{index}"
        )
    }
}

impl FromStr for PageThumbnailPath {
    type Err = MalformedPageThumbnailPath;

    fn from_str(text: &str) -> Result<Self, MalformedPageThumbnailPath> {
        let malformed = || MalformedPageThumbnailPath {
            text: text.to_owned(),
        };
        let [PAGE_THUMBNAIL_ROUTE, THUMBNAIL_VERSION, book, rev, index] =
            text.split('/').collect::<Vec<_>>()[..]
        else {
            return Err(malformed());
        };
        Ok(Self(PagePath {
            book: book.parse().map_err(|_| malformed())?,
            rev: rev.parse().map_err(|_| malformed())?,
            index: index.parse().map_err(|_| malformed())?,
            crop: PageCrop::Whole,
        }))
    }
}

impl From<PageThumbnailPath> for String {
    fn from(path: PageThumbnailPath) -> Self {
        path.to_string()
    }
}

impl Type for PageThumbnailPath {
    fn definition(types: &mut Types) -> DataType {
        branded_string("PageThumbnailPath", types)
    }
}

#[cfg(test)]
mod tests {
    use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry};
    use proptest::prelude::*;

    use super::*;

    fn book(crc32: u32) -> BookId {
        BookId::local(&Fingerprint::pmf1([ImageEntry { crc32, size: 1 }]).unwrap())
    }

    fn thumbnail(crc32: u32, rev: u32, index: u32) -> PageThumbnailPath {
        PageThumbnailPath(PagePath {
            book: book(crc32),
            rev,
            index,
            crop: PageCrop::Whole,
        })
    }

    #[test]
    fn names_the_route_the_version_the_book_its_revision_and_the_page() {
        let path = thumbnail(1, 2, 13);

        let text = path.to_string();

        assert_eq!(text, format!("page-thumb/v1/{}/2/13", book(1)));
    }

    proptest! {
        #[test]
        fn reads_back_the_path_it_wrote(crc32 in any::<u32>(), rev in any::<u32>(), index in any::<u32>()) {
            let path = thumbnail(crc32, rev, index);

            let read = path.to_string().parse::<PageThumbnailPath>();

            prop_assert_eq!(read.ok(), Some(path));
        }
    }

    #[test]
    fn refuses_a_path_the_library_never_gave_out() {
        let book = book(1);
        let refused = [
            String::new(),
            "page-thumb".to_owned(),
            format!("page-thumb/v2/{book}/2/13"),
            format!("page/v1/{book}/2/13"),
            format!("thumb/v1/{book}/2/13"),
            format!("page-thumb/v1/{book}/2"),
            format!("page-thumb/v1/{book}/2/13/4"),
            format!("page-thumb/v1/{book}/two/13"),
            format!("page-thumb/v1/{book}/2/-13"),
            "page-thumb/v1/not-a-book/2/13".to_owned(),
            format!("page-thumb/v1/{book}/../13"),
            format!("page-thumb/v1/../{book}/2/13"),
            format!("page-thumb/v1/{book}/2/.."),
        ];

        let read: Vec<_> = refused
            .iter()
            .map(|text| text.parse::<PageThumbnailPath>())
            .collect();

        assert!(read.iter().all(Result::is_err), "{read:?}");
    }
}
