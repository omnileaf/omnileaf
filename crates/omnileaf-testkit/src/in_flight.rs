use std::{
    sync::atomic::{AtomicU64, AtomicUsize, Ordering},
    time::Duration,
};

use crate::waiting::wait_until;

#[derive(Debug, Default)]
pub struct InFlight {
    holders: AtomicUsize,
    weight: AtomicU64,
    most_weight: AtomicU64,
}

#[derive(Debug)]
pub struct Entered<'in_flight> {
    in_flight: &'in_flight InFlight,
    weight: u64,
    at_entry: u64,
}

impl InFlight {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            holders: AtomicUsize::new(0),
            weight: AtomicU64::new(0),
            most_weight: AtomicU64::new(0),
        }
    }

    pub fn enter(&self) -> Entered<'_> {
        self.enter_weighted(1)
    }

    pub fn enter_weighted(&self, weight: u64) -> Entered<'_> {
        self.holders.fetch_add(1, Ordering::SeqCst);
        let at_entry = self.weight.fetch_add(weight, Ordering::SeqCst) + weight;
        self.most_weight.fetch_max(at_entry, Ordering::SeqCst);
        Entered {
            in_flight: self,
            weight,
            at_entry,
        }
    }

    #[must_use]
    pub fn most_at_once(&self) -> u64 {
        self.most_weight.load(Ordering::SeqCst)
    }

    pub fn take_most_at_once(&self) -> u64 {
        self.most_weight
            .swap(self.weight.load(Ordering::SeqCst), Ordering::SeqCst)
    }

    #[must_use]
    pub fn has_company(&self) -> bool {
        self.holders.load(Ordering::SeqCst) > 1
    }

    pub fn wait_for_company(&self, longest: Duration) -> bool {
        wait_until(longest, || self.has_company())
    }

    pub fn wait_until_most_at_once_reaches(&self, at_once: u64, longest: Duration) -> bool {
        wait_until(longest, || self.most_at_once() >= at_once)
    }
}

impl Entered<'_> {
    #[must_use]
    pub const fn in_flight_at_entry(&self) -> u64 {
        self.at_entry
    }
}

impl Drop for Entered<'_> {
    fn drop(&mut self) {
        self.in_flight
            .weight
            .fetch_sub(self.weight, Ordering::SeqCst);
        self.in_flight.holders.fetch_sub(1, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use std::{sync::atomic::AtomicBool, thread};

    use super::*;
    use crate::waiting::GENEROUS_WAIT;

    const NO_WAIT: Duration = Duration::ZERO;
    const A_PAIR: u64 = 2;

    #[test]
    fn counts_the_most_entered_at_once() {
        let in_flight = InFlight::new();

        let first = in_flight.enter();
        let second = in_flight.enter();
        drop(first);
        drop(second);
        let _third = in_flight.enter();

        assert_eq!(in_flight.most_at_once(), A_PAIR);
    }

    #[test]
    fn starts_counting_the_most_at_once_afresh_after_it_is_taken() {
        let in_flight = InFlight::new();
        let first = in_flight.enter();
        let second = in_flight.enter();
        drop(first);
        drop(second);

        let taken = in_flight.take_most_at_once();
        let _entered = in_flight.enter();

        assert_eq!((taken, in_flight.most_at_once()), (A_PAIR, 1));
    }

    #[test]
    fn keeps_counting_what_is_still_in_flight_after_the_most_at_once_is_taken() {
        let in_flight = InFlight::new();
        let _first = in_flight.enter();
        let _second = in_flight.enter();

        in_flight.take_most_at_once();

        assert_eq!(in_flight.most_at_once(), A_PAIR);
    }

    #[test]
    fn tells_each_entry_how_many_were_in_flight_when_it_came_in() {
        let in_flight = InFlight::new();

        let first = in_flight.enter();
        let second = in_flight.enter();

        assert_eq!(
            (first.in_flight_at_entry(), second.in_flight_at_entry()),
            (1, A_PAIR)
        );
    }

    #[test]
    fn adds_up_the_weights_of_what_is_in_flight() {
        let in_flight = InFlight::new();

        let _heavy = in_flight.enter_weighted(5);
        let _light = in_flight.enter_weighted(2);

        assert_eq!(in_flight.most_at_once(), 7);
    }

    #[test]
    fn has_company_only_while_a_second_entry_is_in_flight() {
        let in_flight = InFlight::new();
        let first = in_flight.enter();

        let alone = in_flight.has_company();
        let second = in_flight.enter();
        let together = in_flight.has_company();
        drop(second);
        let alone_again = in_flight.has_company();

        assert_eq!((alone, together, alone_again), (false, true, false));
        drop(first);
    }

    #[test]
    fn waits_for_company_until_a_second_entry_comes_in() {
        let in_flight = InFlight::new();
        let _first = in_flight.enter();
        let company_was_seen = AtomicBool::new(false);

        let had_company = thread::scope(|scope| {
            scope.spawn(|| {
                let _second = in_flight.enter();
                wait_until(GENEROUS_WAIT, || company_was_seen.load(Ordering::SeqCst));
            });
            let had_company = in_flight.wait_for_company(GENEROUS_WAIT);
            company_was_seen.store(true, Ordering::SeqCst);
            had_company
        });

        assert!(had_company);
    }

    #[test]
    fn waits_for_a_crowd_until_enough_entries_are_in_flight() {
        let in_flight = InFlight::new();
        let _first = in_flight.enter();
        let crowd_was_seen = AtomicBool::new(false);

        let reached = thread::scope(|scope| {
            scope.spawn(|| {
                let _second = in_flight.enter();
                wait_until(GENEROUS_WAIT, || crowd_was_seen.load(Ordering::SeqCst));
            });
            let reached = in_flight.wait_until_most_at_once_reaches(A_PAIR, GENEROUS_WAIT);
            crowd_was_seen.store(true, Ordering::SeqCst);
            reached
        });

        assert!(reached);
    }

    #[test]
    fn stops_waiting_for_company_at_its_bound() {
        let in_flight = InFlight::new();
        let _alone = in_flight.enter();

        let had_company = in_flight.wait_for_company(NO_WAIT);

        assert!(!had_company);
    }

    #[test]
    fn stops_waiting_for_a_crowd_at_its_bound() {
        let in_flight = InFlight::new();
        let _alone = in_flight.enter();

        let reached = in_flight.wait_until_most_at_once_reaches(A_PAIR, NO_WAIT);

        assert!(!reached);
    }
}
