use std::{fmt, fs, io, path::Path};

use anyhow::Context;
use serde::{Deserialize, Serialize};

use crate::pre_push::{changed_files, git};

pub(crate) const FOLDER: &str = ".changes";
const CONFIG: &str = "config.json";
const README: &str = "README.md";
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

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct Config {
    types: Vec<Heading>,
    areas: Vec<Heading>,
}

impl Config {
    fn type_position(&self, id: &str) -> Option<usize> {
        self.types.iter().position(|kind| kind.id == id)
    }

    fn area_position(&self, id: &str) -> Option<usize> {
        self.areas.iter().position(|area| area.id == id)
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
            Self::EmptySummary => write!(formatter, "the summary below the front matter is empty"),
            Self::LongSummary(length) => write!(
                formatter,
                "the summary is {length} characters; keep it to {MAX_SUMMARY_CHARACTERS}"
            ),
            Self::EmDash => write!(
                formatter,
                "the summary holds an em-dash; use a comma or a full stop"
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
            return Ok((
                front_matter,
                summary.split_whitespace().collect::<Vec<_>>().join(" "),
            ));
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
    if config.type_position(kind).is_none() {
        return Err(Problem::UnknownType(kind.to_owned()));
    }
    let area = keys.area.ok_or(Problem::Missing("area"))?;
    if config.area_position(area).is_none() {
        return Err(Problem::UnknownArea(area.to_owned()));
    }
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
    if summary.is_empty() {
        return Err(Problem::EmptySummary);
    }
    let length = summary.chars().count();
    if length > MAX_SUMMARY_CHARACTERS {
        return Err(Problem::LongSummary(length));
    }
    if summary.contains('\u{2014}') {
        return Err(Problem::EmDash);
    }
    Ok(Fragment {
        kind: kind.to_owned(),
        area: area.to_owned(),
        credit,
        summary,
    })
}

pub(crate) struct Folder {
    config: Config,
    files: Vec<(String, String)>,
}

pub(crate) fn read_folder(root: &Path) -> anyhow::Result<Folder> {
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
        if name == CONFIG || name == README {
            continue;
        }
        let text = fs::read_to_string(&path).or_else(|error| match error.kind() {
            io::ErrorKind::InvalidData => Ok(String::new()),
            _ => Err(error),
        })?;
        files.push((name, text));
    }
    files.sort();
    Ok(Folder { config, files })
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

pub(crate) fn check(folder: &Folder) -> Vec<Violation> {
    read_fragments(folder).1
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

fn contributors(fragments: &[Fragment]) -> Vec<&str> {
    let mut logins: Vec<&str> = fragments
        .iter()
        .flat_map(|fragment| fragment.credit.iter().map(String::as_str))
        .collect();
    logins.sort_unstable();
    logins.dedup();
    logins
}

pub(crate) fn render_markdown(fragments: Vec<Fragment>, config: &Config) -> String {
    let fragments = in_report_order(fragments, config);
    let mut sections = Vec::new();
    for kind in &config.types {
        let lines: Vec<String> = fragments
            .iter()
            .filter(|fragment| fragment.kind == kind.id)
            .map(|fragment| {
                format!(
                    "- **{}:** {}",
                    heading_of(&config.areas, &fragment.area),
                    fragment.summary
                )
            })
            .collect();
        if !lines.is_empty() {
            sections.push(format!("## {}\n\n{}", kind.heading, lines.join("\n")));
        }
    }
    let credited = contributors(&fragments);
    if !credited.is_empty() {
        let handles: Vec<String> = credited.iter().map(|login| format!("@{login}")).collect();
        sections.push(format!("Contributors: {}", handles.join(", ")));
    }
    if sections.is_empty() {
        String::new()
    } else {
        sections.join("\n\n") + "\n"
    }
}

#[derive(Serialize)]
struct Entry<'a> {
    #[serde(rename = "type")]
    kind: &'a str,
    area: &'a str,
    summary: &'a str,
}

#[derive(Serialize)]
struct Notes<'a> {
    version: &'a str,
    entries: Vec<Entry<'a>>,
}

pub(crate) fn render_json(
    version: &str,
    fragments: Vec<Fragment>,
    config: &Config,
) -> serde_json::Result<String> {
    let fragments = in_report_order(fragments, config);
    let notes = Notes {
        version,
        entries: fragments
            .iter()
            .map(|fragment| Entry {
                kind: &fragment.kind,
                area: &fragment.area,
                summary: &fragment.summary,
            })
            .collect(),
    };
    serde_json::to_string_pretty(&notes).map(|json| json + "\n")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, clap::ValueEnum)]
pub(crate) enum Format {
    Markdown,
    Json,
}

pub(crate) fn notes(
    folder: &Folder,
    version: Option<&str>,
    format: Format,
) -> anyhow::Result<String> {
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
    match format {
        Format::Markdown => Ok(render_markdown(fragments, &folder.config)),
        Format::Json => Ok(render_json(
            version.unwrap_or(UNRELEASED),
            fragments,
            &folder.config,
        )?),
    }
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
        .is_some_and(|name| name != README && name != CONFIG && !name.is_empty())
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

    fn fragment_text(front_matter: &str, summary: &str) -> String {
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

    fn folder(files: &[(&str, &str)]) -> Folder {
        Folder {
            config: config(),
            files: files
                .iter()
                .map(|(name, text)| ((*name).to_owned(), (*text).to_owned()))
                .collect(),
        }
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
        let folder = folder(&[("a.md", "Just text.\n")]);

        let violations = check(&folder);

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
        let folder = folder(&[(
            "a.md",
            &fragment_text("type: fix\narea: reader", "The page stays put."),
        )]);

        assert_eq!(check(&folder), []);
    }

    #[test]
    fn reports_every_bad_fragment() {
        let good = fragment_text("type: fix\narea: reader", "Done.");
        let folder = folder(&[("a.md", "x"), ("b.md", &good), ("c.txt", &good)]);

        let violations = check(&folder);

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

    fn release() -> Vec<Fragment> {
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
        let markdown = render_markdown(release(), &config());

        assert_eq!(
            markdown,
            "\
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
    fn leaves_out_a_type_nobody_used() {
        let markdown = render_markdown(vec![valid("fix", "reader", &[], "Done.")], &config());

        assert_eq!(markdown, "## Fixed\n\n- **Reader:** Done.\n");
    }

    #[test]
    fn writes_no_contributors_line_without_credit() {
        let markdown = render_markdown(vec![valid("fix", "reader", &[], "Done.")], &config());

        assert!(!markdown.contains("Contributors"));
    }

    #[test]
    fn sorts_and_de_duplicates_the_contributors() {
        let fragments = vec![
            valid("fix", "reader", &["zed", "octocat"], "One."),
            valid("fix", "library", &["octocat", "amy"], "Two."),
        ];

        let markdown = render_markdown(fragments, &config());

        assert_eq!(
            markdown.lines().last(),
            Some("Contributors: @amy, @octocat, @zed")
        );
    }

    #[test]
    fn writes_nothing_for_no_fragments() {
        assert_eq!(render_markdown(Vec::new(), &config()), "");
    }

    #[test]
    fn writes_json_entries_in_report_order_without_credit() {
        let json = render_json("1.2.0", release(), &config()).unwrap();

        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "version": "1.2.0",
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
        let folder = folder(&[(
            "a.md",
            &fragment_text("type: fix\narea: reader\ncredit: [octocat]", "Done."),
        )]);

        let markdown = notes(&folder, None, Format::Markdown).unwrap();
        let json = notes(&folder, Some("2.0.0"), Format::Json).unwrap();

        assert_eq!(
            markdown,
            "## Fixed\n\n- **Reader:** Done.\n\nContributors: @octocat\n"
        );
        assert!(json.contains("\"version\": \"2.0.0\""));
    }

    #[test]
    fn records_the_version_as_unreleased_when_none_is_given() {
        let json = notes(&folder(&[]), None, Format::Json).unwrap();

        assert!(json.contains("\"version\": \"unreleased\""));
    }

    #[test]
    fn refuses_to_assemble_notes_from_a_bad_fragment() {
        let folder = folder(&[("a.md", "x")]);

        let error = notes(&folder, None, Format::Markdown).unwrap_err();

        assert!(error.to_string().contains(".changes/a.md"), "{error}");
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
