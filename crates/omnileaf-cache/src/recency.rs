use std::{
    collections::{BTreeMap, HashMap},
    hash::Hash,
};

#[derive(Debug)]
pub(crate) struct Recency<K> {
    entries: HashMap<K, Entry>,
    by_last_use: BTreeMap<u64, K>,
    stored_bytes: u64,
    uses: u64,
}

#[derive(Debug, Clone, Copy)]
struct Entry {
    bytes: u64,
    last_use: u64,
}

impl<K> Default for Recency<K> {
    fn default() -> Self {
        Self {
            entries: HashMap::new(),
            by_last_use: BTreeMap::new(),
            stored_bytes: 0,
            uses: 0,
        }
    }
}

impl<K: Clone + Eq + Hash> Recency<K> {
    pub(crate) fn stored_bytes(&self) -> u64 {
        self.stored_bytes
    }

    pub(crate) fn record(&mut self, key: K, bytes: u64) {
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

    pub(crate) fn touch(&mut self, key: &K) -> bool {
        match self.entries.get(key).copied() {
            Some(entry) => {
                self.record(key.clone(), entry.bytes);
                true
            }
            None => false,
        }
    }

    pub(crate) fn forget(&mut self, key: &K) {
        if let Some(entry) = self.entries.remove(key) {
            self.by_last_use.remove(&entry.last_use);
            self.stored_bytes = self.stored_bytes.saturating_sub(entry.bytes);
        }
    }

    pub(crate) fn evict_beyond(&mut self, budget_bytes: u64) -> Vec<K> {
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
