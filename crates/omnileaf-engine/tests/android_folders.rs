#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

mod support;

use std::{
    fmt,
    fs::File,
    io,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

use omnileaf_engine::{
    AndroidTree, FileChanges, FolderKind, Library, LibraryError, LibraryFolder, OpenTree,
    RescanOutcome, Resource, ResourceRouter, RootLocator, Storage, TreeUri,
};
use omnileaf_formats::{Details, Entry, LocalStorage};
use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, write_sample_library};
use support::{FixedClock, ScratchFolder};

const COMICS_TREE: &str = "content://documents.test/tree/primary%3ADocuments%2FComics";
const INTERNAL_DOCUMENTS: &str = "Internal storage › Documents";
const SAMPLE_BOOKS: u32 = 7;
const ARCHIVE_BOOKS: usize = 5;
const IMAGE_FOLDER_BOOKS: usize = 2;
const IMAGES_OPENED_PER_IMAGE_FOLDER: usize = 2;

/// Serves a scratch folder's sample library as the tree named after it, counting every file it opens.
struct TreeOfFolder {
    scratch: ScratchFolder,
    opened: Mutex<Vec<PathBuf>>,
    is_lost: AtomicBool,
}

impl TreeOfFolder {
    fn new(name: &str) -> Arc<Self> {
        let scratch = ScratchFolder::new(name);
        write_sample_library(scratch.path()).unwrap();
        Arc::new(Self {
            scratch,
            opened: Mutex::new(Vec::new()),
            is_lost: AtomicBool::new(false),
        })
    }

    fn on_device(&self, path: &Path) -> io::Result<PathBuf> {
        if self.is_lost.load(Ordering::SeqCst) {
            return Err(io::ErrorKind::PermissionDenied.into());
        }
        let inside = path
            .strip_prefix(SAMPLE_LIBRARY_NAME)
            .map_err(|_| io::Error::from(io::ErrorKind::NotFound))?;
        Ok(self.scratch.path().join(SAMPLE_LIBRARY_NAME).join(inside))
    }

    fn take_opened(&self) -> Vec<PathBuf> {
        std::mem::take(&mut self.opened.lock().unwrap())
    }

    fn opener(self: &Arc<Self>) -> OpenTree {
        let tree = Arc::clone(self);
        Arc::new(move |_| Arc::clone(&tree) as Arc<dyn Storage>)
    }
}

impl fmt::Debug for TreeOfFolder {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("TreeOfFolder")
            .finish_non_exhaustive()
    }
}

impl Storage for TreeOfFolder {
    fn entries(&self, folder: &Path) -> io::Result<Vec<Entry>> {
        LocalStorage.entries(&self.on_device(folder)?)
    }

    fn details(&self, path: &Path) -> io::Result<Details> {
        LocalStorage.details(&self.on_device(path)?)
    }

    fn open(&self, file: &Path) -> io::Result<File> {
        self.opened.lock().unwrap().push(file.to_path_buf());
        LocalStorage.open(&self.on_device(file)?)
    }
}

fn sample_tree() -> RootLocator {
    RootLocator::AndroidTree(
        AndroidTree::new(
            TreeUri::parse(COMICS_TREE.to_owned()).unwrap(),
            SAMPLE_LIBRARY_NAME.to_owned(),
            INTERNAL_DOCUMENTS.to_owned(),
        )
        .unwrap(),
    )
}

async fn open(home: &Path) -> Library {
    Library::open(home.to_path_buf(), FixedClock).await.unwrap()
}

async fn open_reading(home: &Path, tree: &Arc<TreeOfFolder>) -> Library {
    open(home).await.reading_trees_with(tree.opener())
}

async fn linked_folder(library: &Library) -> LibraryFolder {
    let page = library.folders(None).await.unwrap();
    page.folders
        .into_iter()
        .find(|folder| folder.kind == FolderKind::Linked)
        .unwrap()
}

async fn rescan_linked(library: &Library) -> RescanOutcome {
    let folder = linked_folder(library).await;
    library
        .rescan_folder(folder.id, |_| {})
        .await
        .unwrap()
        .outcome
}

#[tokio::test]
async fn refuses_to_add_an_android_folder_it_has_no_way_to_open() {
    let home = ScratchFolder::new("tree-unopenable-home");
    let library = open(home.path()).await;

    let outcome = library.add_folder(sample_tree(), |_| {}).await;

    assert!(matches!(
        outcome,
        Err(LibraryError::FolderUnreadable { .. })
    ));
    let page = library.folders(None).await.unwrap();
    assert_eq!(page.folders.len(), 1);
}

#[tokio::test]
async fn adds_an_android_folder_and_files_its_books_under_the_folder_s_name() {
    let home = ScratchFolder::new("tree-add-home");
    let tree = TreeOfFolder::new("tree-add-comics");
    let library = open_reading(home.path(), &tree).await;

    let scan = library.add_folder(sample_tree(), |_| {}).await.unwrap();

    assert_eq!(
        (scan.name.as_str(), scan.series, scan.books),
        (SAMPLE_LIBRARY_NAME, 3, SAMPLE_BOOKS)
    );
    let folder = linked_folder(&library).await;
    assert_eq!(
        folder.location,
        format!("{INTERNAL_DOCUMENTS} › {SAMPLE_LIBRARY_NAME}")
    );
}

#[tokio::test]
async fn opens_no_file_twice_when_scanning_an_android_folder() {
    let home = ScratchFolder::new("tree-opens-home");
    let tree = TreeOfFolder::new("tree-opens-comics");
    let library = open_reading(home.path(), &tree).await;

    library.add_folder(sample_tree(), |_| {}).await.unwrap();

    let mut opened = tree.take_opened();
    let opens = opened.len();
    opened.sort();
    opened.dedup();
    assert_eq!(
        (opens, opened.len()),
        (
            ARCHIVE_BOOKS + IMAGE_FOLDER_BOOKS * IMAGES_OPENED_PER_IMAGE_FOLDER,
            opens
        )
    );
}

#[tokio::test]
async fn rescans_an_unchanged_android_folder_without_opening_a_file() {
    let home = ScratchFolder::new("tree-unchanged-home");
    let tree = TreeOfFolder::new("tree-unchanged-comics");
    let library = open_reading(home.path(), &tree).await;
    library.add_folder(sample_tree(), |_| {}).await.unwrap();
    tree.take_opened();

    let outcome = rescan_linked(&library).await;

    assert_eq!(outcome, RescanOutcome::Rescanned(FileChanges::default()));
    assert_eq!(tree.take_opened(), Vec::<PathBuf>::new());
}

#[tokio::test]
async fn keeps_the_books_of_an_android_folder_it_lost_access_to() {
    let home = ScratchFolder::new("tree-lost-home");
    let tree = TreeOfFolder::new("tree-lost-comics");
    let library = open_reading(home.path(), &tree).await;
    library.add_folder(sample_tree(), |_| {}).await.unwrap();
    tree.is_lost.store(true, Ordering::SeqCst);

    let outcome = rescan_linked(&library).await;

    assert_eq!(outcome, RescanOutcome::Unreachable);
    let folder = linked_folder(&library).await;
    assert!(!folder.is_available);
    assert_eq!(
        library.folder_book_count(folder.id).await.unwrap(),
        SAMPLE_BOOKS
    );
}

#[tokio::test]
async fn reports_an_android_folder_unreachable_when_nothing_can_open_it() {
    let home = ScratchFolder::new("tree-elsewhere-home");
    let tree = TreeOfFolder::new("tree-elsewhere-comics");
    let library = open_reading(home.path(), &tree).await;
    library.add_folder(sample_tree(), |_| {}).await.unwrap();
    drop(library);
    let reopened = open(home.path()).await;

    let outcome = rescan_linked(&reopened).await;

    assert_eq!(outcome, RescanOutcome::Unreachable);
    let folder = linked_folder(&reopened).await;
    assert!(!folder.is_available);
    assert_eq!(
        reopened.folder_book_count(folder.id).await.unwrap(),
        SAMPLE_BOOKS
    );
}

#[tokio::test]
async fn serves_the_cover_of_a_book_in_an_android_folder() {
    let home = ScratchFolder::new("tree-cover-home");
    let cache = ScratchFolder::new("tree-cover-cache");
    let tree = TreeOfFolder::new("tree-cover-comics");
    let library = open_reading(home.path(), &tree).await;
    library.add_folder(sample_tree(), |_| {}).await.unwrap();
    let router = ResourceRouter::open(cache.path()).unwrap();
    let series = library.series(None).await.unwrap();
    let cover = series.series.first().unwrap().cover.unwrap();
    tree.take_opened();

    let resource = router.respond(&library, &format!("/{cover}")).await;

    assert!(matches!(
        resource,
        Resource::Immutable {
            content_type: "image/jpeg",
            ..
        }
    ));
    assert_eq!(tree.take_opened().len(), 1);
}
