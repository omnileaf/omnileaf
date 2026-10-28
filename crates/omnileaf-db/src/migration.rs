use std::path::Path;

use rusqlite::{Connection, OptionalExtension, TransactionBehavior};

use crate::Error;

const EMPTY_SCHEMA: u32 = 0;

const UNCLAIMED_APPLICATION_ID: i32 = 0;
const LIBRARY_APPLICATION_ID: i32 = i32::from_be_bytes(*b"OMNL");
const OWNABLE_APPLICATION_IDS: [i32; 2] = [UNCLAIMED_APPLICATION_ID, LIBRARY_APPLICATION_ID];

const SCHEMA_VERSION: &str = "user_version";
const FOREIGN_KEYS: &str = "foreign_keys";

pub(crate) enum Pending {
    Current,
    NewDatabase,
    Upgrade { from: u32 },
}

pub(crate) struct Migration {
    pub(crate) name: &'static str,
    pub(crate) sql: &'static str,
}

macro_rules! migration {
    ($name:literal) => {
        Migration {
            name: $name,
            sql: include_str!(concat!("../migrations/", $name, ".sql")),
        }
    };
}

pub(crate) const MIGRATIONS: &[Migration] = &[
    migration!("0001_mark_omnileaf_library"),
    migration!("0002_create_catalog"),
    migration!("0003_add_series_title_search"),
    migration!("0004_add_book_identity"),
    migration!("0005_create_sync_registers"),
    migration!("0006_create_book_state"),
    migration!("0007_stop_reusing_library_root_ids"),
    migration!("0008_allow_one_home_root"),
    migration!("0009_store_book_file_locations_as_bytes"),
    migration!("0010_create_first_launch"),
    migration!("0011_key_series_titles_by_collation"),
    migration!("0012_add_library_root_unavailable_since"),
    migration!("0013_create_library_view"),
    migration!("0014_store_series_source_ids_as_sixteen_bytes"),
    migration!("0015_allow_covers_only_library_view"),
    migration!("0016_add_android_tree_labels"),
    migration!("0017_count_read_and_started_books"),
    migration!("0018_create_library_listing"),
    migration!("0019_index_series_by_reading_stage"),
    migration!("0020_create_book_pages"),
    migration!("0021_create_reading_sessions"),
    migration!("0022_index_reading_sessions_by_book"),
    migration!("0023_add_continue_row_to_library_view"),
    migration!("0024_add_fits_covers_to_width_to_library_view"),
    migration!("0025_add_category_tabs_and_grouping_to_library_view"),
    migration!("0026_create_adult_content"),
    migration!("0027_track_when_each_series_was_last_read"),
    migration!("0028_create_library_tabs"),
    migration!("0029_hide_the_series_of_missing_folders"),
    migration!("0030_hide_books_from_history"),
    migration!("0031_remember_the_page_each_reading_session_started_on"),
    migration!("0032_track_when_each_series_last_gained_a_book"),
    migration!("0033_index_series_by_unread_count"),
    migration!("0034_keep_how_many_pages_each_book_holds"),
    migration!("0035_track_how_many_pages_each_series_has_left"),
    migration!("0036_remember_the_share_of_each_library_root"),
    migration!("0037_key_sync_registers_by_profile"),
    migration!("0038_create_hidden_file_types"),
    migration!("0039_keep_when_each_series_was_last_read_in_every_order"),
    migration!("0040_count_the_books_each_series_holds_more_than_one_file_of"),
    migration!("0041_keep_the_details_of_each_book"),
    migration!("0042_keep_the_people_and_tags_of_each_book"),
    migration!("0043_name_the_language_and_age_rating_of_each_series"),
    migration!("0044_index_the_series_holding_a_book_stored_twice"),
    migration!("0045_rename_the_book_title_sort_key_to_reading_order_key"),
    migration!("0046_keep_the_kind_and_numbers_of_each_book"),
    migration!("0047_group_the_library_by_creator"),
    migration!("0048_key_the_name_of_each_person_a_book_names"),
];

pub(crate) fn pending(
    connection: &Connection,
    path: &Path,
    migrations: &[Migration],
) -> Result<Pending, Error> {
    let stored = StoredSchema::read(connection).map_err(|source| Error::Open {
        path: path.to_owned(),
        source,
    })?;
    if !OWNABLE_APPLICATION_IDS.contains(&stored.application_id) {
        return Err(Error::NotALibrary {
            path: path.to_owned(),
        });
    }
    let supported = supported_version(stored.version, migrations)?;
    Ok(if stored.version == supported {
        Pending::Current
    } else if stored.is_blank() {
        Pending::NewDatabase
    } else {
        Pending::Upgrade {
            from: stored.version,
        }
    })
}

struct StoredSchema {
    version: u32,
    application_id: i32,
    holds_objects: bool,
}

impl StoredSchema {
    fn read(connection: &Connection) -> rusqlite::Result<Self> {
        connection.query_row(
            "SELECT
                 (SELECT user_version FROM pragma_user_version),
                 (SELECT application_id FROM pragma_application_id),
                 EXISTS (SELECT 1 FROM sqlite_schema)",
            [],
            |row| {
                Ok(Self {
                    version: row.get(0)?,
                    application_id: row.get(1)?,
                    holds_objects: row.get(2)?,
                })
            },
        )
    }

    fn is_blank(&self) -> bool {
        self.version == EMPTY_SCHEMA
            && self.application_id == UNCLAIMED_APPLICATION_ID
            && !self.holds_objects
    }
}

/// Turns SQLite foreign key enforcement off while migrating, since rebuilding a table would otherwise cascade-delete the rows referring to it.
pub(crate) fn apply(
    connection: &mut Connection,
    path: &Path,
    migrations: &[Migration],
) -> Result<(), Error> {
    let failed = upgrade_failed(path, migrations);
    connection
        .pragma_update(None, FOREIGN_KEYS, false)
        .map_err(&failed)?;
    let migrated = migrate(connection, path, migrations);
    let enforced = connection
        .pragma_update(None, FOREIGN_KEYS, true)
        .map_err(&failed);
    migrated.and(enforced)
}

fn migrate(
    connection: &mut Connection,
    path: &Path,
    migrations: &[Migration],
) -> Result<(), Error> {
    let failed = upgrade_failed(path, migrations);
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(&failed)?;
    let from = schema_version(&transaction).map_err(&failed)?;
    let latest = supported_version(from, migrations)?;
    for (_, migration) in numbered(migrations).filter(|(version, _)| *version > from) {
        transaction
            .execute_batch(migration.sql)
            .map_err(|source| Error::Migrate {
                name: migration.name,
                source,
            })?;
        tracing::info!(migration = migration.name, "applied a database migration");
    }
    let dangling = first_dangling_reference(&transaction).map_err(&failed)?;
    if let Some(table) = dangling {
        return Err(Error::DanglingReference {
            path: path.to_owned(),
            table,
        });
    }
    transaction
        .pragma_update(None, SCHEMA_VERSION, latest)
        .and_then(|()| transaction.commit())
        .map_err(&failed)
}

fn first_dangling_reference(connection: &Connection) -> rusqlite::Result<Option<String>> {
    connection
        .query_row("PRAGMA foreign_key_check", [], |row| row.get(0))
        .optional()
}

fn upgrade_failed(path: &Path, migrations: &[Migration]) -> impl Fn(rusqlite::Error) -> Error {
    let path = path.to_owned();
    let version = latest_version(migrations);
    move |source| Error::Upgrade {
        path: path.clone(),
        version,
        source,
    }
}

fn schema_version(connection: &Connection) -> rusqlite::Result<u32> {
    connection.pragma_query_value(None, SCHEMA_VERSION, |row| row.get(0))
}

fn supported_version(found: u32, migrations: &[Migration]) -> Result<u32, Error> {
    let supported = latest_version(migrations);
    if found > supported {
        return Err(Error::NewerSchema { found, supported });
    }
    Ok(supported)
}

fn numbered(migrations: &[Migration]) -> impl Iterator<Item = (u32, &Migration)> {
    (1..).zip(migrations)
}

fn latest_version(migrations: &[Migration]) -> u32 {
    numbered(migrations)
        .last()
        .map_or(EMPTY_SCHEMA, |(version, _)| version)
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry, ProfileId, SourceId};

    use rusqlite::types::Value;

    use super::*;
    use crate::{
        Database, Language,
        catalog::{PageRequest, PageSize, writers},
        connection,
        first_launch::first_launch_finished,
        library_view::{
            LibraryDisplay, LibraryGrouping, OnCovers, StoredLibraryView, library_view,
        },
        scratch::ScratchLibrary,
        store::{Clock, Continuity, SessionPlace, Store},
        title_key::{TitleCollation, TitleStamp},
    };

    type Schema = (i64, i64, Vec<(String, String, Option<String>)>);

    const BOOK_GAINED_LAST: &str = "SELECT max(added_at_ms) FROM book WHERE series_local_id = ?1";
    const FILES_OF_BOOK: &str = "SELECT count(*) FROM book_file WHERE book_id = ?1";
    const PAGES_LEFT_OF_BOOK_ADDED: &str = "UPDATE series SET
            pages_left = series.pages_left + book_left.pages_left,
            uncounted_books = series.uncounted_books + book_left.is_uncounted
        FROM book_left_to_read AS book_left
        WHERE book_left.book_id = ?1 AND series.local_id = book_left.series_local_id";

    #[test]
    fn brings_a_new_database_to_the_latest_schema_version() {
        let scratch = ScratchLibrary::new("latest");

        drop(Database::open(&scratch.config).unwrap());

        let (version, _, _) = schema_of(&scratch.config.path);
        assert_eq!(usize::try_from(version).unwrap(), MIGRATIONS.len());
    }

    #[test]
    fn every_earlier_schema_version_migrates_to_the_schema_a_new_database_gets() {
        let fresh = ScratchLibrary::new("fresh");
        drop(Database::open(&fresh.config).unwrap());
        let expected = schema_of(&fresh.config.path);

        for version in 0..MIGRATIONS.len() {
            let earlier = ScratchLibrary::new("earlier");
            drop(Database::open_with(&earlier.config, &MIGRATIONS[..version]).unwrap());

            drop(Database::open(&earlier.config).unwrap());

            let backup = earlier.backup_path(u32::try_from(version).unwrap());
            assert_eq!(
                schema_of(&earlier.config.path),
                expected,
                "from version {version}"
            );
            assert_eq!(backup.exists(), version > 0, "backup of version {version}");
        }
    }

    #[test]
    fn numbers_each_migration_by_its_schema_version() {
        for (version, migration) in numbered(MIGRATIONS) {
            let prefix = format!("{version:04}_");

            let is_numbered = migration.name.starts_with(&prefix);

            assert!(is_numbered, "{} should start with {prefix}", migration.name);
        }
    }

    #[test]
    fn lists_every_migration_file() {
        let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/migrations");

        let mut files: Vec<String> = fs::read_dir(folder)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|path| path.extension().is_some_and(|extension| extension == "sql"))
            .map(|path| path.file_stem().unwrap().to_string_lossy().into_owned())
            .collect();
        files.sort();

        let listed: Vec<&str> = MIGRATIONS.iter().map(|migration| migration.name).collect();
        assert_eq!(files, listed);
    }

    #[test]
    fn keeps_the_earlier_schema_when_a_migration_fails() {
        let scratch = ScratchLibrary::new("failed");
        let broken = [
            Migration {
                name: "0001_create_note",
                sql: "CREATE TABLE note (id INTEGER PRIMARY KEY);",
            },
            Migration {
                name: "0002_break",
                sql: "CREATE TABLE note (id INTEGER PRIMARY KEY);",
            },
        ];

        let outcome = Database::open_with(&scratch.config, &broken);

        assert!(matches!(
            outcome,
            Err(Error::Migrate {
                name: "0002_break",
                ..
            })
        ));
        assert_eq!(schema_of(&scratch.config.path), (0, 0, Vec::new()));
    }

    #[test]
    fn skips_the_migrations_another_connection_applied_since_the_version_was_read() {
        let scratch = ScratchLibrary::new("raced");
        let tally = [
            Migration {
                name: "0001_create_tally",
                sql: "CREATE TABLE tally (count INTEGER NOT NULL); INSERT INTO tally (count) VALUES (1);",
            },
            Migration {
                name: "0002_scale_tally",
                sql: "UPDATE tally SET count = count * 1000;",
            },
        ];
        drop(Database::open_with(&scratch.config, &tally[..1]).unwrap());
        let mut stale = connection::open_writer(&scratch.config).unwrap();
        let Pending::Upgrade { .. } = pending(&stale, &scratch.config.path, &tally).unwrap() else {
            panic!("the database should be waiting for its second migration");
        };
        drop(Database::open_with(&scratch.config, &tally).unwrap());

        apply(&mut stale, &scratch.config.path, &tally).unwrap();

        let count: i64 = stale
            .query_row("SELECT count FROM tally", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1000);
    }

    #[test]
    fn makes_the_series_added_before_title_search_searchable() {
        let scratch = ScratchLibrary::new("search-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..2]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_sort_key, added_at_ms)
                 VALUES (zeroblob(16), 'local', 'sample series 01', 'Sample Series 01', x'', 0)",
                [],
            )
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let found: i64 = connection
            .query_row(
                "SELECT count(*) FROM series_fts WHERE series_fts MATCH 'Sample'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(found, 1);
    }

    #[test]
    fn keeps_the_books_added_before_book_identity_without_a_fingerprint() {
        let scratch = ScratchLibrary::new("identity-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..3]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute_batch(
                "INSERT INTO series (id, source_id, natural_key, title, title_sort_key, added_at_ms)
                 VALUES (zeroblob(16), 'local', 'sample series 01', 'Sample Series 01', x'', 0);
                 INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
                 VALUES (zeroblob(16), 1, 'Volume 01', x'', 0);",
            )
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let identity: (Option<Vec<u8>>, Option<String>, Option<String>) = connection
            .query_row(
                "SELECT content_fp, fp_kind, logical_key FROM book",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(identity, (None, None, None));
    }

    #[test]
    fn keeps_the_library_folders_and_their_files_when_root_ids_stop_being_reused() {
        let scratch = ScratchLibrary::new("root-ids-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..6]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute_batch(
                "INSERT INTO library_root (id, kind, locator_kind, location, added_at_ms)
                 VALUES (7, 'linked', 'path', x'2f6d65646961', 0);
                 INSERT INTO series (id, source_id, natural_key, title, title_sort_key, added_at_ms)
                 VALUES (zeroblob(16), 'local', 'sample series 01', 'Sample Series 01', x'', 0);
                 INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
                 VALUES (zeroblob(16), 1, 'Volume 01', x'', 0);
                 INSERT INTO book_file (book_id, root_id, location, size_bytes, modified_at_ms)
                 VALUES (zeroblob(16), 7, 'Volume 01.cbz', 1, 0);",
            )
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let file_roots: Vec<i64> = connection
            .prepare("SELECT library_root.id FROM book_file JOIN library_root ON library_root.id = book_file.root_id")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(file_roots, [7]);
    }

    #[test]
    fn keeps_the_library_folders_when_android_folder_labels_arrive() {
        let scratch = ScratchLibrary::new("tree-labels-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..15]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute_batch(
                "INSERT INTO library_root (id, kind, locator_kind, location, bookmark, added_at_ms)
                 VALUES (7, 'linked', 'path', x'2f6d65646961', NULL, 0),
                        (8, 'linked', 'apple_bookmark', x'2f6d65646962', x'01', 0);",
            )
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let roots: Vec<(i64, Option<String>, Option<String>)> = connection
            .prepare("SELECT id, tree_name, tree_place FROM library_root ORDER BY id")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(roots, [(7, None, None), (8, None, None)]);
    }

    #[test]
    fn keeps_each_book_file_location_as_the_bytes_of_its_text() {
        let scratch = ScratchLibrary::new("file-location-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..8]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute_batch(
                "INSERT INTO library_root (id, kind, locator_kind, location, added_at_ms)
                 VALUES (7, 'linked', 'path', x'2f6d65646961', 0);
                 INSERT INTO series (id, source_id, natural_key, title, title_sort_key, added_at_ms)
                 VALUES (zeroblob(16), 'local', 'sample series 01', 'Sample Series 01', x'', 0);
                 INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
                 VALUES (zeroblob(16), 1, 'Volume 01', x'', 0);
                 INSERT INTO book_file (book_id, root_id, location, size_bytes, modified_at_ms)
                 VALUES (zeroblob(16), 7, 'Sample Series 01/Volume 01.cbz', 1, 0);",
            )
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let location: Vec<u8> = connection
            .query_row("SELECT location FROM book_file", [], |row| row.get(0))
            .unwrap();
        assert_eq!(location, b"Sample Series 01/Volume 01.cbz");
    }

    fn library_before_first_launch_with(name: &str, rows: &str) -> ScratchLibrary {
        let scratch = ScratchLibrary::new(name);
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..9]).unwrap());
        Connection::open(&scratch.config.path)
            .unwrap()
            .execute_batch(rows)
            .unwrap();
        scratch
    }

    fn has_finished_first_launch(scratch: &ScratchLibrary) -> bool {
        first_launch_finished(&Connection::open(&scratch.config.path).unwrap()).unwrap()
    }

    #[test]
    fn counts_a_library_with_a_linked_folder_as_through_its_first_launch() {
        let scratch = library_before_first_launch_with(
            "first-launch-linked-upgrade",
            "INSERT INTO library_root (kind, locator_kind, location, added_at_ms)
             VALUES ('linked', 'path', x'2f6d65646961', 0);",
        );

        drop(Database::open(&scratch.config).unwrap());

        assert!(has_finished_first_launch(&scratch));
    }

    #[test]
    fn counts_a_library_with_books_as_through_its_first_launch() {
        let scratch = library_before_first_launch_with(
            "first-launch-books-upgrade",
            "INSERT INTO series (id, source_id, natural_key, title, title_sort_key, added_at_ms)
             VALUES (zeroblob(16), 'local', 'sample series 01', 'Sample Series 01', x'', 0);
             INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
             VALUES (zeroblob(16), 1, 'Volume 01', x'', 0);",
        );

        drop(Database::open(&scratch.config).unwrap());

        assert!(has_finished_first_launch(&scratch));
    }

    #[test]
    fn leaves_the_first_launch_to_a_library_holding_only_its_home_folder() {
        let scratch = library_before_first_launch_with(
            "first-launch-home-upgrade",
            "INSERT INTO library_root (kind, locator_kind, location, added_at_ms)
             VALUES ('home', 'path', x'2f686f6d65', 0);",
        );

        drop(Database::open(&scratch.config).unwrap());

        assert!(!has_finished_first_launch(&scratch));
    }

    #[test]
    fn keys_the_series_titles_kept_from_before_titles_were_collated() {
        let scratch = ScratchLibrary::new("title-key-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..10]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_sort_key, added_at_ms)
                 VALUES (zeroblob(16), 'local', 'sample series 01', 'Sample Series 01', x'', 0)",
                [],
            )
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let key: Vec<u8> = connection
            .query_row("SELECT title_key FROM series", [], |row| row.get(0))
            .unwrap();
        let root = TitleCollation::new(&Language::ROOT).unwrap();
        assert_eq!(key, root.key("Sample Series 01"));
    }

    #[test]
    fn keeps_each_series_stored_before_source_ids_were_sixteen_bytes_under_the_local_source() {
        let scratch = ScratchLibrary::new("source-id-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..2]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_sort_key, added_at_ms)
                 VALUES (zeroblob(16), 'local', 'sample series 01', 'Sample Series 01', x'', 0)",
                [],
            )
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let source: Vec<u8> = connection
            .query_row("SELECT source_id FROM series", [], |row| row.get(0))
            .unwrap();
        assert_eq!(source, SourceId::local().as_bytes().to_vec());
    }

    struct StoppedClock;

    impl Clock for StoppedClock {
        fn now_unix_ms(&self) -> u64 {
            0
        }
    }

    fn book(number: u32) -> BookId {
        BookId::local(
            &Fingerprint::pmf1([ImageEntry {
                crc32: number,
                size: 1,
            }])
            .unwrap(),
        )
    }

    struct PlacedBooks {
        connection: Connection,
        _scratch: ScratchLibrary,
    }

    impl PlacedBooks {
        fn open(name: &str) -> Self {
            let scratch = ScratchLibrary::new(name);
            drop(Database::open(&scratch.config).unwrap());
            let connection = Connection::open(&scratch.config.path).unwrap();
            connection
                .execute(
                    "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                     VALUES (zeroblob(16), ?1, 'sample series 01', 'Sample Series 01', x'', 0)",
                    [SourceId::local().as_bytes()],
                )
                .unwrap();
            Self {
                connection,
                _scratch: scratch,
            }
        }

        fn place(&self, number: u32, values: &str) -> rusqlite::Result<usize> {
            self.connection.execute(
                &format!(
                    "INSERT INTO book (id, series_local_id, title, reading_order_key, added_at_ms,
                        kind, first_number, last_number, number_source, volume_number,
                        volume_source)
                    VALUES (?1, 1, 'Volume 01', x'', 0, {values})"
                ),
                [book(number).as_bytes()],
            )
        }

        fn refuses_by_check(&self, number: u32, values: &str) -> bool {
            matches!(
                self.place(number, values),
                Err(rusqlite::Error::SqliteFailure(failure, _))
                    if failure.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_CHECK
            )
        }
    }

    #[test]
    fn counts_the_read_and_started_books_of_each_series_kept_from_before_they_were_counted() {
        let scratch = ScratchLibrary::new("reading-counts-upgrade");
        let store = Store::new(
            Database::open_with(&scratch.config, &MIGRATIONS[..16]).unwrap(),
            StoppedClock,
        );
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute_batch(&registers_as_the_store_writes_them())
            .unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                 VALUES (zeroblob(16), ?1, 'sample series 01', 'Sample Series 01', x'', 0)",
                [SourceId::local().as_bytes()],
            )
            .unwrap();
        for number in 1..=3 {
            connection
                .execute(
                    "INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
                     VALUES (?1, 1, ?2, x'', 0)",
                    (book(number).as_bytes(), format!("Volume {number:02}")),
                )
                .unwrap();
        }
        let written = store.write(|writer| {
            writer.set_read(book(1), true)?;
            writer.set_position(book(2), 4)?;
            writer.set_read(book(2), false)?;
            writer.set_read(book(3), false)
        });
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(written)
            .unwrap();
        drop(store);
        connection
            .execute_batch(REGISTERS_AS_KEPT_BEFORE_PROFILES)
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let counts: (u32, u32) = connection
            .query_row("SELECT read_count, started_count FROM series", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .unwrap();
        assert_eq!(counts, (1, 2));
    }

    struct ClockAt(u64);

    impl Clock for ClockAt {
        fn now_unix_ms(&self) -> u64 {
            self.0
        }
    }

    const REGISTERS_AS_KEPT_BEFORE_PROFILES: &str = "DROP INDEX sync_register_by_profile;
        ALTER TABLE sync_register DROP COLUMN profile;
        ALTER TABLE sync_local DROP COLUMN profile;";

    const REGISTER_COLUMNS: &str = "entity, id, field, class, hlc, node, seq, rank, value, ext";

    fn stored_registers(connection: &Connection, columns: &str) -> Vec<Vec<Value>> {
        let mut statement = connection
            .prepare(&format!("SELECT {columns} FROM sync_register ORDER BY seq"))
            .unwrap();
        let column_count = statement.column_count();
        statement
            .query_map([], |row| {
                (0..column_count)
                    .map(|index| row.get(index))
                    .collect::<rusqlite::Result<_>>()
            })
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    fn registers_as_the_store_writes_them() -> String {
        let profile = ProfileId::default_profile().to_string().replace('-', "");
        format!(
            "ALTER TABLE sync_local ADD COLUMN profile BLOB NOT NULL DEFAULT x'{profile}';
            ALTER TABLE sync_register ADD COLUMN profile BLOB NOT NULL DEFAULT x'{profile}';
            CREATE UNIQUE INDEX sync_register_by_profile
                ON sync_register (profile, entity, id, field);"
        )
    }

    const SESSIONS_AS_THE_STORE_WRITES_THEM: &str =
        "ALTER TABLE reading_session ADD COLUMN first_page INTEGER";
    const SESSIONS_AS_SCHEMA_26_KEPT_THEM: &str =
        "ALTER TABLE reading_session DROP COLUMN first_page";

    #[test]
    fn knows_when_each_series_kept_from_before_was_last_read() {
        let scratch = ScratchLibrary::new("last-read-upgrade");
        let store = Store::new(
            Database::open_with(&scratch.config, &MIGRATIONS[..26]).unwrap(),
            ClockAt(9_000),
        );
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute_batch(&registers_as_the_store_writes_them())
            .unwrap();
        connection
            .execute_batch(SESSIONS_AS_THE_STORE_WRITES_THEM)
            .unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                 VALUES (zeroblob(16), ?1, 'sample series 01', 'Sample Series 01', x'', 0)",
                [SourceId::local().as_bytes()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
                 VALUES (?1, 1, 'Volume 01', x'', 0)",
                [book(1).as_bytes()],
            )
            .unwrap();
        let place = SessionPlace {
            book: book(1),
            page: 0,
            page_count: 1,
            utc_offset_minutes: 0,
        };
        let written =
            store.write(move |writer| writer.record_reading(&place, Continuity::AfterBreak));
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(written)
            .unwrap();
        drop(store);
        connection
            .execute_batch(REGISTERS_AS_KEPT_BEFORE_PROFILES)
            .unwrap();
        connection
            .execute_batch(SESSIONS_AS_SCHEMA_26_KEPT_THEM)
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let last_read_at_ms: i64 = connection
            .query_row("SELECT last_read_at_ms FROM series", [], |row| row.get(0))
            .unwrap();
        assert_eq!(last_read_at_ms, 9_000);
    }

    #[test]
    fn hides_the_series_of_a_folder_missing_before_series_were_hidden() {
        let scratch = ScratchLibrary::new("missing-folder-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..28]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute(
                "INSERT INTO library_root
                    (kind, locator_kind, location, added_at_ms, unavailable_since_ms)
                 VALUES ('linked', 'path', x'2f6d65646961', 0, 1)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                 VALUES (zeroblob(16), ?1, 'sample series 01', 'Sample Series 01', x'', 0)",
                [SourceId::local().as_bytes()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
                 VALUES (?1, 1, 'Volume 01', x'', 0)",
                [book(1).as_bytes()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO book_file (book_id, root_id, location, size_bytes, modified_at_ms)
                 VALUES (?1, 1, x'566f6c756d652030312e63627a', 1, 0)",
                [book(1).as_bytes()],
            )
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let stage: Option<i64> = connection
            .query_row("SELECT reading_stage FROM series", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stage, None);
    }

    #[test]
    fn knows_when_each_series_kept_from_before_last_gained_a_book() {
        let scratch = ScratchLibrary::new("last-updated-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..31]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                 VALUES (zeroblob(16), ?1, 'sample series 01', 'Sample Series 01', x'', 0)",
                [SourceId::local().as_bytes()],
            )
            .unwrap();
        for (number, added_at_ms) in [(1, 7_000), (2, 9_000), (3, 8_000)] {
            connection
                .execute(
                    "INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
                     VALUES (?1, 1, 'Volume', x'', ?2)",
                    (book(number).as_bytes(), added_at_ms),
                )
                .unwrap();
        }

        drop(Database::open(&scratch.config).unwrap());

        let updated_at_ms: i64 = connection
            .query_row("SELECT updated_at_ms FROM series", [], |row| row.get(0))
            .unwrap();
        assert_eq!(updated_at_ms, 9_000);
    }

    #[test]
    fn counts_the_unread_books_of_each_series_kept_from_before_the_count_was_indexed() {
        let scratch = ScratchLibrary::new("unread-count-upgrade");
        let store = Store::new(
            Database::open_with(&scratch.config, &MIGRATIONS[..32]).unwrap(),
            StoppedClock,
        );
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute_batch(&registers_as_the_store_writes_them())
            .unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                 VALUES (zeroblob(16), ?1, 'sample series 01', 'Sample Series 01', x'', 0)",
                [SourceId::local().as_bytes()],
            )
            .unwrap();
        for number in 1..=3 {
            connection
                .execute(
                    "INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
                     VALUES (?1, 1, 'Volume', x'', 0)",
                    [book(number).as_bytes()],
                )
                .unwrap();
        }
        let written = store.write(|writer| writer.set_read(book(2), true));
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(written)
            .unwrap();
        drop(store);
        connection
            .execute_batch(REGISTERS_AS_KEPT_BEFORE_PROFILES)
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let unread_count: i64 = connection
            .query_row("SELECT unread_count FROM series", [], |row| row.get(0))
            .unwrap();
        assert_eq!(unread_count, 2);
    }

    #[test]
    fn counts_the_pages_of_each_book_kept_from_before_from_the_page_sizes_it_stored() {
        let scratch = ScratchLibrary::new("page-count-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..33]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute_batch(
                "INSERT INTO library_root (kind, locator_kind, location, added_at_ms)
                 VALUES ('linked', 'path', x'2f6d65646961', 0);",
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                 VALUES (zeroblob(16), ?1, 'sample series 01', 'Sample Series 01', x'', 0)",
                [SourceId::local().as_bytes()],
            )
            .unwrap();
        for number in 1..=2 {
            connection
                .execute(
                    "INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
                     VALUES (?1, 1, ?2, x'', 0)",
                    (book(number).as_bytes(), format!("Volume {number:02}")),
                )
                .unwrap();
            connection
                .execute(
                    "INSERT INTO book_file (book_id, root_id, location, size_bytes, modified_at_ms)
                     VALUES (?1, 1, ?2, 1, 0)",
                    (
                        book(number).as_bytes(),
                        format!("Volume {number:02}.cbz").into_bytes(),
                    ),
                )
                .unwrap();
        }
        connection
            .execute(
                "INSERT INTO book_pages (file_id, rev, manifest) VALUES (1, 1, zeroblob(24))",
                [],
            )
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let page_counts: Vec<Option<u32>> = connection
            .prepare("SELECT page_count FROM book ORDER BY title")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(page_counts, [Some(3), None]);
    }

    #[test]
    fn counts_the_pages_left_in_each_series_kept_from_before_they_were_counted() {
        let scratch = ScratchLibrary::new("pages-left-upgrade");
        let store = Store::new(
            Database::open_with(&scratch.config, &MIGRATIONS[..34]).unwrap(),
            StoppedClock,
        );
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute_batch(&registers_as_the_store_writes_them())
            .unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                 VALUES (zeroblob(16), ?1, 'sample series 01', 'Sample Series 01', x'', 0)",
                [SourceId::local().as_bytes()],
            )
            .unwrap();
        for (number, page_count) in [(1, 50), (2, 30)] {
            connection
                .execute(
                    "INSERT INTO book
                        (id, series_local_id, title, title_sort_key, added_at_ms, page_count)
                     VALUES (?1, 1, ?2, x'', 0, ?3)",
                    (
                        book(number).as_bytes(),
                        format!("Volume {number:02}"),
                        page_count,
                    ),
                )
                .unwrap();
        }
        let written = store.write(|writer| writer.set_position(book(1), 20));
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(written)
            .unwrap();
        drop(store);
        connection
            .execute_batch(REGISTERS_AS_KEPT_BEFORE_PROFILES)
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let pages_left: (u32, u32) = connection
            .query_row(
                "SELECT pages_left, uncounted_books FROM series",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(pages_left, (60, 0));
    }

    #[test]
    fn moves_every_register_kept_before_profiles_into_the_default_profile_unchanged() {
        let scratch = ScratchLibrary::new("registers-by-profile-upgrade");
        let store = Store::new(
            Database::open_with(&scratch.config, &MIGRATIONS[..36]).unwrap(),
            ClockAt(9_000),
        );
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute_batch(&registers_as_the_store_writes_them())
            .unwrap();
        let written = store.write(|writer| {
            writer.set_position(book(1), 4)?;
            writer.raise_furthest(book(1), 12)?;
            writer.set_read(book(2), true)
        });
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(written)
            .unwrap();
        drop(store);
        connection
            .execute_batch(REGISTERS_AS_KEPT_BEFORE_PROFILES)
            .unwrap();
        let before = stored_registers(&connection, REGISTER_COLUMNS);

        drop(Database::open(&scratch.config).unwrap());

        let default_profile = ProfileId::default_profile().as_bytes().to_vec();
        let kept_in_the_default_profile: Vec<Vec<Value>> = before
            .into_iter()
            .map(|register| [vec![Value::Blob(default_profile.clone())], register].concat())
            .collect();
        assert_eq!(kept_in_the_default_profile.len(), 3);
        assert_eq!(
            stored_registers(&connection, &format!("profile, {REGISTER_COLUMNS}")),
            kept_in_the_default_profile
        );
    }

    #[test]
    fn counts_the_books_each_series_kept_from_before_holds_more_than_one_file_of() {
        let scratch = ScratchLibrary::new("duplicated-books-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..39]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute_batch(
                "INSERT INTO library_root (kind, locator_kind, location, added_at_ms)
                 VALUES ('linked', 'path', x'2f6d65646961', 0);
                 INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                 VALUES (zeroblob(16), zeroblob(16), 'sample series 01', 'Sample Series 01', x'', 0);",
            )
            .unwrap();
        for number in [1, 2] {
            connection
                .execute(
                    "INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
                     VALUES (?1, 1, 'Volume', x'', 0)",
                    [book(number).as_bytes()],
                )
                .unwrap();
        }
        for (number, location) in [(1, "a.cbz"), (1, "b.cbz"), (2, "c.cbz")] {
            connection
                .execute(
                    "INSERT INTO book_file (book_id, root_id, location, size_bytes, modified_at_ms)
                     VALUES (?1, 1, ?2, 1, 0)",
                    (book(number).as_bytes(), location.as_bytes()),
                )
                .unwrap();
        }

        drop(Database::open(&scratch.config).unwrap());

        let duplicated_books: u32 = connection
            .query_row("SELECT duplicated_books FROM series", [], |row| row.get(0))
            .unwrap();
        assert_eq!(duplicated_books, 1);
    }

    #[test]
    fn keeps_every_book_kept_from_before_details_were_kept_with_none_read_yet() {
        let scratch = ScratchLibrary::new("book-details-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..40]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                 VALUES (zeroblob(16), ?1, 'sample series 01', 'Sample Series 01', x'', 0)",
                [SourceId::local().as_bytes()],
            )
            .unwrap();
        for number in 1..=2 {
            connection
                .execute(
                    "INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
                     VALUES (?1, 1, ?2, x'', 0)",
                    (book(number).as_bytes(), format!("Volume {number:02}")),
                )
                .unwrap();
        }

        drop(Database::open(&scratch.config).unwrap());

        let counted: (u32, u32) = connection
            .query_row(
                "SELECT (SELECT count(*) FROM book), (SELECT count(*) FROM book_details)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(counted, (2, 0));
    }

    #[test]
    fn reads_every_book_s_details_again_once_their_people_and_tags_are_kept() {
        let scratch = ScratchLibrary::new("book-people-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..41]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                 VALUES (zeroblob(16), ?1, 'sample series 01', 'Sample Series 01', x'', 0)",
                [SourceId::local().as_bytes()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
                 VALUES (?1, 1, 'Volume 01', x'', 0)",
                [book(1).as_bytes()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO book_details (book_id, summary) VALUES (?1, 'A sample summary.')",
                [book(1).as_bytes()],
            )
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let counted: (u32, u32) = connection
            .query_row(
                "SELECT (SELECT count(*) FROM book), (SELECT count(*) FROM book_details)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(counted, (1, 0));
    }

    #[test]
    fn names_the_language_and_rating_of_each_series_kept_from_before_from_its_books() {
        let scratch = ScratchLibrary::new("series-language-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..42]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                 VALUES (zeroblob(16), ?1, 'sample series 01', 'Sample Series 01', x'', 0)",
                [SourceId::local().as_bytes()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
                 VALUES (?1, 1, 'Volume 01', x'', 0)",
                [book(1).as_bytes()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO book_details (book_id, language, age_rating) VALUES (?1, 'ja', 'x_18')",
                [book(1).as_bytes()],
            )
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let named: (String, u32) = connection
            .query_row(
                "SELECT language, adult_rated_books FROM series",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(named, ("ja".to_owned(), 1));
    }

    #[test]
    fn keeps_the_order_key_of_each_book_kept_from_before_as_its_reading_order_key() {
        let scratch = ScratchLibrary::new("reading-order-key-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..44]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                 VALUES (zeroblob(16), ?1, 'sample series 01', 'Sample Series 01', x'', 0)",
                [SourceId::local().as_bytes()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO book (id, series_local_id, title, title_sort_key, added_at_ms)
                 VALUES (?1, 1, 'Volume 01', x'0102', 0)",
                [book(1).as_bytes()],
            )
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let key: Vec<u8> = connection
            .query_row("SELECT reading_order_key FROM book", [], |row| row.get(0))
            .unwrap();
        assert_eq!(key, [1, 2]);
    }

    #[test]
    fn leaves_each_book_kept_from_before_unplaced_until_it_is_read_again() {
        let scratch = ScratchLibrary::new("book-numbers-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..45]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                 VALUES (zeroblob(16), ?1, 'sample series 01', 'Sample Series 01', x'', 0)",
                [SourceId::local().as_bytes()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO book (id, series_local_id, title, reading_order_key, added_at_ms)
                 VALUES (?1, 1, 'Volume 01', x'0102', 0)",
                [book(1).as_bytes()],
            )
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let placed: Vec<Value> = connection
            .query_row(
                "SELECT kind, first_number, last_number, number_source, volume_number,
                    volume_source
                FROM book",
                [],
                |row| (0..6).map(|column| row.get(column)).collect(),
            )
            .unwrap();
        assert_eq!(placed, vec![Value::Null; 6]);
    }

    #[test]
    fn accepts_each_book_whose_kind_numbers_and_sources_agree() {
        let library = PlacedBooks::open("book-numbers-agree");
        let agreeing = [
            "NULL, NULL, NULL, NULL, NULL, NULL",
            "'volume', 1000, 3000, 'file_name', NULL, NULL",
            "'chapter', 12500, 12500, 'file_name', 3000, 'folder_name'",
            "'chapter', NULL, NULL, NULL, 3000, 'folder_name'",
            "'chapter', NULL, NULL, NULL, NULL, NULL",
            "'special', 0, 0, 'files', NULL, NULL",
            "'special', NULL, NULL, NULL, NULL, NULL",
        ];

        let refused: Vec<&str> = (1..)
            .zip(agreeing)
            .filter(|&(number, values)| library.place(number, values).is_err())
            .map(|(_, values)| values)
            .collect();

        assert_eq!(refused, Vec::<&str>::new());
    }

    #[test]
    fn refuses_each_book_whose_kind_numbers_and_sources_disagree() {
        let library = PlacedBooks::open("book-numbers-disagree");
        let disagreeing = [
            "'omnibus', NULL, NULL, NULL, NULL, NULL",
            "'volume', NULL, NULL, NULL, NULL, NULL",
            "NULL, 1000, 1000, 'file_name', NULL, NULL",
            "'chapter', -1000, -1000, 'file_name', NULL, NULL",
            "'chapter', 1000, NULL, 'file_name', NULL, NULL",
            "'chapter', NULL, 1000, 'file_name', NULL, NULL",
            "'chapter', 2000, 1000, 'file_name', NULL, NULL",
            "'chapter', 1000, 1000, NULL, NULL, NULL",
            "'chapter', NULL, NULL, 'file_name', NULL, NULL",
            "'chapter', 1000, 1000, 'guessed', NULL, NULL",
            "'chapter', NULL, NULL, NULL, -1000, 'folder_name'",
            "'chapter', NULL, NULL, NULL, 1000, NULL",
            "'chapter', NULL, NULL, NULL, NULL, 'folder_name'",
            "'chapter', NULL, NULL, NULL, 1000, 'guessed'",
            "'volume', 1000, 1000, 'file_name', 1000, 'folder_name'",
            "'special', NULL, NULL, NULL, 1000, 'folder_name'",
        ];

        let accepted: Vec<&str> = (1..)
            .zip(disagreeing)
            .filter(|&(number, values)| !library.refuses_by_check(number, values))
            .map(|(_, values)| values)
            .collect();

        assert_eq!(accepted, Vec::<&str>::new());
    }

    #[test]
    fn keeps_the_view_stored_before_series_could_be_grouped_by_creator() {
        let scratch = ScratchLibrary::new("library-view-creator-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..46]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute_batch(
                "INSERT INTO library_view (
                    id, display, phone_covers_per_row, tablet_covers_per_row,
                    desktop_covers_per_row, shows_item_counts, shows_unread_count,
                    shows_downloaded, shows_language, shows_reading_progress,
                    shows_continue_button, shows_continue_row, fits_covers_to_width,
                    shows_category_tabs, group_by
                 )
                 VALUES (1, 'list', 4, 7, 10, 1, 1, 0, 1, 0, 1, 1, 0, 0, 'folder');",
            )
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let view = library_view(&connection).unwrap().unwrap();
        assert_eq!(
            view,
            StoredLibraryView {
                display: LibraryDisplay::List,
                group_by: LibraryGrouping::Folder,
                shows_category_tabs: false,
                phone_covers_per_row: 4,
                tablet_covers_per_row: 7,
                desktop_covers_per_row: 10,
                fits_covers_to_width: false,
                shows_item_counts: true,
                shows_continue_row: true,
                on_covers: OnCovers {
                    shows_unread_count: true,
                    shows_downloaded: false,
                    shows_language: true,
                    shows_reading_progress: false,
                    shows_continue_button: true,
                },
            }
        );
    }

    #[test]
    fn lists_the_writers_kept_from_before_their_names_were_keyed_in_title_order() {
        let scratch = ScratchLibrary::new("writer-keys-upgrade");
        drop(Database::open_with(&scratch.config, &MIGRATIONS[..47]).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        connection
            .execute(
                "UPDATE title_key_stamp SET stamp = ?1",
                [TitleStamp::of(&Language::ROOT).as_bytes()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                 VALUES (zeroblob(16), ?1, 'sample series 01', 'Sample Series 01', x'', 0)",
                [SourceId::local().as_bytes()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO book (id, series_local_id, title, reading_order_key, added_at_ms)
                 VALUES (?1, 1, 'Volume 01', x'', 0)",
                [book(1).as_bytes()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO book_details (book_id) VALUES (?1)",
                [book(1).as_bytes()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO book_person (book_id, role, name)
                 VALUES (?1, 'writer', 'Sample Author 10'), (?1, 'writer', 'Sample Author 9')",
                [book(1).as_bytes()],
            )
            .unwrap();

        drop(Database::open(&scratch.config).unwrap());

        let request = PageRequest {
            after: None,
            size: PageSize::try_from(10).unwrap(),
        };
        let listed: Vec<String> = writers(&connection, &request)
            .unwrap()
            .items
            .into_iter()
            .map(|writer| writer.name)
            .collect();
        assert_eq!(listed, ["Sample Author 9", "Sample Author 10"]);
    }

    #[test]
    fn moves_a_book_s_pages_left_onto_its_series_through_their_keys() {
        let scratch = ScratchLibrary::new("pages-left-of-book-plan");

        let plan = scratch.query_plan(PAGES_LEFT_OF_BOOK_ADDED);

        assert_eq!(
            plan,
            [
                "SEARCH book USING PRIMARY KEY (id=?)",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
                "SEARCH book_state USING PRIMARY KEY (book_id=?) LEFT-JOIN",
            ]
        );
    }

    #[test]
    fn counts_the_files_of_a_book_from_an_index_when_one_comes_or_goes() {
        let scratch = ScratchLibrary::new("files-of-book-plan");

        let plan = scratch.query_plan(FILES_OF_BOOK);

        assert_eq!(
            plan,
            ["SEARCH book_file USING COVERING INDEX book_file_by_book (book_id=?)"]
        );
    }

    #[test]
    fn finds_the_book_a_series_gained_last_from_an_index_when_one_leaves_it() {
        let scratch = ScratchLibrary::new("book-gained-last-plan");

        let plan = scratch.query_plan(BOOK_GAINED_LAST);

        assert_eq!(
            plan,
            ["SEARCH book USING COVERING INDEX book_by_series_and_added (series_local_id=?)"]
        );
    }

    fn schema_of(path: &Path) -> Schema {
        let connection = Connection::open(path).unwrap();
        let pragma = |name| connection.pragma_query_value(None, name, |row| row.get(0));
        let mut statement = connection
            .prepare("SELECT type, name, sql FROM sqlite_schema ORDER BY type, name")
            .unwrap();
        let objects = statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        (
            pragma("user_version").unwrap(),
            pragma("application_id").unwrap(),
            objects,
        )
    }
}
