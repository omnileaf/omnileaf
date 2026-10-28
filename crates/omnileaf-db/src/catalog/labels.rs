use std::collections::BTreeMap;

use omnileaf_sync_proto::{CategoryId, SeriesId, TagId, norm};
use rusqlite::Connection;

use crate::{Error, catalog::stored_id::stored_id};

const SUGGESTED_TAGS: usize = 10;
const CATEGORIES: &str =
    "SELECT category_id, name FROM category ORDER BY position, name, category_id";
const TAGS: &str = "SELECT tag_id, name FROM label_tag ORDER BY name COLLATE NOCASE, name";
const SHOWN_SERIES_WITH_EACH_TAG: &str =
    "SELECT label_tag.name, count(series.local_id) FROM label_tag
    LEFT JOIN series_label_tag ON series_label_tag.tag_id = label_tag.tag_id
    LEFT JOIN series ON series.id = series_label_tag.series_id AND series.reading_stage IS NOT NULL
    GROUP BY label_tag.tag_id
    ORDER BY label_tag.name COLLATE NOCASE, label_tag.name";
const CATEGORIES_OF_SERIES: &str =
    "SELECT category_id AS label FROM series_category WHERE series_id = ?1";
const TAGS_OF_SERIES: &str = "SELECT tag_id AS label FROM series_label_tag WHERE series_id = ?1";
const FILE_TAGS_OF_SERIES: &str = "SELECT series_tag.name FROM series_tag
    JOIN series ON series.local_id = series_tag.series_local_id WHERE series.id = ?1";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StoredCategory {
    pub id: CategoryId,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StoredTag {
    pub name: String,
    pub series_count: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CategoryHolding {
    pub category: StoredCategory,
    pub holding: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TagHolding {
    pub tag: String,
    pub holding: u32,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SeriesLabelHoldings {
    pub categories: Vec<CategoryHolding>,
    pub tags: Vec<TagHolding>,
    pub suggested_tags: Vec<String>,
}

#[tracing::instrument(skip_all)]
pub fn library_categories(connection: &Connection) -> Result<Vec<StoredCategory>, Error> {
    let mut statement = connection.prepare(CATEGORIES)?;
    let categories = statement
        .query_map([], |row| {
            Ok(StoredCategory {
                id: stored_id(row, "category_id")?,
                name: row.get("name")?,
            })
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(categories)
}

#[tracing::instrument(skip_all)]
pub fn library_tags(connection: &Connection) -> Result<Vec<StoredTag>, Error> {
    let mut statement = connection.prepare(SHOWN_SERIES_WITH_EACH_TAG)?;
    let tags = statement
        .query_map([], |row| {
            Ok(StoredTag {
                name: row.get(0)?,
                series_count: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(tags)
}

#[tracing::instrument(skip_all, fields(series = series.len()))]
pub fn series_labels(
    connection: &Connection,
    series: &[SeriesId],
) -> Result<SeriesLabelHoldings, Error> {
    let in_category = tally::<CategoryId>(connection, CATEGORIES_OF_SERIES, series)?;
    let with_tag = tally::<TagId>(connection, TAGS_OF_SERIES, series)?;
    let categories = library_categories(connection)?
        .into_iter()
        .map(|category| CategoryHolding {
            holding: in_category.get(&category.id).copied().unwrap_or(0),
            category,
        })
        .collect();
    let mut tags = Vec::new();
    let mut statement = connection.prepare(TAGS)?;
    let mut rows = statement.query([])?;
    while let Some(row) = rows.next()? {
        let id: TagId = stored_id(row, "tag_id")?;
        if let Some(&holding) = with_tag.get(&id) {
            tags.push(TagHolding {
                tag: row.get("name")?,
                holding,
            });
        }
    }
    let suggested_tags = suggested_tags(connection, series, &tags)?;
    Ok(SeriesLabelHoldings {
        categories,
        tags,
        suggested_tags,
    })
}

fn tally<L>(
    connection: &Connection,
    query: &str,
    series: &[SeriesId],
) -> Result<BTreeMap<L, u32>, Error>
where
    L: Ord + for<'bytes> TryFrom<&'bytes [u8], Error = omnileaf_sync_proto::IdError>,
{
    let mut statement = connection.prepare(query)?;
    let mut held = BTreeMap::new();
    for series in series {
        let labels =
            statement.query_map([series.as_bytes()], |row| stored_id::<L>(row, "label"))?;
        for label in labels {
            *held.entry(label?).or_insert(0) += 1;
        }
    }
    Ok(held)
}

fn suggested_tags(
    connection: &Connection,
    series: &[SeriesId],
    carried: &[TagHolding],
) -> Result<Vec<String>, Error> {
    let carried: Vec<String> = carried.iter().map(|held| norm(&held.tag)).collect();
    let mut statement = connection.prepare(FILE_TAGS_OF_SERIES)?;
    let mut series_carrying: BTreeMap<String, u32> = BTreeMap::new();
    for series in series {
        let names = statement.query_map([series.as_bytes()], |row| row.get::<_, String>(0))?;
        for name in names {
            *series_carrying.entry(name?).or_insert(0) += 1;
        }
    }
    let mut suggestions: Vec<(String, u32)> = series_carrying
        .into_iter()
        .filter(|(name, _)| !carried.contains(&norm(name)))
        .collect();
    suggestions.sort_by(|(first_name, first), (second_name, second)| {
        second.cmp(first).then_with(|| first_name.cmp(second_name))
    });
    Ok(suggestions
        .into_iter()
        .take(SUGGESTED_TAGS)
        .map(|(name, _)| name)
        .collect())
}
