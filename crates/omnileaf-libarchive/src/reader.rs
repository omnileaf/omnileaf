#![expect(
    unsafe_code,
    reason = "libarchive is a C library, reachable only through FFI"
)]

use std::{
    ffi::{CStr, c_int, c_void},
    io::{self, Read, Seek, SeekFrom},
    ptr::{self, NonNull},
    sync::Arc,
};

use crate::{
    Error,
    allocator::{Budget, Scope},
    ffi,
    locale::Utf8Locale,
};

const READ_BUFFER_BYTES: usize = 64 * 1024;
const ARCHIVE_ERROR: isize = -1;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EntryKind {
    File,
    Directory,
    Other,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    pub path: String,
    pub size: Option<u64>,
    pub kind: EntryKind,
    pub is_encrypted: bool,
}

/// libarchive's RAR readers warn on a header only when a name or link cannot be converted, which loses part of it.
enum HeaderStatus {
    Read,
    End,
    NameOrLinkNotConverted,
    Failed,
}

impl HeaderStatus {
    fn of(status: c_int) -> Self {
        match status {
            ffi::ARCHIVE_OK => Self::Read,
            ffi::ARCHIVE_EOF => Self::End,
            ffi::ARCHIVE_WARN => Self::NameOrLinkNotConverted,
            _ => Self::Failed,
        }
    }
}

struct Source<R> {
    inner: R,
    buffer: Vec<u8>,
    failure: Option<io::Error>,
}

pub struct Reader<R> {
    archive: NonNull<ffi::Archive>,
    source: NonNull<Source<R>>,
    budget: Arc<Budget>,
}

#[must_use]
pub fn version() -> String {
    let version = ffi::archive_version_string();
    // SAFETY: libarchive returns a NUL-terminated string with static lifetime.
    unsafe { CStr::from_ptr(version) }
        .to_string_lossy()
        .into_owned()
}

/// libarchive hands the reader a pointer it keeps until its next call, so the buffer lives in the source.
unsafe extern "C" fn read_callback<R: Read>(
    _archive: *mut ffi::Archive,
    client_data: *mut c_void,
    out: *mut *const c_void,
) -> isize {
    // SAFETY: `client_data` is the `Source<R>` the reader owns, which outlives the archive.
    let source = unsafe { &mut *client_data.cast::<Source<R>>() };
    loop {
        match source.inner.read(&mut source.buffer) {
            Ok(read) if read > source.buffer.len() => {
                source.failure = Some(io::Error::other(format!(
                    "the source reported reading {read} bytes into a {} byte buffer",
                    source.buffer.len()
                )));
                return ARCHIVE_ERROR;
            }
            Ok(read) => {
                // SAFETY: libarchive passes a valid out pointer, and the buffer outlives its next call.
                unsafe { *out = source.buffer.as_ptr().cast() };
                return isize::try_from(read).unwrap_or(ARCHIVE_ERROR);
            }
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(error) => {
                source.failure = Some(error);
                return ARCHIVE_ERROR;
            }
        }
    }
}

/// A skip that returns 0 makes libarchive read and discard the bytes instead.
unsafe extern "C" fn skip_callback<R: Seek>(
    _archive: *mut ffi::Archive,
    client_data: *mut c_void,
    request: i64,
) -> i64 {
    // SAFETY: `client_data` is the `Source<R>` the reader owns, which outlives the archive.
    let source = unsafe { &mut *client_data.cast::<Source<R>>() };
    let skipped = source
        .inner
        .stream_position()
        .and_then(|before| Ok((before, source.inner.seek(SeekFrom::Current(request))?)));
    match skipped {
        Ok((before, after)) => i64::try_from(after.saturating_sub(before)).unwrap_or(0),
        Err(_) => 0,
    }
}

impl<R: Read + Seek> Reader<R> {
    pub fn open(source: R, limit_bytes: usize) -> Result<Self, Error> {
        let budget = Arc::new(Budget::new(limit_bytes));
        let source = Box::new(Source {
            inner: source,
            buffer: vec![0; READ_BUFFER_BYTES],
            failure: None,
        });
        let scope = (Scope::enter(&budget), Utf8Locale::enter());
        // SAFETY: `archive_read_new` takes no arguments and returns null when it cannot allocate.
        let archive = NonNull::new(unsafe { ffi::archive_read_new() });
        let Some(archive) = archive else {
            return Err(exceeded_or(&budget, Error::Unavailable));
        };
        let source = NonNull::from(Box::leak(source));
        let client_data = source.as_ptr().cast::<c_void>();
        // SAFETY: `archive` is live, and `client_data` stays valid for as long as the archive does.
        let status = unsafe {
            ffi::archive_read_support_format_rar(archive.as_ptr())
                .min(ffi::archive_read_support_format_rar5(archive.as_ptr()))
                .min(ffi::archive_read_open2(
                    archive.as_ptr(),
                    client_data,
                    None,
                    Some(read_callback::<R>),
                    Some(skip_callback::<R>),
                    None,
                ))
        };
        let mut reader = Self {
            archive,
            source,
            budget,
        };
        drop(scope);
        if status < ffi::ARCHIVE_OK {
            return Err(reader.error());
        }
        reader.refuse_if_exceeded()?;
        Ok(reader)
    }

    pub fn next_entry(&mut self) -> Result<Option<Entry>, Error> {
        self.refuse_if_exceeded()?;
        let _call = self.enter();
        let mut entry = ptr::null_mut();
        // SAFETY: `archive` is live and `entry` is a valid out pointer.
        let status =
            unsafe { ffi::archive_read_next_header(self.archive.as_ptr(), &raw mut entry) };
        let entry = match HeaderStatus::of(status) {
            HeaderStatus::Read => Some(entry_of(entry)?),
            HeaderStatus::End => None,
            HeaderStatus::NameOrLinkNotConverted | HeaderStatus::Failed => {
                return Err(self.error());
            }
        };
        self.refuse_if_exceeded()?;
        Ok(entry)
    }

    pub fn read_data(&mut self, buffer: &mut [u8]) -> Result<usize, Error> {
        self.refuse_if_exceeded()?;
        let _call = self.enter();
        // SAFETY: `archive` is live and `buffer` is writable for its whole length.
        let read = unsafe {
            ffi::archive_read_data(
                self.archive.as_ptr(),
                buffer.as_mut_ptr().cast(),
                buffer.len(),
            )
        };
        let read = usize::try_from(read).map_err(|_| self.error())?;
        self.refuse_if_exceeded()?;
        Ok(read)
    }

    pub fn skip_data(&mut self) -> Result<(), Error> {
        self.refuse_if_exceeded()?;
        let _call = self.enter();
        // SAFETY: `archive` is live.
        let status = unsafe { ffi::archive_read_data_skip(self.archive.as_ptr()) };
        if status < ffi::ARCHIVE_OK {
            return Err(self.error());
        }
        self.refuse_if_exceeded()
    }

    fn refuse_if_exceeded(&self) -> Result<(), Error> {
        if self.budget.is_exceeded() {
            return Err(Error::BudgetExceeded {
                limit_bytes: self.budget.limit_bytes(),
            });
        }
        Ok(())
    }

    fn error(&mut self) -> Error {
        if let Err(exceeded) = self.refuse_if_exceeded() {
            return exceeded;
        }
        // SAFETY: the source lives until `drop`, and libarchive is not inside a callback here.
        let failure = unsafe { (*self.source.as_ptr()).failure.take() };
        if let Some(failure) = failure {
            return Error::Source(failure);
        }
        // SAFETY: `archive` is live, and a non-null message is a NUL-terminated string.
        let message = unsafe {
            let message = ffi::archive_error_string(self.archive.as_ptr());
            if message.is_null() {
                String::from("unknown error")
            } else {
                CStr::from_ptr(message).to_string_lossy().into_owned()
            }
        };
        Error::Archive { message }
    }
}

impl<R> Reader<R> {
    fn enter(&self) -> (Scope, Utf8Locale) {
        (Scope::enter(&self.budget), Utf8Locale::enter())
    }
}

impl<R> Drop for Reader<R> {
    fn drop(&mut self) {
        let _call = self.enter();
        // SAFETY: `archive` is live and unused after this call, and freeing it ends every callback before the source is dropped.
        unsafe {
            ffi::archive_read_free(self.archive.as_ptr());
            drop(Box::from_raw(self.source.as_ptr()));
        }
    }
}

// SAFETY: libarchive keeps no thread-local state, and the reader owns its budget and source.
unsafe impl<R: Send> Send for Reader<R> {}

fn exceeded_or(budget: &Budget, other: Error) -> Error {
    if budget.is_exceeded() {
        Error::BudgetExceeded {
            limit_bytes: budget.limit_bytes(),
        }
    } else {
        other
    }
}

/// libarchive keeps a name's raw bytes and fills any byte it cannot convert with U+FFFD, so the raw bytes decide whether the name is UTF-8.
#[cfg(unix)]
fn path_of(entry: *mut ffi::ArchiveEntry) -> Result<String, Error> {
    // SAFETY: `entry` is the live entry libarchive returned for the current header.
    let raw = unsafe { ffi::archive_entry_pathname(entry) };
    if raw.is_null() {
        return Ok(String::new());
    }
    // SAFETY: a non-null name is a NUL-terminated string that lives as long as the entry.
    let raw = unsafe { CStr::from_ptr(raw) };
    raw.to_str()
        .map(str::to_owned)
        .map_err(|_| Error::UnreadableName {
            lossy: raw.to_string_lossy().into_owned(),
        })
}

/// Windows builds of libarchive keep names as wide strings, which convert to UTF-8 without loss.
#[cfg(windows)]
fn path_of(entry: *mut ffi::ArchiveEntry) -> Result<String, Error> {
    // SAFETY: `entry` is the live entry libarchive returned for the current header.
    let path = unsafe { ffi::archive_entry_pathname_utf8(entry) };
    if path.is_null() {
        return Ok(String::new());
    }
    // SAFETY: a non-null name is a NUL-terminated string that lives as long as the entry.
    let path = unsafe { CStr::from_ptr(path) };
    path.to_str()
        .map(str::to_owned)
        .map_err(|_| Error::UnreadableName {
            lossy: path.to_string_lossy().into_owned(),
        })
}

fn entry_of(entry: *mut ffi::ArchiveEntry) -> Result<Entry, Error> {
    let path = path_of(entry)?;
    // SAFETY: `entry` is the live entry libarchive returned for the current header.
    unsafe {
        let size = (ffi::archive_entry_size_is_set(entry) != 0)
            .then(|| u64::try_from(ffi::archive_entry_size(entry)).ok())
            .flatten();
        let kind = match ffi::archive_entry_filetype(entry) & ffi::AE_IFMT {
            ffi::AE_IFREG => EntryKind::File,
            ffi::AE_IFDIR => EntryKind::Directory,
            _ => EntryKind::Other,
        };
        let is_encrypted = ffi::archive_entry_is_data_encrypted(entry) != 0
            || ffi::archive_entry_is_metadata_encrypted(entry) != 0;
        Ok(Entry {
            path,
            size,
            kind,
            is_encrypted,
        })
    }
}
