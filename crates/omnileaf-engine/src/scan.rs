use std::{collections::BTreeSet, io, path::PathBuf, sync::Arc};

use omnileaf_db::{
    catalog::{ScannedBook, record_scanned_books},
    store::Store,
};
use omnileaf_formats::Storage;
use omnileaf_sync_proto::SeriesId;
use serde::Serialize;
use specta::Type;
use tokio::{sync::watch, task::spawn_blocking};

use crate::{
    LibraryError,
    book_reader::{BOOKS_PER_BATCH, BookReader},
    library_layout::{Layout, find_books, folder_name},
    library_removal::bring_back_marked,
    saturating_u32::saturating_u32,
    scan_target::Target,
    skipped_types::SkippedType,
    unread_books::UnreadBooks,
    unreadable_book::UnreadableBook,
};

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
