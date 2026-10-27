use std::{
    collections::VecDeque,
    sync::{Arc, Mutex, MutexGuard, PoisonError, RwLock},
};

use omnileaf_formats::{Book, Damage, FormatError, Limits, salvage_book_in};
use omnileaf_imaging::BookSideBorders;
use omnileaf_sync_proto::BookId;

use crate::{PageCrop, PagePath, file_in_storage::FileInStorage};

/// How many books stay open at once, enough to go back and forth between a few without reading their archives' directories again.
const KEPT_OPEN: usize = 4;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) struct BookFileAt {
    pub(crate) book: BookId,
    pub(crate) rev: u32,
}

#[derive(Clone)]
pub(crate) struct OpenBook {
    pub(crate) file: BookFileAt,
    pub(crate) page_count: usize,
    pub(crate) damage: Option<Damage>,
    book: Arc<Mutex<Book>>,
    side_borders: Arc<Mutex<Option<BookSideBorders>>>,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct PageAt {
    pub(crate) path: PagePath,
    pub(crate) index: usize,
}

#[derive(Default)]
pub(crate) struct LastOpened(RwLock<Option<BookFileAt>>);

impl LastOpened {
    pub(crate) fn record(&self, file: BookFileAt) {
        *self.0.write().unwrap_or_else(PoisonError::into_inner) = Some(file);
    }

    pub(crate) fn is_other_than(&self, file: BookFileAt) -> bool {
        self.0
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .is_some_and(|last| last != file)
    }
}

/// The books opened last, most recent first.
#[derive(Default)]
pub(crate) struct OpenBooks(Mutex<VecDeque<OpenBook>>);

impl OpenBook {
    pub(crate) fn page(&self, index: u32) -> Option<PageAt> {
        let at = usize::try_from(index)
            .ok()
            .filter(|at| *at < self.page_count)?;
        Some(PageAt {
            path: PagePath {
                book: self.file.book,
                rev: self.file.rev,
                index,
                crop: PageCrop::Whole,
            },
            index: at,
        })
    }

    pub(crate) fn lock(&self) -> MutexGuard<'_, Book> {
        self.book.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub(crate) fn side_borders_once<E>(
        &self,
        measure: impl FnOnce() -> Result<BookSideBorders, E>,
    ) -> Result<BookSideBorders, E> {
        let mut settled = self
            .side_borders
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        if let Some(book) = *settled {
            return Ok(book);
        }
        let book = measure()?;
        *settled = Some(book);
        Ok(book)
    }
}

impl OpenBooks {
    /// The book if it is still open, which makes it the most recently used.
    pub(crate) fn get(&self, file: BookFileAt) -> Option<OpenBook> {
        let mut opened = self.opened();
        let position = opened.iter().position(|book| book.file == file)?;
        let book = opened.remove(position)?;
        opened.push_front(book.clone());
        Some(book)
    }

    pub(crate) fn open(
        &self,
        file: BookFileAt,
        stored: &FileInStorage,
    ) -> Result<OpenBook, FormatError> {
        if let Some(book) = self.get(file) {
            return Ok(book);
        }
        let book = salvage_book_in(&stored.storage, &stored.path, &Limits::default())?;
        let opened = OpenBook {
            file,
            page_count: book.pages().len(),
            damage: book.damage(),
            book: Arc::new(Mutex::new(book)),
            side_borders: Arc::default(),
        };
        let mut kept = self.opened();
        kept.retain(|book| book.file != file);
        kept.push_front(opened.clone());
        kept.truncate(KEPT_OPEN);
        Ok(opened)
    }

    fn opened(&self) -> MutexGuard<'_, VecDeque<OpenBook>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}
