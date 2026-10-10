use omnileaf_engine::TreeUri;

/// A folder grant the system still holds for the app, and when the app took it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PersistedGrant {
    pub uri: TreeUri,
    pub persisted_at_ms: i64,
}

/// Leaves alone a grant taken after the folders were listed, since it may belong to a folder still being added.
#[must_use]
pub fn grants_to_release(
    persisted: &[PersistedGrant],
    kept: &[TreeUri],
    listed_at_ms: i64,
) -> Vec<TreeUri> {
    persisted
        .iter()
        .filter(|grant| grant.persisted_at_ms < listed_at_ms && !kept.contains(&grant.uri))
        .map(|grant| grant.uri.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const LISTED_AT_MS: i64 = 1_700_000_000_000;

    fn tree(id: &str) -> TreeUri {
        TreeUri::parse(format!("content://documents.test/tree/{id}")).unwrap()
    }

    fn granted(id: &str, persisted_at_ms: i64) -> PersistedGrant {
        PersistedGrant {
            uri: tree(id),
            persisted_at_ms,
        }
    }

    #[test]
    fn releases_grants_no_folder_uses_and_keeps_the_rest() {
        let persisted = [
            granted("comics", LISTED_AT_MS - 2),
            granted("removed", LISTED_AT_MS - 1),
        ];

        let released = grants_to_release(&persisted, &[tree("comics")], LISTED_AT_MS);

        assert_eq!(released, [tree("removed")]);
    }

    #[test]
    fn keeps_a_grant_taken_after_the_folders_were_listed() {
        let persisted = [granted("picking", LISTED_AT_MS)];

        let released = grants_to_release(&persisted, &[], LISTED_AT_MS);

        assert!(released.is_empty());
    }
}
