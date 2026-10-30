use std::{env, path::Path};

const VENDORED_FOLDER: &str = "../../vendor/libarchive-3.8.10";
const CONFIG_FOLDER: &str = "config";
const LIBRARY_NAME: &str = "omnileaf_libarchive_c";
const SOURCES: &[&str] = &[
    "archive_acl",
    "archive_blake2s_ref",
    "archive_blake2sp_ref",
    "archive_check_magic",
    "archive_crc32",
    "archive_entry",
    "archive_entry_sparse",
    "archive_entry_xattr",
    "archive_options",
    "archive_ppmd7",
    "archive_random",
    "archive_read",
    "archive_read_set_options",
    "archive_read_support_format_rar",
    "archive_read_support_format_rar5",
    "archive_string",
    "archive_string_sprintf",
    "archive_time",
    "archive_util",
    "archive_virtual",
];
const WINDOWS_SOURCES: &[&str] = &["archive_windows"];
const ALLOCATOR_HOOKS: &[(&str, &str)] = &[
    ("malloc", "omnileaf_libarchive_malloc"),
    ("calloc", "omnileaf_libarchive_calloc"),
    ("realloc", "omnileaf_libarchive_realloc"),
    ("free", "omnileaf_libarchive_free"),
    ("strdup", "omnileaf_libarchive_strdup"),
];

enum Platform {
    Unix,
    Apple,
    Android,
    Msvc,
}

impl Platform {
    fn detect() -> Result<Self, String> {
        let os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
        let target_env = env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
        match (os.as_str(), target_env.as_str()) {
            ("macos" | "ios", _) => Ok(Self::Apple),
            ("android", _) => Ok(Self::Android),
            ("windows", "msvc") => Ok(Self::Msvc),
            ("windows", other) => Err(format!(
                "omnileaf-libarchive builds for Windows only with the MSVC toolchain, not `{other}`"
            )),
            _ => Ok(Self::Unix),
        }
    }

    fn config_header(&self) -> &'static str {
        match self {
            Self::Unix => "config_unix.h",
            Self::Apple => "config_apple.h",
            Self::Android => "config_android.h",
            Self::Msvc => "config_msvc.h",
        }
    }
}

fn main() -> Result<(), String> {
    let platform = Platform::detect()?;
    let vendored = Path::new(VENDORED_FOLDER);
    let mut build = cc::Build::new();
    build
        .include(vendored.join("libarchive"))
        .include(CONFIG_FOLDER)
        .define(
            "PLATFORM_CONFIG_H",
            format!("\"{}\"", platform.config_header()).as_str(),
        )
        .warnings(false);
    for (name, hook) in ALLOCATOR_HOOKS {
        build.define(name, *hook);
    }
    let mut sources: Vec<&str> = SOURCES.to_vec();
    match platform {
        Platform::Android => {
            build.include(vendored.join("contrib/android/include"));
        }
        Platform::Msvc => {
            build
                .define("LIBARCHIVE_STATIC", None)
                .define("_strdup", "omnileaf_libarchive_strdup")
                .define("_CRT_SECURE_NO_DEPRECATE", None)
                .define("_CRT_NONSTDC_NO_DEPRECATE", None);
            sources.extend(WINDOWS_SOURCES);
            println!("cargo::rustc-link-lib=bcrypt");
        }
        Platform::Unix | Platform::Apple => {}
    }
    if !matches!(platform, Platform::Msvc) {
        build.flag("-fvisibility=hidden");
    }
    build.files(
        sources
            .iter()
            .map(|source| vendored.join("libarchive").join(format!("{source}.c"))),
    );
    build.compile(LIBRARY_NAME);
    println!("cargo::rerun-if-changed={CONFIG_FOLDER}");
    println!("cargo::rerun-if-changed={VENDORED_FOLDER}");
    Ok(())
}
