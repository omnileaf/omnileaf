#![expect(
    clippy::unwrap_used,
    reason = "the cache folders are scratch fixtures, so a failed set-up should stop the test"
)]

use std::{
    fs::{self, File},
    path::Path,
    time::{Duration, SystemTime},
};

use omnileaf_cache::{CacheError, CacheKey, DiskCache};
use omnileaf_testkit::ScratchFolder;
use proptest::prelude::*;

const BUDGET_BYTES: u64 = 300;
const ENTRY_BYTES: usize = 100;

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

    assert_eq!(cache.get(&key("cover-1")), Some(entry(1)));
}

#[test]
fn misses_a_key_never_put() {
    let folder = ScratchFolder::new("misses");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();

    let found = cache.get(&key("cover-1"));

    assert_eq!(found, None);
}

#[test]
fn keeps_its_entries_when_opened_again() {
    let folder = ScratchFolder::new("reopened");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();
    cache.put(&key("cover-1"), &entry(1)).unwrap();
    drop(cache);

    let reopened = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();

    assert_eq!(reopened.get(&key("cover-1")), Some(entry(1)));
    assert_eq!(reopened.stored_bytes(), 100);
}

#[test]
fn drops_the_least_recently_used_entry_once_over_its_budget() {
    let folder = ScratchFolder::new("evicts");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();
    for name in ["a", "b", "c"] {
        cache.put(&key(name), &entry(1)).unwrap();
    }
    let _ = cache.get(&key("a"));

    cache.put(&key("d"), &entry(2)).unwrap();

    let kept: Vec<bool> = ["a", "b", "c", "d"]
        .iter()
        .map(|name| cache.get(&key(name)).is_some())
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

    assert_eq!(cache.get(&key("a")), Some(vec![7; 40]));
    assert_eq!(cache.stored_bytes(), 40);
}

#[test]
fn stores_nothing_for_an_entry_larger_than_its_whole_budget() {
    let folder = ScratchFolder::new("too-large");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();
    cache.put(&key("a"), &entry(1)).unwrap();

    cache.put(&key("huge"), &[0; 400]).unwrap();

    assert_eq!(cache.get(&key("huge")), None);
    assert_eq!(cache.get(&key("a")), Some(entry(1)));
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

    assert_eq!(reopened.get(&key("b")), None);
    assert!(reopened.get(&key("c")).is_some());
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
    fs::write(folder.path().join("a.partial-1-0"), entry(1)).unwrap();

    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();

    assert_eq!(cache.stored_bytes(), 0);
    assert!(!folder.path().join("a.partial-1-0").exists());
}

#[cfg(unix)]
#[test]
fn opens_without_the_entries_whose_details_it_cannot_read() {
    use std::os::unix::fs::PermissionsExt;
    const LISTABLE_BUT_NOT_SEARCHABLE: u32 = 0o400;
    const OWNER_ONLY: u32 = 0o700;
    let folder = ScratchFolder::new("unreadable-entry");
    fs::write(folder.path().join("a"), entry(1)).unwrap();
    let set_mode = |mode| {
        fs::set_permissions(folder.path(), fs::Permissions::from_mode(mode)).unwrap();
    };
    set_mode(LISTABLE_BUT_NOT_SEARCHABLE);

    let opened = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES);

    set_mode(OWNER_ONLY);
    assert!(
        matches!(&opened, Ok(cache) if cache.stored_bytes() == 0),
        "{opened:?}"
    );
}

#[cfg(unix)]
fn set_entry_mode(folder: &Path, name: &str, mode: u32) {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(folder.join(name), fs::Permissions::from_mode(mode)).unwrap();
}

#[cfg(unix)]
#[test]
fn serves_an_entry_it_may_only_read() {
    const READ_ONLY: u32 = 0o444;
    let folder = ScratchFolder::new("read-only-entry");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();
    cache.put(&key("a"), &entry(1)).unwrap();
    set_entry_mode(folder.path(), "a", READ_ONLY);

    let found = cache.get(&key("a"));

    assert_eq!(found, Some(entry(1)));
}

#[cfg(unix)]
#[test]
fn misses_an_entry_it_cannot_read_and_lets_it_go() {
    const NO_ACCESS: u32 = 0o000;
    let folder = ScratchFolder::new("unreadable-file");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();
    cache.put(&key("a"), &entry(1)).unwrap();
    set_entry_mode(folder.path(), "a", NO_ACCESS);

    let found = cache.get(&key("a"));

    assert_eq!(found, None);
    assert_eq!(cache.stored_bytes(), 0);
    assert!(!folder.path().join("a").exists());
}

#[cfg(unix)]
#[test]
fn keeps_counting_an_entry_it_could_not_remove() {
    use std::os::unix::fs::PermissionsExt;
    const READ_ONLY_FOLDER: u32 = 0o500;
    const OWNER_ONLY: u32 = 0o700;
    let folder = ScratchFolder::new("unremovable-entry");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();
    cache.put(&key("a"), &entry(1)).unwrap();
    let set_mode = |mode| {
        fs::set_permissions(folder.path(), fs::Permissions::from_mode(mode)).unwrap();
    };
    set_mode(READ_ONLY_FOLDER);

    cache.remove(&key("a"));

    set_mode(OWNER_ONLY);
    assert!(folder.path().join("a").exists());
    assert_eq!(cache.stored_bytes(), 100);
}

#[test]
fn misses_an_entry_a_lost_write_left_empty_and_lets_it_go() {
    let folder = ScratchFolder::new("emptied-entry");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();
    cache.put(&key("a"), &entry(1)).unwrap();
    fs::write(folder.path().join("a"), []).unwrap();

    let found = cache.get(&key("a"));

    assert_eq!(found, None);
    assert_eq!(cache.stored_bytes(), 0);
    assert!(!folder.path().join("a").exists());
}

#[test]
fn lets_go_of_an_entry_removed() {
    let folder = ScratchFolder::new("removed");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();
    cache.put(&key("a"), &entry(1)).unwrap();
    cache.put(&key("b"), &entry(2)).unwrap();

    cache.remove(&key("a"));

    assert_eq!(cache.get(&key("a")), None);
    assert_eq!(cache.stored_bytes(), 100);
    assert_eq!(bytes_on_disk(folder.path()), 100);
}

#[test]
fn stores_nothing_for_an_empty_entry() {
    let folder = ScratchFolder::new("empty-put");
    let cache = DiskCache::open(folder.path().to_owned(), BUDGET_BYTES).unwrap();

    cache.put(&key("a"), &[]).unwrap();

    assert_eq!(cache.get(&key("a")), None);
    assert_eq!(bytes_on_disk(folder.path()), 0);
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
        (0_u8..6, 1_usize..=200).prop_map(|(key, bytes)| Step::Put { key, bytes }),
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
                    prop_assert_eq!(cache.get(&put), Some(vec![name; bytes]));
                }
                Step::Get { key: name } => {
                    let _ = cache.get(&key(&format!("entry-{name}")));
                }
            }
            prop_assert!(cache.stored_bytes() <= BUDGET_BYTES);
            prop_assert_eq!(bytes_on_disk(folder.path()), cache.stored_bytes());
        }
    }
}
