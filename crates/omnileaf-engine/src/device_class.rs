//! What the device the app runs on can spare, which its budgets scale to.

pub(crate) const IS_MOBILE: bool = cfg!(any(target_os = "android", target_os = "ios"));
pub(crate) const MEBIBYTE: u32 = 1 << 20;
