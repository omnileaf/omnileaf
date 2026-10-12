use std::{collections::BTreeMap, time::Duration};

use tokio::time::Instant;

use crate::FolderId;

const QUIET_FOR: Duration = Duration::from_millis(500);

#[derive(Debug, Default)]
pub(super) struct Bursts {
    quiet_at: BTreeMap<FolderId, Instant>,
}

impl Bursts {
    pub(super) fn note(&mut self, id: FolderId, now: Instant) {
        self.quiet_at.insert(id, now + QUIET_FOR);
    }

    pub(super) fn next_quiet_at(&self) -> Option<Instant> {
        self.quiet_at.values().min().copied()
    }

    pub(super) fn take_quiet(&mut self, now: Instant) -> Vec<FolderId> {
        self.quiet_at
            .extract_if(.., |_, quiet_at| *quiet_at <= now)
            .map(|(id, _)| id)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(id: &str) -> FolderId {
        id.parse().unwrap()
    }

    #[test]
    fn waits_for_a_folder_to_be_quiet_before_rescanning_it() {
        let start = Instant::now();
        let mut bursts = Bursts::default();

        bursts.note(folder("1"), start);

        assert_eq!(bursts.next_quiet_at(), Some(start + QUIET_FOR));
        assert!(bursts.take_quiet(start + QUIET_FOR / 2).is_empty());
        assert_eq!(bursts.take_quiet(start + QUIET_FOR), vec![folder("1")]);
    }

    #[test]
    fn puts_a_rescan_off_while_changes_keep_coming() {
        let start = Instant::now();
        let mut bursts = Bursts::default();
        bursts.note(folder("1"), start);

        bursts.note(folder("1"), start + QUIET_FOR / 2);

        assert!(bursts.take_quiet(start + QUIET_FOR).is_empty());
        assert_eq!(
            bursts.take_quiet(start + QUIET_FOR / 2 + QUIET_FOR),
            vec![folder("1")]
        );
    }

    #[test]
    fn rescans_a_burst_once() {
        let start = Instant::now();
        let mut bursts = Bursts::default();
        for _ in 0..100 {
            bursts.note(folder("1"), start);
        }

        let first = bursts.take_quiet(start + QUIET_FOR);

        assert_eq!(first, vec![folder("1")]);
        assert!(bursts.take_quiet(start + QUIET_FOR * 2).is_empty());
        assert_eq!(bursts.next_quiet_at(), None);
    }

    #[test]
    fn keeps_each_folder_to_its_own_quiet_time() {
        let start = Instant::now();
        let mut bursts = Bursts::default();
        bursts.note(folder("1"), start);
        bursts.note(folder("2"), start + QUIET_FOR / 2);

        let quiet = bursts.take_quiet(start + QUIET_FOR);

        assert_eq!(quiet, vec![folder("1")]);
        assert_eq!(
            bursts.next_quiet_at(),
            Some(start + QUIET_FOR / 2 + QUIET_FOR)
        );
    }
}
