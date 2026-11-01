use std::{
    path::{Path, PathBuf},
    sync::{Mutex, PoisonError},
};

use omnileaf_engine::{
    AndroidTree, FolderId, HomeChoice, HomeFolderSetting, Library, home_location,
    home_tree_location,
};
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager};

use crate::ipc_error::IpcError;

#[derive(Default)]
pub(crate) struct ChosenHome(Mutex<Option<Chosen>>);

#[derive(Clone)]
enum Chosen {
    Folder(PathBuf),
    Tree(AndroidTree),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum HomeMoved {
    Restarting,
    Moved { folder: FolderId },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChosenHomeFolder {
    location: String,
    choice: HomeChoice,
}

impl ChosenHomeFolder {
    pub(crate) fn new(folder: &Path, choice: HomeChoice) -> Self {
        Self {
            location: home_location(folder),
            choice,
        }
    }

    pub(crate) fn at_tree(tree: &AndroidTree, choice: HomeChoice) -> Self {
        Self {
            location: home_tree_location(tree),
            choice,
        }
    }
}

#[derive(Debug, thiserror::Error)]
#[error("act on the folder chosen as the home folder before any folder was chosen")]
struct NothingChosen;

impl ChosenHome {
    pub(crate) fn remember(&self, folder: PathBuf) {
        self.keep(Chosen::Folder(folder));
    }

    pub(crate) fn remember_tree(&self, tree: AndroidTree) {
        self.keep(Chosen::Tree(tree));
    }

    pub(crate) fn folder(&self) -> Option<PathBuf> {
        match self.chosen() {
            Some(Chosen::Folder(folder)) => Some(folder),
            Some(Chosen::Tree(_)) | None => None,
        }
    }

    pub(crate) fn tree(&self) -> Option<AndroidTree> {
        match self.chosen() {
            Some(Chosen::Tree(tree)) => Some(tree),
            Some(Chosen::Folder(_)) | None => None,
        }
    }

    fn keep(&self, chosen: Chosen) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = Some(chosen);
    }

    fn chosen(&self) -> Option<Chosen> {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

pub(crate) async fn choose_tree(
    library: &Library,
    chosen: &ChosenHome,
    tree: AndroidTree,
) -> Result<ChosenHomeFolder, IpcError> {
    let choice = library.choose_home_tree(&tree).await?;
    let folder = ChosenHomeFolder::at_tree(&tree, choice);
    chosen.remember_tree(tree);
    Ok(folder)
}

pub(crate) async fn move_to_chosen_tree(
    library: &Library,
    chosen: &ChosenHome,
) -> Result<HomeMoved, IpcError> {
    let tree = chosen
        .tree()
        .ok_or_else(|| IpcError::internal(&NothingChosen))?;
    let folder = library.move_home_to_tree(tree).await?;
    Ok(HomeMoved::Moved { folder })
}

pub(crate) fn setting(app: &AppHandle) -> Option<HomeFolderSetting> {
    app.try_state::<HomeFolderSetting>()
        .map(|setting| setting.inner().clone())
}

pub(crate) fn chosen(app: &AppHandle) -> Result<(HomeFolderSetting, PathBuf), IpcError> {
    setting(app)
        .zip(app.state::<ChosenHome>().folder())
        .ok_or_else(|| IpcError::internal(&NothingChosen))
}

#[cfg(test)]
mod tests {
    use std::{fs::File, io, sync::Arc};

    use omnileaf_engine::{LibraryError, SystemClock, TreeUri};
    use omnileaf_formats::{Details, Entry, LocalStorage, Storage};
    use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, ScratchFolder, write_sample_library};

    use super::*;

    const CHOSEN: &str = "/media/Sample Library";
    const CHOSEN_AFTER: &str = "/media/Sample Library 2";
    const COMICS_TREE: &str = "content://documents.test/tree/primary%3ADocuments%2FComics";
    const INTERNAL_DOCUMENTS: &str = "Internal storage";

    #[derive(Debug)]
    struct TreeOfFolder {
        scratch: PathBuf,
        is_readable: bool,
    }

    impl TreeOfFolder {
        fn on_device(&self, path: &Path) -> io::Result<PathBuf> {
            if !self.is_readable {
                return Err(io::ErrorKind::PermissionDenied.into());
            }
            Ok(self.scratch.join(path))
        }
    }

    impl Storage for TreeOfFolder {
        fn entries(&self, folder: &Path) -> io::Result<Vec<Entry>> {
            LocalStorage.entries(&self.on_device(folder)?)
        }

        fn details(&self, path: &Path) -> io::Result<Details> {
            LocalStorage.details(&self.on_device(path)?)
        }

        fn open(&self, file: &Path) -> io::Result<File> {
            LocalStorage.open(&self.on_device(file)?)
        }
    }

    fn unreadable_tree() -> LibraryError {
        LibraryError::FolderUnreadable {
            path: PathBuf::from(SAMPLE_LIBRARY_NAME),
            source: io::ErrorKind::PermissionDenied.into(),
        }
    }

    fn tree() -> AndroidTree {
        AndroidTree::new(
            TreeUri::parse(COMICS_TREE.to_owned()).unwrap(),
            SAMPLE_LIBRARY_NAME.to_owned(),
            INTERNAL_DOCUMENTS.to_owned(),
        )
        .unwrap()
    }

    fn books_on_device(name: &str) -> ScratchFolder {
        let books = ScratchFolder::new(name);
        write_sample_library(books.path()).unwrap();
        books
    }

    async fn library_reading(
        app_storage: &ScratchFolder,
        books: &ScratchFolder,
        is_readable: bool,
    ) -> Library {
        let storage = Arc::new(TreeOfFolder {
            scratch: books.path().to_path_buf(),
            is_readable,
        });
        Library::open(app_storage.path().to_path_buf(), SystemClock)
            .await
            .unwrap()
            .reading_trees_with(Arc::new(move |_| Arc::clone(&storage) as Arc<dyn Storage>))
    }

    #[test]
    fn names_the_chosen_folder_beside_what_it_holds() {
        let chosen = ChosenHomeFolder::new(Path::new(CHOSEN), HomeChoice::Empty);

        let crossed = serde_json::to_value(&chosen).unwrap();

        assert_eq!(
            crossed,
            serde_json::json!({ "location": CHOSEN, "choice": { "kind": "empty" } })
        );
    }

    #[test]
    fn holds_no_home_folder_before_one_is_chosen() {
        let chosen = ChosenHome::default();

        let folder = chosen.folder();

        assert_eq!(folder, None);
    }

    #[test]
    fn keeps_the_home_folder_chosen_last() {
        let chosen = ChosenHome::default();
        chosen.remember(PathBuf::from(CHOSEN));

        chosen.remember(PathBuf::from(CHOSEN_AFTER));

        assert_eq!(chosen.folder(), Some(PathBuf::from(CHOSEN_AFTER)));
    }

    #[test]
    fn names_the_chosen_tree_beside_what_it_holds() {
        let chosen = ChosenHomeFolder::at_tree(&tree(), HomeChoice::Empty);

        let crossed = serde_json::to_value(&chosen).unwrap();

        assert_eq!(
            crossed,
            serde_json::json!({
                "location": format!("{INTERNAL_DOCUMENTS} › {SAMPLE_LIBRARY_NAME}"),
                "choice": { "kind": "empty" },
            })
        );
    }

    #[test]
    fn tells_the_interface_the_app_is_restarting_to_finish_the_move() {
        let crossed = serde_json::to_value(HomeMoved::Restarting).unwrap();

        assert_eq!(crossed, serde_json::json!({ "kind": "restarting" }));
    }

    #[test]
    fn keeps_the_tree_chosen_last_apart_from_a_folder() {
        let chosen = ChosenHome::default();
        chosen.remember(PathBuf::from(CHOSEN));

        chosen.remember_tree(tree());

        assert_eq!((chosen.folder(), chosen.tree()), (None, Some(tree())));
    }

    #[tokio::test]
    async fn remembers_the_tree_it_offers_as_the_home_folder() {
        let app_storage = ScratchFolder::new("home-folder-tree-choose");
        let books = books_on_device("home-folder-tree-choose-books");
        let library = library_reading(&app_storage, &books, true).await;
        let chosen = ChosenHome::default();

        let offered = choose_tree(&library, &chosen, tree()).await.unwrap();

        assert_eq!(
            offered,
            ChosenHomeFolder::at_tree(&tree(), HomeChoice::Empty)
        );
        assert_eq!(chosen.tree(), Some(tree()));
    }

    #[tokio::test]
    async fn keeps_the_earlier_choice_when_a_tree_cannot_be_read() {
        let app_storage = ScratchFolder::new("home-folder-tree-unreadable");
        let books = books_on_device("home-folder-tree-unreadable-books");
        let library = library_reading(&app_storage, &books, false).await;
        let chosen = ChosenHome::default();
        chosen.remember(PathBuf::from(CHOSEN));

        let offered = choose_tree(&library, &chosen, tree()).await;

        assert_eq!(offered.unwrap_err(), IpcError::from(unreadable_tree()));
        assert_eq!(chosen.folder(), Some(PathBuf::from(CHOSEN)));
    }

    #[tokio::test]
    async fn moves_the_home_folder_to_the_tree_chosen() {
        let app_storage = ScratchFolder::new("home-folder-tree-move");
        let books = books_on_device("home-folder-tree-move-books");
        let library = library_reading(&app_storage, &books, true).await;
        let chosen = ChosenHome::default();
        choose_tree(&library, &chosen, tree()).await.unwrap();

        let moved = move_to_chosen_tree(&library, &chosen).await.unwrap();

        let HomeMoved::Moved { folder } = moved else {
            panic!("the app restarted instead of moving in place");
        };
        let home = library.folders(None).await.unwrap().folders;
        assert_eq!(home.len(), 1);
        assert_eq!(home[0].id, folder);
    }

    #[tokio::test]
    async fn moves_nowhere_before_a_tree_is_chosen() {
        let app_storage = ScratchFolder::new("home-folder-tree-none");
        let books = books_on_device("home-folder-tree-none-books");
        let library = library_reading(&app_storage, &books, true).await;

        let moved = move_to_chosen_tree(&library, &ChosenHome::default()).await;

        assert_eq!(moved.unwrap_err(), IpcError::internal(&NothingChosen));
    }
}
