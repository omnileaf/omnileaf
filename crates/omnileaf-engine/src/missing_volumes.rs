use omnileaf_db::catalog::{self, Numbering};

use crate::{BookNumber, NumberRange};

const THOUSANDTHS_PER_VOLUME: u32 = 1000;

/// The whole volumes absent from one, or from nought when a volume 0 is present, up to the whole part of the highest volume present, merged into runs.
pub(crate) fn missing_volumes(placed: &[Numbering]) -> Vec<NumberRange> {
    let Some(highest) = last_volume(placed).map(|last| last.0 / THOUSANDTHS_PER_VOLUME) else {
        return Vec::new();
    };
    let mut present: Vec<(u32, u32)> = placed.iter().filter_map(whole_volumes).collect();
    present.sort_unstable();
    let mut next = match present.first() {
        Some(&(0, _)) => 0,
        _ => 1,
    };
    let past_highest = (highest + 1, highest + 1);
    let mut missing = Vec::new();
    for (first, last) in present.into_iter().chain([past_highest]) {
        if first > next {
            missing.push(NumberRange {
                first: whole_volume(next),
                last: whole_volume(first - 1),
            });
        }
        next = next.max(last.saturating_add(1));
    }
    missing
}

pub(crate) fn last_volume(placed: &[Numbering]) -> Option<BookNumber> {
    placed
        .iter()
        .filter_map(volumes_held)
        .map(|(_, last)| last.into())
        .max()
}

fn volumes_held(numbering: &Numbering) -> Option<(catalog::BookNumber, catalog::BookNumber)> {
    match *numbering {
        Numbering::Volume { numbers } => Some((numbers.value.first(), numbers.value.last())),
        Numbering::Chapter {
            volume: Some(volume),
            ..
        } => Some((volume.value, volume.value)),
        Numbering::Chapter { volume: None, .. } | Numbering::Special { .. } => None,
    }
}

fn whole_volumes(numbering: &Numbering) -> Option<(u32, u32)> {
    let (first, last) = volumes_held(numbering)?;
    let first = first.thousandths().div_ceil(THOUSANDTHS_PER_VOLUME);
    let last = last.thousandths() / THOUSANDTHS_PER_VOLUME;
    (first <= last).then_some((first, last))
}

const fn whole_volume(volume: u32) -> BookNumber {
    BookNumber(volume.saturating_mul(THOUSANDTHS_PER_VOLUME))
}

#[cfg(test)]
mod tests {
    use omnileaf_db::catalog::{self, Sourced, ValueSource};
    use proptest::prelude::*;

    use super::*;

    const ONE: u32 = 1000;

    fn numbers(first: u32, last: u32) -> Sourced<catalog::NumberRange> {
        Sourced {
            value: catalog::NumberRange::new(
                catalog::BookNumber::from_thousandths(first),
                catalog::BookNumber::from_thousandths(last),
            )
            .unwrap(),
            source: ValueSource::FileName,
        }
    }

    fn volume(first: u32, last: u32) -> Numbering {
        Numbering::Volume {
            numbers: numbers(first * ONE, last * ONE),
        }
    }

    fn chapter_in(volume: u32) -> Numbering {
        Numbering::Chapter {
            number: Some(numbers(ONE, ONE)),
            volume: Some(Sourced {
                value: catalog::BookNumber::from_thousandths(volume),
                source: ValueSource::FolderName,
            }),
        }
    }

    fn missing(ranges: &[(u32, u32)]) -> Vec<NumberRange> {
        ranges
            .iter()
            .map(|&(first, last)| NumberRange {
                first: BookNumber(first * ONE),
                last: BookNumber(last * ONE),
            })
            .collect()
    }

    fn whole_numbers(ranges: &[NumberRange]) -> Vec<u32> {
        ranges
            .iter()
            .flat_map(|range| range.first.0 / ONE..=range.last.0 / ONE)
            .collect()
    }

    #[test]
    fn misses_nothing_in_a_series_without_volumes() {
        let placed = [Numbering::Special { number: None }];

        assert_eq!(missing_volumes(&placed), missing(&[]));
    }

    #[test]
    fn merges_the_volumes_missing_from_one_into_runs() {
        let placed = [volume(3, 3), volume(5, 5), volume(9, 9)];

        assert_eq!(missing_volumes(&placed), missing(&[(1, 2), (4, 4), (6, 8)]));
    }

    #[test]
    fn counts_every_volume_a_range_covers_as_present() {
        let placed = [volume(1, 3), volume(6, 7)];

        assert_eq!(missing_volumes(&placed), missing(&[(4, 5)]));
    }

    #[test]
    fn counts_the_volume_a_chapter_is_read_inside_as_present() {
        let placed = [volume(1, 1), chapter_in(2 * ONE), volume(4, 4)];

        assert_eq!(missing_volumes(&placed), missing(&[(3, 3)]));
    }

    #[test]
    fn counts_from_nought_when_a_volume_0_is_present() {
        let placed = [volume(0, 0), volume(3, 3)];

        assert_eq!(missing_volumes(&placed), missing(&[(1, 2)]));
    }

    #[test]
    fn never_fills_a_whole_volume_with_a_decimal_one() {
        let placed = [
            volume(1, 1),
            Numbering::Volume {
                numbers: numbers(2500, 2500),
            },
            chapter_in(3500),
            volume(5, 5),
        ];

        assert_eq!(missing_volumes(&placed), missing(&[(2, 4)]));
    }

    #[test]
    fn misses_every_whole_volume_below_a_decimal_top_volume() {
        let placed = [
            volume(1, 1),
            volume(3, 3),
            Numbering::Volume {
                numbers: numbers(9500, 9500),
            },
        ];

        assert_eq!(missing_volumes(&placed), missing(&[(2, 2), (4, 9)]));
    }

    #[test]
    fn misses_the_whole_volumes_below_a_chapter_read_inside_a_decimal_volume() {
        let placed = [volume(1, 1), chapter_in(3500)];

        assert_eq!(missing_volumes(&placed), missing(&[(2, 3)]));
    }

    #[test]
    fn misses_the_whole_volumes_below_a_series_of_only_decimal_volumes() {
        let placed = [Numbering::Volume {
            numbers: numbers(2500, 2500),
        }];

        assert_eq!(missing_volumes(&placed), missing(&[(1, 2)]));
    }

    #[test]
    fn misses_nothing_below_a_lone_half_volume_before_one() {
        let placed = [Numbering::Volume {
            numbers: numbers(500, 500),
        }];

        assert_eq!(missing_volumes(&placed), missing(&[]));
    }

    #[test]
    fn names_no_last_volume_in_a_series_without_volumes() {
        let placed = [
            Numbering::Special { number: None },
            Numbering::Chapter {
                number: Some(numbers(ONE, ONE)),
                volume: None,
            },
        ];

        assert_eq!(last_volume(&placed), None);
    }

    #[test]
    fn names_the_highest_volume_last_whatever_order_the_books_come_in() {
        let placed = [volume(3, 3), volume(9, 9), volume(5, 5)];

        assert_eq!(last_volume(&placed), Some(BookNumber(9 * ONE)));
    }

    #[test]
    fn names_the_last_number_of_a_range_volume() {
        let placed = [volume(1, 1), volume(5, 6)];

        assert_eq!(last_volume(&placed), Some(BookNumber(6 * ONE)));
    }

    #[test]
    fn names_a_decimal_top_volume_as_it_is() {
        let placed = [
            volume(12, 12),
            Numbering::Volume {
                numbers: numbers(12_500, 12_500),
            },
        ];

        assert_eq!(last_volume(&placed), Some(BookNumber(12_500)));
    }

    #[test]
    fn names_the_volume_a_chapter_is_read_inside_as_the_last_one() {
        let placed = [volume(1, 1), chapter_in(4 * ONE)];

        assert_eq!(last_volume(&placed), Some(BookNumber(4 * ONE)));
    }

    fn placed_volumes() -> impl Strategy<Value = Vec<(u32, u32)>> {
        proptest::collection::vec((0..40_u32, 0..3_u32), 0..12)
    }

    proptest! {
        #[test]
        fn misses_exactly_the_whole_volumes_up_to_the_highest_that_no_book_holds(
            volumes in placed_volumes(),
            decimal in proptest::option::of(1..40_000_u32).prop_filter(
                "a decimal volume",
                |decimal| decimal.is_none_or(|decimal| decimal % ONE != 0),
            ),
        ) {
            let placed: Vec<Numbering> = volumes
                .iter()
                .map(|&(first, length)| volume(first, first + length))
                .chain(decimal.map(|decimal| Numbering::Volume {
                    numbers: numbers(decimal, decimal),
                }))
                .collect();
            let present: Vec<u32> = volumes
                .iter()
                .flat_map(|&(first, length)| first..=first + length)
                .collect();
            let start = u32::from(!present.contains(&0));
            let expected: Vec<u32> = present
                .iter()
                .copied()
                .chain(decimal.map(|decimal| decimal / ONE))
                .max()
                .map(|highest| (start..=highest).filter(|n| !present.contains(n)).collect())
                .unwrap_or_default();

            let found = missing_volumes(&placed);

            prop_assert_eq!(whole_numbers(&found), expected);
            prop_assert!(
                found.windows(2).all(|pair| pair[1].first.0 > pair[0].last.0 + ONE),
                "{:?}",
                found
            );
        }

        #[test]
        fn names_the_highest_volume_present_last_with_every_missing_one_before_it(
            volumes in placed_volumes(),
        ) {
            let placed: Vec<Numbering> = volumes
                .iter()
                .map(|&(first, length)| volume(first, first + length))
                .collect();
            let highest = volumes.iter().map(|&(first, length)| first + length).max();

            let last = last_volume(&placed);

            prop_assert_eq!(last, highest.map(|highest| BookNumber(highest * ONE)));
            prop_assert!(
                missing_volumes(&placed)
                    .iter()
                    .all(|missing| last.is_some_and(|last| missing.last < last)),
                "{:?}",
                last
            );
        }
    }
}
