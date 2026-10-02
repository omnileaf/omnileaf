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

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum Variant {
    Stored,
    Deflated,
    ReorderedEntries,
    RenamedArchive,
    EditedComicInfo,
    ChangedPage,
}

struct Recipe {
    compression: Compression,
    name: &'static str,
    comic_info: &'static str,
    reversed: bool,
    changed_page: Option<u32>,
}

const ORIGINAL: Recipe = Recipe {
    compression: Compression::Stored,
    name: "Sample Series 05 v01.cbz",
    comic_info: COMIC_INFO,
    reversed: false,
    changed_page: None,
};

impl Variant {
    const fn recipe(self) -> Recipe {
        match self {
            Self::Stored => ORIGINAL,
            Self::Deflated => Recipe {
                compression: Compression::Deflated,
                ..ORIGINAL
            },
            Self::ReorderedEntries => Recipe {
                reversed: true,
                ..ORIGINAL
            },
            Self::RenamedArchive => Recipe {
                name: "Another Name.cbz",
                ..ORIGINAL
            },
            Self::EditedComicInfo => Recipe {
                comic_info: EDITED_COMIC_INFO,
                ..ORIGINAL
            },
            Self::ChangedPage => Recipe {
                changed_page: Some(CHANGED_PAGE),
                ..ORIGINAL
            },
        }
    }

    fn fingerprint(self) -> Fingerprint {
        let scratch = ScratchFolder::new(&format!("{self:?}"));
        fingerprint_book(&self.recipe().write(&scratch)).unwrap()
    }
}

impl Recipe {
    fn entries(&self) -> Vec<ArchiveEntry> {
        let mut entries: Vec<ArchiveEntry> = (1..=PAGE_COUNT)
            .map(|index| {
                let content = if self.changed_page == Some(index) {
                    format!("Sample page {index:03}, redrawn\n")
                } else {
                    format!("Sample page {index:03}\n")
                };
                entry(
                    &format!("{index:03}.png"),
                    content.repeat(PAGE_REPEATS).into_bytes(),
                )
            })
            .chain([entry("ComicInfo.xml", self.comic_info.as_bytes().to_vec())])
            .collect();
        if self.reversed {
            entries.reverse();
        }
        entries
    }

    fn write(&self, scratch: &ScratchFolder) -> PathBuf {
        scratch.write(self.name, &cbz(&self.entries(), self.compression).unwrap())
    }
}

#[derive(Deserialize)]
struct Golden {
    vectors: Vec<Vector>,
}

#[derive(Deserialize)]
struct Vector {
    book: Variant,
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
    let original = Variant::Stored.fingerprint();

    let others = [
        Variant::Deflated,
        Variant::ReorderedEntries,
        Variant::RenamedArchive,
        Variant::EditedComicInfo,
    ]
    .map(Variant::fingerprint);

    assert_eq!(others, [original; 4]);
}

#[test]
fn changing_a_page_changes_the_fingerprint() {
    let original = Variant::Stored.fingerprint();

    let changed = Variant::ChangedPage.fingerprint();

    assert_ne!(changed, original);
}
