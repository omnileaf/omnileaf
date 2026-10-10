use std::{
    collections::BTreeMap,
    ffi::OsStr,
    fmt,
    fs::{self, File, OpenOptions},
    io::{self, Read, Seek, SeekFrom},
    path::{Component, Path, PathBuf},
    process,
    sync::{
        Mutex, MutexGuard, PoisonError,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, SystemTime},
};

use omnileaf_engine::{AndroidTree, TreeUri};
use omnileaf_formats::{Details, Entry, EntryKind, Limits, Storage};

const FOLDER_LISTINGS_KEPT: usize = 1024;

static COPIES_MADE: AtomicU64 = AtomicU64::new(0);

/// A documents provider's view of the folders and files under the trees it granted.
pub trait Documents: fmt::Debug + Send + Sync {
    /// Lists `folder`, or the tree's own folder when it is `None`.
    fn children(&self, tree: &TreeUri, folder: Option<&DocumentId>) -> io::Result<Vec<Document>>;
    fn open(&self, tree: &TreeUri, document: &DocumentId) -> io::Result<File>;
}

/// The provider's own name for a document, meaningful only to the provider.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentId(String);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Document {
    pub id: DocumentId,
    pub name: String,
    pub is_folder: bool,
    pub size: Option<u64>,
    pub modified_ms: Option<i64>,
}

/// Reads a granted tree as a folder named after it, so the library walks it like any other folder.
#[derive(Debug)]
pub struct DocumentTree<D> {
    documents: D,
    tree: TreeUri,
    root: PathBuf,
    copies: PathBuf,
    copy_limit: u64,
    listings: Mutex<BTreeMap<PathBuf, Vec<Document>>>,
}

impl DocumentId {
    #[must_use]
    pub fn new(id: String) -> Self {
        Self(id)
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Document {
    fn modified(&self) -> Option<SystemTime> {
        let ms = self.modified_ms?;
        let since_epoch = Duration::from_millis(ms.unsigned_abs());
        if ms < 0 {
            SystemTime::UNIX_EPOCH.checked_sub(since_epoch)
        } else {
            SystemTime::UNIX_EPOCH.checked_add(since_epoch)
        }
    }
}

impl<D: Documents> DocumentTree<D> {
    /// Copies a document the provider can only stream into `copies`, unlinking the copy as soon as it is made.
    pub fn new(documents: D, tree: &AndroidTree, copies: PathBuf) -> Self {
        Self {
            documents,
            tree: tree.uri().clone(),
            root: PathBuf::from(tree.name()),
            copies,
            copy_limit: Limits::default().max_total_bytes,
            listings: Mutex::default(),
        }
    }

    fn inside<'a>(&self, path: &'a Path) -> io::Result<&'a Path> {
        path.strip_prefix(&self.root)
            .ok()
            .filter(|inside| {
                inside
                    .components()
                    .all(|part| matches!(part, Component::Normal(_)))
            })
            .ok_or_else(|| io::ErrorKind::NotFound.into())
    }

    fn file(&self, path: &Path) -> io::Result<Document> {
        let (folder, name) =
            split(self.inside(path)?).ok_or(io::Error::from(io::ErrorKind::IsADirectory))?;
        let document = self.find(folder, name)?;
        if document.is_folder {
            return Err(io::ErrorKind::IsADirectory.into());
        }
        Ok(document)
    }

    fn find(&self, folder: &Path, name: &OsStr) -> io::Result<Document> {
        let cached = self
            .listings()
            .get(folder)
            .map(|listing| named(listing, name));
        cached.unwrap_or_else(|| named(&self.list(folder)?, name))
    }

    fn list(&self, folder: &Path) -> io::Result<Vec<Document>> {
        let id = match split(folder) {
            None => None,
            Some((parent, name)) => {
                let document = self.find(parent, name)?;
                if !document.is_folder {
                    return Err(io::ErrorKind::NotADirectory.into());
                }
                Some(document.id)
            }
        };
        let documents = self.documents.children(&self.tree, id.as_ref())?;
        self.remember(folder, documents.clone());
        Ok(documents)
    }

    fn listing(&self, folder: &Path) -> io::Result<Vec<Document>> {
        let cached = self.listings().get(folder).cloned();
        cached.map_or_else(|| self.list(folder), Ok)
    }

    fn remember(&self, folder: &Path, documents: Vec<Document>) {
        let mut listings = self.listings();
        if listings.len() >= FOLDER_LISTINGS_KEPT && !listings.contains_key(folder) {
            listings.clear();
        }
        listings.insert(folder.to_path_buf(), documents);
    }

    fn listings(&self) -> MutexGuard<'_, BTreeMap<PathBuf, Vec<Document>>> {
        self.listings.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Dates a folder the provider leaves undated by its newest document, since a folder of pages changes with them.
    fn folder_details(&self, folder: &Path, listed: Option<SystemTime>) -> io::Result<Details> {
        let modified = match listed {
            Some(modified) => Some(modified),
            None => self
                .listing(folder)?
                .iter()
                .filter_map(Document::modified)
                .max(),
        };
        Ok(Details::Folder { modified })
    }

    fn kind_of(&self, document: &Document, is_named_once: bool) -> EntryKind {
        if !is_named_once || !is_one_name(&document.name) {
            return EntryKind::Unreadable(io::ErrorKind::InvalidData);
        }
        if document.is_folder {
            return EntryKind::Folder;
        }
        match self.size_of(document) {
            Ok(size) => EntryKind::File { size },
            Err(error) => EntryKind::Unreadable(error.kind()),
        }
    }

    fn size_of(&self, document: &Document) -> io::Result<u64> {
        match document.size {
            Some(size) => Ok(size),
            None => Ok(self.open_document(document)?.metadata()?.len()),
        }
    }

    fn open_document(&self, document: &Document) -> io::Result<File> {
        let file = self.documents.open(&self.tree, &document.id)?;
        if file.metadata().is_ok_and(|metadata| metadata.is_file()) {
            Ok(file)
        } else {
            self.copy(file)
        }
    }

    fn copy(&self, streamed: File) -> io::Result<File> {
        let mut copy = self.unnamed_copy()?;
        let copied = io::copy(
            &mut streamed.take(self.copy_limit.saturating_add(1)),
            &mut copy,
        )?;
        if copied > self.copy_limit {
            return Err(io::Error::new(
                io::ErrorKind::FileTooLarge,
                format!("streamed document is over {} bytes", self.copy_limit),
            ));
        }
        copy.seek(SeekFrom::Start(0))?;
        Ok(copy)
    }

    fn unnamed_copy(&self) -> io::Result<File> {
        fs::create_dir_all(&self.copies)?;
        loop {
            let serial = COPIES_MADE.fetch_add(1, Ordering::Relaxed);
            let path = self.copies.join(format!("{}-{serial}", process::id()));
            let created = OpenOptions::new()
                .read(true)
                .write(true)
                .create_new(true)
                .open(&path);
            match created {
                Ok(copy) => {
                    fs::remove_file(&path)?;
                    return Ok(copy);
                }
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error),
            }
        }
    }
}

impl<D: Documents> Storage for DocumentTree<D> {
    fn entries(&self, folder: &Path) -> io::Result<Vec<Entry>> {
        let documents = self.list(self.inside(folder)?)?;
        let mut times_named: BTreeMap<&str, usize> = BTreeMap::new();
        for document in &documents {
            *times_named.entry(&document.name).or_default() += 1;
        }
        Ok(documents
            .iter()
            .map(|document| Entry {
                name: document.name.clone().into(),
                kind: self.kind_of(
                    document,
                    times_named.get(document.name.as_str()) == Some(&1),
                ),
            })
            .collect())
    }

    fn details(&self, path: &Path) -> io::Result<Details> {
        let inside = self.inside(path)?;
        let Some((folder, name)) = split(inside) else {
            return self.folder_details(inside, None);
        };
        let document = self.find(folder, name)?;
        if document.is_folder {
            return self.folder_details(inside, document.modified());
        }
        if let (Some(size), Some(modified)) = (document.size, document.modified()) {
            return Ok(Details::File {
                size,
                modified: Some(modified),
            });
        }
        let metadata = self.open_document(&document)?.metadata()?;
        Ok(Details::File {
            size: metadata.len(),
            modified: metadata.modified().ok(),
        })
    }

    fn open(&self, file: &Path) -> io::Result<File> {
        self.open_document(&self.file(file)?)
    }
}

fn split(path: &Path) -> Option<(&Path, &OsStr)> {
    Some((path.parent()?, path.file_name()?))
}

fn named(listing: &[Document], name: &OsStr) -> io::Result<Document> {
    let mut matching = listing
        .iter()
        .filter(|document| OsStr::new(&document.name) == name);
    match (matching.next(), matching.next()) {
        (Some(document), None) => Ok(document.clone()),
        (None, _) => Err(io::ErrorKind::NotFound.into()),
        (Some(_), Some(_)) => Err(io::ErrorKind::InvalidData.into()),
    }
}

fn is_one_name(name: &str) -> bool {
    let mut parts = Path::new(name).components();
    matches!(
        (parts.next(), parts.next()),
        (Some(Component::Normal(part)), None) if part == name
    )
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        io::{Read, Write},
        sync::{
            Arc,
            atomic::{AtomicBool, AtomicUsize, Ordering},
        },
        thread,
    };

    use omnileaf_testkit::ScratchFolder;

    use super::*;

    const TREE_NAME: &str = "Comics";
    const BOOK: &[u8] = b"book";

    /// Serves a scratch folder as the tree, handing out ids that say nothing about where a document is.
    struct FakeDocuments {
        folder: ScratchFolder,
        paths: Mutex<Vec<PathBuf>>,
        served_names: Mutex<BTreeMap<String, String>>,
        failure: Mutex<Option<io::ErrorKind>>,
        listings: AtomicUsize,
        opens: AtomicUsize,
        is_streaming: AtomicBool,
        hides_stamps: AtomicBool,
    }

    impl FakeDocuments {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                folder: ScratchFolder::new(TREE_NAME),
                paths: Mutex::default(),
                served_names: Mutex::default(),
                failure: Mutex::default(),
                listings: AtomicUsize::new(0),
                opens: AtomicUsize::new(0),
                is_streaming: AtomicBool::new(false),
                hides_stamps: AtomicBool::new(false),
            })
        }

        fn serve_as(&self, name: &str, served: &str) {
            self.served_names
                .lock()
                .unwrap()
                .insert(name.to_owned(), served.to_owned());
        }

        fn fail_with(&self, kind: io::ErrorKind) {
            *self.failure.lock().unwrap() = Some(kind);
        }

        fn id_of(&self, path: PathBuf) -> DocumentId {
            let mut paths = self.paths.lock().unwrap();
            paths.push(path);
            DocumentId::new(format!("doc-{}", paths.len() - 1))
        }

        fn path_of(&self, id: &DocumentId) -> PathBuf {
            let index: usize = id.as_str().trim_start_matches("doc-").parse().unwrap();
            self.paths.lock().unwrap()[index].clone()
        }

        fn failed(&self) -> io::Result<()> {
            self.failure
                .lock()
                .unwrap()
                .map_or(Ok(()), |kind| Err(kind.into()))
        }

        fn document(&self, path: PathBuf) -> Document {
            let metadata = fs::metadata(&path).unwrap();
            let name = path.file_name().unwrap().to_string_lossy().into_owned();
            let served = self.served_names.lock().unwrap().get(&name).cloned();
            let hides_stamps = self.hides_stamps.load(Ordering::SeqCst);
            Document {
                name: served.unwrap_or(name),
                is_folder: metadata.is_dir(),
                size: (!hides_stamps).then_some(metadata.len()),
                modified_ms: (!hides_stamps).then(|| ms_of(metadata.modified().unwrap())),
                id: self.id_of(path),
            }
        }
    }

    impl fmt::Debug for FakeDocuments {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter
                .debug_struct("FakeDocuments")
                .finish_non_exhaustive()
        }
    }

    impl Documents for Arc<FakeDocuments> {
        fn children(
            &self,
            _tree: &TreeUri,
            folder: Option<&DocumentId>,
        ) -> io::Result<Vec<Document>> {
            self.failed()?;
            self.listings.fetch_add(1, Ordering::SeqCst);
            let path =
                folder.map_or_else(|| self.folder.path().to_path_buf(), |id| self.path_of(id));
            let mut found: Vec<PathBuf> = fs::read_dir(path)?
                .map(|entry| entry.map(|entry| entry.path()))
                .collect::<io::Result<_>>()?;
            found.sort();
            Ok(found.into_iter().map(|path| self.document(path)).collect())
        }

        fn open(&self, _tree: &TreeUri, document: &DocumentId) -> io::Result<File> {
            self.failed()?;
            self.opens.fetch_add(1, Ordering::SeqCst);
            let file = File::open(self.path_of(document))?;
            if self.is_streaming.load(Ordering::SeqCst) {
                Ok(streamed(file))
            } else {
                Ok(file)
            }
        }
    }

    fn streamed(mut file: File) -> File {
        let (reader, mut writer) = io::pipe().unwrap();
        thread::spawn(move || {
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes).unwrap();
            let _ = writer.write_all(&bytes);
        });
        file_of(reader)
    }

    #[cfg(unix)]
    fn file_of(reader: io::PipeReader) -> File {
        File::from(std::os::fd::OwnedFd::from(reader))
    }

    #[cfg(windows)]
    fn file_of(reader: io::PipeReader) -> File {
        File::from(std::os::windows::io::OwnedHandle::from(reader))
    }

    fn ms_of(time: SystemTime) -> i64 {
        i64::try_from(
            time.duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_millis(),
        )
        .unwrap()
    }

    struct Fixture {
        documents: Arc<FakeDocuments>,
        copies: ScratchFolder,
        tree: DocumentTree<Arc<FakeDocuments>>,
    }

    impl Fixture {
        fn new() -> Self {
            let documents = FakeDocuments::new();
            let copies = ScratchFolder::new("copies");
            let uri = TreeUri::parse("content://documents.test/tree/primary%3AComics".to_owned());
            let tree = AndroidTree::new(uri.unwrap(), TREE_NAME.to_owned(), String::new());
            let tree = DocumentTree::new(
                Arc::clone(&documents),
                &tree.unwrap(),
                copies.path().to_path_buf(),
            );
            Self {
                documents,
                copies,
                tree,
            }
        }

        fn write(&self, name: &str, bytes: &[u8]) -> PathBuf {
            self.documents.folder.write(name, bytes)
        }

        fn listings(&self) -> usize {
            self.documents.listings.load(Ordering::SeqCst)
        }

        fn opens(&self) -> usize {
            self.documents.opens.load(Ordering::SeqCst)
        }
    }

    fn in_tree(inside: &str) -> PathBuf {
        Path::new(TREE_NAME).join(inside)
    }

    fn entry(name: &str, kind: EntryKind) -> Entry {
        Entry {
            name: name.into(),
            kind,
        }
    }

    fn read_all(mut file: File) -> Vec<u8> {
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).unwrap();
        bytes
    }

    #[test]
    fn lists_the_trees_own_folder_under_its_name() {
        let fixture = Fixture::new();
        fixture.write("a.cbz", BOOK);
        fixture.write("Series/b.cbz", BOOK);

        let entries = fixture.tree.entries(Path::new(TREE_NAME)).unwrap();

        assert_eq!(
            entries,
            [
                entry("Series", EntryKind::Folder),
                entry("a.cbz", EntryKind::File { size: 4 }),
            ]
        );
    }

    #[test]
    fn finds_a_nested_book_by_listing_each_folder_once() {
        let fixture = Fixture::new();
        fixture.write("One/Two/book.cbz", BOOK);
        let book = in_tree("One/Two/book.cbz");

        let first = read_all(fixture.tree.open(&book).unwrap());
        let second = read_all(fixture.tree.open(&book).unwrap());

        assert_eq!((first, second), (BOOK.to_vec(), BOOK.to_vec()));
        assert_eq!(fixture.listings(), 3);
    }

    #[test]
    fn answers_a_books_size_and_date_from_its_folders_listing() {
        let fixture = Fixture::new();
        let file = fixture.write("a.cbz", BOOK);
        let modified_ms = ms_of(fs::metadata(file).unwrap().modified().unwrap());
        fixture.tree.entries(Path::new(TREE_NAME)).unwrap();

        let details = fixture.tree.details(&in_tree("a.cbz")).unwrap();

        let modified = SystemTime::UNIX_EPOCH + Duration::from_millis(modified_ms.unsigned_abs());
        assert_eq!(
            details,
            Details::File {
                size: 4,
                modified: Some(modified),
            }
        );
        assert_eq!(fixture.opens(), 0);
    }

    #[test]
    fn dates_the_trees_own_folder_by_its_newest_document() {
        let fixture = Fixture::new();
        let dates = ["1.png", "2.png"].map(|page| {
            let file = fixture.write(page, BOOK);
            ms_of(fs::metadata(file).unwrap().modified().unwrap())
        });

        let details = fixture.tree.details(Path::new(TREE_NAME)).unwrap();

        let newest = dates.into_iter().max().unwrap();
        let modified = SystemTime::UNIX_EPOCH + Duration::from_millis(newest.unsigned_abs());
        assert_eq!(
            details,
            Details::Folder {
                modified: Some(modified)
            }
        );
    }

    #[test]
    fn opens_a_book_listed_without_a_size_or_date_to_learn_them() {
        let fixture = Fixture::new();
        fixture.write("a.cbz", BOOK);
        fixture.documents.hides_stamps.store(true, Ordering::SeqCst);

        let details = fixture.tree.details(&in_tree("a.cbz")).unwrap();

        assert!(matches!(
            details,
            Details::File {
                size: 4,
                modified: Some(_)
            }
        ));
        assert_eq!(fixture.opens(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn copies_a_document_the_provider_streams_into_a_file_it_can_seek() {
        let fixture = Fixture::new();
        fixture.write("a.cbz", BOOK);
        fixture.documents.is_streaming.store(true, Ordering::SeqCst);

        let mut file = fixture.tree.open(&in_tree("a.cbz")).unwrap();
        file.seek(SeekFrom::Start(1)).unwrap();

        assert_eq!(read_all(file), b"ook");
        assert_eq!(fs::read_dir(fixture.copies.path()).unwrap().count(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn copies_a_streamed_document_past_a_copy_left_behind() {
        let fixture = Fixture::new();
        fixture.write("a.cbz", BOOK);
        fixture.documents.is_streaming.store(true, Ordering::SeqCst);
        let left_behind = format!("{}-{}", process::id(), COPIES_MADE.load(Ordering::SeqCst));
        fixture.copies.write(&left_behind, b"");

        let file = fixture.tree.open(&in_tree("a.cbz")).unwrap();

        assert_eq!(read_all(file), BOOK);
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_streamed_document_larger_than_the_limit() {
        let mut fixture = Fixture::new();
        fixture.write("a.cbz", BOOK);
        fixture.documents.is_streaming.store(true, Ordering::SeqCst);
        fixture.tree.copy_limit = 3;

        let opened = fixture.tree.open(&in_tree("a.cbz"));

        assert_eq!(opened.unwrap_err().kind(), io::ErrorKind::FileTooLarge);
    }

    #[test]
    fn reports_a_second_document_with_the_same_name_as_unreadable() {
        let fixture = Fixture::new();
        fixture.write("a.cbz", BOOK);
        fixture.write("b.cbz", BOOK);
        fixture.documents.serve_as("b.cbz", "a.cbz");

        let entries = fixture.tree.entries(Path::new(TREE_NAME)).unwrap();

        let unreadable = EntryKind::Unreadable(io::ErrorKind::InvalidData);
        assert_eq!(
            entries,
            [entry("a.cbz", unreadable), entry("a.cbz", unreadable)]
        );
    }

    #[test]
    fn reports_a_name_with_a_slash_as_unreadable() {
        let fixture = Fixture::new();
        fixture.write("a.cbz", BOOK);
        fixture.documents.serve_as("a.cbz", "Series/a.cbz");

        let entries = fixture.tree.entries(Path::new(TREE_NAME)).unwrap();

        assert_eq!(
            entries,
            [entry(
                "Series/a.cbz",
                EntryKind::Unreadable(io::ErrorKind::InvalidData)
            )]
        );
    }

    #[test]
    fn passes_a_lost_grant_through_as_permission_denied() {
        let fixture = Fixture::new();
        fixture.documents.fail_with(io::ErrorKind::PermissionDenied);

        let listed = fixture.tree.entries(Path::new(TREE_NAME));

        assert_eq!(listed.unwrap_err().kind(), io::ErrorKind::PermissionDenied);
    }

    #[test]
    fn lists_folders_again_once_it_holds_more_than_it_keeps() {
        let fixture = Fixture::new();
        let folders: Vec<String> = (0..FOLDER_LISTINGS_KEPT)
            .map(|n| format!("{n:04}"))
            .collect();
        for folder in &folders {
            fs::create_dir(fixture.documents.folder.path().join(folder)).unwrap();
        }
        fixture.tree.entries(Path::new(TREE_NAME)).unwrap();
        for folder in &folders {
            fixture.tree.entries(&in_tree(folder)).unwrap();
        }
        let listed = fixture.listings();

        fixture.tree.details(&in_tree(&folders[0])).unwrap();

        assert_eq!(fixture.listings(), listed + 1);
    }
}
