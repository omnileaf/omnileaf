use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
};

use anyhow::Context;
use omnileaf_testkit::{ArchiveEntry, Compression, Packing, RarFormat, RarOptions, cb7, cbr, cbz};

pub(crate) const CORPUS: &str = "fuzz/corpus";

const ARCHIVE_TARGETS: [&str; 3] = ["open_book", "read_book", "read_cb7"];
const COMIC_INFO_TARGET: &str = "comic_info";
const RAR_TARGET: &str = "read_rar";
const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
const COMIC_INFO_NAME: &str = "ComicInfo.xml";
const BOOK_NAMES: [&str; 4] = ["1.png", "2.jpg", "10.webp", COMIC_INFO_NAME];

const FULL_COMIC_INFO: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<ComicInfo>
  <Series>Sample Series 01</Series>
  <Number>1</Number>
  <Title>Sample Title</Title>
  <Volume>2</Volume>
  <Summary>One &amp; two, caf&#233;.</Summary>
  <Writer>Sample Author, Second Author</Writer>
  <Genre>Mystery</Genre>
  <LanguageISO>en</LanguageISO>
  <Manga>YesAndRightToLeft</Manga>
  <PageCount>2</PageCount>
  <AgeRating>Everyone</AgeRating>
  <Pages>
    <Page Image="0" Type="FrontCover" ImageWidth="400" ImageHeight="600" />
    <Page Image="1" DoublePage="True" />
  </Pages>
</ComicInfo>"#;
const BARE_COMIC_INFO: &str = "<ComicInfo/>";

pub(crate) fn generate(corpus: &Path, rar_fixtures: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let mut written = Vec::new();
    for target in ARCHIVE_TARGETS {
        for (name, bytes) in archive_seeds()? {
            written.push(write(&corpus.join(target).join(name), &bytes)?);
        }
    }
    for (name, bytes) in rar_seeds(rar_fixtures)? {
        written.push(write(&corpus.join(RAR_TARGET).join(name), &bytes)?);
    }
    for (name, xml) in [("full.xml", FULL_COMIC_INFO), ("bare.xml", BARE_COMIC_INFO)] {
        written.push(write(
            &corpus.join(COMIC_INFO_TARGET).join(name),
            xml.as_bytes(),
        )?);
    }
    Ok(written)
}

fn archive_seeds() -> anyhow::Result<Vec<(&'static str, Vec<u8>)>> {
    let book = entries(&BOOK_NAMES);
    let cluttered = entries(&[
        "chapter/",
        "chapter/01.PNG",
        "chapter/02.jxl",
        "__MACOSX/chapter/._01.PNG",
        ".hidden.png",
        "Thumbs.db",
        "notes.txt",
    ]);
    Ok(vec![
        ("stored.cbz", cbz(&book, Compression::Stored)?),
        ("deflated.cbz", cbz(&book, Compression::Deflated)?),
        ("cluttered.cbz", cbz(&cluttered, Compression::Deflated)?),
        ("solid.cb7", cb7(&book, Packing::Solid)?),
        ("per-entry.cb7", cb7(&book, Packing::PerEntry)?),
        ("cluttered.cb7", cb7(&cluttered, Packing::Solid)?),
    ])
}

fn rar_seeds(fixtures: &Path) -> anyhow::Result<Vec<(OsString, Vec<u8>)>> {
    let book = entries(&BOOK_NAMES);
    let mut seeds = vec![
        (
            OsString::from("testkit-stored-rar4.cbr"),
            cbr(&book, &RarOptions::of(RarFormat::RAR4))?,
        ),
        (
            OsString::from("testkit-stored-rar5.cbr"),
            cbr(&book, &RarOptions::of(RarFormat::RAR5))?,
        ),
    ];
    let listing = fs::read_dir(fixtures).with_context(|| format!("list {}", fixtures.display()))?;
    for entry in listing {
        let path = entry
            .with_context(|| format!("list {}", fixtures.display()))?
            .path();
        let Some(name) = path.file_name().filter(|_| is_rar_archive(&path)) else {
            continue;
        };
        let bytes = fs::read(&path).with_context(|| format!("read {}", path.display()))?;
        seeds.push((name.to_owned(), bytes));
    }
    Ok(seeds)
}

fn entries(names: &[&str]) -> Vec<ArchiveEntry> {
    names
        .iter()
        .map(|&name| ArchiveEntry {
            name: name.to_owned(),
            bytes: if name == COMIC_INFO_NAME {
                FULL_COMIC_INFO.as_bytes().to_vec()
            } else {
                PNG_SIGNATURE.to_vec()
            },
        })
        .collect()
}

fn is_rar_archive(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension == "cbr" || extension == "rar")
}

fn write(path: &Path, bytes: &[u8]) -> anyhow::Result<PathBuf> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    fs::write(path, bytes).with_context(|| format!("write the seed {}", path.display()))?;
    Ok(path.to_owned())
}

#[cfg(test)]
mod tests {
    use std::{env, fs, process};

    use omnileaf_formats::{open_book, parse_comic_info};

    use super::*;
    use crate::{rar_fixtures, workspace};

    const TESTKIT_RAR_SEEDS: [&str; 2] = ["testkit-stored-rar4.cbr", "testkit-stored-rar5.cbr"];
    const COMMITTED_RAR_ARCHIVES_THAT_OPEN: usize = 9;

    fn scratch(name: &str) -> PathBuf {
        env::temp_dir().join(format!("omnileaf-xtask-{name}-{}", process::id()))
    }

    fn seeds_for(corpus: &Path, target: &str) -> Vec<PathBuf> {
        fs::read_dir(corpus.join(target))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect()
    }

    #[test]
    fn every_archive_seed_opens_as_a_book_with_pages() {
        let corpus = scratch("archive-seeds");

        generate(&corpus, &workspace::root().join(rar_fixtures::FIXTURES)).unwrap();

        for target in ARCHIVE_TARGETS {
            let seeds = seeds_for(&corpus, target);
            assert!(!seeds.is_empty(), "no seeds for {target}");
            for seed in seeds {
                let book = open_book(&seed).unwrap();
                assert!(!book.pages().is_empty(), "{} has no pages", seed.display());
            }
        }
        fs::remove_dir_all(&corpus).unwrap();
    }

    #[test]
    fn every_comic_info_seed_parses() {
        let corpus = scratch("comic-info-seeds");

        generate(&corpus, &workspace::root().join(rar_fixtures::FIXTURES)).unwrap();

        let seeds = seeds_for(&corpus, COMIC_INFO_TARGET);
        assert!(!seeds.is_empty());
        for seed in seeds {
            parse_comic_info(&fs::read(&seed).unwrap()).unwrap();
        }
        fs::remove_dir_all(&corpus).unwrap();
    }

    #[test]
    fn seeds_read_rar_with_every_committed_rar_archive_and_two_testkit_books() {
        let corpus = scratch("rar-seeds");
        let fixtures = workspace::root().join(rar_fixtures::FIXTURES);
        let committed: Vec<PathBuf> = fs::read_dir(&fixtures)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|path| is_rar_archive(path))
            .collect();

        generate(&corpus, &fixtures).unwrap();

        let seeds = corpus.join(RAR_TARGET);
        assert_eq!(
            seeds_for(&corpus, RAR_TARGET).len(),
            committed.len() + TESTKIT_RAR_SEEDS.len()
        );
        let mut committed_that_open = 0;
        for archive in &committed {
            let seed = seeds.join(archive.file_name().unwrap());
            assert_eq!(fs::read(&seed).unwrap(), fs::read(archive).unwrap());
            committed_that_open += usize::from(open_book(&seed).is_ok());
        }
        let testkit_pages: Vec<usize> = TESTKIT_RAR_SEEDS
            .iter()
            .map(|name| open_book(&seeds.join(name)).unwrap().pages().len())
            .collect();
        assert_eq!(
            (committed_that_open, testkit_pages),
            (COMMITTED_RAR_ARCHIVES_THAT_OPEN, vec![3, 3])
        );
        fs::remove_dir_all(&corpus).unwrap();
    }
}
