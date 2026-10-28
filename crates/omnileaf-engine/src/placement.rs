use std::{borrow::Cow, ffi::OsStr, path::Path};

use omnileaf_db::catalog::Numbering;
use omnileaf_formats::{read_book_name, read_series_name, read_volume_folder_name};

use crate::{
    book_numbering::{Shelf, number_book},
    library_layout::is_comic,
};

const SPECIALS_FOLDER: &str = "Specials";

#[derive(Debug)]
pub(crate) struct Placement {
    pub(crate) series: String,
    pub(crate) title: String,
    pub(crate) numbering: Numbering,
}

pub(crate) fn place_book(location: &Path, linked_folder: &str) -> Placement {
    let Some(name) = location.file_name() else {
        return Placement::one_shot(linked_folder);
    };
    let name = book_name(name);
    let mut folders = location.iter().rev().skip(1).map(OsStr::to_string_lossy);
    let Some(folder) = folders.next() else {
        return Placement::one_shot(&name);
    };
    let (series, shelf) = shelve(&folder, folders.next().as_deref());
    let book = read_book_name(&name, Some(&series));
    Placement {
        numbering: number_book(&book, shelf),
        title: book.title,
        series,
    }
}

impl Placement {
    fn one_shot(name: &str) -> Self {
        let book = read_book_name(name, None);
        Self {
            numbering: number_book(&book, Shelf::OneShot),
            series: book.title.clone(),
            title: book.title,
        }
    }
}

fn book_name(name: &OsStr) -> Cow<'_, str> {
    let name = Path::new(name);
    let stem = name.file_stem().filter(|_| is_comic(name.as_os_str()));
    stem.unwrap_or(name.as_os_str()).to_string_lossy()
}

fn shelve(folder: &str, above: Option<&str>) -> (String, Shelf) {
    if let Some(above) = above {
        let series_above = read_series_name(above).title;
        if is_specials_folder(folder) {
            return (series_above, Shelf::Specials);
        }
        if let Some(volume) = read_volume_folder_name(folder, &series_above) {
            return (series_above, Shelf::Volume(volume.first()));
        }
    }
    (read_series_name(folder).title, Shelf::Series)
}

fn is_specials_folder(folder: &str) -> bool {
    folder.trim().eq_ignore_ascii_case(SPECIALS_FOLDER)
}
