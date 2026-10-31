use std::collections::BTreeMap;

use serde::Serialize;

use super::recipes::{Expected, Maker, NUMBER, Recipe, Refusal, SERIES, Sources};
use crate::vendor::sha256_hex;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct Tool {
    pub(crate) version: String,
    pub(crate) sha256: String,
}

#[derive(Serialize)]
pub(super) struct Manifest {
    pub(super) tools: BTreeMap<Maker, Tool>,
    pub(super) fixtures: Vec<Fixture>,
}

#[derive(Serialize)]
pub(super) struct Fixture {
    file: &'static str,
    maker: Maker,
    arguments: Vec<String>,
    sha256: String,
    outcome: Outcome,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
enum Outcome {
    Opens {
        pages: Vec<PageRecord>,
        comic_info: ComicInfoRecord,
    },
    Refused(Refusal),
}

#[derive(Serialize)]
struct PageRecord {
    name: String,
    size: usize,
    sha256: String,
}

#[derive(Serialize)]
struct ComicInfoRecord {
    series: &'static str,
    number: &'static str,
}

impl Fixture {
    pub(super) fn of(
        recipe: &Recipe,
        arguments: Vec<String>,
        archive: &[u8],
        sources: &Sources,
    ) -> Self {
        Self {
            file: recipe.file,
            maker: recipe.maker,
            arguments,
            sha256: sha256_hex(archive),
            outcome: Outcome::of(recipe.expected, sources),
        }
    }
}

impl Outcome {
    fn of(expected: Expected, sources: &Sources) -> Self {
        match expected {
            Expected::Refused(refusal) => Self::Refused(refusal),
            Expected::Opens => Self::Opens {
                pages: sources
                    .pages
                    .iter()
                    .map(|page| PageRecord {
                        name: page.name.clone(),
                        size: page.bytes.len(),
                        sha256: sha256_hex(&page.bytes),
                    })
                    .collect(),
                comic_info: ComicInfoRecord {
                    series: SERIES,
                    number: NUMBER,
                },
            },
        }
    }
}
