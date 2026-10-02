use std::{
    fs::{self, File},
    io::Read,
    path::Path,
};

use crate::{FormatError, Limits, folder::FolderBook, natural_cmp, zip_book::ZipBook};

const ZIP_SIGNATURES: [&[u8; 4]; 2] = [b"PK\x03\x04", b"PK\x05\x06"];

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
}

pub fn open_book(path: &Path) -> Result<Book, FormatError> {
    open_book_with(path, &Limits::default())
}

/// Opens a folder of images, or an archive recognised by its first bytes rather than its name.
pub fn open_book_with(path: &Path, limits: &Limits) -> Result<Book, FormatError> {
    let metadata = fs::metadata(path).map_err(|source| FormatError::Read {
        path: path.to_owned(),
        source,
    })?;
    if metadata.is_dir() {
        return FolderBook::open(path, limits).map(Book::Folder);
    }
    if starts_like_a_zip(path)? {
        return ZipBook::open(path, limits).map(Book::Archive);
    }
    Err(FormatError::Unsupported {
        path: path.to_owned(),
    })
}

fn starts_like_a_zip(path: &Path) -> Result<bool, FormatError> {
    let read_failed = |source| FormatError::Read {
        path: path.to_owned(),
        source,
    };
    let mut signature = [0; 4];
    let file = File::open(path).map_err(read_failed)?;
    let read = file.take(4).read(&mut signature).map_err(read_failed)?;
    Ok(read == signature.len() && ZIP_SIGNATURES.contains(&&signature))
}

pub(crate) fn in_reading_order<T>(mut found: Vec<(Page, T)>) -> (Vec<Page>, Vec<T>) {
    found.sort_by(|(left, _), (right, _)| natural_cmp(&left.name, &right.name));
    found.into_iter().unzip()
}
