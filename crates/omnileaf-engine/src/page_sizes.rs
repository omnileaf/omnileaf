use std::{
    collections::HashMap,
    ops::Range,
    sync::{Mutex, MutexGuard, PoisonError},
};

use omnileaf_db::catalog::{BookFileId, PageDimensions};
use omnileaf_formats::Book;
use omnileaf_imaging::{ImagingError, page_size};
use tokio::sync::oneshot::{self, error::TryRecvError};

use crate::{
    describe_error,
    open_books::{BookFileAt, OpenBook},
};

/// Each page's size in reading order, unknown for a page whose header couldn't be read or wasn't yet.
pub(crate) type PageSizes = Vec<Option<PageDimensions>>;

/// Enough of a page for its header to give its size, unless metadata comes first and pushes the header further in.
const SIZE_PROBE_BYTES: u64 = 32 * 1024;
const PAGES_KEPT_BEHIND: usize = 1;

pub(crate) fn opening_window(start: usize, ahead: usize, page_count: usize) -> Range<usize> {
    let end = start
        .saturating_add(ahead)
        .saturating_add(1)
        .min(page_count);
    start.saturating_sub(PAGES_KEPT_BEHIND).min(end)..end
}

pub(crate) fn probe_window(book: &mut Book, window: &Range<usize>) -> PageSizes {
    (0..book.pages().len())
        .map(|index| {
            window
                .contains(&index)
                .then(|| probe_size(book, index))
                .flatten()
        })
        .collect()
}

/// Reads the sizes of the pages outside `window`, letting go of the book between pages so a page someone waits for is read in between.
pub(crate) fn fill_sizes(opened: &OpenBook, sizes: PageSizes, window: &Range<usize>) -> PageSizes {
    (0..)
        .zip(sizes)
        .map(|(index, size)| {
            if window.contains(&index) {
                size
            } else {
                probe_size(&mut opened.lock(), index)
            }
        })
        .collect()
}

fn probe_size(book: &mut Book, index: usize) -> Option<PageDimensions> {
    read_size(book, index)
        .inspect_err(|error| {
            tracing::debug!(index, error = %describe_error(error.as_ref()), "read the size of a page");
        })
        .ok()
}

fn read_size(
    book: &mut Book,
    index: usize,
) -> Result<PageDimensions, Box<dyn std::error::Error + Send + Sync>> {
    let start = book.read_page_start(index, SIZE_PROBE_BYTES)?;
    let size = match page_size(&start) {
        Err(ImagingError::Truncated) => page_size(&book.read_page(index)?)?,
        read => read?,
    };
    Ok(PageDimensions {
        width: size.width,
        height: size.height,
    })
}

pub(crate) struct SizeFill {
    pub(crate) file: BookFileId,
    pub(crate) sizes: oneshot::Receiver<PageSizes>,
}

#[derive(Default)]
pub(crate) struct SizeFills(Mutex<HashMap<BookFileAt, SizeFill>>);

impl SizeFills {
    pub(crate) fn insert(&self, book: BookFileAt, fill: SizeFill) {
        self.fills().insert(book, fill);
    }

    pub(crate) fn take(&self, book: BookFileAt) -> Option<SizeFill> {
        self.fills().remove(&book)
    }

    pub(crate) fn take_finished(&self, book: BookFileAt) -> Option<(BookFileId, PageSizes)> {
        let mut fills = self.fills();
        let fill = fills.get_mut(&book)?;
        match fill.sizes.try_recv() {
            Ok(sizes) => {
                let stored_as = fill.file;
                fills.remove(&book);
                Some((stored_as, sizes))
            }
            Err(TryRecvError::Empty) => None,
            Err(TryRecvError::Closed) => {
                fills.remove(&book);
                None
            }
        }
    }

    fn fills(&self) -> MutexGuard<'_, HashMap<BookFileAt, SizeFill>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_page_before_the_start_the_start_and_the_pages_ahead_first() {
        let windows = [
            opening_window(10, 4, 30),
            opening_window(0, 4, 30),
            opening_window(28, 4, 30),
            opening_window(0, 4, 0),
        ];

        assert_eq!(windows, [9..15, 0..5, 27..30, 0..0]);
    }
}
