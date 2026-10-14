use std::sync::{Condvar, Mutex, MutexGuard, PoisonError};

use crate::{cover_thumbnails, device_class::IS_MOBILE, pages};

/// One decode at a time on a phone, where a page transcode and a cover decode could each take a whole decode budget beside the page cache, and one per worker elsewhere.
pub(crate) const DECODES_AT_ONCE: usize = if IS_MOBILE {
    1
} else {
    pages::WORKERS.get() + cover_thumbnails::WORKERS.get()
};

/// Bounds how many decodes run at once across the page and cover lanes, since each may take its whole decode budget.
pub(crate) struct DecodePermits {
    free: Mutex<usize>,
    released: Condvar,
}

/// One decode's share of the permits, given back when dropped.
pub(crate) struct DecodePermit<'permits> {
    permits: &'permits DecodePermits,
}

impl DecodePermits {
    pub(crate) const fn new(count: usize) -> Self {
        Self {
            free: Mutex::new(count),
            released: Condvar::new(),
        }
    }

    /// Takes a permit, waiting while every one is held.
    pub(crate) fn hold(&self) -> DecodePermit<'_> {
        let mut free = self.free();
        while *free == 0 {
            free = self
                .released
                .wait(free)
                .unwrap_or_else(PoisonError::into_inner);
        }
        *free -= 1;
        DecodePermit { permits: self }
    }

    fn free(&self) -> MutexGuard<'_, usize> {
        self.free.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl Drop for DecodePermit<'_> {
    fn drop(&mut self) {
        *self.permits.free() += 1;
        self.permits.released.notify_one();
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::atomic::{AtomicUsize, Ordering},
        thread,
    };

    use super::*;

    const DECODERS: usize = 8;
    const WORK_STEPS: usize = 1000;

    #[test]
    fn runs_no_more_decodes_at_once_than_it_has_permits() {
        let permits = DecodePermits::new(1);
        let running = AtomicUsize::new(0);
        let most_at_once = AtomicUsize::new(0);

        thread::scope(|scope| {
            for _ in 0..DECODERS {
                scope.spawn(|| {
                    let _permit = permits.hold();
                    let now = running.fetch_add(1, Ordering::SeqCst) + 1;
                    most_at_once.fetch_max(now, Ordering::SeqCst);
                    for _ in 0..WORK_STEPS {
                        thread::yield_now();
                    }
                    running.fetch_sub(1, Ordering::SeqCst);
                });
            }
        });

        assert_eq!(most_at_once.load(Ordering::SeqCst), 1);
    }
}
