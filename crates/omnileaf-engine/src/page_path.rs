use std::{fmt, str::FromStr};

use omnileaf_cache::{CacheError, CacheKey};
use omnileaf_sync_proto::BookId;
use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

use crate::ipc_brand::branded_string;

const PAGE_ROUTE: &str = "page";
/// Changes whenever pages are served differently, so no cache keeps serving the old ones under the same path.
const PAGE_VERSION: &str = "v1";
const CROPPED: &str = "cropped";
const SIDES_CROPPED: &str = "sides-cropped";

/// Where the interface finds one page of a book, relative to the app's `omni` protocol, naming ids and never a path on disk.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub struct PagePath {
    pub(crate) book: BookId,
    pub(crate) rev: u32,
    /// Counting from 0, in reading order.
    pub(crate) index: u32,
    pub(crate) crop: PageCrop,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PageCrop {
    Whole,
    Borders,
    SideBorders,
}

impl PageCrop {
    const fn route_suffix(self) -> Option<&'static str> {
        match self {
            Self::Whole => None,
            Self::Borders => Some(CROPPED),
            Self::SideBorders => Some(SIDES_CROPPED),
        }
    }

    fn of_route_suffix(suffix: &str) -> Option<Self> {
        match suffix {
            CROPPED => Some(Self::Borders),
            SIDES_CROPPED => Some(Self::SideBorders),
            _ => None,
        }
    }
}

impl PagePath {
    #[must_use]
    pub const fn cropped(self, crop: PageCrop) -> Self {
        Self { crop, ..self }
    }

    pub(crate) fn cache_key(self) -> Result<CacheKey, CacheError> {
        let Self {
            book,
            rev,
            index,
            crop,
        } = self;
        match crop.route_suffix() {
            Some(suffix) => format!("{book}-{rev}-{index}-{suffix}"),
            None => format!("{book}-{rev}-{index}"),
        }
        .parse()
    }
}

#[derive(Debug, thiserror::Error)]
#[error("read {text:?} as a page path, which isn't one the library gave out")]
pub struct MalformedPagePath {
    text: String,
}

impl fmt::Display for PagePath {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self {
            book,
            rev,
            index,
            crop,
        } = self;
        write!(
            formatter,
            "{PAGE_ROUTE}/{PAGE_VERSION}/{book}/{rev}/{index}"
        )?;
        match crop.route_suffix() {
            Some(suffix) => write!(formatter, "/{suffix}"),
            None => Ok(()),
        }
    }
}

impl FromStr for PagePath {
    type Err = MalformedPagePath;

    fn from_str(text: &str) -> Result<Self, MalformedPagePath> {
        let malformed = || MalformedPagePath {
            text: text.to_owned(),
        };
        let (book, rev, index, crop) = match text.split('/').collect::<Vec<_>>()[..] {
            [PAGE_ROUTE, PAGE_VERSION, book, rev, index] => (book, rev, index, PageCrop::Whole),
            [PAGE_ROUTE, PAGE_VERSION, book, rev, index, suffix] => (
                book,
                rev,
                index,
                PageCrop::of_route_suffix(suffix).ok_or_else(malformed)?,
            ),
            _ => return Err(malformed()),
        };
        Ok(Self {
            book: book.parse().map_err(|_| malformed())?,
            rev: rev.parse().map_err(|_| malformed())?,
            index: index.parse().map_err(|_| malformed())?,
            crop,
        })
    }
}

impl TryFrom<String> for PagePath {
    type Error = MalformedPagePath;

    fn try_from(text: String) -> Result<Self, MalformedPagePath> {
        text.parse()
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
    use proptest::prelude::*;

    use super::*;
    use crate::library_book::sample_book_id;

    fn book(crc32: u32) -> BookId {
        sample_book_id(crc32).0
    }

    #[test]
    fn names_the_route_the_version_the_book_its_revision_and_the_page() {
        let path = PagePath {
            book: book(1),
            rev: 2,
            index: 13,
            crop: PageCrop::Whole,
        };

        let text = path.to_string();

        assert_eq!(text, format!("page/v1/{}/2/13", book(1)));
    }

    #[test]
    fn names_a_page_with_its_borders_cropped_or_only_its_sides() {
        let path = PagePath {
            book: book(1),
            rev: 2,
            index: 13,
            crop: PageCrop::Whole,
        };

        let texts =
            [PageCrop::Borders, PageCrop::SideBorders].map(|crop| path.cropped(crop).to_string());

        assert_eq!(
            texts,
            [
                format!("page/v1/{}/2/13/cropped", book(1)),
                format!("page/v1/{}/2/13/sides-cropped", book(1)),
            ]
        );
    }

    #[test]
    fn reads_a_page_path_the_interface_sends_back_at_the_crop_it_names() {
        let sent = format!(r#"["page/v1/{}/2/13", "sideBorders"]"#, book(1));

        let (path, crop): (PagePath, PageCrop) = serde_json::from_str(&sent).unwrap();

        assert_eq!(
            path.cropped(crop),
            PagePath {
                book: book(1),
                rev: 2,
                index: 13,
                crop: PageCrop::SideBorders,
            }
        );
    }

    #[test]
    fn refuses_a_page_path_sent_back_that_the_library_never_gave_out() {
        let read = serde_json::from_str::<PagePath>(r#""page/v1/not-a-book/2/13""#);

        assert!(read.is_err(), "{read:?}");
    }

    fn any_crop() -> impl Strategy<Value = PageCrop> {
        prop_oneof![
            Just(PageCrop::Whole),
            Just(PageCrop::Borders),
            Just(PageCrop::SideBorders),
        ]
    }

    proptest! {
        #[test]
        fn reads_back_the_path_it_wrote(crc32 in any::<u32>(), rev in any::<u32>(), index in any::<u32>(), crop in any_crop()) {
            let path = PagePath { book: book(crc32), rev, index, crop };

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
            format!("page/v1/{book}/2/13/stretched"),
            format!("page/v1/{book}/2/13/cropped/cropped"),
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
