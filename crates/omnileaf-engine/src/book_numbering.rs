use omnileaf_db::catalog::{BookDetails, BookNumber, NumberRange, Numbering, Sourced, ValueSource};
use omnileaf_formats::{self as formats, BookName, read_book_name};

const THOUSANDTHS_PER_VOLUME: u32 = 1_000;

#[derive(Debug, Clone, Copy)]
pub(crate) enum Shelf {
    OneShot,
    Series,
    Volume(formats::Number),
    Specials,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct FileNumbers {
    number: Option<formats::NumberRange>,
    volume: Option<u32>,
}

impl FileNumbers {
    pub(crate) fn of(details: &BookDetails) -> Self {
        Self {
            number: details
                .number
                .as_deref()
                .and_then(|number| read_book_name(number, None).number),
            volume: details.volume,
        }
    }

    fn number(self) -> Option<Sourced<NumberRange>> {
        self.number.map(|number| from_files(stored_range(number)))
    }

    fn volume(self) -> Option<Sourced<BookNumber>> {
        self.volume.map(|volume| {
            from_files(BookNumber::from_thousandths(
                volume.saturating_mul(THOUSANDTHS_PER_VOLUME),
            ))
        })
    }

    fn volume_range(self) -> Option<Sourced<NumberRange>> {
        self.volume().map(|volume| Sourced {
            value: NumberRange::single(volume.value),
            source: volume.source,
        })
    }
}

pub(crate) fn number_book(book: &BookName, shelf: Shelf, files: FileNumbers) -> Numbering {
    let by_names = number_by_names(book, shelf);
    match (shelf, by_names) {
        (Shelf::Specials, _) => by_names,
        (Shelf::Series | Shelf::OneShot, _) if is_unnumbered(book) => {
            number_by_files(files).unwrap_or(by_names)
        }
        (_, Numbering::Volume { numbers }) => Numbering::Volume {
            numbers: files.volume_range().unwrap_or(numbers),
        },
        (_, Numbering::Chapter { number, volume }) => Numbering::Chapter {
            number: files.number().or(number),
            volume: files.volume().or(volume),
        },
        (_, Numbering::Special { .. }) => by_names,
    }
}

const fn is_unnumbered(book: &BookName) -> bool {
    book.volume.is_none() && book.chapter.is_none() && book.number.is_none()
}

fn number_by_files(files: FileNumbers) -> Option<Numbering> {
    match (files.number(), files.volume_range()) {
        (Some(number), _) => Some(Numbering::Chapter {
            number: Some(number),
            volume: files.volume(),
        }),
        (None, Some(numbers)) => Some(Numbering::Volume { numbers }),
        (None, None) => None,
    }
}

fn number_by_names(book: &BookName, shelf: Shelf) -> Numbering {
    match shelf {
        Shelf::OneShot => number_by_marker(book).unwrap_or(Numbering::Chapter {
            number: None,
            volume: None,
        }),
        Shelf::Series => number_by_marker(book).unwrap_or_else(|| match book.number {
            Some(number) => Numbering::Chapter {
                number: Some(range_in_file_name(number)),
                volume: None,
            },
            None => Numbering::Special { number: None },
        }),
        Shelf::Volume(folder_volume) => Numbering::Chapter {
            number: book
                .chapter
                .or(book.number_after_volume)
                .or(book.number)
                .map(range_in_file_name),
            volume: Some(
                volume_in_name(book).unwrap_or_else(|| volume_in_folder_name(folder_volume)),
            ),
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
    Sourced {
        value: stored_range(range),
        source: ValueSource::FileName,
    }
}

const fn from_files<T>(value: T) -> Sourced<T> {
    Sourced {
        value,
        source: ValueSource::Files,
    }
}

fn stored_range(range: formats::NumberRange) -> NumberRange {
    let first = stored_number(range.first());
    NumberRange::new(first, stored_number(range.last())).unwrap_or(NumberRange::single(first))
}

fn stored_number(number: formats::Number) -> BookNumber {
    BookNumber::from_thousandths(number.thousandths())
}
