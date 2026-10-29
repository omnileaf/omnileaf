use omnileaf_sync_proto::{BookId, MergeClass, Value};

use super::Writer;
use crate::{
    Error,
    catalog::{BookFileToRemove, remove_catalog_rows, removed_among},
    store::key::RemovalKey,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RemovedFromLibrary {
    pub books: usize,
    pub files: Vec<BookFileToRemove>,
}

impl Writer<'_> {
    #[tracing::instrument(skip_all, fields(%book, is_removed))]
    pub fn set_removed(&mut self, book: BookId, is_removed: bool) -> Result<(), Error> {
        if self.is_removed(book)? == is_removed {
            return Ok(());
        }
        self.write(
            RemovalKey::Removed(book).into(),
            MergeClass::LastWriterWins,
            &Value::Bool(is_removed),
        )
    }

    #[tracing::instrument(skip_all, fields(books = books.len()))]
    pub fn remove_books_from_library(
        &mut self,
        books: &[BookId],
    ) -> Result<RemovedFromLibrary, Error> {
        let removed = remove_catalog_rows(self.connection, books)?;
        for book in &removed {
            self.set_removed(book.book, true)?;
        }
        Ok(RemovedFromLibrary {
            books: removed.len(),
            files: removed.into_iter().flat_map(|book| book.files).collect(),
        })
    }

    #[tracing::instrument(skip_all, fields(books = books.len()))]
    pub fn restore_removed(&mut self, books: &[BookId]) -> Result<(), Error> {
        books
            .iter()
            .try_for_each(|book| self.set_removed(*book, false))
    }

    fn is_removed(&self, book: BookId) -> Result<bool, Error> {
        Ok(removed_among(self.connection, &[book])?.contains(&book))
    }
}
