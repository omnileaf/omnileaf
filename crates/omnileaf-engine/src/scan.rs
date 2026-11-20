use std::{
    collections::BTreeSet,
    error::Error,
    io,
    path::{Path, PathBuf, StripPrefixError},
    sync::Arc,
};

use omnileaf_db::{
    catalog::{
        BookDetails, BookFile, NewSeries, RootId, RootKind, ScannedBook, SeriesFolder,
        record_scanned_books,
    },
    store::Store,
};
use omnileaf_formats::{
    Book, Details, FormatError, Limits, RecognisedBook, Storage, open_book_in, recognise_book_in,
};
use omnileaf_sync_proto::{Fingerprint, KeyError, SeriesId};
use serde::Serialize;
use specta::Type;
use tokio::{sync::watch, task::spawn_blocking};

use crate::{
    LibraryError,
    book_details::read_details,
    book_numbering::FileNumbers,
    clock::stored_ms,
    decode_permits::DecodePermits,
    file_type::{FileType, HiddenFileTypes},
    library_layout::{FoundBook, Layout, find_books, folder_name},
    library_removal::bring_back_marked,
    placement::{Placement, place_book},
    series_naming::series_named_in_files,
    skipped_types::{SkippedFile, SkippedType},
    unread_books::UnreadBooks,
};

pub(crate) const BOOKS_PER_BATCH: usize = 32;
/// One archive at a time, since a phone's OS ends an app holding too much memory while an archive's index and comic details are decoded.
const ARCHIVES_PARSED_AT_ONCE: usize = 1;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "stage", rename_all = "camelCase")]
pub enum ScanProgress {
    Adding { name: String, location: String },
    Finding { found: u32 },
    Reading { scanned: u32, total: u32 },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FolderScan {
    pub name: String,
    pub series: u32,
    pub books: u32,
    pub unreadable_books: u32,
    pub unsupported_books: u32,
    pub unreadable_folders: u32,
    #[specta(optional)]
    pub skipped_types: Vec<SkippedType>,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum UnreadableBook {
    #[error("open the book")]
    Format(#[from] FormatError),
    #[error("open the book, a file of a type the library hides")]
    HiddenType(#[source] FormatError),
    #[error("open the book, a {} file this build can't read", .skipped.file_type)]
    UnsupportedType {
        skipped: Box<SkippedFile>,
        #[source]
        source: FormatError,
    },
    #[error("read when the book last changed")]
    Metadata(#[from] io::Error),
    #[error("name the book's series")]
    SeriesName(#[from] KeyError),
    #[error("place the book inside the folder scanned")]
    OutsideFolder(#[from] StripPrefixError),
}

impl UnreadableBook {
    fn opening(location: &Path, hidden: &HiddenFileTypes, source: FormatError) -> Self {
        match FileType::of(location) {
            Some(file_type) if file_type.is_unsupported_given(&source) => {
                if hidden.hides(location) {
                    Self::HiddenType(source)
                } else {
                    Self::UnsupportedType {
                        skipped: Box::new(SkippedFile {
                            file_type,
                            location: location.to_path_buf(),
                        }),
                        source,
                    }
                }
            }
            Some(_) | None => Self::Format(source),
        }
    }

    pub(crate) fn is_hidden(&self) -> bool {
        matches!(self, Self::HiddenType(_))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct FileStamp {
    pub(crate) size_bytes: u64,
    pub(crate) modified_at_ms: i64,
}

#[derive(Clone)]
pub(crate) struct Target {
    pub(crate) root: RootId,
    pub(crate) kind: RootKind,
    pub(crate) storage: Arc<dyn Storage>,
    pub(crate) folder: PathBuf,
    pub(crate) hidden: HiddenFileTypes,
    pub(crate) added_at_ms: i64,
}

#[derive(Default)]
struct Tally {
    scanned: u32,
    books: u32,
    unread: UnreadBooks,
    series: BTreeSet<SeriesId>,
}

pub(crate) async fn find_books_in(
    storage: Arc<dyn Storage>,
    folder: PathBuf,
    on_progress: impl FnMut(ScanProgress) + Send,
) -> Result<Layout, LibraryError> {
    walk(storage, folder.clone(), on_progress)
        .await?
        .map_err(|source| LibraryError::FolderUnreadable {
            path: folder,
            source,
        })
}

pub(crate) async fn walk(
    storage: Arc<dyn Storage>,
    folder: PathBuf,
    mut on_progress: impl FnMut(ScanProgress) + Send,
) -> Result<io::Result<Layout>, LibraryError> {
    let (found, mut found_so_far) = watch::channel(0);
    let mut walking = spawn_blocking(move || {
        find_books(&*storage, &folder, |count| {
            found.send_replace(count);
        })
    });
    loop {
        tokio::select! {
            biased;
            Ok(()) = found_so_far.changed() => on_progress(ScanProgress::Finding {
                found: saturating_u32(*found_so_far.borrow_and_update()),
            }),
            walked = &mut walking => return Ok(walked?),
        }
    }
}

pub(crate) async fn scan(
    store: &Store,
    target: Target,
    layout: Layout,
    mut on_progress: impl FnMut(ScanProgress) + Send,
) -> Result<FolderScan, LibraryError> {
    let total = saturating_u32(layout.books.len());
    let mut tally = Tally::default();
    on_progress(ScanProgress::Reading { scanned: 0, total });
    let reader = BookReader::new(target.clone());
    for batch in layout.books.chunks(BOOKS_PER_BATCH) {
        let found = tally.count(reader.read(batch.to_vec()).await?);
        bring_back_marked(store, &found).await?;
        let filed_in = store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &found))
            .await?;
        tally.series.extend(filed_in);
        on_progress(ScanProgress::Reading {
            scanned: tally.scanned,
            total,
        });
    }
    Ok(FolderScan {
        name: folder_name(&target.folder),
        series: saturating_u32(tally.series.len()),
        books: tally.books,
        unreadable_books: tally.unread.unreadable,
        unsupported_books: tally.unread.unsupported,
        unreadable_folders: saturating_u32(layout.unreadable_folders.len()),
        skipped_types: tally.unread.skipped.into(),
    })
}

impl Tally {
    fn count(&mut self, read: Vec<Result<ScannedBook, UnreadableBook>>) -> Vec<ScannedBook> {
        let mut found = Vec::with_capacity(read.len());
        for book in read {
            self.scanned = self.scanned.saturating_add(1);
            match book {
                Ok(book) => {
                    self.books = self.books.saturating_add(1);
                    found.push(book);
                }
                Err(unread) => self.unread.count(&unread),
            }
        }
        found
    }
}

pub(crate) fn saturating_u32(items: usize) -> u32 {
    u32::try_from(items).unwrap_or(u32::MAX)
}

#[derive(Clone)]
pub(crate) struct BookReader {
    target: Target,
    decodes: Arc<DecodePermits>,
}

impl BookReader {
    pub(crate) fn new(target: Target) -> Self {
        Self::sharing(
            target,
            Arc::new(DecodePermits::new(ARCHIVES_PARSED_AT_ONCE)),
        )
    }

    fn sharing(target: Target, decodes: Arc<DecodePermits>) -> Self {
        Self { target, decodes }
    }

    pub(crate) async fn read(
        &self,
        batch: Vec<FoundBook>,
    ) -> Result<Vec<Result<ScannedBook, UnreadableBook>>, LibraryError> {
        let reader = self.clone();
        Ok(spawn_blocking(move || reader.read_each(&batch)).await?)
    }

    fn read_each(&self, batch: &[FoundBook]) -> Vec<Result<ScannedBook, UnreadableBook>> {
        batch.iter().map(|found| self.read_book(found)).collect()
    }

    fn read_book(&self, found: &FoundBook) -> Result<ScannedBook, UnreadableBook> {
        let read = self.read_found_book(found);
        if let Err(error) = &read
            && !error.is_hidden()
        {
            warn_unreadable(found, error);
        }
        read
    }

    fn read_found_book(&self, found: &FoundBook) -> Result<ScannedBook, UnreadableBook> {
        let target = &self.target;
        let location = found.path.strip_prefix(&target.folder)?.to_path_buf();
        let linked_folder = folder_name(&target.folder);
        let unopened = |source| UnreadableBook::opening(&location, &target.hidden, source);
        let recognised = recognise_book_in(&target.storage, &found.path).map_err(unopened)?;
        let recognised_details = recognised.details();
        let ParsedBook {
            fingerprint,
            page_count,
            page_bytes,
            details,
        } = self.parse(recognised, unopened)?;
        let Placement {
            series,
            title,
            numbering,
            language,
        } = place_book(&location, &linked_folder, FileNumbers::of(&details));
        let stamp = FileStamp::of(recognised_details, || Ok(page_bytes))?;
        Ok(ScannedBook {
            named_series: series_named_in_files(&details, target.added_at_ms)?,
            series: NewSeries::folder(
                SeriesFolder {
                    linked_folder: &linked_folder,
                    location: &series.location,
                },
                series.naming,
                target.added_at_ms,
            )?,
            fingerprint,
            title,
            added_at_ms: target.added_at_ms,
            page_count,
            details,
            file: BookFile {
                root: target.root,
                location,
                size_bytes: stamp.size_bytes,
                modified_at_ms: stamp.modified_at_ms,
            },
            numbering: Some(numbering),
            name_language: language,
        })
    }

    fn parse(
        &self,
        recognised: RecognisedBook,
        unopened: impl FnOnce(FormatError) -> UnreadableBook,
    ) -> Result<ParsedBook, UnreadableBook> {
        let _permit = recognised.is_archive().then(|| self.decodes.hold());
        let path = recognised.path().to_path_buf();
        let mut book = recognised.open(&Limits::default()).map_err(unopened)?;
        ParsedBook::of(&mut book, &path)
    }
}

struct ParsedBook {
    fingerprint: Fingerprint,
    page_count: u32,
    page_bytes: u64,
    details: BookDetails,
}

impl ParsedBook {
    fn of(book: &mut Book, path: &Path) -> Result<Self, UnreadableBook> {
        Ok(Self {
            fingerprint: book.fingerprint()?,
            page_count: saturating_u32(book.pages().len()),
            page_bytes: page_bytes(book),
            details: read_details(book, path),
        })
    }
}

fn page_bytes(book: &Book) -> u64 {
    book.pages().iter().map(|page| page.size).sum()
}

pub(crate) fn warn_unreadable(found: &FoundBook, error: &UnreadableBook) {
    tracing::warn!(
        path = %found.path.display(),
        error = error as &dyn Error,
        "skip a book the scan can't read"
    );
}

impl FileStamp {
    pub(crate) fn read(storage: &Arc<dyn Storage>, path: &Path) -> Result<Self, UnreadableBook> {
        Self::of(storage.details(path)?, || {
            open_book_in(Arc::clone(storage), path, &Limits::default())
                .map(|book| page_bytes(&book))
        })
    }

    fn of(
        details: Details,
        folder_page_bytes: impl FnOnce() -> Result<u64, FormatError>,
    ) -> Result<Self, UnreadableBook> {
        let (Details::Folder { modified } | Details::File { modified, .. }) = details;
        let modified = modified.ok_or_else(|| io::Error::from(io::ErrorKind::Unsupported))?;
        let size_bytes = match details {
            Details::Folder { .. } => folder_page_bytes()?,
            Details::File { size, .. } => size,
        };
        Ok(Self {
            size_bytes,
            modified_at_ms: stored_ms(modified),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs::{self, File},
        sync::{
            atomic::{AtomicUsize, Ordering},
            mpsc,
        },
        thread,
        time::{Duration, Instant, SystemTime},
    };

    use omnileaf_formats::{Entry, LocalStorage};
    use omnileaf_testkit::{
        GENERATED_LIBRARY_NAME, GeneratedLibrary, PageShape, ScratchFolder, page_png,
        write_generated_library,
    };

    use super::*;

    const ONE_ARCHIVE: GeneratedLibrary = GeneratedLibrary {
        series: 1,
        books_per_series: 1,
        pages_per_book: 1,
    };
    const PAGE_SEED: u64 = 7;
    const LONGEST_WAIT: Duration = Duration::from_secs(5);
    const LONG_ENOUGH_TO_PARSE: Duration = Duration::from_millis(300);
    const BYTES_ADDED_SINCE_RECOGNISED: u64 = 1;

    #[derive(Debug)]
    struct ChangingSinceRecognised {
        root: PathBuf,
        lookups: AtomicUsize,
    }

    impl Storage for ChangingSinceRecognised {
        fn entries(&self, folder: &Path) -> io::Result<Vec<Entry>> {
            LocalStorage.entries(&self.root.join(folder))
        }

        fn details(&self, path: &Path) -> io::Result<Details> {
            let details = LocalStorage.details(&self.root.join(path))?;
            Ok(
                match (self.lookups.fetch_add(1, Ordering::SeqCst), details) {
                    (0, details) | (_, details @ Details::Folder { .. }) => details,
                    (_, Details::File { size, modified }) => Details::File {
                        size: size + BYTES_ADDED_SINCE_RECOGNISED,
                        modified,
                    },
                },
            )
        }

        fn open(&self, file: &Path) -> io::Result<File> {
            LocalStorage.open(&self.root.join(file))
        }
    }

    #[derive(Debug)]
    struct WatchedStorage {
        root: PathBuf,
        opens: AtomicUsize,
    }

    impl WatchedStorage {
        fn rooted_in(scratch: &ScratchFolder) -> Arc<Self> {
            Arc::new(Self {
                root: scratch.path().to_path_buf(),
                opens: AtomicUsize::new(0),
            })
        }

        fn has_opened(&self) -> bool {
            self.opens.load(Ordering::SeqCst) > 0
        }
    }

    impl Storage for WatchedStorage {
        fn entries(&self, folder: &Path) -> io::Result<Vec<Entry>> {
            LocalStorage.entries(&self.root.join(folder))
        }

        fn details(&self, path: &Path) -> io::Result<Details> {
            LocalStorage.details(&self.root.join(path))
        }

        fn open(&self, file: &Path) -> io::Result<File> {
            self.opens.fetch_add(1, Ordering::SeqCst);
            LocalStorage.open(&self.root.join(file))
        }
    }

    fn target_over(storage: Arc<dyn Storage>) -> Target {
        Target {
            root: "1".parse().unwrap(),
            kind: RootKind::Linked,
            storage,
            folder: PathBuf::from(GENERATED_LIBRARY_NAME),
            hidden: HiddenFileTypes::default(),
            added_at_ms: 0,
        }
    }

    fn one_archive(scratch: &ScratchFolder) -> FoundBook {
        let written = write_generated_library(scratch.path(), ONE_ARCHIVE).unwrap();
        FoundBook {
            path: written.into_iter().next().unwrap(),
        }
    }

    fn image_folder(scratch: &ScratchFolder, chapter: usize) -> FoundBook {
        let book = Path::new(GENERATED_LIBRARY_NAME)
            .join("Sample Series 001")
            .join(format!("Chapter {chapter:02}"));
        let page = page_png(PAGE_SEED, 0, PageShape::Portrait).unwrap();
        fs::create_dir_all(scratch.path().join(&book)).unwrap();
        fs::write(scratch.path().join(&book).join("001.png"), page).unwrap();
        FoundBook { path: book }
    }

    fn wait_until(is_done: impl Fn() -> bool) -> bool {
        let deadline = Instant::now() + LONGEST_WAIT;
        while !is_done() && Instant::now() < deadline {
            thread::yield_now();
        }
        is_done()
    }

    #[test]
    fn stamps_a_book_with_the_size_its_storage_gave_when_the_book_was_recognised() {
        let scratch = ScratchFolder::new("scan-stamp-at-recognition");
        let book = one_archive(&scratch);
        let size = fs::metadata(scratch.path().join(&book.path)).unwrap().len();
        let reader = BookReader::new(target_over(Arc::new(ChangingSinceRecognised {
            root: scratch.path().to_path_buf(),
            lookups: AtomicUsize::new(0),
        })));

        let read = reader.read_each(&[book]);

        let [Ok(scanned)] = read.as_slice() else {
            panic!("{read:?}");
        };
        assert_eq!(scanned.file.size_bytes, size);
    }

    #[test]
    fn reads_a_folder_of_images_while_every_decode_permit_is_held() {
        let scratch = ScratchFolder::new("scan-folder-without-permit");
        let book = image_folder(&scratch, 1);
        let decodes = Arc::new(DecodePermits::new(1));
        let reader = BookReader::sharing(
            target_over(WatchedStorage::rooted_in(&scratch)),
            Arc::clone(&decodes),
        );
        let held = decodes.hold();
        let (done, finished) = mpsc::channel();

        thread::scope(|scope| {
            scope.spawn(|| done.send(reader.read_each(&[book])).unwrap());

            let read_while_held = finished.recv_timeout(LONGEST_WAIT).ok();
            drop(held);

            let read = read_while_held.unwrap_or_else(|| panic!("waited on a decode permit"));
            assert!(read.iter().all(Result::is_ok), "{read:?}");
        });
    }

    #[test]
    fn opens_an_archive_before_its_decode_permit_and_parses_it_while_holding_one() {
        let scratch = ScratchFolder::new("scan-archive-permit-scope");
        let book = one_archive(&scratch);
        let storage = WatchedStorage::rooted_in(&scratch);
        let decodes = Arc::new(DecodePermits::new(1));
        let reader = BookReader::sharing(target_over(storage.clone()), Arc::clone(&decodes));
        let held = decodes.hold();
        let (done, finished) = mpsc::channel();

        thread::scope(|scope| {
            scope.spawn(|| done.send(reader.read_each(&[book])).unwrap());

            let has_opened = wait_until(|| storage.has_opened());
            let read_while_held = finished.recv_timeout(LONG_ENOUGH_TO_PARSE).ok();
            drop(held);

            assert!(has_opened);
            assert!(read_while_held.is_none(), "{read_while_held:?}");
            let read = finished.recv_timeout(LONGEST_WAIT).unwrap();
            assert!(read.iter().all(Result::is_ok), "{read:?}");
        });
    }

    #[test]
    fn refuses_a_book_found_outside_the_folder_it_scans() {
        let target = Target {
            root: "1".parse().unwrap(),
            kind: RootKind::Linked,
            storage: Arc::new(LocalStorage),
            folder: PathBuf::from("/media/Sample Library"),
            hidden: HiddenFileTypes::default(),
            added_at_ms: 0,
        };
        let found = FoundBook {
            path: PathBuf::from("/media/Elsewhere/v01.cbz"),
        };

        let read = BookReader::new(target).read_found_book(&found);

        assert!(matches!(read, Err(UnreadableBook::OutsideFolder(_))));
    }

    #[test]
    fn stamps_a_file_with_the_size_and_change_time_its_storage_gives() {
        let details = Details::File {
            size: 2048,
            modified: Some(SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000)),
        };

        let stamp = FileStamp::of(details, || unreachable!("a file's size is its own")).unwrap();

        assert_eq!(
            stamp,
            FileStamp {
                size_bytes: 2048,
                modified_at_ms: 1_700_000_000_000,
            }
        );
    }

    #[test]
    fn refuses_a_book_whose_storage_cannot_tell_when_it_last_changed() {
        let details = Details::File {
            size: 2048,
            modified: None,
        };

        let stamp = FileStamp::of(details, || unreachable!("a file's size is its own"));

        assert!(matches!(stamp, Err(UnreadableBook::Metadata(_))));
    }

    #[test]
    fn refuses_a_folder_book_with_no_change_time_without_opening_it() {
        let details = Details::Folder { modified: None };

        let stamp = FileStamp::of(details, || {
            unreachable!("the stamp is refused before the pages are added up")
        });

        assert!(matches!(stamp, Err(UnreadableBook::Metadata(_))));
    }
}
