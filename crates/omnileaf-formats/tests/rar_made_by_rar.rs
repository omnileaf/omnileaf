#![expect(
    clippy::unwrap_used,
    reason = "the fixtures are committed, so a failed read should stop the test"
)]

use std::{collections::BTreeSet, fs, ops::ControlFlow, path::PathBuf};

use omnileaf_formats::{FormatError, open_book};
use serde::Deserialize;
use sha2::{Digest, Sha256};

const MANIFEST: &str = include_str!("rar_fixtures/manifest.json");
const FOLDER: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/rar_fixtures");

#[derive(Deserialize)]
struct Manifest {
    fixtures: Vec<Fixture>,
}

#[derive(Deserialize)]
struct Fixture {
    file: String,
    maker: Maker,
    sha256: String,
    outcome: Outcome,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Maker {
    Rar5,
    Rar4,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum Outcome {
    Opens {
        pages: Vec<Page>,
        comic_info: ComicInfo,
    },
    Refused(Refusal),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Refusal {
    Encrypted,
    MultiVolume,
    SolidRar4,
}

#[derive(Deserialize)]
struct Page {
    name: String,
    size: usize,
    sha256: String,
}

#[derive(Deserialize)]
struct ComicInfo {
    series: String,
    number: String,
}

struct Opening {
    file: String,
    pages: Vec<Page>,
    comic_info: ComicInfo,
}

fn fixtures() -> Vec<Fixture> {
    serde_json::from_str::<Manifest>(MANIFEST).unwrap().fixtures
}

fn path_of(file: &str) -> PathBuf {
    PathBuf::from(FOLDER).join(file)
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .flat_map(|byte| [byte >> 4, byte & 0x0f])
        .filter_map(|nibble| char::from_digit(u32::from(nibble), 16))
        .collect()
}

fn opening() -> Vec<Opening> {
    fixtures()
        .into_iter()
        .filter_map(|fixture| match fixture.outcome {
            Outcome::Opens { pages, comic_info } => Some(Opening {
                file: fixture.file,
                pages,
                comic_info,
            }),
            Outcome::Refused(_) => None,
        })
        .collect()
}

#[test]
fn covers_both_rar_formats_and_every_refusal() {
    let makers: BTreeSet<_> = fixtures().iter().map(|fixture| fixture.maker).collect();
    let refusals: BTreeSet<_> = fixtures()
        .iter()
        .filter_map(|fixture| match fixture.outcome {
            Outcome::Refused(refusal) => Some(refusal),
            Outcome::Opens { .. } => None,
        })
        .collect();

    assert_eq!(makers, BTreeSet::from([Maker::Rar5, Maker::Rar4]));
    assert_eq!(
        refusals,
        BTreeSet::from([Refusal::Encrypted, Refusal::MultiVolume, Refusal::SolidRar4])
    );
    assert!(opening().len() >= 8);
}

#[test]
fn keeps_every_committed_archive_as_the_manifest_hashed_it() {
    for fixture in fixtures() {
        let bytes = fs::read(path_of(&fixture.file)).unwrap();

        assert_eq!(sha256_hex(&bytes), fixture.sha256, "{}", fixture.file);
    }
}

#[test]
fn lists_no_archive_the_manifest_does_not_name() {
    let mut named: Vec<_> = fixtures().into_iter().map(|fixture| fixture.file).collect();
    let mut committed: Vec<_> = fs::read_dir(FOLDER)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .filter(|name| name != "manifest.json")
        .collect();
    named.sort();
    committed.sort();

    assert_eq!(committed, named);
}

#[test]
fn lists_the_pages_in_reading_order_though_rar_archived_them_in_reverse() {
    for opening in opening() {
        let book = open_book(&path_of(&opening.file)).unwrap();

        let listed: Vec<_> = book
            .pages()
            .iter()
            .map(|page| (page.name.as_str(), usize::try_from(page.size).unwrap()))
            .collect();

        let stored: Vec<_> = opening
            .pages
            .iter()
            .map(|page| (page.name.as_str(), page.size))
            .collect();
        assert_eq!(listed, stored, "{}", opening.file);
    }
}

#[test]
fn extracts_every_page_exactly_as_it_went_into_rar() {
    for opening in opening() {
        let mut book = open_book(&path_of(&opening.file)).unwrap();

        let extracted: Vec<_> = (0..opening.pages.len())
            .map(|index| sha256_hex(&book.read_page(index).unwrap()))
            .collect();

        let stored: Vec<_> = opening
            .pages
            .iter()
            .map(|page| page.sha256.clone())
            .collect();
        assert_eq!(extracted, stored, "{}", opening.file);
    }
}

#[test]
fn extracts_every_page_in_one_pass_exactly_as_it_went_into_rar() {
    for opening in opening() {
        let mut book = open_book(&path_of(&opening.file)).unwrap();
        let mut extracted = Vec::new();

        book.read_every_page(|index, bytes| {
            extracted.push((index, sha256_hex(&bytes)));
            ControlFlow::Continue(())
        })
        .unwrap();

        extracted.sort();
        let stored: Vec<_> = opening
            .pages
            .iter()
            .enumerate()
            .map(|(index, page)| (index, page.sha256.clone()))
            .collect();
        assert_eq!(extracted, stored, "{}", opening.file);
    }
}

#[test]
fn reads_the_comic_info_rar_stored() {
    for opening in opening() {
        let mut book = open_book(&path_of(&opening.file)).unwrap();

        let comic_info = book.comic_info().unwrap().unwrap();

        assert_eq!(
            comic_info.series.as_deref(),
            Some(opening.comic_info.series.as_str()),
            "{}",
            opening.file
        );
        assert_eq!(
            comic_info.number.as_deref(),
            Some(opening.comic_info.number.as_str()),
            "{}",
            opening.file
        );
    }
}

#[test]
fn refuses_the_archives_it_does_not_read_for_the_reason_rar_made_them() {
    for fixture in fixtures() {
        let Outcome::Refused(refusal) = fixture.outcome else {
            continue;
        };

        let failure = open_book(&path_of(&fixture.file)).unwrap_err();

        let as_expected = match (refusal, &failure) {
            (Refusal::Encrypted, FormatError::Encrypted { .. })
            | (Refusal::MultiVolume, FormatError::MultiVolume { .. }) => true,
            (Refusal::SolidRar4, FormatError::UnsupportedCompression { method, .. }) => {
                method.contains("solid")
            }
            _ => false,
        };
        assert!(as_expected, "{}: {failure:?}", fixture.file);
    }
}
