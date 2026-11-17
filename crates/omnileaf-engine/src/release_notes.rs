use semver::Version;
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ChangeKind {
    Breaking,
    Sec,
    Feat,
    Perf,
    Fix,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ChangeEntry {
    pub kind: ChangeKind,
    pub summary: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct VersionNotes {
    pub version: String,
    pub entries: Vec<ChangeEntry>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WhatsNew {
    pub installed: Option<VersionNotes>,
    pub earlier: Vec<VersionNotes>,
}

#[derive(Debug, thiserror::Error)]
pub enum ReleaseNotesError {
    #[error("read the release notes bundle")]
    Malformed(#[from] serde_json::Error),
    #[error("read the release notes for version {version:?}")]
    Version {
        version: String,
        #[source]
        source: semver::Error,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReleaseNotes {
    released: Vec<ReleasedVersion>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ReleasedVersion {
    number: Version,
    notes: VersionNotes,
}

#[derive(Deserialize)]
struct ArchivedNotes {
    version: String,
    entries: Vec<ArchivedEntry>,
}

#[derive(Deserialize)]
struct ArchivedEntry {
    #[serde(rename = "type")]
    kind: ArchivedKind,
    summary: String,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum ArchivedKind {
    Known(ChangeKind),
    Unknown(serde::de::IgnoredAny),
}

impl ReleaseNotes {
    pub fn parse(bundle: &str) -> Result<Self, ReleaseNotesError> {
        let archived: Vec<ArchivedNotes> = serde_json::from_str(bundle)?;
        let mut released = Vec::with_capacity(archived.len());
        for notes in archived {
            if let Some(version) = ReleasedVersion::from_archive(notes)? {
                released.push(version);
            }
        }
        released.sort_by(|left, right| right.number.cmp(&left.number));
        Ok(Self { released })
    }

    #[must_use]
    pub fn for_installed(&self, installed: &str) -> WhatsNew {
        let Ok(installed) = Version::parse(installed) else {
            return WhatsNew {
                installed: None,
                earlier: Vec::new(),
            };
        };
        WhatsNew {
            installed: self
                .released_version(&installed)
                .map(|released| released.notes.clone()),
            earlier: self
                .released
                .iter()
                .filter(|released| released.number < installed)
                .map(|released| released.notes.clone())
                .collect(),
        }
    }

    fn released_version(&self, installed: &Version) -> Option<&ReleasedVersion> {
        self.released
            .iter()
            .find(|released| released.number == *installed)
    }
}

impl ReleasedVersion {
    fn from_archive(archived: ArchivedNotes) -> Result<Option<Self>, ReleaseNotesError> {
        let number =
            Version::parse(&archived.version).map_err(|source| ReleaseNotesError::Version {
                version: archived.version.clone(),
                source,
            })?;
        let entries: Vec<_> = archived
            .entries
            .into_iter()
            .filter_map(ArchivedEntry::into_known)
            .collect();
        if entries.is_empty() {
            return Ok(None);
        }
        Ok(Some(Self {
            number,
            notes: VersionNotes {
                version: archived.version,
                entries,
            },
        }))
    }
}

impl ArchivedEntry {
    fn into_known(self) -> Option<ChangeEntry> {
        match self.kind {
            ArchivedKind::Known(kind) => Some(ChangeEntry {
                kind,
                summary: self.summary,
            }),
            ArchivedKind::Unknown(_) => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use proptest::prelude::*;

    use super::*;

    fn bundle(versions: &[(&str, &[&str])]) -> String {
        let archives: Vec<_> = versions
            .iter()
            .map(|(version, types)| {
                let entries: Vec<_> = types
                    .iter()
                    .enumerate()
                    .map(|(index, kind)| {
                        serde_json::json!({
                            "type": kind,
                            "area": "library",
                            "summary": format!("{kind} change {index} in {version}"),
                        })
                    })
                    .collect();
                serde_json::json!({ "version": version, "entries": entries })
            })
            .collect();
        serde_json::Value::Array(archives).to_string()
    }

    fn whats_new(versions: &[(&str, &[&str])], installed: &str) -> WhatsNew {
        ReleaseNotes::parse(&bundle(versions))
            .unwrap()
            .for_installed(installed)
    }

    fn versions_of(notes: &[VersionNotes]) -> Vec<&str> {
        notes.iter().map(|notes| notes.version.as_str()).collect()
    }

    #[test]
    fn reads_the_installed_versions_entries_in_order() {
        let bundle = r#"[{"version":"0.2.0","entries":[
            {"type":"breaking","area":"library","summary":"Old shelves are gone."},
            {"type":"sec","area":"reader","summary":"Pages load safely."},
            {"type":"feat","area":"library","summary":"Shelves sort by series."},
            {"type":"perf","area":"reader","summary":"Pages turn faster."},
            {"type":"fix","area":"settings","summary":"About shows the date."}
        ]}]"#;

        let whats_new = ReleaseNotes::parse(bundle).unwrap().for_installed("0.2.0");

        let entry = |kind, summary: &str| ChangeEntry {
            kind,
            summary: summary.to_owned(),
        };
        assert_eq!(
            whats_new.installed,
            Some(VersionNotes {
                version: "0.2.0".to_owned(),
                entries: vec![
                    entry(ChangeKind::Breaking, "Old shelves are gone."),
                    entry(ChangeKind::Sec, "Pages load safely."),
                    entry(ChangeKind::Feat, "Shelves sort by series."),
                    entry(ChangeKind::Perf, "Pages turn faster."),
                    entry(ChangeKind::Fix, "About shows the date."),
                ],
            })
        );
    }

    #[test]
    fn skips_an_entry_of_an_unknown_type_and_keeps_the_rest() {
        let whats_new = whats_new(&[("0.2.0", &["feat", "chore", "fix"])], "0.2.0");

        let kinds: Vec<_> = whats_new
            .installed
            .unwrap()
            .entries
            .iter()
            .map(|entry| entry.kind)
            .collect();
        assert_eq!(kinds, [ChangeKind::Feat, ChangeKind::Fix]);
    }

    #[test]
    fn leaves_out_a_version_with_no_entry_of_a_known_type() {
        let whats_new = whats_new(&[("0.1.0", &["feat"]), ("0.2.0", &["chore"])], "0.2.0");

        assert_eq!(whats_new.installed, None);
        assert_eq!(versions_of(&whats_new.earlier), ["0.1.0"]);
    }

    #[test]
    fn refuses_a_bundle_that_is_not_an_array_of_notes() {
        let parsed = ReleaseNotes::parse(r#"{"version":"0.2.0","entries":[]}"#);

        assert!(matches!(parsed, Err(ReleaseNotesError::Malformed(_))));
    }

    #[test]
    fn refuses_a_version_that_is_not_semver() {
        let parsed = ReleaseNotes::parse(&bundle(&[("0.2", &["feat"])]));

        assert!(matches!(
            parsed,
            Err(ReleaseNotesError::Version { version, .. }) if version == "0.2"
        ));
    }

    #[test]
    fn lists_earlier_versions_newest_first_by_semver() {
        let whats_new = whats_new(
            &[
                ("0.9.0", &["fix"]),
                ("0.10.0", &["feat"]),
                ("0.11.0", &["feat"]),
                ("0.9.1", &["fix"]),
            ],
            "0.11.0",
        );

        assert_eq!(
            whats_new.installed.map(|notes| notes.version),
            Some("0.11.0".to_owned())
        );
        assert_eq!(
            versions_of(&whats_new.earlier),
            ["0.10.0", "0.9.1", "0.9.0"]
        );
    }

    #[test]
    fn drops_versions_above_the_installed_one() {
        let whats_new = whats_new(
            &[
                ("0.1.0", &["feat"]),
                ("0.2.0", &["feat"]),
                ("0.3.0", &["feat"]),
            ],
            "0.2.0",
        );

        assert_eq!(
            whats_new.installed.map(|notes| notes.version),
            Some("0.2.0".to_owned())
        );
        assert_eq!(versions_of(&whats_new.earlier), ["0.1.0"]);
    }

    #[test]
    fn an_empty_bundle_has_no_notes() {
        let whats_new = whats_new(&[], "0.2.0");

        assert_eq!(
            whats_new,
            WhatsNew {
                installed: None,
                earlier: Vec::new(),
            }
        );
    }

    #[test]
    fn a_development_build_has_no_notes() {
        let whats_new = whats_new(&[("0.1.0", &["feat"])], "0.0.0");

        assert_eq!(whats_new.installed, None);
        assert!(whats_new.earlier.is_empty());
    }

    #[test]
    fn a_pre_release_has_no_notes_of_its_own_but_lists_the_releases_before_it() {
        let whats_new = whats_new(&[("0.1.0", &["feat"]), ("0.2.0", &["feat"])], "0.2.0-rc.1");

        assert_eq!(whats_new.installed, None);
        assert_eq!(versions_of(&whats_new.earlier), ["0.1.0"]);
    }

    #[test]
    fn an_unreadable_installed_version_has_no_notes() {
        let whats_new = whats_new(&[("0.1.0", &["feat"])], "latest");

        assert_eq!(whats_new.installed, None);
        assert!(whats_new.earlier.is_empty());
    }

    fn released_number() -> impl Strategy<Value = String> {
        (0..3_u64, 0..3_u64, 0..3_u64, proptest::option::of(0..2_u64)).prop_map(
            |(major, minor, patch, candidate)| match candidate {
                Some(candidate) => format!("{major}.{minor}.{patch}-rc.{candidate}"),
                None => format!("{major}.{minor}.{patch}"),
            },
        )
    }

    fn bundled_numbers() -> impl Strategy<Value = Vec<String>> {
        proptest::collection::btree_set(released_number(), 0..12)
            .prop_map(|numbers| numbers.into_iter().collect::<Vec<_>>())
            .prop_shuffle()
    }

    proptest! {
        #[test]
        fn lists_every_version_below_the_installed_one_newest_first_whatever_the_bundle_order(
            numbers in bundled_numbers(),
            installed in released_number(),
        ) {
            let versions: Vec<(&str, &[&str])> = numbers
                .iter()
                .map(|number| (number.as_str(), &["feat"][..]))
                .collect();

            let whats_new = whats_new(&versions, &installed);

            let installed_number = Version::parse(&installed).unwrap();
            let earlier: Vec<Version> = whats_new
                .earlier
                .iter()
                .map(|notes| Version::parse(&notes.version).unwrap())
                .collect();
            let below = numbers
                .iter()
                .filter(|number| Version::parse(number).unwrap() < installed_number)
                .count();
            prop_assert!(earlier.is_sorted_by(|left, right| left > right));
            prop_assert!(earlier.iter().all(|number| *number < installed_number));
            prop_assert_eq!(earlier.len(), below);
            prop_assert_eq!(
                whats_new.installed.as_ref().map(|notes| notes.version.as_str()),
                numbers.contains(&installed).then_some(installed.as_str())
            );
        }
    }
}
