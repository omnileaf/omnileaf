#![expect(
    clippy::unwrap_used,
    reason = "the books are generated in a scratch folder, so a failed set-up should stop the test"
)]

mod support;

use std::{
    ffi::OsString,
    fs::File,
    io,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};

use omnileaf_formats::{
    Book, Details, Entry, EntryKind, FormatError, Limits, LocalStorage, Storage, open_book_in,
    recognise_book_in,
};
use omnileaf_testkit::{Compression, PageShape, cbz, page_png};
use support::{ScratchFolder, entry};

const SEED: u64 = 11;
const START_LENGTH: u64 = 64;
const COMIC_INFO: &str = "ComicInfo.xml";
const HUGE_COMIC_INFO_BYTES: u64 = 4 << 30;

fn page(index: u32) -> Vec<u8> {
    page_png(SEED, index, PageShape::Portrait).unwrap()
}

fn names_of(book: &Book) -> Vec<String> {
    book.pages().iter().map(|page| page.name.clone()).collect()
}

#[derive(Debug, Default)]
struct CountingStorage {
    root: PathBuf,
    listings: AtomicUsize,
    lookups: AtomicUsize,
    opens: AtomicUsize,
}

#[derive(Debug, PartialEq, Eq)]
struct Calls {
    listings: usize,
    lookups: usize,
    opens: usize,
}

impl CountingStorage {
    fn serving(root: &Path) -> Arc<Self> {
        Arc::new(Self {
            root: root.to_owned(),
            ..Self::default()
        })
    }

    fn calls(&self) -> Calls {
        Calls {
            listings: self.listings.load(Ordering::Relaxed),
            lookups: self.lookups.load(Ordering::Relaxed),
            opens: self.opens.load(Ordering::Relaxed),
        }
    }
}

impl Storage for CountingStorage {
    fn entries(&self, folder: &Path) -> io::Result<Vec<Entry>> {
        self.listings.fetch_add(1, Ordering::Relaxed);
        LocalStorage.entries(&self.root.join(folder))
    }

    fn details(&self, path: &Path) -> io::Result<Details> {
        self.lookups.fetch_add(1, Ordering::Relaxed);
        LocalStorage.details(&self.root.join(path))
    }

    fn open(&self, file: &Path) -> io::Result<File> {
        self.opens.fetch_add(1, Ordering::Relaxed);
        LocalStorage.open(&self.root.join(file))
    }
}

#[derive(Debug)]
struct ListingAHugeComicInfo {
    root: PathBuf,
    opened: Mutex<Vec<PathBuf>>,
}

impl Storage for ListingAHugeComicInfo {
    fn entries(&self, folder: &Path) -> io::Result<Vec<Entry>> {
        let mut entries = LocalStorage.entries(&self.root.join(folder))?;
        for entry in &mut entries {
            if entry.name == COMIC_INFO {
                entry.kind = EntryKind::File {
                    size: HUGE_COMIC_INFO_BYTES,
                };
            }
        }
        Ok(entries)
    }

    fn details(&self, path: &Path) -> io::Result<Details> {
        LocalStorage.details(&self.root.join(path))
    }

    fn open(&self, file: &Path) -> io::Result<File> {
        self.opened.lock().unwrap().push(file.to_owned());
        LocalStorage.open(&self.root.join(file))
    }
}

#[derive(Debug)]
struct FolderWithAnUnreadableEntry;

impl Storage for FolderWithAnUnreadableEntry {
    fn entries(&self, _folder: &Path) -> io::Result<Vec<Entry>> {
        Ok(vec![
            Entry {
                name: OsString::from("1.png"),
                kind: EntryKind::File { size: 4 },
            },
            Entry {
                name: OsString::from("2.png"),
                kind: EntryKind::Unreadable(io::ErrorKind::PermissionDenied),
            },
        ])
    }

    fn details(&self, path: &Path) -> io::Result<Details> {
        Ok(if path.extension().is_some() {
            Details::File {
                size: 4,
                modified: None,
            }
        } else {
            Details::Folder { modified: None }
        })
    }

    fn open(&self, _file: &Path) -> io::Result<File> {
        Err(io::ErrorKind::NotFound.into())
    }
}

#[test]
fn opens_an_archive_through_a_storage_with_one_open() {
    let scratch = ScratchFolder::new("storage-archive");
    let entries = [entry("2.png", page(1)), entry("1.png", page(0))];
    scratch.write("book.cbz", &cbz(&entries, Compression::Deflated).unwrap());
    let storage = CountingStorage::serving(scratch.path());

    let book = open_book_in(storage.clone(), Path::new("book.cbz"), &Limits::default()).unwrap();

    assert_eq!(names_of(&book), ["1.png", "2.png"]);
    assert_eq!(storage.calls().opens, 1);
}

#[test]
fn recognises_an_archive_with_one_lookup_and_one_open_and_opens_it_with_no_more() {
    let scratch = ScratchFolder::new("storage-found-archive");
    let entries = [entry("2.png", page(1)), entry("1.png", page(0))];
    scratch.write("book.cbz", &cbz(&entries, Compression::Deflated).unwrap());
    let storage = CountingStorage::serving(scratch.path());
    let shared: Arc<dyn Storage> = storage.clone();

    let recognised = recognise_book_in(&shared, Path::new("book.cbz")).unwrap();
    let after_recognising = storage.calls();
    let is_archive = recognised.is_archive();
    let book = recognised.open(&Limits::default()).unwrap();

    assert!(is_archive);
    assert_eq!(
        after_recognising,
        Calls {
            listings: 0,
            lookups: 1,
            opens: 1,
        }
    );
    assert_eq!(storage.calls(), after_recognising);
    assert_eq!(names_of(&book), ["1.png", "2.png"]);
}

#[test]
fn recognises_a_folder_of_images_without_opening_a_file() {
    let scratch = ScratchFolder::new("storage-found-folder");
    scratch.write("Chapter/1.png", &page(0));
    let storage = CountingStorage::serving(scratch.path());
    let shared: Arc<dyn Storage> = storage.clone();

    let recognised = recognise_book_in(&shared, Path::new("Chapter")).unwrap();

    assert!(matches!(recognised.details(), Details::Folder { .. }));
    assert!(!recognised.is_archive());
    assert_eq!(recognised.path(), Path::new("Chapter"));
    assert_eq!(storage.calls().opens, 0);
}

#[test]
fn opens_a_recognised_book_as_opening_it_in_one_step_does() {
    let scratch = ScratchFolder::new("storage-found-like-opened");
    let entries = [entry("2.png", page(1)), entry("1.png", page(0))];
    scratch.write("book.cbz", &cbz(&entries, Compression::Deflated).unwrap());
    scratch.write("Chapter/2.png", &page(1));
    scratch.write("Chapter/1.png", &page(0));
    let storage: Arc<dyn Storage> = CountingStorage::serving(scratch.path());

    for path in [Path::new("book.cbz"), Path::new("Chapter")] {
        let recognised = recognise_book_in(&storage, path).unwrap();
        let details = recognised.details();
        let mut found_book = recognised.open(&Limits::default()).unwrap();
        let mut opened = open_book_in(Arc::clone(&storage), path, &Limits::default()).unwrap();

        assert_eq!(details, storage.details(path).unwrap());
        assert_eq!(found_book.pages(), opened.pages());
        assert_eq!(
            found_book.fingerprint().unwrap(),
            opened.fingerprint().unwrap()
        );
    }
}

#[test]
fn reads_the_pages_of_a_folder_of_images_through_a_storage() {
    let scratch = ScratchFolder::new("storage-folder");
    scratch.write("Chapter/2.png", &page(1));
    scratch.write("Chapter/1.png", &page(0));
    let storage = CountingStorage::serving(scratch.path());

    let mut book = open_book_in(storage, Path::new("Chapter"), &Limits::default()).unwrap();

    assert_eq!(names_of(&book), ["1.png", "2.png"]);
    assert_eq!(book.read_page(1).unwrap(), page(1));
}

#[test]
fn reads_only_the_start_of_a_folder_s_page_through_a_storage() {
    let scratch = ScratchFolder::new("storage-folder-start");
    scratch.write("Chapter/1.png", &page(0));
    let storage = CountingStorage::serving(scratch.path());
    let mut book = open_book_in(storage, Path::new("Chapter"), &Limits::default()).unwrap();

    let start = book.read_page_start(0, START_LENGTH).unwrap();

    assert_eq!(start, page(0)[..usize::try_from(START_LENGTH).unwrap()]);
}

#[test]
fn reads_a_folder_book_from_one_listing() {
    let scratch = ScratchFolder::new("storage-one-listing");
    scratch.write("Chapter/1.png", &page(0));
    scratch.write("Chapter/2.png", &page(1));
    scratch.write("Chapter/ComicInfo.xml", b"<ComicInfo/>");
    let storage = CountingStorage::serving(scratch.path());

    let mut book = open_book_in(storage.clone(), Path::new("Chapter"), &Limits::default()).unwrap();
    book.comic_info().unwrap();
    book.fingerprint().unwrap();

    assert_eq!(
        storage.calls(),
        Calls {
            listings: 1,
            lookups: 1,
            opens: 3,
        }
    );
}

#[test]
fn refuses_a_folder_s_comic_info_listed_over_the_limit_without_opening_it() {
    let scratch = ScratchFolder::new("storage-huge-comic-info");
    scratch.write("Chapter/1.png", &page(0));
    scratch.write(&format!("Chapter/{COMIC_INFO}"), b"<ComicInfo/>");
    let storage = Arc::new(ListingAHugeComicInfo {
        root: scratch.path().to_owned(),
        opened: Mutex::new(Vec::new()),
    });
    let mut book = open_book_in(storage.clone(), Path::new("Chapter"), &Limits::default()).unwrap();

    let read = book.comic_info();

    assert!(
        matches!(read, Err(FormatError::ComicInfoTooLarge { .. })),
        "{read:?}"
    );
    assert!(
        !storage
            .opened
            .lock()
            .unwrap()
            .iter()
            .any(|file| file.ends_with(COMIC_INFO))
    );
}

#[test]
fn refuses_a_folder_holding_an_entry_it_cannot_read() {
    let storage = Arc::new(FolderWithAnUnreadableEntry);

    let error = open_book_in(storage, Path::new("Chapter"), &Limits::default()).unwrap_err();

    assert!(
        matches!(&error, FormatError::Read { source, .. } if source.kind() == io::ErrorKind::PermissionDenied),
        "{error:?}"
    );
}
