use rusqlite::{Connection, OptionalExtension, Params, Row, named_params};

use crate::{
    Error,
    catalog::{
        cursor::Position,
        page::{Page, PageRequest},
        staged_rows::snapshot,
    },
    title_key::{TitleStamp, stored_stamp},
};

macro_rules! writers_of_listed_series {
    () => {
        "SELECT book_person.name_key, book_person.name,
            count(DISTINCT series.local_id) AS series_count
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

struct WriterPlace {
    name_key: Vec<u8>,
    name: String,
}

#[tracing::instrument(skip_all, fields(size = ?request.size))]
pub fn writers(
    connection: &Connection,
    request: &PageRequest,
) -> Result<Page<WriterSummary>, Error> {
    let _snapshot = snapshot(connection)?;
    let stamp = stored_stamp(connection)?;
    let limit = request.size.rows_to_fetch();
    let place = request
        .after
        .as_ref()
        .map(|cursor| place_after(connection, stamp, &cursor.0))
        .transpose()?;
    let rows = match place {
        None => listed(connection, FIRST_WRITERS, named_params! { ":limit": limit }),
        Some(WriterPlace { name_key, name }) => listed(
            connection,
            WRITERS_AFTER,
            named_params! { ":limit": limit, ":after_key": name_key, ":after_name": name },
        ),
    }?;
    let rows = rows
        .into_iter()
        .map(|(writer, WriterPlace { name_key, name })| {
            let position = Position::Writer {
                stamp,
                name_key,
                name,
            };
            (writer, position)
        })
        .collect();
    Ok(Page::of(rows, request.size))
}

fn place_after(
    connection: &Connection,
    current: TitleStamp,
    after: &Position,
) -> Result<WriterPlace, Error> {
    match after {
        Position::Writer {
            stamp,
            name_key,
            name,
        } if *stamp == current => Ok(WriterPlace {
            name_key: name_key.clone(),
            name: name.clone(),
        }),
        Position::Writer { name, .. } => connection
            .prepare(KEY_OF_WRITER)?
            .query_row([name], |row| row.get(0))
            .optional()?
            .map(|name_key| WriterPlace {
                name_key,
                name: name.clone(),
            })
            .ok_or(Error::StaleCursor),
        Position::Title { .. }
        | Position::Added { .. }
        | Position::Book { .. }
        | Position::Root { .. }
        | Position::LastRead { .. }
        | Position::Session { .. }
        | Position::LastUpdated { .. }
        | Position::UnreadCount { .. }
        | Position::TimeLeft { .. } => Err(Error::CursorForAnotherList),
    }
}

fn listed(
    connection: &Connection,
    sql: &str,
    params: impl Params,
) -> Result<Vec<(WriterSummary, WriterPlace)>, Error> {
    Ok(connection
        .prepare(sql)?
        .query_map(params, writer_row)?
        .collect::<Result<_, _>>()?)
}

fn writer_row(row: &Row<'_>) -> rusqlite::Result<(WriterSummary, WriterPlace)> {
    let name: String = row.get("name")?;
    let place = WriterPlace {
        name_key: row.get("name_key")?,
        name: name.clone(),
    };
    Ok((
        WriterSummary {
            name,
            series_count: row.get("series_count")?,
        },
        place,
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
