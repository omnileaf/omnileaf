#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests write plain archives, so the other kinds of book go unused"
)]
mod books;
mod support;

use std::{fs, path::PathBuf};

use books::write_book;
use omnileaf_engine::{
    DropError, DropMode, DropOutcome, Library, LibraryListing, RefusalReason, RefusedDrop,
};
use support::{FixedClock, ScratchFolder};

struct Dropping {
    library: Library,
    outside: ScratchFolder,
    home: ScratchFolder,
}

impl Dropping {
    async fn new(name: &str) -> Self {
        let home = ScratchFolder::new(&format!("{name}-home"));
        let library = Library::open(home.path().to_path_buf(), FixedClock)
            .await
            .unwrap();
        Self {
            library,
            outside: ScratchFolder::new(&format!("{name}-outside")),
            home,
        }
    }

    fn comic(&self, folder: &str, name: &str, seed: u64) -> PathBuf {
        let path = self.outside.path().join(folder).join(name);
        write_book(&path, seed);
        path
    }

    fn other_file(&self, name: &str, bytes: &[u8]) -> PathBuf {
        let path = self.outside.path().join(name);
        fs::create_dir_all(self.outside.path()).unwrap();
        fs::write(&path, bytes).unwrap();
        path
    }

    async fn series_titles(&self) -> Vec<String> {
        self.library
            .series(LibraryListing::default(), None)
            .await
            .unwrap()
            .series
            .into_iter()
            .map(|series| series.title)
            .collect()
    }
}

#[tokio::test]
async fn names_the_first_file_how_many_more_their_size_and_what_it_refuses() {
    let dropping = Dropping::new("drop-summary").await;
    let first = dropping.comic("Loose", "One.cbz", 1);
    let second = dropping.comic("Loose", "Two.cbz", 2);
    let folder = dropping.outside.path().join("Loose");
    let unsupported = dropping.other_file("Three.cbr", b"Rar!");
    let text = dropping.other_file("notes.txt", b"hello");
    let size = u32::try_from(
        (fs::metadata(&first).unwrap().len() + fs::metadata(&second).unwrap().len()).div_ceil(1000),
    )
    .unwrap();

    let summary = dropping
        .library
        .inspect_drop(vec![first, unsupported, text, second, folder])
        .await
        .unwrap();

    assert_eq!(
        (
            summary.first.as_deref(),
            summary.more,
            summary.total_kilobytes,
            summary.refused
        ),
        (
            Some("One.cbz"),
            2,
            size,
            vec![
                RefusedDrop {
                    name: "Three.cbr".to_owned(),
                    reason: RefusalReason::TypeNotReadYet
                },
                RefusedDrop {
                    name: "notes.txt".to_owned(),
                    reason: RefusalReason::NotAComic
                }
            ]
        )
    );
}

#[tokio::test]
async fn reads_the_first_file_dropped_without_adding_anything() {
    let dropping = Dropping::new("drop-read").await;
    let first = dropping.comic("Loose", "One.cbz", 1);
    let second = dropping.comic("Other", "Two.cbz", 2);

    let outcome = dropping
        .library
        .drop_files(vec![first, second], DropMode::ReadNow)
        .await
        .unwrap();

    assert!(matches!(
        outcome,
        DropOutcome::Reading {
            is_in_library: false,
            ..
        }
    ));
    assert_eq!(dropping.series_titles().await, Vec::<String>::new());
}

#[tokio::test]
async fn reads_the_first_book_of_a_dropped_folder() {
    let dropping = Dropping::new("drop-read-folder").await;
    dropping.comic("Loose", "B Two.cbz", 2);
    dropping.comic("Loose", "A One.cbz", 1);
    let folder = dropping.outside.path().join("Loose");

    let outcome = dropping
        .library
        .drop_files(vec![folder], DropMode::ReadNow)
        .await
        .unwrap();

    assert!(matches!(
        outcome,
        DropOutcome::Reading {
            is_in_library: false,
            ..
        }
    ));
}

#[tokio::test]
async fn adds_the_folder_of_each_file_dropped_once() {
    let dropping = Dropping::new("drop-add").await;
    let first = dropping.comic("Loose Comics", "One.cbz", 1);
    let second = dropping.comic("Loose Comics", "Two.cbz", 2);

    let outcome = dropping
        .library
        .drop_files(vec![first, second], DropMode::Add)
        .await
        .unwrap();

    let DropOutcome::Added { folders } = outcome else {
        panic!("expected folders added");
    };
    assert_eq!(
        (folders.len(), folders[0].books),
        (1, 2),
        "{:?}",
        dropping.series_titles().await
    );
}

#[tokio::test]
async fn copies_what_is_dropped_into_the_home_folder_and_lists_it() {
    let dropping = Dropping::new("drop-copy").await;
    let file = dropping.comic("Loose", "One.cbz", 1);
    fs::create_dir_all(dropping.home.path()).unwrap();
    fs::write(dropping.home.path().join("One.cbz"), b"already here").unwrap();

    let outcome = dropping
        .library
        .drop_files(vec![file], DropMode::Copy)
        .await
        .unwrap();

    assert!(matches!(outcome, DropOutcome::Copied { files: 1 }));
    assert_eq!(
        (
            fs::read(dropping.home.path().join("One.cbz")).unwrap(),
            dropping.home.path().join("One (2).cbz").is_file(),
            dropping.series_titles().await.len(),
        ),
        (b"already here".to_vec(), true, 1)
    );
}

#[tokio::test]
async fn refuses_a_drop_holding_no_comic_and_no_folder() {
    let dropping = Dropping::new("drop-nothing").await;
    let text = dropping.other_file("notes.txt", b"hello");

    let refused = dropping
        .library
        .drop_files(vec![text], DropMode::ReadNow)
        .await;

    assert!(matches!(refused, Err(DropError::NothingToUse)));
}
