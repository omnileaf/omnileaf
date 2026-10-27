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
    #[error(transparent)]
    Left(#[from] BookLeft),
}

pub(crate) struct Measuring<'a> {
    pub(crate) decodes: &'a DecodePermits,
    pub(crate) kept: Option<&'a DiskCache>,
    pub(crate) is_left: &'a dyn Fn() -> bool,
}

#[derive(Debug, thiserror::Error)]
#[error("measure the side borders of a book the reader has left")]
pub(crate) struct BookLeft;

pub(crate) fn book_side_borders(
    opened: &OpenBook,
    measuring: &Measuring<'_>,
) -> Result<BookSideBorders, BookLeft> {
    opened.side_borders_once(|| kept_or_measured(opened, measuring))
}

#[tracing::instrument(skip_all, fields(book = %opened.file.book, rev = opened.file.rev))]
fn kept_or_measured(
    opened: &OpenBook,
    measuring: &Measuring<'_>,
) -> Result<BookSideBorders, BookLeft> {
    let key = side_borders_key(opened.file)
        .inspect_err(|error| {
            tracing::warn!(error = %describe_error(error), "name a book's side borders in the cache");
        })
        .ok();
    let cache = measuring.kept.zip(key.as_ref());
    if let Some(stored) = cache
        .and_then(|(cache, key)| cache.get(key))
        .and_then(|bytes| BookSideBorders::from_bytes(&bytes))
    {
        return Ok(stored);
    }
    Ok(match measured(opened, measuring) {
        Ok(book) => {
            keep(cache, book);
            book
        }
        Err(MeasureError::Left(left)) => return Err(left),
        Err(
            error @ MeasureError::Measure {
                source: ImagingError::Unsupported,
                ..
            },
        ) => {
            tracing::debug!(error = %describe_error(&error), "serve whole for good the long strip of a book with a page whose borders can't be found");
            keep(cache, BookSideBorders::NONE);
            BookSideBorders::NONE
        }
        Err(error @ MeasureError::Measure { .. }) => {
            tracing::warn!(error = %describe_error(&error), "measure the side borders of a book's pages, so its long strip is served whole for good");
            keep(cache, BookSideBorders::NONE);
            BookSideBorders::NONE
        }
        Err(error @ MeasureError::Read(_)) => {
            tracing::warn!(error = %describe_error(&error), "read a book's pages to measure their side borders, so its long strip is served whole while the book stays open");
            BookSideBorders::NONE
        }
    })
}

fn keep(cache: Option<(&DiskCache, &CacheKey)>, book: BookSideBorders) {
    if let Some((cache, key)) = cache
        && let Err(error) = cache.put(key, &book.to_bytes())
    {
        tracing::warn!(error = %describe_error(&error), "keep a book's side borders for next time");
    }
}

fn measured(opened: &OpenBook, measuring: &Measuring<'_>) -> Result<BookSideBorders, MeasureError> {
    let (sent, pages) = mpsc::sync_channel(DECODES_AT_ONCE);
    let pages = Arc::new(Mutex::new(pages));
    let is_stopping = AtomicBool::new(false);
    let is_stopping = &is_stopping;
    let decodes = measuring.decodes;
    thread::scope(|scope| {
        let measurers: Vec<_> = (0..DECODES_AT_ONCE.min(opened.page_count))
            .map(|_| {
                let pages = Arc::clone(&pages);
                scope.spawn(move || measure_read_pages(&pages, decodes, is_stopping))
            })
            .collect();
        drop(pages);
        let read = read_every_page(opened, &sent, || {
            let is_left = (measuring.is_left)();
            if is_left {
                is_stopping.store(true, Ordering::Relaxed);
            }
            is_left
        });
        drop(sent);
        let measured = measurers
            .into_iter()
            .map(|measurer| {
                measurer
                    .join()
                    .unwrap_or_else(|stop| panic::resume_unwind(stop))
            })
            .collect::<Result<Vec<_>, _>>();
        read?;
        Ok(BookSideBorders::of_pages(measured?.into_iter().flatten()))
    })
}

fn read_every_page(
    opened: &OpenBook,
    sent: &SyncSender<ReadPage>,
    mut is_left: impl FnMut() -> bool,
) -> Result<(), MeasureError> {
    let mut was_left = false;
    opened
        .lock()
        .read_every_page(|index, bytes| {
            if is_left() {
                was_left = true;
                return ControlFlow::Break(());
            }
            match sent.send(ReadPage { index, bytes }) {
                Ok(()) => ControlFlow::Continue(()),
                Err(_) => ControlFlow::Break(()),
            }
        })
        .map_err(MeasureError::Read)?;
    if was_left {
        return Err(BookLeft.into());
    }
    Ok(())
}

fn measure_read_pages(
    pages: &Mutex<Receiver<ReadPage>>,
    decodes: &DecodePermits,
    is_stopping: &AtomicBool,
) -> Result<Vec<PageSideBorders>, MeasureError> {
    let mut measured = Vec::new();
    while !is_stopping.load(Ordering::Relaxed) {
        let Ok(ReadPage { index, bytes }) =
            pages.lock().unwrap_or_else(PoisonError::into_inner).recv()
        else {
            break;
        };
        let _decoding = decodes.hold();
        match measure_side_borders(&bytes) {
            Ok(page) => measured.push(page),
            Err(source) => {
                is_stopping.store(true, Ordering::Relaxed);
                return Err(MeasureError::Measure { index, source });
            }
        }
    }
    Ok(measured)
}

fn side_borders_key(file: BookFileAt) -> Result<CacheKey, CacheError> {
    format!("{}-{}-{SIDE_BORDERS}", file.book, file.rev).parse()
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, atomic::AtomicUsize};

    use omnileaf_formats::LocalStorage;
    use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry};
    use omnileaf_testkit::{ArchiveEntry, Compression, DrawnScan, ScratchFolder, cbz};

    use super::*;
    use crate::{file_in_storage::FileInStorage, open_books::OpenBooks};

    const PAGES: u64 = 6;
    const SCAN: DrawnScan = DrawnScan {
        width: 400,
        height: 600,
        seed: 3,
        grain: 12,
    };
    const MARGIN: u32 = 40;

    fn scan(seed: u64) -> Vec<u8> {
        let width = u32::from(SCAN.width);
        DrawnScan { seed, ..SCAN }
            .to_jpeg(|column, _| {
                if column < MARGIN || column >= width - MARGIN {
                    [255; 3]
                } else {
                    [40; 3]
                }
            })
            .unwrap()
    }

    fn strip_book(folder: &ScratchFolder) -> OpenBook {
        let entries: Vec<ArchiveEntry> = (0..PAGES)
            .map(|seed| ArchiveEntry {
                name: format!("{seed:03}.jpg"),
                bytes: scan(seed),
            })
            .collect();
        let stored = FileInStorage {
            storage: Arc::new(LocalStorage),
            path: folder.write("book.cbz", &cbz(&entries, Compression::Stored).unwrap()),
        };
        let file = BookFileAt {
            book: BookId::local(&Fingerprint::pmf1([ImageEntry { crc32: 3, size: 1 }]).unwrap()),
            rev: 1,
        };
        OpenBooks::default().open(file, &stored).unwrap()
    }

    #[test]
    fn stops_measuring_a_book_left_partway_and_measures_it_afresh_once_back() {
        let folder = ScratchFolder::new("side-borders-left");
        let opened = strip_book(&folder);
        let decodes = DecodePermits::new(1);
        let pages_read = AtomicUsize::new(0);
        let left_after_the_first_page = || pages_read.fetch_add(1, Ordering::Relaxed) > 0;
        let never_left = || false;

        let left = book_side_borders(
            &opened,
            &Measuring {
                decodes: &decodes,
                kept: None,
                is_left: &left_after_the_first_page,
            },
        );
        let back = book_side_borders(
            &opened,
            &Measuring {
                decodes: &decodes,
                kept: None,
                is_left: &never_left,
            },
        );

        assert!(matches!(left, Err(BookLeft)), "{left:?}");
        assert!(back.is_ok_and(|book| !book.crops_nothing()));
    }
}
