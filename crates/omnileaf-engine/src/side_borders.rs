use std::{
    panic,
    sync::atomic::{AtomicUsize, Ordering},
    thread,
};

use omnileaf_cache::{CacheError, CacheKey, DiskCache};
use omnileaf_formats::FormatError;
use omnileaf_imaging::{BookSideBorders, ImagingError, PageSideBorders, measure_side_borders};

use crate::{
    decode_permits::{DECODES_AT_ONCE, DecodePermits},
    describe_error,
    open_books::{BookFileAt, OpenBook},
};

const SIDE_BORDERS: &str = "side-borders";

#[derive(Debug, thiserror::Error)]
enum MeasureError {
    #[error("read page {index}")]
    Read {
        index: usize,
        #[source]
        source: FormatError,
    },
    #[error("measure the side borders of page {index}")]
    Measure {
        index: usize,
        #[source]
        source: ImagingError,
    },
}

pub(crate) fn book_side_borders(
    opened: &OpenBook,
    decodes: &DecodePermits,
    kept: Option<&DiskCache>,
) -> Option<BookSideBorders> {
    opened.side_borders_once(|| kept_or_measured(opened, decodes, kept))
}

#[tracing::instrument(skip_all, fields(book = %opened.file.book, rev = opened.file.rev))]
fn kept_or_measured(
    opened: &OpenBook,
    decodes: &DecodePermits,
    kept: Option<&DiskCache>,
) -> Option<BookSideBorders> {
    let key = side_borders_key(opened.file)
        .inspect_err(|error| {
            tracing::warn!(error = %describe_error(error), "name a book's side borders in the cache");
        })
        .ok();
    let cache = kept.zip(key.as_ref());
    if let Some(stored) = cache
        .and_then(|(cache, key)| cache.get(key))
        .and_then(|bytes| BookSideBorders::from_bytes(&bytes))
    {
        return Some(stored);
    }
    match measured(opened, decodes) {
        Ok(book) => {
            if let Some((cache, key)) = cache
                && let Err(error) = cache.put(key, &book.to_bytes())
            {
                tracing::warn!(error = %describe_error(&error), "keep a book's side borders for next time");
            }
            Some(book)
        }
        Err(
            error @ MeasureError::Measure {
                source: ImagingError::Unsupported,
                ..
            },
        ) => {
            tracing::debug!(error = %describe_error(&error), "serve whole the long strip of a book with a page whose borders can't be found");
            None
        }
        Err(error) => {
            tracing::warn!(error = %describe_error(&error), "measure the side borders of a book's pages, so its long strip is served whole");
            None
        }
    }
}

fn measured(opened: &OpenBook, decodes: &DecodePermits) -> Result<BookSideBorders, MeasureError> {
    let next = AtomicUsize::new(0);
    let measure_the_rest = || measure_pages_from(&next, opened, decodes);
    let measured = thread::scope(|scope| {
        let measurers: Vec<_> = (0..DECODES_AT_ONCE.min(opened.page_count))
            .map(|_| scope.spawn(measure_the_rest))
            .collect();
        measurers
            .into_iter()
            .map(|measurer| {
                measurer
                    .join()
                    .unwrap_or_else(|stop| panic::resume_unwind(stop))
            })
            .collect::<Result<Vec<_>, _>>()
    })?;
    Ok(BookSideBorders::of_pages(measured.into_iter().flatten()))
}

fn measure_pages_from(
    next: &AtomicUsize,
    opened: &OpenBook,
    decodes: &DecodePermits,
) -> Result<Vec<PageSideBorders>, MeasureError> {
    let mut measured = Vec::new();
    loop {
        let index = next.fetch_add(1, Ordering::Relaxed);
        if index >= opened.page_count {
            return Ok(measured);
        }
        match measure_page(opened, decodes, index) {
            Ok(page) => measured.push(page),
            Err(error) => {
                next.store(opened.page_count, Ordering::Relaxed);
                return Err(error);
            }
        }
    }
}

fn measure_page(
    opened: &OpenBook,
    decodes: &DecodePermits,
    index: usize,
) -> Result<PageSideBorders, MeasureError> {
    let page = opened
        .lock()
        .read_page(index)
        .map_err(|source| MeasureError::Read { index, source })?;
    let _decoding = decodes.hold();
    measure_side_borders(&page).map_err(|source| MeasureError::Measure { index, source })
}

fn side_borders_key(file: BookFileAt) -> Result<CacheKey, CacheError> {
    format!("{}-{}-{SIDE_BORDERS}", file.book, file.rev).parse()
}
