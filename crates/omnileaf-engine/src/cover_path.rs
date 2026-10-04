use std::{fmt, str::FromStr};

use omnileaf_db::catalog::Cover;
use serde::Serialize;
use specta::{Type, Types, datatype::DataType};

use crate::ipc_brand::branded_string;

const THUMBNAIL_ROUTE: &str = "thumb";
/// Changes whenever thumbnails are made differently, so no cache keeps serving the old ones under the same path.
pub(crate) const THUMBNAIL_VERSION: &str = "v1";

/// Where the interface finds a book's cover thumbnail, relative to the app's `omni` protocol, naming ids and never a path on disk.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(into = "String")]
pub struct CoverPath(pub(crate) Cover);

#[derive(Debug, thiserror::Error)]
#[error("read {text:?} as a cover path, which isn't one the library gave out")]
pub struct MalformedCoverPath {
    text: String,
}

impl fmt::Display for CoverPath {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Cover { book, file, rev } = self.0;
        write!(
            formatter,
            "{THUMBNAIL_ROUTE}/{THUMBNAIL_VERSION}/{book}/{file}/{rev}"
        )
    }
}

impl FromStr for CoverPath {
    type Err = MalformedCoverPath;

    fn from_str(text: &str) -> Result<Self, MalformedCoverPath> {
        let malformed = || MalformedCoverPath {
            text: text.to_owned(),
        };
        let [THUMBNAIL_ROUTE, THUMBNAIL_VERSION, book, file, rev] =
            text.split('/').collect::<Vec<_>>()[..]
        else {
            return Err(malformed());
        };
        Ok(Self(Cover {
            book: book.parse().map_err(|_| malformed())?,
            file: file.parse().map_err(|_| malformed())?,
            rev: rev.parse().map_err(|_| malformed())?,
        }))
    }
}

impl From<CoverPath> for String {
    fn from(path: CoverPath) -> Self {
        path.to_string()
    }
}

impl Type for CoverPath {
    fn definition(types: &mut Types) -> DataType {
        branded_string("CoverPath", types)
    }
}

#[cfg(test)]
mod tests {
    use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry};
    use proptest::prelude::*;

    use super::*;

    fn cover(crc32: u32, file: i64, rev: u32) -> CoverPath {
        let fingerprint = Fingerprint::pmf1([ImageEntry { crc32, size: 1 }]).unwrap();
        CoverPath(Cover {
            book: BookId::local(&fingerprint),
            file: file.to_string().parse().unwrap(),
            rev,
        })
    }

    #[test]
    fn names_the_route_the_version_and_the_ids() {
        let path = cover(1, 7, 2);

        let text = path.to_string();

        assert_eq!(text, format!("thumb/v1/{}/7/2", path.0.book));
    }

    proptest! {
        #[test]
        fn reads_back_the_path_it_wrote(crc32 in any::<u32>(), file in any::<i64>(), rev in any::<u32>()) {
            let path = cover(crc32, file, rev);

            let read = path.to_string().parse::<CoverPath>();

            prop_assert_eq!(read.ok(), Some(path));
        }
    }

    #[test]
    fn refuses_a_path_the_library_never_gave_out() {
        let book = cover(1, 7, 2).0.book;
        let refused = [
            String::new(),
            "thumb".to_owned(),
            format!("thumb/v2/{book}/7/2"),
            format!("page/v1/{book}/7/2"),
            format!("thumb/v1/{book}/7"),
            format!("thumb/v1/{book}/7/2/3"),
            format!("thumb/v1/{book}/seven/2"),
            format!("thumb/v1/{book}/7/-2"),
            "thumb/v1/not-a-book/7/2".to_owned(),
            format!("thumb/v1/{book}/../2"),
        ];

        let read: Vec<_> = refused
            .iter()
            .map(|text| text.parse::<CoverPath>())
            .collect();

        assert!(read.iter().all(Result::is_err), "{read:?}");
    }
}
