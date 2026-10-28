#![expect(
    clippy::unwrap_used,
    reason = "each test scans its own generated library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests write books with or without ComicInfo, so the other kinds of book go unused"
)]
mod books;
mod support;

use books::write_book_with;
use omnileaf_engine::{Library, LibraryFolderGroup, LibraryListing};
use support::{FixedClock, ScratchFolder};

const JOINED: &str = "<ComicInfo><Series>Sample Series 09</Series></ComicInfo>";
const BOOKS: [(&str, Option<&str>); 6] = [
    ("Author B/Sample Series 02/v01.cbz", None),
    ("Sample Series 04/v01.cbz", None),
    ("Sample Series 07.cbz", None),
    ("Publisher/Author C/Sample Series 05/v01.cbz", None),
    ("Author B/Sample Series 06/v01.cbz", Some(JOINED)),
    ("Publisher/Author C/Sample Series 09/v01.cbz", Some(JOINED)),
];

struct Shelf {
    library: Library,
    _scratch: ScratchFolder,
    _home: ScratchFolder,
}

impl Shelf {
    async fn scanned(name: &str) -> Self {
        let shelf = ScratchFolder::new(&format!("{name}-shelf"));
        let comics = shelf.path().join("Comics");
        for (seed, (book, comic_info)) in (1..).zip(BOOKS) {
            write_book_with(&comics.join(book), seed, comic_info);
        }
        let home = ScratchFolder::new(&format!("{name}-home"));
        let library = Library::open(home.path().to_path_buf(), FixedClock)
            .await
            .unwrap();
        library.add_folder(comics, |_| {}).await.unwrap();
        Self {
            library,
            _scratch: shelf,
            _home: home,
        }
    }

    async fn groups(&self) -> Vec<LibraryFolderGroup> {
        let mut groups = Vec::new();
        let mut after = None;
        loop {
            let page = self.library.folder_groups(after).await.unwrap();
            groups.extend(page.groups);
            match page.next {
                Some(next) => after = Some(next),
                None => return groups,
            }
        }
    }

    async fn series_in(&self, group: &LibraryFolderGroup) -> (Vec<String>, u32) {
        let page = self
            .library
            .folder_group_series(group.id.clone(), LibraryListing::default(), None)
            .await
            .unwrap();
        let count = self
            .library
            .folder_group_series_count(group.id.clone(), LibraryListing::default().filter)
            .await
            .unwrap();
        let titles = page.series.into_iter().map(|series| series.title).collect();
        (titles, count)
    }
}

fn named(groups: &[LibraryFolderGroup]) -> Vec<(String, Vec<String>, u32)> {
    groups
        .iter()
        .map(|group| {
            (
                group.folder_name.clone(),
                group.path.clone(),
                group.series_count,
            )
        })
        .collect()
}

fn titles(titles: &[&str]) -> Vec<String> {
    titles.iter().map(|title| (*title).to_owned()).collect()
}

#[tokio::test]
async fn lists_the_linked_folder_s_own_group_first_then_each_folder_that_groups_series() {
    let shelf = Shelf::scanned("folder-groups").await;

    let groups = shelf.groups().await;

    assert_eq!(
        named(&groups),
        [
            ("Comics".to_owned(), Vec::new(), 2),
            ("Comics".to_owned(), titles(&["Author B"]), 2),
            ("Comics".to_owned(), titles(&["Publisher", "Author C"]), 2),
        ]
    );
}

#[tokio::test]
async fn lists_a_series_joined_across_folders_in_each_group_holding_one_of_them() {
    let shelf = Shelf::scanned("folder-group-series").await;
    let groups = shelf.groups().await;

    let mut listed = Vec::new();
    for group in &groups {
        listed.push(shelf.series_in(group).await);
    }

    assert_eq!(
        listed,
        [
            (titles(&["Sample Series 04", "Sample Series 07"]), 2),
            (titles(&["Sample Series 02", "Sample Series 09"]), 2),
            (titles(&["Sample Series 05", "Sample Series 09"]), 2),
        ]
    );
}
