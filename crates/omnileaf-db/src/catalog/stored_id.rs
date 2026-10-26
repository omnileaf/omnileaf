use omnileaf_sync_proto::IdError;
use rusqlite::{Row, types::Type};

pub(crate) fn stored_id<T>(row: &Row<'_>, column: &str) -> rusqlite::Result<T>
where
    T: for<'bytes> TryFrom<&'bytes [u8], Error = IdError>,
{
    let index = row.as_ref().column_index(column)?;
    T::try_from(row.get_ref(index)?.as_blob()?).map_err(|error| malformed_id(index, error))
}

pub(crate) fn stored_optional_id<T>(row: &Row<'_>, column: &str) -> rusqlite::Result<Option<T>>
where
    T: for<'bytes> TryFrom<&'bytes [u8], Error = IdError>,
{
    let index = row.as_ref().column_index(column)?;
    row.get_ref(index)?
        .as_blob_or_null()?
        .map(|bytes| T::try_from(bytes).map_err(|error| malformed_id(index, error)))
        .transpose()
}

fn malformed_id(index: usize, error: IdError) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(index, Type::Blob, Box::new(error))
}
