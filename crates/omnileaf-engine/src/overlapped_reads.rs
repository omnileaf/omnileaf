use std::{
    error::Error,
    io, iter,
    num::NonZeroUsize,
    panic,
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
    thread,
};

const READER_NAME: &str = "omnileaf-book-reader";

pub(crate) fn read_at_most<T: Sync, R: Send>(
    books: &[T],
    at_once: NonZeroUsize,
    read: impl Fn(&T) -> R + Sync,
) -> Vec<R> {
    let queue = &Queue::of(books);
    let read = &read;
    let mut read_books = thread::scope(|scope| {
        let readers: Vec<_> = (1..at_once.get().min(books.len()))
            .map_while(|_| {
                thread::Builder::new()
                    .name(READER_NAME.to_owned())
                    .spawn_scoped(scope, move || queue.read_all(read))
                    .inspect_err(warn_reader_not_started)
                    .ok()
            })
            .collect();
        let mut read_books = queue.read_all(read);
        for reader in readers {
            read_books.extend(
                reader
                    .join()
                    .unwrap_or_else(|stop| panic::resume_unwind(stop)),
            );
        }
        read_books
    });
    read_books.sort_unstable_by_key(|(index, _)| *index);
    read_books.into_iter().map(|(_, book)| book).collect()
}

fn warn_reader_not_started(error: &io::Error) {
    tracing::warn!(
        error = error as &dyn Error,
        "start another book reader, so fewer books are read at once"
    );
}

struct Queue<'books, T> {
    books: &'books [T],
    next: AtomicUsize,
    is_stopping: AtomicBool,
}

struct StopOnPanic<'queue>(&'queue AtomicBool);

impl Drop for StopOnPanic<'_> {
    fn drop(&mut self) {
        if thread::panicking() {
            self.0.store(true, Ordering::Relaxed);
        }
    }
}

impl<'books, T> Queue<'books, T> {
    fn of(books: &'books [T]) -> Self {
        Self {
            books,
            next: AtomicUsize::new(0),
            is_stopping: AtomicBool::new(false),
        }
    }

    fn take(&self) -> Option<(usize, &'books T)> {
        if self.is_stopping.load(Ordering::Relaxed) {
            return None;
        }
        let index = self.next.fetch_add(1, Ordering::Relaxed);
        self.books.get(index).map(|book| (index, book))
    }

    fn read_all<R>(&self, read: impl Fn(&T) -> R) -> Vec<(usize, R)> {
        iter::from_fn(|| self.take())
            .map(|(index, book)| {
                let _stop_on_panic = StopOnPanic(&self.is_stopping);
                (index, read(book))
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use omnileaf_testkit::{InFlight, wait_until, yield_times};

    use super::*;

    const BOOKS: usize = 100;
    const WORK_STEPS: usize = 1000;
    const SMALL_BOUND: NonZeroUsize = NonZeroUsize::MIN.saturating_add(2);
    const ONE_AT_A_TIME: NonZeroUsize = NonZeroUsize::MIN;
    const LONGEST_WAIT: Duration = Duration::from_secs(2);
    const FIRST_BOOK: usize = 0;
    const UNREADABLE_BOOK: usize = 0;

    struct FlagOnDrop<'flag>(&'flag AtomicBool);

    impl Drop for FlagOnDrop<'_> {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }

    #[test]
    fn hands_back_each_read_in_the_order_of_the_books_whatever_order_they_finish_in() {
        let books: Vec<usize> = (0..BOOKS).collect();
        let finished = AtomicUsize::new(0);

        let read = read_at_most(&books, SMALL_BOUND, |&book| {
            if book == FIRST_BOOK {
                wait_until(LONGEST_WAIT, || finished.load(Ordering::SeqCst) > 0);
            }
            finished.fetch_add(1, Ordering::SeqCst);
            book * 2
        });

        assert_eq!(read, books.iter().map(|book| book * 2).collect::<Vec<_>>());
    }

    #[test]
    fn reads_no_more_books_at_once_than_its_bound() {
        let books: Vec<usize> = (0..BOOKS).collect();
        let reading = InFlight::new();

        let read = read_at_most(&books, SMALL_BOUND, |_| {
            let _reading = reading.enter();
            yield_times(WORK_STEPS);
        });

        assert_eq!(read.len(), BOOKS);
        let most_at_once = reading.most_at_once();
        assert!(
            most_at_once <= SMALL_BOUND.get() as u64,
            "read {most_at_once} at once"
        );
    }

    #[test]
    fn reads_as_many_books_at_once_as_its_bound() {
        let books: Vec<usize> = (0..SMALL_BOUND.get()).collect();
        let started = AtomicUsize::new(0);
        let gave_up = AtomicBool::new(false);
        let deadline = Instant::now() + LONGEST_WAIT;

        let saw_every_read_start = read_at_most(&books, SMALL_BOUND, |_| {
            started.fetch_add(1, Ordering::SeqCst);
            while started.load(Ordering::SeqCst) < books.len() && !gave_up.load(Ordering::SeqCst) {
                if Instant::now() > deadline {
                    gave_up.store(true, Ordering::SeqCst);
                }
                thread::yield_now();
            }
            started.load(Ordering::SeqCst) == books.len()
        });

        assert_eq!(saw_every_read_start, vec![true; SMALL_BOUND.get()]);
    }

    #[test]
    fn reads_every_book_on_the_calling_thread_when_it_may_read_one_at_a_time() {
        let books: Vec<usize> = (0..BOOKS).collect();
        let caller = thread::current().id();

        let read_on = read_at_most(&books, ONE_AT_A_TIME, |_| thread::current().id());

        assert_eq!(read_on, vec![caller; BOOKS]);
    }

    #[test]
    fn reads_nothing_when_there_are_no_books() {
        let books: [usize; 0] = [];

        let read = read_at_most(&books, SMALL_BOUND, |_| {
            unreachable!("there is no book to read")
        });

        assert!(read.is_empty());
    }

    #[test]
    #[should_panic(expected = "a reader fell over")]
    fn passes_on_a_read_that_panics() {
        let books: Vec<usize> = (0..BOOKS).collect();

        read_at_most(&books, SMALL_BOUND, |&book| {
            assert_ne!(book, UNREADABLE_BOOK, "a reader fell over");
        });
    }

    #[test]
    fn stops_reading_once_a_read_panics() {
        let books: Vec<usize> = (0..BOOKS).collect();
        let has_fallen_over = AtomicBool::new(false);
        let reads = AtomicUsize::new(0);

        let outcome = panic::catch_unwind(|| {
            read_at_most(&books, SMALL_BOUND, |&book| {
                if book == UNREADABLE_BOOK {
                    let _tell_the_others = FlagOnDrop(&has_fallen_over);
                    panic!("a reader fell over");
                }
                wait_until(LONGEST_WAIT, || has_fallen_over.load(Ordering::SeqCst));
                reads.fetch_add(1, Ordering::SeqCst);
            })
        });

        assert!(outcome.is_err());
        let reads = reads.load(Ordering::SeqCst);
        assert!(reads < BOOKS - 1, "read {reads} books after one fell over");
    }
}
