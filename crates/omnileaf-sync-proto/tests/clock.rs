#![expect(
    clippy::unwrap_used,
    reason = "the stamps built here are all in range, so a failure should stop the test"
)]

use omnileaf_sync_proto::{ClockError, Hlc};
use proptest::prelude::*;

const LAST_UNIX_MS: u64 = u64::MAX >> 16;

fn stamp(unix_ms: u64, counter: u16) -> Hlc {
    Hlc::new(unix_ms, counter).unwrap()
}

#[test]
fn packs_the_time_above_a_16_bit_counter() {
    let hlc = stamp(1_700_000_000_000, 5);

    assert_eq!(hlc.as_u64(), 1_700_000_000_000 << 16 | 5);
    assert_eq!(hlc.unix_ms(), 1_700_000_000_000);
}

#[test]
fn rejects_a_time_past_48_bits() {
    let hlc = Hlc::new(LAST_UNIX_MS + 1, 0);

    assert_eq!(
        hlc,
        Err(ClockError::OutOfRange {
            unix_ms: LAST_UNIX_MS + 1
        })
    );
}

#[test]
fn a_tick_follows_the_wall_clock_when_it_is_ahead() {
    let next = stamp(1000, 7).tick(2000);

    assert_eq!(next, Ok(stamp(2000, 0)));
}

#[test]
fn a_tick_in_the_same_millisecond_counts_up() {
    let next = stamp(1000, 7).tick(1000);

    assert_eq!(next, Ok(stamp(1000, 8)));
}

#[test]
fn a_tick_never_goes_back_when_the_wall_clock_does() {
    let next = stamp(5000, 2).tick(1000);

    assert_eq!(next, Ok(stamp(5000, 3)));
}

#[test]
fn a_full_counter_moves_on_to_the_next_millisecond() {
    let next = stamp(1000, u16::MAX).tick(1000);

    assert_eq!(next, Ok(stamp(1001, 0)));
}

#[test]
fn the_last_stamp_cannot_tick() {
    let next = Hlc::from(u64::MAX).tick(0);

    assert_eq!(next, Err(ClockError::Exhausted));
}

#[test]
fn a_wall_clock_past_48_bits_cannot_tick() {
    let next = Hlc::ZERO.tick(LAST_UNIX_MS + 1);

    assert_eq!(
        next,
        Err(ClockError::OutOfRange {
            unix_ms: LAST_UNIX_MS + 1
        })
    );
}

#[test]
fn observing_a_later_remote_stamp_moves_the_clock_past_it() {
    let clock = stamp(1000, 1).observe(stamp(3000, 4));

    assert_eq!(clock.tick(2000), Ok(stamp(3000, 5)));
}

#[test]
fn observing_an_earlier_remote_stamp_changes_nothing() {
    let clock = stamp(3000, 4).observe(stamp(1000, 9));

    assert_eq!(clock, stamp(3000, 4));
}

#[derive(Clone, Debug)]
enum Event {
    Tick(u64),
    Observe(u64),
}

fn events() -> impl Strategy<Value = Vec<Event>> {
    let unix_ms = 0..1_u64 << 44;
    let event = prop_oneof![
        unix_ms.clone().prop_map(Event::Tick),
        (unix_ms, any::<u16>())
            .prop_map(|(ms, counter)| Event::Observe(ms << 16 | u64::from(counter))),
    ];
    prop::collection::vec(event, 1..64)
}

proptest! {
    #[test]
    fn every_tick_is_later_than_all_it_has_seen(start in 0..1_u64 << 60, events in events()) {
        let mut clock = Hlc::from(start);
        let mut latest_seen = clock;

        for event in events {
            match event {
                Event::Tick(now) => {
                    let next = clock.tick(now).unwrap();
                    prop_assert!(next > latest_seen);
                    prop_assert!(next.unix_ms() >= now);
                    clock = next;
                    latest_seen = next;
                }
                Event::Observe(remote) => {
                    clock = clock.observe(Hlc::from(remote));
                    prop_assert!(clock >= latest_seen);
                    latest_seen = latest_seen.max(Hlc::from(remote));
                }
            }
        }
    }
}
