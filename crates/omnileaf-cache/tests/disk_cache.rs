#![expect(
    clippy::unwrap_used,
    reason = "the cache folders are scratch fixtures, so a failed set-up should stop the test"
)]

use std::{
    env,
    fs::{self, File},
    path::{Path, PathBuf},
    process,
    time::{Duration, SystemTime},
};

use omnileaf_cache::{CacheError, CacheKey, DiskCache};
use proptest::prelude::*;

const BUDGET_BYTES: u64 = 300;
const ENTRY_BYTES: usize = 100;

struct ScratchFolder(PathBuf);

impl ScratchFolder {
    fn new(name: &str) -> Self {
        let path = env::temp_dir()
            .join(format!("omnileaf-cache-{}", process::id()))
            .join(name);
        let _ = fs::remove_dir_all(&path);
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for ScratchFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn key(text: &str) -> CacheKey {
    text.parse().unwrap()
}

fn entry(fill: u8) -> Vec<u8> {
    vec![fill; ENTRY_BYTES]
}

fn bytes_on_disk(folder: &Path) -> u64 {
    fs::read_dir(folder)
        .unwrap()
        .map(|entry| entry.unwrap().metadata().unwrap().len())
        .sum()
}

fn last_used_at(folder: &Path, name: &str, seconds: u64) {
    File::options()
        .write(true)
        .open(folder.join(name))
        .unwrap()
        .set_modified(SystemTime::UNIX_EPOCH + Duration::from_secs(seconds))
        .unwrap();
}

#[test]
fn returns_the_bytes_put_under_a_key() {
    let folder = ScratchFolder::new("returns-put");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();

    cache.put(&key("cover-1"), &entry(1)).unwrap();

    assert_eq!(cache.get(&key("cover-1")).unwrap(), Some(entry(1)));
}

#[test]
fn misses_a_key_never_put() {
    let folder = ScratchFolder::new("misses");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();

    let found = cache.get(&key("cover-1")).unwrap();

    assert_eq!(found, None);
}

#[test]
fn keeps_its_entries_when_opened_again() {
    let folder = ScratchFolder::new("reopened");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();
    cache.put(&key("cover-1"), &entry(1)).unwrap();
    drop(cache);

    let reopened = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();

    assert_eq!(reopened.get(&key("cover-1")).unwrap(), Some(entry(1)));
    assert_eq!(reopened.stored_bytes(), 100);
}

#[test]
fn drops_the_least_recently_used_entry_once_over_its_budget() {
    let folder = ScratchFolder::new("evicts");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();
    for name in ["a", "b", "c"] {
        cache.put(&key(name), &entry(1)).unwrap();
    }
    cache.get(&key("a")).unwrap();

    cache.put(&key("d"), &entry(2)).unwrap();

    let kept: Vec<bool> = ["a", "b", "c", "d"]
        .iter()
        .map(|name| cache.get(&key(name)).unwrap().is_some())
        .collect();
    assert_eq!(kept, [true, false, true, true]);
    assert_eq!(bytes_on_disk(folder.path()), BUDGET_BYTES);
}

#[test]
fn counts_an_entry_put_again_at_its_new_size() {
    let folder = ScratchFolder::new("replaced");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();
    cache.put(&key("a"), &entry(1)).unwrap();

    cache.put(&key("a"), &[7; 40]).unwrap();

    assert_eq!(cache.get(&key("a")).unwrap(), Some(vec![7; 40]));
    assert_eq!(cache.stored_bytes(), 40);
}

#[test]
fn stores_nothing_for_an_entry_larger_than_its_whole_budget() {
    let folder = ScratchFolder::new("too-large");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();
    cache.put(&key("a"), &entry(1)).unwrap();

    cache.put(&key("huge"), &[0; 400]).unwrap();

    assert_eq!(cache.get(&key("huge")).unwrap(), None);
    assert_eq!(cache.get(&key("a")).unwrap(), Some(entry(1)));
}

#[test]
fn drops_the_entry_used_longest_ago_before_its_last_run_ended() {
    let folder = ScratchFolder::new("reopened-order");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();
    for name in ["a", "b", "c"] {
        cache.put(&key(name), &entry(1)).unwrap();
    }
    drop(cache);
    last_used_at(folder.path(), "a", 300);
    last_used_at(folder.path(), "b", 100);
    last_used_at(folder.path(), "c", 200);
    let reopened = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();

    reopened.put(&key("d"), &entry(2)).unwrap();

    assert_eq!(reopened.get(&key("b")).unwrap(), None);
    assert!(reopened.get(&key("c")).unwrap().is_some());
}

#[test]
fn shrinks_to_a_smaller_budget_when_opened_with_one() {
    let folder = ScratchFolder::new("smaller-budget");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();
    for name in ["a", "b", "c"] {
        cache.put(&key(name), &entry(1)).unwrap();
    }
    drop(cache);

    let reopened = DiskCache::open(folder.path().to_owned(), 150).unwrap();

    assert_eq!(reopened.stored_bytes(), 100);
    assert_eq!(bytes_on_disk(folder.path()), 100);
}

#[test]
fn removes_a_write_left_unfinished_by_a_crash() {
    let folder = ScratchFolder::new("unfinished");
    fs::create_dir_all(folder.path()).unwrap();
    fs::write(folder.path().join("a.partial-1-0"), entry(1)).unwrap();

    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();

    assert_eq!(cache.stored_bytes(), 0);
    assert!(!folder.path().join("a.partial-1-0").exists());
}

#[test]
fn refuses_a_key_that_is_not_a_plain_file_name() {
    let refused = ["", "../a", "a/b", "A", "a.b", &"a".repeat(129)].map(str::parse::<CacheKey>);

    assert!(
        refused
            .iter()
            .all(|key| matches!(key, Err(CacheError::MalformedKey { .. })))
    );
}

#[derive(Clone, Debug)]
enum Step {
    Put { key: u8, bytes: usize },
    Get { key: u8 },
}

fn steps() -> impl Strategy<Value = Vec<Step>> {
    let step = prop_oneof![
        (0_u8..6, 0_usize..=200).prop_map(|(key, bytes)| Step::Put { key, bytes }),
        (0_u8..6).prop_map(|key| Step::Get { key }),
    ];
    prop::collection::vec(step, 1..24)
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]

    #[test]
    fn never_holds_more_than_its_budget_and_keeps_what_was_just_put(steps in steps()) {
        let folder = ScratchFolder::new("budget-invariant");
        let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();

        for step in steps {
            match step {
                Step::Put { key: name, bytes } => {
                    let put = key(&format!("entry-{name}"));
                    cache.put(&put, &vec![name; bytes]).unwrap();
                    prop_assert_eq!(cache.get(&put).unwrap(), Some(vec![name; bytes]));
                }
                Step::Get { key: name } => {
                    cache.get(&key(&format!("entry-{name}"))).unwrap();
                }
            }
            prop_assert!(cache.stored_bytes() <= BUDGET_BYTES);
            prop_assert_eq!(bytes_on_disk(folder.path()), cache.stored_bytes());
        }
    }
}
