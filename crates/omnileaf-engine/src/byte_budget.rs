use std::sync::{Condvar, Mutex, MutexGuard, PoisonError};

pub(crate) struct ByteBudget {
    total: u64,
    free: Mutex<u64>,
    released: Condvar,
}

pub(crate) struct BudgetedBytes<'budget> {
    budget: &'budget ByteBudget,
    bytes: u64,
}

impl ByteBudget {
    pub(crate) const fn new(total: u64) -> Self {
        Self {
            total,
            free: Mutex::new(total),
            released: Condvar::new(),
        }
    }

    pub(crate) fn hold(&self, bytes: u64) -> BudgetedBytes<'_> {
        let bytes = bytes.min(self.total);
        let mut free = self.free();
        while *free < bytes {
            free = self
                .released
                .wait(free)
                .unwrap_or_else(PoisonError::into_inner);
        }
        *free -= bytes;
        BudgetedBytes {
            budget: self,
            bytes,
        }
    }

    fn free(&self) -> MutexGuard<'_, u64> {
        self.free.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl Drop for BudgetedBytes<'_> {
    fn drop(&mut self) {
        *self.budget.free() += self.bytes;
        self.budget.released.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{
            Arc,
            atomic::{AtomicU64, Ordering},
            mpsc,
        },
        thread,
        time::Duration,
    };

    use super::*;

    const TOTAL: u64 = 10;
    const MOST_OF_IT: u64 = 6;
    const HOLDERS: u64 = 8;
    const WORK_STEPS: usize = 1000;
    const LONGEST_WAIT: Duration = Duration::from_secs(5);
    const LONG_ENOUGH_TO_GET_IN: Duration = Duration::from_millis(200);

    #[test]
    fn holds_no_more_bytes_at_once_than_its_total() {
        let budget = ByteBudget::new(TOTAL);
        let held = AtomicU64::new(0);
        let most_held = AtomicU64::new(0);

        thread::scope(|scope| {
            for bytes in 1..=HOLDERS {
                let (budget, held, most_held) = (&budget, &held, &most_held);
                scope.spawn(move || {
                    let _bytes = budget.hold(bytes);
                    let now = held.fetch_add(bytes, Ordering::SeqCst) + bytes;
                    most_held.fetch_max(now, Ordering::SeqCst);
                    for _ in 0..WORK_STEPS {
                        thread::yield_now();
                    }
                    held.fetch_sub(bytes, Ordering::SeqCst);
                });
            }
        });

        assert!(most_held.load(Ordering::SeqCst) <= TOTAL);
    }

    fn holding_in_the_background(budget: &Arc<ByteBudget>, bytes: u64) -> mpsc::Receiver<()> {
        let budget = Arc::clone(budget);
        let (got_in, has_got_in) = mpsc::channel();
        thread::spawn(move || {
            let _bytes = budget.hold(bytes);
            got_in.send(()).unwrap();
        });
        has_got_in
    }

    #[test]
    fn makes_a_holder_wait_until_enough_bytes_are_freed() {
        let budget = Arc::new(ByteBudget::new(TOTAL));
        let first = budget.hold(MOST_OF_IT);

        let has_got_in = holding_in_the_background(&budget, MOST_OF_IT);

        let got_in_early = has_got_in.recv_timeout(LONG_ENOUGH_TO_GET_IN).is_ok();
        drop(first);
        assert!(!got_in_early);
        assert!(has_got_in.recv_timeout(LONGEST_WAIT).is_ok());
    }

    #[test]
    fn lets_a_holder_larger_than_the_whole_budget_take_all_of_it() {
        let budget = Arc::new(ByteBudget::new(TOTAL));

        let has_got_in = holding_in_the_background(&budget, TOTAL + 1);

        assert!(has_got_in.recv_timeout(LONGEST_WAIT).is_ok());
    }
}
