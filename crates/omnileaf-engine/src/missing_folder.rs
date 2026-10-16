use std::{
    ffi::OsStr,
    path::{Component, MAIN_SEPARATOR_STR, Path, PathBuf},
};

use omnileaf_db::catalog::{LibraryRoot, RootLocator};
use serde::Serialize;
use specta::Type;
use tokio::task::spawn_blocking;

use crate::LibraryFolder;

/// Where removable drives are mounted, with how many names under it lead to one drive.
const DRIVE_MOUNTS: [(&[&str], usize); 4] = [
    (&["Volumes"], 1),
    (&["media"], 2),
    (&["run", "media"], 2),
    (&["mnt"], 1),
];

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MissingFolder {
    pub folder: LibraryFolder,
    pub problem: FolderProblem,
    pub hidden_series: u32,
    pub is_shown_anyway: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum FolderProblem {
    Missing,
    DriveDisconnected,
    LostAccess,
    NeedsSignIn,
}

impl MissingFolder {
    pub(crate) fn of(root: LibraryRoot, problem: FolderProblem, hidden_series: u32) -> Self {
        let is_shown_anyway = root.shows_while_missing;
        Self {
            folder: LibraryFolder::from(root),
            problem,
            hidden_series,
            is_shown_anyway,
        }
    }
}

pub(crate) async fn problem_of(locator: &RootLocator) -> FolderProblem {
    match locator {
        RootLocator::AndroidTree(_) => FolderProblem::LostAccess,
        RootLocator::Path(path) | RootLocator::AppleBookmark { path, .. } => {
            let Some(drive) = drive_of(path) else {
                return FolderProblem::Missing;
            };
            let is_connected = spawn_blocking(move || drive.try_exists().unwrap_or(false))
                .await
                .unwrap_or(false);
            if is_connected {
                FolderProblem::Missing
            } else {
                FolderProblem::DriveDisconnected
            }
        }
    }
}

pub(crate) fn drive_of(folder: &Path) -> Option<PathBuf> {
    let mut components = folder.components();
    match components.next()? {
        Component::Prefix(prefix) => {
            return Some(PathBuf::from(prefix.as_os_str()).join(MAIN_SEPARATOR_STR));
        }
        Component::RootDir => {}
        Component::CurDir | Component::ParentDir | Component::Normal(_) => return None,
    }
    let names: Vec<&OsStr> = components
        .filter_map(|component| match component {
            Component::Normal(name) => Some(name),
            Component::Prefix(_)
            | Component::RootDir
            | Component::CurDir
            | Component::ParentDir => None,
        })
        .collect();
    DRIVE_MOUNTS.iter().find_map(|&(mount, depth)| {
        let is_under_mount = names
            .iter()
            .zip(mount)
            .filter(|(name, place)| **name == OsStr::new(place))
            .count()
            == mount.len();
        let drive = names.get(..mount.len() + depth)?;
        is_under_mount.then(|| {
            drive
                .iter()
                .fold(PathBuf::from(MAIN_SEPARATOR_STR), |path, name| {
                    path.join(name)
                })
        })
    })
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::*;

    fn drive(path: &str) -> Option<PathBuf> {
        drive_of(Path::new(path))
    }

    #[test]
    fn finds_the_drive_a_folder_on_a_mounted_drive_sits_on() {
        assert_eq!(
            [
                drive("/Volumes/Archive/Comics"),
                drive("/media/reader/Archive/Comics"),
                drive("/run/media/reader/Archive/Comics"),
                drive("/mnt/archive/Comics"),
            ],
            [
                Some(PathBuf::from("/Volumes/Archive")),
                Some(PathBuf::from("/media/reader/Archive")),
                Some(PathBuf::from("/run/media/reader/Archive")),
                Some(PathBuf::from("/mnt/archive")),
            ]
        );
    }

    #[test]
    fn finds_no_drive_for_a_folder_on_the_main_disk() {
        assert_eq!(
            [
                drive("/home/reader/Comics"),
                drive("/Volumes"),
                drive("/media/reader")
            ],
            [None, None, None]
        );
    }
}
