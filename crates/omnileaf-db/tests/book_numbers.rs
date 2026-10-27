#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::path::PathBuf;

use omnileaf_db::{
    Database,
    catalog::{
        BookDetails, BookFile, BookListing, BookNumber, BookSection, BookSummary, NewRoot,
        NewSeries, NumberRange, Numbering, PageRequest, PageSize, RootId, RootKind, RootLocator,
        ScannedBook, SortDirection, Sourced, ValueSource, add_root, record_moved_books,
        record_scanned_books, series_books,
    },
    rusqlite::types::Value,
};
use omnileaf_sync_proto::{Fingerprint, ImageEntry};
use support::{ScratchFolder, library_config};

const ADDED_AT_MS: i64 = 1_790_000_000_000;
const SERIES: &str = "Sample Series 01";

type StoredNumbers = (String, Vec<Value>);

struct Library {
    database: Database,
    root: RootId,
    _folder: ScratchFolder,
}

impl Library {
    async fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let database = Database::open(&library_config(&folder)).unwrap();
        let root = NewRoot {
            kind: RootKind::Linked,
            locator: RootLocator::Path(PathBuf::from("/media/Sample Library")),
            added_at_ms: ADDED_AT_MS,
        };
        let root = database
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap();
        Self {
            database,
            root,
            _folder: folder,
        }
    }

    fn found(&self, title: &str, numbering: Option<Numbering>) -> ScannedBook {
        ScannedBook {
            series: NewSeries::local(SERIES, ADDED_AT_MS).unwrap(),
            named_series: None,
            fingerprint: fingerprint_of(title),
            title: title.to_owned(),
            added_at_ms: ADDED_AT_MS,
            page_count: 1,
            details: BookDetails::default(),
            file: BookFile {
                root: self.root,
                location: PathBuf::from(format!("{SERIES}/{title}.cbz")),
                size_bytes: 1,
                modified_at_ms: ADDED_AT_MS,
            },
            numbering,
            name_language: None,
        }
    }

    async fn record(&self, scanned: Vec<ScannedBook>) {
        self.database
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
    }

    async fn titles_in_reading_order(&self) -> Vec<String> {
        self.listed(BookListing::IN_ORDER, 10)
            .await
            .into_iter()
            .map(|book| book.title)
            .collect()
    }

    async fn listed(&self, listing: BookListing, page_size: u16) -> Vec<BookSummary> {
        let series = NewSeries::local(SERIES, ADDED_AT_MS).unwrap().id();
        let mut listed = Vec::new();
        let mut after = None;
        loop {
            let request = PageRequest {
                after,
                size: PageSize::try_from(page_size).unwrap(),
            };
            let page = self
                .database
                .read(move |connection| series_books(connection, series, listing, &request))
                .await
                .unwrap();
            listed.extend(page.items);
            let Some(next) = page.next else {
                return listed;
            };
            after = Some(next.to_string().parse().unwrap());
        }
    }

    async fn numbers(&self) -> Vec<StoredNumbers> {
        self.database
            .read(|connection| {
                Ok(connection
                    .prepare(
                        "SELECT title, kind, first_number, last_number, number_source,
                            volume_number, volume_source
                        FROM book ORDER BY title",
                    )?
                    .query_map([], |row| {
                        Ok((
                            row.get(0)?,
                            (1..7)
                                .map(|column| row.get(column))
                                .collect::<Result<_, _>>()?,
                        ))
                    })?
                    .collect::<Result<_, _>>()?)
            })
            .await
            .unwrap()
    }
}

fn fingerprint_of(title: &str) -> Fingerprint {
    let crc32 = title.bytes().fold(0_u32, |crc, byte| {
        crc.wrapping_mul(31).wrapping_add(u32::from(byte))
    });
    Fingerprint::pmf1([ImageEntry { crc32, size: 1 }]).unwrap()
}

fn numbers(first: u32, last: u32, source: ValueSource) -> Sourced<NumberRange> {
    let range = NumberRange::new(
        BookNumber::from_thousandths(first),
        BookNumber::from_thousandths(last),
    );
    Sourced {
        value: range.unwrap(),
        source,
    }
}

fn volume(thousandths: u32, source: ValueSource) -> Sourced<BookNumber> {
    Sourced {
        value: BookNumber::from_thousandths(thousandths),
        source,
    }
}

fn placed(
    kind: &str,
    numbers: Option<(i64, i64, &str)>,
    volume: Option<(i64, &str)>,
) -> Vec<Value> {
    let (first, last, number_source) = numbers.map_or(
        (Value::Null, Value::Null, Value::Null),
        |(first, last, source)| (Value::Integer(first), Value::Integer(last), text(source)),
    );
    let (volume, volume_source) = volume.map_or((Value::Null, Value::Null), |(volume, source)| {
        (Value::Integer(volume), text(source))
    });
    vec![
        text(kind),
        first,
        last,
        number_source,
        volume,
        volume_source,
    ]
}

fn stored(title: &str, columns: Vec<Value>) -> StoredNumbers {
    (title.to_owned(), columns)
}

fn text(value: &str) -> Value {
    Value::Text(value.to_owned())
}

#[tokio::test]
async fn keeps_the_kind_numbers_volume_and_their_sources_for_each_book_a_scan_placed() {
    let library = Library::open("placed-books").await;
    let found = vec![
        library.found(
            "v01-03",
            Some(Numbering::Volume {
                numbers: numbers(1000, 3000, ValueSource::FileName),
            }),
        ),
        library.found(
            "v03 c012.5",
            Some(Numbering::Chapter {
                number: Some(numbers(12_500, 12_500, ValueSource::FileName)),
                volume: Some(volume(3000, ValueSource::FolderName)),
            }),
        ),
        library.found(
            "Afterword",
            Some(Numbering::Chapter {
                number: None,
                volume: None,
            }),
        ),
        library.found(
            "Extras",
            Some(Numbering::Special {
                number: Some(numbers(1000, 1000, ValueSource::Files)),
            }),
        ),
        library.found("Not placed", None),
    ];

    library.record(found).await;

    assert_eq!(
        library.numbers().await,
        [
            stored("Afterword", placed("chapter", None, None)),
            stored(
                "Extras",
                placed("special", Some((1000, 1000, "files")), None)
            ),
            stored("Not placed", vec![Value::Null; 6]),
            stored(
                "v01-03",
                placed("volume", Some((1000, 3000, "file_name")), None)
            ),
            stored(
                "v03 c012.5",
                placed(
                    "chapter",
                    Some((12_500, 12_500, "file_name")),
                    Some((3000, "folder_name")),
                ),
            ),
        ]
    );
}

#[tokio::test]
async fn refiles_a_moved_book_under_the_numbers_its_new_place_gives() {
    let library = Library::open("placed-moved").await;
    let chapter = |volume| Numbering::Chapter {
        number: Some(numbers(12_000, 12_000, ValueSource::FileName)),
        volume,
    };
    library
        .record(vec![library.found("c012", Some(chapter(None)))])
        .await;
    let moved = library.found(
        "c012",
        Some(chapter(Some(volume(3000, ValueSource::FolderName)))),
    );

    library
        .database
        .write(move |transaction| record_moved_books(transaction, &[moved]))
        .await
        .unwrap();

    assert_eq!(
        library.numbers().await,
        [stored(
            "c012",
            placed(
                "chapter",
                Some((12_000, 12_000, "file_name")),
                Some((3000, "folder_name")),
            ),
        )]
    );
}

#[tokio::test]
async fn lists_the_books_of_a_series_in_reading_order_by_their_numbers() {
    let library = Library::open("placed-order").await;
    let chapter = |number| Numbering::Chapter {
        number: Some(numbers(number, number, ValueSource::FileName)),
        volume: None,
    };
    let found = vec![
        library.found(
            "Sample Series 01 Sketches",
            Some(Numbering::Special { number: None }),
        ),
        library.found("c010", Some(chapter(10_000))),
        library.found("c002", Some(chapter(2000))),
        library.found(
            "Volume 1",
            Some(Numbering::Volume {
                numbers: numbers(1000, 1000, ValueSource::FolderName),
            }),
        ),
    ];

    library.record(found).await;

    assert_eq!(
        library.titles_in_reading_order().await,
        ["Volume 1", "c002", "c010", "Sample Series 01 Sketches"]
    );
}

fn every_section(library: &Library) -> Vec<ScannedBook> {
    vec![
        library.found(
            "Volume 1",
            Some(Numbering::Volume {
                numbers: numbers(1000, 1000, ValueSource::FolderName),
            }),
        ),
        library.found(
            "v02 c003",
            Some(Numbering::Chapter {
                number: Some(numbers(3000, 3000, ValueSource::FileName)),
                volume: Some(volume(2000, ValueSource::FileName)),
            }),
        ),
        library.found(
            "c010",
            Some(Numbering::Chapter {
                number: Some(numbers(10_000, 10_000, ValueSource::FileName)),
                volume: None,
            }),
        ),
        library.found(
            "c011",
            Some(Numbering::Chapter {
                number: Some(numbers(11_000, 11_000, ValueSource::FileName)),
                volume: None,
            }),
        ),
        library.found(
            "c012",
            Some(Numbering::Chapter {
                number: Some(numbers(12_000, 12_000, ValueSource::FileName)),
                volume: None,
            }),
        ),
        library.found("Sketches", Some(Numbering::Special { number: None })),
        library.found("Not placed", None),
    ]
}

fn in_section(section: BookSection) -> BookListing {
    BookListing {
        section: Some(section),
        ..BookListing::IN_ORDER
    }
}

fn titles_and_positions(books: Vec<BookSummary>) -> Vec<(String, u32)> {
    books
        .into_iter()
        .map(|book| (book.title, book.position))
        .collect()
}

#[tokio::test]
async fn gives_each_listed_book_the_numbering_stored_for_it() {
    let library = Library::open("listed-numbering").await;
    let chapter = Numbering::Chapter {
        number: Some(numbers(12_500, 13_000, ValueSource::FileName)),
        volume: Some(volume(3000, ValueSource::FolderName)),
    };
    library
        .record(vec![
            library.found("v03 c012.5-13", Some(chapter)),
            library.found("Not placed", None),
        ])
        .await;

    let listed = library.listed(BookListing::IN_ORDER, 10).await;

    assert_eq!(
        listed
            .into_iter()
            .map(|book| (book.title, book.numbering))
            .collect::<Vec<_>>(),
        [
            ("v03 c012.5-13".to_owned(), Some(chapter)),
            ("Not placed".to_owned(), None),
        ]
    );
}

#[tokio::test]
async fn lists_only_the_books_of_the_section_asked_for_counting_places_across_the_series() {
    let library = Library::open("section-listing").await;
    library.record(every_section(&library)).await;

    let sections = [
        BookSection::Volumes,
        BookSection::Chapters,
        BookSection::Specials,
    ];
    let mut listed = Vec::new();
    for section in sections {
        listed.push(titles_and_positions(
            library.listed(in_section(section), 10).await,
        ));
    }

    assert_eq!(
        listed,
        [
            vec![("Volume 1".to_owned(), 1), ("v02 c003".to_owned(), 2)],
            vec![
                ("c010".to_owned(), 3),
                ("c011".to_owned(), 4),
                ("c012".to_owned(), 5),
            ],
            vec![("Sketches".to_owned(), 6)],
        ]
    );
}

#[tokio::test]
async fn pages_through_a_section_either_way_round_without_running_into_the_next() {
    let library = Library::open("section-paging").await;
    library.record(every_section(&library)).await;
    let last_first = BookListing {
        direction: SortDirection::Descending,
        ..in_section(BookSection::Chapters)
    };

    let first_first = library.listed(in_section(BookSection::Chapters), 1).await;
    let last_first = library.listed(last_first, 1).await;

    assert_eq!(
        [first_first, last_first]
            .map(|books| books.into_iter().map(|book| book.title).collect::<Vec<_>>()),
        [["c010", "c011", "c012"], ["c012", "c011", "c010"]]
    );
}
