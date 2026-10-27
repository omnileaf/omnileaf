use std::{
    ops::ControlFlow,
    panic,
    sync::{
        Arc, Mutex, PoisonError,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, SyncSender},
    },
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

struct ReadPage {
    index: usize,
    bytes: Vec<u8>,
}

#[derive(Debug, thiserror::Error)]
enum MeasureError {
    #[error("read the book's pages")]
    Read(#[source] FormatError),
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
            keep(cache, book);
            Some(book)
        }
        Err(
            error @ MeasureError::Measure {
                source: ImagingError::Unsupported,
                ..
            },
        ) => {
            tracing::debug!(error = %describe_error(&error), "serve whole for good the long strip of a book with a page whose borders can't be found");
            keep(cache, BookSideBorders::NONE);
            None
        }
        Err(error @ MeasureError::Measure { .. }) => {
            tracing::warn!(error = %describe_error(&error), "measure the side borders of a book's pages, so its long strip is served whole for good");
            keep(cache, BookSideBorders::NONE);
            None
        }
        Err(error @ MeasureError::Read(_)) => {
            tracing::warn!(error = %describe_error(&error), "read a book's pages to measure their side borders, so its long strip is served whole while the book stays open");
            None
        }
    }
}

fn keep(cache: Option<(&DiskCache, &CacheKey)>, book: BookSideBorders) {
    if let Some((cache, key)) = cache
        && let Err(error) = cache.put(key, &book.to_bytes())
    {
        tracing::warn!(error = %describe_error(&error), "keep a book's side borders for next time");
    }
}

fn measured(opened: &OpenBook, decodes: &DecodePermits) -> Result<BookSideBorders, MeasureError> {
    let (sent, pages) = mpsc::sync_channel(DECODES_AT_ONCE);
    let pages = Arc::new(Mutex::new(pages));
    let has_failed = AtomicBool::new(false);
    let has_failed = &has_failed;
    thread::scope(|scope| {
        let measurers: Vec<_> = (0..DECODES_AT_ONCE.min(opened.page_count))
            .map(|_| {
                let pages = Arc::clone(&pages);
                scope.spawn(move || measure_read_pages(&pages, decodes, has_failed))
            })
            .collect();
        drop(pages);
        let read = read_every_page(opened, &sent);
        drop(sent);
        let measured = measurers
            .into_iter()
            .map(|measurer| {
                measurer
                    .join()
                    .unwrap_or_else(|stop| panic::resume_unwind(stop))
            })
            .collect::<Result<Vec<_>, _>>()?;
        read?;
        Ok(BookSideBorders::of_pages(measured.into_iter().flatten()))
    })
}

fn read_every_page(opened: &OpenBook, sent: &SyncSender<ReadPage>) -> Result<(), MeasureError> {
    opened
        .lock()
        .read_every_page(|index, bytes| match sent.send(ReadPage { index, bytes }) {
            Ok(()) => ControlFlow::Continue(()),
            Err(_) => ControlFlow::Break(()),
        })
        .map_err(MeasureError::Read)
}

fn measure_read_pages(
    pages: &Mutex<Receiver<ReadPage>>,
    decodes: &DecodePermits,
    has_failed: &AtomicBool,
) -> Result<Vec<PageSideBorders>, MeasureError> {
    let mut measured = Vec::new();
    while !has_failed.load(Ordering::Relaxed) {
        let Ok(ReadPage { index, bytes }) =
            pages.lock().unwrap_or_else(PoisonError::into_inner).recv()
        else {
            break;
        };
        let _decoding = decodes.hold();
        match measure_side_borders(&bytes) {
            Ok(page) => measured.push(page),
            Err(source) => {
                has_failed.store(true, Ordering::Relaxed);
                return Err(MeasureError::Measure { index, source });
            }
        }
    }
    Ok(measured)
}

fn side_borders_key(file: BookFileAt) -> Result<CacheKey, CacheError> {
    format!("{}-{}-{SIDE_BORDERS}", file.book, file.rev).parse()
}
