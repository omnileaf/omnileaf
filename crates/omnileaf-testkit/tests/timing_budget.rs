use std::time::Duration;

use omnileaf_testkit::TimingBudget;

const NOMINAL: Duration = Duration::from_millis(3);

#[test]
fn enforces_the_nominal_budget_without_a_slack() {
    let budget = TimingBudget::with_slack(NOMINAL, None).unwrap();

    assert_eq!(budget.enforced(), NOMINAL);
}

#[test]
fn enforces_twice_the_budget_with_a_slack_of_2() {
    let budget = TimingBudget::with_slack(NOMINAL, Some("2")).unwrap();

    assert_eq!(budget.enforced(), Duration::from_millis(6));
}

#[test]
fn scales_the_budget_by_a_fractional_slack() {
    let budget = TimingBudget::with_slack(Duration::from_millis(30), Some("1.5")).unwrap();

    assert_eq!(budget.enforced(), Duration::from_millis(45));
}

#[test]
fn rejects_a_slack_that_is_not_a_number() {
    let values = ["", "two", " 2", "2ms", "NaN", "inf"];

    let accepted: Vec<_> = values
        .into_iter()
        .filter(|value| TimingBudget::with_slack(NOMINAL, Some(value)).is_ok())
        .collect();

    assert_eq!(accepted, Vec::<&str>::new());
}

#[test]
fn rejects_a_slack_below_1() {
    let values = ["0.99", "0", "-2"];

    let accepted: Vec<_> = values
        .into_iter()
        .filter(|value| TimingBudget::with_slack(NOMINAL, Some(value)).is_ok())
        .collect();

    assert_eq!(accepted, Vec::<&str>::new());
}

#[test]
fn names_the_variable_and_the_value_it_rejects() {
    let rejected = TimingBudget::with_slack(NOMINAL, Some("two")).unwrap_err();

    assert_eq!(
        rejected.to_string(),
        r#"OMNILEAF_BUDGET_SLACK must be a number of at least 1, but is "two""#
    );
}

#[test]
fn allows_a_time_up_to_the_enforced_budget() {
    let budget = TimingBudget::with_slack(NOMINAL, Some("2")).unwrap();

    assert!(budget.allows(Duration::from_millis(6)));
    assert!(!budget.allows(Duration::from_millis(6) + Duration::from_nanos(1)));
}

#[test]
fn shows_only_the_nominal_budget_when_nothing_scales_it() {
    let budget = TimingBudget::with_slack(NOMINAL, Some("1")).unwrap();

    assert_eq!(budget.to_string(), "3ms budget");
}

#[test]
fn shows_the_nominal_and_the_enforced_budget_when_a_slack_scales_it() {
    let budget = TimingBudget::with_slack(NOMINAL, Some("2")).unwrap();

    assert_eq!(
        budget.to_string(),
        "3ms budget, enforced as 6ms with a slack of 2"
    );
}

#[test]
fn rejects_a_slack_too_large_for_a_duration() {
    let rejected = TimingBudget::with_slack(NOMINAL, Some("1e300")).unwrap_err();

    assert_eq!(
        rejected.to_string(),
        r#"OMNILEAF_BUDGET_SLACK must be a number of at least 1, but is "1e300""#
    );
}
