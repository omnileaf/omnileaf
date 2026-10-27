use omnileaf_db::catalog::{BookNumber, NumberRange, Numbering, Sourced, ValueSource};
use omnileaf_formats::{self as formats, BookName};

#[derive(Debug, Clone, Copy)]
pub(crate) enum Shelf {
    Series,
    Volume(formats::Number),
    Specials,
}

pub(crate) fn number_book(book: &BookName, shelf: Shelf) -> Numbering {
    match shelf {
        Shelf::Series => number_by_marker(book).unwrap_or_else(|| match book.number {
            Some(number) => Numbering::Chapter {
                number: Some(range_in_file_name(number)),
                volume: None,
            },
            None => Numbering::Special { number: None },
        }),
        Shelf::Volume(folder_volume) => match (book.chapter, book.volume) {
            (None, Some(volume)) => Numbering::Volume {
                numbers: range_in_file_name(volume),
            },
            (chapter, _) => Numbering::Chapter {
                number: chapter.or(book.number).map(range_in_file_name),
                volume: Some(
                    volume_in_name(book).unwrap_or_else(|| volume_in_folder_name(folder_volume)),
                ),
            },
        },
        Shelf::Specials => Numbering::Special {
            number: book
                .chapter
                .or(book.volume)
                .or(book.number)
                .map(range_in_file_name),
        },
    }
}

fn number_by_marker(book: &BookName) -> Option<Numbering> {
    match (book.chapter, book.volume) {
        (Some(chapter), _) => Some(Numbering::Chapter {
            number: Some(range_in_file_name(chapter)),
            volume: volume_in_name(book),
        }),
        (None, Some(volume)) => Some(Numbering::Volume {
            numbers: range_in_file_name(volume),
        }),
        (None, None) => None,
    }
}

fn volume_in_name(book: &BookName) -> Option<Sourced<BookNumber>> {
    book.volume.map(|volume| Sourced {
        value: stored_number(volume.first()),
        source: ValueSource::FileName,
    })
}

fn volume_in_folder_name(volume: formats::Number) -> Sourced<BookNumber> {
    Sourced {
        value: stored_number(volume),
        source: ValueSource::FolderName,
    }
}

fn range_in_file_name(range: formats::NumberRange) -> Sourced<NumberRange> {
    let first = stored_number(range.first());
    Sourced {
        value: NumberRange::new(first, stored_number(range.last()))
            .unwrap_or(NumberRange::single(first)),
        source: ValueSource::FileName,
    }
}

fn stored_number(number: formats::Number) -> BookNumber {
    BookNumber::from_thousandths(number.thousandths())
}
