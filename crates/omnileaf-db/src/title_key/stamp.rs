use rusqlite::Connection;

use crate::{Error, title_key::Language};

const RULES_VERSION: u32 = 1;
const ICU_VERSIONS: &str = env!("OMNILEAF_ICU_VERSIONS");
const STAMP_CONTEXT: &str = "omnileaf.app 2026-10 title-key-stamp v1";
const FIELD_END: &[u8] = &[0];
const STAMP_LENGTH: usize = 16;
const THE_STAMP: i64 = 1;

/// Names the language, our rules and the ICU4X build that made a set of title keys, since keys made by any other compare differently.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct TitleStamp([u8; STAMP_LENGTH]);

impl TitleStamp {
    pub(crate) fn of(language: &Language) -> Self {
        Self::with_icu_versions(language, ICU_VERSIONS)
    }

    fn with_icu_versions(language: &Language, icu_versions: &str) -> Self {
        let mut hasher = blake3::Hasher::new_derive_key(STAMP_CONTEXT);
        hasher.update(&RULES_VERSION.to_be_bytes());
        hasher.update(language.to_string().as_bytes());
        hasher.update(FIELD_END);
        hasher.update(icu_versions.as_bytes());
        let mut stamp = [0; STAMP_LENGTH];
        hasher.finalize_xof().fill(&mut stamp);
        Self(stamp)
    }

    pub(crate) const fn as_bytes(&self) -> &[u8; STAMP_LENGTH] {
        &self.0
    }

    pub(crate) fn from_bytes(bytes: &[u8]) -> Option<Self> {
        bytes.try_into().ok().map(Self)
    }
}

/// The language the stored title keys were made for, falling back to the root collation when the stored tag can't be read.
pub(crate) fn stored_language(connection: &Connection) -> Result<Language, Error> {
    let tag: String = connection
        .prepare("SELECT locale FROM title_key_stamp WHERE id = ?1")?
        .query_row([THE_STAMP], |row| row.get(0))?;
    Ok(tag.parse().unwrap_or_else(|error: Error| {
        tracing::warn!(%tag, %error, "sort titles by the root collation instead of a stored language that can't be read");
        Language::ROOT
    }))
}

pub(crate) fn stored_stamp(connection: &Connection) -> Result<Option<TitleStamp>, Error> {
    let bytes: Vec<u8> = connection
        .prepare("SELECT stamp FROM title_key_stamp WHERE id = ?1")?
        .query_row([THE_STAMP], |row| row.get(0))?;
    Ok(TitleStamp::from_bytes(&bytes))
}

pub(crate) fn save_stamp(
    connection: &Connection,
    language: &Language,
    stamp: TitleStamp,
) -> Result<(), Error> {
    connection
        .prepare(
            "INSERT INTO title_key_stamp (id, locale, stamp) VALUES (?1, ?2, ?3)
             ON CONFLICT (id) DO UPDATE SET locale = excluded.locale, stamp = excluded.stamp",
        )?
        .execute((THE_STAMP, language.to_string(), stamp.as_bytes()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::icu_versions::icu_versions;

    const LOCK_BEFORE: &str = r#"
[[package]]
name = "icu_collator"
version = "2.3.1"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "icu_collator_data"
version = "2.3.0"

[[package]]
name = "icu_normalizer_data"
version = "2.3.0"

[[package]]
name = "idna"
version = "1.1.0"
"#;

    fn english() -> Language {
        "en".parse().unwrap()
    }

    #[test]
    fn changes_when_only_the_collation_data_moves() {
        let after = LOCK_BEFORE.replacen(
            "name = \"icu_collator_data\"\nversion = \"2.3.0\"",
            "name = \"icu_collator_data\"\nversion = \"2.3.1\"",
            1,
        );

        let stamps = [LOCK_BEFORE, after.as_str()]
            .map(|lock| TitleStamp::with_icu_versions(&english(), &icu_versions(lock)));

        assert_ne!(stamps[0], stamps[1]);
    }

    #[test]
    fn changes_when_only_the_normalisation_data_moves() {
        let after = LOCK_BEFORE.replacen(
            "name = \"icu_normalizer_data\"\nversion = \"2.3.0\"",
            "name = \"icu_normalizer_data\"\nversion = \"2.4.0\"",
            1,
        );

        let stamps = [LOCK_BEFORE, after.as_str()]
            .map(|lock| TitleStamp::with_icu_versions(&english(), &icu_versions(lock)));

        assert_ne!(stamps[0], stamps[1]);
    }

    #[test]
    fn stays_the_same_when_a_package_outside_icu4x_moves() {
        let after = LOCK_BEFORE.replacen("version = \"1.1.0\"", "version = \"1.2.0\"", 1);

        let stamps = [LOCK_BEFORE, after.as_str()]
            .map(|lock| TitleStamp::with_icu_versions(&english(), &icu_versions(lock)));

        assert_eq!(stamps[0], stamps[1]);
    }

    #[test]
    fn differs_between_languages() {
        let swedish: Language = "sv".parse().unwrap();

        let stamps = [english(), swedish].map(|language| TitleStamp::of(&language));

        assert_ne!(stamps[0], stamps[1]);
    }

    #[test]
    fn covers_the_collation_and_normalisation_data_this_build_was_made_with() {
        let listed: Vec<&str> = ICU_VERSIONS
            .split(',')
            .filter_map(|package| package.split_once(' '))
            .map(|(name, _)| name)
            .collect();

        for package in [
            "icu_collator",
            "icu_collator_data",
            "icu_normalizer",
            "icu_normalizer_data",
            "icu_locale_fallback_data",
        ] {
            assert!(
                listed.contains(&package),
                "{package} is missing from {ICU_VERSIONS}"
            );
        }
    }
}
