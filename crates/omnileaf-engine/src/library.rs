use std::{
    collections::BTreeMap,
    fs, io, mem,
    path::{Path, PathBuf},
    sync::{self, Arc, PoisonError},
    time::Duration,
};

use omnileaf_db::{
    Config, Database,
    catalog::{
        AndroidTree, AppleBookmark, BookFileId, BookToRead, Cover, NewRoot, PageDimensions,
        PageRequest, PageSize, PlaceInSeries, RootId, RootKind, RootLocator, SeriesFilter,
        SeriesListing, add_root, book_to_read, bookmarked_roots, cover_file, home_root,
        library_root, library_roots, mark_root_available, mark_root_unavailable, page_dimensions,
        place_in_series, remove_book_files, remove_books_without_files, remove_root,
        root_book_count, root_files, series_books, series_count, series_overview, series_page,
        store_page_dimensions, up_next,
    },
    first_launch::{finish_first_launch, first_launch_finished},
    history::{
        book_reading_time, book_sessions, days_in_a_row, history_page, reading_since,
        reading_time_by_day, series_read,
    },
    library_listing::{library_listing, set_library_listing},
    library_view::{library_view, set_library_view},
    store::{Changed, Clock, Store},
};
use omnileaf_formats::LocalStorage;
use tokio::{
    sync::{Mutex, MutexGuard, broadcast, watch},
    task::spawn_blocking,
    time::{MissedTickBehavior, interval, timeout},
};

use crate::{
    AppLanguage, BookCursor, BookId, BookSessions, BooksRemoval, CoversPerRowOutOfRange,
    FolderCursor, FolderId, FolderPage, FolderRescan, FolderScan, HistoryCursor, HistoryOf,
    HistoryPage, HistorySeries, LibraryChanges, LibraryFilter, LibraryFolder, LibraryListing,
    LibrarySearch, LibraryView, LocalDay, ReadMark, ReadingWeek, RescanOutcome, ResolvedBookmark,
    ScanProgress, SeriesBookListing, SeriesBookPage, SeriesCursor, SeriesId, SeriesOverview,
    SeriesPage, UtcOffset,
    bookmark_access::{AsRead, Reopened, note_bookmarks_opened},
    describe_error,
    device_class::{IS_MOBILE, MEBIBYTE},
    file_in_storage::FileInStorage,
    history::whole_seconds,
    library_changes::CatalogWritten,
    library_folder::root_folder,
    library_layout::folder_name,
    library_search::StoredSearch,
    moved_home::move_home,
    reading_progress::{ReadingProgress, ReadingSaved},
    rescan::rescan,
    rescan_conditions::{RescanConditions, Storage},
    rescan_schedule::{Check, RescanSchedule},
    scan::{Target, find_books_in, saturating_u32, scan, walk},
};

const DATABASE_FILE: &str = "library.sqlite";
const BACKUP_FOLDER: &str = "backups";
const FOLDERS_PER_PAGE: u16 = 50;
const SERIES_PER_PAGE: u16 = 50;
const BOOKS_PER_PAGE: u16 = 100;
const SESSIONS_PER_PAGE: u16 = 50;
const CATALOG_WRITE_BACKLOG: usize = 16;
const SCHEDULE_CHECK_EVERY: Duration = Duration::from_mins(1);
const STORAGE_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
#[cfg(target_vendor = "apple")]
const APPLE_PRIVATE_FOLDER: &str = "/private";
#[cfg(target_vendor = "apple")]
const APPLE_FOLDER_LINKED_TO_PRIVATE: &str = "var";
const MAPPED_DATABASE_BYTES: u32 = if IS_MOBILE {
    64 * MEBIBYTE
} else {
    256 * MEBIBYTE
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LibraryFolders {
    pub database: PathBuf,
    pub home: PathBuf,
}

impl From<PathBuf> for LibraryFolders {
    fn from(folder: PathBuf) -> Self {
        Self {
            database: folder.clone(),
            home: folder,
        }
    }
}

pub type OpenTree = Arc<dyn Fn(&AndroidTree) -> Arc<dyn omnileaf_formats::Storage> + Send + Sync>;

pub struct Library {
    store: Arc<Store>,
    reading: ReadingProgress,
    catalog_change_lock: Mutex<()>,
    schedule: sync::Mutex<RescanSchedule>,
    schedule_gate: watch::Sender<ScheduleGate>,
    catalog_writes: broadcast::Sender<CatalogWritten>,
    local_storage: Arc<dyn omnileaf_formats::Storage>,
    open_tree: Option<OpenTree>,
}

struct RootFiles {
    storage: Arc<dyn omnileaf_formats::Storage>,
    folder: PathBuf,
}

#[derive(Clone, Copy, Default)]
struct ScheduleGate {
    is_on: bool,
    is_book_open: bool,
}

impl ScheduleGate {
    fn is_open(self) -> bool {
        self.is_on && !self.is_book_open
    }
}

#[derive(Debug, thiserror::Error)]
pub enum LibraryError {
    #[error("create the library folder {}", path.display())]
    CreateFolder {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("read folder {}", path.display())]
    FolderUnreadable {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("library folder {id} isn't in the library")]
    FolderNotFound { id: FolderId },
    #[error("series {id} isn't in the library")]
    SeriesNotFound { id: SeriesId },
    #[error("remove library folder {id}, the home folder the library always keeps")]
    HomeFolderKept { id: FolderId },
    #[error("search for {chars} characters, more than the {max} a search reads")]
    SearchTooLong { chars: usize, max: u16 },
    #[error("continue a list from a page cursor given out for another list or listing")]
    CursorForAnotherList,
    #[error("reach the library database")]
    Database(#[source] omnileaf_db::Error),
    #[error("read the library view this device stored")]
    StoredView(#[source] CoversPerRowOutOfRange),
    #[error("run blocking library work")]
    Interrupted(#[from] tokio::task::JoinError),
    #[error("reach the task that saves reading progress, which has stopped")]
    ReadingStopped,
}

impl LibraryError {
    #[must_use]
    pub fn was_written_by_a_newer_version(&self) -> bool {
        matches!(self, Self::Database(omnileaf_db::Error::NewerSchema { .. }))
    }
}

pub(crate) struct BookToOpen {
    pub(crate) found: BookToRead,
    pub(crate) place: PlaceInSeries,
}

impl Library {
    #[tracing::instrument(skip_all)]
    pub async fn open(
        folders: impl Into<LibraryFolders>,
        clock: impl Clock,
    ) -> Result<Self, LibraryError> {
        let LibraryFolders { database, home } = folders.into();
        let config = Config {
            path: database.join(DATABASE_FILE),
            backup_dir: home.join(BACKUP_FOLDER),
            mmap_size_bytes: MAPPED_DATABASE_BYTES,
        };
        let folders = [database, home.clone()];
        let database = spawn_blocking(move || {
            for folder in folders {
                fs::create_dir_all(&folder).map_err(|source| LibraryError::CreateFolder {
                    path: folder,
                    source,
                })?;
            }
            Ok::<_, LibraryError>(Database::open(&config)?)
        })
        .await??;
        let store = Arc::new(Store::new(database, clock));
        let library = Self {
            reading: ReadingProgress::start(Arc::clone(&store)),
            store,
            catalog_change_lock: Mutex::new(()),
            schedule: sync::Mutex::default(),
            schedule_gate: watch::Sender::new(ScheduleGate::default()),
            catalog_writes: broadcast::Sender::new(CATALOG_WRITE_BACKLOG),
            local_storage: Arc::new(LocalStorage),
            open_tree: None,
        };
        library.set_home(home).await?;
        Ok(library)
    }

    #[must_use]
    pub fn reading_trees_with(self, open: OpenTree) -> Self {
        Self {
            open_tree: Some(open),
            ..self
        }
    }

    #[tracing::instrument(skip_all, fields(folder))]
    pub async fn add_folder(
        &self,
        folder: impl Into<RootLocator>,
        mut on_progress: impl FnMut(ScanProgress) + Send,
    ) -> Result<FolderScan, LibraryError> {
        let locator = self.folder_to_read(folder.into()).await?;
        let folder = root_folder(&locator);
        tracing::Span::current().record("folder", tracing::field::display(folder.display()));
        let Some(files) = self.files_of(&locator) else {
            return Err(LibraryError::FolderUnreadable {
                path: folder,
                source: io::ErrorKind::Unsupported.into(),
            });
        };
        let _scanning = self.catalog_change_lock.lock().await;
        on_progress(ScanProgress::Finding { found: 0 });
        let layout = find_books_in(
            Arc::clone(&files.storage),
            files.folder.clone(),
            &mut on_progress,
        )
        .await?;
        let root = self.link(locator).await?;
        let target = self.target(root, RootKind::Linked, files);
        scan(
            self.store.database(),
            target,
            layout,
            self.noting_writes(on_progress),
        )
        .await
    }

    pub async fn folders(&self, after: Option<FolderCursor>) -> Result<FolderPage, LibraryError> {
        let request = PageRequest {
            after: after.map(|cursor| cursor.0),
            size: PageSize::try_from(FOLDERS_PER_PAGE)?,
        };
        let page = self
            .store
            .database()
            .read(move |connection| library_roots(connection, &request))
            .await?;
        Ok(FolderPage {
            folders: page.items.into_iter().map(LibraryFolder::from).collect(),
            next: page.next.map(FolderCursor),
        })
    }

    pub async fn series(
        &self,
        listing: LibraryListing,
        after: Option<SeriesCursor>,
    ) -> Result<SeriesPage, LibraryError> {
        let request = PageRequest {
            after: after.map(|cursor| cursor.0),
            size: PageSize::try_from(SERIES_PER_PAGE)?,
        };
        let listing = SeriesListing::from(listing);
        let page = self
            .store
            .database()
            .read(move |connection| series_page(connection, &listing, &request))
            .await?;
        Ok(SeriesPage::from(page))
    }

    pub async fn folder_book_count(&self, id: FolderId) -> Result<u32, LibraryError> {
        Ok(self
            .store
            .database()
            .read(move |connection| root_book_count(connection, id.0))
            .await?)
    }

    pub async fn series_count(&self, filter: LibraryFilter) -> Result<u32, LibraryError> {
        let filter = SeriesFilter::from(filter);
        Ok(self
            .store
            .database()
            .read(move |connection| series_count(connection, &filter))
            .await?)
    }

    pub async fn search(
        &self,
        search: LibrarySearch,
        after: Option<SeriesCursor>,
    ) -> Result<SeriesPage, LibraryError> {
        let request = PageRequest {
            after: after.map(|cursor| cursor.0),
            size: PageSize::try_from(SERIES_PER_PAGE)?,
        };
        let search = StoredSearch::parse(&search)?;
        let page = self
            .store
            .database()
            .read(move |connection| search.page(connection, &request))
            .await?;
        Ok(SeriesPage::from(page))
    }

    pub async fn search_count(&self, search: LibrarySearch) -> Result<u32, LibraryError> {
        let search = StoredSearch::parse(&search)?;
        Ok(self
            .store
            .database()
            .read(move |connection| search.count(connection))
            .await?)
    }

    /// Fails with [`LibraryError::SeriesNotFound`] for a series the library doesn't show, being missing or empty of books.
    pub async fn series_overview(&self, id: SeriesId) -> Result<SeriesOverview, LibraryError> {
        self.save_reading_before_reading().await;
        let series = id.0;
        let found = self
            .store
            .database()
            .read(move |connection| {
                let Some(overview) = series_overview(connection, series)? else {
                    return Ok(None);
                };
                Ok(Some((overview, up_next(connection, series)?)))
            })
            .await?;
        let (overview, up_next) = found.ok_or(LibraryError::SeriesNotFound { id })?;
        Ok(SeriesOverview::new(overview, up_next))
    }

    /// Lists a series' books as `listing` asks, giving a series missing from the library no books.
    pub async fn series_books(
        &self,
        id: SeriesId,
        listing: SeriesBookListing,
        after: Option<BookCursor>,
    ) -> Result<SeriesBookPage, LibraryError> {
        let request = PageRequest {
            after: after.map(|cursor| cursor.0),
            size: PageSize::try_from(BOOKS_PER_PAGE)?,
        };
        let page = self
            .store
            .database()
            .read(move |connection| series_books(connection, id.0, listing.into(), &request))
            .await?;
        Ok(SeriesBookPage::from(page))
    }

    /// Lists the reading sessions `of` asks for whose books are still in the library, the latest started first, each with the time read on its day.
    pub async fn history(
        &self,
        after: Option<HistoryCursor>,
        of: HistoryOf,
    ) -> Result<HistoryPage, LibraryError> {
        let request = PageRequest {
            after: after.map(|cursor| cursor.0),
            size: PageSize::try_from(SESSIONS_PER_PAGE)?,
        };
        let (page, read_ms_by_day) = self
            .store
            .database()
            .read(move |connection| {
                let page = history_page(connection, of.into(), &request)?;
                let days = page.items.iter().map(|entry| entry.local_day);
                let read_ms_by_day = match (days.clone().min(), days.max()) {
                    (Some(first), Some(last)) => reading_time_by_day(connection, first..=last)?,
                    _ => BTreeMap::new(),
                };
                Ok((page, read_ms_by_day))
            })
            .await?;
        Ok(HistoryPage::new(page, &read_ms_by_day))
    }

    /// What was read from the start of `week_start` on, and the days read in a row up to `today`, in the local time each session started at.
    pub async fn reading_week(
        &self,
        week_start: LocalDay,
        today: LocalDay,
    ) -> Result<ReadingWeek, LibraryError> {
        let (since, days_in_a_row) = self
            .store
            .database()
            .read(move |connection| {
                Ok((
                    reading_since(connection, week_start.0)?,
                    days_in_a_row(connection, today.0)?,
                ))
            })
            .await?;
        Ok(ReadingWeek {
            read_seconds: whole_seconds(since.read_ms),
            books_opened: since.books_opened,
            books_finished: since.books_finished,
            days_in_a_row,
        })
    }

    /// Adds up `book`'s reading sessions, giving none for a book never read.
    pub async fn book_sessions(&self, book: BookId) -> Result<Option<BookSessions>, LibraryError> {
        let summed = self
            .store
            .database()
            .read(move |connection| book_sessions(connection, book.0))
            .await?;
        Ok(summed.map(BookSessions::from))
    }

    /// The series in the library with any reading, in title order.
    pub async fn history_series(&self) -> Result<Vec<HistorySeries>, LibraryError> {
        let series = self.store.database().read(series_read).await?;
        Ok(series
            .into_iter()
            .map(|(id, title)| HistorySeries {
                id: SeriesId(id),
                title,
            })
            .collect())
    }

    /// Seconds spent reading `book` over all its sessions, once any reading not yet saved is.
    pub async fn book_read_time(&self, book: BookId) -> Result<u32, LibraryError> {
        self.save_reading_before_reading().await;
        let read_ms = self
            .store
            .database()
            .read(move |connection| book_reading_time(connection, book.0))
            .await?;
        Ok(whole_seconds(read_ms))
    }

    /// Seconds read from the start of `first_day` to the end of `last_day`, in the local time each session started at.
    pub async fn reading_time_between(
        &self,
        first_day: LocalDay,
        last_day: LocalDay,
    ) -> Result<u32, LibraryError> {
        let days = first_day.0..=last_day.0;
        let read_ms_by_day = self
            .store
            .database()
            .read(move |connection| reading_time_by_day(connection, days))
            .await?;
        let read_ms = read_ms_by_day
            .values()
            .fold(0_i64, |sum, &read_ms| sum.saturating_add(read_ms));
        Ok(whole_seconds(read_ms))
    }

    /// Marks the books read or unread in one write, leaving where each was opened at as it is, once any reading not yet saved is, so that save never undoes the mark.
    #[tracing::instrument(skip_all, fields(books = books.len(), ?mark))]
    pub async fn mark_books(&self, books: Vec<BookId>, mark: ReadMark) -> Result<(), LibraryError> {
        let is_read = match mark {
            ReadMark::Read => true,
            ReadMark::Unread => false,
        };
        self.reading.save_now().await?;
        Ok(self
            .store
            .write(move |writer| {
                books
                    .iter()
                    .try_for_each(|book| writer.set_read(book.0, is_read))
            })
            .await?)
    }

    /// Saves the page reached in the book read before, then the pages the reader shows in this one after the page it opened on.
    #[tracing::instrument(skip_all, fields(%book, page))]
    pub async fn reading_restored(
        &self,
        book: BookId,
        page: u32,
        utc_offset: UtcOffset,
    ) -> Result<(), LibraryError> {
        self.reading.restored(book, page, utc_offset).await
    }

    /// Saves the page within a moment, unless the reader hasn't restored the book yet or has closed it.
    pub async fn page_shown(
        &self,
        book: BookId,
        page: u32,
        utc_offset: UtcOffset,
    ) -> Result<(), LibraryError> {
        self.reading.shown(book, page, utc_offset).await
    }

    /// Saves the page the reader showed last in the book, and nothing it shows in it from then on.
    #[tracing::instrument(skip_all, fields(%book))]
    pub async fn close_book(&self, book: BookId) -> Result<(), LibraryError> {
        self.reading.closed(book).await
    }

    /// Saves at once the page the reader showed last and ends its reading session, as the app is put away.
    #[tracing::instrument(skip_all)]
    pub async fn put_away(&self) -> Result<(), LibraryError> {
        self.reading.put_away().await
    }

    /// Saves the page reached in the book read now, and keeps `book`'s length for when the reader restores it.
    pub(crate) async fn start_reading(
        &self,
        book: BookId,
        page_count: usize,
    ) -> Result<(), LibraryError> {
        self.reading.opened(book, page_count).await
    }

    /// Saves the page reached in the book read now, so what is read next shows it, and reads on without it should the save fail, which the save warns of itself.
    async fn save_reading_before_reading(&self) {
        if let Err(error) = self.reading.save_now().await {
            tracing::debug!(error = %describe_error(&error), "save the page reached before reading the library");
        }
    }

    #[must_use]
    pub fn reading_saved(&self) -> broadcast::Receiver<ReadingSaved> {
        self.reading.subscribe()
    }

    pub async fn listing(&self) -> Result<LibraryListing, LibraryError> {
        let stored = self.store.database().read(library_listing).await?;
        Ok(stored.map_or_else(LibraryListing::default, LibraryListing::from))
    }

    #[tracing::instrument(skip_all)]
    pub async fn set_listing(&self, listing: LibraryListing) -> Result<(), LibraryError> {
        let stored = SeriesListing::from(listing);
        Ok(self
            .store
            .database()
            .write(move |transaction| set_library_listing(transaction, &stored))
            .await?)
    }

    pub async fn view(&self) -> Result<LibraryView, LibraryError> {
        let stored = self.store.database().read(library_view).await?;
        stored.map_or_else(
            || Ok(LibraryView::default()),
            |view| LibraryView::try_from(view).map_err(LibraryError::StoredView),
        )
    }

    #[tracing::instrument(skip_all)]
    pub async fn set_view(&self, view: LibraryView) -> Result<(), LibraryError> {
        let stored = view.into();
        Ok(self
            .store
            .database()
            .write(move |transaction| set_library_view(transaction, &stored))
            .await?)
    }

    pub(crate) async fn cover_file(
        &self,
        cover: Cover,
    ) -> Result<Option<FileInStorage>, LibraryError> {
        let file = self
            .store
            .database()
            .read(move |connection| cover_file(connection, &cover))
            .await?;
        Ok(file.and_then(|(locator, location)| self.file_in(&locator, &location)))
    }

    pub(crate) fn book_file(&self, book: &BookToRead) -> Option<FileInStorage> {
        self.file_in(&book.root, &book.location)
    }

    pub(crate) async fn book_to_read(
        &self,
        book: BookId,
    ) -> Result<Option<BookToRead>, LibraryError> {
        Ok(self
            .store
            .database()
            .read(move |connection| book_to_read(connection, book.0))
            .await?)
    }

    pub(crate) async fn book_to_open(
        &self,
        book: BookId,
    ) -> Result<Option<BookToOpen>, LibraryError> {
        let unsaved = match self.reading.save_before_opening(book).await {
            Ok(unsaved) => unsaved,
            Err(error) => {
                tracing::warn!(error = %describe_error(&error), "save the page reached before opening a book");
                None
            }
        };
        let to_open = self
            .store
            .database()
            .read(move |connection| {
                let Some(found) = book_to_read(connection, book.0)? else {
                    return Ok(None);
                };
                Ok(place_in_series(connection, book.0)?.map(|place| BookToOpen { found, place }))
            })
            .await?;
        Ok(to_open.map(|mut to_open| {
            if let Some(unsaved) = unsaved {
                to_open.found.reading = unsaved.stored();
            }
            to_open
        }))
    }

    pub(crate) async fn page_dimensions(
        &self,
        file: BookFileId,
        rev: u32,
    ) -> Result<Option<Vec<Option<PageDimensions>>>, LibraryError> {
        Ok(self
            .store
            .database()
            .read(move |connection| page_dimensions(connection, file, rev))
            .await?)
    }

    pub(crate) async fn store_page_dimensions(
        &self,
        file: BookFileId,
        rev: u32,
        pages: Vec<Option<PageDimensions>>,
    ) -> Result<(), LibraryError> {
        Ok(self
            .store
            .database()
            .write(move |transaction| store_page_dimensions(transaction, file, rev, &pages))
            .await?)
    }

    #[tracing::instrument(skip_all, fields(folder = %id))]
    pub async fn remove_folder(&self, id: FolderId) -> Result<(), LibraryError> {
        let _scanning = self.catalog_change_lock.lock().await;
        self.store
            .database()
            .write(move |transaction| remove_root(transaction, id.0))
            .await?;
        self.note_catalog_written();
        Ok(())
    }

    #[tracing::instrument(skip_all, fields(folder = %id))]
    pub async fn rescan_folder(
        &self,
        id: FolderId,
        on_progress: impl FnMut(ScanProgress) + Send,
    ) -> Result<FolderRescan, LibraryError> {
        let scanning = self.catalog_change_lock.lock().await;
        self.rescan_while_scanning(id, scanning, on_progress).await
    }

    #[tracing::instrument(skip_all)]
    pub async fn rescan_due_folders(
        &self,
        conditions: &impl RescanConditions,
        before_rescanning: impl Future<Output = ()>,
    ) -> Result<Vec<FolderRescan>, LibraryError> {
        let folders = self.listed_folders().await?;
        let ids: Vec<FolderId> = folders.keys().copied().collect();
        let check = Check {
            at_ms: self.store.clock().now_unix_ms(),
            power: conditions.power_mode().await,
        };
        let needing_storage = self.schedule().needing_storage(&ids, check);
        let mut first_seen_on = BTreeMap::new();
        for id in needing_storage {
            if let Some(Some(path)) = folders.get(&id) {
                first_seen_on.insert(id, storage_within_limit(conditions, path).await);
            }
        }
        let due = self.schedule().due(&ids, check, |id| {
            first_seen_on.get(&id).copied().unwrap_or(Storage::Local)
        });
        if due.is_empty() {
            return Ok(Vec::new());
        }
        before_rescanning.await;
        let mut rescans = Vec::new();
        for id in due {
            if !self.schedule_gate.borrow().is_open() {
                tracing::debug!(
                    "leave the folders whose turn came while scheduled rescans are held"
                );
                break;
            }
            let Ok(scanning) = self.catalog_change_lock.try_lock() else {
                tracing::debug!("leave the folders whose turn came until no other scan runs");
                break;
            };
            let rescan = self.rescan_while_scanning(id, scanning, |_| {}).await;
            match unless_removed(rescan) {
                Ok(Some(rescan)) => {
                    self.note_scheduled_rescan(conditions, &folders, &rescan)
                        .await;
                    rescans.push(rescan);
                }
                Ok(None) => {}
                Err(error) => {
                    tracing::warn!(folder = %id, error = %describe_error(&error), "rescan a folder whose turn came");
                    self.schedule().missed(id, self.store.clock().now_unix_ms());
                }
            }
        }
        Ok(rescans)
    }

    pub fn set_scheduled_rescans(&self, is_on: bool) {
        self.schedule_gate
            .send_if_modified(|gate| mem::replace(&mut gate.is_on, is_on) != is_on);
    }

    pub fn set_book_open(&self, is_open: bool) {
        self.schedule_gate
            .send_if_modified(|gate| mem::replace(&mut gate.is_book_open, is_open) != is_open);
    }

    pub async fn rescan_on_schedule<F: Future<Output = ()>>(
        &self,
        conditions: &impl RescanConditions,
        mut before_rescanning: impl FnMut() -> F,
    ) {
        let mut schedule_gate = self.schedule_gate.subscribe();
        let mut checks = interval(SCHEDULE_CHECK_EVERY);
        checks.set_missed_tick_behavior(MissedTickBehavior::Delay);
        loop {
            if schedule_gate.wait_for(|gate| gate.is_open()).await.is_err() {
                return;
            }
            tokio::select! {
                biased;
                _ = schedule_gate.changed() => continue,
                _ = checks.tick() => {}
            }
            if let Err(error) = self
                .rescan_due_folders(conditions, before_rescanning())
                .await
            {
                tracing::warn!(error = %describe_error(&error), "rescan the folders whose turn came");
            }
        }
    }

    async fn rescan_while_scanning(
        &self,
        id: FolderId,
        _scanning: MutexGuard<'_, ()>,
        mut on_progress: impl FnMut(ScanProgress) + Send,
    ) -> Result<FolderRescan, LibraryError> {
        let root = self
            .store
            .database()
            .read(move |connection| library_root(connection, id.0))
            .await?;
        let name = folder_name(&root_folder(&root.locator));
        on_progress(ScanProgress::Finding { found: 0 });
        let outcome = if let Some(files) = self.files_of(&root.locator) {
            self.rescan_files(root.id, root.kind, files, on_progress)
                .await?
        } else {
            tracing::warn!("keep the books of a folder this device can't open");
            RescanOutcome::Unreachable
        };
        self.note_availability(root.id, root.unavailable_since_ms, &outcome)
            .await?;
        Ok(FolderRescan { id, name, outcome })
    }

    async fn rescan_files(
        &self,
        root: RootId,
        kind: RootKind,
        files: RootFiles,
        mut on_progress: impl FnMut(ScanProgress) + Send,
    ) -> Result<RescanOutcome, LibraryError> {
        match walk(
            Arc::clone(&files.storage),
            files.folder.clone(),
            &mut on_progress,
        )
        .await?
        {
            Ok(layout) => {
                let target = self.target(root, kind, files);
                let outcome =
                    rescan(&self.store, target, layout, self.noting_writes(on_progress)).await?;
                if let RescanOutcome::Rescanned(changes) = &outcome
                    && changes.removed > 0
                {
                    self.note_catalog_written();
                }
                Ok(outcome)
            }
            Err(error) => {
                tracing::warn!(%error, "keep the books of a folder the rescan can't read");
                Ok(RescanOutcome::Unreachable)
            }
        }
    }

    #[tracing::instrument(skip_all, fields(folder = %id))]
    pub async fn remove_books_of_emptied_folder(
        &self,
        id: FolderId,
    ) -> Result<BooksRemoval, LibraryError> {
        let _scanning = self.catalog_change_lock.lock().await;
        let database = self.store.database();
        let root = database
            .read(move |connection| library_root(connection, id.0))
            .await?;
        let Some(files) = self.files_of(&root.locator) else {
            return Ok(BooksRemoval::Kept);
        };
        let is_emptied = root.kind == RootKind::Linked
            && matches!(
                walk(files.storage, files.folder, |_| {}).await?,
                Ok(layout) if layout.is_empty()
            );
        if !is_emptied {
            return Ok(BooksRemoval::Kept);
        }
        let removed = database
            .write(move |transaction| {
                let locations: Vec<PathBuf> = root_files(transaction, root.id)?
                    .into_iter()
                    .map(|file| file.location)
                    .collect();
                let held = remove_book_files(transaction, root.id, &locations)?;
                let removed = remove_books_without_files(transaction, &held)?;
                mark_root_available(transaction, root.id)?;
                Ok(removed)
            })
            .await?;
        self.note_catalog_written();
        Ok(BooksRemoval::Removed {
            books: saturating_u32(removed),
        })
    }

    #[tracing::instrument(skip_all)]
    pub async fn restore_folder_access<E: Send + 'static>(
        &self,
        mut resolve: impl FnMut(&AppleBookmark) -> Result<ResolvedBookmark, E> + Send + 'static,
    ) -> Result<Vec<(FolderId, E)>, LibraryError> {
        let bookmarked = self.store.database().read(bookmarked_roots).await?;
        if bookmarked.is_empty() {
            return Ok(Vec::new());
        }
        let resolved = spawn_blocking(move || {
            bookmarked
                .into_iter()
                .map(|root| {
                    let outcome = resolve(&root.bookmark).map(|resolved| ResolvedBookmark {
                        path: canonical_folder(resolved.path),
                        ..resolved
                    });
                    (root, outcome)
                })
                .collect::<Vec<_>>()
        })
        .await?;
        let mut unopened = Vec::new();
        let mut unreachable = Vec::new();
        let mut reopened = Vec::new();
        for (root, outcome) in resolved {
            match outcome {
                Ok(resolved) => reopened.push(Reopened::of(root, resolved)),
                Err(error) => {
                    unreachable.push(AsRead::of(&root));
                    unopened.push((FolderId(root.id), error));
                }
            }
        }
        self.note_reopened(unreachable, reopened).await?;
        Ok(unopened)
    }

    async fn note_reopened(
        &self,
        unreachable: Vec<AsRead>,
        reopened: Vec<Reopened>,
    ) -> Result<(), LibraryError> {
        let since_ms = self.now_ms();
        let _scanning = self.catalog_change_lock.lock().await;
        let changed = self
            .store
            .database()
            .write(move |transaction| {
                note_bookmarks_opened(transaction, &unreachable, &reopened, since_ms)
            })
            .await?;
        if changed {
            self.note_catalog_written();
        }
        Ok(())
    }

    #[tracing::instrument(skip_all)]
    pub async fn rescan_folders(&self) -> Result<Vec<FolderRescan>, LibraryError> {
        let mut rescans = Vec::new();
        for id in self.folder_ids().await? {
            rescans.extend(unless_removed(self.rescan_folder(id, |_| {}).await)?);
        }
        Ok(rescans)
    }

    async fn folder_ids(&self) -> Result<Vec<FolderId>, LibraryError> {
        let folders = self.listed_folders().await?;
        Ok(folders.into_keys().collect())
    }

    async fn note_scheduled_rescan(
        &self,
        conditions: &impl RescanConditions,
        folders: &BTreeMap<FolderId, Option<PathBuf>>,
        rescan: &FolderRescan,
    ) {
        match &rescan.outcome {
            RescanOutcome::Rescanned(_) => {
                let storage = match folders.get(&rescan.id) {
                    Some(Some(path)) => storage_within_limit(conditions, path).await,
                    Some(None) | None => Storage::Local,
                };
                self.schedule()
                    .read(rescan.id, storage, self.store.clock().now_unix_ms());
            }
            RescanOutcome::Unreachable | RescanOutcome::FoundEmpty => {
                self.schedule()
                    .missed(rescan.id, self.store.clock().now_unix_ms());
            }
        }
    }

    async fn listed_folders(&self) -> Result<BTreeMap<FolderId, Option<PathBuf>>, LibraryError> {
        let mut folders = BTreeMap::new();
        let mut after = None;
        loop {
            let request = PageRequest {
                after,
                size: PageSize::try_from(FOLDERS_PER_PAGE)?,
            };
            let page = self
                .store
                .database()
                .read(move |connection| library_roots(connection, &request))
                .await?;
            folders.extend(page.items.into_iter().map(|root| {
                (
                    FolderId(root.id),
                    root.locator.local_path().map(Path::to_path_buf),
                )
            }));
            match page.next {
                Some(next) => after = Some(next),
                None => return Ok(folders),
            }
        }
    }

    #[tracing::instrument(skip_all, fields(%language))]
    pub async fn set_language(&self, language: AppLanguage) -> Result<(), LibraryError> {
        Ok(self.store.sort_titles_for(language.0).await?)
    }

    #[must_use]
    pub fn subscribe(&self) -> broadcast::Receiver<Changed> {
        self.store.subscribe()
    }

    #[must_use]
    pub fn changes(&self) -> LibraryChanges {
        LibraryChanges {
            catalog: self.catalog_writes.subscribe(),
            synced: self.store.subscribe(),
        }
    }

    pub async fn first_launch_finished(&self) -> Result<bool, LibraryError> {
        Ok(self.store.database().read(first_launch_finished).await?)
    }

    #[tracing::instrument(skip_all)]
    pub async fn finish_first_launch(&self) -> Result<(), LibraryError> {
        let finished_at_ms = self.now_ms();
        Ok(self
            .store
            .database()
            .write(move |transaction| finish_first_launch(transaction, finished_at_ms))
            .await?)
    }

    async fn set_home(&self, home: PathBuf) -> Result<(), LibraryError> {
        let home = canonical_folder(home);
        let added_at_ms = self.now_ms();
        self.store
            .database()
            .write(move |transaction| move_home(transaction, &home, added_at_ms))
            .await?;
        Ok(())
    }

    async fn folder_to_read(&self, picked: RootLocator) -> Result<RootLocator, LibraryError> {
        let picked = canonical_locator(picked);
        let Some(home) = self.store.database().read(home_root).await? else {
            return Ok(picked);
        };
        let (folder, home_folder) = (root_folder(&picked), root_folder(&home.locator));
        let is_inside_home = folder != home_folder && folder.starts_with(&home_folder);
        if !is_inside_home {
            return Ok(picked);
        }
        let Some(files) = self.files_of(&picked) else {
            return Ok(picked);
        };
        let folder = files.folder.clone();
        spawn_blocking(move || files.storage.entries(&files.folder))
            .await?
            .map_err(|source| LibraryError::FolderUnreadable {
                path: folder,
                source,
            })?;
        Ok(home.locator)
    }

    async fn link(&self, locator: RootLocator) -> Result<RootId, LibraryError> {
        let root = NewRoot {
            kind: RootKind::Linked,
            locator,
            added_at_ms: self.now_ms(),
        };
        Ok(self
            .store
            .database()
            .write(move |transaction| {
                let id = add_root(transaction, &root)?;
                mark_root_available(transaction, id)?;
                Ok(id)
            })
            .await?)
    }

    async fn note_availability(
        &self,
        root: RootId,
        unavailable_since_ms: Option<i64>,
        outcome: &RescanOutcome,
    ) -> Result<(), LibraryError> {
        let database = self.store.database();
        match (outcome, unavailable_since_ms) {
            (RescanOutcome::Rescanned(_), None)
            | (RescanOutcome::Unreachable | RescanOutcome::FoundEmpty, Some(_)) => {}
            (RescanOutcome::Rescanned(_), Some(_)) => {
                database
                    .write(move |transaction| mark_root_available(transaction, root))
                    .await?;
            }
            (RescanOutcome::Unreachable | RescanOutcome::FoundEmpty, None) => {
                let since_ms = self.now_ms();
                database
                    .write(move |transaction| mark_root_unavailable(transaction, root, since_ms))
                    .await?;
            }
        }
        Ok(())
    }

    fn noting_writes<'a>(
        &'a self,
        mut on_progress: impl FnMut(ScanProgress) + Send + 'a,
    ) -> impl FnMut(ScanProgress) + Send + 'a {
        move |progress| {
            if matches!(progress, ScanProgress::Reading { scanned, .. } if scanned > 0) {
                self.note_catalog_written();
            }
            on_progress(progress);
        }
    }

    fn note_catalog_written(&self) {
        if self.catalog_writes.send(CatalogWritten).is_err() {
            tracing::trace!("no one is listening for library changes");
        }
    }

    fn file_in(&self, locator: &RootLocator, location: &Path) -> Option<FileInStorage> {
        let files = self.files_of(locator)?;
        Some(FileInStorage {
            storage: files.storage,
            path: files.folder.join(location),
        })
    }

    fn files_of(&self, locator: &RootLocator) -> Option<RootFiles> {
        let storage = match locator {
            RootLocator::Path(_) | RootLocator::AppleBookmark { .. } => {
                Arc::clone(&self.local_storage)
            }
            RootLocator::AndroidTree(tree) => self.open_tree.as_ref()?(tree),
        };
        Some(RootFiles {
            storage,
            folder: root_folder(locator),
        })
    }

    fn target(&self, root: RootId, kind: RootKind, files: RootFiles) -> Target {
        Target {
            root,
            kind,
            storage: files.storage,
            folder: files.folder,
            added_at_ms: self.now_ms(),
        }
    }

    fn schedule(&self) -> sync::MutexGuard<'_, RescanSchedule> {
        self.schedule.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn now_ms(&self) -> i64 {
        i64::try_from(self.store.clock().now_unix_ms()).unwrap_or(i64::MAX)
    }
}

/// A network share that went away can leave the question of where a folder is stored unanswered, so no answer in time counts as local.
async fn storage_within_limit(conditions: &impl RescanConditions, folder: &Path) -> Storage {
    timeout(STORAGE_CHECK_TIMEOUT, conditions.storage_of(folder))
        .await
        .unwrap_or_else(|_| {
            tracing::warn!(folder = %folder.display(), "find where a folder is stored in time");
            Storage::Local
        })
}

fn canonical_locator(locator: RootLocator) -> RootLocator {
    match locator {
        RootLocator::Path(path) => RootLocator::Path(canonical_folder(path)),
        RootLocator::AppleBookmark { path, bookmark } => RootLocator::AppleBookmark {
            path: canonical_folder(path),
            bookmark,
        },
        android @ RootLocator::AndroidTree(_) => android,
    }
}

/// Spells a folder reached through Apple's `/private` links, such as `/private/var`, the way the shorter link does.
#[cfg(target_vendor = "apple")]
fn canonical_folder(folder: PathBuf) -> PathBuf {
    match folder.strip_prefix(APPLE_PRIVATE_FOLDER) {
        Ok(linked) if linked.starts_with(APPLE_FOLDER_LINKED_TO_PRIVATE) => {
            Path::new("/").join(linked)
        }
        _ => folder,
    }
}

#[cfg(not(target_vendor = "apple"))]
fn canonical_folder(folder: PathBuf) -> PathBuf {
    folder
}

fn unless_removed(
    rescan: Result<FolderRescan, LibraryError>,
) -> Result<Option<FolderRescan>, LibraryError> {
    match rescan {
        Ok(rescan) => Ok(Some(rescan)),
        Err(LibraryError::FolderNotFound { id }) => {
            tracing::debug!(folder = %id, "skip a folder removed since the rescan listed it");
            Ok(None)
        }
        Err(error) => Err(error),
    }
}

impl From<omnileaf_db::Error> for LibraryError {
    fn from(error: omnileaf_db::Error) -> Self {
        match error {
            omnileaf_db::Error::UnknownRoot { id } => Self::FolderNotFound { id: FolderId(id) },
            omnileaf_db::Error::HomeRoot { id } => Self::HomeFolderKept { id: FolderId(id) },
            omnileaf_db::Error::SearchTooLong { chars, max } => Self::SearchTooLong { chars, max },
            omnileaf_db::Error::CursorForAnotherList => Self::CursorForAnotherList,
            other => Self::Database(other),
        }
    }
}
