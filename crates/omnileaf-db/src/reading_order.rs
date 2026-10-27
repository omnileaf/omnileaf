use crate::{
    book_order::book_order_key,
    catalog::{BookNumber, NumberRange, Numbering},
};

const VOLUMES: u8 = 0;
const CHAPTERS: u8 = 1;
const SPECIALS: u8 = 2;

const VOLUME_BOOK: u8 = 0;
const CHAPTER_IN_VOLUME: u8 = 1;
const OUTSIDE_VOLUMES: u8 = 0;

const NUMBERED: u8 = 0;
const UNNUMBERED: u8 = 1;

const NO_NUMBERS: NumberRange = NumberRange::single(BookNumber::from_thousandths(0));
const PLACE_WIDTH: usize = 3 + 4 * size_of::<u32>();

struct Place {
    section: u8,
    volume: NumberRange,
    entry: u8,
    number: Option<NumberRange>,
}

pub(crate) fn reading_order_key(numbering: Option<&Numbering>, title: &str) -> Vec<u8> {
    let title_key = book_order_key(title);
    let Some(numbering) = numbering else {
        return title_key;
    };
    let mut key = Vec::with_capacity(PLACE_WIDTH + title_key.len());
    Place::of(numbering).push_onto(&mut key);
    key.extend_from_slice(&title_key);
    key
}

impl Place {
    fn of(numbering: &Numbering) -> Self {
        match *numbering {
            Numbering::Volume { numbers } => Self::in_volumes(numbers.value, VOLUME_BOOK, None),
            Numbering::Chapter {
                number,
                volume: Some(volume),
            } => Self::in_volumes(
                NumberRange::single(volume.value),
                CHAPTER_IN_VOLUME,
                number.map(|number| number.value),
            ),
            Numbering::Chapter {
                number,
                volume: None,
            } => Self::outside_volumes(CHAPTERS, number.map(|number| number.value)),
            Numbering::Special { number } => {
                Self::outside_volumes(SPECIALS, number.map(|number| number.value))
            }
        }
    }

    const fn in_volumes(volume: NumberRange, entry: u8, number: Option<NumberRange>) -> Self {
        Self {
            section: VOLUMES,
            volume,
            entry,
            number,
        }
    }

    const fn outside_volumes(section: u8, number: Option<NumberRange>) -> Self {
        Self {
            section,
            volume: NO_NUMBERS,
            entry: OUTSIDE_VOLUMES,
            number,
        }
    }

    fn push_onto(&self, key: &mut Vec<u8>) {
        let (numbered, number) = match self.number {
            Some(number) => (NUMBERED, number),
            None => (UNNUMBERED, NO_NUMBERS),
        };
        key.push(self.section);
        push_number(key, self.volume.first());
        key.push(self.entry);
        push_number(key, self.volume.last());
        key.push(numbered);
        push_number(key, number.first());
        push_number(key, number.last());
    }
}

fn push_number(key: &mut Vec<u8>, number: BookNumber) {
    key.extend_from_slice(&number.thousandths().to_be_bytes());
}

#[cfg(test)]
mod tests {
    use std::cmp::Ordering;

    use proptest::prelude::*;

    use super::*;
    use crate::{
        book_order::book_order_key,
        catalog::{BookNumber, NumberRange, Sourced, ValueSource},
    };

    const TITLE: &str = "[a-c0-9 ]{0,4}";

    fn numbers(first: u32, last: u32) -> Sourced<NumberRange> {
        let range = NumberRange::new(
            BookNumber::from_thousandths(first),
            BookNumber::from_thousandths(last),
        );
        Sourced {
            value: range.unwrap(),
            source: ValueSource::FileName,
        }
    }

    fn volume(first: u32, last: u32) -> Numbering {
        Numbering::Volume {
            numbers: numbers(first, last),
        }
    }

    fn chapter(number: Option<u32>) -> Numbering {
        Numbering::Chapter {
            number: number.map(|number| numbers(number, number)),
            volume: None,
        }
    }

    fn chapter_in(volume: u32, number: Option<u32>) -> Numbering {
        Numbering::Chapter {
            number: number.map(|number| numbers(number, number)),
            volume: Some(Sourced {
                value: BookNumber::from_thousandths(volume),
                source: ValueSource::FolderName,
            }),
        }
    }

    fn special(number: Option<u32>) -> Numbering {
        Numbering::Special {
            number: number.map(|number| numbers(number, number)),
        }
    }

    fn in_reading_order(books: &[(&'static str, Numbering)]) -> Vec<&'static str> {
        let mut shuffled = books.to_vec();
        shuffled.reverse();
        shuffled.sort_by_key(|(title, numbering)| reading_order_key(Some(numbering), title));
        shuffled.into_iter().map(|(title, _)| title).collect()
    }

    fn titles(books: &[(&'static str, Numbering)]) -> Vec<&'static str> {
        books.iter().map(|(title, _)| *title).collect()
    }

    #[test]
    fn orders_volumes_then_the_chapters_outside_them_then_specials() {
        let books = [
            ("v01", volume(1000, 1000)),
            ("v02", volume(2000, 2000)),
            ("c010", chapter(Some(10_000))),
            ("c011", chapter(Some(11_000))),
            ("Extras", special(Some(1000))),
        ];

        let ordered = in_reading_order(&books);

        assert_eq!(ordered, titles(&books));
    }

    #[test]
    fn orders_a_volume_before_the_chapters_inside_it_and_unnumbered_ones_after_those() {
        let books = [
            ("v01", volume(1000, 1000)),
            ("v01 c002", chapter_in(1000, Some(2000))),
            ("v01 c010", chapter_in(1000, Some(10_000))),
            ("v01 Afterword", chapter_in(1000, None)),
            ("v02 c001", chapter_in(2000, Some(1000))),
            ("v03", volume(3000, 3000)),
        ];

        let ordered = in_reading_order(&books);

        assert_eq!(ordered, titles(&books));
    }

    #[test]
    fn orders_a_decimal_chapter_between_its_neighbours() {
        let books = [
            ("c012", chapter(Some(12_000))),
            ("c012.5", chapter(Some(12_500))),
            ("c013", chapter(Some(13_000))),
        ];

        let ordered = in_reading_order(&books);

        assert_eq!(ordered, titles(&books));
    }

    #[test]
    fn orders_a_range_by_its_first_number_then_its_last() {
        let books = [
            ("v01", volume(1000, 1000)),
            ("v01-03", volume(1000, 3000)),
            ("v02", volume(2000, 2000)),
        ];

        let ordered = in_reading_order(&books);

        assert_eq!(ordered, titles(&books));
    }

    #[test]
    fn orders_unnumbered_books_after_the_numbered_ones_in_their_section_by_natural_title() {
        let books = [
            ("Extras 10", special(Some(1000))),
            ("Sketches 2", special(None)),
            ("Sketches 10", special(None)),
        ];

        let ordered = in_reading_order(&books);

        assert_eq!(ordered, titles(&books));
    }

    #[test]
    fn breaks_a_tie_between_the_same_number_from_two_groups_by_natural_title() {
        let books = [
            ("c005 GroupName", chapter(Some(5000))),
            ("c005 Second Group", chapter(Some(5000))),
        ];

        let ordered = in_reading_order(&books);

        assert_eq!(ordered, titles(&books));
    }

    fn number() -> impl Strategy<Value = u32> {
        prop_oneof![(0_u32..4).prop_map(|step| step * 500), any::<u32>()]
    }

    fn source() -> impl Strategy<Value = ValueSource> {
        prop_oneof![
            Just(ValueSource::FolderName),
            Just(ValueSource::FileName),
            Just(ValueSource::Files),
        ]
    }

    fn sourced_numbers() -> impl Strategy<Value = Sourced<NumberRange>> {
        (number(), number(), source()).prop_map(|(one, other, source)| Sourced {
            value: NumberRange::new(
                BookNumber::from_thousandths(one.min(other)),
                BookNumber::from_thousandths(one.max(other)),
            )
            .unwrap(),
            source,
        })
    }

    fn numbering() -> impl Strategy<Value = Numbering> {
        let volume = (number(), source()).prop_map(|(number, source)| Sourced {
            value: BookNumber::from_thousandths(number),
            source,
        });
        prop_oneof![
            sourced_numbers().prop_map(|numbers| Numbering::Volume { numbers }),
            (
                proptest::option::of(sourced_numbers()),
                proptest::option::of(volume)
            )
                .prop_map(|(number, volume)| Numbering::Chapter { number, volume }),
            proptest::option::of(sourced_numbers())
                .prop_map(|number| Numbering::Special { number }),
        ]
    }

    fn section(numbering: &Numbering) -> u8 {
        match numbering {
            Numbering::Volume { .. }
            | Numbering::Chapter {
                volume: Some(_), ..
            } => 0,
            Numbering::Chapter { volume: None, .. } => 1,
            Numbering::Special { .. } => 2,
        }
    }

    fn volume_of(numbering: &Numbering) -> Option<NumberRange> {
        match *numbering {
            Numbering::Volume { numbers } => Some(numbers.value),
            Numbering::Chapter { volume, .. } => {
                volume.map(|volume| NumberRange::single(volume.value))
            }
            Numbering::Special { .. } => None,
        }
    }

    fn number_of(numbering: &Numbering) -> Option<NumberRange> {
        match *numbering {
            Numbering::Volume { .. } => None,
            Numbering::Chapter { number, .. } | Numbering::Special { number } => {
                number.map(|number| number.value)
            }
        }
    }

    fn numbered_first(left: Option<NumberRange>, right: Option<NumberRange>) -> Ordering {
        match (left, right) {
            (Some(left), Some(right)) => left.cmp(&right),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => Ordering::Equal,
        }
    }

    fn reading_order(left: &(Numbering, String), right: &(Numbering, String)) -> Ordering {
        let ((left, left_title), (right, right_title)) = (left, right);
        let first_volume = |numbering| volume_of(numbering).map(NumberRange::first);
        let last_volume = |numbering| volume_of(numbering).map(NumberRange::last);
        let is_volume_book = |numbering| matches!(numbering, &Numbering::Volume { .. });
        section(left)
            .cmp(&section(right))
            .then_with(|| first_volume(left).cmp(&first_volume(right)))
            .then_with(|| is_volume_book(right).cmp(&is_volume_book(left)))
            .then_with(|| last_volume(left).cmp(&last_volume(right)))
            .then_with(|| numbered_first(number_of(left), number_of(right)))
            .then_with(|| book_order_key(left_title).cmp(&book_order_key(right_title)))
    }

    proptest! {
        #[test]
        fn orders_books_by_their_key_as_the_reading_order_rules_do(
            left in (numbering(), TITLE),
            right in (numbering(), TITLE),
        ) {
            let key = |(numbering, title): &(Numbering, String)| {
                reading_order_key(Some(numbering), title)
            };

            let by_key = key(&left).cmp(&key(&right));

            prop_assert_eq!(by_key, reading_order(&left, &right), "{:?} and {:?}", left, right);
        }

        #[test]
        fn keys_a_book_not_placed_yet_by_its_title_alone(title in TITLE) {
            let key = reading_order_key(None, &title);

            prop_assert_eq!(key, book_order_key(&title));
        }
    }
}
