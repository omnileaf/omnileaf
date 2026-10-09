use std::path::PathBuf;

use omnileaf_engine::{AppleBookmark, ResolvedBookmark, RootLocator};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct PickedFolder {
    path: PathBuf,
    bookmark: Vec<u8>,
}

#[derive(Debug, Deserialize)]
pub struct ReopenedFolder {
    path: PathBuf,
    refreshed: Option<Vec<u8>>,
}

impl From<PickedFolder> for RootLocator {
    fn from(folder: PickedFolder) -> Self {
        Self::AppleBookmark {
            path: folder.path,
            bookmark: AppleBookmark::new(folder.bookmark),
        }
    }
}

impl From<ReopenedFolder> for ResolvedBookmark {
    fn from(folder: ReopenedFolder) -> Self {
        Self {
            path: folder.path,
            refreshed: folder.refreshed.map(AppleBookmark::new),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BOOKMARK: [u8; 4] = [98, 111, 111, 107];

    #[test]
    fn a_picked_folder_becomes_a_bookmarked_root() {
        let reply = r#"{"path":"/private/var/mobile/Comics","bookmark":[98,111,111,107]}"#;

        let picked: Option<PickedFolder> = serde_json::from_str(reply).unwrap();

        assert_eq!(
            picked.map(RootLocator::from),
            Some(RootLocator::AppleBookmark {
                path: PathBuf::from("/private/var/mobile/Comics"),
                bookmark: AppleBookmark::new(BOOKMARK.to_vec()),
            })
        );
    }

    #[test]
    fn a_cancelled_pick_is_no_folder() {
        let picked: Option<PickedFolder> = serde_json::from_str("null").unwrap();

        assert!(picked.is_none());
    }

    #[test]
    fn a_reply_without_a_bookmark_is_refused() {
        let picked = serde_json::from_str::<Option<PickedFolder>>(r#"{"path":"/Comics"}"#);

        assert!(picked.is_err());
    }

    #[test]
    fn a_reopened_folder_keeps_its_place_when_its_bookmark_still_holds() {
        let reply = r#"{"path":"/Comics","refreshed":null}"#;

        let reopened: ReopenedFolder = serde_json::from_str(reply).unwrap();

        assert_eq!(
            ResolvedBookmark::from(reopened),
            ResolvedBookmark {
                path: PathBuf::from("/Comics"),
                refreshed: None
            }
        );
    }

    #[test]
    fn a_moved_folder_brings_its_new_bookmark() {
        let reply = r#"{"path":"/Manga","refreshed":[98,111,111,107]}"#;

        let reopened: ReopenedFolder = serde_json::from_str(reply).unwrap();

        assert_eq!(
            ResolvedBookmark::from(reopened),
            ResolvedBookmark {
                path: PathBuf::from("/Manga"),
                refreshed: Some(AppleBookmark::new(BOOKMARK.to_vec())),
            }
        );
    }
}
