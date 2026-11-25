use std::{
    error::Error,
    io, iter,
    num::NonZeroUsize,
    panic,
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
    thread,
};

const READER_NAME: &str = "omnileaf-book-reader";

pub(crate) struct Overlap<R> {
    pub(crate) at_once: NonZeroUsize,
    pub(crate) is_slow: fn(&R) -> bool,
}

pub(crate) struct Overlapped<R> {
    pub(crate) read: Vec<R>,
    pub(crate) in_company: usize,
}

pub(crate) fn read_at_most<T: Sync, R: Send>(
    books: &[T],
    overlap: &Overlap<R>,
    read: impl Fn(&T) -> R + Sync,
) -> Overlapped<R> {
    let queue = &Queue::of(books);
    let read = &read;
    let is_slow = overlap.is_slow;
    let (mut read_books, started_readers) = thread::scope(|scope| {
        let readers: Vec<_> = (1..overlap.at_once.get().min(books.len()))
            .map_while(|_| {
                thread::Builder::new()
                    .name(READER_NAME.to_owned())
                    .spawn_scoped(scope, move || queue.read_overlapped(read, is_slow))
                    .inspect_err(warn_reader_not_started)
                    .ok()
            })
            .collect();
        let started_readers = readers.len();
        let mut read_books = queue.read_overlapped(read, is_slow);
        for reader in readers {
            read_books.extend(
                reader
                    .join()
                    .unwrap_or_else(|stop| panic::resume_unwind(stop)),
            );
        }
        (read_books, started_readers)
    });
    let in_company = if started_readers > 0 {
        read_books.len()
    } else {
        0
    };
    read_books.extend(queue.read_alone(read));
    read_books.sort_unstable_by_key(|(index, _)| *index);
    Overlapped {
        read: read_books.into_iter().map(|(_, book)| book).collect(),
        in_company,
    }
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
    is_overlap_over: AtomicBool,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Overlapping {
    Yes,
    No,
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
            is_overlap_over: AtomicBool::new(false),
        }
    }

    fn take(&self, overlapping: Overlapping) -> Option<(usize, &'books T)> {
        let is_over =
            overlapping == Overlapping::Yes && self.is_overlap_over.load(Ordering::Relaxed);
        if is_over || self.is_stopping.load(Ordering::Relaxed) {
            return None;
        }
        let index = self.next.fetch_add(1, Ordering::Relaxed);
        self.books.get(index).map(|book| (index, book))
    }

    fn read_overlapped<R>(
        &self,
        read: impl Fn(&T) -> R,
        is_slow: fn(&R) -> bool,
    ) -> Vec<(usize, R)> {
        iter::from_fn(|| self.take(Overlapping::Yes))
            .map(|(index, book)| {
                let _stop_on_panic = StopOnPanic(&self.is_stopping);
                let read_book = read(book);
                if is_slow(&read_book) {
                    self.is_overlap_over.store(true, Ordering::Relaxed);
                }
                (index, read_book)
            })
            .collect()
    }

    fn read_alone<R>(&self, read: impl Fn(&T) -> R) -> Vec<(usize, R)> {
        iter::from_fn(|| self.take(Overlapping::No))
            .map(|(index, book)| {
                let _stop_on_panic = StopOnPanic(&self.is_stopping);
                (index, read(book))
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use std::{cell::RefCell, sync::Arc, thread::ThreadId};

    use omnileaf_testkit::{GENEROUS_WAIT, InFlight, wait_until, yield_times};

    use super::*;

    const BOOKS: usize = 100;
    const WORK_STEPS: usize = 1000;
    const SMALL_BOUND: NonZeroUsize = NonZeroUsize::MIN.saturating_add(2);
    const ONE_AT_A_TIME: NonZeroUsize = NonZeroUsize::MIN;
    const FIRST_BOOK: usize = 0;
    const UNREADABLE_BOOK: usize = 0;

    struct RaiseOnDrop(Arc<AtomicBool>);

    impl Drop for RaiseOnDrop {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }

    thread_local! {
        static WHEN_THIS_THREAD_ENDS: RefCell<Option<RaiseOnDrop>> = const { RefCell::new(None) };
    }

    fn raise_when_this_thread_ends(flag: &Arc<AtomicBool>) {
        WHEN_THIS_THREAD_ENDS.with(|slot| {
            *slot.borrow_mut() = Some(RaiseOnDrop(Arc::clone(flag)));
        });
    }

    fn is_an_extra_reader() -> bool {
        thread::current().name() == Some(READER_NAME)
    }

    fn is_first_to_claim(claim: &AtomicBool) -> bool {
        claim
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    fn read_unbroken<T: Sync, R: Send>(
        books: &[T],
        at_once: NonZeroUsize,
        read: impl Fn(&T) -> R + Sync,
    ) -> Vec<R> {
        let overlap = Overlap {
            at_once,
            is_slow: |_| false,
        };
        read_at_most(books, &overlap, read).read
    }

    #[test]
    fn hands_back_each_read_in_the_order_of_the_books_whatever_order_they_finish_in() {
        let books: Vec<usize> = (0..BOOKS).collect();
        let finished = AtomicUsize::new(0);

        let read = read_unbroken(&books, SMALL_BOUND, |&book| {
            if book == FIRST_BOOK {
                wait_until(GENEROUS_WAIT, || finished.load(Ordering::SeqCst) > 0);
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

        let read = read_unbroken(&books, SMALL_BOUND, |_| {
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

        let saw_every_read_start = read_unbroken(&books, SMALL_BOUND, |_| {
            started.fetch_add(1, Ordering::SeqCst);
            wait_until(GENEROUS_WAIT, || {
                started.load(Ordering::SeqCst) == books.len()
            })
        });

        assert_eq!(saw_every_read_start, vec![true; SMALL_BOUND.get()]);
    }

    struct Seen {
        book: usize,
        is_slow: bool,
        in_flight_at_entry: u64,
        entered_after_slow: bool,
        thread: ThreadId,
    }

    fn read_with_an_extra_reader_slow(books: &[usize], at_once: NonZeroUsize) -> Overlapped<Seen> {
        let reading = InFlight::new();
        let slow_reader_has_ended = Arc::new(AtomicBool::new(false));
        let slow_reader_is_claimed = AtomicBool::new(false);
        let overlap = Overlap {
            at_once,
            is_slow: |seen: &Seen| seen.is_slow,
        };

        read_at_most(books, &overlap, |&book| {
            let entered_after_slow = slow_reader_has_ended.load(Ordering::SeqCst);
            let entered = reading.enter();
            let is_slow = is_an_extra_reader() && is_first_to_claim(&slow_reader_is_claimed);
            let seen = Seen {
                book,
                is_slow,
                in_flight_at_entry: entered.in_flight_at_entry(),
                entered_after_slow,
                thread: thread::current().id(),
            };
            if is_slow {
                raise_when_this_thread_ends(&slow_reader_has_ended);
                reading.wait_until_most_at_once_reaches(at_once.get() as u64, GENEROUS_WAIT);
            } else {
                wait_until(GENEROUS_WAIT, || {
                    slow_reader_has_ended.load(Ordering::SeqCst)
                });
            }
            seen
        })
    }

    #[test]
    fn reads_one_book_at_a_time_once_a_read_is_slow() {
        let books: Vec<usize> = (0..BOOKS).collect();

        let Overlapped { read, .. } = read_with_an_extra_reader_slow(&books, SMALL_BOUND);

        let overlapped_after_slow: Vec<usize> = read
            .iter()
            .filter(|seen| seen.entered_after_slow && seen.in_flight_at_entry > 1)
            .map(|seen| seen.book)
            .collect();
        assert_eq!(overlapped_after_slow, Vec::<usize>::new());
    }

    #[test]
    fn reads_what_is_left_on_the_calling_thread_once_a_read_is_slow() {
        let books: Vec<usize> = (0..BOOKS).collect();
        let caller = thread::current().id();

        let Overlapped { read, in_company } = read_with_an_extra_reader_slow(&books, SMALL_BOUND);

        assert_eq!(in_company, SMALL_BOUND.get());
        let read_alone = read.iter().skip(in_company);
        assert!(read_alone.clone().count() > 0);
        assert!(
            read_alone
                .map(|seen| seen.thread)
                .all(|thread| thread == caller)
        );
    }

    #[test]
    fn hands_back_every_read_in_the_order_of_the_books_once_a_read_is_slow() {
        let books: Vec<usize> = (0..BOOKS).collect();

        let Overlapped { read, .. } = read_with_an_extra_reader_slow(&books, SMALL_BOUND);

        assert_eq!(read.iter().map(|seen| seen.book).collect::<Vec<_>>(), books);
    }

    #[test]
    fn counts_every_book_as_read_in_company_when_none_is_slow() {
        let books: Vec<usize> = (0..BOOKS).collect();
        let overlap = Overlap {
            at_once: SMALL_BOUND,
            is_slow: |_: &usize| false,
        };

        let overlapped = read_at_most(&books, &overlap, |&book| book);

        assert_eq!(overlapped.in_company, BOOKS);
    }

    #[test]
    fn counts_no_book_as_read_in_company_when_it_reads_one_at_a_time() {
        let books: Vec<usize> = (0..BOOKS).collect();
        let overlap = Overlap {
            at_once: ONE_AT_A_TIME,
            is_slow: |_: &usize| false,
        };

        let overlapped = read_at_most(&books, &overlap, |&book| book);

        assert_eq!(overlapped.in_company, 0);
    }

    #[test]
    fn reads_every_book_on_the_calling_thread_when_it_may_read_one_at_a_time() {
        let books: Vec<usize> = (0..BOOKS).collect();
        let caller = thread::current().id();

        let read_on = read_unbroken(&books, ONE_AT_A_TIME, |_| thread::current().id());

        assert_eq!(read_on, vec![caller; BOOKS]);
    }

    #[test]
    fn reads_nothing_when_there_are_no_books() {
        let books: [usize; 0] = [];

        let read = read_unbroken(&books, SMALL_BOUND, |_| {
            unreachable!("there is no book to read")
        });

        assert!(read.is_empty());
    }

    #[test]
    #[should_panic(expected = "a reader fell over")]
    fn passes_on_a_read_that_panics() {
        let books: Vec<usize> = (0..BOOKS).collect();

        read_unbroken(&books, SMALL_BOUND, |&book| {
            assert_ne!(book, UNREADABLE_BOOK, "a reader fell over");
        });
    }

    #[test]
    fn stops_reading_once_a_read_panics() {
        let books: Vec<usize> = (0..BOOKS).collect();
        let fallen_reader_has_ended = Arc::new(AtomicBool::new(false));
        let fallen_reader_is_claimed = AtomicBool::new(false);
        let reads = AtomicUsize::new(0);

        let outcome = panic::catch_unwind(|| {
            read_unbroken(&books, SMALL_BOUND, |_| {
                if is_an_extra_reader() && is_first_to_claim(&fallen_reader_is_claimed) {
                    raise_when_this_thread_ends(&fallen_reader_has_ended);
                    panic!("a reader fell over");
                }
                wait_until(GENEROUS_WAIT, || {
                    fallen_reader_has_ended.load(Ordering::SeqCst)
                });
                reads.fetch_add(1, Ordering::SeqCst);
            })
        });

        assert!(outcome.is_err());
        let reads = reads.load(Ordering::SeqCst);
        assert!(
            reads < SMALL_BOUND.get(),
            "read {reads} books after one fell over"
        );
    }
}
