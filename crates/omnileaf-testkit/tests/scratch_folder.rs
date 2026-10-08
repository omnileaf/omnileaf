use std::fs;

use omnileaf_testkit::ScratchFolder;

#[test]
fn gives_each_call_an_empty_folder_of_its_own() {
    let first = ScratchFolder::new("same-name");
    let second = ScratchFolder::new("same-name");

    let paths = [first.path(), second.path()];

    assert_ne!(paths[0], paths[1]);
    assert!(paths.iter().all(|path| path.is_dir()));
    assert!(
        paths
            .iter()
            .all(|path| fs::read_dir(path).unwrap().next().is_none())
    );
}

#[test]
fn names_the_folder_exactly_as_asked() {
    let folder = ScratchFolder::new("Removed Comics");

    let name = folder.path().file_name();

    assert_eq!(name, Some("Removed Comics".as_ref()));
}

#[test]
fn removes_the_folder_and_what_it_holds_when_dropped() {
    let folder = ScratchFolder::new("dropped");
    folder.write("inside/a.txt", b"a");
    let holder = folder.path().parent().unwrap().to_path_buf();

    drop(folder);

    assert!(!holder.exists());
}

#[test]
fn writes_a_file_making_the_folders_on_its_way() {
    let folder = ScratchFolder::new("nested");

    let written = folder.write("series/volume/page.png", b"bytes");

    assert_eq!(written, folder.path().join("series/volume/page.png"));
    assert_eq!(fs::read(written).unwrap(), b"bytes");
}
