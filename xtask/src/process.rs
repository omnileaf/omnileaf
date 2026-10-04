//! Runs gate steps and tool probes as child processes in the workspace root.

use std::{
    env,
    ffi::OsStr,
    io,
    path::PathBuf,
    process::{Command, Stdio},
};

use crate::{
    check::{Runner, Step},
    workspace,
};

/// The programs on this machine, behind a seam the tests replace with a fake.
pub(crate) trait Machine {
    /// Returns `None` when the program can't start or exits unsuccessfully.
    fn stdout_of(&self, program: &OsStr, args: &[&str]) -> Option<String>;
}

pub(crate) struct Process {
    root: PathBuf,
}

impl Process {
    pub(crate) fn in_workspace() -> Self {
        Self {
            root: workspace::root(),
        }
    }
}

impl Runner for Process {
    #[expect(clippy::print_stdout, reason = "progress output for the developer")]
    fn run(&self, step: &Step) -> io::Result<bool> {
        println!("==> {}", step.name);
        command_for(step.program)
            .args(step.args)
            .current_dir(&self.root)
            .status()
            .map(|status| status.success())
    }
}

impl Machine for Process {
    fn stdout_of(&self, program: &OsStr, args: &[&str]) -> Option<String> {
        let output = command_for(program)
            .args(args)
            .current_dir(&self.root)
            .stderr(Stdio::null())
            .output()
            .ok()
            .filter(|output| output.status.success())?;
        Some(String::from_utf8_lossy(&output.stdout).into_owned())
    }
}

const DEFAULT_WINDOWS_EXTENSIONS: &str = ".COM;.EXE;.BAT;.CMD";

/// Windows installs tools such as pnpm as `.cmd` shims, which `Command` only
/// finds when it is given their full path.
pub(crate) fn command_for(program: impl AsRef<OsStr>) -> Command {
    let program = program.as_ref();
    if cfg!(windows)
        && let Some(program) = program.to_str()
    {
        let path = env::var_os("PATH").unwrap_or_default();
        let extensions =
            env::var("PATHEXT").unwrap_or_else(|_| DEFAULT_WINDOWS_EXTENSIONS.to_owned());
        let extensions: Vec<&str> = extensions
            .split(';')
            .filter(|extension| !extension.is_empty())
            .collect();
        if let Some(found) = find_on_path(program, &path, &extensions) {
            return Command::new(found);
        }
    }
    Command::new(program)
}

fn find_on_path(program: &str, path: &OsStr, extensions: &[&str]) -> Option<PathBuf> {
    env::split_paths(path)
        .flat_map(|directory| {
            extensions
                .iter()
                .map(move |extension| directory.join(format!("{program}{extension}")))
        })
        .find(|candidate| candidate.is_file())
}

#[cfg(test)]
mod tests {
    use std::{fs, process};

    use super::*;

    fn directory_with(name: &str, files: &[&str]) -> PathBuf {
        let directory = env::temp_dir().join(format!("xtask-{name}-{}", process::id()));
        fs::create_dir_all(&directory).unwrap();
        for file in files {
            fs::write(directory.join(file), "").unwrap();
        }
        directory
    }

    #[test]
    fn finds_a_command_shim_by_its_extension() {
        let directory = directory_with("shim", &["tool.cmd"]);

        let found = find_on_path("tool", directory.as_os_str(), &[".exe", ".cmd"]);

        fs::remove_dir_all(&directory).unwrap();
        assert_eq!(found, Some(directory.join("tool.cmd")));
    }

    #[test]
    fn finds_nothing_for_a_program_that_is_not_there() {
        let directory = directory_with("empty", &["other.cmd"]);

        let found = find_on_path("tool", directory.as_os_str(), &[".exe", ".cmd"]);

        fs::remove_dir_all(&directory).unwrap();
        assert_eq!(found, None);
    }
}
