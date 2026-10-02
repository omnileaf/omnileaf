use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::Context;
use omnileaf_testkit::{ArchiveEntry, Compression, cbz};

pub(crate) const CORPUS: &str = "fuzz/corpus";

const ARCHIVE_TARGETS: [&str; 2] = ["open_book", "read_book"];
const COMIC_INFO_TARGET: &str = "comic_info";
const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
const COMIC_INFO_NAME: &str = "ComicInfo.xml";

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

/// Writes small seed inputs for each fuzz target into `corpus`, leaving inputs the fuzzer has added in place.
pub(crate) fn generate(corpus: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let mut written = Vec::new();
    for target in ARCHIVE_TARGETS {
        for (name, bytes) in archive_seeds()? {
            written.push(write(&corpus.join(target).join(name), &bytes)?);
        }
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
    let book = entries(&["1.png", "2.jpg", "10.webp", COMIC_INFO_NAME]);
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
    ])
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

        generate(&corpus).unwrap();

        for target in ["open_book", "read_book"] {
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

        generate(&corpus).unwrap();

        let seeds = seeds_for(&corpus, "comic_info");
        assert!(!seeds.is_empty());
        for seed in seeds {
            parse_comic_info(&fs::read(&seed).unwrap()).unwrap();
        }
        fs::remove_dir_all(&corpus).unwrap();
    }
}
