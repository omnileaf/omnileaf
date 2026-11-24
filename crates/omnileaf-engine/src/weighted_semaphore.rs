use std::sync::{Condvar, Mutex, MutexGuard, PoisonError};

pub(crate) struct WeightedSemaphore {
    total: u64,
    free: Mutex<u64>,
    released: Condvar,
}

pub(crate) struct Held<'semaphore> {
    semaphore: &'semaphore WeightedSemaphore,
    units: u64,
}

impl WeightedSemaphore {
    pub(crate) const fn new(total: u64) -> Self {
        Self {
            total,
            free: Mutex::new(total),
            released: Condvar::new(),
        }
    }

    pub(crate) fn hold(&self, units: u64) -> Held<'_> {
        let units = units.min(self.total);
        let mut free = self.free();
        while *free < units {
            free = self
                .released
                .wait(free)
                .unwrap_or_else(PoisonError::into_inner);
        }
        *free -= units;
        Held {
            semaphore: self,
            units,
        }
    }

    pub(crate) fn hold_all(&self) -> Held<'_> {
        self.hold(self.total)
    }

    fn free(&self) -> MutexGuard<'_, u64> {
        self.free.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl Drop for Held<'_> {
    fn drop(&mut self) {
        *self.semaphore.free() += self.units;
        self.semaphore.released.notify_all();
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

    fn most_units_held_at_once(semaphore: &WeightedSemaphore, weights: &[u64]) -> u64 {
        let held = AtomicU64::new(0);
        let most_held = AtomicU64::new(0);

        thread::scope(|scope| {
            for &units in weights {
                let (held, most_held) = (&held, &most_held);
                scope.spawn(move || {
                    let _units = semaphore.hold(units);
                    let now = held.fetch_add(units, Ordering::SeqCst) + units;
                    most_held.fetch_max(now, Ordering::SeqCst);
                    for _ in 0..WORK_STEPS {
                        thread::yield_now();
                    }
                    held.fetch_sub(units, Ordering::SeqCst);
                });
            }
        });

        most_held.load(Ordering::SeqCst)
    }

    #[test]
    fn holds_no_more_units_at_once_than_its_total() {
        let semaphore = WeightedSemaphore::new(TOTAL);
        let weights: Vec<u64> = (1..=HOLDERS).collect();

        let most_held = most_units_held_at_once(&semaphore, &weights);

        assert!(most_held <= TOTAL, "held {most_held} at once");
    }

    #[test]
    fn runs_one_holder_at_a_time_when_it_has_one_unit() {
        let semaphore = WeightedSemaphore::new(1);
        let weights = vec![1; usize::try_from(HOLDERS).unwrap()];

        let most_held = most_units_held_at_once(&semaphore, &weights);

        assert_eq!(most_held, 1);
    }

    fn holding_in_the_background(
        semaphore: &Arc<WeightedSemaphore>,
        units: u64,
    ) -> mpsc::Receiver<()> {
        let semaphore = Arc::clone(semaphore);
        let (got_in, has_got_in) = mpsc::channel();
        thread::spawn(move || {
            let _units = semaphore.hold(units);
            got_in.send(()).unwrap();
        });
        has_got_in
    }

    #[test]
    fn makes_a_holder_wait_until_enough_units_are_freed() {
        let semaphore = Arc::new(WeightedSemaphore::new(TOTAL));
        let first = semaphore.hold(MOST_OF_IT);

        let has_got_in = holding_in_the_background(&semaphore, MOST_OF_IT);

        let got_in_early = has_got_in.recv_timeout(LONG_ENOUGH_TO_GET_IN).is_ok();
        drop(first);
        assert!(!got_in_early);
        assert!(has_got_in.recv_timeout(LONGEST_WAIT).is_ok());
    }

    #[test]
    fn lets_a_holder_larger_than_the_total_take_all_of_it() {
        let semaphore = Arc::new(WeightedSemaphore::new(TOTAL));

        let has_got_in = holding_in_the_background(&semaphore, TOTAL + 1);

        assert!(has_got_in.recv_timeout(LONGEST_WAIT).is_ok());
    }

    #[test]
    fn keeps_every_other_holder_out_while_one_holds_all() {
        let semaphore = Arc::new(WeightedSemaphore::new(TOTAL));
        let all = semaphore.hold_all();

        let has_got_in = holding_in_the_background(&semaphore, 1);

        let got_in_early = has_got_in.recv_timeout(LONG_ENOUGH_TO_GET_IN).is_ok();
        drop(all);
        assert!(!got_in_early);
        assert!(has_got_in.recv_timeout(LONGEST_WAIT).is_ok());
    }
}
