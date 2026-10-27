#![expect(
    clippy::unwrap_used,
    reason = "each test scans its own generated library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests write books with ComicInfo, so the other kinds of book go unused"
)]
mod books;
mod support;

use std::{fs, path::PathBuf};

use books::write_book_with;
use omnileaf_engine::{FolderId, Library, LibraryListing, LibraryWriter, RescanOutcome};
use support::{FixedClock, ScratchFolder};

const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";
const SERIES_03: &str = "Sample Series 03";
const AUTHOR_A: &str = "Sample Author A";
const AUTHOR_B: &str = "Sample Author B";

struct Shelf {
    library: Library,
    comics: PathBuf,
    folder: FolderId,
    _scratch: ScratchFolder,
    _home: ScratchFolder,
}

impl Shelf {
    async fn with(name: &str, books: &[(&str, &str)]) -> Self {
        let shelf = ScratchFolder::new(&format!("{name}-shelf"));
        let comics = shelf.path().join("Comics");
        for (seed, (series, comic_info)) in (1..).zip(books) {
            let book = comics.join(series).join(format!("v{seed:02}.cbz"));
            write_book_with(&book, seed, Some(comic_info));
        }
        let home = ScratchFolder::new(&format!("{name}-home"));
        let library = Library::open(home.path().to_path_buf(), FixedClock)
            .await
            .unwrap();
        library.add_folder(comics.clone(), |_| {}).await.unwrap();
        let folder = library
            .folders(None)
            .await
            .unwrap()
            .folders
            .last()
            .unwrap()
            .id;
        Self {
            library,
            comics,
            folder,
            _scratch: shelf,
            _home: home,
        }
    }

    async fn writers(&self) -> Vec<LibraryWriter> {
        let mut writers = Vec::new();
        let mut after = None;
        loop {
            let page = self.library.writers(after).await.unwrap();
            writers.extend(page.writers);
            match page.next {
                Some(next) => after = Some(next),
                None => return writers,
            }
        }
    }

    async fn names(&self) -> Vec<String> {
        self.writers()
            .await
            .into_iter()
            .map(|writer| writer.name)
            .collect()
    }

    async fn series_by(&self, writer: &str) -> (Vec<String>, u32) {
        let page = self
            .library
            .writer_series(writer.to_owned(), LibraryListing::default(), None)
            .await
            .unwrap();
        let count = self
            .library
            .writer_series_count(writer.to_owned(), LibraryListing::default().filter)
            .await
            .unwrap();
        let titles = page.series.into_iter().map(|series| series.title).collect();
        (titles, count)
    }

    async fn rescan(&self) -> RescanOutcome {
        self.library
            .rescan_folder(self.folder, |_| {})
            .await
            .unwrap()
            .outcome
    }
}

fn written_by(writers: &str) -> String {
    format!("<ComicInfo><Writer>{writers}</Writer></ComicInfo>")
}

fn writer(name: &str, series_count: u32) -> LibraryWriter {
    LibraryWriter {
        name: name.to_owned(),
        series_count,
    }
}

#[tokio::test]
async fn groups_no_series_under_an_artist_who_writes_none() {
    let shelf = Shelf::with(
        "writers-artist",
        &[
            (
                SERIES_01,
                "<ComicInfo><Writer>Sample Author A</Writer><Penciller>Sample Artist</Penciller></ComicInfo>",
            ),
            (
                SERIES_02,
                "<ComicInfo><Penciller>Sample Artist</Penciller><CoverArtist>Sample Artist</CoverArtist></ComicInfo>",
            ),
        ],
    )
    .await;

    let writers = shelf.writers().await;

    assert_eq!(writers, [writer(AUTHOR_A, 1)]);
}

#[tokio::test]
async fn lists_a_series_with_two_writers_under_both() {
    let shelf = Shelf::with(
        "writers-two",
        &[
            (SERIES_01, &written_by(AUTHOR_A)),
            (SERIES_02, &written_by("Sample Author A, Sample Author B")),
        ],
    )
    .await;

    let writers = shelf.writers().await;
    let by_a = shelf.series_by(AUTHOR_A).await;
    let by_b = shelf.series_by(AUTHOR_B).await;

    assert_eq!(writers, [writer(AUTHOR_A, 2), writer(AUTHOR_B, 1)]);
    assert_eq!(
        (by_a, by_b),
        (
            (vec![SERIES_01.to_owned(), SERIES_02.to_owned()], 2),
            (vec![SERIES_02.to_owned()], 1)
        )
    );
}

#[tokio::test]
async fn leaves_out_the_writers_of_series_hidden_with_their_missing_folder() {
    let shelf = Shelf::with("writers-hidden", &[(SERIES_01, &written_by(AUTHOR_A))]).await;
    fs::rename(&shelf.comics, shelf.comics.with_file_name("Comics, moved")).unwrap();
    assert_eq!(shelf.rescan().await, RescanOutcome::Unreachable);

    let writers = shelf.writers().await;
    let by_a = shelf.series_by(AUTHOR_A).await;

    assert_eq!((writers, by_a), (Vec::new(), (Vec::new(), 0)));
}

#[tokio::test]
async fn leaves_out_a_writer_whose_only_book_is_gone() {
    let shelf = Shelf::with(
        "writers-emptied",
        &[
            (SERIES_01, &written_by(AUTHOR_A)),
            (SERIES_03, &written_by(AUTHOR_B)),
        ],
    )
    .await;
    fs::remove_dir_all(shelf.comics.join(SERIES_03)).unwrap();
    shelf.rescan().await;

    let names = shelf.names().await;

    assert_eq!(names, [AUTHOR_A]);
}

#[tokio::test]
async fn pages_through_every_writer_in_title_order() {
    let in_title_order: Vec<String> = (1..=51)
        .map(|number| format!("Sample Author {number}"))
        .collect();
    let shelf = Shelf::with(
        "writers-paged",
        &[(SERIES_01, &written_by(&in_title_order.join(", ")))],
    )
    .await;

    let first = shelf.library.writers(None).await.unwrap();
    let listed = shelf.names().await;

    assert_eq!(first.writers.len(), 50);
    assert_eq!(listed, in_title_order);
}

#[tokio::test]
async fn lists_the_writers_in_the_order_of_the_app_s_language() {
    let shelf = Shelf::with(
        "writers-language",
        &[(SERIES_01, &written_by("Sample Author Z, Sample Author Ö"))],
    )
    .await;
    let before = shelf.names().await;

    shelf
        .library
        .set_language("sv".parse().unwrap())
        .await
        .unwrap();

    assert_eq!(before, ["Sample Author Ö", "Sample Author Z"]);
    assert_eq!(shelf.names().await, ["Sample Author Z", "Sample Author Ö"]);
}
