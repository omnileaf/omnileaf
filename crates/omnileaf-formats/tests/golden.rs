#![expect(
    clippy::unwrap_used,
    reason = "the books are generated from committed vectors, so a failed set-up should stop the test"
)]

mod support;

use std::{fmt::Write, path::PathBuf};

use omnileaf_formats::fingerprint_book;
use omnileaf_sync_proto::{Fingerprint, FingerprintKind};
use omnileaf_testkit::{ArchiveEntry, Compression, cbz};
use serde::Deserialize;
use support::{ScratchFolder, entry};

const PAGE_COUNT: u32 = 4;
const PAGE_REPEATS: usize = 300;
const CHANGED_PAGE: u32 = 2;
const COMIC_INFO: &str = "<ComicInfo><Series>Sample Series 05</Series></ComicInfo>";
const EDITED_COMIC_INFO: &str =
    "<ComicInfo><Series>Sample Series 05</Series><Title>Sample Title</Title></ComicInfo>";

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum Book {
    Stored,
    Deflated,
    ReorderedEntries,
    RenamedArchive,
    EditedComicInfo,
    ChangedPage,
}

impl Book {
    fn write(self, scratch: &ScratchFolder) -> PathBuf {
        let comic_info = if self == Self::EditedComicInfo {
            EDITED_COMIC_INFO
        } else {
            COMIC_INFO
        };
        let mut entries: Vec<ArchiveEntry> = (1..=PAGE_COUNT)
            .map(|index| {
                let content = if self == Self::ChangedPage && index == CHANGED_PAGE {
                    format!("Sample page {index:03}, redrawn\n")
                } else {
                    format!("Sample page {index:03}\n")
                };
                entry(
                    &format!("{index:03}.png"),
                    content.repeat(PAGE_REPEATS).into_bytes(),
                )
            })
            .chain([entry("ComicInfo.xml", comic_info.as_bytes().to_vec())])
            .collect();
        if self == Self::ReorderedEntries {
            entries.reverse();
        }
        let compression = if self == Self::Deflated {
            Compression::Deflated
        } else {
            Compression::Stored
        };
        let name = if self == Self::RenamedArchive {
            "Another Name.cbz"
        } else {
            "Sample Series 05 v01.cbz"
        };
        scratch.write(name, &cbz(&entries, compression).unwrap())
    }

    fn fingerprint(self) -> Fingerprint {
        let scratch = ScratchFolder::new(&format!("{self:?}"));
        fingerprint_book(&self.write(&scratch)).unwrap()
    }
}

#[derive(Deserialize)]
struct Golden {
    vectors: Vec<Vector>,
}

#[derive(Deserialize)]
struct Vector {
    book: Book,
    fingerprint: String,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().fold(String::new(), |mut text, byte| {
        write!(text, "{byte:02x}").unwrap();
        text
    })
}

#[test]
fn fingerprints_match_the_golden_vectors() {
    let golden: Golden = serde_json::from_str(include_str!("golden/fingerprints.json")).unwrap();

    for vector in golden.vectors {
        let fingerprint = vector.book.fingerprint();

        assert_eq!(
            fingerprint.kind(),
            FingerprintKind::Pmf1,
            "{:?}",
            vector.book
        );
        assert_eq!(
            hex(fingerprint.as_bytes()),
            vector.fingerprint,
            "{:?}",
            vector.book
        );
    }
}

#[test]
fn repacking_reordering_renaming_and_editing_metadata_keep_the_fingerprint() {
    let original = Book::Stored.fingerprint();

    let others = [
        Book::Deflated,
        Book::ReorderedEntries,
        Book::RenamedArchive,
        Book::EditedComicInfo,
    ]
    .map(Book::fingerprint);

    assert_eq!(others, [original; 4]);
}

#[test]
fn changing_a_page_changes_the_fingerprint() {
    let original = Book::Stored.fingerprint();

    let changed = Book::ChangedPage.fingerprint();

    assert_ne!(changed, original);
}
