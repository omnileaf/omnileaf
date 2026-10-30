#![cfg_attr(
    unix,
    expect(
        unsafe_code,
        reason = "the thread's locale is only reachable through the C library"
    )
)]

#[cfg(unix)]
mod unix {
    use std::{ffi::CStr, sync::OnceLock};

    const UTF8_LOCALE_NAMES: &[&CStr] = &[c"C.UTF-8", c"en_US.UTF-8", c"UTF-8"];

    struct SharedLocale(libc::locale_t);

    // SAFETY: the locale is created once, never changed or freed, and POSIX allows any thread to use it.
    unsafe impl Send for SharedLocale {}
    // SAFETY: the locale is created once, never changed or freed, and POSIX allows any thread to use it.
    unsafe impl Sync for SharedLocale {}

    fn utf8_locale() -> Option<libc::locale_t> {
        static UTF8_LOCALE: OnceLock<Option<SharedLocale>> = OnceLock::new();
        UTF8_LOCALE
            .get_or_init(|| {
                UTF8_LOCALE_NAMES.iter().find_map(|name| {
                    // SAFETY: `name` is NUL-terminated, and a null base asks for a new locale.
                    let locale = unsafe {
                        libc::newlocale(libc::LC_CTYPE_MASK, name.as_ptr(), std::ptr::null_mut())
                    };
                    (!locale.is_null()).then_some(SharedLocale(locale))
                })
            })
            .as_ref()
            .map(|locale| locale.0)
    }

    /// libarchive converts names through the thread's locale, which stays plain ASCII until a program picks another.
    pub(crate) struct Utf8Locale {
        previous: Option<libc::locale_t>,
    }

    impl Utf8Locale {
        pub(crate) fn enter() -> Self {
            // SAFETY: the locale is valid for the life of the process.
            let previous = utf8_locale().map(|locale| unsafe { libc::uselocale(locale) });
            Self { previous }
        }
    }

    impl Drop for Utf8Locale {
        fn drop(&mut self) {
            if let Some(previous) = self.previous {
                // SAFETY: `previous` is the locale this thread used before `enter`.
                unsafe { libc::uselocale(previous) };
            }
        }
    }
}

#[cfg(unix)]
pub(crate) use unix::Utf8Locale;

/// Windows builds of libarchive convert names through wide strings, so the locale needs no change.
#[cfg(windows)]
pub(crate) struct Utf8Locale;

#[cfg(windows)]
impl Utf8Locale {
    pub(crate) fn enter() -> Self {
        Self
    }
}
