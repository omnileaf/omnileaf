use std::cmp::Ordering;

use omnileaf_formats::natural_cmp;
use proptest::prelude::*;

fn sorted(names: &[&str]) -> Vec<String> {
    let mut names: Vec<String> = names.iter().map(ToString::to_string).collect();
    names.sort_by(|left, right| natural_cmp(left, right));
    names
}

#[test]
fn orders_numbers_by_their_value() {
    assert_eq!(
        sorted(&["page10.jpg", "page2.jpg", "page1.jpg"]),
        ["page1.jpg", "page2.jpg", "page10.jpg"]
    );
}

#[test]
fn ignores_case() {
    assert_eq!(
        sorted(&["chapter 10", "Chapter 9"]),
        ["Chapter 9", "chapter 10"]
    );
}

#[test]
fn reads_full_width_digits_as_numbers() {
    assert_eq!(sorted(&["１０.png", "２.png"]), ["２.png", "１０.png"]);
}

#[test]
fn puts_fewer_leading_zeros_first_when_the_numbers_are_equal() {
    assert_eq!(
        sorted(&["001.png", "1.png", "01.png"]),
        ["1.png", "01.png", "001.png"]
    );
}

#[test]
fn compares_numbers_longer_than_any_integer_type() {
    assert_eq!(
        sorted(&[
            "x123456789012345678901234567891",
            "x123456789012345678901234567890"
        ]),
        [
            "x123456789012345678901234567890",
            "x123456789012345678901234567891"
        ]
    );
}

#[test]
fn compares_text_after_equal_numbers() {
    assert_eq!(sorted(&["img_01b", "img_01a"]), ["img_01a", "img_01b"]);
}

#[test]
fn treats_only_identical_names_as_equal() {
    assert_eq!(
        natural_cmp("Page 1", "page 1"),
        natural_cmp("Page 1", "page 1")
    );
    assert_ne!(natural_cmp("Page 1", "page 1"), Ordering::Equal);
    assert_eq!(natural_cmp("page 1", "page 1"), Ordering::Equal);
}

proptest! {
    #[test]
    fn reverses_when_the_arguments_swap(left in "\\PC{0,12}", right in "\\PC{0,12}") {
        prop_assert_eq!(natural_cmp(&left, &right), natural_cmp(&right, &left).reverse());
    }

    #[test]
    fn is_equal_only_for_identical_names(left in "\\PC{0,12}", right in "\\PC{0,12}") {
        prop_assert_eq!(natural_cmp(&left, &right) == Ordering::Equal, left == right);
    }

    #[test]
    fn orders_any_three_names_transitively(
        a in "[a-c0-9 ]{0,6}",
        b in "[a-c0-9 ]{0,6}",
        c in "[a-c0-9 ]{0,6}",
    ) {
        if natural_cmp(&a, &b) != Ordering::Greater && natural_cmp(&b, &c) != Ordering::Greater {
            prop_assert_ne!(natural_cmp(&a, &c), Ordering::Greater);
        }
    }
}
