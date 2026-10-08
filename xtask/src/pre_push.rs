//! The quick checks git runs before a push, chosen by what the pushed commits change.

use std::{path::Path, process::Command};

use anyhow::{Context, bail};

use crate::check::{Runner, STEPS, Step, run_all};

pub(crate) const HOOKS_FOLDER: &str = ".githooks";

const ALWAYS: &[&str] = &[
    "format",
    "fuzz format",
    "policy",
    "sync rules",
    "comment rules",
];
const RUST_LICENCES: &str = "licences";
const INTERFACE_BUILD: &str = "interface build";
const RUST_LICENCE_INPUTS: &[&str] = &["Cargo.lock", "Cargo.toml", "about.toml"];
const INTERFACE_DEPENDENCY_INPUTS: &[&str] =
    &["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"];

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct PushedRef {
    pub(crate) local_ref: String,
    pub(crate) local_sha: String,
    pub(crate) remote_sha: String,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Base<'a> {
    Remote(&'a str),
    WhereItLeftMain,
}

impl PushedRef {
    /// What the pushed commits are compared with, or `None` for a deleted branch, which carries nothing to check.
    pub(crate) fn base(&self) -> Option<Base<'_>> {
        if is_missing(&self.local_sha) {
            None
        } else if is_missing(&self.remote_sha) {
            Some(Base::WhereItLeftMain)
        } else {
            Some(Base::Remote(&self.remote_sha))
        }
    }
}

fn is_missing(sha: &str) -> bool {
    sha.bytes().all(|byte| byte == b'0')
}

/// Reads the `<local ref> <local sha> <remote ref> <remote sha>` lines git hands a pre-push hook.
pub(crate) fn parse(lines: &str) -> Vec<PushedRef> {
    lines
        .lines()
        .filter_map(
            |line| match line.split_whitespace().collect::<Vec<_>>()[..] {
                [local_ref, local_sha, _remote_ref, remote_sha] => Some(PushedRef {
                    local_ref: local_ref.to_owned(),
                    local_sha: local_sha.to_owned(),
                    remote_sha: remote_sha.to_owned(),
                }),
                _ => None,
            },
        )
        .collect()
}

/// The gate steps for a push changing `changed`, in gate order; `None` means what changed is unknown, so every drift check runs.
pub(crate) fn checks_for(changed: Option<&[String]>) -> Vec<&'static Step> {
    let touches = |inputs: &[&str]| {
        changed.is_none_or(|paths| paths.iter().any(|path| inputs.contains(&file_name(path))))
    };
    let checks_rust_licences = touches(RUST_LICENCE_INPUTS);
    let builds_interface = touches(INTERFACE_DEPENDENCY_INPUTS);
    STEPS
        .iter()
        .filter(|step| {
            ALWAYS.contains(&step.name)
                || (step.name == RUST_LICENCES && checks_rust_licences)
                || (step.name == INTERFACE_BUILD && builds_interface)
        })
        .collect()
}

fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// Checks the pushed branch that is checked out, since the checks read the working tree, and names any other pushed branch it leaves unchecked.
#[expect(
    clippy::print_stdout,
    reason = "the hook tells the developer what it skipped"
)]
pub(crate) fn run(
    root: &Path,
    remote: &str,
    lines: &str,
    runner: &impl Runner,
) -> anyhow::Result<()> {
    let head = git(root, &["rev-parse", "HEAD"]).context("find the checked-out commit")?;
    let mut checked_out = None;
    for pushed in parse(lines) {
        let Some(base) = pushed.base() else {
            continue;
        };
        if pushed.local_sha == head {
            checked_out = Some(base_commit(root, remote, &base));
        } else {
            println!("not checked: {} is not checked out", pushed.local_ref);
        }
    }
    let Some(base) = checked_out else {
        return Ok(());
    };
    if !git(root, &["status", "--porcelain", "--untracked-files=no"])?.is_empty() {
        bail!("commit or stash your changes before pushing, so the checks see what you push");
    }
    let changed = base.and_then(|base| {
        git(root, &["diff", "--name-only", &base, "HEAD"])
            .ok()
            .map(|paths| paths.lines().map(str::to_owned).collect::<Vec<_>>())
    });
    run_all(checks_for(changed.as_deref()), runner)?;
    Ok(())
}

/// The commit to compare with, or `None` when git can't tell, such as a remote commit this clone hasn't fetched.
fn base_commit(root: &Path, remote: &str, base: &Base<'_>) -> Option<String> {
    match base {
        Base::Remote(sha) => git(
            root,
            &[
                "rev-parse",
                "--verify",
                "--quiet",
                &format!("{sha}^{{commit}}"),
            ],
        )
        .ok(),
        Base::WhereItLeftMain => git(root, &["merge-base", "HEAD", &format!("{remote}/main")]).ok(),
    }
}

fn git(root: &Path, args: &[&str]) -> anyhow::Result<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .with_context(|| format!("run git {}", args.join(" ")))?;
    if !output.status.success() {
        bail!("git {} failed", args.join(" "));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

/// Points git at the committed hooks, so every clone runs the same checks before a push.
pub(crate) fn install_hooks(root: &Path) -> anyhow::Result<()> {
    git(root, &["config", "core.hooksPath", HOOKS_FOLDER]).map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ZEROS: &str = "0000000000000000000000000000000000000000";
    const LOCAL: &str = "1111111111111111111111111111111111111111";
    const REMOTE: &str = "2222222222222222222222222222222222222222";

    fn pushed(local_sha: &str, remote_sha: &str) -> PushedRef {
        PushedRef {
            local_ref: "refs/heads/feat/x".to_owned(),
            local_sha: local_sha.to_owned(),
            remote_sha: remote_sha.to_owned(),
        }
    }

    fn names(changed: Option<&[&str]>) -> Vec<&'static str> {
        let changed: Option<Vec<String>> =
            changed.map(|paths| paths.iter().map(|path| (*path).to_owned()).collect());
        checks_for(changed.as_deref())
            .into_iter()
            .map(|step| step.name)
            .collect()
    }

    #[test]
    fn reads_each_ref_git_hands_the_hook() {
        let lines = format!(
            "refs/heads/feat/x {LOCAL} refs/heads/feat/x {REMOTE}\nrefs/heads/feat/y {LOCAL} refs/heads/feat/y {ZEROS}\n"
        );

        let refs = parse(&lines);

        assert_eq!(
            refs,
            [
                PushedRef {
                    local_ref: "refs/heads/feat/x".to_owned(),
                    local_sha: LOCAL.to_owned(),
                    remote_sha: REMOTE.to_owned(),
                },
                PushedRef {
                    local_ref: "refs/heads/feat/y".to_owned(),
                    local_sha: LOCAL.to_owned(),
                    remote_sha: ZEROS.to_owned(),
                },
            ]
        );
    }

    #[test]
    fn compares_an_existing_branch_with_what_the_remote_has() {
        let branch = pushed(LOCAL, REMOTE);

        assert_eq!(branch.base(), Some(Base::Remote(REMOTE)));
    }

    #[test]
    fn compares_a_new_branch_with_where_it_left_main() {
        let branch = pushed(LOCAL, ZEROS);

        assert_eq!(branch.base(), Some(Base::WhereItLeftMain));
    }

    #[test]
    fn checks_nothing_for_a_deleted_branch() {
        let branch = pushed(ZEROS, REMOTE);

        assert_eq!(branch.base(), None);
    }

    #[test]
    fn always_checks_formatting_policy_sync_and_comment_rules() {
        let checks = names(Some(&["crates/omnileaf-db/src/lib.rs"]));

        assert_eq!(
            checks,
            [
                "format",
                "fuzz format",
                "policy",
                "sync rules",
                "comment rules"
            ]
        );
    }

    #[test]
    fn checks_the_rust_licences_when_a_manifest_lockfile_or_about_config_changes() {
        let pushes = [
            "Cargo.lock",
            "crates/omnileaf-engine/Cargo.toml",
            "about.toml",
        ];

        let checked: Vec<bool> = pushes
            .iter()
            .map(|path| names(Some(&[path])).contains(&"licences"))
            .collect();

        assert_eq!(checked, [true, true, true]);
    }

    #[test]
    fn leaves_the_licences_alone_when_only_code_changes() {
        let checks = names(Some(&[
            "crates/omnileaf-engine/src/library.rs",
            "app/src/app.css",
        ]));

        assert!(!checks.contains(&"licences"));
    }

    #[test]
    fn builds_the_interface_when_its_dependencies_change() {
        let checks = names(Some(&["pnpm-lock.yaml"]));

        assert_eq!(
            checks,
            [
                "format",
                "fuzz format",
                "policy",
                "sync rules",
                "comment rules",
                "interface build"
            ]
        );
    }

    #[test]
    fn runs_every_drift_check_when_it_cannot_tell_what_changed() {
        let checks = names(None);

        assert_eq!(
            checks,
            [
                "format",
                "fuzz format",
                "policy",
                "licences",
                "sync rules",
                "comment rules",
                "interface build"
            ]
        );
    }

    #[test]
    fn every_pre_push_check_is_a_gate_step() {
        let wanted = ALWAYS.iter().chain(&[RUST_LICENCES, INTERFACE_BUILD]);

        let missing: Vec<&&str> = wanted
            .filter(|name| !STEPS.iter().any(|step| step.name == **name))
            .collect();

        assert!(missing.is_empty(), "{missing:?}");
    }
}
