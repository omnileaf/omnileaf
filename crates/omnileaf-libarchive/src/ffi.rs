#![expect(
    unsafe_code,
    reason = "libarchive is a C library, reachable only through FFI"
)]

use std::ffi::{c_char, c_int, c_void};

pub(crate) const ARCHIVE_OK: c_int = 0;
pub(crate) const ARCHIVE_EOF: c_int = 1;

pub(crate) const AE_IFMT: EntryMode = 0o170_000;
pub(crate) const AE_IFREG: EntryMode = 0o100_000;
pub(crate) const AE_IFDIR: EntryMode = 0o040_000;

#[cfg(unix)]
pub(crate) type EntryMode = libc::mode_t;
/// libarchive's `__LA_MODE_T` is `unsigned short` on Windows.
#[cfg(windows)]
pub(crate) type EntryMode = u16;

#[repr(C)]
pub(crate) struct Archive {
    _opaque: [u8; 0],
}

#[repr(C)]
pub(crate) struct ArchiveEntry {
    _opaque: [u8; 0],
}

pub(crate) type ReadCallback =
    unsafe extern "C" fn(*mut Archive, *mut c_void, *mut *const c_void) -> isize;
pub(crate) type SkipCallback = unsafe extern "C" fn(*mut Archive, *mut c_void, i64) -> i64;

unsafe extern "C" {
    pub(crate) safe fn archive_version_string() -> *const c_char;
    pub(crate) fn archive_read_new() -> *mut Archive;
    pub(crate) fn archive_read_free(archive: *mut Archive) -> c_int;
    pub(crate) fn archive_read_support_format_rar(archive: *mut Archive) -> c_int;
    pub(crate) fn archive_read_support_format_rar5(archive: *mut Archive) -> c_int;
    pub(crate) fn archive_read_open2(
        archive: *mut Archive,
        client_data: *mut c_void,
        open: Option<unsafe extern "C" fn(*mut Archive, *mut c_void) -> c_int>,
        read: Option<ReadCallback>,
        skip: Option<SkipCallback>,
        close: Option<unsafe extern "C" fn(*mut Archive, *mut c_void) -> c_int>,
    ) -> c_int;
    pub(crate) fn archive_read_next_header(
        archive: *mut Archive,
        entry: *mut *mut ArchiveEntry,
    ) -> c_int;
    pub(crate) fn archive_read_data(
        archive: *mut Archive,
        buffer: *mut c_void,
        length: usize,
    ) -> isize;
    pub(crate) fn archive_read_data_skip(archive: *mut Archive) -> c_int;
    pub(crate) fn archive_error_string(archive: *mut Archive) -> *const c_char;
    pub(crate) fn archive_entry_pathname(entry: *mut ArchiveEntry) -> *const c_char;
    pub(crate) fn archive_entry_pathname_utf8(entry: *mut ArchiveEntry) -> *const c_char;
    pub(crate) fn archive_entry_size(entry: *mut ArchiveEntry) -> i64;
    pub(crate) fn archive_entry_size_is_set(entry: *mut ArchiveEntry) -> c_int;
    pub(crate) fn archive_entry_filetype(entry: *mut ArchiveEntry) -> EntryMode;
    pub(crate) fn archive_entry_is_data_encrypted(entry: *mut ArchiveEntry) -> c_int;
    pub(crate) fn archive_entry_is_metadata_encrypted(entry: *mut ArchiveEntry) -> c_int;
}
