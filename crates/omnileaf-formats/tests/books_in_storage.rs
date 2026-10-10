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
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use omnileaf_formats::{
    Book, Details, Entry, EntryKind, FormatError, Limits, LocalStorage, Storage, open_book_in,
};
use omnileaf_testkit::{Compression, PageShape, cbz, page_png};
use support::{ScratchFolder, entry};

const SEED: u64 = 11;

fn page(index: u32) -> Vec<u8> {
    page_png(SEED, index, PageShape::Portrait).unwrap()
}

fn names_of(book: &Book) -> Vec<String> {
    book.pages().iter().map(|page| page.name.clone()).collect()
}

/// Serves a real folder under paths relative to it, counting each kind of call.
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

/// A folder holding one page and one entry its storage can't read.
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
fn refuses_a_folder_holding_an_entry_it_cannot_read() {
    let storage = Arc::new(FolderWithAnUnreadableEntry);

    let error = open_book_in(storage, Path::new("Chapter"), &Limits::default()).unwrap_err();

    assert!(
        matches!(&error, FormatError::Read { source, .. } if source.kind() == io::ErrorKind::PermissionDenied),
        "{error:?}"
    );
}
