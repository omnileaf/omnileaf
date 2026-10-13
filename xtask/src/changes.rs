use std::path::Path;

use anyhow::Context;

use crate::pre_push::changed_files;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Areas {
    pub(crate) native: bool,
    pub(crate) app: bool,
    pub(crate) site: bool,
}

impl Areas {
    pub(crate) const EVERYTHING: Self = Self {
        native: true,
        app: true,
        site: true,
    };

    fn union(self, other: Self) -> Self {
        Self {
            native: self.native || other.native,
            app: self.app || other.app,
            site: self.site || other.site,
        }
    }

    pub(crate) fn outputs(self) -> [String; 3] {
        [
            format!("native={}", self.native),
            format!("app={}", self.app),
            format!("site={}", self.site),
        ]
    }
}

const NOTHING: Areas = Areas {
    native: false,
    app: false,
    site: false,
};
const NATIVE: Areas = Areas {
    native: true,
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

const RULES: &[(&str, Areas)] = &[
    ("app/src-tauri/", NATIVE),
    ("app/src/app.css", APP_READ_BY_NATIVE),
    ("app/src/lib/ipc/bindings.ts", APP_READ_BY_NATIVE),
    ("app/", APP),
    ("site/", SITE),
    ("branding/", BRANDING),
    ("crates/", NATIVE),
    ("xtask/", NATIVE),
    ("fuzz/", NATIVE),
    (".cargo/", NATIVE),
    ("Cargo.toml", NATIVE),
    ("Cargo.lock", NATIVE),
    ("rust-toolchain.toml", NATIVE),
    ("clippy.toml", NATIVE),
    ("deny.toml", NATIVE),
    ("about.toml", NATIVE),
    ("docs/", NOTHING),
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
    RULES
        .iter()
        .find(|(rule, _)| covers(rule, path))
        .map_or(Areas::EVERYTHING, |(_, areas)| *areas)
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

    fn areas(paths: &[&str]) -> Areas {
        let changed: Vec<String> = paths.iter().map(|path| (*path).to_owned()).collect();
        areas_for(&changed)
    }

    #[test]
    fn sends_rust_sources_and_cargo_files_to_the_native_jobs() {
        for path in [
            "crates/omnileaf-formats/src/lib.rs",
            "app/src-tauri/src/lib.rs",
            "xtask/src/check.rs",
            "fuzz/fuzz_targets/read_cb7.rs",
            ".cargo/config.toml",
            "Cargo.toml",
            "Cargo.lock",
            "rust-toolchain.toml",
            "clippy.toml",
            "deny.toml",
            "about.toml",
        ] {
            assert_eq!(areas(&[path]), NATIVE, "{path}");
        }
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
        let changed = areas(&["site/src/app.css", "crates/omnileaf-db/src/lib.rs"]);

        assert_eq!(
            changed,
            Areas {
                native: true,
                app: false,
                site: true,
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

        assert_eq!(lines, ["native=false", "app=false", "site=true"]);
    }
}
