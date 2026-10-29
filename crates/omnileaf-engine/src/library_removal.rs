use std::{
    collections::BTreeSet,
    io,
    path::{Component, Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use omnileaf_db::{
    Database, Error,
    catalog::{BookFileToRemove, RootLocator, ScannedBook, books_of_series, removed_among},
    rusqlite::Connection,
    store::Store,
};
use omnileaf_formats::Storage;
use omnileaf_sync_proto::BookId as StoredBookId;
use serde::{Deserialize, Serialize};
use specta::Type;
use tokio::{task::spawn_blocking, time::timeout};

use crate::{
    BookId, LibraryError, SeriesId,
    file_disposal::{Disposal, DisposalFailure, FileDisposal},
    scan::{FileStamp, UnreadableBook, saturating_u32},
};

const FILE_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
const FILE_DISPOSAL_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RemovalTarget {
    Series { id: SeriesId },
    Book { id: BookId },
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RemovalReport {
    pub removed_series: u32,
    pub removed_books: u32,
    pub files: Vec<FileRemoval>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileRemoval {
    pub book: BookId,
    pub name: String,
    pub outcome: FileOutcome,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FileOutcome {
    Trashed,
    Deleted,
    Missing,
    Failed { reason: RemovalFailure },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum RemovalFailure {
    PermissionDenied,
    Locked,
    UnsupportedLocation,
    Other,
}

pub(crate) struct Expanded {
    pub(crate) books: Vec<StoredBookId>,
    pub(crate) series_held: u32,
}

pub(crate) fn expand(
    connection: &Connection,
    targets: &[RemovalTarget],
) -> Result<Expanded, Error> {
    let mut books = BTreeSet::new();
    let mut series_held = BTreeSet::new();
    for target in targets {
        match target {
            RemovalTarget::Book { id } => {
                books.insert(id.0);
            }
            RemovalTarget::Series { id } => {
                let held = books_of_series(connection, id.0)?;
                if !held.is_empty() {
                    series_held.insert(id.0);
                }
                books.extend(held);
            }
        }
    }
    Ok(Expanded {
        books: books.into_iter().collect(),
        series_held: saturating_u32(series_held.len()),
    })
}

pub(crate) async fn removal_of(
    file: &BookFileToRemove,
    root: Option<(&Arc<dyn Storage>, &Path)>,
    disposal: &impl FileDisposal,
) -> FileRemoval {
    let outcome = match root {
        Some((storage, folder)) => {
            FileOutcome::from(dispose_file(storage, folder, file, disposal).await)
        }
        None => FileOutcome::from(DisposalFailure::Unsupported),
    };
    FileRemoval {
        book: BookId(file.book),
        name: file_name(&file.location),
        outcome,
    }
}

pub(crate) async fn is_reachable(storage: &Arc<dyn Storage>, folder: &Path) -> bool {
    let (storage, listed_folder) = (Arc::clone(storage), folder.to_path_buf());
    let Ok(listed) = blocking_within(
        FILE_CHECK_TIMEOUT,
        DisposalFailure::Unsupported,
        move || storage.entries(&listed_folder),
    )
    .await
    else {
        return false;
    };
    match listed {
        Ok(entries) if !entries.is_empty() => true,
        Ok(_) => {
            tracing::warn!(folder = %folder.display(), "remove files from a folder that lists as empty");
            false
        }
        Err(error) => {
            tracing::warn!(folder = %folder.display(), %error, "read a folder to remove files from");
            false
        }
    }
}

async fn dispose_file(
    storage: &Arc<dyn Storage>,
    folder: &Path,
    file: &BookFileToRemove,
    disposal: &impl FileDisposal,
) -> Result<Disposal, DisposalFailure> {
    let Some(path) = inside(folder, &file.location) else {
        tracing::warn!(book = %file.book, "skip a file stored outside its folder");
        return Err(DisposalFailure::Other);
    };
    still_the_scanned_file(storage, &path, file).await?;
    let disposed = match file.root {
        RootLocator::AndroidTree(_) => remove_through(storage, &path).await,
        RootLocator::Path(_) | RootLocator::AppleBookmark { .. } => {
            dispose_within(disposal, &path).await
        }
    };
    match disposed {
        Err(DisposalFailure::NotFound) => Err(failure_after_not_found(storage, &path).await),
        disposed => disposed,
    }
}

async fn failure_after_not_found(storage: &Arc<dyn Storage>, path: &Path) -> DisposalFailure {
    let (storage, path) = (Arc::clone(storage), path.to_path_buf());
    match blocking_within(
        FILE_CHECK_TIMEOUT,
        DisposalFailure::Unsupported,
        move || storage.details(&path),
    )
    .await
    {
        Ok(Err(error)) if error.kind() == io::ErrorKind::NotFound => DisposalFailure::NotFound,
        Ok(_) | Err(_) => DisposalFailure::Other,
    }
}

fn inside(folder: &Path, location: &Path) -> Option<PathBuf> {
    let mut parts = location.components().peekable();
    let names_something = parts.peek().is_some();
    let stays_inside = parts.all(|part| matches!(part, Component::Normal(_)));
    (names_something && stays_inside).then(|| folder.join(location))
}

async fn remove_through(
    storage: &Arc<dyn Storage>,
    path: &Path,
) -> Result<Disposal, DisposalFailure> {
    let (storage, path) = (Arc::clone(storage), path.to_path_buf());
    blocking_within(FILE_DISPOSAL_TIMEOUT, DisposalFailure::Other, move || {
        storage.remove(&path)
    })
    .await?
    .map(|()| Disposal::Deleted)
    .map_err(|error| DisposalFailure::from(error.kind()))
}

/// A blocking call stuck on a dead network mount cannot be cancelled, so giving up on it leaves its thread running until the mount answers.
async fn blocking_within<T: Send + 'static>(
    limit: Duration,
    when_stuck: DisposalFailure,
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, DisposalFailure> {
    let abandoned = Arc::new(AtomicBool::new(false));
    let abandoned_by_caller = Arc::clone(&abandoned);
    let mut task = spawn_blocking(move || {
        if abandoned_by_caller.load(Ordering::Acquire) {
            return None;
        }
        Some(work())
    });
    match timeout(limit, &mut task).await {
        Ok(Ok(Some(done))) => Ok(done),
        Ok(Ok(None)) => Err(when_stuck),
        Ok(Err(error)) => {
            tracing::warn!(%error, "run blocking work on a file to remove");
            Err(DisposalFailure::Other)
        }
        Err(_) => {
            abandoned.store(true, Ordering::Release);
            task.abort();
            tracing::warn!(
                limit_ms = limit.as_millis(),
                "wait for blocking work on a file to remove"
            );
            Err(when_stuck)
        }
    }
}

/// A trash call stuck on a dead network mount cannot be cancelled, so giving up on it leaves its thread running until the mount answers.
async fn dispose_within(
    disposal: &impl FileDisposal,
    path: &Path,
) -> Result<Disposal, DisposalFailure> {
    timeout(FILE_DISPOSAL_TIMEOUT, disposal.dispose(path))
        .await
        .unwrap_or_else(|_| {
            tracing::warn!(file = %path.display(), "wait for a file to be disposed of");
            Err(DisposalFailure::Other)
        })
}

async fn still_the_scanned_file(
    storage: &Arc<dyn Storage>,
    path: &Path,
    file: &BookFileToRemove,
) -> Result<(), DisposalFailure> {
    let (storage, path) = (Arc::clone(storage), path.to_path_buf());
    let stamp = blocking_within(
        FILE_CHECK_TIMEOUT,
        DisposalFailure::Unsupported,
        move || FileStamp::read(&storage, &path),
    )
    .await?
    .map_err(|error| {
        tracing::warn!(book = %file.book, %error, "read a file to remove");
        failure_reading(&error)
    })?;
    let scanned = FileStamp {
        size_bytes: file.size_bytes,
        modified_at_ms: file.modified_at_ms,
    };
    if stamp == scanned {
        return Ok(());
    }
    tracing::warn!(book = %file.book, "skip a file that changed since the scan");
    Err(DisposalFailure::Other)
}

fn failure_reading(error: &UnreadableBook) -> DisposalFailure {
    match error {
        UnreadableBook::Metadata(error) => DisposalFailure::from(error.kind()),
        UnreadableBook::Format(_)
        | UnreadableBook::HiddenType(_)
        | UnreadableBook::UnsupportedType { .. }
        | UnreadableBook::SeriesName(_)
        | UnreadableBook::OutsideFolder(_) => DisposalFailure::Other,
    }
}

fn file_name(location: &Path) -> String {
    location
        .file_name()
        .unwrap_or(location.as_os_str())
        .to_string_lossy()
        .into_owned()
}

impl From<Result<Disposal, DisposalFailure>> for FileOutcome {
    fn from(disposed: Result<Disposal, DisposalFailure>) -> Self {
        match disposed {
            Ok(Disposal::Trashed) => Self::Trashed,
            Ok(Disposal::Deleted) => Self::Deleted,
            Err(failure) => Self::from(failure),
        }
    }
}

impl From<DisposalFailure> for FileOutcome {
    fn from(failure: DisposalFailure) -> Self {
        let reason = match failure {
            DisposalFailure::NotFound => return Self::Missing,
            DisposalFailure::PermissionDenied => RemovalFailure::PermissionDenied,
            DisposalFailure::Locked => RemovalFailure::Locked,
            DisposalFailure::Unsupported => RemovalFailure::UnsupportedLocation,
            DisposalFailure::Other => RemovalFailure::Other,
        };
        Self::Failed { reason }
    }
}

pub(crate) async fn marked_among<'a>(
    database: &Database,
    books: impl IntoIterator<Item = &'a ScannedBook>,
) -> Result<BTreeSet<StoredBookId>, LibraryError> {
    let found: Vec<StoredBookId> = books
        .into_iter()
        .map(|book| StoredBookId::local(&book.fingerprint))
        .collect();
    if found.is_empty() {
        return Ok(BTreeSet::new());
    }
    Ok(database
        .read(move |connection| removed_among(connection, &found))
        .await?)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum RemovedBooks {
    LeftOut,
    BringingBackUnder(Vec<PathBuf>),
}

pub(crate) async fn bring_back_marked(
    store: &Store,
    books: &[ScannedBook],
) -> Result<(), LibraryError> {
    let marked = marked_among(store.database(), books).await?;
    restore(store, marked).await
}

pub(crate) async fn marked_to_leave_out<'a>(
    store: &Store,
    removed: &RemovedBooks,
    books: impl IntoIterator<Item = &'a ScannedBook>,
) -> Result<BTreeSet<StoredBookId>, LibraryError> {
    let batch: Vec<&ScannedBook> = books.into_iter().collect();
    let marked = marked_among(store.database(), batch.iter().copied()).await?;
    match removed {
        RemovedBooks::LeftOut => Ok(marked),
        RemovedBooks::BringingBackUnder(destinations) => {
            let under = found_under(&batch, destinations);
            let (bring_back, leave_out) = marked.into_iter().partition(|id| under.contains(id));
            restore(store, bring_back).await?;
            Ok(leave_out)
        }
    }
}

fn found_under(books: &[&ScannedBook], destinations: &[PathBuf]) -> BTreeSet<StoredBookId> {
    books
        .iter()
        .filter(|book| {
            destinations
                .iter()
                .any(|destination| book.file.location.starts_with(destination))
        })
        .map(|book| StoredBookId::local(&book.fingerprint))
        .collect()
}

async fn restore(store: &Store, marked: BTreeSet<StoredBookId>) -> Result<(), LibraryError> {
    if marked.is_empty() {
        return Ok(());
    }
    let marked: Vec<StoredBookId> = marked.into_iter().collect();
    store
        .write(move |writer| writer.restore_removed(&marked))
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use omnileaf_db::{
        Config, Database,
        catalog::{
            BookDetails, BookFile, NewRoot, NewSeries, RootId, RootKind, RootLocator, add_root,
        },
        rusqlite::{Connection, OpenFlags},
    };
    use omnileaf_sync_proto::{Fingerprint, ImageEntry};
    use omnileaf_testkit::ScratchFolder;

    use super::*;
    use crate::SystemClock;

    fn data_version(connection: &Connection) -> i64 {
        connection
            .pragma_query_value(None, "data_version", |row| row.get(0))
            .unwrap()
    }

    fn unmarked_book(root: RootId, crc32: u32) -> ScannedBook {
        ScannedBook {
            series: NewSeries::local("Sample Series 01", 0).unwrap(),
            named_series: None,
            fingerprint: Fingerprint::pmf1([ImageEntry { crc32, size: 100 }]).unwrap(),
            title: format!("Volume {crc32:02}"),
            added_at_ms: 0,
            page_count: 1,
            details: BookDetails::default(),
            file: BookFile {
                root,
                location: format!("Sample Series 01/Volume {crc32:02}.cbz").into(),
                size_bytes: 100,
                modified_at_ms: 0,
            },
            numbering: None,
            name_language: None,
        }
    }

    #[tokio::test]
    async fn opens_no_write_transaction_when_no_found_book_is_marked() {
        let folder = ScratchFolder::new("bring-back-none-marked");
        let file = folder.path().join("library.sqlite");
        let database = Database::open(&Config {
            path: file.clone(),
            backup_dir: folder.path().join("backups"),
            mmap_size_bytes: 0,
        })
        .unwrap();
        let root = database
            .write(|transaction| {
                add_root(
                    transaction,
                    &NewRoot {
                        kind: RootKind::Linked,
                        locator: RootLocator::Path(PathBuf::from("/media/Comics")),
                        added_at_ms: 0,
                    },
                )
            })
            .await
            .unwrap();
        let store = Store::new(database, SystemClock);
        let watching =
            Connection::open_with_flags(&file, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
        let before = data_version(&watching);

        bring_back_marked(&store, &[unmarked_book(root, 1), unmarked_book(root, 2)])
            .await
            .unwrap();

        assert_eq!(data_version(&watching), before);
    }

    fn series_id() -> SeriesId {
        SeriesId(omnileaf_sync_proto::SeriesId::local("Sample Series 01").unwrap())
    }

    fn book_id(crc32: u32) -> BookId {
        BookId(StoredBookId::local(
            &Fingerprint::pmf1([ImageEntry { crc32, size: 100 }]).unwrap(),
        ))
    }

    #[test]
    fn reads_a_removal_target_tagged_by_its_kind_from_the_interface() {
        let series = serde_json::json!({ "kind": "series", "id": series_id() });
        let book = serde_json::json!({ "kind": "book", "id": book_id(1) });

        let read = (
            serde_json::from_value::<RemovalTarget>(series).unwrap(),
            serde_json::from_value::<RemovalTarget>(book).unwrap(),
        );

        assert_eq!(
            read,
            (
                RemovalTarget::Series { id: series_id() },
                RemovalTarget::Book { id: book_id(1) }
            )
        );
    }

    #[test]
    fn sends_a_removal_report_in_camel_case_with_counts_as_numbers() {
        let report = RemovalReport {
            removed_series: 2,
            removed_books: 5,
            files: vec![FileRemoval {
                book: book_id(1),
                name: "Volume 01.cbz".to_owned(),
                outcome: FileOutcome::Trashed,
            }],
        };

        let sent = serde_json::to_value(report).unwrap();

        assert_eq!(
            sent,
            serde_json::json!({
                "removedSeries": 2,
                "removedBooks": 5,
                "files": [{
                    "book": book_id(1),
                    "name": "Volume 01.cbz",
                    "outcome": { "kind": "trashed" },
                }],
            })
        );
    }

    #[test]
    fn sends_each_file_outcome_tagged_by_its_kind_with_a_failure_reason() {
        let outcomes = [
            FileOutcome::Trashed,
            FileOutcome::Deleted,
            FileOutcome::Missing,
            FileOutcome::Failed {
                reason: RemovalFailure::PermissionDenied,
            },
            FileOutcome::Failed {
                reason: RemovalFailure::Locked,
            },
            FileOutcome::Failed {
                reason: RemovalFailure::UnsupportedLocation,
            },
            FileOutcome::Failed {
                reason: RemovalFailure::Other,
            },
        ];

        let sent = serde_json::to_value(outcomes).unwrap();

        assert_eq!(
            sent,
            serde_json::json!([
                { "kind": "trashed" },
                { "kind": "deleted" },
                { "kind": "missing" },
                { "kind": "failed", "reason": "permissionDenied" },
                { "kind": "failed", "reason": "locked" },
                { "kind": "failed", "reason": "unsupportedLocation" },
                { "kind": "failed", "reason": "other" },
            ])
        );
    }
}
