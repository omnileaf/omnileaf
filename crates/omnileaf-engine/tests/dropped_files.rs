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
use omnileaf_db::rusqlite::{Connection, OpenFlags};
use omnileaf_engine::{
    DropError, DropMode, DropOutcome, FileFate, Library, LibraryListing, RefusalReason,
    RefusedDrop, RemovalTarget,
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

    async fn remove_every_series(&self) {
        let listed = self
            .library
            .series(LibraryListing::default(), None)
            .await
            .unwrap();
        let targets: Vec<RemovalTarget> = listed
            .series
            .iter()
            .map(|series| RemovalTarget::Series { id: series.id })
            .collect();
        self.library
            .remove_from_library(&targets, FileFate::keep())
            .await
            .unwrap();
    }

    fn markers(&self) -> u32 {
        Connection::open_with_flags(
            self.home.path().join("library.sqlite"),
            OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .unwrap()
        .query_row("SELECT count(*) FROM book_removed", [], |row| row.get(0))
        .unwrap()
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

#[cfg(feature = "rar")]
#[tokio::test]
async fn counts_a_dropped_cbr_and_rar_among_the_comics_and_refuses_only_the_text() {
    let dropping = Dropping::new("drop-summary-rar").await;
    let first = dropping.comic("Loose", "One.cbz", 1);
    let cbr = dropping.other_file("Two.cbr", b"Rar!");
    let rar = dropping.other_file("Three.rar", b"Rar!");
    let text = dropping.other_file("notes.txt", b"hello");

    let summary = dropping
        .library
        .inspect_drop(vec![first, cbr, text, rar])
        .await
        .unwrap();

    assert_eq!(
        (summary.first.as_deref(), summary.more, summary.refused),
        (
            Some("One.cbz"),
            2,
            vec![RefusedDrop {
                name: "notes.txt".to_owned(),
                reason: RefusalReason::NotAComic
            }]
        )
    );
}

#[cfg(not(feature = "rar"))]
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
async fn dropping_the_folder_to_add_it_clears_markers() {
    let dropping = Dropping::new("drop-add-clears").await;
    let file = dropping.comic("Loose Comics", "One.cbz", 1);
    dropping
        .library
        .drop_files(vec![file.clone()], DropMode::Add)
        .await
        .unwrap();
    dropping.remove_every_series().await;
    assert_eq!(dropping.markers(), 1);

    dropping
        .library
        .drop_files(vec![file], DropMode::Add)
        .await
        .unwrap();

    assert_eq!(dropping.markers(), 0);
    assert_eq!(dropping.series_titles().await, ["One"]);
}

#[tokio::test]
async fn copying_a_removed_book_into_the_home_folder_again_clears_its_marker_and_lists_it() {
    let dropping = Dropping::new("drop-copy-clears").await;
    let file = dropping.comic("Loose", "One.cbz", 1);
    dropping
        .library
        .drop_files(vec![file.clone()], DropMode::Copy)
        .await
        .unwrap();
    dropping.remove_every_series().await;
    assert_eq!(dropping.markers(), 1);

    dropping
        .library
        .drop_files(vec![file], DropMode::Copy)
        .await
        .unwrap();

    assert_eq!(dropping.markers(), 0);
    assert_eq!(dropping.series_titles().await.len(), 1);
}

#[tokio::test]
async fn copying_one_removed_book_back_leaves_the_other_removed_book_still_in_the_home_folder_out()
{
    let dropping = Dropping::new("drop-copy-narrow").await;
    let first = dropping.comic("Loose", "One.cbz", 1);
    let second = dropping.comic("Loose", "Two.cbz", 2);
    dropping
        .library
        .drop_files(vec![first.clone(), second], DropMode::Copy)
        .await
        .unwrap();
    dropping.remove_every_series().await;
    assert_eq!(dropping.markers(), 2);

    dropping
        .library
        .drop_files(vec![first], DropMode::Copy)
        .await
        .unwrap();

    assert_eq!(
        (dropping.markers(), dropping.series_titles().await),
        (1, ["One".to_owned()].to_vec())
    );
}

#[tokio::test]
async fn copying_a_removed_folder_back_restores_its_books_and_leaves_a_removed_book_beside_it_out()
{
    let dropping = Dropping::new("drop-copy-folder-narrow").await;
    dropping.comic("Shelf", "One.cbz", 1);
    dropping.comic("Shelf", "Two.cbz", 2);
    let beside = dropping.comic("Beside", "Three.cbz", 3);
    let shelf = dropping.outside.path().join("Shelf");
    dropping
        .library
        .drop_files(vec![shelf.clone(), beside], DropMode::Copy)
        .await
        .unwrap();
    dropping.remove_every_series().await;
    assert_eq!(dropping.markers(), 3);

    dropping
        .library
        .drop_files(vec![shelf], DropMode::Copy)
        .await
        .unwrap();

    assert_eq!(
        (dropping.markers(), dropping.series_titles().await),
        (1, ["Shelf".to_owned()].to_vec())
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

#[tokio::test]
async fn copies_no_folder_that_holds_the_home_folder_into_it() {
    let scratch = ScratchFolder::new("drop-copy-holder");
    let holder = scratch.path().join("Holder");
    let library = Library::open(holder.join("Home"), FixedClock)
        .await
        .unwrap();
    write_book(&holder.join("One.cbz"), 1);
    let before = fs::read_dir(&holder).unwrap().count();

    let refused = library
        .drop_files(vec![holder.clone()], DropMode::Copy)
        .await;

    assert!(matches!(refused, Err(DropError::NothingToUse)));
    assert_eq!(fs::read_dir(&holder).unwrap().count(), before);
}

#[cfg(unix)]
#[tokio::test]
async fn copies_the_files_of_a_folder_but_follows_none_of_its_links() {
    let dropping = Dropping::new("drop-copy-links").await;
    dropping.comic("Shelf", "One.cbz", 1);
    let shelf = dropping.outside.path().join("Shelf");
    std::os::unix::fs::symlink(dropping.outside.path(), shelf.join("loop")).unwrap();

    let outcome = dropping
        .library
        .drop_files(vec![shelf], DropMode::Copy)
        .await
        .unwrap();

    assert!(matches!(outcome, DropOutcome::Copied { files: 1 }));
    assert!(dropping.home.path().join("Shelf").join("One.cbz").is_file());
    assert!(!dropping.home.path().join("Shelf").join("loop").exists());
}

#[tokio::test]
async fn reads_the_next_file_dropped_when_the_first_cannot_be_read() {
    let dropping = Dropping::new("drop-read-fallthrough").await;
    let broken = dropping.outside.path().join("A Broken.cbz");
    fs::create_dir_all(dropping.outside.path()).unwrap();
    fs::write(&broken, b"not an archive").unwrap();
    let fine = dropping.comic("Loose", "B Fine.cbz", 2);

    let outcome = dropping
        .library
        .drop_files(vec![broken, fine], DropMode::ReadNow)
        .await
        .unwrap();

    assert!(matches!(outcome, DropOutcome::Reading { .. }));
}

#[tokio::test]
async fn reports_the_failure_of_the_only_file_dropped_when_it_cannot_be_read() {
    let dropping = Dropping::new("drop-read-broken").await;
    let broken = dropping.outside.path().join("Broken.cbz");
    fs::create_dir_all(dropping.outside.path()).unwrap();
    fs::write(&broken, b"not an archive").unwrap();

    let refused = dropping
        .library
        .drop_files(vec![broken], DropMode::ReadNow)
        .await;

    assert!(matches!(refused, Err(DropError::Open(_))));
}

#[tokio::test]
async fn adds_the_folders_that_can_be_read_though_another_cannot() {
    let dropping = Dropping::new("drop-add-partial").await;
    let file = dropping.comic("Loose Comics", "One.cbz", 1);
    let gone = dropping.outside.path().join("Gone Folder");
    fs::create_dir_all(&gone).unwrap();
    let dropped_folder = gone.clone();
    fs::remove_dir_all(&gone).unwrap();

    let outcome = dropping
        .library
        .drop_files(vec![file, dropped_folder], DropMode::Add)
        .await
        .unwrap();

    assert!(matches!(outcome, DropOutcome::Added { folders } if folders.len() == 1));
}
