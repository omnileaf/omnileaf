use std::{collections::HashMap, hash::Hash, sync::Arc};

use crate::recency::Recency;

/// Values kept in memory under a byte budget, dropping the least recently used first.
#[derive(Debug)]
pub struct MemoryCache<K, V> {
    budget_bytes: u64,
    recency: Recency<K>,
    values: HashMap<K, Arc<V>>,
}

impl<K: Clone + Eq + Hash, V> MemoryCache<K, V> {
    #[must_use]
    pub fn new(budget_bytes: u64) -> Self {
        Self {
            budget_bytes,
            recency: Recency::default(),
            values: HashMap::new(),
        }
    }

    /// The value, which becomes the most recently used.
    pub fn get(&mut self, key: &K) -> Option<Arc<V>> {
        if !self.recency.touch(key) {
            return None;
        }
        self.values.get(key).cloned()
    }

    #[must_use]
    pub fn contains(&self, key: &K) -> bool {
        self.values.contains_key(key)
    }

    /// Keeps the value as the most recently used, unless it alone weighs more than the budget.
    pub fn insert(&mut self, key: K, value: Arc<V>, bytes: u64) {
        if bytes > self.budget_bytes {
            self.recency.forget(&key);
            self.values.remove(&key);
            return;
        }
        self.recency.record(key.clone(), bytes);
        self.values.insert(key, value);
        for evicted in self.recency.evict_beyond(self.budget_bytes) {
            self.values.remove(&evicted);
        }
    }

    #[must_use]
    pub fn stored_bytes(&self) -> u64 {
        self.recency.stored_bytes()
    }
}
