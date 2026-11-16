use std::{fs, io, path::PathBuf};

use anyhow::Context;

use super::{
    Config, CreditedNotes, FOLDER, Folder, Problem, RELEASED, Violation, check_summary, file_name,
    is_github_login, version::is_full_version,
};
use crate::files;

const ARCHIVE_EXTENSION: &str = ".json";

impl Folder {
    fn released(&self) -> PathBuf {
        self.path.join(RELEASED)
    }

    pub(super) fn archive_path(&self, version: &str) -> PathBuf {
        self.released().join(archive_name(version))
    }

    pub(super) fn archived_notes(&self, version: &str) -> anyhow::Result<CreditedNotes> {
        Ok(self
            .load_archive(version)?
            .map_err(|problem| archive_violation(version, problem))?)
    }

    fn load_archive(&self, version: &str) -> anyhow::Result<Result<CreditedNotes, Problem>> {
        let name = archive_name(version);
        let shown = format!("{FOLDER}/{RELEASED}/{name}");
        let text = files::read_if_present(&self.archive_path(version))
            .with_context(|| format!("read {shown}"))?
            .ok_or_else(|| anyhow::anyhow!(
                    "{shown} is missing, so {version} has no release notes; run `cargo xtask changes release --version {version}` and commit the result before tagging"
                ))?;
        Ok(self.parse_archive(version, &text))
    }

    fn parse_archive(&self, version: &str, text: &str) -> Result<CreditedNotes, Problem> {
        if !is_full_version(version) {
            return Err(Problem::NotAReleaseName);
        }
        let notes: CreditedNotes = serde_json::from_str(text)
            .map_err(|error| Problem::MalformedArchive(error.to_string()))?;
        if notes.notes.version != version {
            return Err(Problem::OtherVersion(notes.notes.version));
        }
        notes.check(&self.config)?;
        Ok(notes)
    }

    fn archived_versions(&self) -> anyhow::Result<Vec<String>> {
        let released = self.released();
        let entries = match fs::read_dir(&released) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => {
                return Err(error).with_context(|| format!("list {}", released.display()));
            }
        };
        let mut versions = Vec::new();
        for entry in entries {
            let name = file_name(&entry?.path());
            if let Some(version) = name.strip_suffix(ARCHIVE_EXTENSION) {
                versions.push(version.to_owned());
            }
        }
        versions.sort();
        Ok(versions)
    }

    pub(super) fn archive_violations(&self) -> anyhow::Result<Vec<Violation>> {
        let mut violations = Vec::new();
        for version in self.archived_versions()? {
            if let Err(problem) = self.load_archive(&version)? {
                violations.push(archive_violation(&version, problem));
            }
        }
        Ok(violations)
    }
}

impl CreditedNotes {
    fn check(&self, config: &Config) -> Result<(), Problem> {
        if self.notes.entries.is_empty() {
            return Err(Problem::NoEntries);
        }
        for entry in &self.notes.entries {
            config.check_type(&entry.kind)?;
            config.check_area(&entry.area)?;
            check_summary(&entry.summary)?;
        }
        match self
            .contributors
            .iter()
            .find(|login| !is_github_login(login))
        {
            Some(login) => Err(Problem::BadLogin(login.clone())),
            None => Ok(()),
        }
    }
}

pub(super) fn archive_name(version: &str) -> String {
    format!("{version}{ARCHIVE_EXTENSION}")
}

pub(super) fn archive_violation(version: &str, problem: Problem) -> Violation {
    Violation {
        file: format!("{RELEASED}/{}", archive_name(version)),
        problem,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::changelog::{
        Format, check,
        tests::{ARCHIVED_JSON, archive, fragment_text, notes_in, scratch_repo},
    };

    const EMPTY_ARCHIVE_JSON: &str = r#"{"version": "1.2.0", "entries": [], "contributors": []}"#;

    #[test]
    fn takes_the_notes_of_a_released_version_from_its_archive() {
        let scratch = scratch_repo(&[(
            "a.md",
            &fragment_text("type: fix\narea: reader\ncredit: [hubot]", "Not yet out."),
        )]);
        archive(&scratch, "1.2.0", ARCHIVED_JSON);

        let markdown = notes_in(&scratch, "1.2.0", Format::Markdown).unwrap();

        assert_eq!(
            markdown,
            "Pages turn faster.\n\n## New\n\n- **Reader:** Pages turn faster.\n\n## Fixed\n\n- **Library:** Scans finish.\n\nContributors: @octocat\n"
        );
    }

    #[test]
    fn leaves_the_contributors_out_of_the_json_notes_of_a_released_version() {
        let scratch = scratch_repo(&[]);
        archive(&scratch, "1.2.0", ARCHIVED_JSON);

        let json = notes_in(&scratch, "1.2.0", Format::Json).unwrap();

        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&json).unwrap(),
            serde_json::json!({
                "version": "1.2.0",
                "entries": [
                    {"type": "feat", "area": "reader", "summary": "Pages turn faster."},
                    {"type": "fix", "area": "library", "summary": "Scans finish."}
                ]
            })
        );
    }

    #[test]
    fn reads_a_released_version_while_a_fragment_is_invalid() {
        let scratch = scratch_repo(&[("a.md", "x")]);
        archive(&scratch, "1.2.0", ARCHIVED_JSON);

        let markdown = notes_in(&scratch, "1.2.0", Format::Markdown).unwrap();

        assert!(markdown.starts_with("Pages turn faster.\n"), "{markdown}");
    }

    #[test]
    fn refuses_the_notes_of_a_full_version_without_an_archive() {
        let scratch = scratch_repo(&[(
            "a.md",
            &fragment_text("type: fix\narea: reader", "Not yet out."),
        )]);

        let error = notes_in(&scratch, "1.3.0", Format::Markdown).unwrap_err();

        assert!(
            error.to_string().contains(".changes/released/1.3.0.json"),
            "{error}"
        );
    }

    #[test]
    fn names_the_archive_when_it_is_malformed() {
        let scratch = scratch_repo(&[]);
        archive(&scratch, "1.2.0", "{ not json");

        let error = notes_in(&scratch, "1.2.0", Format::Markdown).unwrap_err();

        assert!(
            error.to_string().contains(".changes/released/1.2.0.json"),
            "{error}"
        );
    }

    #[test]
    fn refuses_an_archive_that_names_another_version() {
        let scratch = scratch_repo(&[]);
        archive(&scratch, "1.2.1", ARCHIVED_JSON);

        let error = notes_in(&scratch, "1.2.1", Format::Markdown).unwrap_err();

        assert_eq!(
            error.downcast_ref::<Violation>(),
            Some(&archive_violation(
                "1.2.1",
                Problem::OtherVersion("1.2.0".to_owned())
            ))
        );
    }

    #[test]
    fn refuses_an_archived_entry_the_config_no_longer_lists() {
        let scratch = scratch_repo(&[]);
        archive(
            &scratch,
            "1.2.0",
            &ARCHIVED_JSON.replace(r#""area": "library""#, r#""area": "kitchen""#),
        );
        archive(
            &scratch,
            "1.1.0",
            &ARCHIVED_JSON
                .replace("1.2.0", "1.1.0")
                .replace(r#""type": "fix""#, r#""type": "chore""#),
        );

        let unknown_area = notes_in(&scratch, "1.2.0", Format::Markdown).unwrap_err();
        let unknown_type = notes_in(&scratch, "1.1.0", Format::Markdown).unwrap_err();

        assert_eq!(
            unknown_area.downcast_ref::<Violation>(),
            Some(&archive_violation(
                "1.2.0",
                Problem::UnknownArea("kitchen".to_owned())
            ))
        );
        assert_eq!(
            unknown_type.downcast_ref::<Violation>(),
            Some(&archive_violation(
                "1.1.0",
                Problem::UnknownType("chore".to_owned())
            ))
        );
    }

    #[test]
    fn refuses_an_archived_summary_that_breaks_the_summary_rules() {
        let scratch = scratch_repo(&[]);
        archive(
            &scratch,
            "1.2.0",
            &ARCHIVED_JSON.replace("Scans finish.", "Scans \u{2014} finish."),
        );

        let error = notes_in(&scratch, "1.2.0", Format::Markdown).unwrap_err();

        assert_eq!(
            error.downcast_ref::<Violation>(),
            Some(&archive_violation("1.2.0", Problem::EmDash))
        );
    }

    #[test]
    fn refuses_an_archived_contributor_that_is_not_a_login() {
        let scratch = scratch_repo(&[]);
        archive(
            &scratch,
            "1.2.0",
            &ARCHIVED_JSON.replace("\"octocat\"", "\"@octocat\""),
        );

        let error = notes_in(&scratch, "1.2.0", Format::Markdown).unwrap_err();

        assert_eq!(
            error.downcast_ref::<Violation>(),
            Some(&archive_violation(
                "1.2.0",
                Problem::BadLogin("@octocat".to_owned())
            ))
        );
    }

    #[test]
    fn reports_every_bad_archive_beside_the_bad_fragments() {
        let scratch = scratch_repo(&[("a.md", "x")]);
        archive(&scratch, "1.0.0", &ARCHIVED_JSON.replace("1.2.0", "1.0.0"));
        archive(&scratch, "1.1.0", ARCHIVED_JSON);
        archive(
            &scratch,
            "1.2.0",
            &ARCHIVED_JSON.replace(r#""area": "library""#, r#""area": "kitchen""#),
        );

        let violations = check(scratch.path()).unwrap();

        assert_eq!(
            violations,
            [
                Violation {
                    file: "a.md".to_owned(),
                    problem: Problem::NoFrontMatter
                },
                archive_violation("1.1.0", Problem::OtherVersion("1.2.0".to_owned())),
                archive_violation("1.2.0", Problem::UnknownArea("kitchen".to_owned())),
            ]
        );
    }

    #[test]
    fn refuses_the_notes_of_an_archive_without_entries() {
        let scratch = scratch_repo(&[]);
        archive(&scratch, "1.2.0", EMPTY_ARCHIVE_JSON);

        let error = notes_in(&scratch, "1.2.0", Format::Markdown).unwrap_err();

        assert_eq!(
            error.downcast_ref::<Violation>(),
            Some(&archive_violation("1.2.0", Problem::NoEntries))
        );
    }

    #[test]
    fn reports_an_archive_without_entries() {
        let scratch = scratch_repo(&[]);
        archive(&scratch, "1.2.0", EMPTY_ARCHIVE_JSON);

        let violations = check(scratch.path()).unwrap();

        assert_eq!(violations, [archive_violation("1.2.0", Problem::NoEntries)]);
    }

    #[test]
    fn reports_an_archive_whose_name_is_not_a_full_release_version() {
        let scratch = scratch_repo(&[]);
        for version in ["v1.2.0", "1.2.0-rc.1"] {
            archive(&scratch, version, &ARCHIVED_JSON.replace("1.2.0", version));
        }

        let violations = check(scratch.path()).unwrap();

        assert_eq!(
            violations,
            [
                archive_violation("1.2.0-rc.1", Problem::NotAReleaseName),
                archive_violation("v1.2.0", Problem::NotAReleaseName),
            ]
        );
    }

    #[test]
    fn reports_an_empty_archived_summary_without_naming_front_matter() {
        let scratch = scratch_repo(&[]);
        archive(
            &scratch,
            "1.2.0",
            &ARCHIVED_JSON.replace("Scans finish.", ""),
        );

        let violations = check(scratch.path()).unwrap();

        assert_eq!(
            violations,
            [archive_violation("1.2.0", Problem::EmptySummary)]
        );
        assert_eq!(
            violations[0].to_string(),
            ".changes/released/1.2.0.json: the summary is empty"
        );
    }

    #[test]
    fn reports_an_archived_summary_that_is_not_one_line() {
        for summary in [
            "Scans finish.\\n- **Reader:** Pages turn.",
            "Scans\\rfinish.",
            "Scans\\tfinish.",
            "Scans  finish.",
            " Scans finish.",
            "Scans finish. ",
        ] {
            let scratch = scratch_repo(&[]);
            archive(
                &scratch,
                "1.2.0",
                &ARCHIVED_JSON.replace("Scans finish.", summary),
            );

            let violations = check(scratch.path()).unwrap();

            assert_eq!(
                violations,
                [archive_violation("1.2.0", Problem::NotOneLine)],
                "{summary:?}"
            );
        }
    }

    #[test]
    fn reports_an_archive_that_is_not_json() {
        let scratch = scratch_repo(&[]);
        archive(&scratch, "1.2.0", "{ not json");

        let violations = check(scratch.path()).unwrap();

        assert!(
            matches!(
                violations.as_slice(),
                [Violation { file, problem: Problem::MalformedArchive(_) }] if file == "released/1.2.0.json"
            ),
            "{violations:?}"
        );
    }
}
