#![expect(
    clippy::unwrap_used,
    reason = "each test moves its own generated folder in a scratch library, so a failed set-up should stop the test"
)]

#[expect(dead_code, reason = "these tests write whole books, never loose pages")]
mod books;
#[expect(
    dead_code,
    reason = "these tests read the library through the engine, never its database"
)]
mod scanned;
mod support;

use std::{
    fs,
    path::{Path, PathBuf},
};

use books::write_book;
use omnileaf_engine::{
    BookFileState, FolderId, FolderProblem, LibraryListing, NetworkShare, RescanOutcome,
    SeriesBookListing, SeriesConnection, SeriesId, ShareAddress, ShareLookup, ShareSignIn,
    UnreachableShare,
};
use scanned::Scanned;
use support::ScratchFolder;

const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";

struct NoShares;

impl ShareLookup for NoShares {
    fn unreachable_share(
        &self,
        _folder: &Path,
    ) -> impl Future<Output = Option<UnreachableShare>> + Send {
        std::future::ready(None)
    }
}

struct MountedShares;

impl ShareLookup for MountedShares {
    fn unreachable_share(
        &self,
        _folder: &Path,
    ) -> impl Future<Output = Option<UnreachableShare>> + Send {
        std::future::ready(Some(UnreachableShare {
            share: nas_manga(),
            sign_in: ShareSignIn::MountedBySystem,
        }))
    }
}

fn nas_manga() -> NetworkShare {
    NetworkShare {
        server: "nas".to_owned(),
        name: "nas/manga".to_owned(),
    }
}

struct Shelf {
    scanned: Scanned,
    shelf: ScratchFolder,
}

impl Shelf {
    async fn new(name: &str) -> Self {
        let shelf = ScratchFolder::new(name);
        let comics = shelf.path().join("Comics");
        write_book(&comics.join(SERIES_01).join("v01.cbz"), 1);
        write_book(&comics.join(SERIES_02).join("v01.cbz"), 2);
        let (scanned, _, _) = Scanned::folder(name, &comics).await;
        Self { scanned, shelf }
    }

    async fn move_away(&self) -> PathBuf {
        let moved = self.shelf.path().join("Comics, moved");
        fs::rename(self.shelf.path().join("Comics"), &moved).unwrap();
        let rescan = self
            .scanned
            .library
            .rescan_folder(self.scanned.id, |_| {})
            .await
            .unwrap();
        assert_eq!(rescan.outcome, RescanOutcome::Unreachable);
        moved
    }

    async fn titles(&self) -> Vec<String> {
        let page = self
            .scanned
            .library
            .series(LibraryListing::default(), None)
            .await
            .unwrap();
        let mut titles: Vec<String> = page.series.into_iter().map(|series| series.title).collect();
        titles.sort();
        titles
    }
}

impl Shelf {
    async fn series_id(&self, title: &str) -> SeriesId {
        let page = self
            .scanned
            .library
            .series(LibraryListing::default(), None)
            .await
            .unwrap();
        page.series
            .into_iter()
            .find(|series| series.title == title)
            .unwrap()
            .id
    }

    async fn missing_folders_of_series_and_book(
        &self,
        series: SeriesId,
        shares: &impl ShareLookup,
    ) -> [Option<(FolderId, FolderProblem)>; 2] {
        let library = &self.scanned.library;
        let books = library
            .series_books(series, SeriesBookListing::default(), None)
            .await
            .unwrap();
        let of_series = library
            .missing_folder_of_series(series, shares)
            .await
            .unwrap();
        let of_book = library
            .missing_folder_of_book(books.books.first().unwrap().id, shares)
            .await
            .unwrap();
        [of_series, of_book].map(|missing| missing.map(|found| (found.folder.id, found.problem)))
    }

    async fn series_connection(&self, title: &str) -> (SeriesConnection, Vec<BookFileState>) {
        let library = &self.scanned.library;
        let series = self.series_id(title).await;
        let overview = library.series_overview(series).await.unwrap();
        let books = library
            .series_books(series, SeriesBookListing::default(), None)
            .await
            .unwrap();
        (
            overview.connection,
            books.books.iter().map(|book| book.file).collect(),
        )
    }

    async fn connections(&self) -> Vec<(String, bool)> {
        let page = self
            .scanned
            .library
            .series(LibraryListing::default(), None)
            .await
            .unwrap();
        let mut listed: Vec<(String, bool)> = page
            .series
            .into_iter()
            .map(|series| (series.title, series.is_connected))
            .collect();
        listed.sort();
        listed
    }
}

#[tokio::test]
async fn lists_a_folder_gone_missing_with_the_series_it_hides() {
    let shelf = Shelf::new("missing-listed").await;

    shelf.move_away().await;

    let library = &shelf.scanned.library;
    let missing = library.missing_folders(&NoShares).await.unwrap();
    assert_eq!(
        missing
            .iter()
            .map(|folder| (
                folder.folder.id,
                folder.problem.clone(),
                folder.hidden_series,
                folder.is_shown_anyway
            ))
            .collect::<Vec<_>>(),
        [(shelf.scanned.id, FolderProblem::Missing, 2, false)]
    );
    assert_eq!(
        (
            shelf.titles().await,
            library.hidden_series_count().await.unwrap()
        ),
        (Vec::<String>::new(), 2)
    );
}

#[tokio::test]
async fn lists_a_folder_on_an_unreachable_share_with_that_share() {
    let shelf = Shelf::new("missing-share").await;

    shelf.move_away().await;

    let missing = shelf
        .scanned
        .library
        .missing_folders(&MountedShares)
        .await
        .unwrap();
    assert_eq!(
        missing
            .into_iter()
            .map(|folder| folder.problem)
            .collect::<Vec<_>>(),
        [FolderProblem::NeedsMounting { share: nas_manga() }]
    );
}

#[tokio::test]
async fn finds_the_unreachable_share_of_a_folder_to_sign_in_to() {
    let shelf = Shelf::new("missing-share-sign-in").await;
    shelf.move_away().await;

    let share = shelf
        .scanned
        .library
        .unreachable_share(shelf.scanned.id, &MountedShares)
        .await
        .unwrap();

    assert_eq!(
        share,
        Some(UnreachableShare {
            share: nas_manga(),
            sign_in: ShareSignIn::MountedBySystem,
        })
    );
}

fn on_a_samba_share(folder: &Path) -> String {
    format!(
        "//kai@nas.test/manga on {} (smbfs, nodev, nosuid, mounted by kai)\n",
        folder.display()
    )
}

#[tokio::test]
async fn signs_in_to_the_share_a_folder_was_on_once_it_goes_missing() {
    let shelf = Shelf::new("missing-remembered-share").await;
    let library = &shelf.scanned.library;
    library
        .remember_shares_in(on_a_samba_share(&shelf.shelf.path().join("Comics")))
        .await
        .unwrap();

    shelf.move_away().await;

    let missing = library.missing_folders(&NoShares).await.unwrap();
    let share = library
        .unreachable_share(shelf.scanned.id, &NoShares)
        .await
        .unwrap();
    assert_eq!(
        (
            missing
                .into_iter()
                .map(|folder| folder.problem)
                .collect::<Vec<_>>(),
            share.map(|share| share.sign_in)
        ),
        (
            vec![FolderProblem::NeedsSignIn {
                share: NetworkShare {
                    server: "nas.test".to_owned(),
                    name: "nas.test/manga".to_owned(),
                }
            }],
            Some(ShareSignIn::System(ShareAddress::new(
                "smb://kai@nas.test/manga".to_owned()
            )))
        )
    );
}

#[tokio::test]
async fn forgets_the_share_of_a_folder_no_longer_mounted_from_one() {
    let shelf = Shelf::new("missing-forgotten-share").await;
    let library = &shelf.scanned.library;
    library
        .remember_shares_in(on_a_samba_share(&shelf.shelf.path().join("Comics")))
        .await
        .unwrap();
    library.remember_shares_in(String::new()).await.unwrap();

    shelf.move_away().await;

    let missing = library.missing_folders(&NoShares).await.unwrap();
    assert_eq!(
        missing
            .into_iter()
            .map(|folder| folder.problem)
            .collect::<Vec<_>>(),
        [FolderProblem::Missing]
    );
}

#[tokio::test]
async fn keeps_the_share_of_a_folder_out_of_reach_while_remembering() {
    let shelf = Shelf::new("missing-kept-share").await;
    let library = &shelf.scanned.library;
    library
        .remember_shares_in(on_a_samba_share(&shelf.shelf.path().join("Comics")))
        .await
        .unwrap();
    shelf.move_away().await;

    library.remember_shares_in(String::new()).await.unwrap();

    let share = library
        .unreachable_share(shelf.scanned.id, &NoShares)
        .await
        .unwrap();
    assert!(share.is_some());
}

#[tokio::test]
async fn shows_the_series_of_a_missing_folder_once_asked() {
    let shelf = Shelf::new("missing-shown").await;
    shelf.move_away().await;

    shelf
        .scanned
        .library
        .show_missing_folder(shelf.scanned.id, true)
        .await
        .unwrap();

    let missing = shelf
        .scanned
        .library
        .missing_folders(&NoShares)
        .await
        .unwrap();
    assert_eq!(
        (
            shelf.titles().await,
            missing
                .iter()
                .map(|folder| folder.is_shown_anyway)
                .collect::<Vec<_>>()
        ),
        (vec![SERIES_01.to_owned(), SERIES_02.to_owned()], vec![true])
    );
}

#[tokio::test]
async fn finds_a_moved_folder_where_it_went() {
    let shelf = Shelf::new("missing-found").await;
    let moved = shelf.move_away().await;

    let rescan = shelf
        .scanned
        .library
        .relocate_folder(shelf.scanned.id, moved, |_| {})
        .await
        .unwrap();

    assert_eq!(
        (
            matches!(rescan.outcome, RescanOutcome::Rescanned(_)),
            shelf
                .scanned
                .library
                .missing_folders(&NoShares)
                .await
                .unwrap()
                .len(),
            shelf.titles().await
        ),
        (true, 0, vec![SERIES_01.to_owned(), SERIES_02.to_owned()])
    );
}

#[tokio::test]
async fn lists_the_series_of_a_missing_folder_shown_anyway_as_not_connected() {
    let shelf = Shelf::new("missing-not-connected").await;
    shelf.move_away().await;

    shelf
        .scanned
        .library
        .show_missing_folder(shelf.scanned.id, true)
        .await
        .unwrap();

    assert_eq!(
        shelf.connections().await,
        [(SERIES_01.to_owned(), false), (SERIES_02.to_owned(), false)]
    );
}

#[tokio::test]
async fn lists_them_as_connected_when_the_folder_is_found_where_it_moved() {
    let shelf = Shelf::new("missing-reconnected").await;
    let moved = shelf.move_away().await;
    shelf
        .scanned
        .library
        .show_missing_folder(shelf.scanned.id, true)
        .await
        .unwrap();

    shelf
        .scanned
        .library
        .relocate_folder(shelf.scanned.id, moved, |_| {})
        .await
        .unwrap();

    assert_eq!(
        shelf.connections().await,
        [(SERIES_01.to_owned(), true), (SERIES_02.to_owned(), true)]
    );
}

#[tokio::test]
async fn lists_a_series_of_a_hidden_missing_folder_nowhere() {
    let shelf = Shelf::new("missing-hidden-again").await;
    shelf.move_away().await;
    shelf
        .scanned
        .library
        .show_missing_folder(shelf.scanned.id, true)
        .await
        .unwrap();

    shelf
        .scanned
        .library
        .show_missing_folder(shelf.scanned.id, false)
        .await
        .unwrap();

    assert_eq!(shelf.connections().await, Vec::<(String, bool)>::new());
}

#[tokio::test]
async fn shows_a_series_and_its_books_as_connected_while_their_folder_is_there() {
    let shelf = Shelf::new("missing-overview-connected").await;

    assert_eq!(
        shelf.series_connection(SERIES_01).await,
        (SeriesConnection::Connected, vec![BookFileState::Present])
    );
}

#[tokio::test]
async fn shows_a_series_of_a_missing_folder_and_its_books_as_not_connected() {
    let shelf = Shelf::new("missing-overview-not-connected").await;
    shelf.move_away().await;

    shelf
        .scanned
        .library
        .show_missing_folder(shelf.scanned.id, true)
        .await
        .unwrap();

    assert_eq!(
        shelf.series_connection(SERIES_01).await,
        (
            SeriesConnection::NotConnected,
            vec![BookFileState::NotConnected]
        )
    );
}

#[tokio::test]
async fn finds_no_missing_folder_for_a_series_or_its_book_while_their_folder_is_there() {
    let shelf = Shelf::new("missing-folder-of-connected").await;
    let series = shelf.series_id(SERIES_01).await;

    let missing = shelf
        .missing_folders_of_series_and_book(series, &MountedShares)
        .await;

    assert_eq!(missing, [None, None]);
}

#[tokio::test]
async fn finds_the_missing_folder_of_a_series_and_its_book_with_the_share_it_is_on() {
    let shelf = Shelf::new("missing-folder-of-not-connected").await;
    let series = shelf.series_id(SERIES_01).await;
    shelf.move_away().await;

    let missing = shelf
        .missing_folders_of_series_and_book(series, &MountedShares)
        .await;

    let found = Some((
        shelf.scanned.id,
        FolderProblem::NeedsMounting { share: nas_manga() },
    ));
    assert_eq!(missing, [found.clone(), found]);
}
