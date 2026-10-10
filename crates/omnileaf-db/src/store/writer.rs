use std::collections::{BTreeMap, BTreeSet};

use omnileaf_sync_proto::{BookId, MergeClass, Register, SeriesId, Value};
use rusqlite::{Connection, OptionalExtension};

use crate::{
    Error,
    catalog::series_of_book,
    store::{
        Changed,
        key::{Key, LatestKey, MaximumKey},
        local::LocalReplica,
        projector,
        reading_state::reading_state,
        register,
    },
};

macro_rules! is_started {
    () => {
        "(book_state.is_read IS 1 OR book_state.position_page IS NOT NULL
            OR book_state.furthest_page IS NOT NULL)"
    };
}

const STAGE_OF_BOOK: &str = concat!(
    "SELECT book_state.is_read IS 1, ",
    is_started!(),
    " IS 1
    FROM book LEFT JOIN book_state ON book_state.book_id = book.id WHERE book.id = ?1"
);

type ReadingStage = (bool, bool);

pub struct Writer<'t> {
    connection: &'t Connection,
    local: LocalReplica,
    now_unix_ms: u64,
    changed: BTreeSet<Key>,
    /// Each written book of the catalog as it stood before the job wrote anything, which the series counts follow.
    stages_before: BTreeMap<BookId, ReadingStage>,
    has_failed: bool,
}

impl<'t> Writer<'t> {
    pub(crate) fn begin(connection: &'t Connection, now_unix_ms: u64) -> Result<Self, Error> {
        Ok(Self {
            connection,
            local: LocalReplica::read(connection)?,
            now_unix_ms,
            changed: BTreeSet::new(),
            stages_before: BTreeMap::new(),
            has_failed: false,
        })
    }

    #[tracing::instrument(skip_all, fields(%book, page))]
    pub fn set_position(&mut self, book: BookId, page: u32) -> Result<(), Error> {
        self.set(LatestKey::BookPosition(book), Value::Unsigned(page.into()))
    }

    #[tracing::instrument(skip_all, fields(%book, is_read))]
    pub fn set_read(&mut self, book: BookId, is_read: bool) -> Result<(), Error> {
        self.set(LatestKey::BookRead(book), Value::Bool(is_read))
    }

    #[tracing::instrument(skip_all, fields(?key))]
    pub fn clear(&mut self, key: LatestKey) -> Result<(), Error> {
        self.set(key, Value::Null)
    }

    #[tracing::instrument(skip_all, fields(%book, page))]
    pub fn raise_furthest(&mut self, book: BookId, page: u32) -> Result<(), Error> {
        let furthest = MaximumKey::BookFurthest(book);
        let class = MergeClass::Maximum { rank: page };
        self.write(furthest.into(), class, Value::Unsigned(page.into()))
    }

    #[tracing::instrument(skip_all, fields(%from, %to))]
    pub fn carry_reading_state(&mut self, from: BookId, to: BookId) -> Result<(), Error> {
        if reading_state(self.connection, to)?.is_some() {
            return Ok(());
        }
        let Some(state) = reading_state(self.connection, from)? else {
            return Ok(());
        };
        if let Some(page) = state.position_page {
            self.set_position(to, page)?;
        }
        if let Some(page) = state.furthest_page {
            self.raise_furthest(to, page)?;
        }
        if let Some(is_read) = state.is_read {
            self.set_read(to, is_read)?;
        }
        Ok(())
    }

    /// None for a book missing from the catalog.
    pub fn series_of(&self, book: BookId) -> Result<Option<SeriesId>, Error> {
        series_of_book(self.connection, book)
    }

    fn set(&mut self, key: LatestKey, value: Value) -> Result<(), Error> {
        self.write(key.into(), MergeClass::LastWriterWins, value)
    }

    fn write(&mut self, key: Key, class: MergeClass, value: Value) -> Result<(), Error> {
        if self.has_failed {
            return Err(Error::FailedWriteIgnored);
        }
        let written = self.merge(key, class, value);
        self.has_failed = written.is_err();
        written
    }

    fn merge(&mut self, key: Key, class: MergeClass, value: Value) -> Result<(), Error> {
        let register = Register {
            class,
            stamp: self.local.stamp(self.now_unix_ms)?,
            value: value.to_cbor(),
        };
        let seq = self.local.next_seq();
        self.note_stage_before(key.book())?;
        if register::upsert(self.connection, &key.address(), &register, seq)? {
            projector::project(self.connection, key, value)?;
            self.local.advance_seq_saturating();
            self.changed.insert(key);
        }
        Ok(())
    }

    fn note_stage_before(&mut self, book: BookId) -> Result<(), Error> {
        if self.stages_before.contains_key(&book) {
            return Ok(());
        }
        if let Some(stage) = stage_of(self.connection, book)? {
            self.stages_before.insert(book, stage);
        }
        Ok(())
    }

    fn is_recounted(&self) -> Result<bool, Error> {
        for (book, before) in &self.stages_before {
            if stage_of(self.connection, *book)? != Some(*before) {
                return Ok(true);
            }
        }
        Ok(false)
    }

    pub(crate) fn finish(self) -> Result<Changed, Error> {
        if self.has_failed {
            return Err(Error::FailedWriteIgnored);
        }
        self.local.save(self.connection)?;
        Ok(Changed::Registers {
            recounted: self.is_recounted()?,
            keys: self.changed,
        })
    }
}

fn stage_of(connection: &Connection, book: BookId) -> Result<Option<ReadingStage>, Error> {
    Ok(connection
        .prepare(STAGE_OF_BOOK)?
        .query_row([book.as_bytes()], |row| Ok((row.get(0)?, row.get(1)?)))
        .optional()?)
}

#[cfg(test)]
mod tests {
    use omnileaf_sync_proto::{Fingerprint, ImageEntry};

    use super::*;
    use crate::{
        Database,
        scratch::ScratchLibrary,
        store::{Clock, Store},
    };

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

    #[tokio::test]
    async fn takes_a_book_as_started_just_as_the_schema_s_started_column_does() {
        let scratch = ScratchLibrary::new("writer-started");
        let store = Store::new(Database::open(&scratch.config).unwrap(), StoppedClock);
        let mut states = Vec::new();
        for is_read in [None, Some(false), Some(true)] {
            for position_page in [None, Some(0), Some(3)] {
                for furthest_page in [None, Some(0), Some(3)] {
                    states.push((is_read, position_page, furthest_page));
                }
            }
        }
        store
            .write(move |writer| {
                for (number, (is_read, position_page, furthest_page)) in (1..).zip(states) {
                    if let Some(is_read) = is_read {
                        writer.set_read(book(number), is_read)?;
                    }
                    if let Some(page) = position_page {
                        writer.set_position(book(number), page)?;
                    }
                    if let Some(page) = furthest_page {
                        writer.raise_furthest(book(number), page)?;
                    }
                }
                Ok(())
            })
            .await
            .unwrap();

        let (rows, disagreeing): (u32, u32) = store
            .database()
            .read(|connection| {
                Ok(connection.query_row(
                    concat!(
                        "SELECT count(*), count(*) FILTER (WHERE (book_state.is_started IS 1) IS NOT (",
                        is_started!(),
                        " IS 1)) FROM book_state"
                    ),
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )?)
            })
            .await
            .unwrap();

        assert_eq!((rows, disagreeing), (26, 0));
    }
}
