use std::{path::Path, sync::Arc};

use omnileaf_sync_proto::Fingerprint;

use crate::{
    ComicInfo, FormatError, Limits, LocalStorage, PageKind, Storage, container::Container,
    error::read_failed, folder::FolderBook, natural_cmp, parse_comic_info,
    salvaged_zip_book::SalvagedZipBook, sevenz_book::SevenZipBook, zip_book::ZipBook,
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
    SevenZip(SevenZipBook),
    Folder(FolderBook),
    Salvaged(SalvagedZipBook),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Damage {
    EndsEarly,
}

impl Book {
    #[must_use]
    pub fn damage(&self) -> Option<Damage> {
        match self {
            Self::Salvaged(_) => Some(Damage::EndsEarly),
            Self::Archive(_) | Self::SevenZip(_) | Self::Folder(_) => None,
        }
    }

    #[must_use]
    pub fn pages(&self) -> &[Page] {
        match self {
            Self::Archive(book) => book.pages(),
            Self::SevenZip(book) => book.pages(),
            Self::Folder(book) => book.pages(),
            Self::Salvaged(book) => book.pages(),
        }
    }

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
            Self::SevenZip(book) => book.read_page(index),
            Self::Folder(book) => book.read_page(index),
            Self::Salvaged(book) => book.read_page(index),
        }
    }

    pub fn read_page_start(&mut self, index: usize, length: u64) -> Result<Vec<u8>, FormatError> {
        match self {
            Self::Archive(book) => book.read_page_start(index, length),
            Self::SevenZip(book) => book.read_page_start(index, length),
            Self::Folder(book) => book.read_page_start(index, length),
            Self::Salvaged(book) => book.read_page_start(index, length),
        }
    }

    pub fn comic_info(&mut self) -> Result<Option<ComicInfo>, FormatError> {
        let (path, xml) = match self {
            Self::Archive(book) => (book.path().to_owned(), book.read_comic_info()?),
            Self::SevenZip(book) => (book.path().to_owned(), book.read_comic_info()?),
            Self::Folder(book) => (book.path().to_owned(), book.read_comic_info()?),
            Self::Salvaged(book) => (book.path().to_owned(), book.read_comic_info()?),
        };
        xml.map(|xml| {
            parse_comic_info(&xml).map_err(|source| FormatError::BadComicInfo { path, source })
        })
        .transpose()
    }

    pub fn fingerprint(&mut self) -> Result<Fingerprint, FormatError> {
        match self {
            Self::Archive(book) => book.fingerprint(),
            Self::SevenZip(book) => book.fingerprint(),
            Self::Folder(book) => book.fingerprint(),
            Self::Salvaged(book) => book.fingerprint(),
        }
    }
}

pub fn open_book(path: &Path) -> Result<Book, FormatError> {
    open_book_with(path, &Limits::default())
}

pub fn open_book_with(path: &Path, limits: &Limits) -> Result<Book, FormatError> {
    open_book_in(Arc::new(LocalStorage), path, limits)
}

pub fn open_book_in(
    storage: Arc<dyn Storage>,
    path: &Path,
    limits: &Limits,
) -> Result<Book, FormatError> {
    match Container::of(&*storage, path)? {
        Container::Folder => FolderBook::open(storage, path, limits).map(Book::Folder),
        Container::Zip(file) => ZipBook::from_file(file, path, limits).map(Book::Archive),
        Container::SevenZip(file) => {
            SevenZipBook::from_file(file, path, limits).map(Book::SevenZip)
        }
    }
}

pub fn salvage_book_in(
    storage: &Arc<dyn Storage>,
    path: &Path,
    limits: &Limits,
) -> Result<Book, FormatError> {
    match open_book_in(Arc::clone(storage), path, limits) {
        Err(damaged @ FormatError::Corrupt { .. }) => {
            let file = storage.open(path).map_err(read_failed(path))?;
            SalvagedZipBook::salvaged_from(file, path, limits)?
                .map(Book::Salvaged)
                .ok_or(damaged)
        }
        opened => opened,
    }
}

pub(crate) fn in_reading_order<T>(mut found: Vec<(Page, T)>) -> (Vec<Page>, Vec<T>) {
    found.sort_by(|(left, _), (right, _)| natural_cmp(&left.name, &right.name));
    found.into_iter().unzip()
}
