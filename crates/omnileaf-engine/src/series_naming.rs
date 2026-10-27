use std::ops::RangeInclusive;

use omnileaf_db::catalog::{BookDetails, NewSeries, SeriesNaming, Sourced, ValueSource};
use omnileaf_sync_proto::KeyError;

const STORED_SERIES_YEARS: RangeInclusive<u16> = 1000..=2999;
const COMICS: &str = "comics";

pub(crate) fn trust_files(naming: SeriesNaming, details: &BookDetails) -> SeriesNaming {
    let year_in_files = details
        .year
        .filter(|year| STORED_SERIES_YEARS.contains(year))
        .map(from_files);
    SeriesNaming {
        year: year_in_files.or(naming.year),
        ..naming
    }
}

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
