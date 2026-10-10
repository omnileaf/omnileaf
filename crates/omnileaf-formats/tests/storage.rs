use std::{ffi::OsString, io};

use omnileaf_formats::{Details, Entry, EntryKind, LocalStorage, Storage};
use omnileaf_testkit::ScratchFolder;

#[test]
fn lists_what_a_folder_holds_by_kind() {
    let scratch = ScratchFolder::new("storage-entries");
    scratch.write("Chapter/1.png", b"page");
    scratch.write("Chapter/Extras/2.png", b"page");

    let mut entries = LocalStorage
        .entries(&scratch.path().join("Chapter"))
        .unwrap();
    entries.sort_by(|left, right| left.name.cmp(&right.name));

    let entry = |name: &str, kind| Entry {
        name: OsString::from(name),
        kind,
    };
    assert_eq!(
        entries,
        [
            entry("1.png", EntryKind::File { size: 4 }),
            entry("Extras", EntryKind::Folder),
        ]
    );
}

#[test]
fn tells_a_file_by_its_size_and_a_folder_apart() {
    let scratch = ScratchFolder::new("storage-details");
    let file = scratch.write("Chapter/1.png", b"page");

    let file_details = LocalStorage.details(&file).unwrap();
    let folder_details = LocalStorage
        .details(&scratch.path().join("Chapter"))
        .unwrap();

    assert!(
        matches!(file_details, Details::File { size: 4, .. }),
        "{file_details:?}"
    );
    assert!(
        matches!(folder_details, Details::Folder { .. }),
        "{folder_details:?}"
    );
}

#[test]
fn reports_a_missing_file_as_not_found() {
    let scratch = ScratchFolder::new("storage-missing");

    let error = LocalStorage
        .open(&scratch.path().join("gone.cbz"))
        .unwrap_err();

    assert_eq!(error.kind(), io::ErrorKind::NotFound);
}
