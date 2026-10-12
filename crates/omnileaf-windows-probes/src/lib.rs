//! The raw Win32 reads behind scheduled folder rescans, which the app maps to its decisions.
#![cfg(windows)]

use windows_sys::Win32::Storage::FileSystem::GetDriveTypeW;
use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

/// Asks `GetDriveTypeW` for the type of the drive whose root is `root`, such as `D:\`.
#[must_use]
#[expect(unsafe_code, reason = "GetDriveTypeW is only reachable through FFI")]
pub fn drive_type(root: &str) -> u32 {
    let root: Vec<u16> = root.encode_utf16().chain([0]).collect();
    // SAFETY: `root` is a NUL-terminated UTF-16 string that outlives the call, which only reads it.
    unsafe { GetDriveTypeW(root.as_ptr()) }
}

/// Reads `SystemStatusFlag` from `GetSystemPowerStatus`, or `None` when Windows can't report it.
#[must_use]
#[expect(
    unsafe_code,
    reason = "GetSystemPowerStatus is only reachable through FFI"
)]
pub fn system_status_flag() -> Option<u8> {
    let mut status = SYSTEM_POWER_STATUS::default();
    // SAFETY: `status` is a valid, writable SYSTEM_POWER_STATUS that outlives the call, which only fills it in.
    let succeeded = unsafe { GetSystemPowerStatus(&raw mut status) } != 0;
    succeeded.then_some(status.SystemStatusFlag)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DRIVE_FIXED: u32 = 3;

    #[test]
    fn reads_the_system_drive_as_a_fixed_drive() {
        let system_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_owned());

        let drive_type = drive_type(&format!("{system_drive}\\"));

        assert_eq!(drive_type, DRIVE_FIXED);
    }

    #[test]
    fn reads_whether_battery_saver_is_on() {
        let flag = system_status_flag();

        assert!(matches!(flag, Some(0 | 1)), "{flag:?}");
    }
}
