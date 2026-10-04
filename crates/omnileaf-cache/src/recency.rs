use std::collections::{BTreeMap, HashMap};

use crate::CacheKey;

/// The entries a cache holds, their sizes and the order they were last used in.
#[derive(Debug, Default)]
pub(crate) struct Recency {
    entries: HashMap<CacheKey, Entry>,
    by_last_use: BTreeMap<u64, CacheKey>,
    stored_bytes: u64,
    uses: u64,
}

#[derive(Debug, Clone, Copy)]
struct Entry {
    bytes: u64,
    last_use: u64,
}

impl Recency {
    pub(crate) fn stored_bytes(&self) -> u64 {
        self.stored_bytes
    }

    /// Records the entry as the most recently used, replacing its size when it was there already.
    pub(crate) fn record(&mut self, key: CacheKey, bytes: u64) {
        self.forget(&key);
        self.uses += 1;
        self.by_last_use.insert(self.uses, key.clone());
        self.entries.insert(
            key,
            Entry {
                bytes,
                last_use: self.uses,
            },
        );
        self.stored_bytes = self.stored_bytes.saturating_add(bytes);
    }

    /// Marks the entry as the most recently used, returning whether it is there.
    pub(crate) fn touch(&mut self, key: &CacheKey) -> bool {
        match self.entries.get(key).copied() {
            Some(entry) => {
                self.record(key.clone(), entry.bytes);
                true
            }
            None => false,
        }
    }

    pub(crate) fn forget(&mut self, key: &CacheKey) {
        if let Some(entry) = self.entries.remove(key) {
            self.by_last_use.remove(&entry.last_use);
            self.stored_bytes = self.stored_bytes.saturating_sub(entry.bytes);
        }
    }

    /// Forgets the least recently used entries until the rest fit in `budget_bytes`, returning the ones forgotten.
    pub(crate) fn evict_beyond(&mut self, budget_bytes: u64) -> Vec<CacheKey> {
        let mut evicted = Vec::new();
        while self.stored_bytes > budget_bytes {
            let Some((_, key)) = self.by_last_use.pop_first() else {
                break;
            };
            if let Some(entry) = self.entries.remove(&key) {
                self.stored_bytes = self.stored_bytes.saturating_sub(entry.bytes);
            }
            evicted.push(key);
        }
        evicted
    }
}
