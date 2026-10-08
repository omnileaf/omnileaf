use std::{
    env,
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
    process::Command,
};

use crate::policy::Policy;

const POLICY_LISTS: &str = "policy";
const BUILT_MANIFEST_DIR: &str = env!("CARGO_MANIFEST_DIR");

/// The checkout `cargo run` starts xtask from, which can differ from the one its binary was built in.
pub(crate) fn root() -> PathBuf {
    root_from(env::var_os("CARGO_MANIFEST_DIR"))
}

fn root_from(run_manifest_dir: Option<OsString>) -> PathBuf {
    run_manifest_dir
        .map_or_else(|| PathBuf::from(BUILT_MANIFEST_DIR), PathBuf::from)
        .join("..")
}

pub(crate) fn repository_files(root: &Path) -> io::Result<Vec<(String, Vec<u8>)>> {
    let listing = Command::new("git")
        .args([
            "ls-files",
            "-z",
            "--cached",
            "--others",
            "--exclude-standard",
        ])
        .current_dir(root)
        .output()?;
    if !listing.status.success() {
        return Err(io::Error::other("git ls-files failed"));
    }
    let mut files = Vec::new();
    for path in String::from_utf8_lossy(&listing.stdout)
        .split('\0')
        .filter(|path| !path.is_empty())
    {
        match fs::read(root.join(path)) {
            Ok(bytes) => files.push((path.to_owned(), bytes)),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(files)
}

pub(crate) fn policy(root: &Path) -> io::Result<Policy> {
    let lists = root.join(POLICY_LISTS);
    Ok(Policy {
        allowed_hosts: read_list(&lists.join("allowed-hosts.txt"))?,
        allowed_paths: read_list(&lists.join("allowed-paths.txt"))?,
        allowed_binaries: read_list(&lists.join("allowed-binaries.txt"))?,
        forbidden_phrases: read_list(&lists.join("forbidden-phrases.txt"))?,
    })
}

fn read_list(path: &Path) -> io::Result<Vec<String>> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(content
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(str::to_owned)
            .collect()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn works_on_the_checkout_cargo_runs_it_from() {
        let run_from = OsString::from("/elsewhere/omnileaf/xtask");

        let root = root_from(Some(run_from));

        assert_eq!(root, Path::new("/elsewhere/omnileaf/xtask/.."));
    }

    #[test]
    fn falls_back_to_the_checkout_it_was_built_in() {
        let root = root_from(None);

        assert_eq!(root, Path::new(BUILT_MANIFEST_DIR).join(".."));
    }
}
