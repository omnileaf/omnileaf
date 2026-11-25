use std::{
    thread,
    time::{Duration, Instant},
};

pub const GENEROUS_WAIT: Duration = Duration::from_secs(60);

#[derive(Clone, Copy, Debug)]
pub struct Deadline(Instant);

impl Deadline {
    #[must_use]
    pub fn after(longest: Duration) -> Self {
        Self(Instant::now() + longest)
    }

    #[must_use]
    pub fn has_passed(self) -> bool {
        Instant::now() >= self.0
    }
}

pub fn wait_until(longest: Duration, is_done: impl Fn() -> bool) -> bool {
    wait_until_deadline(Deadline::after(longest), is_done)
}

pub fn wait_until_deadline(deadline: Deadline, is_done: impl Fn() -> bool) -> bool {
    while !is_done() && !deadline.has_passed() {
        thread::yield_now();
    }
    is_done()
}

pub fn yield_times(steps: usize) {
    for _ in 0..steps {
        thread::yield_now();
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicBool, Ordering};

    use super::*;

    const NO_WAIT: Duration = Duration::ZERO;

    #[test]
    fn stops_waiting_as_soon_as_the_condition_holds() {
        let is_done = AtomicBool::new(false);

        let done = thread::scope(|scope| {
            scope.spawn(|| is_done.store(true, Ordering::SeqCst));
            wait_until(GENEROUS_WAIT, || is_done.load(Ordering::SeqCst))
        });

        assert!(done);
    }

    #[test]
    fn gives_up_at_its_bound_and_says_the_condition_did_not_hold() {
        let done = wait_until(NO_WAIT, || false);

        assert!(!done);
    }

    #[test]
    fn has_passed_once_its_bound_is_over() {
        let deadline = Deadline::after(NO_WAIT);

        assert!(deadline.has_passed());
    }

    #[test]
    fn has_not_passed_before_its_bound_is_over() {
        let deadline = Deadline::after(GENEROUS_WAIT);

        assert!(!deadline.has_passed());
    }

    #[test]
    fn waits_on_one_deadline_for_every_waiter_sharing_it() {
        let deadline = Deadline::after(NO_WAIT);
        let started = Instant::now();

        let outcomes: Vec<bool> = (0..1000)
            .map(|_| wait_until_deadline(deadline, || false))
            .collect();

        assert_eq!(outcomes, vec![false; 1000]);
        assert!(started.elapsed() < GENEROUS_WAIT);
    }

    #[test]
    fn says_the_condition_held_when_it_holds_as_the_deadline_passes() {
        let deadline = Deadline::after(NO_WAIT);

        let done = wait_until_deadline(deadline, || true);

        assert!(done);
    }
}
