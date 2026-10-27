use omnileaf_formats::{Number, NumberRange};

#[test]
fn prints_a_number_as_its_shortest_decimal() {
    let printed: Vec<String> = [12_500, 3_000, 250, 1, 50, 0]
        .map(|thousandths| Number::from_thousandths(thousandths).to_string())
        .into();

    assert_eq!(printed, ["12.5", "3", "0.25", "0.001", "0.05", "0"]);
}

#[test]
fn builds_a_range_only_when_its_last_number_is_not_below_its_first() {
    let one = Number::from_thousandths(1_000);
    let three = Number::from_thousandths(3_000);

    let ranges = [
        NumberRange::new(one, three),
        NumberRange::new(three, three),
        NumberRange::new(three, one),
    ];

    assert_eq!(
        ranges.map(|range| range.map(|range| (range.first(), range.last()))),
        [Some((one, three)), Some((three, three)), None]
    );
}
