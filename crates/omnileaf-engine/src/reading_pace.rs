use omnileaf_db::{Error, reading_speed::seconds_per_page, rusqlite::Connection};

use crate::library_listing::SmartFilter;

#[derive(Clone, Copy, Debug)]
pub(crate) struct ReadingPaceSeen {
    learns: bool,
}

impl ReadingPaceSeen {
    pub(crate) const fn while_learning_is(is_on: bool) -> Self {
        Self { learns: is_on }
    }

    pub(crate) fn known(self, connection: &Connection) -> Result<Option<u32>, Error> {
        self.learned(|| seconds_per_page(connection))
    }

    pub(crate) fn needed_by(
        self,
        connection: &Connection,
        smart: &[SmartFilter],
    ) -> Result<Option<u32>, Error> {
        self.needed_when_asked(smart, || seconds_per_page(connection))
    }

    fn learned<E>(
        self,
        resolve: impl FnOnce() -> Result<Option<u32>, E>,
    ) -> Result<Option<u32>, E> {
        if self.learns { resolve() } else { Ok(None) }
    }

    fn needed_when_asked<E>(
        self,
        smart: &[SmartFilter],
        resolve: impl FnOnce() -> Result<Option<u32>, E>,
    ) -> Result<Option<u32>, E> {
        if smart.contains(&SmartFilter::QuickReads) {
            self.learned(resolve)
        } else {
            Ok(None)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;
    use std::convert::Infallible;

    use super::*;

    const LEARNED_SECONDS: u32 = 12;

    fn counted(asked: &Cell<u32>) -> impl FnOnce() -> Result<Option<u32>, Infallible> + '_ {
        move || {
            asked.set(asked.get() + 1);
            Ok(Some(LEARNED_SECONDS))
        }
    }

    #[test]
    fn reads_the_pace_once_when_quick_reads_is_asked_for_while_learning() {
        let asked = Cell::new(0);

        let pace = ReadingPaceSeen::while_learning_is(true)
            .needed_when_asked(&[SmartFilter::QuickReads], counted(&asked));

        assert_eq!((pace, asked.get()), (Ok(Some(LEARNED_SECONDS)), 1));
    }

    #[test]
    fn reads_no_pace_for_smart_filters_without_quick_reads() {
        let asked = Cell::new(0);

        let pace = ReadingPaceSeen::while_learning_is(true).needed_when_asked(
            &[SmartFilter::Forgotten, SmartFilter::Duplicates],
            counted(&asked),
        );

        assert_eq!((pace, asked.get()), (Ok(None), 0));
    }

    #[test]
    fn reads_no_pace_without_smart_filters() {
        let asked = Cell::new(0);

        let pace = ReadingPaceSeen::while_learning_is(true).needed_when_asked(&[], counted(&asked));

        assert_eq!((pace, asked.get()), (Ok(None), 0));
    }

    #[test]
    fn reads_no_pace_for_quick_reads_while_learning_is_off() {
        let asked = Cell::new(0);

        let pace = ReadingPaceSeen::while_learning_is(false)
            .needed_when_asked(&[SmartFilter::QuickReads], counted(&asked));

        assert_eq!((pace, asked.get()), (Ok(None), 0));
    }

    #[test]
    fn knows_the_pace_while_learning_is_on() {
        let asked = Cell::new(0);

        let pace = ReadingPaceSeen::while_learning_is(true).learned(counted(&asked));

        assert_eq!((pace, asked.get()), (Ok(Some(LEARNED_SECONDS)), 1));
    }

    #[test]
    fn knows_no_pace_while_learning_is_off() {
        let asked = Cell::new(0);

        let pace = ReadingPaceSeen::while_learning_is(false).learned(counted(&asked));

        assert_eq!((pace, asked.get()), (Ok(None), 0));
    }
}
