//! Why the library didn't open at launch, so the interface explains it instead of the app quitting.

use std::error::Error;

use omnileaf_engine::LibraryError;
use serde::Serialize;
use specta::Type;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LibraryProblem {
    WrittenByANewerVersion,
    CouldNotOpen,
}

impl LibraryProblem {
    pub(crate) fn of(error: &(dyn Error + 'static)) -> Self {
        let from_a_newer_version = error
            .downcast_ref::<LibraryError>()
            .is_some_and(LibraryError::was_written_by_a_newer_version);
        if from_a_newer_version {
            Self::WrittenByANewerVersion
        } else {
            Self::CouldNotOpen
        }
    }
}

/// What became of opening the library at launch, managed whether or not it opened.
pub(crate) struct LibraryAtLaunch {
    pub(crate) problem: Option<LibraryProblem>,
}

#[cfg(test)]
mod tests {
    use std::io;

    use super::*;

    #[test]
    fn names_a_library_a_newer_version_wrote() {
        let error = LibraryError::Database(omnileaf_db::Error::NewerSchema {
            found: 14,
            supported: 9,
        });

        assert_eq!(
            LibraryProblem::of(&error),
            LibraryProblem::WrittenByANewerVersion
        );
    }

    #[test]
    fn calls_any_other_failure_one_it_could_not_open() {
        let unreadable_home = io::Error::from(io::ErrorKind::PermissionDenied);
        let missing_folder = LibraryError::FolderNotFound {
            id: "7".parse().unwrap(),
        };

        let problems = [
            LibraryProblem::of(&unreadable_home),
            LibraryProblem::of(&missing_folder),
        ];

        assert_eq!(problems, [LibraryProblem::CouldNotOpen; 2]);
    }
}
