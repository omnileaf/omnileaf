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
};

const READ_BUFFER_BYTES: usize = 64 * 1024;
const SEEK_SET: c_int = 0;
const SEEK_CUR: c_int = 1;
const SEEK_END: c_int = 2;
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

struct Source<R> {
    inner: R,
    buffer: Vec<u8>,
    failure: Option<io::Error>,
}

pub struct Reader<R> {
    archive: NonNull<ffi::Archive>,
    source: Box<Source<R>>,
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
    // SAFETY: `client_data` is the `Source<R>` boxed by `Reader::open`, which outlives the archive.
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
    // SAFETY: `client_data` is the `Source<R>` boxed by `Reader::open`, which outlives the archive.
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

unsafe extern "C" fn seek_callback<R: Seek>(
    _archive: *mut ffi::Archive,
    client_data: *mut c_void,
    offset: i64,
    whence: c_int,
) -> i64 {
    // SAFETY: `client_data` is the `Source<R>` boxed by `Reader::open`, which outlives the archive.
    let source = unsafe { &mut *client_data.cast::<Source<R>>() };
    let target = match whence {
        SEEK_SET => u64::try_from(offset).map(SeekFrom::Start).ok(),
        SEEK_CUR => Some(SeekFrom::Current(offset)),
        SEEK_END => Some(SeekFrom::End(offset)),
        _ => None,
    };
    let Some(target) = target else {
        return i64::from(ffi::ARCHIVE_FATAL);
    };
    match source.inner.seek(target) {
        Ok(position) => i64::try_from(position).unwrap_or(i64::from(ffi::ARCHIVE_FATAL)),
        Err(error) => {
            source.failure = Some(error);
            i64::from(ffi::ARCHIVE_FATAL)
        }
    }
}

impl<R: Read + Seek> Reader<R> {
    pub fn open(source: R, limit_bytes: usize) -> Result<Self, Error> {
        let budget = Arc::new(Budget::new(limit_bytes));
        let mut source = Box::new(Source {
            inner: source,
            buffer: vec![0; READ_BUFFER_BYTES],
            failure: None,
        });
        let scope = Scope::enter(&budget);
        // SAFETY: `archive_read_new` takes no arguments and returns null when it cannot allocate.
        let archive = NonNull::new(unsafe { ffi::archive_read_new() });
        let Some(archive) = archive else {
            return Err(exceeded_or(&budget, Error::Unavailable));
        };
        let client_data = ptr::from_mut(&mut *source).cast::<c_void>();
        // SAFETY: `archive` is live, and `client_data` stays valid for as long as the archive does.
        let status = unsafe {
            ffi::archive_read_support_format_rar(archive.as_ptr())
                .min(ffi::archive_read_support_format_rar5(archive.as_ptr()))
                .min(ffi::archive_read_set_seek_callback(
                    archive.as_ptr(),
                    Some(seek_callback::<R>),
                ))
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
        Ok(reader)
    }

    pub fn next_entry(&mut self) -> Result<Option<Entry>, Error> {
        let _scope = Scope::enter(&self.budget);
        let mut entry = ptr::null_mut();
        // SAFETY: `archive` is live and `entry` is a valid out pointer.
        let status =
            unsafe { ffi::archive_read_next_header(self.archive.as_ptr(), &raw mut entry) };
        match status {
            ffi::ARCHIVE_OK => Ok(Some(entry_of(entry))),
            ffi::ARCHIVE_EOF => Ok(None),
            _ => Err(self.error()),
        }
    }

    pub fn read_data(&mut self, buffer: &mut [u8]) -> Result<usize, Error> {
        let _scope = Scope::enter(&self.budget);
        // SAFETY: `archive` is live and `buffer` is writable for its whole length.
        let read = unsafe {
            ffi::archive_read_data(
                self.archive.as_ptr(),
                buffer.as_mut_ptr().cast(),
                buffer.len(),
            )
        };
        usize::try_from(read).map_err(|_| self.error())
    }

    pub fn skip_data(&mut self) -> Result<(), Error> {
        let _scope = Scope::enter(&self.budget);
        // SAFETY: `archive` is live.
        let status = unsafe { ffi::archive_read_data_skip(self.archive.as_ptr()) };
        if status < ffi::ARCHIVE_OK {
            return Err(self.error());
        }
        Ok(())
    }

    fn error(&mut self) -> Error {
        if self.budget.has_refused_a_request() {
            return Error::BudgetExceeded {
                limit_bytes: self.budget.limit_bytes(),
            };
        }
        if let Some(failure) = self.source.failure.take() {
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

impl<R> Drop for Reader<R> {
    fn drop(&mut self) {
        let _scope = Scope::enter(&self.budget);
        // SAFETY: `archive` is live, and nothing uses it after this call.
        unsafe { ffi::archive_read_free(self.archive.as_ptr()) };
    }
}

// SAFETY: libarchive keeps no thread-local state, and the reader owns its budget and source.
unsafe impl<R: Send> Send for Reader<R> {}

fn exceeded_or(budget: &Budget, other: Error) -> Error {
    if budget.has_refused_a_request() {
        Error::BudgetExceeded {
            limit_bytes: budget.limit_bytes(),
        }
    } else {
        other
    }
}

fn entry_of(entry: *mut ffi::ArchiveEntry) -> Entry {
    // SAFETY: `entry` is the live entry libarchive returned for the current header.
    unsafe {
        let path = ffi::archive_entry_pathname_utf8(entry);
        let path = if path.is_null() {
            ffi::archive_entry_pathname(entry)
        } else {
            path
        };
        let path = if path.is_null() {
            String::new()
        } else {
            CStr::from_ptr(path).to_string_lossy().into_owned()
        };
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
        Entry {
            path,
            size,
            kind,
            is_encrypted,
        }
    }
}
