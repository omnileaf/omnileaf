use omnileaf_db::catalog::{BookDetails, NewSeries, SeriesNaming, Sourced, ValueSource};
use omnileaf_sync_proto::KeyError;

const COMICS: &str = "comics";

pub(crate) fn series_named_in_files(
    naming: &SeriesNaming,
    details: &BookDetails,
    added_at_ms: i64,
) -> Result<Option<NewSeries>, KeyError> {
    details
        .series
        .as_ref()
        .map(|title| {
            let naming = SeriesNaming {
                title: from_files(title.clone()),
                year: naming.year,
            };
            NewSeries::named(COMICS, naming, added_at_ms)
        })
        .transpose()
}

const fn from_files<T>(value: T) -> Sourced<T> {
    Sourced {
        value,
        source: ValueSource::Files,
    }
}
