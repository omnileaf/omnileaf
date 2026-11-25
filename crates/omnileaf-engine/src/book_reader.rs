use std::{
    num::NonZeroUsize,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use omnileaf_db::catalog::{BookDetails, BookFile, NewSeries, ScannedBook, SeriesFolder};
use omnileaf_formats::{Book, Details, FormatError, Limits, RecognisedBook, recognise_book_in};
use omnileaf_sync_proto::Fingerprint;
use tokio::task::spawn_blocking;

use crate::{
    LibraryError,
    book_details::read_details,
    book_numbering::FileNumbers,
    byte_budget::ByteBudget,
    decode_permits::DecodePermits,
    device_class::{IS_MOBILE, MEBIBYTE},
    file_stamp::{FileStamp, page_bytes},
    library_layout::{FoundBook, folder_name},
    overlapped_reads::read_at_most,
    placement::{Placement, place_book},
    saturating_u32::saturating_u32,
    scan_target::Target,
    series_naming::series_named_in_files,
    unreadable_book::{UnreadableBook, warn_unreadable},
};

pub(crate) const BOOKS_PER_BATCH: usize = 32;
/// Each open through Android's storage access framework waits on a round trip to the documents provider, so a scan reads this many books at once to overlap those waits.
const BOOKS_READ_AT_ONCE: NonZeroUsize = NonZeroUsize::MIN.saturating_add(7);
/// Android copies a document its provider can only stream into the cache before it is read, so a phone keeps at most this many listed bytes of books open at once.
const BOOK_BYTES_OPEN_AT_ONCE: u64 = (if IS_MOBILE {
    1024
} else {
    MEBIBYTES_THAT_NEVER_LIMIT_A_DESKTOP
}) * MEBIBYTE as u64;
const MEBIBYTES_THAT_NEVER_LIMIT_A_DESKTOP: u64 = 64 * 1024;
const ONE_AT_A_TIME: NonZeroUsize = NonZeroUsize::MIN;
/// One archive at a time, since a phone's OS ends an app holding too much memory while an archive's index and comic details are decoded.
const ARCHIVES_PARSED_AT_ONCE: usize = 1;

#[derive(Clone)]
pub(crate) struct BookReader {
    target: Target,
    decodes: Arc<DecodePermits>,
    bytes: Arc<ByteBudget>,
    has_timed_out: Arc<AtomicBool>,
}

impl BookReader {
    pub(crate) fn new(target: Target) -> Self {
        Self::sharing(
            target,
            Arc::new(DecodePermits::new(ARCHIVES_PARSED_AT_ONCE)),
            Arc::new(ByteBudget::new(BOOK_BYTES_OPEN_AT_ONCE)),
        )
    }

    fn sharing(target: Target, decodes: Arc<DecodePermits>, bytes: Arc<ByteBudget>) -> Self {
        Self {
            target,
            decodes,
            bytes,
            has_timed_out: Arc::new(AtomicBool::new(false)),
        }
    }

    pub(crate) async fn read(
        &self,
        batch: Vec<FoundBook>,
    ) -> Result<Vec<Result<ScannedBook, UnreadableBook>>, LibraryError> {
        let reader = self.clone();
        Ok(spawn_blocking(move || reader.read_each(&batch)).await?)
    }

    fn read_each(&self, batch: &[FoundBook]) -> Vec<Result<ScannedBook, UnreadableBook>> {
        let at_once = self.books_read_at_once();
        let mut read = read_at_most(batch, at_once, |found| self.read_found_book(found));
        if at_once > ONE_AT_A_TIME {
            self.read_again_what_timed_out(batch, &mut read);
        }
        for (found, book) in batch.iter().zip(&read) {
            if let Err(error) = book
                && !error.is_hidden()
            {
                warn_unreadable(found, error);
            }
        }
        read
    }

    fn books_read_at_once(&self) -> NonZeroUsize {
        if self.has_timed_out.load(Ordering::Relaxed) {
            ONE_AT_A_TIME
        } else {
            BOOKS_READ_AT_ONCE
        }
    }

    /// Android gives up on each open after a set time, so a documents provider that serves one open at a time times out the others it was asked for at once.
    fn read_again_what_timed_out(
        &self,
        batch: &[FoundBook],
        read: &mut [Result<ScannedBook, UnreadableBook>],
    ) {
        for (found, book) in batch.iter().zip(read) {
            if book.as_ref().is_err_and(UnreadableBook::has_timed_out) {
                self.has_timed_out.store(true, Ordering::Relaxed);
                *book = self.read_found_book(found);
            }
        }
    }

    fn read_found_book(&self, found: &FoundBook) -> Result<ScannedBook, UnreadableBook> {
        let target = &self.target;
        let location = found.path.strip_prefix(&target.folder)?.to_path_buf();
        let linked_folder = folder_name(&target.folder);
        let unopened = |source| UnreadableBook::opening(&location, &target.hidden, source);
        let ParsedBook {
            recognised_details,
            fingerprint,
            page_count,
            page_bytes,
            details,
        } = self.recognise_and_parse(found, unopened)?;
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

    fn recognise_and_parse(
        &self,
        found: &FoundBook,
        unopened: impl Fn(FormatError) -> UnreadableBook + Copy,
    ) -> Result<ParsedBook, UnreadableBook> {
        let _bytes = self.bytes.hold_for(found.form);
        let recognised = recognise_book_in(&self.target.storage, &found.path).map_err(unopened)?;
        self.parse(recognised, unopened)
    }

    fn parse(
        &self,
        recognised: RecognisedBook,
        unopened: impl FnOnce(FormatError) -> UnreadableBook,
    ) -> Result<ParsedBook, UnreadableBook> {
        let _permit = recognised.is_archive().then(|| self.decodes.hold());
        let path = recognised.path().to_path_buf();
        let recognised_details = recognised.details();
        let mut book = recognised.open(&Limits::default()).map_err(unopened)?;
        ParsedBook::of(&mut book, &path, recognised_details)
    }
}

struct ParsedBook {
    recognised_details: Details,
    fingerprint: Fingerprint,
    page_count: u32,
    page_bytes: u64,
    details: BookDetails,
}

impl ParsedBook {
    fn of(
        book: &mut Book,
        path: &Path,
        recognised_details: Details,
    ) -> Result<Self, UnreadableBook> {
        Ok(Self {
            recognised_details,
            fingerprint: book.fingerprint()?,
            page_count: saturating_u32(book.pages().len()),
            page_bytes: page_bytes(book),
            details: read_details(book, path),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs::{self, File},
        io, mem,
        path::PathBuf,
        sync::{
            Mutex,
            atomic::{AtomicBool, AtomicUsize, Ordering},
            mpsc,
        },
        thread,
        time::{Duration, Instant},
    };

    use omnileaf_db::catalog::RootKind;
    use omnileaf_formats::{Entry, LocalStorage, Storage};
    use omnileaf_testkit::{
        GENERATED_LIBRARY_NAME, GeneratedLibrary, PageShape, ScratchFolder, page_png,
        write_generated_library,
    };

    use crate::{file_type::HiddenFileTypes, library_layout::BookForm};

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
    const TEST_BYTE_BUDGET: u64 = 1 << 20;
    const ARCHIVES: GeneratedLibrary = GeneratedLibrary {
        series: 1,
        books_per_series: 8,
        pages_per_book: 1,
    };
    const TWO_BATCHES: GeneratedLibrary = GeneratedLibrary {
        series: 2,
        books_per_series: 8,
        pages_per_book: 1,
    };
    const BOOKS_PER_TEST_BATCH: usize = 8;
    const IMAGE_FOLDER_BOOKS: usize = 8;
    const LISTED_BYTES: u64 = 100;
    const BOOKS_THE_BUDGET_HOLDS: u64 = 2;
    const WAIT_FOR_COMPANY: Duration = Duration::from_secs(2);
    const WAIT_FOR_A_SECOND_OPEN: Duration = Duration::from_millis(100);
    const UNLISTED_FILES: usize = 4;
    const WAIT_FOR_A_THIRD_OPEN: Duration = Duration::from_millis(300);

    #[derive(Clone, Copy)]
    enum InCompany {
        Opens,
        TimesOut,
    }

    #[derive(Debug)]
    struct OpensInCompany {
        root: PathBuf,
        company: usize,
        longest: Duration,
        times_out_in_company: bool,
        is_hanging: AtomicBool,
        open_now: AtomicUsize,
        most_open_at_once: AtomicUsize,
        opened: Mutex<Vec<(PathBuf, usize)>>,
    }

    impl OpensInCompany {
        fn waiting_for(scratch: &ScratchFolder, company: usize, longest: Duration) -> Arc<Self> {
            Self::new(scratch, company, longest, InCompany::Opens)
        }

        fn timing_out_in_company(scratch: &ScratchFolder) -> Arc<Self> {
            Self::new(scratch, 2, WAIT_FOR_COMPANY, InCompany::TimesOut)
        }

        fn new(
            scratch: &ScratchFolder,
            company: usize,
            longest: Duration,
            in_company: InCompany,
        ) -> Arc<Self> {
            Arc::new(Self {
                root: scratch.path().to_path_buf(),
                company,
                longest,
                times_out_in_company: matches!(in_company, InCompany::TimesOut),
                is_hanging: AtomicBool::new(false),
                open_now: AtomicUsize::new(0),
                most_open_at_once: AtomicUsize::new(0),
                opened: Mutex::new(Vec::new()),
            })
        }

        fn hang(&self) {
            self.is_hanging.store(true, Ordering::SeqCst);
        }

        fn most_open_at_once(&self) -> usize {
            self.most_open_at_once.load(Ordering::SeqCst)
        }

        fn take_opened(&self) -> Vec<(PathBuf, usize)> {
            mem::take(&mut self.opened.lock().unwrap())
        }
    }

    impl Storage for OpensInCompany {
        fn entries(&self, folder: &Path) -> io::Result<Vec<Entry>> {
            LocalStorage.entries(&self.root.join(folder))
        }

        fn details(&self, path: &Path) -> io::Result<Details> {
            LocalStorage.details(&self.root.join(path))
        }

        fn open(&self, file: &Path) -> io::Result<File> {
            let now = self.open_now.fetch_add(1, Ordering::SeqCst) + 1;
            self.most_open_at_once.fetch_max(now, Ordering::SeqCst);
            self.opened.lock().unwrap().push((file.to_path_buf(), now));
            wait_until_within(self.longest, || self.most_open_at_once() >= self.company);
            let has_company = self.open_now.load(Ordering::SeqCst) > 1;
            let opened = if self.is_hanging.load(Ordering::SeqCst)
                || (self.times_out_in_company && has_company)
            {
                Err(io::ErrorKind::TimedOut.into())
            } else {
                LocalStorage.open(&self.root.join(file))
            };
            self.open_now.fetch_sub(1, Ordering::SeqCst);
            opened
        }
    }

    fn archives_of(scratch: &ScratchFolder, library: GeneratedLibrary) -> Vec<FoundBook> {
        write_generated_library(scratch.path(), library)
            .unwrap()
            .into_iter()
            .map(|path| found_file(scratch, path))
            .collect()
    }

    fn found_file(scratch: &ScratchFolder, path: PathBuf) -> FoundBook {
        let size = fs::metadata(scratch.path().join(&path)).unwrap().len();
        FoundBook {
            path,
            form: BookForm::of_file_listed_as(size),
        }
    }

    fn listed_bytes(book: &FoundBook) -> u64 {
        let BookForm::File { listed_bytes } = book.form else {
            panic!("the test lists its book with a size");
        };
        listed_bytes.get()
    }

    fn archives(scratch: &ScratchFolder) -> Vec<FoundBook> {
        archives_of(scratch, ARCHIVES)
    }

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
        let path = written.into_iter().next().unwrap();
        found_file(scratch, path)
    }

    fn image_folder(scratch: &ScratchFolder, chapter: usize) -> FoundBook {
        let book = Path::new(GENERATED_LIBRARY_NAME)
            .join("Sample Series 001")
            .join(format!("Chapter {chapter:02}"));
        let page = page_png(PAGE_SEED, 0, PageShape::Portrait).unwrap();
        fs::create_dir_all(scratch.path().join(&book)).unwrap();
        fs::write(scratch.path().join(&book).join("001.png"), page).unwrap();
        FoundBook {
            path: book,
            form: BookForm::FolderOfImages,
        }
    }

    fn wait_until(is_done: impl Fn() -> bool) -> bool {
        wait_until_within(LONGEST_WAIT, is_done)
    }

    fn wait_until_within(longest: Duration, is_done: impl Fn() -> bool) -> bool {
        let deadline = Instant::now() + longest;
        while !is_done() && Instant::now() < deadline {
            thread::yield_now();
        }
        is_done()
    }

    fn budgeted_reader(storage: Arc<dyn Storage>, bytes: &Arc<ByteBudget>) -> BookReader {
        BookReader::sharing(
            target_over(storage),
            Arc::new(DecodePermits::new(ARCHIVES_PARSED_AT_ONCE)),
            Arc::clone(bytes),
        )
    }

    #[test]
    fn takes_a_book_s_listed_bytes_from_the_budget_before_opening_it() {
        let scratch = ScratchFolder::new("scan-bytes-before-open");
        let book = one_archive(&scratch);
        let storage = WatchedStorage::rooted_in(&scratch);
        let bytes = Arc::new(ByteBudget::new(listed_bytes(&book)));
        let reader = budgeted_reader(storage.clone(), &bytes);
        let held = bytes.hold_for(book.form);
        let (done, finished) = mpsc::channel();

        thread::spawn(move || done.send(reader.read_each(&[book])).unwrap());

        let opened_while_held = wait_until_within(LONG_ENOUGH_TO_PARSE, || storage.has_opened());
        drop(held);
        let read = finished.recv_timeout(LONGEST_WAIT).unwrap();
        assert!(!opened_while_held);
        assert!(read.iter().all(Result::is_ok), "{read:?}");
    }

    #[test]
    fn reads_a_book_listed_larger_than_the_whole_byte_budget() {
        let scratch = ScratchFolder::new("scan-bytes-oversized");
        let book = one_archive(&scratch);
        let bytes = Arc::new(ByteBudget::new(listed_bytes(&book) - 1));
        let reader = budgeted_reader(WatchedStorage::rooted_in(&scratch), &bytes);
        let (done, finished) = mpsc::channel();

        thread::spawn(move || done.send(reader.read_each(&[book])).unwrap());

        let read = finished.recv_timeout(LONGEST_WAIT).unwrap();
        assert!(read.iter().all(Result::is_ok), "{read:?}");
    }

    #[test]
    fn opens_archives_at_once_on_one_permit() {
        let scratch = ScratchFolder::new("scan-archives-in-company");
        let books = archives(&scratch);
        let storage = OpensInCompany::waiting_for(&scratch, 2, WAIT_FOR_COMPANY);
        let reader = BookReader::sharing(
            target_over(storage.clone()),
            Arc::new(DecodePermits::new(1)),
            Arc::new(ByteBudget::new(TEST_BYTE_BUDGET)),
        );

        let read = reader.read_each(&books);

        assert!(read.iter().all(Result::is_ok), "{read:?}");
        assert!(storage.most_open_at_once() > 1);
    }

    #[test]
    fn opens_folders_of_images_at_once_on_one_permit() {
        let scratch = ScratchFolder::new("scan-folders-in-company");
        let books: Vec<FoundBook> = (1..=IMAGE_FOLDER_BOOKS)
            .map(|chapter| image_folder(&scratch, chapter))
            .collect();
        let storage = OpensInCompany::waiting_for(&scratch, 2, WAIT_FOR_COMPANY);
        let reader = BookReader::sharing(
            target_over(storage.clone()),
            Arc::new(DecodePermits::new(1)),
            Arc::new(ByteBudget::new(TEST_BYTE_BUDGET)),
        );

        let read = reader.read_each(&books);

        assert!(read.iter().all(Result::is_ok), "{read:?}");
        assert!(storage.most_open_at_once() > 1);
    }

    #[test]
    fn opens_no_more_listed_bytes_at_once_than_its_budget_holds() {
        let scratch = ScratchFolder::new("scan-bytes-in-company");
        let books: Vec<FoundBook> = archives(&scratch)
            .into_iter()
            .map(|book| FoundBook {
                form: BookForm::of_file_listed_as(LISTED_BYTES),
                ..book
            })
            .collect();
        let storage = OpensInCompany::waiting_for(&scratch, 3, WAIT_FOR_A_THIRD_OPEN);
        let reader = budgeted_reader(
            storage.clone(),
            &Arc::new(ByteBudget::new(LISTED_BYTES * BOOKS_THE_BUDGET_HOLDS)),
        );

        let read = reader.read_each(&books);

        assert!(read.iter().all(Result::is_ok), "{read:?}");
        assert_eq!(
            storage.most_open_at_once(),
            usize::try_from(BOOKS_THE_BUDGET_HOLDS).unwrap()
        );
    }

    fn reader_after_a_timeout_in_company(
        scratch: &ScratchFolder,
    ) -> (Arc<OpensInCompany>, BookReader, Vec<FoundBook>) {
        let books = archives_of(scratch, TWO_BATCHES);
        let (first, second) = books.split_at(BOOKS_PER_TEST_BATCH);
        let storage = OpensInCompany::timing_out_in_company(scratch);
        let reader = BookReader::sharing(
            target_over(storage.clone()),
            Arc::new(DecodePermits::new(1)),
            Arc::new(ByteBudget::new(TEST_BYTE_BUDGET)),
        );
        let read = reader.read_each(first);
        assert!(read.iter().all(Result::is_ok), "{read:?}");
        storage.take_opened();
        (storage, reader, second.to_vec())
    }

    #[test]
    fn reads_one_book_at_a_time_once_an_open_has_timed_out() {
        let scratch = ScratchFolder::new("scan-one-at-a-time-after-timeout");
        let (storage, reader, second) = reader_after_a_timeout_in_company(&scratch);

        let read = reader.read_each(&second);

        assert!(read.iter().all(Result::is_ok), "{read:?}");
        let most_open_at_once = storage
            .take_opened()
            .into_iter()
            .map(|(_, open_at_once)| open_at_once)
            .max();
        assert_eq!(most_open_at_once, Some(1));
    }

    #[test]
    fn opens_each_book_once_when_the_provider_hangs_after_an_open_has_timed_out() {
        let scratch = ScratchFolder::new("scan-hung-after-timeout");
        let (storage, reader, second) = reader_after_a_timeout_in_company(&scratch);
        storage.hang();

        let read = reader.read_each(&second);

        assert!(
            read.iter()
                .all(|book| book.as_ref().is_err_and(UnreadableBook::has_timed_out)),
            "{read:?}"
        );
        let mut opened: Vec<PathBuf> = storage
            .take_opened()
            .into_iter()
            .map(|(path, _)| path)
            .collect();
        opened.sort();
        let mut books: Vec<PathBuf> = second.into_iter().map(|book| book.path).collect();
        books.sort();
        assert_eq!(opened, books);
    }

    #[test]
    fn opens_files_of_unlisted_size_one_at_a_time_while_folders_of_images_overlap() {
        let scratch = ScratchFolder::new("scan-unlisted-sizes");
        let unlisted: Vec<FoundBook> = archives(&scratch)
            .into_iter()
            .take(UNLISTED_FILES)
            .map(|book| FoundBook {
                form: BookForm::FileOfUnlistedSize,
                ..book
            })
            .collect();
        let folders: Vec<FoundBook> = (1..=IMAGE_FOLDER_BOOKS)
            .map(|chapter| image_folder(&scratch, chapter))
            .collect();
        let storage = OpensInCompany::waiting_for(&scratch, 2, WAIT_FOR_A_SECOND_OPEN);
        let reader = budgeted_reader(
            storage.clone(),
            &Arc::new(ByteBudget::new(TEST_BYTE_BUDGET)),
        );

        let read_files = reader.read_each(&unlisted);
        let most_files_open_at_once = storage.most_open_at_once();
        let read_folders = reader.read_each(&folders);

        assert!(read_files.iter().all(Result::is_ok), "{read_files:?}");
        assert!(read_folders.iter().all(Result::is_ok), "{read_folders:?}");
        assert_eq!(most_files_open_at_once, 1);
        assert!(storage.most_open_at_once() > 1);
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
            Arc::new(ByteBudget::new(TEST_BYTE_BUDGET)),
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
        let reader = BookReader::sharing(
            target_over(storage.clone()),
            Arc::clone(&decodes),
            Arc::new(ByteBudget::new(TEST_BYTE_BUDGET)),
        );
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
            form: BookForm::FileOfUnlistedSize,
        };

        let read = BookReader::new(target).read_found_book(&found);

        assert!(matches!(read, Err(UnreadableBook::OutsideFolder(_))));
    }
}
