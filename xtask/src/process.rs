use std::{
    env,
    ffi::{OsStr, OsString},
    io,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use crate::{
    check::{self, Program, Runner, Step},
    workspace,
};

pub(crate) trait Machine {
    fn stdout_of(&self, program: &OsStr, args: &[&str]) -> Option<String>;
}

pub(crate) struct Process {
    root: PathBuf,
    env: Vec<(&'static str, OsString)>,
    test_partition: Option<String>,
}

impl Process {
    pub(crate) fn in_workspace() -> Self {
        Self::at(workspace::root())
    }

    fn at(root: PathBuf) -> Self {
        Self {
            root,
            env: Vec::new(),
            test_partition: None,
        }
    }

    pub(crate) fn with_step_env(mut self, key: &'static str, value: impl Into<OsString>) -> Self {
        self.env.push((key, value.into()));
        self
    }

    pub(crate) fn with_test_partition(mut self, partition: Option<String>) -> Self {
        self.test_partition = partition;
        self
    }

    fn command(&self, step: &Step) -> Command {
        let mut command = command_in_workspace(&self.root, &step.program);
        command
            .args(check::args_with_partition(
                step,
                self.test_partition.as_deref(),
            ))
            .envs(self.env.iter().map(|(key, value)| (key, value)))
            .current_dir(&self.root);
        command
    }
}

impl Runner for Process {
    #[expect(clippy::print_stdout, reason = "progress output for the developer")]
    fn run(&self, step: &Step) -> io::Result<bool> {
        println!("==> {}", step.name);
        self.command(step).status().map(|status| status.success())
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
const WORKSPACE_PATH_SEPARATOR: char = '/';

/// Windows installs tools such as pnpm as `.cmd` shims, which `Command` finds only by their full path.
pub(crate) fn command_for(program: impl AsRef<OsStr>) -> Command {
    let program = program.as_ref();
    let path = env::var_os("PATH").unwrap_or_default();
    let found = program
        .to_str()
        .and_then(|name| find_on_path(name, &path, &program_extensions()));
    match found {
        Some(found) => Command::new(found),
        None => Command::new(program),
    }
}

fn command_in_workspace(root: &Path, program: &Program) -> Command {
    match program {
        Program::OnPath(name) => command_for(name),
        Program::InWorkspace(script) => {
            Command::new(workspace_program(root, script, &program_extensions()))
        }
    }
}

fn program_extensions() -> Vec<String> {
    if !cfg!(windows) {
        return Vec::new();
    }
    env::var("PATHEXT")
        .unwrap_or_else(|_| DEFAULT_WINDOWS_EXTENSIONS.to_owned())
        .split(';')
        .filter(|extension| !extension.is_empty())
        .map(str::to_owned)
        .collect()
}

fn find_on_path(program: &str, path: &OsStr, extensions: &[impl AsRef<OsStr>]) -> Option<PathBuf> {
    env::split_paths(path)
        .find_map(|directory| first_existing_with_extension(&directory.join(program), extensions))
}

fn first_existing_with_extension(base: &Path, extensions: &[impl AsRef<OsStr>]) -> Option<PathBuf> {
    extensions
        .iter()
        .map(|extension| {
            let mut candidate = base.as_os_str().to_owned();
            candidate.push(extension);
            PathBuf::from(candidate)
        })
        .find(|candidate| candidate.is_file())
}

fn workspace_program(root: &Path, script: &str, extensions: &[impl AsRef<OsStr>]) -> PathBuf {
    let script = script
        .split(WORKSPACE_PATH_SEPARATOR)
        .fold(root.to_path_buf(), |path, part| path.join(part));
    first_existing_with_extension(&script, extensions).unwrap_or(script)
}

#[cfg(test)]
mod tests {
    use std::{fs, process};

    use super::*;

    const NO_EXTENSIONS: &[&str] = &[];

    fn directory_with(name: &str, files: &[&str]) -> PathBuf {
        let directory = env::temp_dir().join(format!("xtask-{name}-{}", process::id()));
        fs::create_dir_all(&directory).unwrap();
        for file in files {
            let file = directory.join(file);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, "").unwrap();
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

    #[test]
    fn runs_a_workspace_script_through_its_windows_wrapper() {
        let root = directory_with("wrapper", &["android/gradlew", "android/gradlew.bat"]);

        let program = workspace_program(&root, "android/gradlew", &[".exe", ".bat"]);

        fs::remove_dir_all(&root).unwrap();
        assert_eq!(program, root.join("android").join("gradlew.bat"));
    }

    #[test]
    fn keeps_a_workspace_script_as_it_is_without_windows_extensions() {
        let root = directory_with("script", &["android/gradlew", "android/gradlew.bat"]);

        let program = workspace_program(&root, "android/gradlew", NO_EXTENSIONS);

        fs::remove_dir_all(&root).unwrap();
        assert_eq!(program, root.join("android").join("gradlew"));
    }

    #[test]
    fn runs_a_workspace_step_through_the_wrapper_this_platform_needs() {
        let root = directory_with("dispatch", &["android/gradlew", "android/gradlew.bat"]);
        let process = Process::at(root.clone());
        let step = Step {
            name: "gradle",
            group: crate::check::Group::Android,
            program: Program::InWorkspace("android/gradlew"),
            args: &[],
        };

        let command = process.command(&step);

        fs::remove_dir_all(&root).unwrap();
        let program = Path::new(command.get_program());
        let wrapper = if cfg!(windows) {
            "gradlew.bat"
        } else {
            "gradlew"
        };
        assert_eq!(program.parent(), Some(root.join("android").as_path()));
        assert!(
            program
                .file_name()
                .is_some_and(|name| name.eq_ignore_ascii_case(wrapper))
        );
    }

    #[test]
    fn runs_steps_with_the_variables_it_was_given() {
        let process = Process::in_workspace().with_step_env("XTASK_PROBE", "set");
        let (program, args): (&'static str, &'static [&'static str]) = if cfg!(windows) {
            (
                "cmd",
                &["/C", "if %XTASK_PROBE%==set (exit 0) else (exit 1)"],
            )
        } else {
            ("sh", &["-c", "test \"$XTASK_PROBE\" = set"])
        };
        let step = Step {
            name: "probe",
            group: crate::check::Group::Rust,
            program: Program::OnPath(program),
            args,
        };

        let passed = process.run(&step).unwrap();

        assert!(passed);
    }
}
