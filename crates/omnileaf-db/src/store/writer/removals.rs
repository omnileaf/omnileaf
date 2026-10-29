use omnileaf_sync_proto::{BookId, MergeClass, Value};

use super::Writer;
use crate::{Error, catalog::removed_among, store::key::RemovalKey};

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

    fn is_removed(&self, book: BookId) -> Result<bool, Error> {
        Ok(removed_among(self.connection, &[book])?.contains(&book))
    }
}
