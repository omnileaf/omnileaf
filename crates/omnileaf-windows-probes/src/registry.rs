use std::ptr;

use windows_sys::Win32::Foundation::NO_ERROR;
use windows_sys::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_BINARY, RegGetValueW};

/// Asks `RegGetValueW` for the binary value `name` under `subkey` of the current user's registry, or `None` when it won't say.
#[must_use]
#[expect(unsafe_code, reason = "RegGetValueW is only reachable through FFI")]
pub fn user_binary_value(subkey: &str, name: &str) -> Option<Vec<u8>> {
    let subkey: Vec<u16> = subkey.encode_utf16().chain([0]).collect();
    let name: Vec<u16> = name.encode_utf16().chain([0]).collect();
    let mut size = 0;
    // SAFETY: `subkey` and `name` are NUL-terminated UTF-16 strings that outlive the call, the null type and data pointers ask only for the size, and `size` is a live `u32` the call writes.
    let sized = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            name.as_ptr(),
            RRF_RT_REG_BINARY,
            ptr::null_mut(),
            ptr::null_mut(),
            &raw mut size,
        )
    };
    if sized != NO_ERROR {
        return None;
    }
    let mut value = vec![0_u8; usize::try_from(size).ok()?];
    // SAFETY: the strings are as above, `value` holds `size` writable bytes that outlive the call, and `size` is a live `u32` the call reads and writes.
    let read = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            name.as_ptr(),
            RRF_RT_REG_BINARY,
            ptr::null_mut(),
            value.as_mut_ptr().cast(),
            &raw mut size,
        )
    };
    if read != NO_ERROR {
        return None;
    }
    value.truncate(usize::try_from(size).ok()?);
    Some(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DESKTOP: &str = r"Control Panel\Desktop";

    #[test]
    fn reads_a_binary_value_of_the_current_user() {
        let mask = user_binary_value(DESKTOP, "UserPreferencesMask");

        assert!(
            mask.as_ref().is_some_and(|mask| !mask.is_empty()),
            "{mask:?}"
        );
    }

    #[test]
    fn reads_no_value_that_is_not_there() {
        assert_eq!(user_binary_value(DESKTOP, "OmnileafNoSuchValue"), None);
    }

    #[test]
    fn reads_no_value_that_is_not_binary() {
        assert_eq!(user_binary_value(DESKTOP, "WallPaper"), None);
    }
}
