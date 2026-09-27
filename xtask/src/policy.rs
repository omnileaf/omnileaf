//! Repository content rules: no bundled sources, known hosts only, listed binaries, neutral wording.

use std::{fmt, path::Path};

pub(crate) struct RepositoryFile<'a> {
    pub(crate) path: &'a str,
    pub(crate) bytes: &'a [u8],
}

#[derive(Default)]
pub(crate) struct Policy {
    pub(crate) allowed_hosts: Vec<String>,
    pub(crate) allowed_paths: Vec<String>,
    pub(crate) allowed_binaries: Vec<String>,
    pub(crate) forbidden_phrases: Vec<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Violation {
    SourceDirectory { path: String },
    WasmModule { path: String },
    UnlistedBinary { path: String },
    UnknownHost { path: String, host: String },
    ForbiddenPhrase { path: String, phrase: String },
}

impl fmt::Display for Violation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::SourceDirectory { path } => {
                write!(f, "{path}: content sources don't belong in this repository")
            }
            Self::WasmModule { path } => write!(f, "{path}: WebAssembly modules aren't committed"),
            Self::UnlistedBinary { path } => {
                write!(
                    f,
                    "{path}: binary file missing from policy/allowed-binaries.txt"
                )
            }
            Self::UnknownHost { path, host } => {
                write!(
                    f,
                    "{path}: host {host} missing from policy/allowed-hosts.txt"
                )
            }
            Self::ForbiddenPhrase { path, phrase } => write!(f, "{path}: contains \"{phrase}\""),
        }
    }
}

const SOURCE_DIRECTORY_NAMES: &[&str] = &["sources", "extensions", "repos"];
const RESERVED_HOSTS: &[&str] = &["localhost", "example.com", "example.net", "example.org"];
const RESERVED_SUFFIXES: &[&str] = &[
    ".localhost",
    ".example",
    ".test",
    ".invalid",
    ".example.com",
    ".example.net",
    ".example.org",
];
const POLICY_DIRECTORY: &str = "policy/";
const BINARY_SNIFF_LENGTH: usize = 8000;
const URL_SEPARATOR: &str = "://";
const WASM_EXTENSION: &str = "wasm";

pub(crate) fn check(files: &[RepositoryFile<'_>], policy: &Policy) -> Vec<Violation> {
    files
        .iter()
        .flat_map(|file| violations_in(file, policy))
        .collect()
}

fn violations_in(file: &RepositoryFile<'_>, policy: &Policy) -> Vec<Violation> {
    let path = file.path.to_owned();
    let mut violations = Vec::new();
    if !is_listed(file.path, &policy.allowed_paths) {
        if in_source_directory(file.path) {
            violations.push(Violation::SourceDirectory { path: path.clone() });
        }
        if is_wasm_module(file.path) {
            violations.push(Violation::WasmModule { path: path.clone() });
        }
    }
    if is_binary(file.bytes) {
        if !is_listed(file.path, &policy.allowed_binaries) {
            violations.push(Violation::UnlistedBinary { path });
        }
        return violations;
    }
    if file.path.starts_with(POLICY_DIRECTORY) {
        return violations;
    }
    let text = String::from_utf8_lossy(file.bytes);
    violations.extend(
        hosts_in(&text)
            .into_iter()
            .filter(|host| !is_allowed_host(host, &policy.allowed_hosts))
            .map(|host| Violation::UnknownHost {
                path: path.clone(),
                host,
            }),
    );
    let lowered = text.to_lowercase();
    violations.extend(
        policy
            .forbidden_phrases
            .iter()
            .filter(|phrase| lowered.contains(phrase.to_lowercase().as_str()))
            .map(|phrase| Violation::ForbiddenPhrase {
                path: path.clone(),
                phrase: phrase.clone(),
            }),
    );
    violations
}

fn is_listed(path: &str, entries: &[String]) -> bool {
    entries
        .iter()
        .any(|entry| path == entry || (entry.ends_with('/') && path.starts_with(entry.as_str())))
}

fn in_source_directory(path: &str) -> bool {
    let mut components: Vec<&str> = path.split('/').collect();
    components.pop();
    components
        .iter()
        .any(|component| SOURCE_DIRECTORY_NAMES.contains(component))
}

fn is_wasm_module(path: &str) -> bool {
    Path::new(path)
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case(WASM_EXTENSION))
}

fn is_binary(bytes: &[u8]) -> bool {
    bytes
        .iter()
        .take(BINARY_SNIFF_LENGTH)
        .any(|byte| *byte == 0)
}

fn is_allowed_host(host: &str, allowed: &[String]) -> bool {
    RESERVED_HOSTS.contains(&host)
        || RESERVED_SUFFIXES
            .iter()
            .any(|suffix| host.ends_with(suffix))
        || allowed.iter().any(|entry| match entry.strip_prefix('*') {
            Some(suffix) => host.ends_with(suffix),
            None => host == entry,
        })
}

fn hosts_in(text: &str) -> Vec<String> {
    text.match_indices(URL_SEPARATOR)
        .filter_map(|(index, _)| text.get(index + URL_SEPARATOR.len()..))
        .filter_map(host_of_authority)
        .collect()
}

fn host_of_authority(rest: &str) -> Option<String> {
    let authority = rest
        .split(|c: char| c.is_whitespace() || "/?#\"'`()[]<>,;{}$\\".contains(c))
        .next()?;
    let without_userinfo = authority.rsplit('@').next()?;
    let host = without_userinfo
        .split(':')
        .next()?
        .trim_end_matches('.')
        .to_lowercase();
    (!host.is_empty()).then_some(host)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(path: &'static str, content: &'static str) -> RepositoryFile<'static> {
        RepositoryFile {
            path,
            bytes: content.as_bytes(),
        }
    }

    fn links_to(hosts: &[&str]) -> String {
        hosts
            .iter()
            .map(|host| format!("https://{host}/ "))
            .collect()
    }

    fn policy_with_hosts(hosts: &[&str]) -> Policy {
        Policy {
            allowed_hosts: hosts.iter().map(|host| (*host).to_owned()).collect(),
            ..Policy::default()
        }
    }

    #[test]
    fn finds_hosts_in_urls_without_userinfo_ports_or_paths() {
        let found =
            hosts_in("see https://me@Docs.Example.com:8443/x?y, http://a.test/ and wss://b.test.");

        assert_eq!(found, ["docs.example.com", "a.test", "b.test"]);
    }

    #[test]
    fn ignores_urls_without_a_host() {
        let found = hosts_in("file:///tmp/page.png");

        assert!(found.is_empty());
    }

    #[test]
    fn rejects_files_inside_a_source_directory() {
        let files = [text("crates/engine/src/sources/site.rs", "")];

        let violations = check(&files, &Policy::default());

        assert_eq!(
            violations,
            [Violation::SourceDirectory {
                path: "crates/engine/src/sources/site.rs".to_owned()
            }]
        );
    }

    #[test]
    fn exempts_allowed_paths_from_the_directory_rule() {
        let files = [text("crates/engine/src/sources/local.rs", "")];
        let policy = Policy {
            allowed_paths: vec!["crates/engine/src/sources/".to_owned()],
            ..Policy::default()
        };

        let violations = check(&files, &policy);

        assert!(violations.is_empty());
    }

    #[test]
    fn rejects_webassembly_modules() {
        let files = [text("demo/plugin.wasm", "")];

        let violations = check(&files, &Policy::default());

        assert_eq!(
            violations,
            [Violation::WasmModule {
                path: "demo/plugin.wasm".to_owned()
            }]
        );
    }

    #[test]
    fn rejects_webassembly_modules_whatever_the_extension_case() {
        let files = [text("demo/PLUGIN.WASM", "")];

        let violations = check(&files, &Policy::default());

        assert_eq!(
            violations,
            [Violation::WasmModule {
                path: "demo/PLUGIN.WASM".to_owned()
            }]
        );
    }

    #[test]
    fn accepts_only_listed_binary_files() {
        let files = [
            RepositoryFile {
                path: "icons/app.png",
                bytes: b"\x89PNG\0",
            },
            RepositoryFile {
                path: "stray.bin",
                bytes: b"\0\x01",
            },
        ];
        let policy = Policy {
            allowed_binaries: vec!["icons/".to_owned()],
            ..Policy::default()
        };

        let violations = check(&files, &policy);

        assert_eq!(
            violations,
            [Violation::UnlistedBinary {
                path: "stray.bin".to_owned()
            }]
        );
    }

    #[test]
    fn rejects_hosts_that_are_not_allowed() {
        let content = links_to(&["github.com", "unknown.site"]);
        let files = [RepositoryFile {
            path: "README.md",
            bytes: content.as_bytes(),
        }];

        let violations = check(&files, &policy_with_hosts(&["github.com"]));

        assert_eq!(
            violations,
            [Violation::UnknownHost {
                path: "README.md".to_owned(),
                host: "unknown.site".to_owned()
            }]
        );
    }

    #[test]
    fn accepts_wildcard_and_reserved_hosts() {
        let content = links_to(&[
            "api.github.com",
            "localhost:1420",
            "books.example.com",
            "a.test",
        ]);
        let files = [RepositoryFile {
            path: "docs.md",
            bytes: content.as_bytes(),
        }];

        let violations = check(&files, &policy_with_hosts(&["*.github.com"]));

        assert!(violations.is_empty());
    }

    #[test]
    fn rejects_forbidden_phrases_in_any_case() {
        let files = [text("README.md", "Sample Phrase, anywhere")];
        let policy = Policy {
            forbidden_phrases: vec!["sample phrase".to_owned()],
            ..Policy::default()
        };

        let violations = check(&files, &policy);

        assert_eq!(
            violations,
            [Violation::ForbiddenPhrase {
                path: "README.md".to_owned(),
                phrase: "sample phrase".to_owned()
            }]
        );
    }

    #[test]
    fn skips_the_policy_lists_themselves() {
        let files = [text("policy/forbidden-phrases.txt", "sample phrase")];
        let policy = Policy {
            forbidden_phrases: vec!["sample phrase".to_owned()],
            ..Policy::default()
        };

        let violations = check(&files, &policy);

        assert!(violations.is_empty());
    }
}
