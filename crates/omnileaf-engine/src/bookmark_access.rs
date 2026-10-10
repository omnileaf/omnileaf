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

/// A bookmarked folder as it was before its bookmark was opened.
pub(crate) struct AsRead {
    id: RootId,
    locator: RootLocator,
    is_unavailable: bool,
}

pub(crate) struct Reopened {
    read: AsRead,
    opened: RootLocator,
}

impl AsRead {
    pub(crate) fn of(root: &BookmarkedRoot) -> Self {
        Self {
            id: root.id,
            locator: RootLocator::AppleBookmark {
                path: root.path.clone(),
                bookmark: root.bookmark.clone(),
            },
            is_unavailable: root.unavailable_since_ms.is_some(),
        }
    }

    fn is_still_so(&self, transaction: &Transaction<'_>) -> Result<bool, Error> {
        match library_root(transaction, self.id) {
            Ok(root) => Ok(root.locator == self.locator
                && root.unavailable_since_ms.is_some() == self.is_unavailable),
            Err(Error::UnknownRoot { .. }) => Ok(false),
            Err(error) => Err(error),
        }
    }

    fn mark(
        &self,
        transaction: &Transaction<'_>,
        unavailable_since_ms: Option<i64>,
    ) -> Result<bool, Error> {
        match (self.is_unavailable, unavailable_since_ms) {
            (false, None) | (true, Some(_)) => Ok(false),
            (true, None) => mark_root_available(transaction, self.id).map(|()| true),
            (false, Some(since_ms)) => {
                mark_root_unavailable(transaction, self.id, since_ms).map(|()| true)
            }
        }
    }
}

impl Reopened {
    pub(crate) fn of(root: BookmarkedRoot, resolved: ResolvedBookmark) -> Self {
        let read = AsRead::of(&root);
        Self {
            read,
            opened: RootLocator::AppleBookmark {
                path: resolved.path,
                bookmark: resolved.refreshed.unwrap_or(root.bookmark),
            },
        }
    }

    fn has_moved(&self) -> bool {
        self.opened.local_path() != self.read.locator.local_path()
    }
}

/// Reports whether any folder's place or availability changed, leaving alone each folder that changed since it was read.
pub(crate) fn note_bookmarks_opened(
    transaction: &Transaction<'_>,
    unreachable: &[AsRead],
    reopened: &[Reopened],
    since_ms: i64,
) -> Result<bool, Error> {
    let mut changed = false;
    for folder in unreachable {
        if folder.is_still_so(transaction)? {
            changed |= folder.mark(transaction, Some(since_ms))?;
        }
    }
    let mut unchanged = Vec::new();
    for folder in reopened {
        if folder.read.is_still_so(transaction)? {
            unchanged.push(folder);
        }
    }
    let moves: Vec<(RootId, RootLocator)> = unchanged
        .iter()
        .filter(|folder| folder.opened != folder.read.locator)
        .map(|folder| (folder.read.id, folder.opened.clone()))
        .collect();
    let staying = relocate_roots(transaction, &moves)?;
    for folder in unchanged
        .into_iter()
        .filter(|folder| !staying.contains(&folder.read.id))
    {
        changed |= folder.has_moved();
        changed |= folder.read.mark(transaction, None)?;
    }
    Ok(changed)
}
