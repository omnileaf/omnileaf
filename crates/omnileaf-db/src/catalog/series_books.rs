use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::{Connection, Row, ToSql, named_params};

use crate::{
    Error,
    catalog::{
        SortDirection,
        cursor::Position,
        page::{Page, PageRequest},
        staged_rows::snapshot,
        stored_id::stored_id,
    },
};

macro_rules! books_in_series {
    ($direction:literal $(, $condition:expr)*) => {
        concat!(
            "SELECT book.id, book.title_sort_key,
                book_state.is_read, book_state.is_started, book_state.position_page
            FROM book
            LEFT JOIN book_state ON book_state.book_id = book.id
            WHERE book.series_local_id = (SELECT local_id FROM series WHERE id = :series)",
            $(" AND ", $condition,)*
            " ORDER BY book.title_sort_key ", $direction, ", book.id ", $direction
        )
    };
}

macro_rules! not_read {
    () => {
        "book_state.is_read IS NOT 1"
    };
}

macro_rules! holds_a_started_book_not_read {
    () => {
        "series.started_count > series.read_count"
    };
}

macro_rules! first_book_in_series {
    ($($condition:expr),+) => {
        concat!(
            "SELECT book.id FROM book
            LEFT JOIN book_state ON book_state.book_id = book.id
            WHERE book.series_local_id = series.local_id",
            $(" AND ", $condition,)+
            " ORDER BY book.title_sort_key, book.id LIMIT 1"
        )
    };
}

macro_rules! book_up_next {
    () => {
        concat!(
            "CASE WHEN ",
            $crate::catalog::series_books::holds_a_started_book_not_read!(),
            " THEN (",
            $crate::catalog::series_books::first_book_in_series!(
                "book_state.is_started IS 1",
                $crate::catalog::series_books::not_read!()
            ),
            ") ELSE (",
            $crate::catalog::series_books::first_book_in_series!(
                $crate::catalog::series_books::not_read!()
            ),
            ") END"
        )
    };
}

pub(crate) use book_up_next;
pub(crate) use first_book_in_series;
pub(crate) use holds_a_started_book_not_read;
pub(crate) use not_read;

const FIRST_IN_SERIES: &str = books_in_series!("ASC");
const NEXT_IN_SERIES: &str = books_in_series!(
    "ASC",
    "(book.title_sort_key, book.id) > (:after_key, :after_id)"
);
const LAST_IN_SERIES: &str = books_in_series!("DESC");
const PREVIOUS_IN_SERIES: &str = books_in_series!(
    "DESC",
    "(book.title_sort_key, book.id) < (:after_key, :after_id)"
);
const UP_NEXT: &str = concat!(
    "SELECT book.id, book.title_sort_key,
        book_state.is_read, book_state.is_started, book_state.position_page
    FROM book
    LEFT JOIN book_state ON book_state.book_id = book.id
    WHERE book.id = (SELECT ",
    book_up_next!(),
    " FROM series WHERE series.id = :series)"
);
const BOOK_DETAILS: &str = "SELECT title, added_at_ms, page_count FROM book WHERE id = ?1";
const UNREAD_IN_SERIES: &str = concat!(
    "SELECT book.id FROM book
    LEFT JOIN book_state ON book_state.book_id = book.id
    WHERE book.series_local_id = (SELECT local_id FROM series WHERE id = ?1) AND ",
    not_read!()
);
const BOOKS_BEFORE: &str = "SELECT count(*) FROM book
    WHERE series_local_id = (SELECT local_id FROM series WHERE id = :series)
        AND (title_sort_key, id) < (:key, :id)";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BookSummary {
    pub id: BookId,
    /// Counting from 1 in the series' order, whichever of its books a list holds.
    pub position: u32,
    pub title: String,
    pub added_at_ms: i64,
    pub reading: BookReading,
    /// Absent for a book found before the library kept page counts, until it is scanned again or opened.
    pub page_count: Option<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BookListing {
    pub shown: BooksShown,
    pub direction: SortDirection,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BooksShown {
    All,
    Unread,
}

impl BookListing {
    pub const IN_ORDER: Self = Self {
        shown: BooksShown::All,
        direction: SortDirection::Ascending,
    };

    const fn query(self, is_continued: bool) -> &'static str {
        match (self.direction, is_continued) {
            (SortDirection::Ascending, false) => FIRST_IN_SERIES,
            (SortDirection::Ascending, true) => NEXT_IN_SERIES,
            (SortDirection::Descending, false) => LAST_IN_SERIES,
            (SortDirection::Descending, true) => PREVIOUS_IN_SERIES,
        }
    }

    fn holds(self, reading: BookReading) -> bool {
        self.shown == BooksShown::All || !matches!(reading, BookReading::Read { .. })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BookReading {
    NotStarted,
    /// Opened, or given a furthest page, and not marked read; the position is absent when only the furthest page is known.
    Started {
        position_page: Option<u32>,
    },
    /// Marked read, with the position saved last, which is absent when none was saved.
    Read {
        position_page: Option<u32>,
    },
}

/// A series missing from the catalog has no books, so its page is empty.
#[tracing::instrument(skip_all, fields(%series, ?listing, size = ?request.size))]
pub fn series_books(
    connection: &Connection,
    series: SeriesId,
    listing: BookListing,
    request: &PageRequest,
) -> Result<Page<BookSummary>, Error> {
    let _snapshot = snapshot(connection)?;
    let series_id = series.as_bytes();
    let rows = match request.after.as_ref().map(|cursor| &cursor.0) {
        None => walk(
            connection,
            series,
            listing,
            request,
            named_params! { ":series": series_id },
        ),
        Some(Position::Book {
            series: listed,
            listing: given,
            sort_key,
            id,
        }) if *listed == series && *given == listing => walk(
            connection,
            series,
            listing,
            request,
            named_params! {
                ":series": series_id,
                ":after_key": sort_key,
                ":after_id": id.as_bytes(),
            },
        ),
        Some(
            Position::Book { .. }
            | Position::Title { .. }
            | Position::Added { .. }
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

fn walk(
    connection: &Connection,
    series: SeriesId,
    listing: BookListing,
    request: &PageRequest,
    params: &[(&str, &dyn ToSql)],
) -> Result<Vec<(BookSummary, Position)>, Error> {
    let wanted = usize::try_from(request.size.rows_to_fetch()).unwrap_or(usize::MAX);
    let mut statement = connection.prepare(listing.query(request.after.is_some()))?;
    let mut rows = statement.query(params)?;
    let mut held = Vec::with_capacity(wanted);
    let mut position = None;
    while held.len() < wanted {
        let Some(row) = rows.next()? else {
            break;
        };
        let reading = stored_reading(row)?;
        let stored = listing
            .holds(reading)
            .then(|| stored_book(series, listing, reading, row))
            .transpose()?;
        let numbered = match (position, listing.direction) {
            (Some(previous), SortDirection::Ascending) => previous + 1,
            (Some(previous), SortDirection::Descending) => previous - 1,
            (None, _) => {
                let before = match &stored {
                    Some((_, cursor)) => books_before(connection, cursor)?,
                    None => {
                        books_before(connection, &stored_book(series, listing, reading, row)?.1)?
                    }
                };
                before + 1
            }
        };
        position = Some(numbered);
        if let Some((mut book, cursor)) = stored {
            book.position = numbered;
            held.push((book, cursor));
        }
    }
    for (book, _) in &mut held {
        fill_details(connection, book)?;
    }
    Ok(held)
}

fn books_before(connection: &Connection, book: &Position) -> Result<u32, Error> {
    let Position::Book {
        series,
        sort_key,
        id,
        ..
    } = book
    else {
        return Err(Error::CursorForAnotherList);
    };
    Ok(connection.query_row(
        BOOKS_BEFORE,
        named_params! { ":series": series.as_bytes(), ":key": sort_key, ":id": id.as_bytes() },
        |row| row.get(0),
    )?)
}

/// The book reading the series goes on from: its first book in order that is started and not read, or else its first book not read.
#[tracing::instrument(skip_all, fields(%series))]
pub fn up_next(connection: &Connection, series: SeriesId) -> Result<Option<BookSummary>, Error> {
    let _snapshot = snapshot(connection)?;
    let mut statement = connection.prepare(UP_NEXT)?;
    let mut rows = statement.query(named_params! { ":series": series.as_bytes() })?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    let (mut book, cursor) = stored_book(series, BookListing::IN_ORDER, stored_reading(row)?, row)?;
    book.position = books_before(connection, &cursor)? + 1;
    fill_details(connection, &mut book)?;
    Ok(Some(book))
}

pub fn unread_books(connection: &Connection, series: SeriesId) -> Result<Vec<BookId>, Error> {
    let mut statement = connection.prepare(UNREAD_IN_SERIES)?;
    let books = statement
        .query_map([series.as_bytes()], |row| stored_id(row, "id"))?
        .collect::<rusqlite::Result<Vec<BookId>>>()?;
    Ok(books)
}

fn fill_details(connection: &Connection, book: &mut BookSummary) -> Result<(), Error> {
    (book.title, book.added_at_ms, book.page_count) =
        connection.query_row(BOOK_DETAILS, [book.id.as_bytes()], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
    Ok(())
}

/// Reads a book's id and reading state, leaving its position, title and date for the caller, and the cursor just past it.
fn stored_book(
    series: SeriesId,
    listing: BookListing,
    reading: BookReading,
    row: &Row<'_>,
) -> rusqlite::Result<(BookSummary, Position)> {
    let id = stored_id(row, "id")?;
    let book = BookSummary {
        id,
        position: 0,
        title: String::new(),
        added_at_ms: 0,
        reading,
        page_count: None,
    };
    let position = Position::Book {
        series,
        listing,
        sort_key: row.get("title_sort_key")?,
        id,
    };
    Ok((book, position))
}

/// Reads `is_read`, `is_started` and `position_page`, which a book with no reading state leaves null.
pub(crate) fn stored_reading(row: &Row<'_>) -> rusqlite::Result<BookReading> {
    let is_read: Option<bool> = row.get("is_read")?;
    let is_started: Option<bool> = row.get("is_started")?;
    Ok(match (is_read, is_started) {
        (Some(true), _) => BookReading::Read {
            position_page: row.get("position_page")?,
        },
        (_, Some(true)) => BookReading::Started {
            position_page: row.get("position_page")?,
        },
        _ => BookReading::NotStarted,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{catalog::staged_rows::plans::finding_the_book_up_next, scratch::ScratchLibrary};

    #[test]
    fn starts_a_series_books_and_their_reading_state_by_index_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("first-series-books-plan");

        let plan = scratch.query_plan(FIRST_IN_SERIES);

        assert_eq!(
            plan,
            [
                "SEARCH book USING COVERING INDEX book_by_series (series_local_id=?)",
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
                "SEARCH book USING COVERING INDEX book_by_series (series_local_id=? AND (title_sort_key,id)>(?,?))",
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
                plan[0].starts_with(
                    "SEARCH book USING COVERING INDEX book_by_series (series_local_id=?"
                ),
                "{plan:?}"
            );
            assert!(
                !plan.iter().any(|step| step.contains("TEMP B-TREE")),
                "{plan:?}"
            );
        }
    }

    #[test]
    fn counts_the_books_before_one_by_the_covering_index() {
        let scratch = ScratchLibrary::new("books-before-plan");

        let plan = scratch.query_plan(BOOKS_BEFORE);

        assert_eq!(
            plan,
            [
                "SEARCH book USING COVERING INDEX book_by_series (series_local_id=? AND (title_sort_key,id)<(?,?))",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
            ]
        );
    }

    #[test]
    fn finds_what_is_up_next_by_walking_the_series_books_in_order_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("up-next-plan");

        let plan = scratch.query_plan(UP_NEXT);

        let expected: Vec<String> = [
            "SEARCH book USING PRIMARY KEY (id=?)",
            "SCALAR SUBQUERY 3",
            "SEARCH series USING INDEX sqlite_autoindex_series_1 (id=?)",
        ]
        .map(ToOwned::to_owned)
        .into_iter()
        .chain(finding_the_book_up_next((1, 2)))
        .chain(["SEARCH book_state USING PRIMARY KEY (book_id=?) LEFT-JOIN".to_owned()])
        .collect();
        assert_eq!(plan, expected);
    }
}
