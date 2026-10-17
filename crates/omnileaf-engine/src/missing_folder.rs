use std::{
    ffi::OsStr,
    path::{Component, MAIN_SEPARATOR_STR, Path, PathBuf},
};

use omnileaf_db::catalog::{LibraryRoot, RootLocator};
use serde::Serialize;
use specta::Type;
use tokio::task::spawn_blocking;

use crate::{
    LibraryFolder, NetworkShare, ShareAddress, ShareLookup, ShareSignIn, UnreachableShare,
    network_share::{share_of_tree, unreachable_share_of},
};

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

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FolderProblem {
    Missing,
    DriveDisconnected,
    LostAccess,
    NeedsSignIn { share: NetworkShare },
    NeedsMounting { share: NetworkShare },
    ShareUnreachable { share: NetworkShare },
}

impl From<UnreachableShare> for FolderProblem {
    fn from(unreachable: UnreachableShare) -> Self {
        let share = unreachable.share;
        match unreachable.sign_in {
            ShareSignIn::System(_) => Self::NeedsSignIn { share },
            ShareSignIn::MountedBySystem => Self::NeedsMounting { share },
        }
    }
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

pub(crate) async fn problem_of(
    locator: &RootLocator,
    remembered: Option<ShareAddress>,
    shares: &impl ShareLookup,
) -> FolderProblem {
    match locator {
        RootLocator::AndroidTree(tree) => share_of_tree(tree)
            .map_or(FolderProblem::LostAccess, |share| {
                FolderProblem::ShareUnreachable { share }
            }),
        RootLocator::Path(path) | RootLocator::AppleBookmark { path, .. } => {
            if let Some(unreachable) = unreachable_share_of(path, remembered, shares).await {
                return FolderProblem::from(unreachable);
            }
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

    use omnileaf_db::catalog::{AndroidTree, TreeUri};

    use super::*;

    struct NoShares;

    impl ShareLookup for NoShares {
        fn unreachable_share(
            &self,
            _folder: &Path,
        ) -> impl Future<Output = Option<UnreachableShare>> + Send {
            std::future::ready(None)
        }
    }

    struct UnreachableAt(ShareSignIn);

    impl ShareLookup for UnreachableAt {
        fn unreachable_share(
            &self,
            _folder: &Path,
        ) -> impl Future<Output = Option<UnreachableShare>> + Send {
            std::future::ready(Some(UnreachableShare {
                share: nas_manga(),
                sign_in: self.0.clone(),
            }))
        }
    }

    fn nas_manga() -> NetworkShare {
        NetworkShare {
            server: "nas".to_owned(),
            name: "nas/manga".to_owned(),
        }
    }

    fn tree(authority: &str, place: &str) -> RootLocator {
        RootLocator::AndroidTree(
            AndroidTree::new(
                TreeUri::parse(format!("content://{authority}/tree/manga")).unwrap(),
                "manga".to_owned(),
                place.to_owned(),
            )
            .unwrap(),
        )
    }

    fn folder() -> RootLocator {
        RootLocator::Path(PathBuf::from("/home/reader/Manga"))
    }

    #[tokio::test]
    async fn asks_to_sign_in_to_an_unreachable_share_the_system_signs_in_to() {
        let address = ShareAddress::new("smb://nas.test/manga".to_owned());

        let problem = problem_of(
            &folder(),
            None,
            &UnreachableAt(ShareSignIn::System(address)),
        )
        .await;

        assert_eq!(problem, FolderProblem::NeedsSignIn { share: nas_manga() });
    }

    #[tokio::test]
    async fn asks_to_mount_again_an_unreachable_share_the_system_mounts() {
        let problem = problem_of(
            &folder(),
            None,
            &UnreachableAt(ShareSignIn::MountedBySystem),
        )
        .await;

        assert_eq!(problem, FolderProblem::NeedsMounting { share: nas_manga() });
    }

    #[tokio::test]
    async fn calls_a_folder_on_no_share_and_no_drive_missing() {
        let problem = problem_of(&folder(), None, &NoShares).await;

        assert_eq!(problem, FolderProblem::Missing);
    }

    #[tokio::test]
    async fn names_the_share_an_android_folder_from_another_provider_is_on() {
        let problem = problem_of(&tree("documents.test", "nas"), None, &NoShares).await;

        assert_eq!(
            problem,
            FolderProblem::ShareUnreachable { share: nas_manga() }
        );
    }

    #[tokio::test]
    async fn names_an_android_share_by_its_folder_when_its_provider_has_no_name() {
        let problem = problem_of(&tree("documents.test", ""), None, &NoShares).await;

        assert_eq!(
            problem,
            FolderProblem::ShareUnreachable {
                share: NetworkShare {
                    server: "manga".to_owned(),
                    name: "manga".to_owned(),
                }
            }
        );
    }

    #[tokio::test]
    async fn says_android_took_away_a_folder_on_the_device() {
        let problems = [
            problem_of(
                &tree("com.android.externalstorage.documents", ""),
                None,
                &NoShares,
            )
            .await,
            problem_of(
                &tree("com.android.providers.downloads.documents", ""),
                None,
                &NoShares,
            )
            .await,
        ];

        assert_eq!(
            problems,
            [FolderProblem::LostAccess, FolderProblem::LostAccess]
        );
    }

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
