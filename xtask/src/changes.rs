use std::path::Path;

use anyhow::Context;

use crate::pre_push::changed_files;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "each area is a separate yes or no that CI reads as its own output"
)]
pub(crate) struct Areas {
    pub(crate) native: bool,
    pub(crate) app: bool,
    pub(crate) site: bool,
    pub(crate) vendor: bool,
    pub(crate) admin: bool,
    pub(crate) dependencies: bool,
    pub(crate) browser_setup: bool,
}

impl Areas {
    pub(crate) const EVERYTHING: Self = Self {
        native: true,
        app: true,
        site: true,
        vendor: true,
        admin: true,
        dependencies: true,
        browser_setup: true,
    };

    fn union(self, other: Self) -> Self {
        Self {
            native: self.native || other.native,
            app: self.app || other.app,
            site: self.site || other.site,
            vendor: self.vendor || other.vendor,
            admin: self.admin || other.admin,
            dependencies: self.dependencies || other.dependencies,
            browser_setup: self.browser_setup || other.browser_setup,
        }
    }

    pub(crate) fn outputs(self) -> [String; 7] {
        [
            format!("native={}", self.native),
            format!("app={}", self.app),
            format!("site={}", self.site),
            format!("vendor={}", self.vendor),
            format!("admin={}", self.admin),
            format!("dependencies={}", self.dependencies),
            format!("browser-setup={}", self.browser_setup),
        ]
    }
}

const NOTHING: Areas = Areas {
    native: false,
    app: false,
    site: false,
    vendor: false,
    admin: false,
    dependencies: false,
    browser_setup: false,
};

const NATIVE: Areas = Areas {
    native: true,
    ..NOTHING
};
const ADMIN_SERVICE: Areas = Areas {
    native: true,
    admin: true,
    ..NOTHING
};
const ADMIN_BROWSER_CHECK: Areas = Areas {
    admin: true,
    ..NOTHING
};
const VENDORED: Areas = Areas {
    native: true,
    vendor: true,
    ..NOTHING
};
const BROWSER_SETUP: Areas = Areas {
    browser_setup: true,
    ..NOTHING
};
const DEPENDENCY_LIST: Areas = Areas {
    dependencies: true,
    ..NOTHING
};
const APP: Areas = Areas {
    app: true,
    ..NOTHING
};
const APP_READ_BY_NATIVE: Areas = Areas {
    native: true,
    app: true,
    ..NOTHING
};
const SITE: Areas = Areas {
    site: true,
    ..NOTHING
};
const BRANDING: Areas = Areas {
    app: true,
    site: true,
    ..NOTHING
};

const BROWSER_SETUP_FILES: &[&str] = &[
    "app/playwright.config.ts",
    "app/package.json",
    "app/vite.config.ts",
    "app/tsconfig.json",
];
const BROWSER_TEST_SCRIPTS: &str = "app/tests/";

const DEPENDENCY_LISTS: &[&str] = &["Cargo.toml", "Cargo.lock", "deny.toml"];

const RULES: &[(&str, Areas)] = &[
    ("crates/omnileaf-admin/", ADMIN_SERVICE),
    ("app/tests/admin/", ADMIN_BROWSER_CHECK),
    ("app/playwright.admin.config.ts", ADMIN_BROWSER_CHECK),
    ("admin-ui/", ADMIN_BROWSER_CHECK),
    ("app/src-tauri/", NATIVE),
    ("app/src/app.css", APP_READ_BY_NATIVE),
    ("app/src/lib/ipc/bindings.ts", APP_READ_BY_NATIVE),
    ("app/", APP),
    ("site/", SITE),
    ("branding/", BRANDING),
    ("crates/", NATIVE),
    ("xtask/", NATIVE),
    ("fuzz/", NATIVE),
    ("vendor/", VENDORED),
    (".cargo/", NATIVE),
    ("Cargo.toml", NATIVE),
    ("Cargo.lock", NATIVE),
    ("rust-toolchain.toml", NATIVE),
    ("clippy.toml", NATIVE),
    ("deny.toml", NATIVE),
    ("about.toml", NATIVE),
    ("docs/", NOTHING),
    (".changes/", NOTHING),
    ("policy/", NOTHING),
    (".githooks/", NOTHING),
    ("README.md", NOTHING),
    ("CONTRIBUTING.md", NOTHING),
    ("CODE_OF_CONDUCT.md", NOTHING),
    ("SECURITY.md", NOTHING),
    ("TRADEMARKS.md", NOTHING),
    ("LICENSE", NOTHING),
    (".editorconfig", NOTHING),
    (".gitignore", NOTHING),
];

pub(crate) fn areas_since(root: &Path, base: Option<&str>) -> anyhow::Result<Areas> {
    let Some(base) = base else {
        return Ok(Areas::EVERYTHING);
    };
    let changed = changed_files(root, base)
        .with_context(|| format!("list the files changed since {base}"))?;
    Ok(areas_for(&changed))
}

fn areas_for(changed: &[String]) -> Areas {
    changed
        .iter()
        .map(|path| area_of(path))
        .fold(NOTHING, Areas::union)
}

fn area_of(path: &str) -> Areas {
    let areas = RULES
        .iter()
        .find(|(rule, _)| covers(rule, path))
        .map_or(Areas::EVERYTHING, |(_, areas)| *areas);
    let areas = if is_dependency_list(path) {
        areas.union(DEPENDENCY_LIST)
    } else {
        areas
    };
    if is_browser_setup(path) {
        areas.union(BROWSER_SETUP)
    } else {
        areas
    }
}

fn is_browser_setup(path: &str) -> bool {
    BROWSER_SETUP_FILES.contains(&path)
        || path
            .strip_prefix(BROWSER_TEST_SCRIPTS)
            .is_some_and(|rest| !rest.contains('/'))
}

fn is_dependency_list(path: &str) -> bool {
    let file_name = path.rsplit('/').next().unwrap_or(path);
    DEPENDENCY_LISTS.contains(&file_name)
}

fn covers(rule: &str, path: &str) -> bool {
    if rule.ends_with('/') {
        path.starts_with(rule)
    } else {
        path == rule
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NATIVE_DEPENDENCIES: Areas = Areas {
        dependencies: true,
        ..NATIVE
    };

    fn areas(paths: &[&str]) -> Areas {
        let changed: Vec<String> = paths.iter().map(|path| (*path).to_owned()).collect();
        areas_for(&changed)
    }

    #[test]
    fn sends_rust_sources_and_cargo_settings_to_the_native_jobs() {
        for path in [
            "crates/omnileaf-formats/src/lib.rs",
            "app/src-tauri/src/lib.rs",
            "xtask/src/check.rs",
            "fuzz/fuzz_targets/read_cb7.rs",
            ".cargo/config.toml",
            "rust-toolchain.toml",
            "clippy.toml",
            "about.toml",
        ] {
            assert_eq!(areas(&[path]), NATIVE, "{path}");
        }
    }

    #[test]
    fn sends_the_dependency_lists_to_the_native_jobs_and_the_advisory_check() {
        for path in [
            "Cargo.toml",
            "Cargo.lock",
            "deny.toml",
            "crates/omnileaf-db/Cargo.toml",
            "app/src-tauri/Cargo.toml",
            "xtask/Cargo.toml",
            "fuzz/Cargo.toml",
            "fuzz/Cargo.lock",
        ] {
            assert_eq!(areas(&[path]), NATIVE_DEPENDENCIES, "{path}");
        }
    }

    #[test]
    fn leaves_the_advisory_check_out_for_changes_that_keep_the_dependencies() {
        for path in [
            "crates/omnileaf-db/src/lib.rs",
            "fuzz/fuzz_targets/read_cb7.rs",
            "app/src/lib/library/add-folder.ts",
            "docs/code-standards.md",
            "site/src/routes/+page.svelte",
        ] {
            assert!(!areas(&[path]).dependencies, "{path}");
        }
    }

    #[test]
    fn sends_what_sets_up_the_browser_tests_to_every_browser_test() {
        for path in [
            "app/playwright.config.ts",
            "app/package.json",
            "app/vite.config.ts",
            "app/tsconfig.json",
            "app/tests/shard-matrix.ts",
            "app/tests/write-shard-test-list.ts",
            "app/tests/browser-timings.json",
            "package.json",
            "pnpm-lock.yaml",
            "pnpm-workspace.yaml",
            ".node-version",
            ".github/workflows/ci.yml",
            ".github/actions/playwright-browsers/action.yml",
        ] {
            assert!(areas(&[path]).browser_setup, "{path}");
        }
    }

    #[test]
    fn leaves_the_browser_setup_alone_for_specs_and_the_code_they_test() {
        for path in [
            "app/tests/browser/library.spec.ts",
            "app/tests/browser/helpers/open-series.ts",
            "app/tests/app/shard-matrix.test.ts",
            "app/src/lib/library/add-folder.ts",
            "app/src/app.css",
            "crates/omnileaf-db/src/lib.rs",
            "site/src/routes/+page.svelte",
            "docs/code-standards.md",
        ] {
            assert!(!areas(&[path]).browser_setup, "{path}");
        }
    }

    #[test]
    fn checks_the_advisories_when_a_path_is_one_no_rule_knows() {
        assert!(areas(&["server/src/main.rs"]).dependencies);
    }

    #[test]
    fn sends_vendored_sources_to_the_native_jobs_and_the_upstream_comparison() {
        let changed = areas(&["vendor/libarchive-3.8.10/libarchive/archive_read.c"]);

        assert_eq!(changed, VENDORED);
    }

    #[test]
    fn sends_the_interface_to_the_app_jobs() {
        let changed = areas(&["app/src/lib/library/add-folder.ts"]);

        assert_eq!(changed, APP);
    }

    #[test]
    fn sends_the_interface_files_rust_tests_read_to_the_native_jobs_too() {
        for path in ["app/src/app.css", "app/src/lib/ipc/bindings.ts"] {
            assert_eq!(areas(&[path]), APP_READ_BY_NATIVE, "{path}");
        }
    }

    #[test]
    fn sends_the_admin_service_to_the_native_jobs_and_the_browser_check() {
        let changed = areas(&["crates/omnileaf-admin/src/style.css"]);

        assert_eq!(changed, ADMIN_SERVICE);
    }

    #[test]
    fn sends_the_browser_check_files_to_its_own_job_only() {
        for path in [
            "app/tests/admin/dashboard.spec.ts",
            "app/playwright.admin.config.ts",
        ] {
            assert_eq!(areas(&[path]), ADMIN_BROWSER_CHECK, "{path}");
        }
    }

    #[test]
    fn sends_the_admin_interface_to_the_browser_check_only() {
        for path in ["admin-ui/src/app.css", "admin-ui/package.json"] {
            assert_eq!(areas(&[path]), ADMIN_BROWSER_CHECK, "{path}");
        }
    }

    #[test]
    fn sends_the_website_to_the_site_tests() {
        let changed = areas(&["site/src/routes/+page.svelte"]);

        assert_eq!(changed, SITE);
    }

    #[test]
    fn sends_branding_to_the_app_and_the_site() {
        let changed = areas(&["branding/icon.svg"]);

        assert_eq!(changed, BRANDING);
    }

    #[test]
    fn needs_no_heavy_job_for_docs_and_repository_rules() {
        for path in [
            "README.md",
            "SECURITY.md",
            "LICENSE",
            "docs/code-standards.md",
            ".changes/android-section-tabs.md",
            ".changes/config.json",
            "policy/allowed-hosts.txt",
            ".githooks/pre-push",
            ".editorconfig",
            ".gitignore",
        ] {
            assert_eq!(areas(&[path]), NOTHING, "{path}");
        }
    }

    #[test]
    fn runs_everything_for_ci_and_shared_dependencies() {
        for path in [
            ".github/workflows/ci.yml",
            ".github/actions/rust-gate/action.yml",
            "package.json",
            "pnpm-lock.yaml",
            "pnpm-workspace.yaml",
            ".node-version",
            ".gitattributes",
        ] {
            assert_eq!(areas(&[path]), Areas::EVERYTHING, "{path}");
        }
    }

    #[test]
    fn runs_everything_for_a_path_no_rule_knows() {
        let changed = areas(&["server/src/main.rs"]);

        assert_eq!(changed, Areas::EVERYTHING);
    }

    #[test]
    fn combines_the_areas_of_every_changed_path() {
        let changed = areas(&["site/src/app.css", "crates/omnileaf-db/Cargo.toml"]);

        assert_eq!(
            changed,
            Areas {
                native: true,
                app: false,
                site: true,
                vendor: false,
                admin: false,
                dependencies: true,
                browser_setup: false,
            }
        );
    }

    #[test]
    fn needs_nothing_when_nothing_changed() {
        let changed = areas(&[]);

        assert_eq!(changed, NOTHING);
    }

    #[test]
    fn writes_one_github_output_line_per_area() {
        let lines = SITE.outputs();

        assert_eq!(
            lines,
            [
                "native=false",
                "app=false",
                "site=true",
                "vendor=false",
                "admin=false",
                "dependencies=false",
                "browser-setup=false"
            ]
        );
    }
}
