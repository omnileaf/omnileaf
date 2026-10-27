use std::{borrow::Cow, ffi::OsStr, path::Path};

use omnileaf_formats::{read_book_name, read_series_name};

use crate::library_layout::is_comic;

const SPECIALS_FOLDER: &str = "Specials";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Placement {
    pub(crate) series: String,
    pub(crate) title: String,
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
    let series = series_title(&folder, folders.next().as_deref());
    Placement {
        title: read_book_name(&name, Some(&series)).title,
        series,
    }
}

impl Placement {
    fn one_shot(name: &str) -> Self {
        let title = read_book_name(name, None).title;
        Self {
            series: title.clone(),
            title,
        }
    }
}

fn book_name(name: &OsStr) -> Cow<'_, str> {
    let name = Path::new(name);
    let stem = name.file_stem().filter(|_| is_comic(name.as_os_str()));
    stem.unwrap_or(name.as_os_str()).to_string_lossy()
}

fn series_title(folder: &str, above: Option<&str>) -> String {
    if let Some(above) = above {
        let series_above = read_series_name(above).title;
        if is_specials_folder(folder) || is_volume_folder(folder, &series_above) {
            return series_above;
        }
    }
    read_series_name(folder).title
}

fn is_specials_folder(folder: &str) -> bool {
    folder.trim().eq_ignore_ascii_case(SPECIALS_FOLDER)
}

fn is_volume_folder(folder: &str, series_title: &str) -> bool {
    let title = read_book_name(folder, None).title;
    let marker = after_series_title(&title, series_title);
    read_book_name(marker, None).volume.is_some() && words(marker).all(is_volume_marker_word)
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
