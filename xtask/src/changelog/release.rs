use std::{
    collections::HashSet,
    fmt, fs, io,
    ops::Range,
    path::{Path, PathBuf},
};

use anyhow::Context;

use super::{
    CHANGELOG, Config, CreditedNotes, ENTRY_AREA_END, ENTRY_MARK, FOLDER, Folder, Problem,
    SECTION_HEADING, Violation,
    archive::{archive_violation, shown_archive_path},
    read_folder,
    version::{Version, is_version, parse_version},
};
use crate::json;

impl CreditedNotes {
    fn changelog_section(&self, config: &Config) -> String {
        format!(
            "{SECTION_HEADING}{}\n\n{}",
            self.notes.version,
            self.sections(config).join("\n\n")
        )
    }

    pub(super) fn matches_its_changelog_section(&self, changelog: &str, config: &Config) -> bool {
        version_section(changelog, &self.notes.version, config)
            .is_some_and(|section| changelog[section] == self.changelog_section(config))
    }

    fn rewrite_its_changelog_section(
        &self,
        changelog: &str,
        config: &Config,
    ) -> Result<String, Violation> {
        let version = &self.notes.version;
        let section = version_section(changelog, version, config)
            .ok_or_else(|| archive_violation(version, Problem::NotInChangelog(version.clone())))?;
        Ok(format!(
            "{}{}{}",
            &changelog[..section.start],
            self.changelog_section(config),
            &changelog[section.end..]
        ))
    }
}

struct Release {
    version: String,
    archive_path: PathBuf,
    archive: String,
    changelog: String,
    used: Vec<PathBuf>,
}

fn insert_above_the_latest_release(changelog: &str, section: &str) -> String {
    let latest_release = lines_with_offsets(changelog)
        .find(|(_, line)| is_release_heading(line))
        .map(|(at, _)| at);
    match latest_release {
        Some(at) => format!("{}{section}\n\n{}", &changelog[..at], &changelog[at..]),
        None => format!("{}\n\n{section}\n", changelog.trim_end()),
    }
}

fn lines_with_offsets(text: &str) -> impl Iterator<Item = (usize, &str)> {
    text.split_inclusive('\n').scan(0, |offset, line| {
        let at = *offset;
        *offset += line.len();
        Some((at, line.trim_end()))
    })
}

fn release_heading_version(line: &str) -> Option<&str> {
    line.strip_prefix(SECTION_HEADING)
        .and_then(|rest| rest.split(' ').next())
        .filter(|word| is_version(word))
}

fn is_heading_of(line: &str, version: &str) -> bool {
    release_heading_version(line) == Some(version)
}

fn is_release_heading(line: &str) -> bool {
    release_heading_version(line).is_some()
}

fn version_heading<'a>(changelog: &'a str, version: &str) -> Option<&'a str> {
    lines_with_offsets(changelog)
        .map(|(_, line)| line)
        .find(|line| is_heading_of(line, version))
}

fn opens_an_entry_list(lines_below: &[(usize, &str)]) -> bool {
    lines_below
        .iter()
        .map(|(_, line)| line)
        .find(|line| !line.is_empty())
        .is_some_and(|line| line.starts_with(ENTRY_MARK))
}

fn ends_a_release_section(line: &str, lines_below: &[(usize, &str)], config: &Config) -> bool {
    if is_release_heading(line) {
        return true;
    }
    line.strip_prefix(SECTION_HEADING).is_some_and(|heading| {
        !config.has_type_heading(heading) && !opens_an_entry_list(lines_below)
    })
}

fn section_end(changelog: &str, start: usize, config: &Config) -> usize {
    let lines: Vec<(usize, &str)> = lines_with_offsets(changelog).collect();
    let mut rest = lines.as_slice();
    while let Some((&(at, line), lines_below)) = rest.split_first() {
        if at > start && ends_a_release_section(line, lines_below, config) {
            return at;
        }
        rest = lines_below;
    }
    changelog.len()
}

fn version_section(changelog: &str, version: &str, config: &Config) -> Option<Range<usize>> {
    let mut starts = lines_with_offsets(changelog)
        .filter(|(_, line)| is_heading_of(line, version))
        .map(|(at, _)| at);
    let start = starts.next()?;
    if starts.next().is_some() {
        return None;
    }
    let end = section_end(changelog, start, config);
    let text = changelog[start..end].trim_end_matches('\n');
    Some(start..start + text.len())
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
        changelog: insert_above_the_latest_release(changelog, &section),
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
    write_changelog(root, &release.changelog)?;
    for path in &release.used {
        fs::remove_file(path).with_context(|| format!("remove {}", path.display()))?;
    }
    Ok(())
}

pub(super) fn read_changelog(root: &Path) -> anyhow::Result<String> {
    let path = root.join(CHANGELOG);
    fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))
}

fn write_changelog(root: &Path, text: &str) -> anyhow::Result<()> {
    let path = root.join(CHANGELOG);
    fs::write(&path, text).with_context(|| format!("write {}", path.display()))
}

pub(crate) fn release(root: &Path, version: &str) -> anyhow::Result<()> {
    let folder = read_folder(root)?;
    let changelog = read_changelog(root)?;
    let release = plan_release(&folder, version, &changelog)?;
    write_release(root, &release)
}

#[derive(Debug, PartialEq, Eq)]
struct DroppedHeading {
    line_number: usize,
    line: String,
}

impl fmt::Display for DroppedHeading {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "rewriting {CHANGELOG} would drop line {}, `{}`, which reads as part of the released section above it; nothing was written",
            self.line_number, self.line
        )
    }
}

impl std::error::Error for DroppedHeading {}

fn entry_summary(line: &str) -> Option<&str> {
    line.strip_prefix(ENTRY_MARK)?
        .split_once(ENTRY_AREA_END)
        .map(|(_, summary)| summary)
}

fn heads_archived_entries(lines_below: &[&str], archived_summaries: &HashSet<&str>) -> bool {
    let mut entries = lines_below
        .iter()
        .skip_while(|line| line.is_empty())
        .take_while(|line| line.starts_with(ENTRY_MARK))
        .peekable();
    entries.peek().is_some()
        && entries.all(|line| {
            entry_summary(line).is_some_and(|summary| archived_summaries.contains(summary))
        })
}

fn headings_not_rendered_from_an_archive<'a>(
    changelog: &'a str,
    archived_summaries: &HashSet<&str>,
) -> Vec<(usize, &'a str)> {
    let lines: Vec<&str> = changelog.lines().map(str::trim_end).collect();
    let mut headings = Vec::new();
    let mut rest = lines.as_slice();
    let mut line_number = 0;
    while let Some((&line, lines_below)) = rest.split_first() {
        line_number += 1;
        if line.starts_with(SECTION_HEADING)
            && !heads_archived_entries(lines_below, archived_summaries)
        {
            headings.push((line_number, line));
        }
        rest = lines_below;
    }
    headings
}

fn ensure_every_heading_kept(
    before: &str,
    after: &str,
    archived_summaries: &HashSet<&str>,
) -> Result<(), DroppedHeading> {
    let mut kept: Vec<&str> = headings_not_rendered_from_an_archive(after, archived_summaries)
        .into_iter()
        .map(|(_, line)| line)
        .collect();
    for (line_number, line) in headings_not_rendered_from_an_archive(before, archived_summaries) {
        let Some(at) = kept.iter().position(|heading| *heading == line) else {
            return Err(DroppedHeading {
                line_number,
                line: line.to_owned(),
            });
        };
        kept.remove(at);
    }
    Ok(())
}

pub(crate) fn rewrite(root: &Path) -> anyhow::Result<()> {
    let folder = read_folder(root)?;
    let before = read_changelog(root)?;
    let archived = folder
        .archived_versions()?
        .iter()
        .map(|version| folder.archived_notes(version))
        .collect::<anyhow::Result<Vec<_>>>()?;
    let mut changelog = before.clone();
    for notes in &archived {
        changelog = notes.rewrite_its_changelog_section(&changelog, &folder.config)?;
    }
    let archived_summaries = archived
        .iter()
        .flat_map(|notes| &notes.notes.entries)
        .map(|entry| entry.summary.as_str())
        .collect();
    ensure_every_heading_kept(&before, &changelog, &archived_summaries)?;
    write_changelog(root, &changelog)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::changelog::{
        CONFIG, Format, README, RELEASED,
        archive::archive_name,
        check,
        tests::{
            ARCHIVED_CHANGELOG, ARCHIVED_JSON, CONFIG_JSON, EMPTY_ARCHIVE_JSON, archive,
            fragment_text, notes_in, scratch_repo, with_changelog,
        },
    };

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
    fn names_the_config_and_the_rewrite_step_when_a_changelog_section_differs() {
        let violation = archive_violation("1.2.0", Problem::NotInChangelog("1.2.0".to_owned()));

        let message = violation.to_string();

        assert_eq!(
            message,
            ".changes/released/1.2.0.json: CHANGELOG.md needs exactly one `## 1.2.0` section that matches the archive as .changes/config.json renders it; once it has one, `cargo xtask changes changelog` rewrites it from the archive"
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
    fn rewrites_a_released_section_and_keeps_the_heading_below_it() {
        let scratch = scratch_repo(&[]);
        archive(&scratch, "1.2.0", ARCHIVED_JSON);
        with_changelog(
            &scratch,
            &format!("{ARCHIVED_CHANGELOG}\n## Older releases\n\nSee the git history.\n"),
        );
        rename_the_new_heading(&scratch);

        rewrite(scratch.path()).unwrap();

        assert_eq!(
            changelog_in(&scratch),
            "# Changelog\n\n## 1.2.0\n\n## What's new\n\n- **Reader:** Pages turn faster.\n\n## Fixed\n\n- **Library:** Scans finish.\n\nContributors: @octocat\n\n## Older releases\n\nSee the git history.\n"
        );
    }

    #[test]
    fn rewrites_a_released_section_once_the_config_renames_both_its_type_and_area() {
        let scratch = scratch_repo(&[]);
        archive(&scratch, "1.2.0", ARCHIVED_JSON);
        with_changelog(&scratch, ARCHIVED_CHANGELOG);
        scratch.write(
            &format!("{FOLDER}/{CONFIG}"),
            CONFIG_JSON
                .replace(r#""heading": "New""#, r#""heading": "What's new""#)
                .replace(r#""heading": "Reader""#, r#""heading": "Reading""#)
                .as_bytes(),
        );

        rewrite(scratch.path()).unwrap();

        assert_eq!(
            changelog_in(&scratch),
            "# Changelog\n\n## 1.2.0\n\n## What's new\n\n- **Reading:** Pages turn faster.\n\n## Fixed\n\n- **Library:** Scans finish.\n\nContributors: @octocat\n"
        );
    }

    #[test]
    fn refuses_to_rewrite_over_a_heading_with_entries_below_the_last_release() {
        let scratch = scratch_repo(&[]);
        archive(&scratch, "1.2.0", ARCHIVED_JSON);
        let changelog = format!(
            "{ARCHIVED_CHANGELOG}\n## Older releases\n\n- **Library:** Folders open again.\n"
        );
        with_changelog(&scratch, &changelog);

        let error = rewrite(scratch.path()).unwrap_err();

        assert_eq!(
            error.downcast_ref::<DroppedHeading>(),
            Some(&DroppedHeading {
                line_number: 15,
                line: "## Older releases".to_owned(),
            })
        );
        assert_eq!(
            error.to_string(),
            "rewriting CHANGELOG.md would drop line 15, `## Older releases`, which reads as part of the released section above it; nothing was written"
        );
        assert_eq!(changelog_in(&scratch), changelog);
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
    fn refuses_to_rewrite_from_an_archive_not_named_for_a_release() {
        let scratch = scratch_repo(&[]);
        archive(
            &scratch,
            "v1.2.0",
            &ARCHIVED_JSON.replace("1.2.0", "v1.2.0"),
        );
        with_changelog(&scratch, ARCHIVED_CHANGELOG);

        let error = rewrite(scratch.path()).unwrap_err();

        assert_eq!(
            error.downcast_ref::<Violation>(),
            Some(&archive_violation("v1.2.0", Problem::NotAReleaseName))
        );
        assert_eq!(changelog_in(&scratch), ARCHIVED_CHANGELOG);
    }

    fn released_file(scratch: &omnileaf_testkit::ScratchFolder, version: &str) -> PathBuf {
        scratch
            .path()
            .join(FOLDER)
            .join(RELEASED)
            .join(archive_name(version))
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
            changelog_in(&scratch),
            "# Changelog\n\nWhat changed.\n\n## 1.2.0\n\n## Fixed\n\n- **Reader:** The page stays put.\n\n## 1.1.0\n\nOlder.\n"
        );
    }

    #[test]
    fn releases_above_the_latest_release_and_keeps_the_heading_below_the_last_one() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);
        archive(&scratch, "1.1.0", &ARCHIVED_JSON.replace("1.2.0", "1.1.0"));
        let older = "## Older releases\n\nSee the git history.\n";
        with_changelog(
            &scratch,
            &format!("{}\n{older}", ARCHIVED_CHANGELOG.replace("1.2.0", "1.1.0")),
        );

        release(scratch.path(), "1.2.0").unwrap();

        assert_eq!(
            changelog_in(&scratch),
            format!(
                "# Changelog\n\n## 1.2.0\n\n## Fixed\n\n- **Reader:** Done.\n\n{}\n{older}",
                ARCHIVED_CHANGELOG
                    .trim_start_matches("# Changelog\n\n")
                    .replace("1.2.0", "1.1.0")
            )
        );
        assert_eq!(check(scratch.path()).unwrap(), []);
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
            changelog_in(&scratch),
            "# Changelog\n\nEach release has a `## ` heading.\n\n## 1.2.0\n\n## Fixed\n\n- **Reader:** Done.\n\n## 1.1.0\n\nOlder.\n"
        );
    }

    #[test]
    fn keeps_an_introduction_heading_above_the_releases_and_passes_the_check() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);
        with_changelog(
            &scratch,
            "# Changelog\n\n## About this file\n\nSome text.\n",
        );

        release(scratch.path(), "1.0.0").unwrap();

        assert_eq!(
            changelog_in(&scratch),
            "# Changelog\n\n## About this file\n\nSome text.\n\n## 1.0.0\n\n## Fixed\n\n- **Reader:** Done.\n"
        );
        assert_eq!(check(scratch.path()).unwrap(), []);
    }

    #[test]
    fn puts_the_release_section_first_in_a_changelog_that_starts_with_a_section() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);
        with_changelog(&scratch, "## 1.1.0\n\nOlder.\n");

        release(scratch.path(), "1.2.0").unwrap();

        assert_eq!(
            changelog_in(&scratch),
            "## 1.2.0\n\n## Fixed\n\n- **Reader:** Done.\n\n## 1.1.0\n\nOlder.\n"
        );
    }

    #[test]
    fn adds_the_first_release_section_below_the_changelog_introduction() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);
        with_changelog(&scratch, "# Changelog\n\nWhat changed.\n");

        release(scratch.path(), "1.0.0").unwrap();

        assert_eq!(
            changelog_in(&scratch),
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
            assert_eq!(changelog_in(&scratch), changelog);
            assert!(!released_file(&scratch, "0.1.0").exists());
        }
    }

    #[test]
    fn releases_a_version_whose_pre_release_has_a_changelog_section() {
        let scratch = scratch_repo(&[("a.md", &fragment_text("type: fix\narea: reader", "Done."))]);
        with_changelog(&scratch, "# Changelog\n\n## 0.1.0-rc.1\n\nTried out.\n");

        release(scratch.path(), "0.1.0").unwrap();

        assert!(released_file(&scratch, "0.1.0").exists());
        assert_eq!(
            changelog_in(&scratch),
            "# Changelog\n\n## 0.1.0\n\n## Fixed\n\n- **Reader:** Done.\n\n## 0.1.0-rc.1\n\nTried out.\n"
        );
        assert_eq!(check(scratch.path()).unwrap(), []);
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
}
