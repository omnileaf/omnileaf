#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::path::{Path, PathBuf};

use omnileaf_db::{
    Database, Error,
    catalog::{
        Cursor, LibraryRoot, NewRoot, Page, PageRequest, PageSize, RootId, RootKind, RootLocator,
        add_root, library_roots,
    },
};
use support::ScratchFolder;

const ADDED_AT_MS: i64 = 1_790_000_000_000;
const HOME: &str = "/data/Omnileaf";
const COMICS: &str = "/media/Comics";
const MANGA: &str = "/media/Manga";

struct Library {
    database: Database,
    _folder: ScratchFolder,
}

impl Library {
    fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        Self {
            database: Database::open(&folder.config()).unwrap(),
            _folder: folder,
        }
    }

    async fn add(&self, kind: RootKind, path: impl AsRef<Path>) -> RootId {
        let root = NewRoot {
            kind,
            locator: RootLocator::Path(path.as_ref().to_path_buf()),
            added_at_ms: ADDED_AT_MS,
        };
        self.database
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap()
    }

    async fn page(&self, request: PageRequest) -> Page<LibraryRoot> {
        self.database
            .read(move |connection| library_roots(connection, &request))
            .await
            .unwrap()
    }

    async fn locations(&self) -> Vec<(RootKind, PathBuf)> {
        let request = first_page(PageSize::MAX);
        self.page(request)
            .await
            .items
            .into_iter()
            .map(|root| match root.locator {
                RootLocator::Path(path) => (root.kind, path),
            })
            .collect()
    }
}

fn first_page(size: u16) -> PageRequest {
    PageRequest {
        after: None,
        size: PageSize::try_from(size).unwrap(),
    }
}

#[tokio::test]
async fn lists_the_roots_in_the_order_they_were_added() {
    let library = Library::open("roots-in-order");
    library.add(RootKind::Home, HOME).await;
    library.add(RootKind::Linked, MANGA).await;

    library.add(RootKind::Linked, COMICS).await;

    assert_eq!(
        library.locations().await,
        [
            (RootKind::Home, PathBuf::from(HOME)),
            (RootKind::Linked, PathBuf::from(MANGA)),
            (RootKind::Linked, PathBuf::from(COMICS)),
        ]
    );
}

#[cfg(unix)]
#[tokio::test]
async fn lists_a_folder_whose_name_is_not_unicode_as_it_was_added() {
    use std::{ffi::OsStr, os::unix::ffi::OsStrExt};
    let library = Library::open("root-not-unicode");
    let path = PathBuf::from(OsStr::from_bytes(b"/media/Sample \xff Library"));

    library.add(RootKind::Linked, &path).await;

    assert_eq!(library.locations().await, [(RootKind::Linked, path)]);
}

#[tokio::test]
async fn keeps_one_root_for_a_folder_added_twice() {
    let library = Library::open("root-added-twice");
    let first = library.add(RootKind::Linked, COMICS).await;

    let second = library.add(RootKind::Linked, COMICS).await;

    assert_eq!(second, first);
    assert_eq!(
        library.locations().await,
        [(RootKind::Linked, PathBuf::from(COMICS))]
    );
}

#[tokio::test]
async fn continues_the_list_after_the_cursor_of_the_last_page() {
    let library = Library::open("root-pages");
    library.add(RootKind::Home, HOME).await;
    library.add(RootKind::Linked, MANGA).await;
    let last = library.add(RootKind::Linked, COMICS).await;
    let first = library.page(first_page(2)).await;

    let second = library
        .page(PageRequest {
            after: first.next.clone(),
            size: PageSize::try_from(2).unwrap(),
        })
        .await;

    assert_eq!(first.items.len(), 2);
    assert_eq!(
        second.items.iter().map(|root| root.id).collect::<Vec<_>>(),
        [last]
    );
    assert_eq!(second.next, None);
}

#[tokio::test]
async fn refuses_a_cursor_another_list_gave_out() {
    let library = Library::open("root-pages-other-cursor");
    let title_cursor: Cursor = "010000000000000000".parse().unwrap();
    let request = PageRequest {
        after: Some(title_cursor),
        size: PageSize::try_from(1).unwrap(),
    };

    let outcome = library
        .database
        .read(move |connection| library_roots(connection, &request))
        .await;

    assert!(matches!(outcome, Err(Error::CursorForAnotherList)));
}
