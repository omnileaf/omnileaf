use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
    time::Duration,
};

use tokio::time::Instant;

use crate::FolderId;

const FIRST_RETRY_AFTER: Duration = Duration::from_secs(5);
const LONGEST_RETRY_AFTER: Duration = Duration::from_mins(5);
const MOST_DOUBLINGS: u32 = 6;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Listed {
    pub(super) path: PathBuf,
    pub(super) is_available: bool,
}

#[derive(Debug)]
enum Arming {
    Armed,
    Waiting { failures: u32, retry_at: Instant },
}

#[derive(Debug)]
struct Watched {
    listed: Listed,
    arming: Arming,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct Plan {
    pub(super) stop: Vec<(FolderId, PathBuf)>,
    pub(super) arm: Vec<(FolderId, PathBuf)>,
}

#[derive(Debug, Default)]
pub(super) struct WatchedFolders {
    folders: BTreeMap<FolderId, Watched>,
}

impl Plan {
    pub(super) fn is_empty(&self) -> bool {
        self.stop.is_empty() && self.arm.is_empty()
    }
}

impl WatchedFolders {
    /// Takes in the folders listed now, returning the watches to stop and those to set up, afresh or again.
    pub(super) fn plan(
        &mut self,
        listed: BTreeMap<FolderId, Listed>,
        rearm: &BTreeSet<FolderId>,
        now: Instant,
    ) -> Plan {
        let mut plan = Plan::default();
        let gone: Vec<FolderId> = self
            .folders
            .keys()
            .filter(|id| !listed.contains_key(id))
            .copied()
            .collect();
        for id in gone {
            if let Some(watched) = self.folders.remove(&id) {
                plan.stop.push((id, watched.listed.path));
            }
        }
        for (id, listed) in listed {
            let watched = self.folders.entry(id).or_insert_with(|| Watched {
                listed: listed.clone(),
                arming: Arming::Waiting {
                    failures: 0,
                    retry_at: now,
                },
            });
            if watched.listed.path != listed.path {
                plan.stop.push((id, watched.listed.path.clone()));
            }
            let is_due =
                watched.listed != listed || rearm.contains(&id) || watched.arming.is_due(now);
            watched.listed = listed;
            if is_due {
                plan.arm.push((id, watched.listed.path.clone()));
            }
        }
        plan
    }

    /// Notes how each watch set up went, returning the folders watched now.
    pub(super) fn record(
        &mut self,
        outcomes: Vec<(FolderId, Result<(), String>)>,
        now: Instant,
    ) -> Vec<FolderId> {
        let mut armed = Vec::new();
        for (id, outcome) in outcomes {
            let Some(watched) = self.folders.get_mut(&id) else {
                continue;
            };
            match outcome {
                Ok(()) => {
                    watched.arming = Arming::Armed;
                    armed.push(id);
                }
                Err(error) => {
                    let failures = watched.arming.failures().saturating_add(1);
                    if failures == 1 {
                        tracing::warn!(folder = %id, %error, "watch a library folder, leaving it to scheduled rescans until a later try");
                    } else {
                        tracing::debug!(folder = %id, %error, failures, "watch a library folder again");
                    }
                    watched.arming = Arming::Waiting {
                        failures,
                        retry_at: now + retry_after(failures),
                    };
                }
            }
        }
        armed
    }

    pub(super) fn ids(&self) -> Vec<FolderId> {
        self.folders.keys().copied().collect()
    }

    /// Sets every watch up again, as a new system watch holds none of the old one's.
    pub(super) fn forget_watches(&mut self, now: Instant) {
        for watched in self.folders.values_mut() {
            if matches!(watched.arming, Arming::Armed) {
                watched.arming = Arming::Waiting {
                    failures: 0,
                    retry_at: now,
                };
            }
        }
    }
}

impl Arming {
    fn is_due(&self, now: Instant) -> bool {
        match self {
            Self::Armed => false,
            Self::Waiting { retry_at, .. } => *retry_at <= now,
        }
    }

    fn failures(&self) -> u32 {
        match self {
            Self::Armed => 0,
            Self::Waiting { failures, .. } => *failures,
        }
    }
}

fn retry_after(failures: u32) -> Duration {
    let doublings = failures.saturating_sub(1).min(MOST_DOUBLINGS);
    FIRST_RETRY_AFTER
        .saturating_mul(1 << doublings)
        .min(LONGEST_RETRY_AFTER)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(id: &str) -> FolderId {
        id.parse().unwrap()
    }

    fn listed(path: &str) -> Listed {
        Listed {
            path: PathBuf::from(path),
            is_available: true,
        }
    }

    fn listing(folders: &[(&str, Listed)]) -> BTreeMap<FolderId, Listed> {
        folders
            .iter()
            .map(|(id, listed)| (folder(id), listed.clone()))
            .collect()
    }

    fn arm(folders: &[(&str, &str)]) -> Vec<(FolderId, PathBuf)> {
        folders
            .iter()
            .map(|(id, path)| (folder(id), PathBuf::from(path)))
            .collect()
    }

    fn watching(folders: &[(&str, Listed)], now: Instant) -> WatchedFolders {
        let mut watched = WatchedFolders::default();
        let plan = watched.plan(listing(folders), &BTreeSet::new(), now);
        watched.record(
            plan.arm.into_iter().map(|(id, _)| (id, Ok(()))).collect(),
            now,
        );
        watched
    }

    #[test]
    fn sets_up_a_watch_for_each_folder_listed_afresh() {
        let mut watched = WatchedFolders::default();

        let plan = watched.plan(
            listing(&[("1", listed("/books")), ("2", listed("/comics"))]),
            &BTreeSet::new(),
            Instant::now(),
        );

        assert_eq!(
            plan,
            Plan {
                stop: Vec::new(),
                arm: arm(&[("1", "/books"), ("2", "/comics")]),
            }
        );
    }

    #[test]
    fn leaves_a_working_watch_alone() {
        let now = Instant::now();
        let mut watched = watching(&[("1", listed("/books"))], now);

        let plan = watched.plan(listing(&[("1", listed("/books"))]), &BTreeSet::new(), now);

        assert!(plan.is_empty());
    }

    #[test]
    fn stops_the_watch_of_a_folder_gone_from_the_library() {
        let now = Instant::now();
        let mut watched = watching(&[("1", listed("/books")), ("2", listed("/comics"))], now);

        let plan = watched.plan(listing(&[("1", listed("/books"))]), &BTreeSet::new(), now);

        assert_eq!(
            plan,
            Plan {
                stop: arm(&[("2", "/comics")]),
                arm: Vec::new(),
            }
        );
    }

    #[test]
    fn sets_a_watch_up_again_once_its_folder_comes_back_or_goes() {
        let now = Instant::now();
        let mut watched = watching(&[("1", listed("/books"))], now);
        let unplugged = Listed {
            is_available: false,
            ..listed("/books")
        };

        let gone = watched.plan(listing(&[("1", unplugged)]), &BTreeSet::new(), now);
        watched.record(vec![(folder("1"), Ok(()))], now);
        let back = watched.plan(listing(&[("1", listed("/books"))]), &BTreeSet::new(), now);

        assert_eq!(gone.arm, arm(&[("1", "/books")]));
        assert_eq!(back.arm, arm(&[("1", "/books")]));
    }

    #[test]
    fn sets_a_broken_watch_up_again() {
        let now = Instant::now();
        let mut watched = watching(&[("1", listed("/books"))], now);

        let plan = watched.plan(
            listing(&[("1", listed("/books"))]),
            &BTreeSet::from([folder("1")]),
            now,
        );

        assert_eq!(plan.arm, arm(&[("1", "/books")]));
    }

    #[test]
    fn moves_a_watch_to_where_its_folder_now_is() {
        let now = Instant::now();
        let mut watched = watching(&[("1", listed("/books"))], now);

        let plan = watched.plan(listing(&[("1", listed("/moved"))]), &BTreeSet::new(), now);

        assert_eq!(
            plan,
            Plan {
                stop: arm(&[("1", "/books")]),
                arm: arm(&[("1", "/moved")]),
            }
        );
    }

    #[test]
    fn tries_a_failed_watch_again_only_once_its_wait_is_over() {
        let start = Instant::now();
        let mut watched = WatchedFolders::default();
        let books = || listing(&[("1", listed("/books"))]);
        watched.plan(books(), &BTreeSet::new(), start);

        let armed = watched.record(vec![(folder("1"), Err("not found".to_owned()))], start);
        let too_soon = watched.plan(books(), &BTreeSet::new(), start + retry_after(1) / 2);
        let in_time = watched.plan(books(), &BTreeSet::new(), start + retry_after(1));

        assert!(armed.is_empty());
        assert!(too_soon.is_empty());
        assert_eq!(in_time.arm, arm(&[("1", "/books")]));
    }

    #[test]
    fn waits_longer_after_each_failure_up_to_a_limit() {
        let waits: Vec<Duration> = (1..=12).map(retry_after).collect();

        assert!(waits.windows(2).all(|pair| pair[0] <= pair[1]));
        assert!(retry_after(2) > retry_after(1));
        assert_eq!(retry_after(12), retry_after(40));
        assert!(retry_after(u32::MAX) <= Duration::from_mins(5));
    }

    #[test]
    fn reports_the_folders_watched_now() {
        let now = Instant::now();
        let mut watched = WatchedFolders::default();
        watched.plan(
            listing(&[("1", listed("/books")), ("2", listed("/comics"))]),
            &BTreeSet::new(),
            now,
        );

        let armed = watched.record(
            vec![
                (folder("1"), Ok(())),
                (folder("2"), Err("denied".to_owned())),
            ],
            now,
        );

        assert_eq!(armed, vec![folder("1")]);
    }

    #[test]
    fn sets_every_watch_up_again_once_the_system_watch_is_new() {
        let now = Instant::now();
        let mut watched = watching(&[("1", listed("/books")), ("2", listed("/comics"))], now);

        watched.forget_watches(now);
        let plan = watched.plan(
            listing(&[("1", listed("/books")), ("2", listed("/comics"))]),
            &BTreeSet::new(),
            now,
        );

        assert_eq!(plan.arm, arm(&[("1", "/books"), ("2", "/comics")]));
    }

    #[test]
    fn names_every_folder_it_follows_watched_or_not() {
        let now = Instant::now();
        let mut watched = WatchedFolders::default();
        watched.plan(
            listing(&[("1", listed("/books")), ("2", listed("/comics"))]),
            &BTreeSet::new(),
            now,
        );

        watched.record(
            vec![
                (folder("1"), Ok(())),
                (folder("2"), Err("denied".to_owned())),
            ],
            now,
        );

        assert_eq!(watched.ids(), vec![folder("1"), folder("2")]);
    }
}
