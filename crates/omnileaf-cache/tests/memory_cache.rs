use std::sync::Arc;

use omnileaf_cache::MemoryCache;
use proptest::prelude::*;

const BUDGET_BYTES: u64 = 300;
const ENTRY_BYTES: u64 = 100;

fn cache() -> MemoryCache<u32, &'static str> {
    MemoryCache::new(BUDGET_BYTES)
}

#[test]
fn hands_back_a_value_it_keeps() {
    let mut cache = cache();

    cache.insert(1, Arc::new("page one"), ENTRY_BYTES);

    assert_eq!(cache.get(&1).as_deref(), Some(&"page one"));
}

#[test]
fn drops_the_least_recently_used_value_to_stay_within_its_budget() {
    let mut cache = cache();
    for key in 1..=3 {
        cache.insert(key, Arc::new("page"), ENTRY_BYTES);
    }
    let _ = cache.get(&1);

    cache.insert(4, Arc::new("page"), ENTRY_BYTES);

    assert_eq!(
        [1, 2, 3, 4].map(|key| cache.contains(&key)),
        [true, false, true, true]
    );
    assert_eq!(cache.stored_bytes(), BUDGET_BYTES);
}

#[test]
fn keeps_nothing_that_alone_weighs_more_than_its_budget() {
    let mut cache = cache();
    cache.insert(1, Arc::new("page"), ENTRY_BYTES);

    cache.insert(2, Arc::new("spread"), BUDGET_BYTES + 1);

    assert!(cache.contains(&1));
    assert!(!cache.contains(&2));
    assert_eq!(cache.stored_bytes(), ENTRY_BYTES);
}

#[test]
fn replaces_a_value_kept_under_the_same_key() {
    let mut cache = cache();
    cache.insert(1, Arc::new("old"), ENTRY_BYTES);

    cache.insert(1, Arc::new("new"), ENTRY_BYTES * 2);

    assert_eq!(cache.get(&1).as_deref(), Some(&"new"));
    assert_eq!(cache.stored_bytes(), ENTRY_BYTES * 2);
}

proptest! {
    #[test]
    fn never_holds_more_than_its_budget_and_always_keeps_the_last_value_that_fits(
        inserts in prop::collection::vec((0_u32..20, 1_u64..=BUDGET_BYTES * 2), 1..60),
    ) {
        let mut cache = MemoryCache::new(BUDGET_BYTES);

        for (key, bytes) in &inserts {
            cache.insert(*key, Arc::new(*bytes), *bytes);
            prop_assert!(cache.stored_bytes() <= BUDGET_BYTES);
            if *bytes <= BUDGET_BYTES {
                let kept = cache.get(key);
                prop_assert_eq!(kept.as_deref(), Some(bytes));
            }
        }
    }
}
