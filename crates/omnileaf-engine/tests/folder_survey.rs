#![expect(
    clippy::unwrap_used,
    reason = "the test folders are fixtures, so a failed set-up should stop the test"
)]

use std::{
    env, fs,
    path::{Path, PathBuf},
    process,
};

use omnileaf_engine::{SurveyError, survey_folder};

struct TempFolder(PathBuf);

impl TempFolder {
    fn new(name: &str) -> Self {
        let path = env::temp_dir()
            .join(format!("omnileaf-survey-{}", process::id()))
            .join(name);
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    fn with_files(self, files: &[&str]) -> Self {
        for file in files {
            let path = self.0.join(file);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, b"").unwrap();
        }
        self
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn counts_comic_archives_in_nested_folders() {
    let folder = TempFolder::new("nested").with_files(&[
        "one.cbz",
        "Series/two.CBR",
        "Series/Volume 1/three.cb7",
        "notes.txt",
        "cover.jpg",
    ]);

    let survey = survey_folder(folder.path()).unwrap();

    assert_eq!(survey.comic_files, 3);
}

#[test]
fn skips_hidden_files_and_macos_resource_folders() {
    let folder = TempFolder::new("hidden").with_files(&[
        ".hidden.cbz",
        ".cache/four.cbz",
        "__MACOSX/five.cbz",
    ]);

    let survey = survey_folder(folder.path()).unwrap();

    assert_eq!(survey.comic_files, 0);
}

#[test]
fn names_the_survey_after_the_folder() {
    let folder = TempFolder::new("Sample Library");

    let survey = survey_folder(folder.path()).unwrap();

    assert_eq!(survey.name, "Sample Library");
}

#[test]
fn reports_a_folder_that_cannot_be_read() {
    let folder = TempFolder::new("missing");
    let missing = folder.path().join("not-there");

    let result = survey_folder(&missing);

    assert!(matches!(result, Err(SurveyError::Unreadable { .. })));
}

#[cfg(unix)]
#[test]
fn does_not_follow_symbolic_links() {
    let target = TempFolder::new("link-target").with_files(&["six.cbz"]);
    let folder = TempFolder::new("with-link");
    std::os::unix::fs::symlink(target.path(), folder.path().join("linked")).unwrap();

    let survey = survey_folder(folder.path()).unwrap();

    assert_eq!(survey.comic_files, 0);
}

#[cfg(unix)]
#[test]
fn counts_the_folders_it_cannot_read_and_carries_on() {
    use std::os::unix::fs::PermissionsExt;
    let folder = TempFolder::new("locked").with_files(&["seven.cbz", "Locked/eight.cbz"]);
    let locked = folder.path().join("Locked");
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();

    let survey = survey_folder(folder.path());

    fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
    let survey = survey.unwrap();
    assert_eq!((survey.comic_files, survey.unreadable_folders), (1, 1));
}
