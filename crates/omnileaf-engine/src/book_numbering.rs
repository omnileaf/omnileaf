use omnileaf_db::catalog::{BookNumber, NumberRange, Numbering, Sourced, ValueSource};
use omnileaf_formats::{self as formats, BookName};

#[derive(Debug, Clone, Copy)]
pub(crate) enum Shelf {
    Series,
    Volume(formats::Number),
    Specials,
}

pub(crate) fn number_book(book: &BookName, shelf: Shelf) -> Numbering {
    let folder_volume = match shelf {
        Shelf::Specials => {
            let number = book.chapter.or(book.volume).or(book.number);
            return Numbering::Special {
                number: number.map(range_in_file_name),
            };
        }
        Shelf::Volume(volume) => Some(Sourced {
            value: stored_number(volume),
            source: ValueSource::FolderName,
        }),
        Shelf::Series => None,
    };
    if let Some(chapter) = book.chapter {
        let volume_in_name = book.volume.map(|volume| Sourced {
            value: stored_number(volume.first()),
            source: ValueSource::FileName,
        });
        return Numbering::Chapter {
            number: Some(range_in_file_name(chapter)),
            volume: volume_in_name.or(folder_volume),
        };
    }
    match (book.volume, book.number, folder_volume) {
        (Some(volume), _, _) => Numbering::Volume {
            numbers: range_in_file_name(volume),
        },
        (None, None, None) => Numbering::Special { number: None },
        (None, number, volume) => Numbering::Chapter {
            number: number.map(range_in_file_name),
            volume,
        },
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
