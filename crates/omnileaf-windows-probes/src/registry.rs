use windows_sys::Win32::Foundation::NO_ERROR;
use windows_sys::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_BINARY, RegGetValueW};

#[must_use]
#[expect(unsafe_code, reason = "RegGetValueW is only reachable through FFI")]
pub fn user_binary_value<const SIZE: usize>(subkey: &str, name: &str) -> Option<[u8; SIZE]> {
    let subkey: Vec<u16> = subkey.encode_utf16().chain([0]).collect();
    let name: Vec<u16> = name.encode_utf16().chain([0]).collect();
    let mut value = [0_u8; SIZE];
    let mut size = u32::try_from(SIZE).ok()?;
    // SAFETY: `subkey` and `name` are NUL-terminated UTF-16 strings that outlive the call, the null type pointer is allowed, `value` holds `size` writable bytes, and `size` is a live `u32` the call reads and then overwrites with the bytes written.
    let read = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            name.as_ptr(),
            RRF_RT_REG_BINARY,
            std::ptr::null_mut(),
            value.as_mut_ptr().cast(),
            &raw mut size,
        )
    };
    let is_whole_value = usize::try_from(size).is_ok_and(|size| size == SIZE);
    (read == NO_ERROR && is_whole_value).then_some(value)
}

#[cfg(test)]
mod tests {
    use std::fmt::Write;
    use std::process::Command;

    use super::*;

    const PALETTE_SIZE: usize = 32;
    const VALUE: &str = "Value";

    struct TestKey {
        path: String,
    }

    impl TestKey {
        fn holding(test: &str, kind: &str, data: &str) -> Self {
            let key = Self {
                path: format!(r"Software\OmnileafProbeTest-{}-{test}", std::process::id()),
            };
            let added = Command::new("reg")
                .args([
                    "add",
                    &key.full_path(),
                    "/v",
                    VALUE,
                    "/t",
                    kind,
                    "/d",
                    data,
                    "/f",
                ])
                .output()
                .is_ok_and(|output| output.status.success());
            assert!(added, "reg add {}", key.full_path());
            key
        }

        fn full_path(&self) -> String {
            format!(r"HKCU\{}", self.path)
        }
    }

    impl Drop for TestKey {
        fn drop(&mut self) {
            let _deleted = Command::new("reg")
                .args(["delete", &self.full_path(), "/f"])
                .output();
        }
    }

    fn bytes_of(length: usize) -> Vec<u8> {
        (0..length)
            .map(|byte| u8::try_from(byte).unwrap())
            .collect()
    }

    fn hex_of(bytes: &[u8]) -> String {
        bytes.iter().fold(String::new(), |mut hex, byte| {
            write!(hex, "{byte:02x}").unwrap();
            hex
        })
    }

    #[test]
    fn reads_a_binary_value_of_the_size_asked_for() {
        let palette = bytes_of(PALETTE_SIZE);
        let key = TestKey::holding("exact", "REG_BINARY", &hex_of(&palette));

        let read = user_binary_value::<PALETTE_SIZE>(&key.path, VALUE);

        assert_eq!(read.map(Vec::from), Some(palette));
    }

    #[test]
    fn reads_no_binary_value_shorter_than_the_size_asked_for() {
        let key = TestKey::holding("short", "REG_BINARY", &hex_of(&bytes_of(28)));

        assert_eq!(user_binary_value::<PALETTE_SIZE>(&key.path, VALUE), None);
    }

    #[test]
    fn reads_no_binary_value_longer_than_the_size_asked_for() {
        let key = TestKey::holding("long", "REG_BINARY", &hex_of(&bytes_of(36)));

        assert_eq!(user_binary_value::<PALETTE_SIZE>(&key.path, VALUE), None);
    }

    #[test]
    fn reads_no_value_that_is_not_there() {
        let key = TestKey::holding("missing", "REG_BINARY", &hex_of(&bytes_of(4)));

        assert_eq!(
            user_binary_value::<PALETTE_SIZE>(&key.path, "OmnileafNoSuchValue"),
            None
        );
    }

    #[test]
    fn reads_no_value_that_is_not_binary() {
        let key = TestKey::holding("text", "REG_SZ", &"a".repeat(PALETTE_SIZE - 1));

        assert_eq!(user_binary_value::<PALETTE_SIZE>(&key.path, VALUE), None);
    }
}
