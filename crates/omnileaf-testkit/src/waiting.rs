use std::{
    thread,
    time::{Duration, Instant},
};

pub const GENEROUS_WAIT: Duration = Duration::from_secs(60);

pub fn wait_until(longest: Duration, is_done: impl Fn() -> bool) -> bool {
    let deadline = Instant::now() + longest;
    while !is_done() && Instant::now() < deadline {
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
}
