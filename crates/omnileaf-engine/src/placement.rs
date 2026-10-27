use std::{borrow::Cow, ffi::OsStr, path::Path};

use omnileaf_formats::{read_book_name, read_series_name};

use crate::library_layout::is_comic;

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
    let Some(folder) = location.parent().and_then(Path::file_name) else {
        return Placement::one_shot(&name);
    };
    let series = read_series_name(&folder.to_string_lossy()).title;
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
