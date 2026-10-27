use std::{ffi::OsStr, path::Path};

use crate::library_layout::is_comic;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Placement {
    pub(crate) series: String,
    pub(crate) title: String,
}

pub(crate) fn place_book(location: &Path, linked_folder: &str) -> Placement {
    let Some(name) = location.file_name() else {
        return Placement::one_shot(linked_folder.to_owned());
    };
    let title = book_name(name);
    match location.parent().and_then(Path::file_name) {
        Some(folder) => Placement {
            series: folder.to_string_lossy().into_owned(),
            title,
        },
        None => Placement::one_shot(title),
    }
}

impl Placement {
    fn one_shot(title: String) -> Self {
        Self {
            series: title.clone(),
            title,
        }
    }
}

fn book_name(name: &OsStr) -> String {
    let name = Path::new(name);
    let stem = name.file_stem().filter(|_| is_comic(name.as_os_str()));
    stem.unwrap_or(name.as_os_str())
        .to_string_lossy()
        .into_owned()
}
