use omnileaf_sync_proto::IdError;
use rusqlite::{Row, types::Type};

/// Fails the row rather than trust a stored id that isn't a derived one.
pub(crate) fn stored_id<T>(row: &Row<'_>, index: usize) -> rusqlite::Result<T>
where
    T: for<'bytes> TryFrom<&'bytes [u8], Error = IdError>,
{
    T::try_from(row.get_ref(index)?.as_blob()?).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(index, Type::Blob, Box::new(error))
    })
}
