use std::ops::RangeInclusive;

use omnileaf_db::catalog::{BookDetails, SeriesNaming, Sourced, ValueSource};

const STORED_SERIES_YEARS: RangeInclusive<u16> = 1000..=2999;

pub(crate) fn trust_files(naming: SeriesNaming, details: &BookDetails) -> SeriesNaming {
    let year_in_files = details
        .year
        .filter(|year| STORED_SERIES_YEARS.contains(year))
        .map(|value| Sourced {
            value,
            source: ValueSource::Files,
        });
    SeriesNaming {
        year: year_in_files.or(naming.year),
        ..naming
    }
}
