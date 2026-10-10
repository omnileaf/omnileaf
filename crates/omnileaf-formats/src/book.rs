use std::{path::Path, sync::Arc};

use omnileaf_sync_proto::Fingerprint;

use crate::{
    ComicInfo, FormatError, Limits, LocalStorage, PageKind, Storage, container::Container,
    folder::FolderBook, natural_cmp, parse_comic_info, zip_book::ZipBook,
};

const FIRST_PAGE: usize = 0;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Page {
    pub name: String,
    pub size: u64,
}

#[derive(Debug)]
pub enum Book {
    Archive(ZipBook),
    Folder(FolderBook),
}

impl Book {
    /// The pages in reading order.
    #[must_use]
    pub fn pages(&self) -> &[Page] {
        match self {
            Self::Archive(book) => book.pages(),
            Self::Folder(book) => book.pages(),
        }
    }

    /// The page the book shows as its cover: the first its [`ComicInfo`] marks as the front cover, or else its first page.
    #[must_use]
    pub fn cover_page(&self, comic_info: Option<&ComicInfo>) -> usize {
        comic_info
            .and_then(|info| {
                info.pages
                    .iter()
                    .find(|page| page.kind == Some(PageKind::FrontCover))
            })
            .and_then(|cover| usize::try_from(cover.image).ok())
            .filter(|&index| index < self.pages().len())
            .unwrap_or(FIRST_PAGE)
    }

    pub fn read_page(&mut self, index: usize) -> Result<Vec<u8>, FormatError> {
        match self {
            Self::Archive(book) => book.read_page(index),
            Self::Folder(book) => book.read_page(index),
        }
    }

    /// The book's ComicInfo.xml, if it has one; a damaged one is an error, never a reason the book can't open.
    pub fn comic_info(&mut self) -> Result<Option<ComicInfo>, FormatError> {
        let (path, xml) = match self {
            Self::Archive(book) => (book.path().to_owned(), book.read_comic_info()?),
            Self::Folder(book) => (book.path().to_owned(), book.read_comic_info()?),
        };
        xml.map(|xml| {
            parse_comic_info(&xml).map_err(|source| FormatError::BadComicInfo { path, source })
        })
        .transpose()
    }

    /// The same fingerprint [`crate::fingerprint_book`] gives, from the book already open.
    pub fn fingerprint(&mut self) -> Result<Fingerprint, FormatError> {
        match self {
            Self::Archive(book) => book.fingerprint(),
            Self::Folder(book) => book.fingerprint(),
        }
    }
}

pub fn open_book(path: &Path) -> Result<Book, FormatError> {
    open_book_with(path, &Limits::default())
}

/// Opens a folder of images, or an archive recognised by its first bytes rather than its name.
pub fn open_book_with(path: &Path, limits: &Limits) -> Result<Book, FormatError> {
    open_book_in(Arc::new(LocalStorage), path, limits)
}

/// Opens a folder of images, or an archive recognised by its first bytes, reading only through `storage`.
pub fn open_book_in(
    storage: Arc<dyn Storage>,
    path: &Path,
    limits: &Limits,
) -> Result<Book, FormatError> {
    match Container::of(&*storage, path)? {
        Container::Folder => FolderBook::open(storage, path, limits).map(Book::Folder),
        Container::Zip(file) => ZipBook::from_file(file, path, limits).map(Book::Archive),
    }
}

pub(crate) fn in_reading_order<T>(mut found: Vec<(Page, T)>) -> (Vec<Page>, Vec<T>) {
    found.sort_by(|(left, _), (right, _)| natural_cmp(&left.name, &right.name));
    found.into_iter().unzip()
}
