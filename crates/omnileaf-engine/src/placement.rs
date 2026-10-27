use std::{borrow::Cow, ffi::OsStr, path::Path};

use omnileaf_db::catalog::Numbering;
use omnileaf_formats::{BookName, Number, read_book_name, read_series_name};

use crate::{book_numbering::number_book, library_layout::is_comic};

const SPECIALS_FOLDER: &str = "Specials";

#[derive(Debug)]
pub(crate) struct Placement {
    pub(crate) series: String,
    pub(crate) title: String,
    pub(crate) numbering: Numbering,
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum Shelf {
    Series,
    Volume(Number),
    Specials,
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
        let book = BookName {
            number: None,
            ..read_book_name(name, None)
        };
        Self {
            numbering: number_book(&book, Shelf::Series),
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
        if let Some(volume) = volume_of_folder(folder, &series_above) {
            return (series_above, Shelf::Volume(volume));
        }
    }
    (read_series_name(folder).title, Shelf::Series)
}

fn is_specials_folder(folder: &str) -> bool {
    folder.trim().eq_ignore_ascii_case(SPECIALS_FOLDER)
}

fn volume_of_folder(folder: &str, series_title: &str) -> Option<Number> {
    let title = read_book_name(folder, None).title;
    let marker = after_series_title(&title, series_title);
    let volume = read_book_name(marker, None).volume?;
    words(marker)
        .all(is_volume_marker_word)
        .then_some(volume.first())
}

fn after_series_title<'a>(title: &'a str, series_title: &str) -> &'a str {
    match title.split_at_checked(series_title.len()) {
        Some((head, rest))
            if head.to_lowercase() == series_title.to_lowercase()
                && !rest.starts_with(char::is_alphanumeric) =>
        {
            rest
        }
        _ => title,
    }
}

fn words(text: &str) -> impl Iterator<Item = &str> {
    text.split(|character: char| !character.is_alphabetic())
        .filter(|word| !word.is_empty())
}

fn is_volume_marker_word(word: &str) -> bool {
    read_book_name(&format!("{word}1"), None).volume.is_some()
}
