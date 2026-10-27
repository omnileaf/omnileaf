use omnileaf_db::catalog::{BookDetails, NamedSeries};
use omnileaf_sync_proto::KeyError;

const COMICS: &str = "comics";

pub(crate) fn series_named_in_files(
    details: &BookDetails,
    added_at_ms: i64,
) -> Result<Option<NamedSeries>, KeyError> {
    details
        .series
        .as_ref()
        .map(|title| NamedSeries::new(COMICS, title, added_at_ms))
        .transpose()
}
