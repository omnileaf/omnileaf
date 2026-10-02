//! The sync rules no compiler checks: only the write path writes the sync tables, and projections carry no references or unique values.

use std::{
    collections::{BTreeMap, BTreeSet},
    fmt,
};

use crate::policy::RepositoryFile;

const PROJECTOR: &str = "crates/omnileaf-db/src/store/projector.rs";
const REGISTER_WRITER: &str = "crates/omnileaf-db/src/store/register.rs";
const LOCAL_WRITER: &str = "crates/omnileaf-db/src/store/local.rs";
const SYNC_TABLE_WRITERS: &[(&str, &str)] = &[
    ("sync_register", REGISTER_WRITER),
    ("sync_local", LOCAL_WRITER),
];
const MIGRATIONS: &str = "crates/omnileaf-db/migrations/";
const SQL_EXTENSION: &str = ".sql";
const RUST_EXTENSION: &str = ".rs";
const SOURCE_ROOTS: &[&str] = &["crates/", "app/src-tauri/"];
const INTEGRATION_TESTS: &str = "/tests/";
const STATEMENT_END: char = ';';

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Violation {
    NoProjector,
    NoProjections,
    ForeignWrite {
        path: String,
        table: String,
        writer: &'static str,
    },
    ProjectionReference {
        table: String,
    },
    ProjectionUnique {
        table: String,
    },
}

impl fmt::Display for Violation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoProjector => write!(f, "{PROJECTOR} is missing, so no projection is known"),
            Self::NoProjections => {
                write!(f, "{PROJECTOR} writes no table a migration creates")
            }
            Self::ForeignWrite {
                path,
                table,
                writer,
            } => write!(f, "{path}: writes {table}, which only {writer} may write"),
            Self::ProjectionReference { table } => write!(
                f,
                "projection {table} refers to another table, so it can't be rebuilt from the registers alone"
            ),
            Self::ProjectionUnique { table } => write!(
                f,
                "projection {table} holds a unique value, which merging registers from two devices can break"
            ),
        }
    }
}

#[derive(Default)]
struct Schema {
    tables: BTreeMap<String, String>,
    unique_indexed: BTreeSet<String>,
}

pub(crate) fn check(files: &[RepositoryFile<'_>]) -> Vec<Violation> {
    let migrations: Vec<(&str, String)> = files
        .iter()
        .filter(|file| file.path.starts_with(MIGRATIONS) && file.path.ends_with(SQL_EXTENSION))
        .map(|file| (file.path, lowered(file)))
        .collect();
    let schema = schema_of(&migrations);
    let Some(projector) = files.iter().find(|file| file.path == PROJECTOR) else {
        return vec![Violation::NoProjector];
    };
    let projections: BTreeSet<String> = written_tables(&lowered(projector))
        .into_iter()
        .filter(|table| schema.tables.contains_key(table))
        .collect();
    if projections.is_empty() {
        return vec![Violation::NoProjections];
    }
    let writers: BTreeMap<&str, &'static str> = projections
        .iter()
        .map(|table| (table.as_str(), PROJECTOR))
        .chain(SYNC_TABLE_WRITERS.iter().copied())
        .collect();
    let mut violations = Vec::new();
    for file in files.iter().filter(|file| is_product_source(file.path)) {
        for table in written_tables(&lowered(file)) {
            if let Some(&writer) = writers.get(table.as_str())
                && writer != file.path
            {
                violations.push(Violation::ForeignWrite {
                    path: file.path.to_owned(),
                    table,
                    writer,
                });
            }
        }
    }
    for (path, text) in &migrations {
        for table in written_tables(text).intersection(&projections) {
            violations.push(Violation::ForeignWrite {
                path: (*path).to_owned(),
                table: table.clone(),
                writer: PROJECTOR,
            });
        }
    }
    for table in &projections {
        let definition = schema.tables.get(table).map_or("", String::as_str);
        if has_word(definition, "references") {
            violations.push(Violation::ProjectionReference {
                table: table.clone(),
            });
        }
        if has_word(definition, "unique") || schema.unique_indexed.contains(table) {
            violations.push(Violation::ProjectionUnique {
                table: table.clone(),
            });
        }
    }
    violations
}

fn lowered(file: &RepositoryFile<'_>) -> String {
    String::from_utf8_lossy(file.bytes).to_lowercase()
}

fn is_product_source(path: &str) -> bool {
    path.ends_with(RUST_EXTENSION)
        && SOURCE_ROOTS.iter().any(|root| path.starts_with(root))
        && !path.contains(INTEGRATION_TESTS)
}

fn schema_of(migrations: &[(&str, String)]) -> Schema {
    let mut schema = Schema::default();
    for statement in migrations
        .iter()
        .flat_map(|(_, text)| text.split(STATEMENT_END))
    {
        let words: Vec<&str> = statement.split_whitespace().collect();
        match words.as_slice() {
            ["create", "table", "if", "not", "exists", name, ..]
            | ["create", "table", name, ..] => {
                schema
                    .tables
                    .insert(leading_name(name).to_owned(), statement.to_owned());
            }
            ["create", "unique", "index", rest @ ..] => {
                if let Some(table) = rest.iter().skip_while(|word| **word != "on").nth(1) {
                    schema.unique_indexed.insert(leading_name(table).to_owned());
                }
            }
            _ => {}
        }
    }
    schema
}

/// Tables an `INSERT`, `REPLACE`, `UPDATE` or `DELETE` in lowercased source names, whether in SQL files or Rust string literals.
fn written_tables(text: &str) -> BTreeSet<String> {
    let words: Vec<&str> = text.split_whitespace().collect();
    let name_at = |index: usize| words.get(index).map_or("", |word| leading_name(word));
    let mut tables = BTreeSet::new();
    for (index, word) in words.iter().enumerate() {
        let table = match trailing_keyword(word) {
            "into" => name_at(index + 1),
            "update" => match name_at(index + 1) {
                "or" => name_at(index + 3),
                "set" => "",
                name => name,
            },
            "delete" if name_at(index + 1) == "from" => name_at(index + 2),
            _ => "",
        };
        if !table.is_empty() {
            tables.insert(table.to_owned());
        }
    }
    tables
}

fn is_name_char(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_'
}

/// The name a word starts with once quotes and brackets are dropped, as in `"book_state(book_id`.
fn leading_name(word: &str) -> &str {
    let name = word.trim_start_matches(|character| !is_name_char(character));
    let end = name
        .find(|character| !is_name_char(character))
        .unwrap_or(name.len());
    name.get(..end).unwrap_or_default()
}

/// The keyword a word ends with, as in `execute("delete`; empty when punctuation follows, as in `.into()`.
fn trailing_keyword(word: &str) -> &str {
    let start = word
        .rfind(|character| !is_name_char(character))
        .map_or(0, |position| position + 1);
    word.get(start..).unwrap_or_default()
}

fn has_word(text: &str, wanted: &str) -> bool {
    text.split(|character| !is_name_char(character))
        .any(|word| word == wanted)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROJECTION: &str = "CREATE TABLE book_state (
        book_id BLOB PRIMARY KEY,
        position_page INTEGER CHECK (position_page >= 0)
    ) STRICT, WITHOUT ROWID;";
    const SYNC_TABLES: &str = "CREATE TABLE sync_local (id INTEGER PRIMARY KEY);
        INSERT INTO sync_local (id) VALUES (1);
        CREATE TABLE sync_register (entity TEXT NOT NULL, PRIMARY KEY (entity));";
    const PROJECTOR_SOURCE: &str = r#"
        const PROJECT: &str = "INSERT INTO book_state (book_id, position_page) VALUES (?1, ?2)
            ON CONFLICT (book_id) DO UPDATE SET position_page = excluded.position_page";
        fn rebuild(connection: &Connection) {
            connection.execute("DELETE FROM book_state", []);
            let key = stored.into();
        }"#;

    fn text(path: &'static str, content: &'static str) -> RepositoryFile<'static> {
        RepositoryFile {
            path,
            bytes: content.as_bytes(),
        }
    }

    fn library_with(
        extra: impl IntoIterator<Item = RepositoryFile<'static>>,
    ) -> Vec<RepositoryFile<'static>> {
        let mut files = vec![
            text(
                "crates/omnileaf-db/migrations/0005_create_sync.sql",
                SYNC_TABLES,
            ),
            text(
                "crates/omnileaf-db/migrations/0006_create_state.sql",
                PROJECTION,
            ),
            text(PROJECTOR, PROJECTOR_SOURCE),
            text(
                REGISTER_WRITER,
                "connection.prepare(\"INSERT INTO sync_register (entity) VALUES (?1)\")",
            ),
            text(
                LOCAL_WRITER,
                "connection.execute(\"UPDATE sync_local SET hlc = ?1\", [])",
            ),
        ];
        files.extend(extra);
        files
    }

    #[test]
    fn passes_projections_and_registers_written_only_by_their_writers() {
        let violations = check(&library_with([]));

        assert_eq!(violations, []);
    }

    #[test]
    fn flags_a_projection_written_outside_the_projector() {
        let elsewhere = text(
            "crates/omnileaf-engine/src/reader.rs",
            "connection.execute(\"UPDATE OR REPLACE book_state SET is_read = 1\", [])",
        );

        let violations = check(&library_with([elsewhere]));

        assert_eq!(
            violations,
            [Violation::ForeignWrite {
                path: "crates/omnileaf-engine/src/reader.rs".to_owned(),
                table: "book_state".to_owned(),
                writer: PROJECTOR,
            }]
        );
    }

    #[test]
    fn flags_a_register_written_outside_the_write_path() {
        let elsewhere = text(
            "crates/omnileaf-db/src/catalog/book.rs",
            "transaction.execute(\"insert   into\n sync_register(entity) VALUES ('book')\", [])",
        );

        let violations = check(&library_with([elsewhere]));

        assert_eq!(
            violations,
            [Violation::ForeignWrite {
                path: "crates/omnileaf-db/src/catalog/book.rs".to_owned(),
                table: "sync_register".to_owned(),
                writer: REGISTER_WRITER,
            }]
        );
    }

    #[test]
    fn flags_a_migration_that_writes_a_projection() {
        let trigger = text(
            "crates/omnileaf-db/migrations/0007_add_trigger.sql",
            "CREATE TRIGGER fill AFTER INSERT ON book BEGIN
                 INSERT INTO book_state (book_id) VALUES (new.id);
             END;",
        );

        let violations = check(&library_with([trigger]));

        assert_eq!(
            violations,
            [Violation::ForeignWrite {
                path: "crates/omnileaf-db/migrations/0007_add_trigger.sql".to_owned(),
                table: "book_state".to_owned(),
                writer: PROJECTOR,
            }]
        );
    }

    #[test]
    fn leaves_integration_tests_free_to_seed_any_table() {
        let seeding = text(
            "crates/omnileaf-db/tests/projections.rs",
            "transaction.execute_batch(\"INSERT INTO sync_register (entity) VALUES ('book')\")",
        );

        let violations = check(&library_with([seeding]));

        assert_eq!(violations, []);
    }

    #[test]
    fn flags_a_projection_that_refers_to_another_table() {
        let files = [
            text(
                "crates/omnileaf-db/migrations/0006_create_state.sql",
                "CREATE TABLE book_state (book_id BLOB PRIMARY KEY REFERENCES book (id));",
            ),
            text(PROJECTOR, PROJECTOR_SOURCE),
        ];

        let violations = check(&files);

        assert_eq!(
            violations,
            [Violation::ProjectionReference {
                table: "book_state".to_owned()
            }]
        );
    }

    #[test]
    fn flags_a_projection_holding_a_unique_value() {
        let unique_index = text(
            "crates/omnileaf-db/migrations/0007_add_index.sql",
            "CREATE UNIQUE INDEX book_state_by_page ON book_state (position_page);",
        );

        let violations = check(&library_with([unique_index]));

        assert_eq!(
            violations,
            [Violation::ProjectionUnique {
                table: "book_state".to_owned()
            }]
        );
    }

    #[test]
    fn flags_a_projector_that_is_missing_or_writes_no_table() {
        let without = check(&[text(
            "crates/omnileaf-db/migrations/0006_create_state.sql",
            PROJECTION,
        )]);
        let writing_nothing = check(&[
            text(
                "crates/omnileaf-db/migrations/0006_create_state.sql",
                PROJECTION,
            ),
            text(PROJECTOR, "fn project() {}"),
        ]);

        assert_eq!(
            (without, writing_nothing),
            (vec![Violation::NoProjector], vec![Violation::NoProjections])
        );
    }
}
