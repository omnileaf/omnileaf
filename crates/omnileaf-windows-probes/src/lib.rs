//! The raw Win32 reads behind scheduled folder rescans, which the app maps to its decisions.
#![cfg(windows)]

use std::{mem, ptr};

use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, GetDriveTypeW, OPEN_EXISTING,
};
use windows_sys::Win32::System::IO::DeviceIoControl;
use windows_sys::Win32::System::Ioctl::{
    IOCTL_STORAGE_QUERY_PROPERTY, PropertyStandardQuery, STORAGE_DEVICE_DESCRIPTOR,
    STORAGE_PROPERTY_QUERY, StorageDeviceProperty,
};
use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

const QUERY_ONLY: u32 = 0;
const NO_FLAGS: u32 = 0;
const BUS_TYPE_END: usize =
    mem::offset_of!(STORAGE_DEVICE_DESCRIPTOR, BusType) + mem::size_of::<i32>();

/// Asks `GetDriveTypeW` for the type of the drive whose root is `root`, such as `D:\`.
#[must_use]
#[expect(unsafe_code, reason = "GetDriveTypeW is only reachable through FFI")]
pub fn drive_type(root: &str) -> u32 {
    let root: Vec<u16> = root.encode_utf16().chain([0]).collect();
    // SAFETY: `root` is a NUL-terminated UTF-16 string that outlives the call, which only reads it.
    unsafe { GetDriveTypeW(root.as_ptr()) }
}

/// Asks the storage driver for the `STORAGE_BUS_TYPE` of the drive whose root is `root`, such as `D:\`, or `None` when it won't say.
#[must_use]
#[expect(
    unsafe_code,
    reason = "CreateFileW, DeviceIoControl and CloseHandle are only reachable through FFI"
)]
pub fn bus_type(root: &str) -> Option<u32> {
    let query_size = u32::try_from(mem::size_of::<STORAGE_PROPERTY_QUERY>()).ok()?;
    let descriptor_size = u32::try_from(mem::size_of::<STORAGE_DEVICE_DESCRIPTOR>()).ok()?;
    let volume: Vec<u16> = format!(r"\\.\{}", root.trim_end_matches('\\'))
        .encode_utf16()
        .chain([0])
        .collect();
    // SAFETY: `volume` is a NUL-terminated UTF-16 string that outlives the call, and the null security attributes and template are allowed.
    let handle = unsafe {
        CreateFileW(
            volume.as_ptr(),
            QUERY_ONLY,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            ptr::null(),
            OPEN_EXISTING,
            NO_FLAGS,
            ptr::null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return None;
    }
    let query = STORAGE_PROPERTY_QUERY {
        PropertyId: StorageDeviceProperty,
        QueryType: PropertyStandardQuery,
        AdditionalParameters: [0],
    };
    let mut descriptor = STORAGE_DEVICE_DESCRIPTOR::default();
    let mut returned = 0_u32;
    // SAFETY: `handle` is open, `query` and `descriptor` outlive the call with the sizes given, and the call is synchronous.
    let succeeded = unsafe {
        DeviceIoControl(
            handle,
            IOCTL_STORAGE_QUERY_PROPERTY,
            (&raw const query).cast(),
            query_size,
            (&raw mut descriptor).cast(),
            descriptor_size,
            &raw mut returned,
            ptr::null_mut(),
        )
    } != 0;
    // SAFETY: `handle` is open and closed only here.
    unsafe { CloseHandle(handle) };
    let filled = usize::try_from(returned).is_ok_and(|returned| returned >= BUS_TYPE_END);
    if !(succeeded && filled) {
        return None;
    }
    u32::try_from(descriptor.BusType).ok()
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
    fn reads_the_bus_of_the_system_drive() {
        let system_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_owned());

        let bus_type = bus_type(&format!("{system_drive}\\"));

        assert!(bus_type.is_some());
    }

    #[test]
    fn reads_no_bus_of_a_drive_that_is_not_there() {
        assert_eq!(bus_type(r"?:\"), None);
    }

    #[test]
    fn reads_whether_battery_saver_is_on() {
        let flag = system_status_flag();

        assert!(matches!(flag, Some(0 | 1)), "{flag:?}");
    }
}
