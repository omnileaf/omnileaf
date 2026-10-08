use std::path::{Path, PathBuf};

use omnileaf_db::{
    Error,
    catalog::{
        AppleBookmark, BookmarkedRoot, RootId, RootLocator, mark_root_available,
        mark_root_unavailable, relocate_root,
    },
    rusqlite::Transaction,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedBookmark {
    pub path: PathBuf,
    /// Present when the platform found the bookmark stale and made a new one to keep instead.
    pub refreshed: Option<AppleBookmark>,
}

pub(crate) struct Reopened {
    id: RootId,
    was_unavailable: bool,
    from: PathBuf,
    to: PathBuf,
    bookmark: AppleBookmark,
    is_refreshed: bool,
}

impl Reopened {
    pub(crate) fn of(root: BookmarkedRoot, resolved: ResolvedBookmark) -> Self {
        Self {
            id: root.id,
            was_unavailable: root.unavailable_since_ms.is_some(),
            from: root.path,
            to: resolved.path,
            is_refreshed: resolved.refreshed.is_some(),
            bookmark: resolved.refreshed.unwrap_or(root.bookmark),
        }
    }

    fn has_moved(&self) -> bool {
        self.from != self.to
    }

    fn needs_relocating(&self) -> bool {
        self.has_moved() || self.is_refreshed
    }

    pub(crate) fn changes_anything(&self) -> bool {
        self.was_unavailable || self.needs_relocating()
    }

    fn at(&self, path: &Path) -> RootLocator {
        RootLocator::AppleBookmark {
            path: path.to_path_buf(),
            bookmark: self.bookmark.clone(),
        }
    }
}

/// Reports whether any folder's place or availability changed.
pub(crate) fn note_bookmarks_opened(
    transaction: &Transaction<'_>,
    unreachable: &[RootId],
    reopened: &[Reopened],
    since_ms: i64,
) -> Result<bool, Error> {
    let mut changed = false;
    for id in unreachable {
        unless_removed(mark_root_unavailable(transaction, *id, since_ms))?;
        changed = true;
    }
    for folder in reopened.iter().filter(|folder| folder.was_unavailable) {
        unless_removed(mark_root_available(transaction, folder.id))?;
        changed = true;
    }
    let mut waiting: Vec<&Reopened> = reopened
        .iter()
        .filter(|folder| folder.needs_relocating())
        .collect();
    loop {
        let mut blocked = Vec::new();
        for folder in &waiting {
            match relocate_root(transaction, folder.id, &folder.at(&folder.to)) {
                Ok(()) => changed |= folder.has_moved(),
                Err(Error::LocationTaken { .. }) => blocked.push(*folder),
                Err(error) => unless_removed(Err(error))?,
            }
        }
        if blocked.is_empty() || blocked.len() == waiting.len() {
            return keep_where_they_were(transaction, &blocked).map(|()| changed);
        }
        waiting = blocked;
    }
}

fn keep_where_they_were(transaction: &Transaction<'_>, blocked: &[&Reopened]) -> Result<(), Error> {
    for folder in blocked {
        tracing::warn!(folder = %folder.id, "keep a bookmarked folder where it was, since another library folder is where it moved to");
        unless_removed(relocate_root(
            transaction,
            folder.id,
            &folder.at(&folder.from),
        ))?;
    }
    Ok(())
}

fn unless_removed(outcome: Result<(), Error>) -> Result<(), Error> {
    match outcome {
        Err(Error::UnknownRoot { .. }) => Ok(()),
        other => other,
    }
}
