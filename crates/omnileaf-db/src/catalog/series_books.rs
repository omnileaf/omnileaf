use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::{Connection, Row, Statement, ToSql, named_params};

use crate::{
    Error,
    catalog::{
        BookSection, Cover, Numbering, SortDirection,
        cover::stored_cover,
        cursor::Position,
        numbering::stored_numbering,
        page::{Page, PageRequest},
        staged_rows::snapshot,
        stored_id::stored_id,
    },
    reading_order::section_keys,
};

macro_rules! books_in_series {
    ($direction:literal $(, $condition:expr)*) => {
        concat!(
            "SELECT book.id, book.reading_order_key,
                book_state.is_read, book_state.is_started, book_state.position_page
            FROM book
            LEFT JOIN book_state ON book_state.book_id = book.id
            WHERE book.series_local_id = (SELECT local_id FROM series WHERE id = :series)",
            $(" AND ", $condition,)*
            " ORDER BY book.reading_order_key ", $direction, ", book.id ", $direction
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
            " ORDER BY book.reading_order_key, book.id LIMIT 1"
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

macro_rules! unread {
    () => {
        "book.is_marked_read = 0"
    };
}

macro_rules! bookmarked {
    () => {
        "EXISTS (SELECT 1 FROM book_bookmark WHERE book_bookmark.book_id = book.id)"
    };
}

macro_rules! in_section {
    () => {
        "book.reading_order_key >= :section_start AND book.reading_order_key < :section_end"
    };
}

macro_rules! after_cursor {
    ($comparison:literal) => {
        concat!(
            "(book.reading_order_key, book.id) ",
            $comparison,
            " (:after_key, :after_id)"
        )
    };
}

const FIRST_IN_SERIES: &str = books_in_series!("ASC");
const NEXT_IN_SERIES: &str = books_in_series!("ASC", after_cursor!(">"));
const LAST_IN_SERIES: &str = books_in_series!("DESC");
const PREVIOUS_IN_SERIES: &str = books_in_series!("DESC", after_cursor!("<"));
const FIRST_IN_SECTION: &str = books_in_series!("ASC", in_section!());
const NEXT_IN_SECTION: &str = books_in_series!("ASC", after_cursor!(">"), in_section!());
const LAST_IN_SECTION: &str = books_in_series!("DESC", in_section!());
const PREVIOUS_IN_SECTION: &str = books_in_series!("DESC", after_cursor!("<"), in_section!());
const FIRST_UNREAD_IN_SERIES: &str = books_in_series!("ASC", unread!());
const NEXT_UNREAD_IN_SERIES: &str = books_in_series!("ASC", unread!(), after_cursor!(">"));
const LAST_UNREAD_IN_SERIES: &str = books_in_series!("DESC", unread!());
const PREVIOUS_UNREAD_IN_SERIES: &str = books_in_series!("DESC", unread!(), after_cursor!("<"));
const FIRST_UNREAD_IN_SECTION: &str = books_in_series!("ASC", unread!(), in_section!());
const NEXT_UNREAD_IN_SECTION: &str =
    books_in_series!("ASC", unread!(), after_cursor!(">"), in_section!());
const LAST_UNREAD_IN_SECTION: &str = books_in_series!("DESC", unread!(), in_section!());
const PREVIOUS_UNREAD_IN_SECTION: &str =
    books_in_series!("DESC", unread!(), after_cursor!("<"), in_section!());
const FIRST_BOOKMARKED_IN_SERIES: &str = books_in_series!("ASC", bookmarked!());
const NEXT_BOOKMARKED_IN_SERIES: &str = books_in_series!("ASC", bookmarked!(), after_cursor!(">"));
const LAST_BOOKMARKED_IN_SERIES: &str = books_in_series!("DESC", bookmarked!());
const PREVIOUS_BOOKMARKED_IN_SERIES: &str =
    books_in_series!("DESC", bookmarked!(), after_cursor!("<"));
const FIRST_BOOKMARKED_IN_SECTION: &str = books_in_series!("ASC", bookmarked!(), in_section!());
const NEXT_BOOKMARKED_IN_SECTION: &str =
    books_in_series!("ASC", bookmarked!(), after_cursor!(">"), in_section!());
const LAST_BOOKMARKED_IN_SECTION: &str = books_in_series!("DESC", bookmarked!(), in_section!());
const PREVIOUS_BOOKMARKED_IN_SECTION: &str =
    books_in_series!("DESC", bookmarked!(), after_cursor!("<"), in_section!());
const UP_NEXT: &str = concat!(
    "SELECT book.id, book.reading_order_key,
        book_state.is_read, book_state.is_started, book_state.position_page
    FROM book
    LEFT JOIN book_state ON book_state.book_id = book.id
    WHERE book.id = (SELECT ",
    book_up_next!(),
    " FROM series WHERE series.id = :series)"
);
const BOOK_DETAILS: &str = "SELECT book.title, book.added_at_ms, book.page_count,
        book.kind, book.first_number, book.last_number, book.number_source,
        book.volume_number, book.volume_source,
        cover.book_id AS cover_book, cover.id AS cover_file, cover.rev AS cover_rev,
        EXISTS (SELECT 1 FROM book_bookmark WHERE book_bookmark.book_id = book.id) AS is_bookmarked
    FROM book
    LEFT JOIN book_file AS cover
        ON cover.id = (SELECT min(id) FROM book_file WHERE book_file.book_id = book.id)
    WHERE book.id = ?1";
const UNREAD_IN_SERIES: &str = concat!(
    "SELECT book.id FROM book
    LEFT JOIN book_state ON book_state.book_id = book.id
    WHERE book.series_local_id = (SELECT local_id FROM series WHERE id = ?1) AND ",
    not_read!()
);
const BOOKS_BEFORE: &str = "SELECT count(*) FROM book
    WHERE series_local_id = (SELECT local_id FROM series WHERE id = :series)
        AND (reading_order_key, id) < (:key, :id)";

const BOOKS_BETWEEN: &str = "SELECT count(*) FROM book
    WHERE series_local_id = (SELECT local_id FROM series WHERE id = :series)
        AND (reading_order_key, id) > (:after_key, :after_id)
        AND (reading_order_key, id) <= (:through_key, :through_id)";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BookSummary {
    pub id: BookId,
    /// Counting from 1 in the series' order, whichever of its books a list holds.
    pub position: u32,
    pub title: String,
    /// The book's own cover, absent while it has no file.
    pub cover: Option<Cover>,
    pub added_at_ms: i64,
    pub reading: BookReading,
    /// Absent for a book found before the library kept page counts, until it is scanned again or opened.
    pub page_count: Option<u32>,
    /// Absent for a book found before the library read numbers from names, until it is scanned again.
    pub numbering: Option<Numbering>,
    pub is_bookmarked: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BookListing {
    pub shown: BooksShown,
    pub direction: SortDirection,
    /// Absent to list every book, those not placed in a section included.
    pub section: Option<BookSection>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BooksShown {
    All,
    Unread,
    Bookmarked,
}

impl BookListing {
    pub const IN_ORDER: Self = Self {
        shown: BooksShown::All,
        direction: SortDirection::Ascending,
        section: None,
    };

    const fn query(self, is_continued: bool) -> &'static str {
        match (
            self.shown,
            self.direction,
            is_continued,
            self.section.is_some(),
        ) {
            (BooksShown::All, SortDirection::Ascending, false, false) => FIRST_IN_SERIES,
            (BooksShown::All, SortDirection::Ascending, true, false) => NEXT_IN_SERIES,
            (BooksShown::All, SortDirection::Descending, false, false) => LAST_IN_SERIES,
            (BooksShown::All, SortDirection::Descending, true, false) => PREVIOUS_IN_SERIES,
            (BooksShown::All, SortDirection::Ascending, false, true) => FIRST_IN_SECTION,
            (BooksShown::All, SortDirection::Ascending, true, true) => NEXT_IN_SECTION,
            (BooksShown::All, SortDirection::Descending, false, true) => LAST_IN_SECTION,
            (BooksShown::All, SortDirection::Descending, true, true) => PREVIOUS_IN_SECTION,
            (BooksShown::Unread, SortDirection::Ascending, false, false) => FIRST_UNREAD_IN_SERIES,
            (BooksShown::Unread, SortDirection::Ascending, true, false) => NEXT_UNREAD_IN_SERIES,
            (BooksShown::Unread, SortDirection::Descending, false, false) => LAST_UNREAD_IN_SERIES,
            (BooksShown::Unread, SortDirection::Descending, true, false) => {
                PREVIOUS_UNREAD_IN_SERIES
            }
            (BooksShown::Unread, SortDirection::Ascending, false, true) => FIRST_UNREAD_IN_SECTION,
            (BooksShown::Unread, SortDirection::Ascending, true, true) => NEXT_UNREAD_IN_SECTION,
            (BooksShown::Unread, SortDirection::Descending, false, true) => LAST_UNREAD_IN_SECTION,
            (BooksShown::Unread, SortDirection::Descending, true, true) => {
                PREVIOUS_UNREAD_IN_SECTION
            }
            (BooksShown::Bookmarked, SortDirection::Ascending, false, false) => {
                FIRST_BOOKMARKED_IN_SERIES
            }
            (BooksShown::Bookmarked, SortDirection::Ascending, true, false) => {
                NEXT_BOOKMARKED_IN_SERIES
            }
            (BooksShown::Bookmarked, SortDirection::Descending, false, false) => {
                LAST_BOOKMARKED_IN_SERIES
            }
            (BooksShown::Bookmarked, SortDirection::Descending, true, false) => {
                PREVIOUS_BOOKMARKED_IN_SERIES
            }
            (BooksShown::Bookmarked, SortDirection::Ascending, false, true) => {
                FIRST_BOOKMARKED_IN_SECTION
            }
            (BooksShown::Bookmarked, SortDirection::Ascending, true, true) => {
                NEXT_BOOKMARKED_IN_SECTION
            }
            (BooksShown::Bookmarked, SortDirection::Descending, false, true) => {
                LAST_BOOKMARKED_IN_SECTION
            }
            (BooksShown::Bookmarked, SortDirection::Descending, true, true) => {
                PREVIOUS_BOOKMARKED_IN_SECTION
            }
        }
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
    let section_keys = listing.section.map(section_keys);
    let mut params: Vec<(&str, &dyn ToSql)> = vec![(":series", &series_id)];
    match request.after.as_ref().map(|cursor| &cursor.0) {
        None => {}
        Some(Position::Book {
            series: listed,
            listing: given,
            sort_key,
            id,
        }) if *listed == series && *given == listing => {
            params.extend([
                (":after_key", sort_key as &dyn ToSql),
                (":after_id", id.as_bytes()),
            ]);
        }
        Some(
            Position::Book { .. }
            | Position::Title { .. }
            | Position::Added { .. }
            | Position::Root { .. }
            | Position::LastRead { .. }
            | Position::Session { .. }
            | Position::LastUpdated { .. }
            | Position::UnreadCount { .. }
            | Position::TimeLeft { .. }
            | Position::Writer { .. }
            | Position::FolderGroup { .. },
        ) => return Err(Error::CursorForAnotherList),
    }
    if let Some((start, end)) = &section_keys {
        params.extend([
            (":section_start", start as &dyn ToSql),
            (":section_end", end),
        ]);
    }
    let rows = walk(connection, series, listing, request, &params)?;
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
    let mut held: Vec<(BookSummary, Position)> = Vec::with_capacity(wanted);
    while held.len() < wanted {
        let Some(row) = rows.next()? else {
            break;
        };
        let (mut book, cursor) = stored_book(series, listing, stored_reading(row)?, row)?;
        book.position = match (held.last(), listing.shown, listing.direction) {
            (None, _, _) => books_before(connection, &cursor)? + 1,
            (Some((previous, _)), BooksShown::All, SortDirection::Ascending) => {
                previous.position + 1
            }
            (Some((previous, _)), BooksShown::All, SortDirection::Descending) => {
                previous.position - 1
            }
            (
                Some((previous, previous_cursor)),
                BooksShown::Unread | BooksShown::Bookmarked,
                SortDirection::Ascending,
            ) => previous.position + books_between(connection, previous_cursor, &cursor)?,
            (
                Some((previous, previous_cursor)),
                BooksShown::Unread | BooksShown::Bookmarked,
                SortDirection::Descending,
            ) => previous.position - books_between(connection, &cursor, previous_cursor)?,
        };
        held.push((book, cursor));
    }
    let mut details = connection.prepare(BOOK_DETAILS)?;
    for (book, _) in &mut held {
        fill_details(&mut details, book)?;
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

/// How many books of the series follow the earlier book up to and including the later one.
fn books_between(
    connection: &Connection,
    earlier: &Position,
    later: &Position,
) -> Result<u32, Error> {
    let (
        Position::Book {
            series,
            sort_key: after_key,
            id: after_id,
            ..
        },
        Position::Book {
            sort_key: through_key,
            id: through_id,
            ..
        },
    ) = (earlier, later)
    else {
        return Err(Error::CursorForAnotherList);
    };
    Ok(connection.query_row(
        BOOKS_BETWEEN,
        named_params! {
            ":series": series.as_bytes(),
            ":after_key": after_key,
            ":after_id": after_id.as_bytes(),
            ":through_key": through_key,
            ":through_id": through_id.as_bytes(),
        },
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
    fill_details(&mut connection.prepare(BOOK_DETAILS)?, &mut book)?;
    Ok(Some(book))
}

pub fn unread_books(connection: &Connection, series: SeriesId) -> Result<Vec<BookId>, Error> {
    let mut statement = connection.prepare(UNREAD_IN_SERIES)?;
    let books = statement
        .query_map([series.as_bytes()], |row| stored_id(row, "id"))?
        .collect::<rusqlite::Result<Vec<BookId>>>()?;
    Ok(books)
}

fn fill_details(details: &mut Statement<'_>, book: &mut BookSummary) -> Result<(), Error> {
    (
        book.title,
        book.cover,
        book.added_at_ms,
        book.page_count,
        book.numbering,
        book.is_bookmarked,
    ) = details.query_row([book.id.as_bytes()], |row| {
        Ok((
            row.get("title")?,
            stored_cover(row)?,
            row.get("added_at_ms")?,
            row.get("page_count")?,
            stored_numbering(row)?,
            row.get("is_bookmarked")?,
        ))
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
        cover: None,
        added_at_ms: 0,
        reading,
        page_count: None,
        numbering: None,
        is_bookmarked: false,
    };
    let position = Position::Book {
        series,
        listing,
        sort_key: row.get("reading_order_key")?,
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
                "SEARCH book USING COVERING INDEX book_by_series (series_local_id=? AND (reading_order_key,id)>(?,?))",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH book_state USING PRIMARY KEY (book_id=?) LEFT-JOIN",
            ]
        );
    }

    #[test]
    fn lists_a_series_books_either_way_round_by_index_without_sorting() {
        let scratch = ScratchLibrary::new("book-listing-plans");
        let listings =
            [SortDirection::Ascending, SortDirection::Descending].map(|direction| BookListing {
                direction,
                ..BookListing::IN_ORDER
            });

        let plans: Vec<Vec<String>> = listings
            .into_iter()
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
    fn lists_only_a_series_unread_books_from_their_own_index_without_passing_the_read_ones() {
        let scratch = ScratchLibrary::new("unread-books-plans");
        let listings = [SortDirection::Ascending, SortDirection::Descending]
            .into_iter()
            .flat_map(|direction| {
                [None, Some(BookSection::Volumes)].map(|section| BookListing {
                    shown: BooksShown::Unread,
                    direction,
                    section,
                })
            });

        let plans: Vec<Vec<String>> = listings
            .flat_map(|listing| [listing.query(false), listing.query(true)])
            .map(|query| scratch.query_plan(query))
            .collect();

        for plan in plans {
            assert!(
                plan[0].starts_with(
                    "SEARCH book USING COVERING INDEX book_unread_by_series (series_local_id=?"
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
    fn counts_the_books_between_two_by_the_covering_index() {
        let scratch = ScratchLibrary::new("books-between-plan");

        let plan = scratch.query_plan(BOOKS_BETWEEN);

        assert_eq!(
            plan,
            [
                "SEARCH book USING COVERING INDEX book_by_series (series_local_id=? AND (reading_order_key,id)>(?,?) AND (reading_order_key,id)<(?,?))",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
            ]
        );
    }

    #[test]
    fn lists_one_section_of_a_series_books_as_a_range_of_the_covering_index_without_sorting() {
        let scratch = ScratchLibrary::new("section-books-plans");

        let plans: Vec<String> = [
            FIRST_IN_SECTION,
            NEXT_IN_SECTION,
            LAST_IN_SECTION,
            PREVIOUS_IN_SECTION,
        ]
        .map(|query| scratch.query_plan(query).remove(0))
        .into();

        assert_eq!(
            plans,
            [
                "SEARCH book USING COVERING INDEX book_by_series (series_local_id=? AND reading_order_key>? AND reading_order_key<?)",
                "SEARCH book USING COVERING INDEX book_by_series (series_local_id=? AND (reading_order_key,id)>(?,?) AND reading_order_key<?)",
                "SEARCH book USING COVERING INDEX book_by_series (series_local_id=? AND reading_order_key>? AND reading_order_key<?)",
                "SEARCH book USING COVERING INDEX book_by_series (series_local_id=? AND reading_order_key>? AND (reading_order_key,id)<(?,?))",
            ]
        );
    }

    #[test]
    fn reads_a_book_s_details_and_cover_by_their_keys() {
        let scratch = ScratchLibrary::new("book-details-plan");

        let plan = scratch.query_plan(BOOK_DETAILS);

        assert_eq!(
            plan,
            [
                "SEARCH book USING PRIMARY KEY (id=?)",
                "SEARCH cover USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN",
                "CORRELATED SCALAR SUBQUERY 1",
                "SEARCH book_file USING COVERING INDEX book_file_by_book (book_id=?)",
            ]
        );
    }

    #[test]
    fn counts_the_books_before_one_by_the_covering_index() {
        let scratch = ScratchLibrary::new("books-before-plan");

        let plan = scratch.query_plan(BOOKS_BEFORE);

        assert_eq!(
            plan,
            [
                "SEARCH book USING COVERING INDEX book_by_series (series_local_id=? AND (reading_order_key,id)<(?,?))",
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
