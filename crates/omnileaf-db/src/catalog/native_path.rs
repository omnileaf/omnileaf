//! A path as the platform spells it, so a folder whose name isn't valid Unicode is stored exactly.

use std::path::{Path, PathBuf};

#[cfg(unix)]
pub(crate) fn to_bytes(path: &Path) -> Vec<u8> {
    use std::os::unix::ffi::OsStrExt;

    path.as_os_str().as_bytes().to_vec()
}

#[cfg(unix)]
#[expect(
    clippy::unnecessary_wraps,
    reason = "Windows paths are UTF-16, where an odd number of stored bytes can't be one"
)]
pub(crate) fn from_bytes(bytes: Vec<u8>) -> Option<PathBuf> {
    use std::{ffi::OsString, os::unix::ffi::OsStringExt};

    Some(OsString::from_vec(bytes).into())
}

#[cfg(windows)]
pub(crate) fn to_bytes(path: &Path) -> Vec<u8> {
    use std::os::windows::ffi::OsStrExt;

    path.as_os_str()
        .encode_wide()
        .flat_map(u16::to_le_bytes)
        .collect()
}

#[cfg(windows)]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Unix takes the stored bytes over without copying, so both platforms share one signature"
)]
pub(crate) fn from_bytes(bytes: Vec<u8>) -> Option<PathBuf> {
    use std::{ffi::OsString, os::windows::ffi::OsStringExt};

    let (units, rest) = bytes.as_chunks::<2>();
    let wide: Vec<u16> = units.iter().map(|unit| u16::from_le_bytes(*unit)).collect();
    rest.is_empty().then(|| OsString::from_wide(&wide).into())
}

#[cfg(test)]
mod tests {
    use proptest::prelude::*;

    use super::*;

    proptest! {
        #[test]
        fn stores_a_path_as_exactly_the_bytes_it_was_read_from(stored in any::<Vec<u8>>()) {
            let path = from_bytes(stored.clone());

            let stored_again = path.as_deref().map(to_bytes);

            prop_assert!(stored_again.is_none_or(|bytes| bytes == stored));
        }
    }
}
