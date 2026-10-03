use std::mem;

use omnileaf_db::{
    Database,
    catalog::{
        RootId, StoredFile, record_moved_books, record_scanned_books, remove_book_files,
        remove_books_without_files, root_files,
    },
};
use serde::Serialize;
use specta::Type;
use tokio::task::spawn_blocking;

use crate::{
    FolderId, LibraryError, ScanProgress,
    library_layout::Layout,
    rescan_plan::{Forgetting, Plan, ReadBook, ToRead},
    scan::{BOOKS_PER_BATCH, Target, read_book},
};

/// What a rescan of one library folder found.
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
    /// The folder held no books where the library had some, as an unplugged drive's empty mount point does, so they stay.
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
    pub removed: u32,
    pub unreadable_books: u32,
    pub unreadable_folders: u32,
}

/// Brings the catalog in line with a folder walked successfully, leaving it as it was when the folder looks unplugged.
pub(crate) async fn rescan(
    database: &Database,
    target: Target,
    layout: Layout,
    on_progress: impl FnMut(ScanProgress) + Send,
) -> Result<RescanOutcome, LibraryError> {
    let root = target.root;
    let stored = database
        .read(move |connection| root_files(connection, root))
        .await?;
    if looks_unplugged(&layout, &stored) {
        return Ok(RescanOutcome::FoundEmpty);
    }
    let folder = target.folder.clone();
    let mut plan = spawn_blocking(move || Plan::new(&folder, layout, stored)).await?;
    record_changed(database, &target, &mut plan, on_progress).await?;
    let (changes, forgetting) = plan.finish();
    forget(database, root, forgetting).await?;
    Ok(RescanOutcome::Rescanned(changes))
}

/// No books where the catalog holds some is what an unmounted drive or share looks like, so it never reads as every book deleted.
fn looks_unplugged(layout: &Layout, stored: &[StoredFile]) -> bool {
    layout.books.is_empty() && !stored.is_empty()
}

/// Reads and records the new and changed books in batches of one transaction each, reporting progress after every batch.
async fn record_changed(
    database: &Database,
    target: &Target,
    plan: &mut Plan,
    mut on_progress: impl FnMut(ScanProgress) + Send,
) -> Result<(), LibraryError> {
    let to_read = mem::take(&mut plan.to_read);
    let total = u32::try_from(to_read.len()).unwrap_or(u32::MAX);
    let mut scanned: u32 = 0;
    on_progress(ScanProgress::Reading { scanned, total });
    for batch in to_read.chunks(BOOKS_PER_BATCH) {
        let read = read_batch(target, batch.to_vec()).await?;
        scanned = scanned.saturating_add(u32::try_from(read.len()).unwrap_or(u32::MAX));
        let recording = plan.sort(read);
        database
            .write(move |transaction| {
                record_scanned_books(transaction, &recording.found_again)?;
                record_moved_books(transaction, &recording.moved)
            })
            .await?;
        on_progress(ScanProgress::Reading { scanned, total });
    }
    Ok(())
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

/// Removes the files gone from the folder, then each book left with no file anywhere, in one transaction.
async fn forget(
    database: &Database,
    root: RootId,
    forgetting: Forgetting,
) -> Result<(), LibraryError> {
    if forgetting.is_empty() {
        return Ok(());
    }
    Ok(database
        .write(move |transaction| {
            let mut left = remove_book_files(transaction, root, &forgetting.gone)?;
            left.extend(forgetting.replaced);
            remove_books_without_files(transaction, &left)
        })
        .await?)
}
