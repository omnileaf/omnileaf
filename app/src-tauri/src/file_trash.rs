use std::path::Path;

#[cfg(windows)]
use std::os::windows::fs::OpenOptionsExt;

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
    ensure_present(file)?;
    #[cfg(windows)]
    ensure_not_held_open(file)?;
    trash_context()
        .delete(file)
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
fn ensure_present(file: &Path) -> Result<(), DisposalFailure> {
    std::fs::symlink_metadata(file)
        .map(drop)
        .map_err(|error| DisposalFailure::from(error.kind()))
}

/// The Shell aborts the move of a file another program holds open without sharing delete, and reports that abort with no error code.
#[cfg(windows)]
fn ensure_not_held_open(file: &Path) -> Result<(), DisposalFailure> {
    let probe = std::fs::OpenOptions::new()
        .access_mode(DELETE_ACCESS)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(file);
    match probe {
        Err(error) if error.raw_os_error().is_some_and(is_lock_violation) => {
            Err(DisposalFailure::Locked)
        }
        Ok(_) | Err(_) => Ok(()),
    }
}

/// The Finder backend the trash crate uses by default needs Automation permission, plays a sound and can offer to delete for good.
#[cfg(target_os = "macos")]
fn trash_context() -> trash::TrashContext {
    use trash::macos::{DeleteMethod, TrashContextExtMacos};

    let mut context = trash::TrashContext::default();
    context.set_delete_method(DeleteMethod::NsFileManager);
    context
}

#[cfg(all(desktop, not(target_os = "macos")))]
fn trash_context() -> trash::TrashContext {
    trash::TrashContext::default()
}

#[cfg(all(unix, not(target_vendor = "apple"), not(target_os = "android")))]
fn failure_of(error: &trash::Error) -> DisposalFailure {
    match error {
        trash::Error::FileSystem { source, .. } => DisposalFailure::from(source.kind()),
        _ => DisposalFailure::Other,
    }
}

#[cfg(windows)]
fn failure_of(error: &trash::Error) -> DisposalFailure {
    match error {
        trash::Error::Os { code, .. } if is_lock_violation(*code) => DisposalFailure::Locked,
        _ => DisposalFailure::Other,
    }
}

#[cfg(target_os = "macos")]
fn failure_of(_error: &trash::Error) -> DisposalFailure {
    DisposalFailure::Other
}

#[cfg(windows)]
const ERROR_SHARING_VIOLATION: u32 = 32;
#[cfg(windows)]
const ERROR_LOCK_VIOLATION: u32 = 33;
#[cfg(windows)]
const COPYENGINE_E_SHARING_VIOLATION_SRC: u32 = 0x8027_0027;
#[cfg(windows)]
const COPYENGINE_E_SHARING_VIOLATION_DEST: u32 = 0x8027_0028;
#[cfg(windows)]
const HRESULT_FACILITY_MASK: u32 = 0xFFFF_0000;
#[cfg(windows)]
const HRESULT_FACILITY_WIN32: u32 = 0x8007_0000;
#[cfg(windows)]
const HRESULT_CODE_MASK: u32 = 0x0000_FFFF;
#[cfg(windows)]
const DELETE_ACCESS: u32 = 0x0001_0000;
#[cfg(windows)]
const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;

/// The Shell reports a file another program holds open as a Win32 error, an `HRESULT` wrapping one, or a copy engine sharing violation.
#[cfg(windows)]
fn is_lock_violation(code: i32) -> bool {
    let bits = u32::from_ne_bytes(code.to_ne_bytes());
    let win32 = match bits & HRESULT_FACILITY_MASK {
        HRESULT_FACILITY_WIN32 => bits & HRESULT_CODE_MASK,
        _ => bits,
    };
    matches!(
        win32,
        ERROR_SHARING_VIOLATION
            | ERROR_LOCK_VIOLATION
            | COPYENGINE_E_SHARING_VIOLATION_SRC
            | COPYENGINE_E_SHARING_VIOLATION_DEST
    )
}

#[cfg(test)]
#[cfg(desktop)]
mod desktop_tests {
    use omnileaf_testkit::ScratchFolder;

    use super::*;

    #[test]
    fn reports_a_file_that_vanished_as_not_found() {
        let scratch = ScratchFolder::new("trash-vanished");
        let gone = scratch.path().join("Volume 01.cbz");

        let disposed = tauri::async_runtime::block_on(SystemTrash.dispose(&gone));

        assert_eq!(disposed, Err(DisposalFailure::NotFound));
    }
}

#[cfg(test)]
#[cfg(target_os = "linux")]
mod tests {
    use std::{env, ffi::OsString, fs, io, path::PathBuf, process::Command};

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
    fn reads_a_trash_error_it_cannot_place_as_other() {
        let error = trash::Error::Unknown {
            description: "no mount point found".to_owned(),
        };

        let failure = failure_of(&error);

        assert_eq!(failure, DisposalFailure::Other);
    }

    const XDG_DATA_HOME: &str = "XDG_DATA_HOME";

    fn scratch_trash_home() -> Option<PathBuf> {
        scratch_trash_home_of(env::var_os(SCRATCH_TRASH_HOME), env::var_os(XDG_DATA_HOME))
    }

    fn scratch_trash_home_of(
        home: Option<OsString>,
        data_home: Option<OsString>,
    ) -> Option<PathBuf> {
        let home = PathBuf::from(home?);
        PathBuf::from(data_home?).starts_with(&home).then_some(home)
    }

    #[test]
    fn trusts_the_scratch_home_only_when_the_trash_lives_inside_it() {
        let home = || Some(OsString::from("/scratch/home"));
        let inside = Some(OsString::from("/scratch/home/data"));
        let stray = Some(OsString::from("/home/person/.local/share"));

        let trusted = scratch_trash_home_of(home(), inside.clone());
        let stray_data = scratch_trash_home_of(home(), stray);
        let unset_data = scratch_trash_home_of(home(), None);
        let unset_home = scratch_trash_home_of(None, inside);

        assert_eq!(trusted, Some(PathBuf::from("/scratch/home")));
        assert_eq!([stray_data, unset_data, unset_home], [None, None, None]);
    }

    /// The trash crate reads `XDG_DATA_HOME` on each call and setting it would need `unsafe`, so the test reruns itself in a child process whose trash is a scratch folder.
    fn rerun_with_a_scratch_trash(test: &str) {
        let home = ScratchFolder::new("scratch-trash-home");
        let output = Command::new(env::current_exe().unwrap())
            .args(["--exact", test, "--nocapture"])
            .env(SCRATCH_TRASH_HOME, home.path())
            .env(XDG_DATA_HOME, home.path().join("data"))
            .env("HOME", home.path())
            .output()
            .unwrap();
        let report = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
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
        let info =
            fs::read_to_string(home.join("data/Trash/info/Volume 01.cbz.trashinfo")).unwrap();
        assert!(info.contains("DeletionDate="), "{info}");
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
        assert_eq!(disposed, Err(DisposalFailure::PermissionDenied));
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
    use std::fs::OpenOptions;

    use omnileaf_testkit::ScratchFolder;

    use super::*;

    const HRESULT_SHARING_VIOLATION: u32 = 0x8007_0020;
    const HRESULT_LOCK_VIOLATION: u32 = 0x8007_0021;
    const COPYENGINE_SHARING_VIOLATION_SRC: u32 = 0x8027_0027;
    const COPYENGINE_SHARING_VIOLATION_DEST: u32 = 0x8027_0028;
    const WIN32_SHARING_VIOLATION: u32 = 32;
    const HRESULT_ACCESS_DENIED: u32 = 0x8007_0005;
    const NO_SHARING: u32 = 0;
    const SHARE_READ_WRITE_DELETE: u32 = 0b111;

    fn os_error(code: u32) -> trash::Error {
        trash::Error::Os {
            code: i32::from_ne_bytes(code.to_ne_bytes()),
            description: "windows error".to_owned(),
        }
    }

    #[test]
    fn reads_every_sharing_and_lock_code_as_locked() {
        let failures = [
            WIN32_SHARING_VIOLATION,
            HRESULT_SHARING_VIOLATION,
            HRESULT_LOCK_VIOLATION,
            COPYENGINE_SHARING_VIOLATION_SRC,
            COPYENGINE_SHARING_VIOLATION_DEST,
        ]
        .map(|code| failure_of(&os_error(code)));

        assert_eq!(failures, [DisposalFailure::Locked; 5]);
    }

    #[test]
    fn reads_any_other_windows_error_as_other() {
        let failure = failure_of(&os_error(HRESULT_ACCESS_DENIED));

        assert_eq!(failure, DisposalFailure::Other);
    }

    #[test]
    fn lets_a_file_nobody_holds_pass_the_held_open_check() {
        let scratch = ScratchFolder::new("trash-free");
        let book = scratch.write("Volume 01.cbz", b"book");

        let checked = ensure_not_held_open(&book);

        assert_eq!(checked, Ok(()));
    }

    #[test]
    fn lets_a_file_held_open_with_sharing_delete_pass_the_held_open_check() {
        let scratch = ScratchFolder::new("trash-shared");
        let book = scratch.write("Volume 01.cbz", b"book");
        let _held = OpenOptions::new()
            .read(true)
            .share_mode(SHARE_READ_WRITE_DELETE)
            .open(&book)
            .unwrap();

        let checked = ensure_not_held_open(&book);

        assert_eq!(checked, Ok(()));
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
