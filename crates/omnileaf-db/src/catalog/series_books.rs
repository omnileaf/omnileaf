use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::{Connection, Row, Statement, ToSql, named_params};

use crate::{
    Error,
    catalog::{
        SortDirection,
        cursor::Position,
        page::{Page, PageRequest},
        stored_id::stored_id,
    },
};

macro_rules! books_in_series {
    ($direction:literal $(, $condition:expr)*) => {
        concat!(
            "SELECT book.id, book.title, book.title_sort_key, book.added_at_ms,
                book_state.is_read, book_state.is_started, book_state.position_page
            FROM book
            LEFT JOIN book_state ON book_state.book_id = book.id
            WHERE book.series_local_id = (SELECT local_id FROM series WHERE id = :series)",
            $(" AND ", $condition,)*
            " ORDER BY book.title_sort_key ", $direction, ", book.id ", $direction,
            " LIMIT :limit"
        )
    };
}

macro_rules! after_cursor {
    (ASC) => {
        "(book.title_sort_key, book.id) > (:after_key, :after_id)"
    };
    (DESC) => {
        "(book.title_sort_key, book.id) < (:after_key, :after_id)"
    };
}

macro_rules! not_read {
    () => {
        "book_state.is_read IS NOT 1"
    };
}

const FIRST_IN_SERIES: &str = books_in_series!("ASC");
const NEXT_IN_SERIES: &str = books_in_series!("ASC", after_cursor!(ASC));
const LAST_IN_SERIES: &str = books_in_series!("DESC");
const PREVIOUS_IN_SERIES: &str = books_in_series!("DESC", after_cursor!(DESC));
const FIRST_UNREAD_IN_SERIES: &str = books_in_series!("ASC", not_read!());
const NEXT_UNREAD_IN_SERIES: &str = books_in_series!("ASC", not_read!(), after_cursor!(ASC));
const LAST_UNREAD_IN_SERIES: &str = books_in_series!("DESC", not_read!());
const PREVIOUS_UNREAD_IN_SERIES: &str = books_in_series!("DESC", not_read!(), after_cursor!(DESC));
const FIRST_STARTED_UNREAD: &str =
    books_in_series!("ASC", "book_state.is_started IS 1", not_read!());
const ONE_BOOK: i64 = 1;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BookSummary {
    pub id: BookId,
    pub title: String,
    pub added_at_ms: i64,
    pub reading: BookReading,
}

/// Which of a series' books a list holds, and which way round.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BookListing {
    pub shown: BooksShown,
    pub direction: SortDirection,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BooksShown {
    All,
    /// Only the books not marked read.
    Unread,
}

impl BookListing {
    pub const IN_ORDER: Self = Self {
        shown: BooksShown::All,
        direction: SortDirection::Ascending,
    };

    const fn query(self, is_continued: bool) -> &'static str {
        match (self.shown, self.direction, is_continued) {
            (BooksShown::All, SortDirection::Ascending, false) => FIRST_IN_SERIES,
            (BooksShown::All, SortDirection::Ascending, true) => NEXT_IN_SERIES,
            (BooksShown::All, SortDirection::Descending, false) => LAST_IN_SERIES,
            (BooksShown::All, SortDirection::Descending, true) => PREVIOUS_IN_SERIES,
            (BooksShown::Unread, SortDirection::Ascending, false) => FIRST_UNREAD_IN_SERIES,
            (BooksShown::Unread, SortDirection::Ascending, true) => NEXT_UNREAD_IN_SERIES,
            (BooksShown::Unread, SortDirection::Descending, false) => LAST_UNREAD_IN_SERIES,
            (BooksShown::Unread, SortDirection::Descending, true) => PREVIOUS_UNREAD_IN_SERIES,
        }
    }
}

/// How far a book has been read, as the synced registers last projected it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BookReading {
    NotStarted,
    /// Opened, or given a furthest page, and not marked read; the position is absent when only the furthest page is known.
    Started {
        position_page: Option<u32>,
    },
    Read,
}

/// A series missing from the catalog has no books, so its page is empty.
#[tracing::instrument(skip_all, fields(%series, ?listing, size = ?request.size))]
pub fn series_books(
    connection: &Connection,
    series: SeriesId,
    listing: BookListing,
    request: &PageRequest,
) -> Result<Page<BookSummary>, Error> {
    let series_id = series.as_bytes();
    let limit = request.size.rows_to_fetch();
    match request.after.as_ref().map(|cursor| &cursor.0) {
        None => read(
            series,
            connection.prepare(listing.query(false))?,
            named_params! { ":series": series_id, ":limit": limit },
        ),
        Some(Position::Book {
            series: listed,
            sort_key,
            id,
        }) if *listed == series => read(
            series,
            connection.prepare(listing.query(true))?,
            named_params! {
                ":series": series_id,
                ":after_key": sort_key,
                ":after_id": id.as_bytes(),
                ":limit": limit,
            },
        ),
        Some(
            Position::Book { .. }
            | Position::Title { .. }
            | Position::Added { .. }
            | Position::Root { .. },
        ) => Err(Error::CursorForAnotherList),
    }
    .map(|rows| Page::of(rows, request.size))
}

/// The book reading the series goes on from: its first book in order that is started and not read, or else its first book not read.
#[tracing::instrument(skip_all, fields(%series))]
pub fn up_next(connection: &Connection, series: SeriesId) -> Result<Option<BookSummary>, Error> {
    let params = named_params! { ":series": series.as_bytes(), ":limit": ONE_BOOK };
    for query in [FIRST_STARTED_UNREAD, FIRST_UNREAD_IN_SERIES] {
        let found = read(series, connection.prepare(query)?, params)?;
        if let Some((book, _)) = found.into_iter().next() {
            return Ok(Some(book));
        }
    }
    Ok(None)
}

fn read(
    series: SeriesId,
    mut statement: Statement<'_>,
    params: &[(&str, &dyn ToSql)],
) -> Result<Vec<(BookSummary, Position)>, Error> {
    let rows = statement.query_map(params, |row| {
        let id = stored_id(row, "id")?;
        let book = BookSummary {
            id,
            title: row.get("title")?,
            added_at_ms: row.get("added_at_ms")?,
            reading: stored_reading(row)?,
        };
        let position = Position::Book {
            series,
            sort_key: row.get("title_sort_key")?,
            id,
        };
        Ok((book, position))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Reads `is_read`, `is_started` and `position_page`, which a book with no reading state leaves null.
fn stored_reading(row: &Row<'_>) -> rusqlite::Result<BookReading> {
    let is_read: Option<bool> = row.get("is_read")?;
    let is_started: Option<bool> = row.get("is_started")?;
    Ok(match (is_read, is_started) {
        (Some(true), _) => BookReading::Read,
        (_, Some(true)) => BookReading::Started {
            position_page: row.get("position_page")?,
        },
        _ => BookReading::NotStarted,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn starts_a_series_books_and_their_reading_state_by_index_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("first-series-books-plan");

        let plan = scratch.query_plan(FIRST_IN_SERIES);

        assert_eq!(
            plan,
            [
                "SEARCH book USING INDEX book_by_series (series_local_id=?)",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH book_state USING PRIMARY KEY (book_id=?) LEFT-JOIN",
            ]
        );
    }

    #[test]
    fn walks_a_series_books_and_their_reading_state_by_index_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("series-books-plan");

        let plan = scratch.query_plan(NEXT_IN_SERIES);

        assert_eq!(
            plan,
            [
                "SEARCH book USING INDEX book_by_series (series_local_id=? AND (title_sort_key,id)>(?,?))",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH book_state USING PRIMARY KEY (book_id=?) LEFT-JOIN",
            ]
        );
    }

    #[test]
    fn lists_a_series_books_either_way_round_and_only_unread_by_index_without_sorting() {
        let scratch = ScratchLibrary::new("book-listing-plans");
        let listings = [BooksShown::All, BooksShown::Unread]
            .into_iter()
            .flat_map(|shown| {
                [SortDirection::Ascending, SortDirection::Descending]
                    .map(|direction| BookListing { shown, direction })
            });

        let plans: Vec<Vec<String>> = listings
            .flat_map(|listing| [listing.query(false), listing.query(true)])
            .map(|query| scratch.query_plan(query))
            .collect();

        for plan in plans {
            assert!(
                plan[0].starts_with("SEARCH book USING INDEX book_by_series (series_local_id=?"),
                "{plan:?}"
            );
            assert!(
                !plan.iter().any(|step| step.contains("TEMP B-TREE")),
                "{plan:?}"
            );
        }
    }

    #[test]
    fn finds_what_is_up_next_by_walking_the_series_books_in_order_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("up-next-plan");

        let plans =
            [FIRST_STARTED_UNREAD, FIRST_UNREAD_IN_SERIES].map(|query| scratch.query_plan(query));

        let walking_in_order = [
            "SEARCH book USING INDEX book_by_series (series_local_id=?)",
            "SCALAR SUBQUERY 1",
            "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
            "SEARCH book_state USING PRIMARY KEY (book_id=?) LEFT-JOIN",
        ];
        assert_eq!(plans, [walking_in_order, walking_in_order]);
    }
}
