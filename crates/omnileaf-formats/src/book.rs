use std::{
    ops::ControlFlow,
    path::{Path, PathBuf},
    sync::Arc,
};

use omnileaf_sync_proto::Fingerprint;

#[cfg(feature = "rar")]
use crate::rar_book::RarBook;
use crate::{
    ComicInfo, Details, FormatError, Limits, LocalStorage, PageKind, Storage, container::Container,
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
pub struct RecognisedBook {
    storage: Arc<dyn Storage>,
    path: PathBuf,
    details: Details,
    container: Container,
}

#[derive(Debug)]
pub enum Book {
    Archive(ZipBook),
    SevenZip(SevenZipBook),
    Folder(FolderBook),
    Salvaged(SalvagedZipBook),
    #[cfg(feature = "rar")]
    Rar(RarBook),
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
            #[cfg(feature = "rar")]
            Self::Rar(_) => None,
        }
    }

    #[must_use]
    pub fn pages(&self) -> &[Page] {
        match self {
            Self::Archive(book) => book.pages(),
            Self::SevenZip(book) => book.pages(),
            Self::Folder(book) => book.pages(),
            Self::Salvaged(book) => book.pages(),
            #[cfg(feature = "rar")]
            Self::Rar(book) => book.pages(),
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
            #[cfg(feature = "rar")]
            Self::Rar(book) => book.read_page(index),
        }
    }

    pub fn read_every_page(
        &mut self,
        mut read: impl FnMut(usize, Vec<u8>) -> ControlFlow<()>,
    ) -> Result<(), FormatError> {
        if let Self::SevenZip(book) = self {
            return book.read_every_page(read);
        }
        #[cfg(feature = "rar")]
        if let Self::Rar(book) = self {
            return book.read_every_page(read);
        }
        for index in 0..self.pages().len() {
            if read(index, self.read_page(index)?).is_break() {
                break;
            }
        }
        Ok(())
    }

    pub fn read_page_start(&mut self, index: usize, length: u64) -> Result<Vec<u8>, FormatError> {
        match self {
            Self::Archive(book) => book.read_page_start(index, length),
            Self::SevenZip(book) => book.read_page_start(index, length),
            Self::Folder(book) => book.read_page_start(index, length),
            Self::Salvaged(book) => book.read_page_start(index, length),
            #[cfg(feature = "rar")]
            Self::Rar(book) => book.read_page_start(index, length),
        }
    }

    pub fn comic_info(&mut self) -> Result<Option<ComicInfo>, FormatError> {
        let (path, xml) = match self {
            Self::Archive(book) => (book.path().to_owned(), book.read_comic_info()?),
            Self::SevenZip(book) => (book.path().to_owned(), book.read_comic_info()?),
            Self::Folder(book) => (book.path().to_owned(), book.read_comic_info()?),
            Self::Salvaged(book) => (book.path().to_owned(), book.read_comic_info()?),
            #[cfg(feature = "rar")]
            Self::Rar(book) => (book.path().to_owned(), book.read_comic_info()?),
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
            #[cfg(feature = "rar")]
            Self::Rar(book) => book.fingerprint(),
        }
    }
}

pub fn open_book(path: &Path) -> Result<Book, FormatError> {
    open_book_with(path, &Limits::default())
}

pub fn open_book_with(path: &Path, limits: &Limits) -> Result<Book, FormatError> {
    open_book_in(Arc::new(LocalStorage), path, limits)
}

pub fn recognise_book_in(
    storage: &Arc<dyn Storage>,
    path: &Path,
) -> Result<RecognisedBook, FormatError> {
    RecognisedBook::in_storage(Arc::clone(storage), path)
}

impl RecognisedBook {
    fn in_storage(storage: Arc<dyn Storage>, path: &Path) -> Result<Self, FormatError> {
        let details = storage.details(path).map_err(read_failed(path))?;
        let container = Container::by_magic_bytes(&*storage, path, details)?;
        Ok(Self {
            storage,
            path: path.to_path_buf(),
            details,
            container,
        })
    }

    #[must_use]
    pub fn details(&self) -> Details {
        self.details
    }

    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    #[must_use]
    pub fn is_archive(&self) -> bool {
        match self.container {
            Container::Folder => false,
            Container::Zip(_) | Container::SevenZip(_) => true,
            #[cfg(feature = "rar")]
            Container::Rar(_) => true,
        }
    }

    pub fn open(self, limits: &Limits) -> Result<Book, FormatError> {
        let Self {
            storage,
            path,
            container,
            ..
        } = self;
        match container {
            Container::Folder => FolderBook::open(storage, &path, limits).map(Book::Folder),
            Container::Zip(file) => ZipBook::from_file(file, &path, limits).map(Book::Archive),
            Container::SevenZip(file) => {
                SevenZipBook::from_file(file, &path, limits).map(Book::SevenZip)
            }
            #[cfg(feature = "rar")]
            Container::Rar(file) => RarBook::from_file(file, &path, limits).map(Book::Rar),
        }
    }
}

pub fn open_book_in(
    storage: Arc<dyn Storage>,
    path: &Path,
    limits: &Limits,
) -> Result<Book, FormatError> {
    RecognisedBook::in_storage(storage, path)?.open(limits)
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
