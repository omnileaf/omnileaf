mod archive;
mod version;

use std::{
    fmt, fs, io,
    ops::Range,
    path::{Path, PathBuf},
};

use anyhow::Context;
use serde::{Deserialize, Serialize};

use self::{
    archive::{archive_violation, shown_archive_path},
    version::{Version, parse_version},
};
use crate::{
    json,
    pre_push::{changed_files, git},
};

pub(crate) const FOLDER: &str = ".changes";
const CONFIG: &str = "config.json";
const README: &str = "README.md";
const RELEASED: &str = "released";
const NOT_FRAGMENTS: &[&str] = &[CONFIG, README, RELEASED];
const CHANGELOG: &str = "CHANGELOG.md";
const SECTION_HEADING: &str = "## ";
const FRAGMENT_EXTENSION: &str = ".md";
const MAX_SUMMARY_CHARACTERS: usize = 300;
const MAX_LOGIN_CHARACTERS: usize = 39;
const FRONT_MATTER_FENCE: &str = "---";
const UNRELEASED: &str = "unreleased";
const USER_FACING_IN_APP: &[&str] = &["app/src/", "app/src-tauri/src/", "app/messages/"];
const USER_FACING_IN_CRATE: &[&str] = &["src", "android"];
const TEST_FILE_ENDINGS: &[&str] = &[".test.ts", ".spec.ts"];
const TEST_FOLDERS: &[&str] = &["/tests/", "/test/"];

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct Heading {
    id: String,
    heading: String,
}

#[derive(Deserialize)]
struct ConfigFile {
    headline: String,
    types: Vec<Heading>,
    areas: Vec<Heading>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(try_from = "ConfigFile")]
pub(crate) struct Config {
    headline: String,
    types: Vec<Heading>,
    areas: Vec<Heading>,
}

impl TryFrom<ConfigFile> for Config {
    type Error = String;

    fn try_from(file: ConfigFile) -> Result<Self, Self::Error> {
        let config = Self {
            headline: file.headline,
            types: file.types,
            areas: file.areas,
        };
        match config.type_position(&config.headline) {
            Some(_) => Ok(config),
            None => Err(format!(
                "the headline `{}` must be one of the types",
                config.headline
            )),
        }
    }
}

impl Config {
    fn type_position(&self, id: &str) -> Option<usize> {
        self.types.iter().position(|kind| kind.id == id)
    }

    fn area_position(&self, id: &str) -> Option<usize> {
        self.areas.iter().position(|area| area.id == id)
    }

    fn check_type(&self, kind: &str) -> Result<(), Problem> {
        match self.type_position(kind) {
            Some(_) => Ok(()),
            None => Err(Problem::UnknownType(kind.to_owned())),
        }
    }

    fn check_area(&self, area: &str) -> Result<(), Problem> {
        match self.area_position(area) {
            Some(_) => Ok(()),
            None => Err(Problem::UnknownArea(area.to_owned())),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Fragment {
    kind: String,
    area: String,
    credit: Vec<String>,
    summary: String,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Problem {
    BadName,
    NoFrontMatter,
    UnclosedFrontMatter,
    BadLine(String),
    UnknownKey(String),
    DuplicateKey(String),
    Missing(&'static str),
    UnknownType(String),
    UnknownArea(String),
    CreditNotAList(String),
    BadLogin(String),
    BadPullRequest(String),
    EmptySummary,
    LongSummary(usize),
    EmDash,
    NotOneLine,
    NotAReleaseName,
    MalformedArchive(String),
    OtherVersion(String),
    NoEntries,
    NotInChangelog(String),
}

impl fmt::Display for Problem {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::BadName => write!(
                formatter,
                "the file name must be a short slug of lowercase letters, digits and dashes, ending in {FRAGMENT_EXTENSION}"
            ),
            Self::NoFrontMatter => {
                write!(
                    formatter,
                    "the file must start with a {FRONT_MATTER_FENCE} line"
                )
            }
            Self::UnclosedFrontMatter => {
                write!(
                    formatter,
                    "the front matter needs a closing {FRONT_MATTER_FENCE} line"
                )
            }
            Self::BadLine(line) => write!(formatter, "`{line}` is not a `key: value` line"),
            Self::UnknownKey(key) => {
                write!(
                    formatter,
                    "`{key}` is not a key; use type, area, credit or pr"
                )
            }
            Self::DuplicateKey(key) => write!(formatter, "`{key}` is given twice"),
            Self::Missing(key) => write!(formatter, "`{key}` is missing"),
            Self::UnknownType(kind) => {
                write!(formatter, "type `{kind}` is not in {FOLDER}/{CONFIG}")
            }
            Self::UnknownArea(area) => {
                write!(formatter, "area `{area}` is not in {FOLDER}/{CONFIG}")
            }
            Self::CreditNotAList(value) => {
                write!(
                    formatter,
                    "credit `{value}` must be a list such as [octocat]"
                )
            }
            Self::BadLogin(login) => {
                write!(
                    formatter,
                    "`{login}` is not a GitHub login; leave out the @"
                )
            }
            Self::BadPullRequest(value) => {
                write!(formatter, "pr `{value}` must be a pull request number")
            }
            Self::EmptySummary => write!(formatter, "the summary is empty"),
            Self::LongSummary(length) => write!(
                formatter,
                "the summary is {length} characters; keep it to {MAX_SUMMARY_CHARACTERS}"
            ),
            Self::EmDash => write!(
                formatter,
                "the summary holds an em-dash; use a comma or a full stop"
            ),
            Self::NotOneLine => {
                write!(formatter, "the summary must be one line with single spaces")
            }
            Self::NotAReleaseName => write!(
                formatter,
                "the file name must be a full release version such as 1.2.0.json"
            ),
            Self::MalformedArchive(error) => {
                write!(formatter, "the archive is not release notes JSON: {error}")
            }
            Self::NoEntries => write!(formatter, "the archive has no entries"),
            Self::OtherVersion(version) => write!(
                formatter,
                "the archive holds the notes of {version}, not of the version in its name"
            ),
            Self::NotInChangelog(version) => write!(
                formatter,
                "{CHANGELOG} has no `{SECTION_HEADING}{version}` section that matches the archive; edit the two together"
            ),
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Violation {
    file: String,
    problem: Problem,
}

impl fmt::Display for Violation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{FOLDER}/{}: {}", self.file, self.problem)
    }
}

impl std::error::Error for Violation {}

fn is_slug_file(name: &str) -> bool {
    name.strip_suffix(FRAGMENT_EXTENSION).is_some_and(|slug| {
        !slug.is_empty()
            && !slug.starts_with('-')
            && !slug.ends_with('-')
            && slug
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    })
}

fn is_github_login(login: &str) -> bool {
    let bytes = login.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= MAX_LOGIN_CHARACTERS
        && !login.starts_with('-')
        && !login.ends_with('-')
        && !login.contains("--")
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'-')
}

fn split_front_matter(text: &str) -> Result<(Vec<&str>, String), Problem> {
    let mut lines = text.lines();
    if lines.next().map(str::trim_end) != Some(FRONT_MATTER_FENCE) {
        return Err(Problem::NoFrontMatter);
    }
    let mut front_matter = Vec::new();
    for line in lines.by_ref() {
        if line.trim_end() == FRONT_MATTER_FENCE {
            let summary = lines.collect::<Vec<_>>().join(" ");
            return Ok((front_matter, single_spaced(&summary)));
        }
        front_matter.push(line);
    }
    Err(Problem::UnclosedFrontMatter)
}

fn parse_credit(value: &str) -> Result<Vec<String>, Problem> {
    let list = value
        .strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
        .ok_or_else(|| Problem::CreditNotAList(value.to_owned()))?;
    list.split(',')
        .map(str::trim)
        .filter(|login| !login.is_empty())
        .map(|login| {
            if is_github_login(login) {
                Ok(login.to_owned())
            } else {
                Err(Problem::BadLogin(login.to_owned()))
            }
        })
        .collect()
}

#[derive(Default)]
struct Keys<'a> {
    kind: Option<&'a str>,
    area: Option<&'a str>,
    credit: Option<&'a str>,
    pr: Option<&'a str>,
}

fn read_keys<'a>(lines: &[&'a str]) -> Result<Keys<'a>, Problem> {
    let mut keys = Keys::default();
    for line in lines.iter().filter(|line| !line.trim().is_empty()) {
        let (key, value) = line
            .split_once(':')
            .ok_or_else(|| Problem::BadLine((*line).to_owned()))?;
        let (key, value) = (key.trim(), value.trim());
        let slot = match key {
            "type" => &mut keys.kind,
            "area" => &mut keys.area,
            "credit" => &mut keys.credit,
            "pr" => &mut keys.pr,
            other => return Err(Problem::UnknownKey(other.to_owned())),
        };
        if slot.replace(value).is_some() {
            return Err(Problem::DuplicateKey(key.to_owned()));
        }
    }
    Ok(keys)
}

pub(crate) fn parse(name: &str, text: &str, config: &Config) -> Result<Fragment, Problem> {
    if !is_slug_file(name) {
        return Err(Problem::BadName);
    }
    let (front_matter, summary) = split_front_matter(text)?;
    let keys = read_keys(&front_matter)?;
    let kind = keys.kind.ok_or(Problem::Missing("type"))?;
    config.check_type(kind)?;
    let area = keys.area.ok_or(Problem::Missing("area"))?;
    config.check_area(area)?;
    let credit = keys
        .credit
        .map(parse_credit)
        .transpose()?
        .unwrap_or_default();
    if let Some(pr) = keys.pr
        && pr.parse::<u64>().ok().is_none_or(|number| number == 0)
    {
        return Err(Problem::BadPullRequest(pr.to_owned()));
    }
    check_summary(&summary)?;
    Ok(Fragment {
        kind: kind.to_owned(),
        area: area.to_owned(),
        credit,
        summary,
    })
}

fn single_spaced(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_one_line(summary: &str) -> bool {
    single_spaced(summary) == summary
}

fn check_summary(summary: &str) -> Result<(), Problem> {
    if summary.is_empty() {
        return Err(Problem::EmptySummary);
    }
    if !is_one_line(summary) {
        return Err(Problem::NotOneLine);
    }
    let length = summary.chars().count();
    if length > MAX_SUMMARY_CHARACTERS {
        return Err(Problem::LongSummary(length));
    }
    if summary.contains('\u{2014}') {
        return Err(Problem::EmDash);
    }
    Ok(())
}

struct Folder {
    config: Config,
    files: Vec<(String, String)>,
    path: PathBuf,
}

impl Folder {
    fn unreleased_notes(&self, version: &str) -> anyhow::Result<CreditedNotes> {
        Ok(CreditedNotes::gather(
            version,
            valid_fragments(self)?,
            &self.config,
        ))
    }

    fn notes_to_release(&self, version: &str) -> anyhow::Result<CreditedNotes> {
        let notes = self.unreleased_notes(version)?;
        anyhow::ensure!(
            !notes.notes.entries.is_empty(),
            "{FOLDER} has no fragments, so {version} would have no release notes"
        );
        Ok(notes)
    }

    fn fragment_paths(&self) -> Vec<PathBuf> {
        self.files
            .iter()
            .map(|(name, _)| self.path.join(name))
            .collect()
    }
}

fn read_folder(root: &Path) -> anyhow::Result<Folder> {
    let folder = root.join(FOLDER);
    let config_path = folder.join(CONFIG);
    let config = serde_json::from_slice(
        &fs::read(&config_path).with_context(|| format!("read {}", config_path.display()))?,
    )
    .with_context(|| format!("parse {}", config_path.display()))?;
    let mut files = Vec::new();
    for entry in fs::read_dir(&folder).with_context(|| format!("list {}", folder.display()))? {
        let path = entry?.path();
        let name = file_name(&path);
        if !is_fragment_name(&name) {
            continue;
        }
        let text = fs::read_to_string(&path).or_else(|error| match error.kind() {
            io::ErrorKind::InvalidData => Ok(String::new()),
            _ => Err(error),
        })?;
        files.push((name, text));
    }
    files.sort();
    Ok(Folder {
        config,
        files,
        path: folder,
    })
}

fn is_fragment_name(name: &str) -> bool {
    !name.is_empty() && !name.contains('/') && !NOT_FRAGMENTS.contains(&name)
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn read_fragments(folder: &Folder) -> (Vec<Fragment>, Vec<Violation>) {
    let mut fragments = Vec::new();
    let mut violations = Vec::new();
    for (name, text) in &folder.files {
        match parse(name, text, &folder.config) {
            Ok(fragment) => fragments.push(fragment),
            Err(problem) => violations.push(Violation {
                file: name.clone(),
                problem,
            }),
        }
    }
    (fragments, violations)
}

pub(crate) fn check(root: &Path) -> anyhow::Result<Vec<Violation>> {
    let folder = read_folder(root)?;
    let changelog = read_changelog(root)?;
    let mut violations = read_fragments(&folder).1;
    violations.extend(folder.archive_violations(&changelog)?);
    Ok(violations)
}

fn in_report_order(mut fragments: Vec<Fragment>, config: &Config) -> Vec<Fragment> {
    fragments.sort_by_key(|fragment| {
        (
            config.type_position(&fragment.kind),
            config.area_position(&fragment.area),
        )
    });
    fragments
}

fn heading_of<'a>(headings: &'a [Heading], id: &'a str) -> &'a str {
    headings
        .iter()
        .find(|heading| heading.id == id)
        .map_or(id, |heading| heading.heading.as_str())
}

fn contributors(fragments: &[Fragment]) -> Vec<String> {
    let mut logins: Vec<String> = fragments
        .iter()
        .flat_map(|fragment| fragment.credit.iter().cloned())
        .collect();
    logins.sort_unstable();
    logins.dedup();
    logins
}

#[derive(Serialize, Deserialize)]
struct Entry {
    #[serde(rename = "type")]
    kind: String,
    area: String,
    summary: String,
}

#[derive(Serialize, Deserialize)]
struct Notes {
    version: String,
    entries: Vec<Entry>,
}

#[derive(Serialize, Deserialize)]
struct CreditedNotes {
    #[serde(flatten)]
    notes: Notes,
    contributors: Vec<String>,
}

impl CreditedNotes {
    fn gather(version: &str, fragments: Vec<Fragment>, config: &Config) -> Self {
        let fragments = in_report_order(fragments, config);
        Self {
            contributors: contributors(&fragments),
            notes: Notes {
                version: version.to_owned(),
                entries: fragments
                    .into_iter()
                    .map(|fragment| Entry {
                        kind: fragment.kind,
                        area: fragment.area,
                        summary: fragment.summary,
                    })
                    .collect(),
            },
        }
    }

    fn headline(&self, config: &Config) -> Option<&str> {
        let entries = &self.notes.entries;
        entries
            .iter()
            .find(|entry| entry.kind == config.headline)
            .or_else(|| entries.first())
            .map(|entry| entry.summary.as_str())
    }

    fn markdown(&self, config: &Config) -> String {
        let headline = self.headline(config).map(str::to_owned);
        joined_sections(
            &headline
                .into_iter()
                .chain(self.sections(config))
                .collect::<Vec<_>>(),
        )
    }

    fn changelog_section(&self, config: &Config) -> String {
        format!(
            "{SECTION_HEADING}{}\n\n{}",
            self.notes.version,
            joined_sections(&self.sections(config))
        )
    }

    fn matches_its_changelog_section(&self, changelog: &str, config: &Config) -> bool {
        version_section(changelog, &self.notes.version).is_some_and(|section| {
            changelog[section].trim_end_matches('\n')
                == self.changelog_section(config).trim_end_matches('\n')
        })
    }

    fn rewrite_its_changelog_section(
        &self,
        changelog: &str,
        config: &Config,
    ) -> Result<String, Violation> {
        let version = &self.notes.version;
        let section = version_section(changelog, version)
            .ok_or_else(|| archive_violation(version, Problem::NotInChangelog(version.clone())))?;
        let old_text = changelog[section.clone()].trim_end_matches('\n');
        Ok(format!(
            "{}{}{}",
            &changelog[..section.start],
            self.changelog_section(config).trim_end_matches('\n'),
            &changelog[section.start + old_text.len()..]
        ))
    }

    fn sections(&self, config: &Config) -> Vec<String> {
        let mut sections = Vec::new();
        for kind in &config.types {
            let lines: Vec<String> = self
                .notes
                .entries
                .iter()
                .filter(|entry| entry.kind == kind.id)
                .map(|entry| {
                    format!(
                        "- **{}:** {}",
                        heading_of(&config.areas, &entry.area),
                        entry.summary
                    )
                })
                .collect();
            if !lines.is_empty() {
                sections.push(format!(
                    "{SECTION_HEADING}{}\n\n{}",
                    kind.heading,
                    lines.join("\n")
                ));
            }
        }
        if !self.contributors.is_empty() {
            let handles: Vec<String> = self
                .contributors
                .iter()
                .map(|login| format!("@{login}"))
                .collect();
            sections.push(format!("Contributors: {}", handles.join(", ")));
        }
        sections
    }
}

fn joined_sections(sections: &[String]) -> String {
    if sections.is_empty() {
        String::new()
    } else {
        sections.join("\n\n") + "\n"
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, clap::ValueEnum)]
pub(crate) enum Format {
    Markdown,
    Json,
}

fn valid_fragments(folder: &Folder) -> anyhow::Result<Vec<Fragment>> {
    let (fragments, violations) = read_fragments(folder);
    anyhow::ensure!(
        violations.is_empty(),
        "fix the {} fragment problem(s) first:\n{}",
        violations.len(),
        violations
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join("\n")
    );
    Ok(fragments)
}

pub(crate) fn notes(root: &Path, version: Option<&str>, format: Format) -> anyhow::Result<String> {
    let folder = read_folder(root)?;
    let notes = match version.map(parse_version).transpose()? {
        Some(Version::Full(version)) => folder.archived_notes(version)?,
        Some(Version::PreRelease(version)) => folder.notes_to_release(version)?,
        None => folder.unreleased_notes(UNRELEASED)?,
    };
    match format {
        Format::Markdown => Ok(notes.markdown(&folder.config)),
        Format::Json => Ok(json::pretty(&notes.notes)?),
    }
}

struct Release {
    version: String,
    archive_path: PathBuf,
    archive: String,
    changelog: String,
    used: Vec<PathBuf>,
}

fn insert_above_the_first_section(changelog: &str, section: &str) -> String {
    let first_section = changelog
        .match_indices(SECTION_HEADING)
        .map(|(at, _)| at)
        .find(|&at| at == 0 || changelog[..at].ends_with('\n'));
    match first_section {
        Some(at) => format!("{}{section}\n{}", &changelog[..at], &changelog[at..]),
        None => format!("{}\n\n{section}", changelog.trim_end()),
    }
}

fn lines_with_offsets(text: &str) -> impl Iterator<Item = (usize, &str)> {
    text.split_inclusive('\n').scan(0, |offset, line| {
        let at = *offset;
        *offset += line.len();
        Some((at, line.trim_end()))
    })
}

fn is_heading_of(line: &str, version: &str) -> bool {
    line.strip_prefix(SECTION_HEADING)
        .and_then(|rest| rest.strip_prefix(version))
        .is_some_and(|rest| rest.is_empty() || rest.starts_with(' '))
}

fn is_release_heading(line: &str) -> bool {
    line.strip_prefix(SECTION_HEADING)
        .and_then(|rest| rest.split(' ').next())
        .is_some_and(|word| parse_version(word).is_ok())
}

fn version_heading<'a>(changelog: &'a str, version: &str) -> Option<&'a str> {
    lines_with_offsets(changelog)
        .map(|(_, line)| line)
        .find(|line| is_heading_of(line, version))
}

fn version_section(changelog: &str, version: &str) -> Option<Range<usize>> {
    let mut starts = lines_with_offsets(changelog)
        .filter(|(_, line)| is_heading_of(line, version))
        .map(|(at, _)| at);
    let start = starts.next()?;
    if starts.next().is_some() {
        return None;
    }
    let end = lines_with_offsets(changelog)
        .find(|&(at, line)| at > start && is_release_heading(line))
        .map_or(changelog.len(), |(at, _)| at);
    Some(start..end)
}

fn plan_release(folder: &Folder, version: &str, changelog: &str) -> anyhow::Result<Release> {
    let Version::Full(version) = parse_version(version)? else {
        anyhow::bail!(
            "`{version}` is a pre-release; only full releases are archived, and a pre-release takes its notes from the fragments"
        );
    };
    let archive_path = folder.archive_path(version);
    anyhow::ensure!(
        !archive_path.exists(),
        "{version} is already released in {}",
        shown_archive_path(version)
    );
    if let Some(heading) = version_heading(changelog, version) {
        anyhow::bail!(
            "{CHANGELOG} already has a section for {version}; remove `{heading}` and its notes, then release {version} again"
        );
    }
    let notes = folder.notes_to_release(version)?;
    let section = notes.changelog_section(&folder.config);
    Ok(Release {
        version: version.to_owned(),
        archive_path,
        archive: json::pretty(&notes)?,
        changelog: insert_above_the_first_section(changelog, &section),
        used: folder.fragment_paths(),
    })
}

fn write_release(root: &Path, release: &Release) -> anyhow::Result<()> {
    let archive_path = &release.archive_path;
    if let Some(released) = archive_path.parent() {
        fs::create_dir_all(released).with_context(|| format!("create {}", released.display()))?;
    }
    fs::File::create_new(archive_path)
        .and_then(|mut file| io::Write::write_all(&mut file, release.archive.as_bytes()))
        .with_context(|| format!("write {}", archive_path.display()))?;
    finish_release(root, release).with_context(|| {
        format!(
            "{version} is half released: put it back with `git restore {CHANGELOG} {FOLDER}` and remove {archive}, then release it again",
            version = release.version,
            archive = shown_archive_path(&release.version),
        )
    })
}

fn finish_release(root: &Path, release: &Release) -> anyhow::Result<()> {
    let changelog_path = root.join(CHANGELOG);
    fs::write(&changelog_path, &release.changelog)
        .with_context(|| format!("write {}", changelog_path.display()))?;
    for path in &release.used {
        fs::remove_file(path).with_context(|| format!("remove {}", path.display()))?;
    }
    Ok(())
}

fn read_changelog(root: &Path) -> anyhow::Result<String> {
    let path = root.join(CHANGELOG);
    fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))
}

pub(crate) fn release(root: &Path, version: &str) -> anyhow::Result<()> {
    let folder = read_folder(root)?;
    let changelog = read_changelog(root)?;
    let release = plan_release(&folder, version, &changelog)?;
    write_release(root, &release)
}

pub(crate) fn rewrite(root: &Path) -> anyhow::Result<()> {
    let folder = read_folder(root)?;
    let mut changelog = read_changelog(root)?;
    for version in folder.archived_versions()? {
        let notes = folder.archived_notes(&version)?;
        changelog = notes.rewrite_its_changelog_section(&changelog, &folder.config)?;
    }
    let path = root.join(CHANGELOG);
    fs::write(&path, changelog).with_context(|| format!("write {}", path.display()))
}

fn is_user_facing(path: &str) -> bool {
    if TEST_FILE_ENDINGS
        .iter()
        .any(|ending| path.ends_with(ending))
        || TEST_FOLDERS.iter().any(|folder| path.contains(folder))
    {
        return false;
    }
    if USER_FACING_IN_APP.iter().any(|root| path.starts_with(root)) {
        return true;
    }
    let mut parts = path.split('/');
    matches!(
        (parts.next(), parts.next(), parts.next(), parts.next()),
        (Some("crates"), Some(_), Some(part), Some(_)) if USER_FACING_IN_CRATE.contains(&part)
    )
}

fn is_fragment_path(path: &str) -> bool {
    path.strip_prefix(FOLDER)
        .and_then(|rest| rest.strip_prefix('/'))
        .is_some_and(is_fragment_name)
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct MissingFragment {
    touched: Vec<String>,
}

impl fmt::Display for MissingFragment {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(formatter, "this change touches what people see:")?;
        for path in self.touched.iter().take(5) {
            writeln!(formatter, "  {path}")?;
        }
        if self.touched.len() > 5 {
            writeln!(formatter, "  and {} more", self.touched.len() - 5)?;
        }
        write!(
            formatter,
            "add a file under {FOLDER}/ (see {FOLDER}/{README}), or put the no-changelog label on the pull request"
        )
    }
}

pub(crate) fn require(changed: &[String], skip: bool) -> Result<(), MissingFragment> {
    let touched: Vec<String> = changed
        .iter()
        .filter(|path| is_user_facing(path))
        .cloned()
        .collect();
    if skip || touched.is_empty() || changed.iter().any(|path| is_fragment_path(path)) {
        Ok(())
    } else {
        Err(MissingFragment { touched })
    }
}

/// Compares with the merge base so a branch that is behind its base lists only its own changes.
pub(crate) fn changed_since_merge_base(root: &Path, base: &str) -> anyhow::Result<Vec<String>> {
    let fork_point = git(root, &["merge-base", base, "HEAD"]).unwrap_or_else(|_| base.to_owned());
    changed_files(root, &fork_point).with_context(|| format!("list the files changed since {base}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONFIG_JSON: &str = r#"{
        "headline": "feat",
        "types": [
            {"id": "breaking", "heading": "Breaking changes"},
            {"id": "sec", "heading": "Security"},
            {"id": "feat", "heading": "New"},
            {"id": "perf", "heading": "Faster"},
            {"id": "fix", "heading": "Fixed"}
        ],
        "areas": [
            {"id": "library", "heading": "Library"},
            {"id": "reader", "heading": "Reader"}
        ]
    }"#;

    fn config() -> Config {
        serde_json::from_str(CONFIG_JSON).unwrap()
    }

    pub(super) fn fragment_text(front_matter: &str, summary: &str) -> String {
        format!("---\n{front_matter}\n---\n{summary}\n")
    }

    fn parsed(name: &str, text: &str) -> Result<Fragment, Problem> {
        parse(name, text, &config())
    }

    fn valid(kind: &str, area: &str, credit: &[&str], summary: &str) -> Fragment {
        Fragment {
            kind: kind.to_owned(),
            area: area.to_owned(),
            credit: credit.iter().map(|login| (*login).to_owned()).collect(),
            summary: summary.to_owned(),
        }
    }

    pub(super) fn scratch_repo(fragments: &[(&str, &str)]) -> omnileaf_testkit::ScratchFolder {
        let scratch = omnileaf_testkit::ScratchFolder::new("repo");
        scratch.write(&format!("{FOLDER}/{CONFIG}"), CONFIG_JSON.as_bytes());
        scratch.write(&format!("{FOLDER}/{README}"), b"# Fragments\n");
        scratch.write(CHANGELOG, b"# Changelog\n");
        for (name, text) in fragments {
            scratch.write(&format!("{FOLDER}/{name}"), text.as_bytes());
        }
        scratch
    }

    fn markdown_of(fragments: Vec<Fragment>) -> String {
        CreditedNotes::gather(UNRELEASED, fragments, &config()).markdown(&config())
    }

    fn paths(paths: &[&str]) -> Vec<String> {
        paths.iter().map(|path| (*path).to_owned()).collect()
    }

    #[test]
    fn reads_a_fragment_with_every_key() {
        let text = fragment_text(
            "type: feat\narea: library\ncredit: [octocat, hubot-2]\npr: 12",
            "Tabs now show on Android.",
        );

        let fragment = parsed("android-section-tabs.md", &text);

        assert_eq!(
            fragment,
            Ok(valid(
                "feat",
                "library",
                &["octocat", "hubot-2"],
                "Tabs now show on Android."
            ))
        );
    }

    #[test]
    fn reads_a_fragment_with_only_the_required_keys() {
        let text = fragment_text("type: fix\narea: reader", "The page stays put.");

        assert_eq!(
            parsed("keep-page.md", &text),
            Ok(valid("fix", "reader", &[], "The page stays put."))
        );
    }

    #[test]
    fn joins_a_wrapped_summary_into_one_line() {
        let text = fragment_text("type: fix\narea: reader", "The page\n  stays   put.\n");

        assert_eq!(
            parsed("keep-page.md", &text).unwrap().summary,
            "The page stays put."
        );
    }

    #[test]
    fn takes_an_empty_credit_list() {
        let text = fragment_text("type: fix\narea: reader\ncredit: []", "The page stays put.");

        assert_eq!(
            parsed("keep-page.md", &text).unwrap().credit,
            Vec::<String>::new()
        );
    }

    #[test]
    fn rejects_a_name_that_is_not_a_slug() {
        let text = fragment_text("type: fix\narea: reader", "Done.");

        for name in [
            "Keep_Page.md",
            "keep-page.txt",
            ".md",
            "-keep.md",
            "keep-.md",
            "a b.md",
        ] {
            assert_eq!(parsed(name, &text), Err(Problem::BadName), "{name}");
        }
    }

    #[test]
    fn rejects_a_file_without_front_matter() {
        assert_eq!(parsed("a.md", "Just text.\n"), Err(Problem::NoFrontMatter));
    }

    #[test]
    fn rejects_front_matter_that_never_closes() {
        assert_eq!(
            parsed("a.md", "---\ntype: fix\narea: reader\n"),
            Err(Problem::UnclosedFrontMatter)
        );
    }

    #[test]
    fn rejects_a_line_that_is_not_a_key_and_value() {
        let text = fragment_text("type fix", "Done.");

        assert_eq!(
            parsed("a.md", &text),
            Err(Problem::BadLine("type fix".to_owned()))
        );
    }

    #[test]
    fn rejects_an_unknown_key() {
        let text = fragment_text("type: fix\narea: reader\nissue: 3", "Done.");

        assert_eq!(
            parsed("a.md", &text),
            Err(Problem::UnknownKey("issue".to_owned()))
        );
    }

    #[test]
    fn rejects_a_key_given_twice() {
        let text = fragment_text("type: fix\ntype: feat\narea: reader", "Done.");

        assert_eq!(
            parsed("a.md", &text),
            Err(Problem::DuplicateKey("type".to_owned()))
        );
    }

    #[test]
    fn rejects_a_missing_type_or_area() {
        let no_type = fragment_text("area: reader", "Done.");
        let no_area = fragment_text("type: fix", "Done.");

        assert_eq!(parsed("a.md", &no_type), Err(Problem::Missing("type")));
        assert_eq!(parsed("a.md", &no_area), Err(Problem::Missing("area")));
    }

    #[test]
    fn rejects_a_type_or_area_the_config_does_not_list() {
        let bad_type = fragment_text("type: chore\narea: reader", "Done.");
        let bad_area = fragment_text("type: fix\narea: kitchen", "Done.");

        assert_eq!(
            parsed("a.md", &bad_type),
            Err(Problem::UnknownType("chore".to_owned()))
        );
        assert_eq!(
            parsed("a.md", &bad_area),
            Err(Problem::UnknownArea("kitchen".to_owned()))
        );
    }

    #[test]
    fn rejects_credit_that_is_not_a_list() {
        let text = fragment_text("type: fix\narea: reader\ncredit: octocat", "Done.");

        assert_eq!(
            parsed("a.md", &text),
            Err(Problem::CreditNotAList("octocat".to_owned()))
        );
    }

    #[test]
    fn rejects_credit_that_is_not_a_github_login() {
        for login in [
            "@octocat",
            "-octo",
            "octo-",
            "oc--to",
            "octo cat",
            "octo_cat",
            "a".repeat(40).as_str(),
        ] {
            let text = fragment_text(
                &format!("type: fix\narea: reader\ncredit: [{login}]"),
                "Done.",
            );

            assert_eq!(
                parsed("a.md", &text),
                Err(Problem::BadLogin(login.to_owned())),
                "{login}"
            );
        }
    }

    #[test]
    fn takes_a_login_of_the_longest_length() {
        let login = "a".repeat(39);
        let text = fragment_text(
            &format!("type: fix\narea: reader\ncredit: [{login}]"),
            "Done.",
        );

        assert_eq!(parsed("a.md", &text).unwrap().credit, [login]);
    }

    #[test]
    fn rejects_a_pull_request_that_is_not_a_number() {
        for value in ["abc", "0", "-3", "#4", ""] {
            let text = fragment_text(&format!("type: fix\narea: reader\npr: {value}"), "Done.");

            assert_eq!(
                parsed("a.md", &text),
                Err(Problem::BadPullRequest(value.to_owned())),
                "{value:?}"
            );
        }
    }

    #[test]
    fn rejects_an_empty_summary() {
        let text = fragment_text("type: fix\narea: reader", "  \n");

        assert_eq!(parsed("a.md", &text), Err(Problem::EmptySummary));
    }

    #[test]
    fn rejects_a_summary_over_the_limit_and_takes_one_at_it() {
        let at_limit = fragment_text("type: fix\narea: reader", &"a".repeat(300));
        let over = fragment_text("type: fix\narea: reader", &"a".repeat(301));

        assert!(parsed("a.md", &at_limit).is_ok());
        assert_eq!(parsed("a.md", &over), Err(Problem::LongSummary(301)));
    }

    #[test]
    fn counts_characters_not_bytes_against_the_limit() {
        let text = fragment_text("type: fix\narea: reader", &"é".repeat(300));

        assert!(parsed("a.md", &text).is_ok());
    }

    #[test]
    fn rejects_an_em_dash_in_the_summary() {
        let text = fragment_text("type: fix\narea: reader", "The page \u{2014} stays put.");

        assert_eq!(parsed("a.md", &text), Err(Problem::EmDash));
    }

    #[test]
    fn names_the_file_and_the_problem_in_a_violation() {
        let scratch = scratch_repo(&[("a.md", "Just text.\n")]);

        let violations = check(scratch.path()).unwrap();

        assert_eq!(
            violations
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>(),
            [".changes/a.md: the file must start with a --- line"]
        );
    }

    #[test]
    fn passes_a_folder_of_valid_fragments() {
        let scratch = scratch_repo(&[(
            "a.md",
            &fragment_text("type: fix\narea: reader", "The page stays put."),
        )]);

        assert_eq!(check(scratch.path()).unwrap(), []);
    }

    #[test]
    fn reports_every_bad_fragment() {
        let good = fragment_text("type: fix\narea: reader", "Done.");
        let scratch = scratch_repo(&[("a.md", "x"), ("b.md", &good), ("c.txt", &good)]);

        let violations = check(scratch.path()).unwrap();

        assert_eq!(
            violations,
            [
                Violation {
                    file: "a.md".to_owned(),
                    problem: Problem::NoFrontMatter
                },
                Violation {
                    file: "c.txt".to_owned(),
                    problem: Problem::BadName
                },
            ]
        );
    }

    fn mixed_fragments() -> Vec<Fragment> {
        vec![
            valid("fix", "reader", &["octocat"], "The page stays put."),
            valid("feat", "reader", &[], "Pages turn faster."),
            valid(
                "breaking",
                "library",
                &["hubot", "octocat"],
                "Old folders need adding again.",
            ),
            valid("fix", "library", &[], "Scans finish."),
            valid("feat", "library", &["hubot"], "Section tabs on Android."),
        ]
    }

    #[test]
    fn groups_markdown_by_type_in_config_order_with_the_area_in_bold() {
        let markdown = markdown_of(mixed_fragments());

        assert_eq!(
            markdown,
            "\
Section tabs on Android.

## Breaking changes

- **Library:** Old folders need adding again.

## New

- **Library:** Section tabs on Android.
- **Reader:** Pages turn faster.

## Fixed

- **Library:** Scans finish.
- **Reader:** The page stays put.

Contributors: @hubot, @octocat
"
        );
    }

    #[test]
    fn heads_the_markdown_with_the_first_new_entry() {
        let fragments = vec![
            valid("sec", "library", &[], "Archives stay inside."),
            valid("feat", "reader", &[], "Pages turn faster."),
        ];

        let markdown = markdown_of(fragments);

        assert!(
            markdown.starts_with("Pages turn faster.\n\n## Security\n"),
            "{markdown}"
        );
    }

    #[test]
    fn heads_the_markdown_with_the_first_entry_when_nothing_is_new() {
        let fragments = vec![
            valid("fix", "reader", &[], "The page stays put."),
            valid("sec", "library", &[], "Archives stay inside."),
        ];

        let markdown = markdown_of(fragments);

        assert!(
            markdown.starts_with("Archives stay inside.\n\n## Security\n"),
            "{markdown}"
        );
    }

    #[test]
    fn heads_the_markdown_with_the_type_the_config_names() {
        let fix_first: Config = serde_json::from_str(
            &CONFIG_JSON.replace(r#""headline": "feat""#, r#""headline": "fix""#),
        )
        .unwrap();
        let fragments = vec![
            valid("feat", "reader", &[], "Pages turn faster."),
            valid("fix", "library", &[], "Scans finish."),
        ];

        let markdown =
            CreditedNotes::gather(UNRELEASED, fragments, &fix_first).markdown(&fix_first);

        assert!(
            markdown.starts_with("Scans finish.\n\n## New\n"),
            "{markdown}"
        );
    }

    #[test]
    fn refuses_a_headline_that_is_not_a_type() {
        let unknown_headline =
            CONFIG_JSON.replace(r#""headline": "feat""#, r#""headline": "chore""#);

        let error = serde_json::from_str::<Config>(&unknown_headline).unwrap_err();

        assert!(error.to_string().contains("`chore`"), "{error}");
    }

    #[test]
    fn leaves_out_a_type_nobody_used() {
        let markdown = markdown_of(vec![valid("fix", "reader", &[], "Done.")]);

        assert_eq!(markdown, "Done.\n\n## Fixed\n\n- **Reader:** Done.\n");
    }

    #[test]
    fn writes_no_contributors_line_without_credit() {
        let markdown = markdown_of(vec![valid("fix", "reader", &[], "Done.")]);

        assert!(!markdown.contains("Contributors"));
    }

    #[test]
    fn sorts_and_de_duplicates_the_contributors() {
        let fragments = vec![
            valid("fix", "reader", &["zed", "octocat"], "One."),
            valid("fix", "library", &["octocat", "amy"], "Two."),
        ];

        let markdown = markdown_of(fragments);

        assert_eq!(
            markdown.lines().last(),
            Some("Contributors: @amy, @octocat, @zed")
        );
    }

    #[test]
    fn writes_nothing_for_no_fragments() {
        assert_eq!(markdown_of(Vec::new()), "");
    }

    #[test]
    fn writes_json_entries_in_report_order_without_credit() {
        let scratch = scratch_repo(&[
            (
                "a.md",
                &fragment_text(
                    "type: fix\narea: reader\ncredit: [octocat]",
                    "The page stays put.",
                ),
            ),
            (
                "b.md",
                &fragment_text("type: feat\narea: reader", "Pages turn faster."),
            ),
            (
                "c.md",
                &fragment_text(
                    "type: breaking\narea: library\ncredit: [hubot, octocat]",
                    "Old folders need adding again.",
                ),
            ),
            (
                "d.md",
                &fragment_text("type: fix\narea: library", "Scans finish."),
            ),
            (
                "e.md",
                &fragment_text(
                    "type: feat\narea: library\ncredit: [hubot]",
                    "Section tabs on Android.",
                ),
            ),
        ]);

        let json = notes(scratch.path(), None, Format::Json).unwrap();

        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "version": "unreleased",
                "entries": [
                    {"type": "breaking", "area": "library", "summary": "Old folders need adding again."},
                    {"type": "feat", "area": "library", "summary": "Section tabs on Android."},
                    {"type": "feat", "area": "reader", "summary": "Pages turn faster."},
                    {"type": "fix", "area": "library", "summary": "Scans finish."},
                    {"type": "fix", "area": "reader", "summary": "The page stays put."}
                ]
            })
        );
        assert!(!json.contains("octocat"));
    }

    #[test]
    fn assembles_notes_from_the_folder_in_either_format() {
        let scratch = scratch_repo(&[(
            "a.md",
            &fragment_text("type: fix\narea: reader\ncredit: [octocat]", "Done."),
        )]);

        let markdown = notes(scratch.path(), None, Format::Markdown).unwrap();
        let json = notes(scratch.path(), Some("2.0.0-rc.1"), Format::Json).unwrap();

        assert_eq!(
            markdown,
            "Done.\n\n## Fixed\n\n- **Reader:** Done.\n\nContributors: @octocat\n"
        );
        assert!(json.contains("\"version\": \"2.0.0-rc.1\""));
    }

    pub(super) const ARCHIVED_CHANGELOG: &str = "# Changelog\n\n## 1.2.0\n\n## New\n\n- **Reader:** Pages turn faster.\n\n## Fixed\n\n- **Library:** Scans finish.\n\nContributors: @octocat\n";

    pub(super) const ARCHIVED_JSON: &str = r#"{
        "version": "1.2.0",
        "entries": [
            {"type": "feat", "area": "reader", "summary": "Pages turn faster."},
            {"type": "fix", "area": "library", "summary": "Scans finish."}
        ],
        "contributors": ["octocat"]
    }"#;

    pub(super) const EMPTY_ARCHIVE_JSON: &str =
        r#"{"version": "1.2.0", "entries": [], "contributors": []}"#;

    pub(super) fn archive(scratch: &omnileaf_testkit::ScratchFolder, version: &str, json: &str) {
        scratch.write(
            &format!("{FOLDER}/{RELEASED}/{version}.json"),
            json.as_bytes(),
        );
    }

    pub(super) fn notes_in(
        scratch: &omnileaf_testkit::ScratchFolder,
        version: &str,
        format: Format,
    ) -> anyhow::Result<String> {
        notes(scratch.path(), Some(version), format)
    }

    #[test]
    fn takes_the_notes_of_a_pre_release_from_the_fragments() {
        let scratch = scratch_repo(&[(
            "a.md",
            &fragment_text("type: fix\narea: reader", "Not yet out."),
        )]);
        archive(&scratch, "1.2.0", ARCHIVED_JSON);

        let json = notes_in(&scratch, "1.3.0-rc.1", Format::Json).unwrap();

        assert!(json.contains("Not yet out."), "{json}");
        assert!(json.contains("\"version\": \"1.3.0-rc.1\""), "{json}");
    }

    #[test]
    fn refuses_the_notes_of_a_pre_release_without_fragments() {
        let scratch = scratch_repo(&[]);
        archive(&scratch, "1.2.0", ARCHIVED_JSON);

        let error = notes_in(&scratch, "1.3.0-rc.1", Format::Markdown).unwrap_err();

        assert_eq!(
            error.to_string(),
            ".changes has no fragments, so 1.3.0-rc.1 would have no release notes"
        );
    }

    #[test]
    fn writes_empty_unreleased_notes_without_fragments() {
        let scratch = scratch_repo(&[]);

        let markdown = notes(scratch.path(), None, Format::Markdown).unwrap();

        assert_eq!(markdown, "");
    }

    fn rename_the_new_heading(scratch: &omnileaf_testkit::ScratchFolder) {
        scratch.write(
            &format!("{FOLDER}/{CONFIG}"),
            CONFIG_JSON
                .replace(r#""heading": "New""#, r#""heading": "What's new""#)
                .as_bytes(),
        );
    }

    fn changelog_in(scratch: &omnileaf_testkit::ScratchFolder) -> String {
        fs::read_to_string(scratch.path().join(CHANGELOG)).unwrap()
    }

    #[test]
    fn reports_a_released_section_once_the_config_renames_its_heading() {
        let scratch = scratch_repo(&[]);
        archive(&scratch, "1.2.0", ARCHIVED_JSON);
        with_changelog(&scratch, ARCHIVED_CHANGELOG);
        rename_the_new_heading(&scratch);

        let violations = check(scratch.path()).unwrap();

        assert_eq!(
            violations,
            [archive_violation(
                "1.2.0",
                Problem::NotInChangelog("1.2.0".to_owned())
            )]
        );
    }

    #[test]
    fn rewrites_each_released_section_from_its_archive() {
        let scratch = scratch_repo(&[]);
        archive(&scratch, "1.2.0", ARCHIVED_JSON);
        archive(&scratch, "1.1.0", &ARCHIVED_JSON.replace("1.2.0", "1.1.0"));
        with_changelog(
            &scratch,
            &format!(
                "{ARCHIVED_CHANGELOG}\n{}\n## 1.0.0\n\nWritten by hand.\n",
                ARCHIVED_CHANGELOG
                    .trim_start_matches("# Changelog\n\n")
                    .replace("1.2.0", "1.1.0")
            ),
        );
        rename_the_new_heading(&scratch);

        rewrite(scratch.path()).unwrap();

        assert_eq!(
            changelog_in(&scratch),
            "# Changelog\n\n## 1.2.0\n\n## What's new\n\n- **Reader:** Pages turn faster.\n\n## Fixed\n\n- **Library:** Scans finish.\n\nContributors: @octocat\n\n## 1.1.0\n\n## What's new\n\n- **Reader:** Pages turn faster.\n\n## Fixed\n\n- **Library:** Scans finish.\n\nContributors: @octocat\n\n## 1.0.0\n\nWritten by hand.\n"
        );
    }

    #[test]
    fn refuses_to_rewrite_a_version_without_one_changelog_section() {
        let scratch = scratch_repo(&[]);
        archive(&scratch, "1.2.0", ARCHIVED_JSON);
        let changelog = format!("{ARCHIVED_CHANGELOG}\n## 1.2.0\n\nAn older draft.\n");
        with_changelog(&scratch, &changelog);

        let error = rewrite(scratch.path()).unwrap_err();

        assert_eq!(
            error.downcast_ref::<Violation>(),
            Some(&archive_violation(
                "1.2.0",
                Problem::NotInChangelog("1.2.0".to_owned())
            ))
        );
        assert_eq!(changelog_in(&scratch), changelog);
    }

    #[test]
    fn refuses_to_rewrite_from_a_bad_archive() {
        let scratch = scratch_repo(&[]);
        archive(&scratch, "1.2.0", EMPTY_ARCHIVE_JSON);
        with_changelog(&scratch, ARCHIVED_CHANGELOG);

        let error = rewrite(scratch.path()).unwrap_err();

        assert_eq!(
            error.downcast_ref::<Violation>(),
            Some(&archive_violation("1.2.0", Problem::NoEntries))
        );
        assert_eq!(changelog_in(&scratch), ARCHIVED_CHANGELOG);
    }

    #[test]
    fn records_the_version_as_unreleased_when_none_is_given() {
        let scratch = scratch_repo(&[]);

        let json = notes(scratch.path(), None, Format::Json).unwrap();

        assert!(json.contains("\"version\": \"unreleased\""));
    }

    #[test]
    fn refuses_to_assemble_notes_from_a_bad_fragment() {
        let scratch = scratch_repo(&[("a.md", "x")]);

        let error = notes(scratch.path(), None, Format::Markdown).unwrap_err();

        assert!(error.to_string().contains(".changes/a.md"), "{error}");
    }

    pub(super) fn with_changelog(scratch: &omnileaf_testkit::ScratchFolder, text: &str) {
        scratch.write(CHANGELOG, text.as_bytes());
    }

    fn released_file(scratch: &omnileaf_testkit::ScratchFolder, version: &str) -> PathBuf {
        scratch
            .path()
            .join(FOLDER)
            .join(RELEASED)
            .join(format!("{version}.json"))
    }

    #[test]
    fn archives_the_release_notes_and_removes_the_fragments_it_used() {
        let scratch = scratch_repo(&[
            (
                "a.md",
                &fragment_text(
                    "type: fix\narea: reader\ncredit: [octocat]",
                    "The page stays put.",
                ),
            ),
            (
                "b.md",
                &fragment_text("type: feat\narea: library", "Section tabs."),
            ),
        ]);

        release(scratch.path(), "1.2.0").unwrap();

        let archive = fs::read_to_string(released_file(&scratch, "1.2.0")).unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&archive).unwrap(),
            serde_json::json!({
                "version": "1.2.0",
                "entries": [
                    {"type": "feat", "area": "library", "summary": "Section tabs."},
                    {"type": "fix", "area": "reader", "summary": "The page stays put."}
                ],
                "contributors": ["octocat"]
            })
        );
        let folder = scratch.path().join(FOLDER);
        assert!(!folder.join("a.md").exists());
        assert!(!folder.join("b.md").exists());
        assert!(folder.join(CONFIG).exists());
        assert!(folder.join(README).exists());
    }

    #[test]
    fn keeps_the_contributors_of_a_released_version_in_its_notes() {
        let scratch = scratch_repo(&[(
            "a.md",
            &fragment_text("type: fix\narea: reader\ncredit: [octocat]", "Done."),
        )]);
        release(scratch.path(), "1.2.0").unwrap();

        let markdown = notes_in(&scratch, "1.2.0", Format::Markdown).unwrap();
        let json = notes_in(&scratch, "1.2.0", Format::Json).unwrap();

        assert_eq!(
            markdown,
            "Done.\n\n## Fixed\n\n- **Reader:** Done.\n\nContributors: @octocat\n"
        );
        assert!(!json.contains("octocat"), "{json}");
    }

    #[test]
    fn puts_the_release_section_above_the_latest_release_in_the_changelog() {
        let scratch = scratch_repo(&[(
            "a.md",
            &fragment_text("type: fix\narea: reader", "The page stays put."),
        )]);
        with_changelog(
            &scratch,
            "# Changelog\n\nWhat changed.\n\n## 1.1.0\n\nOlder.\n",
        );

        release(scratch.path(), "1.2.0").unwrap();

        assert_eq!(
            fs::read_to_string(scratch.path().join(CHANGELOG)).unwrap(),
            "# Changelog\n\nWhat changed.\n\n## 1.2.0\n\n## Fixed\n\n- **Reader:** The page stays put.\n\n## 1.1.0\n\nOlder.\n"
        );
    }

    #[test]
    fn skips_a_section_marker_inside_an_introduction_line() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);
        with_changelog(
            &scratch,
            "# Changelog\n\nEach release has a `## ` heading.\n\n## 1.1.0\n\nOlder.\n",
        );

        release(scratch.path(), "1.2.0").unwrap();

        assert_eq!(
            fs::read_to_string(scratch.path().join(CHANGELOG)).unwrap(),
            "# Changelog\n\nEach release has a `## ` heading.\n\n## 1.2.0\n\n## Fixed\n\n- **Reader:** Done.\n\n## 1.1.0\n\nOlder.\n"
        );
    }

    #[test]
    fn puts_the_release_section_first_in_a_changelog_that_starts_with_a_section() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);
        with_changelog(&scratch, "## 1.1.0\n\nOlder.\n");

        release(scratch.path(), "1.2.0").unwrap();

        assert_eq!(
            fs::read_to_string(scratch.path().join(CHANGELOG)).unwrap(),
            "## 1.2.0\n\n## Fixed\n\n- **Reader:** Done.\n\n## 1.1.0\n\nOlder.\n"
        );
    }

    #[test]
    fn adds_the_first_release_section_below_the_changelog_introduction() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);
        with_changelog(&scratch, "# Changelog\n\nWhat changed.\n");

        release(scratch.path(), "1.0.0").unwrap();

        assert_eq!(
            fs::read_to_string(scratch.path().join(CHANGELOG)).unwrap(),
            "# Changelog\n\nWhat changed.\n\n## 1.0.0\n\n## Fixed\n\n- **Reader:** Done.\n"
        );
    }

    #[test]
    fn leaves_everything_as_it_was_when_the_changelog_is_missing() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);
        fs::remove_file(scratch.path().join(CHANGELOG)).unwrap();

        let error = release(scratch.path(), "1.2.0").unwrap_err();

        assert!(error.to_string().contains(CHANGELOG), "{error}");
        assert!(!released_file(&scratch, "1.2.0").exists());
        assert!(scratch.path().join(FOLDER).join("a.md").exists());
    }

    #[test]
    fn says_how_to_restore_a_release_that_stops_half_way() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);
        let release = plan_release(
            &read_folder(scratch.path()).unwrap(),
            "1.2.0",
            "# Changelog\n",
        )
        .unwrap();
        fs::remove_file(scratch.path().join(FOLDER).join("a.md")).unwrap();

        let error = write_release(scratch.path(), &release).unwrap_err();

        assert!(released_file(&scratch, "1.2.0").exists());
        assert_eq!(
            error.to_string(),
            "1.2.0 is half released: put it back with `git restore CHANGELOG.md .changes` and remove .changes/released/1.2.0.json, then release it again"
        );
    }

    #[test]
    fn refuses_to_release_a_version_already_archived() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);
        archive(&scratch, "1.2.0", ARCHIVED_JSON);

        let error = release(scratch.path(), "1.2.0").unwrap_err();

        assert!(error.to_string().contains("already released"), "{error}");
        assert!(scratch.path().join(FOLDER).join("a.md").exists());
    }

    #[test]
    fn refuses_to_release_a_version_the_changelog_already_has_a_section_for() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);

        for heading in ["## 0.1.0 (unreleased)", "## 0.1.0"] {
            let changelog = format!(
                "# Changelog\n\nWhat changed.\n\n{heading}\n\nThe first release.\n\n## Security\n\n- **Platform:** Archives stay inside.\n"
            );
            with_changelog(&scratch, &changelog);

            let error = release(scratch.path(), "0.1.0").unwrap_err();

            assert_eq!(
                error.to_string(),
                format!(
                    "CHANGELOG.md already has a section for 0.1.0; remove `{heading}` and its notes, then release 0.1.0 again"
                )
            );
            assert_eq!(
                fs::read_to_string(scratch.path().join(CHANGELOG)).unwrap(),
                changelog
            );
            assert!(!released_file(&scratch, "0.1.0").exists());
        }
    }

    #[test]
    fn releases_a_version_whose_pre_release_has_a_changelog_section() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);
        with_changelog(&scratch, "# Changelog\n\n## 0.1.0-rc.1\n\nTried out.\n");

        release(scratch.path(), "0.1.0").unwrap();

        assert!(released_file(&scratch, "0.1.0").exists());
    }

    #[test]
    fn refuses_to_release_while_a_fragment_is_invalid() {
        let scratch = scratch_repo(&[
            ("a.md", &fragment_text("type: fix\narea: reader", "Done.")),
            ("b.md", "x"),
        ]);

        let error = release(scratch.path(), "1.2.0").unwrap_err();

        assert!(error.to_string().contains(".changes/b.md"), "{error}");
        assert!(!released_file(&scratch, "1.2.0").exists());
    }

    #[test]
    fn refuses_to_release_without_fragments() {
        let scratch = scratch_repo(&[]);

        let error = release(scratch.path(), "1.2.0").unwrap_err();

        assert!(error.to_string().contains("no fragments"), "{error}");
        assert!(!released_file(&scratch, "1.2.0").exists());
    }

    #[test]
    fn refuses_to_archive_a_pre_release_or_a_version_that_is_not_semver() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);

        let pre_release = release(scratch.path(), "1.2.0-rc.1").unwrap_err();
        let not_semver = release(scratch.path(), "../1.2.0").unwrap_err();

        assert!(
            pre_release.to_string().contains("pre-release"),
            "{pre_release}"
        );
        assert!(
            not_semver.to_string().contains("not a version"),
            "{not_semver}"
        );
    }

    #[test]
    fn needs_a_fragment_for_each_user_facing_path() {
        for path in [
            "app/src/lib/library/add-folder.ts",
            "app/src/routes/+page.svelte",
            "app/src-tauri/src/lib.rs",
            "app/messages/en.json",
            "crates/omnileaf-engine/src/lib.rs",
            "crates/omnileaf-folder-access/android/src/main/Folder.kt",
            "crates/omnileaf-system-bars/android/build.gradle.kts",
        ] {
            let missing = require(&paths(&[path]), false);

            assert_eq!(
                missing,
                Err(MissingFragment {
                    touched: paths(&[path])
                }),
                "{path}"
            );
        }
    }

    #[test]
    fn passes_with_a_fragment_beside_the_change() {
        let changed = paths(&["app/src/lib/a.ts", ".changes/android-section-tabs.md"]);

        assert_eq!(require(&changed, false), Ok(()));
    }

    #[test]
    fn does_not_count_the_readme_or_the_config_as_a_fragment() {
        for file in [".changes/README.md", ".changes/config.json"] {
            let changed = paths(&["app/src/lib/a.ts", file]);

            assert!(require(&changed, false).is_err(), "{file}");
        }
    }

    #[test]
    fn does_not_count_a_released_archive_as_a_fragment() {
        let changed = paths(&["app/src/lib/a.ts", ".changes/released/1.2.0.json"]);

        assert!(require(&changed, false).is_err());
    }

    #[test]
    fn does_not_check_the_released_folder_as_a_fragment() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);
        with_changelog(&scratch, ARCHIVED_CHANGELOG);
        archive(&scratch, "1.2.0", ARCHIVED_JSON);

        let violations = check(scratch.path()).unwrap();

        assert_eq!(violations, []);
    }

    #[test]
    fn leaves_the_released_folder_out_of_the_unreleased_notes() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);
        archive(&scratch, "1.2.0", ARCHIVED_JSON);

        let json = notes(scratch.path(), None, Format::Json).unwrap();

        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&json).unwrap(),
            serde_json::json!({
                "version": "unreleased",
                "entries": [{"type": "fix", "area": "reader", "summary": "Done."}]
            })
        );
    }

    #[test]
    fn passes_for_changes_nobody_sees() {
        let changed = paths(&[
            "docs/code-standards.md",
            "README.md",
            "CONTRIBUTING.md",
            ".github/workflows/ci.yml",
            "Cargo.lock",
            "pnpm-lock.yaml",
            "xtask/src/main.rs",
            "site/src/routes/+page.svelte",
            "crates/omnileaf-db/tests/projections.rs",
            "crates/omnileaf-db/migrations/0001.sql",
            "app/src/lib/about/CopyVersionButton.test.ts",
            "app/src/lib/a.spec.ts",
            "app/tests/library.ts",
        ]);

        assert_eq!(require(&changed, false), Ok(()));
    }

    #[test]
    fn passes_with_the_skip_flag() {
        let changed = paths(&["app/src/lib/a.ts"]);

        assert_eq!(require(&changed, true), Ok(()));
    }

    #[test]
    fn passes_when_nothing_changed() {
        assert_eq!(require(&[], false), Ok(()));
    }

    #[test]
    fn lists_only_the_first_few_user_facing_paths_when_it_fails() {
        let many: Vec<String> = (0..7)
            .map(|number| format!("app/src/a{number}.ts"))
            .collect();

        let message = require(&many, false).unwrap_err().to_string();

        assert!(message.contains("app/src/a4.ts"));
        assert!(!message.contains("app/src/a5.ts"));
        assert!(message.contains("and 2 more"));
        assert!(message.contains("no-changelog"));
    }
}
