use crate::{
    cover_thumbnails,
    device_class::IS_MOBILE,
    pages,
    weighted_semaphore::{Held, WeightedSemaphore},
};

/// One decode at a time on a phone, where a page transcode and a cover decode could each take a whole decode budget beside the page cache, and one per worker elsewhere.
pub(crate) const DECODES_AT_ONCE: usize = if IS_MOBILE {
    1
} else {
    pages::WORKERS.get() + cover_thumbnails::WORKERS.get()
};

pub(crate) struct DecodePermits(WeightedSemaphore);

impl DecodePermits {
    pub(crate) const fn new(count: usize) -> Self {
        Self(WeightedSemaphore::new(count as u64))
    }

    pub(crate) fn hold(&self) -> Held<'_> {
        self.0.hold(1)
    }
}
