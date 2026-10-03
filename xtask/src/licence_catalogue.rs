//! The licences of the Rust crates the app ships, read from cargo-about's report into the catalogue the interface shows.

use std::{
    collections::{BTreeMap, BTreeSet},
    error::Error,
    fmt,
};

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct AboutReport {
    licenses: Vec<AboutLicence>,
    crates: Vec<AboutCrate>,
}

#[derive(Deserialize)]
struct AboutLicence {
    id: String,
    text: String,
    used_by: Vec<AboutUse>,
}

#[derive(Deserialize)]
struct AboutUse {
    #[serde(rename = "crate")]
    krate: AboutPackage,
}

#[derive(Deserialize)]
struct AboutCrate {
    package: AboutPackage,
    license: String,
}

#[derive(Deserialize)]
struct AboutPackage {
    name: String,
    version: String,
    license: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub(crate) struct Catalogue {
    pub(crate) packages: Vec<Package>,
    pub(crate) texts: Vec<LicenceText>,
}

/// One shipped package, naming its licence as declared and the indexes of its texts in the catalogue.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub(crate) struct Package {
    pub(crate) name: String,
    pub(crate) version: String,
    pub(crate) licence: String,
    pub(crate) texts: Vec<usize>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub(crate) struct LicenceText {
    pub(crate) licence: String,
    pub(crate) text: String,
}

#[derive(Debug)]
pub(crate) enum CatalogueError {
    Unreadable(serde_json::Error),
    Unlicensed { package: String },
}

impl fmt::Display for CatalogueError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unreadable(_) => write!(f, "read cargo-about's report"),
            Self::Unlicensed { package } => {
                write!(f, "cargo-about found no licence text for {package}")
            }
        }
    }
}

impl Error for CatalogueError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Unreadable(source) => Some(source),
            Self::Unlicensed { .. } => None,
        }
    }
}

pub(crate) fn catalogue(report: &str) -> Result<Catalogue, CatalogueError> {
    let report: AboutReport = serde_json::from_str(report).map_err(CatalogueError::Unreadable)?;
    let mut texts: Vec<LicenceText> = Vec::new();
    let mut texts_of: BTreeMap<(String, String), BTreeSet<usize>> = BTreeMap::new();
    for licence in report.licenses {
        let index = index_of(&mut texts, licence.id, &licence.text);
        for user in licence.used_by {
            texts_of
                .entry((user.krate.name, user.krate.version))
                .or_default()
                .insert(index);
        }
    }
    let mut packages = report
        .crates
        .into_iter()
        .map(|krate| {
            let key = (krate.package.name, krate.package.version);
            let texts = texts_of
                .get(&key)
                .ok_or_else(|| CatalogueError::Unlicensed {
                    package: format!("{} {}", key.0, key.1),
                })?
                .iter()
                .copied()
                .collect();
            Ok(Package {
                name: key.0,
                version: key.1,
                licence: krate.package.license.unwrap_or(krate.license),
                texts,
            })
        })
        .collect::<Result<Vec<_>, CatalogueError>>()?;
    packages.sort_by(|a, b| (&a.name, &a.version).cmp(&(&b.name, &b.version)));
    Ok(Catalogue { packages, texts })
}

fn index_of(texts: &mut Vec<LicenceText>, licence: String, text: &str) -> usize {
    let text = text.replace("\r\n", "\n");
    if let Some(index) = texts.iter().position(|known| known.text == text) {
        return index;
    }
    texts.push(LicenceText { licence, text });
    texts.len() - 1
}

#[cfg(test)]
mod tests {
    use proptest::prelude::*;
    use serde_json::{Value, json};

    use super::{Catalogue, CatalogueError, LicenceText, Package, catalogue};

    fn package(name: &str, version: &str, license: Option<&str>) -> Value {
        json!({ "name": name, "version": version, "license": license })
    }

    fn licence(id: &str, text: &str, users: &[&Value]) -> Value {
        let used_by: Vec<Value> = users
            .iter()
            .map(|user| json!({ "crate": user, "path": "LICENSE" }))
            .collect();
        json!({ "id": id, "name": id, "text": text, "used_by": used_by })
    }

    fn report(licences: &[Value], crates: &[(Value, &str)]) -> String {
        let crates: Vec<Value> = crates
            .iter()
            .map(|(package, license)| json!({ "package": package, "license": license }))
            .collect();
        json!({ "overview": [], "licenses": licences, "crates": crates }).to_string()
    }

    fn sample_package(name: &str, licence: &str, texts: &[usize]) -> Package {
        Package {
            name: name.to_owned(),
            version: "1.0.0".to_owned(),
            licence: licence.to_owned(),
            texts: texts.to_vec(),
        }
    }

    #[test]
    fn lists_each_crate_with_its_declared_licence_and_its_texts() {
        let alpha = package("sample-alpha", "1.0.0", Some("MIT OR Apache-2.0"));
        let report = report(
            &[licence("Apache-2.0", "Apache text", &[&alpha])],
            &[(alpha, "MIT OR Apache-2.0")],
        );

        let catalogue = catalogue(&report).unwrap();

        assert_eq!(
            catalogue,
            Catalogue {
                packages: vec![sample_package("sample-alpha", "MIT OR Apache-2.0", &[0])],
                texts: vec![LicenceText {
                    licence: "Apache-2.0".to_owned(),
                    text: "Apache text".to_owned(),
                }],
            }
        );
    }

    #[test]
    fn shares_one_text_between_the_crates_that_use_it() {
        let alpha = package("sample-alpha", "1.0.0", Some("MIT"));
        let beta = package("sample-beta", "1.0.0", Some("MIT"));
        let report = report(
            &[
                licence("MIT", "MIT text", &[&alpha]),
                licence("MIT", "MIT text", &[&beta]),
            ],
            &[(alpha, "MIT"), (beta, "MIT")],
        );

        let catalogue = catalogue(&report).unwrap();

        assert_eq!(catalogue.texts.len(), 1);
        assert_eq!(
            catalogue.packages,
            [
                sample_package("sample-alpha", "MIT", &[0]),
                sample_package("sample-beta", "MIT", &[0]),
            ]
        );
    }

    #[test]
    fn gives_a_crate_every_text_its_licence_needs() {
        let alpha = package("sample-alpha", "1.0.0", Some("MIT AND Unicode-3.0"));
        let report = report(
            &[
                licence("MIT", "MIT text", &[&alpha]),
                licence("Unicode-3.0", "Unicode text", &[&alpha]),
            ],
            &[(alpha, "MIT AND Unicode-3.0")],
        );

        let catalogue = catalogue(&report).unwrap();

        assert_eq!(catalogue.packages[0].texts, [0, 1]);
    }

    #[test]
    fn names_the_licence_cargo_about_found_when_none_is_declared() {
        let alpha = package("sample-alpha", "1.0.0", None);
        let report = report(&[licence("ISC", "ISC text", &[&alpha])], &[(alpha, "ISC")]);

        let catalogue = catalogue(&report).unwrap();

        assert_eq!(catalogue.packages[0].licence, "ISC");
    }

    #[test]
    fn writes_line_endings_as_newlines() {
        let alpha = package("sample-alpha", "1.0.0", Some("MIT"));
        let report = report(
            &[licence("MIT", "first\r\nsecond\r\n", &[&alpha])],
            &[(alpha, "MIT")],
        );

        let catalogue = catalogue(&report).unwrap();

        assert_eq!(catalogue.texts[0].text, "first\nsecond\n");
    }

    #[test]
    fn sorts_the_crates_by_name_then_version() {
        let newer = package("sample-alpha", "2.0.0", Some("MIT"));
        let older = package("sample-alpha", "1.0.0", Some("MIT"));
        let first = package("sample-aardvark", "9.0.0", Some("MIT"));
        let report = report(
            &[licence("MIT", "MIT text", &[&newer, &older, &first])],
            &[(newer, "MIT"), (older, "MIT"), (first, "MIT")],
        );

        let catalogue = catalogue(&report).unwrap();

        let listed: Vec<(&str, &str)> = catalogue
            .packages
            .iter()
            .map(|package| (package.name.as_str(), package.version.as_str()))
            .collect();
        assert_eq!(
            listed,
            [
                ("sample-aardvark", "9.0.0"),
                ("sample-alpha", "1.0.0"),
                ("sample-alpha", "2.0.0"),
            ]
        );
    }

    #[test]
    fn rejects_a_crate_without_a_licence_text() {
        let alpha = package("sample-alpha", "1.0.0", Some("MIT"));
        let report = report(&[], &[(alpha, "MIT")]);

        let result = catalogue(&report);

        assert!(matches!(
            result,
            Err(CatalogueError::Unlicensed { package }) if package == "sample-alpha 1.0.0"
        ));
    }

    #[test]
    fn rejects_a_report_that_is_not_cargo_about_json() {
        let result = catalogue("{\"licenses\": 3}");

        assert!(matches!(result, Err(CatalogueError::Unreadable(_))));
    }

    proptest! {
        #[test]
        fn every_crate_keeps_exactly_the_texts_that_name_it(
            uses in prop::collection::vec(prop::collection::vec(0..4_usize, 1..4), 1..8)
        ) {
            let crates: Vec<Value> = (0..uses.len())
                .map(|index| package(&format!("sample-{index:02}"), "1.0.0", Some("MIT")))
                .collect();
            let licences: Vec<Value> = (0..4)
                .map(|text| {
                    let users: Vec<&Value> = uses
                        .iter()
                        .zip(&crates)
                        .filter(|(texts, _)| texts.contains(&text))
                        .map(|(_, krate)| krate)
                        .collect();
                    licence("MIT", &format!("text {text}"), &users)
                })
                .collect();
            let listed: Vec<(Value, &str)> =
                crates.iter().map(|krate| (krate.clone(), "MIT")).collect();

            let catalogue = catalogue(&report(&licences, &listed)).unwrap();

            for (package, wanted) in catalogue.packages.iter().zip(&uses) {
                let mut texts: Vec<String> = package
                    .texts
                    .iter()
                    .map(|index| catalogue.texts[*index].text.clone())
                    .collect();
                texts.sort();
                let mut expected: Vec<String> =
                    wanted.iter().map(|text| format!("text {text}")).collect();
                expected.sort();
                expected.dedup();
                prop_assert_eq!(texts, expected);
            }
        }
    }
}
