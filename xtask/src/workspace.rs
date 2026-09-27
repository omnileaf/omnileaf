//! Reads the repository's tracked files and policy lists from disk.

use std::{
    fs, io,
    path::{Path, PathBuf},
    process::Command,
};

use crate::policy::Policy;

const POLICY_LISTS: &str = "policy";

pub(crate) fn root() -> PathBuf {
    PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/.."))
}

pub(crate) fn tracked_files(root: &Path) -> io::Result<Vec<(String, Vec<u8>)>> {
    let listing = Command::new("git")
        .args(["ls-files", "-z"])
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
