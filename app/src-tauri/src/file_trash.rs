#![cfg_attr(
    not(test),
    expect(dead_code, reason = "the command that removes books is added next")
)]

use std::path::Path;

use omnileaf_engine::{Disposal, DisposalFailure, FileDisposal};

pub(crate) struct SystemTrash;

impl FileDisposal for SystemTrash {
    async fn dispose(&self, file: &Path) -> Result<Disposal, DisposalFailure> {
        let file = file.to_path_buf();
        tauri::async_runtime::spawn_blocking(move || dispose(&file))
            .await
            .unwrap_or_else(|error| {
                tracing::warn!(%error, "run the removal of a file");
                Err(DisposalFailure::Other)
            })
    }
}

#[cfg(desktop)]
fn dispose(file: &Path) -> Result<Disposal, DisposalFailure> {
    trash::delete(file)
        .map(|()| Disposal::Trashed)
        .map_err(|error| {
            tracing::warn!(%error, file = %file.display(), "move a file to the trash");
            failure_of(&error)
        })
}

/// iOS has no trash for the folders a person picked, so a file there is deleted for good.
#[cfg(target_os = "ios")]
fn dispose(file: &Path) -> Result<Disposal, DisposalFailure> {
    let removed = if file.is_dir() {
        std::fs::remove_dir_all(file)
    } else {
        std::fs::remove_file(file)
    };
    removed
        .map(|()| Disposal::Deleted)
        .map_err(|error| DisposalFailure::from(error.kind()))
}

/// Android removes files through the folder the person picked, never by path.
#[cfg(target_os = "android")]
fn dispose(_file: &Path) -> Result<Disposal, DisposalFailure> {
    Err(DisposalFailure::Unsupported)
}

#[cfg(desktop)]
fn failure_of(error: &trash::Error) -> DisposalFailure {
    match error {
        #[cfg(all(unix, not(target_vendor = "apple"), not(target_os = "android")))]
        trash::Error::FileSystem { source, .. } => DisposalFailure::from(source.kind()),
        #[cfg(windows)]
        trash::Error::Os { code, .. } if is_lock_violation(*code) => DisposalFailure::Locked,
        _ => DisposalFailure::Other,
    }
}

#[cfg(windows)]
const ERROR_SHARING_VIOLATION: u32 = 32;
#[cfg(windows)]
const ERROR_LOCK_VIOLATION: u32 = 33;
#[cfg(windows)]
const HRESULT_FACILITY_MASK: u32 = 0xFFFF_0000;
#[cfg(windows)]
const HRESULT_FACILITY_WIN32: u32 = 0x8007_0000;
#[cfg(windows)]
const HRESULT_CODE_MASK: u32 = 0x0000_FFFF;

/// The Recycle Bin reports the code of a file another program holds open as an `HRESULT` wrapping the Win32 error.
#[cfg(windows)]
fn is_lock_violation(code: i32) -> bool {
    let bits = u32::from_ne_bytes(code.to_ne_bytes());
    let win32 = match bits & HRESULT_FACILITY_MASK {
        HRESULT_FACILITY_WIN32 => bits & HRESULT_CODE_MASK,
        _ => bits,
    };
    matches!(win32, ERROR_SHARING_VIOLATION | ERROR_LOCK_VIOLATION)
}

#[cfg(test)]
#[cfg(target_os = "linux")]
mod tests {
    use std::{env, fs, io, path::PathBuf, process::Command};

    use omnileaf_testkit::ScratchFolder;

    use super::*;

    const SCRATCH_TRASH_HOME: &str = "OMNILEAF_SCRATCH_TRASH_HOME";
    const READ_BY_ONE_TEST: &str = "1 passed";

    #[test]
    fn keeps_the_kind_of_a_file_system_error_the_trash_met() {
        let error = trash::Error::FileSystem {
            path: "/media/Comics/Volume 01.cbz".into(),
            source: io::ErrorKind::PermissionDenied.into(),
        };

        let failure = failure_of(&error);

        assert_eq!(failure, DisposalFailure::PermissionDenied);
    }

    #[test]
    fn reads_a_trash_error_it_cannot_place_as_other_and_never_as_a_deletion() {
        let error = trash::Error::Unknown {
            description: "no mount point found".to_owned(),
        };

        let failure = failure_of(&error);

        assert_eq!(failure, DisposalFailure::Other);
    }

    fn scratch_trash_home() -> Option<PathBuf> {
        env::var_os(SCRATCH_TRASH_HOME).map(PathBuf::from)
    }

    /// The trash crate reads `XDG_DATA_HOME` on each call and setting it would need `unsafe`, so the test reruns itself in a child process whose trash is a scratch folder.
    fn rerun_with_a_scratch_trash(test: &str) {
        let home = ScratchFolder::new("scratch-trash-home");
        let output = Command::new(env::current_exe().unwrap())
            .args(["--exact", test, "--nocapture"])
            .env(SCRATCH_TRASH_HOME, home.path())
            .env("XDG_DATA_HOME", home.path().join("data"))
            .env("HOME", home.path())
            .output()
            .unwrap();
        let report = String::from_utf8_lossy(&output.stdout);
        assert!(output.status.success(), "{report}");
        assert!(report.contains(READ_BY_ONE_TEST), "{report}");
    }

    #[test]
    fn moves_a_file_into_the_trash_and_reports_it_trashed() {
        rerun_with_a_scratch_trash("file_trash::tests::trashes_inside_the_scratch_trash");
    }

    #[test]
    fn trashes_inside_the_scratch_trash() {
        let Some(home) = scratch_trash_home() else {
            return;
        };
        let book = home.join("Volume 01.cbz");
        fs::write(&book, b"book").unwrap();

        let disposed = tauri::async_runtime::block_on(SystemTrash.dispose(&book));

        assert_eq!(disposed, Ok(Disposal::Trashed));
        assert!(!book.exists());
        assert!(home.join("data/Trash/files/Volume 01.cbz").is_file());
    }

    #[test]
    fn leaves_a_file_where_it_was_when_the_trash_cannot_take_it() {
        rerun_with_a_scratch_trash("file_trash::tests::keeps_a_file_when_the_trash_is_read_only");
    }

    #[test]
    fn keeps_a_file_when_the_trash_is_read_only() {
        use std::os::unix::fs::PermissionsExt;
        let Some(home) = scratch_trash_home() else {
            return;
        };
        let data = home.join("data");
        fs::create_dir(&data).unwrap();
        let book = home.join("Volume 01.cbz");
        fs::write(&book, b"book").unwrap();
        fs::set_permissions(&data, fs::Permissions::from_mode(0o555)).unwrap();
        let writable_anyway = fs::write(data.join("probe"), b"").is_ok();
        if writable_anyway {
            fs::set_permissions(&data, fs::Permissions::from_mode(0o755)).unwrap();
            skipped_as_privileged();
            return;
        }

        let disposed = tauri::async_runtime::block_on(SystemTrash.dispose(&book));

        fs::set_permissions(&data, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(disposed.is_err(), "{disposed:?}");
        assert!(book.is_file());
    }

    #[expect(
        clippy::print_stderr,
        reason = "a test run as a privileged user cannot make a folder unwritable, and says it did not run"
    )]
    fn skipped_as_privileged() {
        eprintln!(
            "skipped: the user can write to a folder made read-only, so the trash will not fail"
        );
    }
}

#[cfg(test)]
#[cfg(windows)]
mod windows_tests {
    use std::{fs::OpenOptions, os::windows::fs::OpenOptionsExt};

    use omnileaf_testkit::ScratchFolder;

    use super::*;

    const HRESULT_SHARING_VIOLATION: u32 = 0x8007_0020;
    const HRESULT_LOCK_VIOLATION: u32 = 0x8007_0021;
    const HRESULT_ACCESS_DENIED: u32 = 0x8007_0005;
    const NO_SHARING: u32 = 0;

    fn os_error(code: u32) -> trash::Error {
        trash::Error::Os {
            code: i32::from_ne_bytes(code.to_ne_bytes()),
            description: "windows error".to_owned(),
        }
    }

    #[test]
    fn reads_the_sharing_and_lock_violations_as_locked() {
        let failures = [HRESULT_SHARING_VIOLATION, HRESULT_LOCK_VIOLATION]
            .map(|code| failure_of(&os_error(code)));

        assert_eq!(failures, [DisposalFailure::Locked; 2]);
    }

    #[test]
    fn reads_any_other_windows_error_as_other() {
        let failure = failure_of(&os_error(HRESULT_ACCESS_DENIED));

        assert_eq!(failure, DisposalFailure::Other);
    }

    #[test]
    fn reports_a_file_another_program_holds_open_as_locked_and_keeps_it() {
        let scratch = ScratchFolder::new("trash-locked");
        let book = scratch.write("Volume 01.cbz", b"book");
        let _held = OpenOptions::new()
            .read(true)
            .share_mode(NO_SHARING)
            .open(&book)
            .unwrap();

        let disposed = tauri::async_runtime::block_on(SystemTrash.dispose(&book));

        assert_eq!(disposed, Err(DisposalFailure::Locked));
        assert!(book.is_file());
    }
}
