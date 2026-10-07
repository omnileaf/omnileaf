#![expect(
    clippy::unwrap_used,
    reason = "the budgets and sample counts here are fixed, so a failed set-up should stop the test"
)]

use std::{cell::RefCell, num::NonZeroUsize, time::Duration};

use omnileaf_testkit::{Pass, Sampling, SpeedTrial, Statistic, TimingBudget, TrialOutcome};

const BUDGET: Duration = Duration::from_millis(30);

fn millis(values: impl IntoIterator<Item = u64>) -> Vec<Duration> {
    values.into_iter().map(Duration::from_millis).collect()
}

fn repeated(samples: usize, statistic: Statistic) -> SpeedTrial {
    SpeedTrial {
        measured: "a cover",
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(samples).unwrap(),
            statistic,
        },
        budget: TimingBudget::with_slack(BUDGET, None).unwrap(),
    }
}

fn once() -> SpeedTrial {
    SpeedTrial {
        measured: "a first scan",
        sampling: Sampling::Once,
        budget: TimingBudget::with_slack(BUDGET, None).unwrap(),
    }
}

#[test]
fn takes_the_95th_percentile_by_nearest_rank() {
    let hundred = TrialOutcome::from_passes(
        repeated(100, Statistic::Percentile95),
        vec![millis(1..=100)],
    );
    let ten =
        TrialOutcome::from_passes(repeated(10, Statistic::Percentile95), vec![millis(1..=10)]);

    assert_eq!(
        (hundred.fastest(), ten.fastest()),
        (Duration::from_millis(95), Duration::from_millis(10))
    );
}

#[test]
fn takes_the_middle_sample_as_the_median() {
    let outcome = TrialOutcome::from_passes(
        repeated(31, Statistic::Median),
        vec![millis((1..=31).rev())],
    );

    assert_eq!(outcome.fastest(), Duration::from_millis(16));
}

#[test]
fn takes_the_slowest_sample_when_every_sample_must_hold() {
    let outcome =
        TrialOutcome::from_passes(repeated(4, Statistic::Slowest), vec![millis([7, 9, 3, 5])]);

    assert_eq!(outcome.fastest(), Duration::from_millis(9));
}

#[test]
fn gates_on_the_fastest_pass() {
    let outcome = TrialOutcome::from_passes(once(), vec![millis([50]), millis([20]), millis([40])]);

    assert_eq!(
        (outcome.fastest(), outcome.is_within_budget()),
        (Duration::from_millis(20), true)
    );
}

#[test]
fn fails_when_even_the_fastest_pass_is_over_the_budget() {
    let outcome = TrialOutcome::from_passes(once(), vec![millis([50]), millis([31]), millis([40])]);

    assert!(!outcome.is_within_budget());
}

#[test]
fn allows_a_fastest_pass_exactly_at_the_enforced_budget() {
    let outcome = TrialOutcome::from_passes(once(), vec![millis([30]), millis([45]), millis([60])]);

    assert!(outcome.is_within_budget());
}

#[tokio::test]
async fn sets_up_a_warm_up_and_three_timed_passes() {
    let passes = RefCell::new(Vec::new());

    once()
        .run(async |pass| passes.borrow_mut().push(pass), async |()| {})
        .await;

    assert_eq!(
        passes.into_inner(),
        vec![Pass::WarmUp, Pass::Timed(1), Pass::Timed(2), Pass::Timed(3)]
    );
}

#[tokio::test]
async fn takes_as_many_samples_as_each_pass_asks_for() {
    let samples = RefCell::new(0);

    repeated(5, Statistic::Median)
        .run(async |_| (), async |()| *samples.borrow_mut() += 1)
        .await;

    assert_eq!(samples.into_inner(), 4 * 5);
}

struct LoggedPass<'log> {
    pass: Pass,
    log: &'log RefCell<Vec<String>>,
}

impl Drop for LoggedPass<'_> {
    fn drop(&mut self) {
        self.log.borrow_mut().push(format!("drop {}", self.pass));
    }
}

#[tokio::test]
async fn drops_each_pass_before_setting_up_the_next() {
    let log = RefCell::new(Vec::new());

    once()
        .run(
            async |pass| {
                log.borrow_mut().push(format!("set up {pass}"));
                LoggedPass { pass, log: &log }
            },
            async |_| {},
        )
        .await;

    assert_eq!(
        log.into_inner(),
        [
            "set up warm-up",
            "drop warm-up",
            "set up 1",
            "drop 1",
            "set up 2",
            "drop 2",
            "set up 3",
            "drop 3"
        ]
    );
}

#[tokio::test]
async fn keeps_the_warm_up_out_of_the_outcome() {
    let outcome = once().run(async |_| (), async |()| {}).await;

    let shown = outcome.to_string();

    assert_eq!(
        (
            shown.contains("pass 3"),
            shown.contains("pass 4"),
            shown.contains("warm-up")
        ),
        (true, false, false)
    );
}

#[test]
fn shows_every_pass_and_the_fastest_against_the_budget() {
    let outcome = TrialOutcome::from_passes(
        repeated(3, Statistic::Percentile95),
        vec![
            millis([10, 50, 60]),
            millis([5, 20, 25]),
            millis([8, 40, 41]),
        ],
    );

    assert_eq!(
        outcome.to_string(),
        "a cover: p95 25ms in the fastest of 3 passes of 3 samples \
         (pass 1: median 50ms, p95 60ms, slowest 60ms; \
         pass 2: median 20ms, p95 25ms, slowest 25ms; \
         pass 3: median 40ms, p95 41ms, slowest 41ms), \
         within the 30ms budget"
    );
}

#[test]
fn shows_a_single_sample_pass_by_its_time_alone() {
    let outcome = TrialOutcome::from_passes(once(), vec![millis([50]), millis([31]), millis([40])]);

    assert_eq!(
        outcome.to_string(),
        "a first scan: 31ms in the fastest of 3 passes (pass 1: 50ms; pass 2: 31ms; pass 3: 40ms), \
         over the 30ms budget"
    );
}
