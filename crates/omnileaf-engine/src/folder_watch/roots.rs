use std::{
    collections::{BTreeMap, BTreeSet},
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
    sync::{PoisonError, RwLock, RwLockReadGuard, RwLockWriteGuard},
};

use notify::{
    Event, EventKind,
    event::{AccessKind, AccessMode, CreateKind, MetadataKind, ModifyKind, RemoveKind},
};
use omnileaf_formats::{is_ignored, is_page_image};

use super::AppFiles;
use crate::{FolderId, library_layout::is_comic};

const DATABASE_FILE: &str = "library.sqlite";
const BACKUP_FOLDER: &str = "backups";

#[derive(Debug)]
pub(super) struct Roots {
    app_files: Vec<AppPath>,
    roots: RwLock<BTreeMap<FolderId, Root>>,
}

#[derive(Debug)]
struct Root {
    spellings: Vec<PathBuf>,
    apart: Vec<AppPath>,
}

#[derive(Clone, Debug)]
enum AppPath {
    Folder(PathBuf),
    FileWithSidecars(PathBuf),
}

impl Roots {
    pub(super) fn new(app: &AppFiles) -> Self {
        let mut app_files = vec![
            AppPath::FileWithSidecars(app.library.database.join(DATABASE_FILE)),
            AppPath::Folder(app.library.home.join(BACKUP_FOLDER)),
        ];
        app_files.extend(app.folders.iter().cloned().map(AppPath::Folder));
        Self {
            app_files,
            roots: RwLock::default(),
        }
    }

    /// macOS names a changed file by its folder's canonical path, such as `/private/var` for `/var`, so both spellings are kept.
    pub(super) fn insert(&self, id: FolderId, folder: &Path) {
        let mut spellings = vec![folder.to_path_buf()];
        if let Ok(canonical) = fs::canonicalize(folder)
            && canonical != folder
        {
            spellings.push(canonical);
        }
        let apart = self
            .app_files
            .iter()
            .filter_map(|app_path| app_path.within(folder))
            .collect();
        self.write().insert(id, Root { spellings, apart });
    }

    pub(super) fn remove(&self, id: FolderId) {
        self.write().remove(&id);
    }

    pub(super) fn clear(&self) {
        self.write().clear();
    }

    pub(super) fn concerned(&self, event: &Event) -> BTreeSet<FolderId> {
        if is_a_read(event.kind) {
            return BTreeSet::new();
        }
        self.read()
            .iter()
            .filter(|(_, root)| {
                event
                    .paths
                    .iter()
                    .any(|path| root.may_hold_books(path, event.kind))
            })
            .map(|(id, _)| *id)
            .collect()
    }

    pub(super) fn enclosing_or_every(&self, paths: &[PathBuf]) -> BTreeSet<FolderId> {
        self.read()
            .iter()
            .filter(|(_, root)| {
                paths.is_empty() || paths.iter().any(|path| root.relative(path).is_some())
            })
            .map(|(id, _)| *id)
            .collect()
    }

    fn read(&self) -> RwLockReadGuard<'_, BTreeMap<FolderId, Root>> {
        self.roots.read().unwrap_or_else(PoisonError::into_inner)
    }

    fn write(&self) -> RwLockWriteGuard<'_, BTreeMap<FolderId, Root>> {
        self.roots.write().unwrap_or_else(PoisonError::into_inner)
    }
}

impl Root {
    fn relative<'a>(&self, path: &'a Path) -> Option<&'a Path> {
        self.spellings
            .iter()
            .find_map(|spelling| path.strip_prefix(spelling).ok())
    }

    fn may_hold_books(&self, path: &Path, kind: EventKind) -> bool {
        let Some(relative) = self.relative(path) else {
            return false;
        };
        if is_ignored(&relative.to_string_lossy())
            || self.apart.iter().any(|app_path| app_path.holds(relative))
        {
            return false;
        }
        let name = path
            .file_name()
            .map(OsStr::to_string_lossy)
            .unwrap_or_default();
        is_folder_change(kind)
            || path.file_name().is_some_and(is_comic)
            || is_page_image(&name)
            || is_folder_or_gone(path, kind)
    }
}

impl AppPath {
    fn within(&self, folder: &Path) -> Option<Self> {
        let (path, kind): (&Path, fn(PathBuf) -> Self) = match self {
            Self::Folder(path) => (path, Self::Folder),
            Self::FileWithSidecars(path) => (path, Self::FileWithSidecars),
        };
        let relative = path.strip_prefix(folder).ok()?;
        (!relative.as_os_str().is_empty()).then(|| kind(relative.to_path_buf()))
    }

    fn holds(&self, relative: &Path) -> bool {
        match self {
            Self::Folder(folder) => relative.starts_with(folder),
            Self::FileWithSidecars(file) => {
                relative.parent() == file.parent()
                    && relative
                        .file_name()
                        .zip(file.file_name())
                        .is_some_and(|(name, file)| {
                            name.as_encoded_bytes().starts_with(file.as_encoded_bytes())
                        })
            }
        }
    }
}

/// Linux reports each file a scan opens, which changes nothing a scan would find.
fn is_a_read(kind: EventKind) -> bool {
    matches!(kind, EventKind::Access(access) if access != AccessKind::Close(AccessMode::Write))
        || kind == EventKind::Modify(ModifyKind::Metadata(MetadataKind::AccessTime))
}

fn is_folder_change(kind: EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(CreateKind::Folder) | EventKind::Remove(RemoveKind::Folder)
    )
}

/// The system reports a move or removal once the path is gone, so whether it was a folder of books can no longer be asked.
fn is_folder_or_gone(path: &Path, kind: EventKind) -> bool {
    match fs::metadata(path) {
        Ok(metadata) => metadata.is_dir(),
        Err(_) => matches!(
            kind,
            EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_))
        ),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use notify::{
        EventKind,
        event::{
            AccessKind, AccessMode, CreateKind, DataChange, ModifyKind, RemoveKind, RenameMode,
        },
    };
    use omnileaf_testkit::ScratchFolder;

    use super::*;
    use crate::LibraryFolders;

    const BOOKS: &str = "/books";
    const DATA: &str = "/data/app.omnileaf";

    fn folder(id: &str) -> FolderId {
        id.parse().unwrap()
    }

    fn event(kind: EventKind, path: impl Into<PathBuf>) -> Event {
        Event::new(kind).add_path(path.into())
    }

    fn app_files(data: &Path) -> AppFiles {
        AppFiles {
            library: LibraryFolders::from(data.to_path_buf()),
            folders: vec![data.join("cache")],
        }
    }

    fn roots_of(folders: &[(&str, &Path)]) -> Roots {
        let roots = Roots::new(&app_files(Path::new(DATA)));
        for (id, path) in folders {
            roots.insert(folder(id), path);
        }
        roots
    }

    fn books() -> Roots {
        roots_of(&[("1", Path::new(BOOKS))])
    }

    fn only(id: &str) -> BTreeSet<FolderId> {
        BTreeSet::from([folder(id)])
    }

    #[test]
    fn counts_a_comic_written_or_removed() {
        let written = event(
            EventKind::Modify(ModifyKind::Data(DataChange::Content)),
            "/books/Sample Series/v01.cbz",
        );
        let removed = event(EventKind::Remove(RemoveKind::File), "/books/v02.cbz");

        assert_eq!(books().concerned(&written), only("1"));
        assert_eq!(books().concerned(&removed), only("1"));
    }

    #[test]
    fn counts_a_page_and_a_folder_created_whatever_its_name() {
        let page = event(EventKind::Create(CreateKind::File), "/books/Sample/001.png");
        let dotted_folder = event(EventKind::Create(CreateKind::Folder), "/books/Vol. 2");

        assert_eq!(books().concerned(&page), only("1"));
        assert_eq!(books().concerned(&dotted_folder), only("1"));
    }

    #[test]
    fn counts_a_series_folder_with_a_dot_in_its_name_moved_or_removed_since() {
        let moved_away = event(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            "/books/Sample Series Vol. 2",
        );
        let renamed = event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
            "/books/Sample Series Vol. 2",
        );
        let removed_on_windows = event(
            EventKind::Remove(RemoveKind::Any),
            "/books/Sample Series Vol. 2",
        );

        assert_eq!(books().concerned(&moved_away), only("1"));
        assert_eq!(books().concerned(&renamed), only("1"));
        assert_eq!(books().concerned(&removed_on_windows), only("1"));
    }

    #[test]
    fn counts_a_folder_still_there_with_a_dot_in_its_name() {
        let comics = ScratchFolder::new("roots-dotted-folder");
        let series = comics.path().join("Sample Series Vol. 2");
        fs::create_dir(&series).unwrap();
        let roots = roots_of(&[("1", comics.path())]);

        let created_on_windows = event(EventKind::Create(CreateKind::Any), series);

        assert_eq!(roots.concerned(&created_on_windows), only("1"));
    }

    #[test]
    fn leaves_out_a_file_still_there_that_holds_no_book() {
        let comics = ScratchFolder::new("roots-other-file");
        let cookies = comics.write("cookies", b"");
        let notes = comics.write("Sample Series/notes.txt", b"");
        let roots = roots_of(&[("1", comics.path())]);

        let written = EventKind::Modify(ModifyKind::Data(DataChange::Any));

        assert!(roots.concerned(&event(written, cookies)).is_empty());
        assert!(roots.concerned(&event(written, notes)).is_empty());
    }

    #[test]
    fn leaves_out_a_file_opened_or_read_as_a_scan_does() {
        let opened = event(
            EventKind::Access(AccessKind::Open(AccessMode::Read)),
            "/books/v01.cbz",
        );
        let read = event(
            EventKind::Access(AccessKind::Close(AccessMode::Read)),
            "/books/v01.cbz",
        );
        let written = event(
            EventKind::Access(AccessKind::Close(AccessMode::Write)),
            "/books/v01.cbz",
        );

        assert!(books().concerned(&opened).is_empty());
        assert!(books().concerned(&read).is_empty());
        assert_eq!(books().concerned(&written), only("1"));
    }

    #[test]
    fn leaves_out_anything_inside_a_hidden_folder() {
        let in_git = event(
            EventKind::Remove(RemoveKind::File),
            "/books/.git/objects/ab",
        );
        let hidden_file = event(EventKind::Create(CreateKind::File), "/books/.DS_Store");
        let resource_fork = event(
            EventKind::Create(CreateKind::File),
            "/books/__MACOSX/Sample/v01.cbz",
        );

        assert!(books().concerned(&in_git).is_empty());
        assert!(books().concerned(&hidden_file).is_empty());
        assert!(books().concerned(&resource_fork).is_empty());
    }

    #[test]
    fn counts_a_book_in_a_folder_kept_inside_a_hidden_one() {
        let home = "/home/reader/.local/share/app.omnileaf";
        let roots = roots_of(&[("1", Path::new(home))]);

        let added = event(
            EventKind::Create(CreateKind::File),
            format!("{home}/Sample Series/v01.cbz"),
        );

        assert_eq!(roots.concerned(&added), only("1"));
    }

    #[test]
    fn leaves_out_the_app_files_kept_in_a_library_folder() {
        let roots = roots_of(&[("1", Path::new(DATA))]);
        let removed = EventKind::Remove(RemoveKind::Any);

        let database = event(removed, "/data/app.omnileaf/library.sqlite-wal");
        let backup = event(
            removed,
            "/data/app.omnileaf/backups/schema-v1.sqlite.partial",
        );
        let cover = event(removed, "/data/app.omnileaf/cache/3f2a");
        let series = event(removed, "/data/app.omnileaf/cache Volume 2");

        assert!(roots.concerned(&database).is_empty());
        assert!(roots.concerned(&backup).is_empty());
        assert!(roots.concerned(&cover).is_empty());
        assert_eq!(roots.concerned(&series), only("1"));
    }

    #[test]
    fn names_every_library_folder_holding_the_path() {
        let roots = roots_of(&[("1", Path::new(BOOKS)), ("2", Path::new("/books/Inner"))]);
        let created = EventKind::Create(CreateKind::File);

        let nested = roots.concerned(&event(created, "/books/Inner/Sample/v01.cbz"));
        let outer = roots.concerned(&event(created, "/books/Sample/v01.cbz"));
        let elsewhere = roots.concerned(&event(created, "/elsewhere/v01.cbz"));

        assert_eq!(nested, BTreeSet::from([folder("1"), folder("2")]));
        assert_eq!(outer, only("1"));
        assert!(elsewhere.is_empty());
    }

    #[test]
    fn finds_a_folder_by_the_canonical_path_an_event_names() {
        let comics = ScratchFolder::new("roots-canonical");
        let canonical = fs::canonicalize(comics.path()).unwrap();
        let roots = roots_of(&[("1", comics.path())]);

        let added = event(
            EventKind::Create(CreateKind::File),
            canonical.join("Sample").join("v01.cbz"),
        );

        assert_eq!(roots.concerned(&added), only("1"));
    }

    #[test]
    fn names_the_folders_holding_a_path_or_all_of_them_for_none() {
        let roots = roots_of(&[("1", Path::new(BOOKS)), ("2", Path::new("/comics"))]);

        let named = roots.enclosing_or_every(&[PathBuf::from("/comics/Sample")]);
        let unnamed = roots.enclosing_or_every(&[]);

        assert_eq!(named, only("2"));
        assert_eq!(unnamed, BTreeSet::from([folder("1"), folder("2")]));
    }

    #[test]
    fn forgets_a_folder_removed_from_the_watch() {
        let roots = books();

        roots.remove(folder("1"));

        assert!(
            roots
                .concerned(&event(
                    EventKind::Create(CreateKind::File),
                    "/books/v01.cbz"
                ))
                .is_empty()
        );
    }

    #[test]
    fn forgets_every_folder_once_watching_stops() {
        let roots = roots_of(&[("1", Path::new(BOOKS)), ("2", Path::new("/comics"))]);

        roots.clear();

        assert!(roots.enclosing_or_every(&[]).is_empty());
    }
}
