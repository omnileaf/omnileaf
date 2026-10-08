use std::path::PathBuf;

use omnileaf_db::{
    Error,
    catalog::{
        AppleBookmark, BookmarkedRoot, RootId, RootLocator, library_root, mark_root_available,
        mark_root_unavailable, relocate_roots,
    },
    rusqlite::Transaction,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedBookmark {
    pub path: PathBuf,
    /// Present when the platform found the bookmark stale and made a new one to keep instead.
    pub refreshed: Option<AppleBookmark>,
}

/// A bookmarked folder as it was read, and where its bookmark opened it.
pub(crate) struct Reopened {
    id: RootId,
    read: RootLocator,
    opened: RootLocator,
}

impl Reopened {
    pub(crate) fn of(root: BookmarkedRoot, resolved: ResolvedBookmark) -> Self {
        let read = as_read(&root);
        Self {
            id: root.id,
            opened: RootLocator::AppleBookmark {
                path: resolved.path,
                bookmark: resolved.refreshed.unwrap_or(root.bookmark),
            },
            read,
        }
    }

    fn has_moved(&self) -> bool {
        self.opened.path() != self.read.path()
    }
}

pub(crate) fn as_read(root: &BookmarkedRoot) -> RootLocator {
    RootLocator::AppleBookmark {
        path: root.path.clone(),
        bookmark: root.bookmark.clone(),
    }
}

/// Reports whether any folder's place or availability changed, leaving alone each folder that changed since its bookmark was read.
pub(crate) fn note_bookmarks_opened(
    transaction: &Transaction<'_>,
    unreachable: &[(RootId, RootLocator)],
    reopened: &[Reopened],
    since_ms: i64,
) -> Result<bool, Error> {
    let mut changed = false;
    for (id, read) in unreachable {
        if is_as_read(transaction, *id, read)? {
            changed |= set_availability(transaction, *id, Some(since_ms))?;
        }
    }
    let mut unchanged = Vec::new();
    for folder in reopened {
        if is_as_read(transaction, folder.id, &folder.read)? {
            unchanged.push(folder);
        }
    }
    let moves: Vec<(RootId, RootLocator)> = unchanged
        .iter()
        .filter(|folder| folder.opened != folder.read)
        .map(|folder| (folder.id, folder.opened.clone()))
        .collect();
    let staying = relocate_roots(transaction, &moves)?;
    for folder in unchanged {
        let has_arrived = !staying.contains(&folder.id);
        changed |= has_arrived && folder.has_moved();
        let unavailable_since_ms = (!has_arrived).then_some(since_ms);
        changed |= set_availability(transaction, folder.id, unavailable_since_ms)?;
    }
    Ok(changed)
}

fn is_as_read(
    transaction: &Transaction<'_>,
    id: RootId,
    read: &RootLocator,
) -> Result<bool, Error> {
    match library_root(transaction, id) {
        Ok(root) => Ok(root.locator == *read),
        Err(Error::UnknownRoot { .. }) => Ok(false),
        Err(error) => Err(error),
    }
}

fn set_availability(
    transaction: &Transaction<'_>,
    id: RootId,
    unavailable_since_ms: Option<i64>,
) -> Result<bool, Error> {
    let was_unavailable = library_root(transaction, id)?
        .unavailable_since_ms
        .is_some();
    match (was_unavailable, unavailable_since_ms) {
        (false, None) | (true, Some(_)) => Ok(false),
        (true, None) => mark_root_available(transaction, id).map(|()| true),
        (false, Some(since_ms)) => mark_root_unavailable(transaction, id, since_ms).map(|()| true),
    }
}
