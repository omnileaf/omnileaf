use std::{collections::BTreeMap, time::Duration};

use omnileaf_db::catalog::RootId;

use crate::{FolderId, RescanOutcome, Storage};

const LONGEST_WAIT: Duration = Duration::from_hours(1);

/// When each folder's next scheduled rescan comes, waiting longer after each rescan that couldn't read it.
#[derive(Debug, Default)]
pub(crate) struct RescanSchedule {
    turns: BTreeMap<RootId, Turn>,
}

/// A folder's wait runs from `since_ms`, so a clock set back before it ends the wait rather than stretching it.
#[derive(Clone, Copy, Debug)]
struct Turn {
    since_ms: u64,
    misses: u32,
    storage: Storage,
}

impl RescanSchedule {
    /// The listed folders whose turn has come, counting a folder listed for the first time as just scanned on the storage `storage_of` finds it on.
    pub(crate) fn due(
        &mut self,
        folders: &[FolderId],
        now_ms: u64,
        mut storage_of: impl FnMut(FolderId) -> Storage,
    ) -> Vec<FolderId> {
        self.turns
            .retain(|root, _| folders.iter().any(|folder| folder.0 == *root));
        folders
            .iter()
            .filter(|folder| {
                self.turns
                    .entry(folder.0)
                    .or_insert_with(|| Turn::read_at(now_ms, storage_of(**folder)))
                    .is_due(now_ms)
            })
            .copied()
            .collect()
    }

    /// Notes a rescan of the folder, which `storage` was found on as it ended.
    pub(crate) fn record(
        &mut self,
        folder: FolderId,
        outcome: &RescanOutcome,
        storage: Storage,
        now_ms: u64,
    ) {
        match outcome {
            RescanOutcome::Rescanned(_) => {
                self.turns.insert(folder.0, Turn::read_at(now_ms, storage));
            }
            RescanOutcome::Unreachable | RescanOutcome::FoundEmpty => {
                self.missed_on(folder, storage, now_ms);
            }
        }
    }

    pub(crate) fn missed(&mut self, folder: FolderId, now_ms: u64) {
        let storage = self
            .turns
            .get(&folder.0)
            .map_or(Storage::Local, |turn| turn.storage);
        self.missed_on(folder, storage, now_ms);
    }

    fn missed_on(&mut self, folder: FolderId, storage: Storage, now_ms: u64) {
        let misses = self
            .turns
            .get(&folder.0)
            .map_or(0, |turn| turn.misses)
            .saturating_add(1);
        self.turns.insert(
            folder.0,
            Turn {
                since_ms: now_ms,
                misses,
                storage,
            },
        );
    }
}

impl Turn {
    fn read_at(now_ms: u64, storage: Storage) -> Self {
        Self {
            since_ms: now_ms,
            misses: 0,
            storage,
        }
    }

    fn is_due(&self, now_ms: u64) -> bool {
        let wait = self
            .storage
            .rescan_every()
            .saturating_mul(2_u32.saturating_pow(self.misses))
            .min(LONGEST_WAIT);
        let waited = now_ms.checked_sub(self.since_ms);
        waited.is_none_or(|waited| u128::from(waited) >= wait.as_millis())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{EXTERNAL_RESCAN_EVERY, FileChanges, RESCAN_EVERY};

    const START_MS: u64 = 1_790_000_000_000;

    fn folder(id: &str) -> FolderId {
        id.parse().unwrap()
    }

    fn ms(wait: Duration) -> u64 {
        u64::try_from(wait.as_millis()).unwrap()
    }

    fn local(_: FolderId) -> Storage {
        Storage::Local
    }

    fn read() -> RescanOutcome {
        RescanOutcome::Rescanned(FileChanges::default())
    }

    /// A schedule that has seen the folder at the start, so its first turn comes one wait later.
    fn seen(folder: FolderId) -> RescanSchedule {
        let mut schedule = RescanSchedule::default();
        schedule.due(&[folder], START_MS, local);
        schedule
    }

    #[test]
    fn counts_a_folder_listed_for_the_first_time_as_just_scanned() {
        let mut schedule = RescanSchedule::default();

        let due = schedule.due(&[folder("1")], START_MS, local);

        assert_eq!(due, []);
    }

    #[test]
    fn gives_a_folder_its_turn_once_the_wait_is_over() {
        let mut schedule = seen(folder("1"));

        let early = schedule.due(&[folder("1")], START_MS + ms(RESCAN_EVERY) - 1, local);
        let on_time = schedule.due(&[folder("1")], START_MS + ms(RESCAN_EVERY), local);

        assert_eq!(early, []);
        assert_eq!(on_time, [folder("1")]);
    }

    #[test]
    fn waits_again_from_the_rescan_that_read_the_folder() {
        let mut schedule = seen(folder("1"));
        let read_at = START_MS + ms(RESCAN_EVERY) + 7;

        schedule.record(folder("1"), &read(), Storage::Local, read_at);

        assert_eq!(
            schedule.due(&[folder("1")], read_at + ms(RESCAN_EVERY) - 1, local),
            []
        );
        assert_eq!(
            schedule.due(&[folder("1")], read_at + ms(RESCAN_EVERY), local),
            [folder("1")]
        );
    }

    #[test]
    fn doubles_the_wait_after_each_rescan_that_cannot_read_the_folder_up_to_an_hour() {
        let mut schedule = seen(folder("1"));
        let mut now = START_MS;

        for (outcome, minutes) in [
            (RescanOutcome::Unreachable, 10),
            (RescanOutcome::FoundEmpty, 20),
            (RescanOutcome::Unreachable, 40),
            (RescanOutcome::Unreachable, 60),
            (RescanOutcome::Unreachable, 60),
        ] {
            schedule.record(folder("1"), &outcome, Storage::Local, now);
            let turn = now + ms(Duration::from_mins(minutes));

            assert_eq!(
                schedule.due(&[folder("1")], turn - 1, local),
                [],
                "{minutes} minutes"
            );
            assert_eq!(
                schedule.due(&[folder("1")], turn, local),
                [folder("1")],
                "{minutes} minutes"
            );
            now = turn;
        }
    }

    #[test]
    fn goes_back_to_the_usual_wait_once_the_folder_is_read_again() {
        let mut schedule = seen(folder("1"));
        schedule.record(
            folder("1"),
            &RescanOutcome::Unreachable,
            Storage::Local,
            START_MS,
        );
        schedule.record(
            folder("1"),
            &RescanOutcome::Unreachable,
            Storage::Local,
            START_MS,
        );

        schedule.record(folder("1"), &read(), Storage::Local, START_MS);

        assert_eq!(
            schedule.due(&[folder("1")], START_MS + ms(RESCAN_EVERY), local),
            [folder("1")]
        );
    }

    #[test]
    fn counts_a_rescan_that_failed_as_a_miss() {
        let mut schedule = seen(folder("1"));

        schedule.missed(folder("1"), START_MS);

        assert_eq!(
            schedule.due(&[folder("1")], START_MS + ms(RESCAN_EVERY), local),
            []
        );
        assert_eq!(
            schedule.due(&[folder("1")], START_MS + 2 * ms(RESCAN_EVERY), local),
            [folder("1")]
        );
    }

    #[test]
    fn gives_a_folder_its_turn_once_the_clock_is_set_back() {
        let mut schedule = seen(folder("1"));

        let due = schedule.due(&[folder("1")], START_MS - 1, local);

        assert_eq!(due, [folder("1")]);
    }

    #[test]
    fn keeps_each_folder_to_its_own_turn() {
        let mut schedule = RescanSchedule::default();
        schedule.due(&[folder("1"), folder("2")], START_MS, local);
        schedule.record(
            folder("2"),
            &RescanOutcome::Unreachable,
            Storage::Local,
            START_MS,
        );

        let due = schedule.due(
            &[folder("1"), folder("2")],
            START_MS + ms(RESCAN_EVERY),
            local,
        );

        assert_eq!(due, [folder("1")]);
    }

    #[test]
    fn waits_the_longer_wait_for_a_folder_on_external_storage() {
        let mut schedule = RescanSchedule::default();
        schedule.due(&[folder("1")], START_MS, |_| Storage::External);

        let early = schedule.due(
            &[folder("1")],
            START_MS + ms(EXTERNAL_RESCAN_EVERY) - 1,
            local,
        );
        let on_time = schedule.due(&[folder("1")], START_MS + ms(EXTERNAL_RESCAN_EVERY), local);

        assert_eq!(early, []);
        assert_eq!(on_time, [folder("1")]);
    }

    #[test]
    fn doubles_the_longer_wait_after_a_missed_rescan_up_to_an_hour() {
        let mut schedule = seen(folder("1"));
        schedule.record(
            folder("1"),
            &RescanOutcome::Unreachable,
            Storage::External,
            START_MS,
        );
        let after_one_miss = START_MS + ms(Duration::from_hours(1));
        schedule.record(
            folder("1"),
            &RescanOutcome::Unreachable,
            Storage::External,
            after_one_miss,
        );

        let early = schedule.due(
            &[folder("1")],
            after_one_miss + ms(Duration::from_hours(1)) - 1,
            local,
        );
        let on_time = schedule.due(
            &[folder("1")],
            after_one_miss + ms(Duration::from_hours(1)),
            local,
        );

        assert_eq!(early, []);
        assert_eq!(on_time, [folder("1")]);
    }

    #[test]
    fn follows_the_storage_a_rescan_found_the_folder_on() {
        let mut schedule = seen(folder("1"));

        schedule.record(folder("1"), &read(), Storage::External, START_MS);

        assert_eq!(
            schedule.due(&[folder("1")], START_MS + ms(RESCAN_EVERY), local),
            []
        );
        assert_eq!(
            schedule.due(&[folder("1")], START_MS + ms(EXTERNAL_RESCAN_EVERY), local),
            [folder("1")]
        );
    }

    #[test]
    fn keeps_the_storage_it_knew_after_a_rescan_that_failed() {
        let mut schedule = RescanSchedule::default();
        schedule.due(&[folder("1")], START_MS, |_| Storage::External);

        schedule.missed(folder("1"), START_MS);

        assert_eq!(
            schedule.due(
                &[folder("1")],
                START_MS + ms(Duration::from_hours(1)) - 1,
                local
            ),
            []
        );
        assert_eq!(
            schedule.due(
                &[folder("1")],
                START_MS + ms(Duration::from_hours(1)),
                local
            ),
            [folder("1")]
        );
    }
}
