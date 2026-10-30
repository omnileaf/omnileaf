mod manifest;
mod recipes;

use std::{
    collections::BTreeMap,
    env, fs, io,
    path::{Path, PathBuf},
    process::{self, Command, Stdio},
    sync::atomic::{AtomicUsize, Ordering},
    time::{Duration, SystemTime},
};

use anyhow::{Context, bail};

use self::{
    manifest::{Fixture, Manifest, Tool},
    recipes::{Maker, RECIPES, Source},
};
use crate::vendor::sha256_hex;

pub(crate) const FIXTURES: &str = "crates/omnileaf-formats/tests/rar_fixtures";

const MANIFEST: &str = "manifest.json";
const SOURCES_MODIFIED_SECONDS: u64 = 1_767_348_672;
const SOURCES_MODE: u32 = 0o644;
const ARCHIVE_EXTENSIONS: [&str; 2] = ["cbr", "rar"];
const ZONE: (&str, &str) = ("TZ", "UTC");

static GENERATIONS: AtomicUsize = AtomicUsize::new(0);

pub(crate) trait Rar {
    fn tool(&self, maker: Maker) -> anyhow::Result<Tool>;

    fn run(&self, maker: Maker, folder: &Path, arguments: &[String]) -> anyhow::Result<()>;
}

#[derive(Debug)]
pub(crate) struct InstalledRar {
    pub(crate) rar5: PathBuf,
    pub(crate) rar4: PathBuf,
}

struct Archive {
    file: &'static str,
    bytes: Vec<u8>,
}

struct Made {
    manifest: Manifest,
    archives: Vec<Archive>,
}

impl Rar for InstalledRar {
    fn tool(&self, maker: Maker) -> anyhow::Result<Tool> {
        let program = self.program(maker);
        let banner = Command::new(program)
            .stdin(Stdio::null())
            .output()
            .with_context(|| format!("run {} for its banner", program.display()))?;
        let version = version_of(&String::from_utf8_lossy(&banner.stdout))
            .with_context(|| format!("{} printed no RAR version", program.display()))?;
        let bytes = fs::read(program).with_context(|| format!("read {}", program.display()))?;
        Ok(Tool {
            version,
            sha256: sha256_hex(&bytes),
        })
    }

    fn run(&self, maker: Maker, folder: &Path, arguments: &[String]) -> anyhow::Result<()> {
        let program = self.program(maker);
        let status = rar_command(program, folder, arguments)
            .status()
            .with_context(|| format!("run {}", program.display()))?;
        if !status.success() {
            bail!("{} {arguments:?} ended with {status}", program.display());
        }
        Ok(())
    }
}

impl InstalledRar {
    fn program(&self, maker: Maker) -> &Path {
        match maker {
            Maker::Rar5 => &self.rar5,
            Maker::Rar4 => &self.rar4,
        }
    }
}

/// RAR 4 stores each file's time as local time, so the zone is pinned to keep the archives the same everywhere.
fn rar_command(program: &Path, folder: &Path, arguments: &[String]) -> Command {
    let mut command = Command::new(program);
    command
        .args(arguments)
        .env(ZONE.0, ZONE.1)
        .current_dir(folder)
        .stdin(Stdio::null());
    command
}

pub(crate) fn generate(out: &Path, rar: &impl Rar) -> anyhow::Result<Vec<PathBuf>> {
    let working = working_folder()?;
    let made = make_all(&working, rar);
    let cleaned =
        fs::remove_dir_all(&working).with_context(|| format!("remove {}", working.display()));
    let made = made?;
    cleaned?;
    publish(out, &made)
}

fn make_all(working: &Path, rar: &impl Rar) -> anyhow::Result<Made> {
    let mut archives = Vec::new();
    let mut fixtures = Vec::new();
    for recipe in &RECIPES {
        let sources = recipe.sources();
        let folder = working.join(recipe.file);
        write_sources(&folder, sources.written())?;
        let arguments = recipe.command(&sources);
        rar.run(recipe.maker, &folder, &arguments)?;
        let made = folder.join(recipe.file);
        let bytes = fs::read(&made).with_context(|| format!("read {}", made.display()))?;
        fixtures.push(Fixture::of(recipe, arguments, &bytes, &sources));
        archives.push(Archive {
            file: recipe.file,
            bytes,
        });
    }
    let tools = BTreeMap::from([
        (Maker::Rar5, rar.tool(Maker::Rar5)?),
        (Maker::Rar4, rar.tool(Maker::Rar4)?),
    ]);
    Ok(Made {
        manifest: Manifest { tools, fixtures },
        archives,
    })
}

fn publish(out: &Path, made: &Made) -> anyhow::Result<Vec<PathBuf>> {
    remove_earlier_fixtures(out)?;
    fs::create_dir_all(out).with_context(|| format!("create {}", out.display()))?;
    let mut written = Vec::new();
    for archive in &made.archives {
        let path = out.join(archive.file);
        fs::write(&path, &archive.bytes).with_context(|| format!("write {}", path.display()))?;
        written.push(path);
    }
    let path = out.join(MANIFEST);
    let json = serde_json::to_string_pretty(&made.manifest).context("write the manifest")?;
    fs::write(&path, format!("{json}\n")).with_context(|| format!("write {}", path.display()))?;
    written.push(path);
    Ok(written)
}

fn working_folder() -> anyhow::Result<PathBuf> {
    let generation = GENERATIONS.fetch_add(1, Ordering::Relaxed);
    let folder = env::temp_dir().join(format!(
        "omnileaf-xtask-rar-fixtures-{}-{generation}",
        process::id()
    ));
    if folder.exists() {
        fs::remove_dir_all(&folder)
            .with_context(|| format!("clear {} left by an earlier run", folder.display()))?;
    }
    Ok(folder)
}

fn remove_earlier_fixtures(out: &Path) -> anyhow::Result<()> {
    let Ok(entries) = fs::read_dir(out) else {
        return Ok(());
    };
    for entry in entries {
        let path = entry?.path();
        let is_fixture = path.file_name().is_some_and(|name| name == MANIFEST)
            || path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| ARCHIVE_EXTENSIONS.contains(&extension));
        if is_fixture {
            fs::remove_file(&path).with_context(|| format!("remove {}", path.display()))?;
        }
    }
    Ok(())
}

fn write_sources<'a>(
    folder: &Path,
    sources: impl Iterator<Item = &'a Source>,
) -> anyhow::Result<()> {
    fs::create_dir_all(folder).with_context(|| format!("create {}", folder.display()))?;
    for source in sources {
        let path = folder.join(&source.name);
        fs::write(&path, &source.bytes).with_context(|| format!("write {}", path.display()))?;
        fix_attributes(&path)
            .with_context(|| format!("fix the time and mode of {}", path.display()))?;
    }
    Ok(())
}

fn fix_attributes(path: &Path) -> io::Result<()> {
    let modified = SystemTime::UNIX_EPOCH + Duration::from_secs(SOURCES_MODIFIED_SECONDS);
    fs::File::options()
        .write(true)
        .open(path)?
        .set_modified(modified)?;
    fix_mode(path)
}

/// RAR stores the Unix mode of each file, which would otherwise follow the umask of whoever made the archive.
#[cfg(unix)]
fn fix_mode(path: &Path) -> io::Result<()> {
    use std::{fs::Permissions, os::unix::fs::PermissionsExt};

    fs::set_permissions(path, Permissions::from_mode(SOURCES_MODE))
}

#[cfg(not(unix))]
fn fix_mode(_path: &Path) -> io::Result<()> {
    Ok(())
}

fn version_of(banner: &str) -> Option<String> {
    let line = banner.lines().find(|line| line.starts_with("RAR "))?;
    let version = line.strip_prefix("RAR ")?.split_whitespace().next()?;
    version
        .chars()
        .all(|character| character.is_ascii_digit() || character == '.')
        .then(|| version.to_owned())
}

#[cfg(test)]
mod tests {
    use std::{cell::RefCell, ffi::OsStr, time::SystemTime};

    use serde_json::Value;

    use super::*;

    struct Run {
        maker: Maker,
        arguments: Vec<String>,
        modified: Vec<SystemTime>,
        modes: Vec<u32>,
    }

    #[derive(Default)]
    struct FakeRar {
        runs: RefCell<Vec<Run>>,
    }

    struct BrokenRar;

    impl Rar for FakeRar {
        fn tool(&self, maker: Maker) -> anyhow::Result<Tool> {
            Ok(Tool {
                version: format!("{maker:?}"),
                sha256: "0".repeat(64),
            })
        }

        fn run(&self, maker: Maker, folder: &Path, arguments: &[String]) -> anyhow::Result<()> {
            let files = fs::read_dir(folder)?
                .map(|entry| Ok(entry?.metadata()?))
                .collect::<anyhow::Result<Vec<_>>>()?;
            let target = arguments
                .iter()
                .find(|argument| {
                    RECIPES
                        .iter()
                        .any(|recipe| recipe.target == argument.as_str())
                })
                .unwrap();
            let made = if arguments.iter().any(|argument| argument == "-v1k") {
                target.replace(".rar", ".part1.rar")
            } else {
                target.clone()
            };
            fs::write(folder.join(made), arguments.join(" "))?;
            self.runs.borrow_mut().push(Run {
                maker,
                arguments: arguments.to_vec(),
                modified: files
                    .iter()
                    .map(fs::Metadata::modified)
                    .collect::<io::Result<_>>()?,
                modes: files.iter().map(mode_of).collect(),
            });
            Ok(())
        }
    }

    impl Rar for BrokenRar {
        fn tool(&self, _maker: Maker) -> anyhow::Result<Tool> {
            bail!("no tool")
        }

        fn run(&self, _maker: Maker, _folder: &Path, _arguments: &[String]) -> anyhow::Result<()> {
            bail!("rar ended with exit status: 10")
        }
    }

    #[cfg(unix)]
    fn mode_of(metadata: &fs::Metadata) -> u32 {
        use std::os::unix::fs::PermissionsExt;

        metadata.permissions().mode() & 0o777
    }

    #[cfg(not(unix))]
    fn mode_of(_metadata: &fs::Metadata) -> u32 {
        SOURCES_MODE
    }

    fn scratch(name: &str) -> PathBuf {
        env::temp_dir().join(format!("omnileaf-xtask-{name}-{}", process::id()))
    }

    fn manifest_of(out: &Path) -> Value {
        serde_json::from_slice(&fs::read(out.join(MANIFEST)).unwrap()).unwrap()
    }

    fn fixture<'a>(manifest: &'a Value, file: &str) -> &'a Value {
        manifest["fixtures"]
            .as_array()
            .unwrap()
            .iter()
            .find(|fixture| fixture["file"] == file)
            .unwrap()
    }

    #[test]
    fn writes_every_recipe_and_records_the_hash_of_each_file() {
        let out = scratch("rar-fixtures-written");

        let written = generate(&out, &FakeRar::default()).unwrap();

        let manifest = manifest_of(&out);
        let fixtures = manifest["fixtures"].as_array().unwrap();
        assert_eq!(fixtures.len(), RECIPES.len());
        for fixture in fixtures {
            let bytes = fs::read(out.join(fixture["file"].as_str().unwrap())).unwrap();
            assert_eq!(fixture["sha256"], sha256_hex(&bytes).as_str());
        }
        assert_eq!(written.len(), RECIPES.len() + 1);
        fs::remove_dir_all(&out).unwrap();
    }

    #[test]
    fn records_the_whole_command_the_tool_and_what_the_reader_must_find() {
        let out = scratch("rar-fixtures-manifest");
        generate(&out, &FakeRar::default()).unwrap();
        let manifest = manifest_of(&out);

        let normal = fixture(&manifest, "rar4-normal.cbr");
        let volume = fixture(&manifest, "rar5-multivolume.part1.rar");

        assert_eq!(normal["maker"], "rar4");
        assert_eq!(
            normal["arguments"],
            serde_json::json!([
                "a",
                "-idq",
                "-ts-",
                "-ma4",
                "-m3",
                "rar4-normal.cbr",
                "003.png",
                "002.png",
                "001.png",
                "ComicInfo.xml"
            ])
        );
        let opens = &normal["outcome"]["opens"];
        let names: Vec<_> = opens["pages"]
            .as_array()
            .unwrap()
            .iter()
            .map(|page| page["name"].as_str().unwrap())
            .collect();
        assert_eq!(names, ["001.png", "002.png", "003.png"]);
        assert_eq!(opens["comic_info"]["series"], "Sample Series 01");
        assert_eq!(volume["outcome"]["refused"], "multi_volume");
        assert_eq!(manifest["tools"]["rar5"]["version"], "Rar5");
        assert_eq!(manifest["tools"]["rar4"]["version"], "Rar4");
        fs::remove_dir_all(&out).unwrap();
    }

    #[test]
    fn archives_sources_with_one_modified_time_and_mode_and_no_stored_times() {
        let out = scratch("rar-fixtures-stable");
        let rar = FakeRar::default();

        generate(&out, &rar).unwrap();

        let expected = SystemTime::UNIX_EPOCH + Duration::from_secs(SOURCES_MODIFIED_SECONDS);
        let runs = rar.runs.borrow();
        assert_eq!(runs.len(), RECIPES.len());
        for run in runs.iter() {
            assert!(run.arguments.iter().any(|argument| argument == "-ts-"));
            assert!(run.modified.iter().all(|time| *time == expected));
            assert!(run.modes.iter().all(|mode| *mode == SOURCES_MODE));
        }
        fs::remove_dir_all(&out).unwrap();
    }

    #[test]
    fn archives_each_recipe_with_the_tool_that_writes_its_format() {
        let out = scratch("rar-fixtures-makers");
        let rar = FakeRar::default();

        generate(&out, &rar).unwrap();

        let used: Vec<_> = rar.runs.borrow().iter().map(|run| run.maker).collect();
        let wanted: Vec<_> = RECIPES.iter().map(|recipe| recipe.maker).collect();
        assert_eq!(used, wanted);
        fs::remove_dir_all(&out).unwrap();
    }

    #[test]
    fn runs_rar_in_utc_so_local_file_times_come_out_the_same_everywhere() {
        let command = rar_command(Path::new("rar"), Path::new("."), &["a".to_owned()]);

        let zone = command.get_envs().find(|(key, _)| *key == OsStr::new("TZ"));

        assert_eq!(zone, Some((OsStr::new("TZ"), Some(OsStr::new("UTC")))));
    }

    #[test]
    fn replaces_files_left_from_an_earlier_run() {
        let out = scratch("rar-fixtures-stale");
        fs::create_dir_all(&out).unwrap();
        fs::write(out.join("stale.cbr"), b"old").unwrap();

        generate(&out, &FakeRar::default()).unwrap();

        assert!(!out.join("stale.cbr").exists());
        fs::remove_dir_all(&out).unwrap();
    }

    #[test]
    fn keeps_the_earlier_fixtures_when_rar_fails() {
        let out = scratch("rar-fixtures-failed");
        fs::create_dir_all(&out).unwrap();
        fs::write(out.join("earlier.cbr"), b"old").unwrap();
        fs::write(out.join(MANIFEST), b"{}").unwrap();

        let result = generate(&out, &BrokenRar);

        assert!(result.is_err());
        assert_eq!(fs::read(out.join("earlier.cbr")).unwrap(), b"old");
        assert_eq!(fs::read(out.join(MANIFEST)).unwrap(), b"{}");
        fs::remove_dir_all(&out).unwrap();
    }

    #[test]
    fn reads_the_version_from_the_banner() {
        let banner =
            "\nRAR 7.23   Copyright (c) 1993-2026 Alexander Roshal   27 Jun 2026\nTrial version\n";

        assert_eq!(version_of(banner).as_deref(), Some("7.23"));
        assert_eq!(version_of("not a banner"), None);
    }
}
