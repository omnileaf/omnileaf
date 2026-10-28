use rusqlite::{Connection, OptionalExtension, Params, Row, named_params};

use crate::{
    Error,
    catalog::{
        cursor::Position,
        page::{Page, PageRequest},
        staged_rows::snapshot,
    },
};

macro_rules! writers_of_listed_series {
    () => {
        "SELECT book_person.name, count(DISTINCT series.local_id) AS series_count
        FROM book_person
        JOIN book ON book.id = book_person.book_id
        JOIN series ON series.local_id = book.series_local_id
        WHERE book_person.role = 'writer' AND series.reading_stage IS NOT NULL"
    };
}

macro_rules! in_name_order {
    () => {
        " GROUP BY book_person.name_key, book_person.name
        ORDER BY book_person.name_key, book_person.name
        LIMIT :limit"
    };
}

const FIRST_WRITERS: &str = concat!(writers_of_listed_series!(), in_name_order!());
const WRITERS_AFTER: &str = concat!(
    writers_of_listed_series!(),
    " AND (book_person.name_key, book_person.name) > (:after_key, :after_name)",
    in_name_order!()
);
const KEY_OF_WRITER: &str =
    "SELECT name_key FROM book_person WHERE name = ?1 AND role = 'writer' LIMIT 1";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WriterSummary {
    pub name: String,
    pub series_count: u32,
}

#[tracing::instrument(skip_all, fields(size = ?request.size))]
pub fn writers(
    connection: &Connection,
    request: &PageRequest,
) -> Result<Page<WriterSummary>, Error> {
    let _snapshot = snapshot(connection)?;
    let limit = request.size.rows_to_fetch();
    let rows = match request.after.as_ref().map(|cursor| &cursor.0) {
        None => listed(connection, FIRST_WRITERS, named_params! { ":limit": limit }),
        Some(Position::Writer { name }) => {
            let key = key_of_writer(connection, name)?;
            listed(
                connection,
                WRITERS_AFTER,
                named_params! { ":limit": limit, ":after_key": key, ":after_name": name },
            )
        }
        Some(
            Position::Title { .. }
            | Position::Added { .. }
            | Position::Book { .. }
            | Position::Root { .. }
            | Position::LastRead { .. }
            | Position::Session { .. }
            | Position::LastUpdated { .. }
            | Position::UnreadCount { .. }
            | Position::TimeLeft { .. },
        ) => Err(Error::CursorForAnotherList),
    }?;
    Ok(Page::of(rows, request.size))
}

fn key_of_writer(connection: &Connection, name: &str) -> Result<Vec<u8>, Error> {
    connection
        .prepare(KEY_OF_WRITER)?
        .query_row([name], |row| row.get(0))
        .optional()?
        .ok_or(Error::StaleCursor)
}

fn listed(
    connection: &Connection,
    sql: &str,
    params: impl Params,
) -> Result<Vec<(WriterSummary, Position)>, Error> {
    Ok(connection
        .prepare(sql)?
        .query_map(params, writer_row)?
        .collect::<Result<_, _>>()?)
}

fn writer_row(row: &Row<'_>) -> rusqlite::Result<(WriterSummary, Position)> {
    let name: String = row.get("name")?;
    let position = Position::Writer { name: name.clone() };
    Ok((
        WriterSummary {
            name,
            series_count: row.get("series_count")?,
        },
        position,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    const WRITERS_IN_KEY_ORDER: &str =
        "SCAN book_person USING COVERING INDEX book_person_by_writer";
    const WRITERS_AFTER_A_KEY: &str =
        "SEARCH book_person USING COVERING INDEX book_person_by_writer ((name_key,name)>(?,?))";

    #[test]
    fn walks_the_writers_in_key_order_without_sorting() {
        let scratch = ScratchLibrary::new("writers-plan");

        let plans = [FIRST_WRITERS, WRITERS_AFTER].map(|query| scratch.query_plan(query));

        let walked = [WRITERS_IN_KEY_ORDER, WRITERS_AFTER_A_KEY];
        for (plan, walk) in plans.iter().zip(walked) {
            assert_eq!(
                plan,
                &[
                    walk,
                    "SEARCH book USING PRIMARY KEY (id=?)",
                    "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
                    "USE TEMP B-TREE FOR count(DISTINCT)",
                ]
            );
        }
    }

    #[test]
    fn finds_a_writer_s_key_by_their_name() {
        let scratch = ScratchLibrary::new("writer-key-plan");

        let plan = scratch.query_plan(KEY_OF_WRITER);

        assert_eq!(
            plan,
            ["SEARCH book_person USING INDEX book_person_by_name (name=?)"]
        );
    }
}
