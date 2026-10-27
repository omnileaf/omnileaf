use omnileaf_db::catalog::Numbering;

use crate::{BookNumber, NumberRange};

const THOUSANDTHS_PER_VOLUME: u32 = 1000;

/// The whole volumes absent from one, or from nought when a volume 0 is present, up to the highest whole volume present, merged into runs.
pub(crate) fn missing_volumes(placed: &[Numbering]) -> Vec<NumberRange> {
    let mut present: Vec<(u32, u32)> = placed.iter().filter_map(whole_volumes).collect();
    present.sort_unstable();
    let mut next = match present.first() {
        Some(&(0, _)) => 0,
        Some(_) => 1,
        None => return Vec::new(),
    };
    let mut missing = Vec::new();
    for (first, last) in present {
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

fn whole_volumes(numbering: &Numbering) -> Option<(u32, u32)> {
    let (first, last) = match *numbering {
        Numbering::Volume { numbers } => (numbers.value.first(), numbers.value.last()),
        Numbering::Chapter {
            volume: Some(volume),
            ..
        } => (volume.value, volume.value),
        Numbering::Chapter { volume: None, .. } | Numbering::Special { .. } => return None,
    };
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

    fn placed_volumes() -> impl Strategy<Value = Vec<(u32, u32)>> {
        proptest::collection::vec((0..40_u32, 0..3_u32), 0..12)
    }

    proptest! {
        #[test]
        fn misses_exactly_the_whole_volumes_up_to_the_highest_that_no_book_holds(
            volumes in placed_volumes(),
        ) {
            let placed: Vec<Numbering> = volumes
                .iter()
                .map(|&(first, length)| volume(first, first + length))
                .collect();
            let present: Vec<u32> = volumes
                .iter()
                .flat_map(|&(first, length)| first..=first + length)
                .collect();
            let start = u32::from(!present.contains(&0));
            let expected: Vec<u32> = present
                .iter()
                .max()
                .map(|&highest| (start..=highest).filter(|n| !present.contains(n)).collect())
                .unwrap_or_default();

            let found = missing_volumes(&placed);

            prop_assert_eq!(whole_numbers(&found), expected);
            prop_assert!(
                found.windows(2).all(|pair| pair[1].first.0 > pair[0].last.0 + ONE),
                "{:?}",
                found
            );
        }
    }
}
