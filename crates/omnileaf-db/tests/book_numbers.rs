#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::path::PathBuf;

use omnileaf_db::{
    Database,
    catalog::{
        BookDetails, BookFile, BookNumber, NewRoot, NewSeries, NumberRange, Numbering, RootId,
        RootKind, RootLocator, ScannedBook, Sourced, ValueSource, add_root, record_moved_books,
        record_scanned_books,
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
        }
    }

    async fn record(&self, scanned: Vec<ScannedBook>) {
        self.database
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
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

fn stored(title: &str, columns: [Value; 6]) -> StoredNumbers {
    (title.to_owned(), columns.into())
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
            stored(
                "Extras",
                [
                    text("special"),
                    Value::Integer(1000),
                    Value::Integer(1000),
                    text("files"),
                    Value::Null,
                    Value::Null,
                ],
            ),
            stored("Not placed", [const { Value::Null }; 6]),
            stored(
                "v01-03",
                [
                    text("volume"),
                    Value::Integer(1000),
                    Value::Integer(3000),
                    text("file_name"),
                    Value::Null,
                    Value::Null,
                ],
            ),
            stored(
                "v03 c012.5",
                [
                    text("chapter"),
                    Value::Integer(12_500),
                    Value::Integer(12_500),
                    text("file_name"),
                    Value::Integer(3000),
                    text("folder_name"),
                ],
            ),
        ]
    );
}

#[tokio::test]
async fn keeps_no_numbers_for_a_chapter_or_special_its_names_give_none() {
    let library = Library::open("placed-unnumbered").await;
    let found = vec![
        library.found(
            "Afterword",
            Some(Numbering::Chapter {
                number: None,
                volume: None,
            }),
        ),
        library.found("Sketches", Some(Numbering::Special { number: None })),
    ];

    library.record(found).await;

    assert_eq!(
        library.numbers().await,
        [
            stored(
                "Afterword",
                [
                    text("chapter"),
                    Value::Null,
                    Value::Null,
                    Value::Null,
                    Value::Null,
                    Value::Null,
                ],
            ),
            stored(
                "Sketches",
                [
                    text("special"),
                    Value::Null,
                    Value::Null,
                    Value::Null,
                    Value::Null,
                    Value::Null,
                ],
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
            [
                text("chapter"),
                Value::Integer(12_000),
                Value::Integer(12_000),
                text("file_name"),
                Value::Integer(3000),
                text("folder_name"),
            ],
        )]
    );
}
