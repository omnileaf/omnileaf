//! Which series the library lists on this device and in what order, which never syncs since each device keeps its own.

use rusqlite::{Connection, OptionalExtension, Row, Transaction};

use crate::{
    Error,
    catalog::{Inclusion, SeriesFilter, SeriesListing, SeriesOrder, SeriesSort, SortDirection},
};

const THE_LISTING: i64 = 1;

const STORED_LISTING: &str = "SELECT sort_order, sort_direction, unread, started, finished
    FROM library_listing
    WHERE id = ?1";

const SET_LISTING: &str = "INSERT INTO library_listing (
        id, sort_order, sort_direction, unread, started, finished
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT (id) DO UPDATE SET
        sort_order = excluded.sort_order,
        sort_direction = excluded.sort_direction,
        unread = excluded.unread,
        started = excluded.started,
        finished = excluded.finished";

const ORDERS: [SeriesOrder; 6] = [
    SeriesOrder::Title,
    SeriesOrder::DateAdded,
    SeriesOrder::LastRead,
    SeriesOrder::LastUpdated,
    SeriesOrder::UnreadCount,
    SeriesOrder::TimeLeft,
];
const DIRECTIONS: [SortDirection; 2] = [SortDirection::Ascending, SortDirection::Descending];
const INCLUSIONS: [Inclusion; 3] = [Inclusion::Any, Inclusion::Only, Inclusion::Hide];

pub fn library_listing(connection: &Connection) -> Result<Option<SeriesListing>, Error> {
    let row = connection
        .prepare(STORED_LISTING)?
        .query_row([THE_LISTING], ListingRow::read)
        .optional()?;
    row.map(SeriesListing::try_from).transpose()
}

pub fn set_library_listing(
    transaction: &Transaction<'_>,
    listing: &SeriesListing,
) -> Result<(), Error> {
    let filter = listing.filter;
    transaction.prepare(SET_LISTING)?.execute((
        THE_LISTING,
        order_name(listing.sort.order),
        direction_name(listing.sort.direction),
        inclusion_name(filter.unread),
        inclusion_name(filter.started),
        inclusion_name(filter.finished),
    ))?;
    Ok(())
}

struct ListingRow {
    sort_order: String,
    sort_direction: String,
    unread: String,
    started: String,
    finished: String,
}

impl ListingRow {
    fn read(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            sort_order: row.get(0)?,
            sort_direction: row.get(1)?,
            unread: row.get(2)?,
            started: row.get(3)?,
            finished: row.get(4)?,
        })
    }
}

impl TryFrom<ListingRow> for SeriesListing {
    type Error = Error;

    fn try_from(row: ListingRow) -> Result<Self, Self::Error> {
        Ok(Self {
            sort: SeriesSort {
                order: stored(&ORDERS, order_name, row.sort_order)?,
                direction: stored(&DIRECTIONS, direction_name, row.sort_direction)?,
            },
            filter: SeriesFilter {
                unread: stored(&INCLUSIONS, inclusion_name, row.unread)?,
                started: stored(&INCLUSIONS, inclusion_name, row.started)?,
                finished: stored(&INCLUSIONS, inclusion_name, row.finished)?,
                ..SeriesFilter::NONE
            },
        })
    }
}

/// The one of `choices` stored as `name`, failing for a name a newer build stored.
fn stored<T: Copy>(
    choices: &[T],
    name_of: fn(T) -> &'static str,
    name: String,
) -> Result<T, Error> {
    choices
        .iter()
        .copied()
        .find(|&choice| name_of(choice) == name)
        .ok_or(Error::UnsupportedLibraryListing { name })
}

const fn order_name(order: SeriesOrder) -> &'static str {
    match order {
        SeriesOrder::Title => "title",
        SeriesOrder::DateAdded => "date_added",
        SeriesOrder::LastRead => "last_read",
        SeriesOrder::LastUpdated => "last_updated",
        SeriesOrder::UnreadCount => "unread_count",
        SeriesOrder::TimeLeft => "time_left",
    }
}

const fn direction_name(direction: SortDirection) -> &'static str {
    match direction {
        SortDirection::Ascending => "ascending",
        SortDirection::Descending => "descending",
    }
}

const fn inclusion_name(inclusion: Inclusion) -> &'static str {
    match inclusion {
        Inclusion::Any => "any",
        Inclusion::Only => "only",
        Inclusion::Hide => "hide",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn reads_the_listing_by_its_key() {
        let scratch = ScratchLibrary::new("library-listing-plan");

        let plan = scratch.query_plan(STORED_LISTING);

        assert_eq!(
            plan,
            ["SEARCH library_listing USING INTEGER PRIMARY KEY (rowid=?)"]
        );
    }
}
