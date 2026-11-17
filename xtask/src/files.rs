use std::{fs, io, path::Path};

pub(crate) fn read_if_present(path: &Path) -> io::Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_file_that_is_there() {
        let scratch = omnileaf_testkit::ScratchFolder::new("files");
        scratch.write("notes.txt", b"Pages turn.\n");

        let text = read_if_present(&scratch.path().join("notes.txt")).unwrap();

        assert_eq!(text.as_deref(), Some("Pages turn.\n"));
    }

    #[test]
    fn reads_nothing_from_a_missing_file() {
        let scratch = omnileaf_testkit::ScratchFolder::new("files");

        let text = read_if_present(&scratch.path().join("notes.txt")).unwrap();

        assert_eq!(text, None);
    }

    #[test]
    fn passes_on_an_error_other_than_a_missing_file() {
        let scratch = omnileaf_testkit::ScratchFolder::new("files");

        let error = read_if_present(scratch.path()).unwrap_err();

        assert_ne!(error.kind(), io::ErrorKind::NotFound);
    }
}
