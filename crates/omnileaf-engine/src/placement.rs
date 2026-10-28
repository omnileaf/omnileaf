use std::{
    borrow::Cow,
    ffi::OsStr,
    path::{Path, PathBuf},
};

use omnileaf_db::catalog::{Numbering, SeriesNaming, Sourced, ValueSource};
use omnileaf_formats::{
    BookName, SeriesName, read_book_name, read_series_name, read_volume_folder_name,
};

use crate::{
    book_numbering::{FileNumbers, Shelf, number_book},
    library_layout::is_comic,
};

const SPECIALS_FOLDER: &str = "Specials";

#[derive(Debug)]
pub(crate) struct Placement {
    pub(crate) series: PlacedSeries,
    pub(crate) title: String,
    pub(crate) numbering: Numbering,
    pub(crate) language: Option<String>,
}

#[derive(Debug)]
pub(crate) struct PlacedSeries {
    pub(crate) location: PathBuf,
    pub(crate) naming: SeriesNaming,
}

pub(crate) fn place_book(location: &Path, linked_folder: &str, files: FileNumbers) -> Placement {
    let Some(name) = location.file_name() else {
        return Placement::one_shot(linked_folder, location, files);
    };
    let name = book_name(name);
    let Some((book_folder, folder)) = location
        .parent()
        .and_then(|book_folder| Some((book_folder, book_folder.file_name()?)))
    else {
        return Placement::one_shot(&name, location, files);
    };
    let above = book_folder
        .parent()
        .and_then(Path::file_name)
        .map(OsStr::to_string_lossy);
    let (series, shelf) = shelve(&folder.to_string_lossy(), above.as_deref());
    let series_folder = match shelf {
        Shelf::Volume(_) | Shelf::Specials => book_folder.parent().unwrap_or(book_folder),
        Shelf::Series | Shelf::OneShot => book_folder,
    };
    let book = read_book_name(&name, Some(&series.title));
    Placement {
        numbering: number_book(&book, shelf, files),
        language: tagged_language(&book),
        title: book.title,
        series: PlacedSeries::folder(series_folder, series),
    }
}

impl Placement {
    fn one_shot(name: &str, location: &Path, files: FileNumbers) -> Self {
        let book = read_book_name(name, None);
        Self {
            numbering: number_book(&book, Shelf::OneShot, files),
            language: tagged_language(&book),
            series: PlacedSeries {
                location: location.to_path_buf(),
                naming: SeriesNaming {
                    title: Sourced {
                        value: book.title.clone(),
                        source: ValueSource::FileName,
                    },
                    year: None,
                },
            },
            title: book.title,
        }
    }
}

impl PlacedSeries {
    fn folder(location: &Path, name: SeriesName) -> Self {
        Self {
            location: location.to_path_buf(),
            naming: SeriesNaming {
                title: from_folder_name(name.title),
                year: name.year.map(from_folder_name),
            },
        }
    }
}

fn tagged_language(book: &BookName) -> Option<String> {
    book.language.map(|tag| tag.to_string())
}

const fn from_folder_name<T>(value: T) -> Sourced<T> {
    Sourced {
        value,
        source: ValueSource::FolderName,
    }
}

fn book_name(name: &OsStr) -> Cow<'_, str> {
    let name = Path::new(name);
    let stem = name.file_stem().filter(|_| is_comic(name.as_os_str()));
    stem.unwrap_or(name.as_os_str()).to_string_lossy()
}

fn shelve(folder: &str, above: Option<&str>) -> (SeriesName, Shelf) {
    if let Some(above) = above {
        let series_above = read_series_name(above);
        if is_specials_folder(folder) {
            return (series_above, Shelf::Specials);
        }
        if let Some(volume) = read_volume_folder_name(folder, &series_above.title) {
            return (series_above, Shelf::Volume(volume.first()));
        }
    }
    (read_series_name(folder), Shelf::Series)
}

fn is_specials_folder(folder: &str) -> bool {
    folder.trim().eq_ignore_ascii_case(SPECIALS_FOLDER)
}
