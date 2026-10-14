use std::collections::BTreeMap;

use omnileaf_db::{
    catalog::{Cursor, Page},
    history,
};
use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

use crate::{
    BookId, BookReading, CoverPath, SeriesId, UtcOffset, UtcOffsetOutOfRange,
    ipc_brand::branded_string, reading_session::is_last_page,
};

const MS_PER_SECOND: i64 = 1_000;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub book: BookId,
    pub book_title: String,
    pub series: SeriesId,
    pub series_title: String,
    /// Counting from 1 in the series' order.
    pub position: u32,
    pub cover: Option<CoverPath>,
    /// When the session started, in milliseconds since the Unix epoch; it crosses as a plain number, which holds every such date exactly.
    #[specta(type = i32)]
    pub started_at_ms: i64,
    /// How far the device's clock was ahead of UTC as the session started, so it shows at the local time it was read at.
    pub utc_offset_minutes: UtcOffset,
    pub read_seconds: u32,
    pub read_to: ReadTo,
    pub reading: BookReading,
    pub day: ReadingDay,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ReadTo {
    /// The page counts from 1.
    Page {
        page: u32,
        page_count: u32,
    },
    End,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReadingWeek {
    pub read_seconds: u32,
    pub books_opened: u32,
    /// Books a session this week reached the last page of.
    pub books_finished: u32,
    pub days_in_a_row: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReadingDay {
    pub day: LocalDay,
    pub read_seconds: u32,
}

/// A day counted from 1970-01-01 on the calendar of the clock that read on it, crossing as a plain number.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct LocalDay(pub i64);

impl Type for LocalDay {
    fn definition(types: &mut Types) -> DataType {
        i32::definition(types)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub entries: Vec<HistoryEntry>,
    pub next: Option<HistoryCursor>,
}

/// Where the next page of history starts, handed back unchanged by whoever asked for the previous page.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub struct HistoryCursor(pub(crate) Cursor);

impl HistoryPage {
    /// Gives each entry the time read on its day from `read_ms_by_day`, leaving out an entry it can't list.
    pub(crate) fn new(
        page: Page<history::HistoryEntry>,
        read_ms_by_day: &BTreeMap<i64, i64>,
    ) -> Self {
        let entries = page
            .items
            .into_iter()
            .filter_map(|entry| {
                HistoryEntry::new(entry, read_ms_by_day)
                    .inspect_err(|unlisted| {
                        tracing::warn!(reason = %unlisted, "leave a session out of history");
                    })
                    .ok()
            })
            .collect();
        Self {
            entries,
            next: page.next.map(HistoryCursor),
        }
    }
}

/// Why a stored session can't be listed, which only a broken store can cause.
#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
enum Unlisted {
    #[error("its day has no reading time added up")]
    DayNotAddedUp,
    #[error("it started at a clock beyond the furthest from UTC")]
    OffsetOutOfRange(#[from] UtcOffsetOutOfRange),
}

impl HistoryEntry {
    fn new(
        entry: history::HistoryEntry,
        read_ms_by_day: &BTreeMap<i64, i64>,
    ) -> Result<Self, Unlisted> {
        let day_read_ms = *read_ms_by_day
            .get(&entry.local_day)
            .ok_or(Unlisted::DayNotAddedUp)?;
        Ok(Self {
            book: BookId(entry.book),
            book_title: entry.book_title,
            series: SeriesId(entry.series),
            series_title: entry.series_title,
            position: entry.position,
            cover: entry.cover.map(CoverPath),
            started_at_ms: entry.started_at_ms,
            utc_offset_minutes: UtcOffset::try_from(entry.utc_offset_minutes)?,
            read_seconds: whole_seconds(entry.ended_at_ms.saturating_sub(entry.started_at_ms)),
            read_to: if is_last_page(entry.page, entry.page_count) {
                ReadTo::End
            } else {
                ReadTo::Page {
                    page: entry.page.saturating_add(1),
                    page_count: entry.page_count,
                }
            },
            reading: entry.reading.into(),
            day: ReadingDay {
                day: LocalDay(entry.local_day),
                read_seconds: whole_seconds(day_read_ms),
            },
        })
    }
}

/// Whole seconds in a span of milliseconds, counting a negative span, which only a clock set back makes, as none.
pub(crate) fn whole_seconds(ms: i64) -> u32 {
    u32::try_from(ms.max(0) / MS_PER_SECOND).unwrap_or(u32::MAX)
}

impl From<HistoryCursor> for String {
    fn from(cursor: HistoryCursor) -> Self {
        cursor.0.to_string()
    }
}

impl TryFrom<String> for HistoryCursor {
    type Error = omnileaf_db::Error;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        text.parse().map(Self)
    }
}

impl Type for HistoryCursor {
    fn definition(types: &mut Types) -> DataType {
        branded_string("HistoryCursor", types)
    }
}

#[cfg(test)]
mod tests {
    use omnileaf_db::catalog::{self, BookFileId, Cover};

    use super::*;
    use crate::library_book::sample_book_id;

    const STARTED_AT_MS: i64 = 1_790_000_000_000;
    const DAY: i64 = 20_717;

    fn stored(local_day: i64, page: u32, page_count: u32) -> history::HistoryEntry {
        history::HistoryEntry {
            book: sample_book_id(1).0,
            book_title: "Sample Series 01 v01".to_owned(),
            series: omnileaf_sync_proto::SeriesId::local("Sample Series 01").unwrap(),
            series_title: "Sample Series 01".to_owned(),
            position: 1,
            cover: None,
            started_at_ms: STARTED_AT_MS,
            ended_at_ms: STARTED_AT_MS + 90_500,
            utc_offset_minutes: 600,
            local_day,
            page,
            page_count,
            reading: catalog::BookReading::Started {
                position_page: Some(page),
            },
        }
    }

    fn page_of(entries: Vec<history::HistoryEntry>) -> Page<history::HistoryEntry> {
        Page {
            items: entries,
            next: None,
        }
    }

    fn day_read() -> BTreeMap<i64, i64> {
        BTreeMap::from([(DAY, 600_000)])
    }

    #[test]
    fn lists_a_session_with_its_start_offset_length_and_day() {
        let page = HistoryPage::new(page_of(vec![stored(DAY, 6, 24)]), &day_read());

        assert_eq!(
            page.entries,
            [HistoryEntry {
                book: sample_book_id(1),
                book_title: "Sample Series 01 v01".to_owned(),
                series: SeriesId(omnileaf_sync_proto::SeriesId::local("Sample Series 01").unwrap()),
                series_title: "Sample Series 01".to_owned(),
                position: 1,
                cover: None,
                started_at_ms: STARTED_AT_MS,
                utc_offset_minutes: UtcOffset::try_from(600).unwrap(),
                read_seconds: 90,
                read_to: ReadTo::Page {
                    page: 7,
                    page_count: 24
                },
                reading: BookReading::Started { page: Some(7) },
                day: ReadingDay {
                    day: LocalDay(DAY),
                    read_seconds: 600,
                },
            }]
        );
    }

    #[test]
    fn reads_a_session_that_reached_the_last_page_to_the_end() {
        let page = HistoryPage::new(page_of(vec![stored(DAY, 23, 24)]), &day_read());

        assert_eq!(
            page.entries.first().map(|entry| entry.read_to),
            Some(ReadTo::End)
        );
    }

    #[test]
    fn leaves_out_a_session_whose_day_has_no_time_added_up() {
        let page = HistoryPage::new(page_of(vec![stored(DAY, 0, 24)]), &BTreeMap::new());

        assert_eq!(page.entries, []);
    }

    #[test]
    fn leaves_out_a_session_started_beyond_eighteen_hours_from_utc() {
        let entry = history::HistoryEntry {
            utc_offset_minutes: 1_200,
            ..stored(DAY, 0, 24)
        };

        let page = HistoryPage::new(page_of(vec![entry]), &day_read());

        assert_eq!(page.entries, []);
    }

    #[test]
    fn names_the_book_s_cover_by_its_ids() {
        let cover = Cover {
            book: sample_book_id(1).0,
            file: "7".parse::<BookFileId>().unwrap(),
            rev: 2,
        };
        let entry = history::HistoryEntry {
            cover: Some(cover),
            ..stored(DAY, 0, 24)
        };

        let page = HistoryPage::new(page_of(vec![entry]), &day_read());

        assert_eq!(
            page.entries.first().and_then(|entry| entry.cover),
            Some(CoverPath(cover))
        );
    }

    #[test]
    fn counts_whole_seconds_and_no_time_for_a_clock_set_back() {
        let seconds = [0, 999, 1_000, 90_500, -5_000, i64::MAX].map(whole_seconds);

        assert_eq!(seconds, [0, 0, 1, 90, 0, u32::MAX]);
    }
}
