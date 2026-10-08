use omnileaf_db::{
    Database,
    catalog::{
        RootId, RootKind, StoredFile, record_moved_books, record_scanned_books, remove_book_files,
        remove_books_without_files, root_files,
    },
    store::Store,
};
use omnileaf_sync_proto::BookId;
use serde::Serialize;
use specta::Type;
use tokio::task::spawn_blocking;

use crate::{
    FolderId, LibraryError, ScanProgress,
    library_layout::Layout,
    rescan_plan::{Forgetting, Plan, ReadBook, Replacement, ToRead},
    scan::{BOOKS_PER_BATCH, Target, read_book, saturating_u32},
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FolderRescan {
    pub id: FolderId,
    pub name: String,
    pub outcome: RescanOutcome,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RescanOutcome {
    Rescanned(FileChanges),
    /// The folder couldn't be read, so every book found in it before stays.
    Unreachable,
    /// The linked folder held no books where the library had some, as an unplugged drive's empty mount point does, so they stay.
    FoundEmpty,
}

/// The book files a rescan found added, changed, moved or gone since the folder was last read.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileChanges {
    pub added: u32,
    /// Includes a file that now holds another book.
    pub updated: u32,
    /// Found at a new place with the same content, so the book keeps its id and reading state.
    pub moved: u32,
    /// Books left with no file anywhere once theirs here went, so deleting one of two copies removes none.
    pub removed: u32,
    pub unreadable_books: u32,
    /// Books in an archive format this version recognises but can't open yet, such as CBR.
    pub unsupported_books: u32,
    pub unreadable_folders: u32,
}

/// Brings the catalog in line with a folder walked successfully, leaving it as it was when the folder looks unplugged.
pub(crate) async fn rescan(
    store: &Store,
    target: Target,
    layout: Layout,
    on_progress: impl FnMut(ScanProgress) + Send,
) -> Result<RescanOutcome, LibraryError> {
    let database = store.database();
    let root = target.root;
    let stored = database
        .read(move |connection| root_files(connection, root))
        .await?;
    if looks_unplugged(target.kind, &layout, &stored) {
        return Ok(RescanOutcome::FoundEmpty);
    }
    let folder = target.folder.clone();
    let (mut plan, to_read) = spawn_blocking(move || Plan::new(&folder, layout, stored)).await?;
    record_changed(database, &target, &mut plan, to_read, on_progress).await?;
    let (changes, forgetting) = plan.finish();
    carry_reading_states(store, forgetting.replaced.clone()).await?;
    let removed = forget(database, root, forgetting).await?;
    Ok(RescanOutcome::Rescanned(FileChanges { removed, ..changes }))
}

/// No books where the catalog holds some is what an unmounted drive or share looks like, which the home folder holding the open library can never be.
fn looks_unplugged(kind: RootKind, layout: &Layout, stored: &[StoredFile]) -> bool {
    match kind {
        RootKind::Home => false,
        RootKind::Linked => layout.books.is_empty() && !stored.is_empty(),
    }
}

/// Reads and records the new and changed books in batches of one transaction each, reporting progress after every batch.
async fn record_changed(
    database: &Database,
    target: &Target,
    plan: &mut Plan,
    to_read: Vec<ToRead>,
    mut on_progress: impl FnMut(ScanProgress) + Send,
) -> Result<(), LibraryError> {
    let total = saturating_u32(to_read.len());
    let mut scanned: u32 = 0;
    on_progress(ScanProgress::Reading { scanned, total });
    let mut to_read = to_read.into_iter();
    loop {
        let batch: Vec<ToRead> = to_read.by_ref().take(BOOKS_PER_BATCH).collect();
        if batch.is_empty() {
            return Ok(());
        }
        let read = read_batch(target, batch).await?;
        scanned = scanned.saturating_add(saturating_u32(read.len()));
        let recording = plan.sort(read);
        database
            .write(move |transaction| {
                record_scanned_books(transaction, &recording.unmoved)?;
                record_moved_books(transaction, &recording.moved)
            })
            .await?;
        on_progress(ScanProgress::Reading { scanned, total });
    }
}

async fn read_batch(target: &Target, batch: Vec<ToRead>) -> Result<Vec<ReadBook>, LibraryError> {
    let reading = target.clone();
    Ok(spawn_blocking(move || {
        batch
            .into_iter()
            .map(|to_read| ReadBook {
                book: read_book(&to_read.found, &reading),
                replacing: to_read.replacing,
            })
            .collect()
    })
    .await?)
}

/// Gives each book now in a replaced book's file the reading state it had, as synced writes.
async fn carry_reading_states(
    store: &Store,
    replaced: Vec<Replacement>,
) -> Result<(), LibraryError> {
    if replaced.is_empty() {
        return Ok(());
    }
    Ok(store
        .write(move |writer| {
            replaced.iter().try_for_each(|replacement| {
                writer.carry_reading_state(replacement.old, replacement.new)
            })
        })
        .await?)
}

/// Removes the files gone from the folder and each book left with no file anywhere in one transaction, counting only the books whose files went.
async fn forget(
    database: &Database,
    root: RootId,
    forgetting: Forgetting,
) -> Result<u32, LibraryError> {
    if forgetting.is_empty() {
        return Ok(0);
    }
    Ok(database
        .write(move |transaction| {
            let left = remove_book_files(transaction, root, &forgetting.gone)?;
            let removed = remove_books_without_files(transaction, &left)?;
            let replaced: Vec<BookId> = forgetting
                .replaced
                .iter()
                .map(|replacement| replacement.old)
                .collect();
            remove_books_without_files(transaction, &replaced)?;
            Ok(saturating_u32(removed))
        })
        .await?)
}
