use serde::{Deserialize, Serialize};
use specta::Type;

use omnileaf_db::{
    adult_content::AdultHiding,
    catalog::{
        SeriesLabelHoldings, StoredCategory, StoredTag, library_categories, library_tags,
        series_labels as stored_series_labels,
    },
};

use crate::{
    Library, LibraryError, SeriesId,
    library_category::{CategoryId, LibraryCategory},
};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesLabels {
    pub keeps_labels: bool,
    pub categories: Vec<CategoryHeld>,
    pub tags: Vec<TagHeld>,
    pub suggested_tags: Vec<String>,
}

/// How many of the series asked about are in the category.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CategoryHeld {
    pub category: LibraryCategory,
    pub holding: u32,
}

/// A tag the library keeps, and how many series carry it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTag {
    pub name: String,
    pub series_count: u32,
}

/// How many of the series asked about carry the tag.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TagHeld {
    pub tag: String,
    pub holding: u32,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LabelChanges {
    pub categories_added: Vec<CategoryId>,
    pub categories_removed: Vec<CategoryId>,
    pub categories_created: Vec<String>,
    pub tags_added: Vec<String>,
    pub tags_removed: Vec<String>,
}

impl Library {
    pub async fn categories(&self) -> Result<Vec<LibraryCategory>, LibraryError> {
        let stored = self.store.database().read(library_categories).await?;
        Ok(stored.into_iter().map(LibraryCategory::from).collect())
    }

    pub async fn tags(&self) -> Result<Vec<LibraryTag>, LibraryError> {
        let stored = self
            .store
            .database()
            .read(|connection| library_tags(connection, AdultHiding::default()))
            .await?;
        Ok(stored.into_iter().map(LibraryTag::from).collect())
    }

    pub async fn series_labels(&self, series: Vec<SeriesId>) -> Result<SeriesLabels, LibraryError> {
        let series: Vec<_> = series.into_iter().map(|id| id.0).collect();
        let held = self
            .store
            .database()
            .read(move |connection| stored_series_labels(connection, &series))
            .await?;
        Ok(SeriesLabels::from(held))
    }

    #[tracing::instrument(skip_all, fields(series = series.len()))]
    pub async fn label_series(
        &self,
        series: Vec<SeriesId>,
        changes: LabelChanges,
    ) -> Result<(), LibraryError> {
        let series: Vec<_> = series.into_iter().map(|id| id.0).collect();
        Ok(self
            .store
            .write(move |writer| {
                for category in changes
                    .categories_removed
                    .iter()
                    .filter_map(CategoryId::stored)
                {
                    if writer.has_category(category)? {
                        writer.set_category_members(category, &series, false)?;
                    }
                }
                for name in changes.tags_removed.iter().filter_map(|name| named(name)) {
                    if let Some(tag) = writer.tag_named(name)? {
                        writer.set_tag_members(tag, &series, false)?;
                    }
                }
                for name in changes
                    .categories_created
                    .iter()
                    .filter_map(|name| named(name))
                {
                    let category = writer.create_category(name)?;
                    writer.set_category_members(category, &series, true)?;
                }
                for category in changes
                    .categories_added
                    .iter()
                    .filter_map(CategoryId::stored)
                {
                    if writer.has_category(category)? {
                        writer.set_category_members(category, &series, true)?;
                    }
                }
                for name in changes.tags_added.iter().filter_map(|name| named(name)) {
                    let tag = writer.create_tag(name)?;
                    writer.set_tag_members(tag, &series, true)?;
                }
                Ok(())
            })
            .await?)
    }

    #[tracing::instrument(skip_all)]
    pub async fn rename_library_tag(&self, tag: String, to: String) -> Result<(), LibraryError> {
        let (Some(tag), Some(to)) = (named(&tag), named(&to)) else {
            return Ok(());
        };
        let (tag, to) = (tag.to_owned(), to.to_owned());
        Ok(self
            .store
            .write(move |writer| {
                if let Some(tag) = writer.tag_named(&tag)? {
                    writer.rename_tag(tag, &to)?;
                }
                Ok(())
            })
            .await?)
    }

    #[tracing::instrument(skip_all)]
    pub async fn remove_library_tag(&self, tag: String) -> Result<Vec<SeriesId>, LibraryError> {
        let Some(tag) = named(&tag).map(str::to_owned) else {
            return Ok(Vec::new());
        };
        let carried = self
            .store
            .write(move |writer| match writer.tag_named(&tag)? {
                Some(tag) => writer.delete_tag(tag),
                None => Ok(Vec::new()),
            })
            .await?;
        Ok(carried.into_iter().map(SeriesId).collect())
    }
}

fn named(name: &str) -> Option<&str> {
    let name = name.trim();
    (!name.is_empty()).then_some(name)
}

impl From<StoredCategory> for LibraryCategory {
    fn from(stored: StoredCategory) -> Self {
        Self {
            id: stored.id.into(),
            name: stored.name,
        }
    }
}

impl From<StoredTag> for LibraryTag {
    fn from(stored: StoredTag) -> Self {
        Self {
            name: stored.name,
            series_count: stored.series_count,
        }
    }
}

impl From<SeriesLabelHoldings> for SeriesLabels {
    fn from(held: SeriesLabelHoldings) -> Self {
        Self {
            keeps_labels: true,
            categories: held
                .categories
                .into_iter()
                .map(|held| CategoryHeld {
                    category: held.category.into(),
                    holding: held.holding,
                })
                .collect(),
            tags: held
                .tags
                .into_iter()
                .map(|held| TagHeld {
                    tag: held.tag,
                    holding: held.holding,
                })
                .collect(),
            suggested_tags: held.suggested_tags,
        }
    }
}
