use std::path::Path;

use crate::{
    ComicInfo, FormatError, Limits, container::Container, folder::FolderBook, natural_cmp,
    parse_comic_info, zip_book::ZipBook,
};

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
}

pub fn open_book(path: &Path) -> Result<Book, FormatError> {
    open_book_with(path, &Limits::default())
}

/// Opens a folder of images, or an archive recognised by its first bytes rather than its name.
pub fn open_book_with(path: &Path, limits: &Limits) -> Result<Book, FormatError> {
    match Container::of(path)? {
        Container::Folder => FolderBook::open(path, limits).map(Book::Folder),
        Container::Zip => ZipBook::open(path, limits).map(Book::Archive),
    }
}

pub(crate) fn in_reading_order<T>(mut found: Vec<(Page, T)>) -> (Vec<Page>, Vec<T>) {
    found.sort_by(|(left, _), (right, _)| natural_cmp(&left.name, &right.name));
    found.into_iter().unzip()
}
