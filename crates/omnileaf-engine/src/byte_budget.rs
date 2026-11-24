use crate::weighted_semaphore::{Held, WeightedSemaphore};

pub(crate) struct ByteBudget(WeightedSemaphore);

impl ByteBudget {
    pub(crate) const fn new(total: u64) -> Self {
        Self(WeightedSemaphore::new(total))
    }

    pub(crate) fn hold(&self, bytes: u64) -> Held<'_> {
        self.0.hold(bytes)
    }
}
