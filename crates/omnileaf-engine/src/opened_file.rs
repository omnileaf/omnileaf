use std::{
    path::{Path, PathBuf},
    sync::{Arc, PoisonError},
};

use omnileaf_db::{
    catalog::{BookFileId, BookReading, BookToRead, RootLocator},
    store::ReadingState,
};
use omnileaf_formats::{FormatError, Limits, Storage, open_book_in};
use omnileaf_sync_proto::{BookId as StoredBookId, SeriesId as StoredSeriesId};
use serde::Serialize;
use specta::Type;
use tokio::task::spawn_blocking;

use crate::{
    BookId, FileType, FolderScan, Library, LibraryError, ScanProgress,
    file_in_storage::FileInStorage, library_layout::folder_name,
};

/// A book the reader opened from a file outside the library, which the library doesn't list.
pub(crate) type OpenedFiles = std::sync::Mutex<std::collections::HashMap<StoredBookId, OpenedFile>>;

#[derive(Clone, Debug)]
pub(crate) struct OpenedFile {
    storage: Arc<dyn Storage>,
    title: String,
    series_title: String,
    folder: Option<PathBuf>,
    file_name: PathBuf,
    page_count: u32,
}

/// Which book a file opens, and whether the library already holds it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileToRead {
    pub book: BookId,
    pub is_in_library: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum OpenFileError {
    #[error("open {}, a {file_type} file this build can't read", path.display())]
    UnsupportedType {
        path: PathBuf,
        file_type: FileType,
        #[source]
        source: Box<FormatError>,
    },
    #[error("read the file {}", path.display())]
    Unreadable {
        path: PathBuf,
        #[source]
        source: Box<FormatError>,
    },
    #[error("open a file")]
    Library(#[from] LibraryError),
}

impl Library {
    /// Finds the library's book for a file with the same pages, or keeps the file to read without adding it.
    pub async fn open_file(&self, path: PathBuf) -> Result<FileToRead, OpenFileError> {
        self.open_file_in(Arc::clone(&self.local_storage), path)
            .await
    }

    /// Reads a file from `storage` the same way, for a file only that storage can reach.
    #[tracing::instrument(skip_all, fields(path = %path.display()))]
    pub async fn open_file_in(
        &self,
        storage: Arc<dyn Storage>,
        path: PathBuf,
    ) -> Result<FileToRead, OpenFileError> {
        let read_path = path.clone();
        let reading_storage = Arc::clone(&storage);
        let read = spawn_blocking(move || {
            let mut book = open_book_in(reading_storage, &read_path, &Limits::default())?;
            let fingerprint = book.fingerprint()?;
            let pages = book.pages().len();
            Ok::<_, FormatError>((StoredBookId::local(&fingerprint), pages))
        })
        .await
        .map_err(LibraryError::from)?;
        let (book, pages) = read.map_err(|source| match FileType::of(&path) {
            Some(file_type) if file_type.is_unsupported_given(&source) => {
                OpenFileError::UnsupportedType {
                    path: path.clone(),
                    file_type,
                    source: Box::new(source),
                }
            }
            Some(_) | None => OpenFileError::Unreadable {
                path: path.clone(),
                source: Box::new(source),
            },
        })?;
        if self.stored_book_to_read(book).await?.is_some() {
            return Ok(FileToRead {
                book: BookId(book),
                is_in_library: true,
            });
        }
        let folder = path
            .parent()
            .filter(|folder| !folder.as_os_str().is_empty())
            .map(Path::to_path_buf);
        let file_name = PathBuf::from(path.file_name().unwrap_or_default());
        let title = path
            .file_stem()
            .map_or_else(String::new, |stem| stem.to_string_lossy().into_owned());
        let opened = OpenedFile {
            storage,
            series_title: folder.as_deref().map_or_else(|| title.clone(), folder_name),
            title,
            folder,
            file_name,
            page_count: u32::try_from(pages).unwrap_or(u32::MAX),
        };
        self.opened_files
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(book, opened);
        Ok(FileToRead {
            book: BookId(book),
            is_in_library: false,
        })
    }

    /// Fails with [`LibraryError::BookNotFound`] for a book with no folder outside the library to add, such as one the library holds or a document handed over by Android.
    pub async fn add_opened_book_folder(
        &self,
        book: BookId,
        on_progress: impl FnMut(ScanProgress) + Send,
    ) -> Result<FolderScan, LibraryError> {
        let folder = self
            .opened_files
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(&book.0)
            .and_then(|opened| opened.folder.clone())
            .ok_or(LibraryError::BookNotFound { id: book })?;
        self.add_folder(folder, on_progress).await
    }

    pub(crate) async fn opened_file_to_read(&self, book: StoredBookId) -> Option<BookToRead> {
        let opened = self
            .opened_files
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(&book)
            .cloned()?;
        let reading = self.reading_of(book).await;
        Some(BookToRead {
            id: book,
            title: opened.title,
            series: StoredSeriesId::local(&opened.series_title).ok()?,
            series_title: opened.series_title,
            file: BookFileId::UNSTORED,
            rev: 0,
            root: RootLocator::Path(opened.folder.unwrap_or_default()),
            location: opened.file_name,
            reading,
            page_count: Some(opened.page_count),
        })
    }

    pub(crate) fn opened_file_in_storage(&self, book: StoredBookId) -> Option<FileInStorage> {
        let opened = self
            .opened_files
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(&book)
            .cloned()?;
        let path = opened.folder.map_or_else(
            || opened.file_name.clone(),
            |folder| folder.join(&opened.file_name),
        );
        Some(FileInStorage {
            storage: opened.storage,
            path,
        })
    }

    async fn reading_of(&self, book: StoredBookId) -> BookReading {
        let state = self
            .store
            .database()
            .read(move |connection| omnileaf_db::store::reading_state(connection, book))
            .await
            .ok()
            .flatten()
            .unwrap_or_default();
        reading_from(state)
    }
}

fn reading_from(state: ReadingState) -> BookReading {
    match (state.is_read, state.position_page, state.furthest_page) {
        (Some(true), position_page, _) => BookReading::Read { position_page },
        (_, None, None) => BookReading::NotStarted,
        (_, position_page, _) => BookReading::Started { position_page },
    }
}
