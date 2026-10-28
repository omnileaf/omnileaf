use omnileaf_sync_proto::{CategoryId, MergeClass, SeriesId, TagId, Value, norm};
use rusqlite::OptionalExtension;

use super::Writer;
use crate::{
    Error,
    catalog::stored_id::stored_id,
    store::key::{Key, LabelKey},
};

const GAP_BETWEEN_CATEGORIES: u64 = 1000;
const CATEGORY_EXISTS: &str = "SELECT EXISTS (SELECT 1 FROM category WHERE category_id = ?1)";
const TAG_EXISTS: &str = "SELECT EXISTS (SELECT 1 FROM label_tag WHERE tag_id = ?1)";
const LAST_CATEGORY_POSITION: &str =
    "SELECT coalesce(max(position), 0) FROM category WHERE position < ?1";
const TAG_NAMED: &str = "SELECT tag_id FROM label_tag WHERE norm_name = ?1 ORDER BY tag_id LIMIT 1";
const SERIES_IN_CATEGORY: &str =
    "SELECT series_id FROM series_category WHERE category_id = ?1 ORDER BY series_id";
const SERIES_WITH_TAG: &str =
    "SELECT series_id FROM series_label_tag WHERE tag_id = ?1 ORDER BY series_id";

impl Writer<'_> {
    pub fn has_category(&self, category: CategoryId) -> Result<bool, Error> {
        Ok(self
            .connection
            .query_row(CATEGORY_EXISTS, [category.as_bytes()], |row| row.get(0))?)
    }

    pub fn has_tag(&self, tag: TagId) -> Result<bool, Error> {
        Ok(self
            .connection
            .query_row(TAG_EXISTS, [tag.as_bytes()], |row| row.get(0))?)
    }

    #[tracing::instrument(skip_all, fields(name))]
    pub fn create_category(&mut self, name: &str) -> Result<CategoryId, Error> {
        let category = CategoryId::from_name(name)?;
        if self.has_category(category)? {
            return Ok(category);
        }
        let position = self.next_category_position()?;
        self.write_label(LabelKey::CategoryName(category), &Value::Text(name.into()))?;
        self.write_label(
            LabelKey::CategoryOrder(category),
            &Value::Unsigned(position),
        )?;
        self.write_label(LabelKey::CategoryDeleted(category), &Value::Bool(false))?;
        Ok(category)
    }

    #[tracing::instrument(skip_all, fields(%category, is_member))]
    pub fn set_category_members(
        &mut self,
        category: CategoryId,
        series: &[SeriesId],
        is_member: bool,
    ) -> Result<(), Error> {
        for series in series {
            self.write_label(
                LabelKey::SeriesCategory {
                    series: *series,
                    category,
                },
                &Value::Bool(is_member),
            )?;
        }
        Ok(())
    }

    #[tracing::instrument(skip_all, fields(%category))]
    pub fn delete_category(&mut self, category: CategoryId) -> Result<(), Error> {
        let members = self.members_of(SERIES_IN_CATEGORY, category.as_bytes())?;
        self.set_category_members(category, &members, false)?;
        self.write_label(LabelKey::CategoryDeleted(category), &Value::Bool(true))
    }

    #[tracing::instrument(skip_all, fields(name))]
    pub fn create_tag(&mut self, name: &str) -> Result<TagId, Error> {
        if let Some(tag) = self.tag_named(name)? {
            return Ok(tag);
        }
        let tag = self.free_tag_id(name)?;
        self.write_label(LabelKey::TagName(tag), &Value::Text(name.into()))?;
        self.write_label(LabelKey::TagDeleted(tag), &Value::Bool(false))?;
        Ok(tag)
    }

    pub fn tag_named(&self, name: &str) -> Result<Option<TagId>, Error> {
        Ok(self
            .connection
            .query_row(TAG_NAMED, [norm(name)], |row| stored_id(row, "tag_id"))
            .optional()?)
    }

    #[tracing::instrument(skip_all, fields(%tag, is_member))]
    pub fn set_tag_members(
        &mut self,
        tag: TagId,
        series: &[SeriesId],
        is_member: bool,
    ) -> Result<(), Error> {
        for series in series {
            self.write_label(
                LabelKey::SeriesTag {
                    series: *series,
                    tag,
                },
                &Value::Bool(is_member),
            )?;
        }
        Ok(())
    }

    #[tracing::instrument(skip_all, fields(%tag))]
    pub fn delete_tag(&mut self, tag: TagId) -> Result<Vec<SeriesId>, Error> {
        let members = self.members_of(SERIES_WITH_TAG, tag.as_bytes())?;
        self.set_tag_members(tag, &members, false)?;
        self.write_label(LabelKey::TagDeleted(tag), &Value::Bool(true))?;
        Ok(members)
    }

    #[tracing::instrument(skip_all, fields(%tag, to))]
    pub fn rename_tag(&mut self, tag: TagId, to: &str) -> Result<TagId, Error> {
        match self.tag_named(to)? {
            Some(target) if target != tag => {
                let members = self.members_of(SERIES_WITH_TAG, tag.as_bytes())?;
                self.set_tag_members(target, &members, true)?;
                self.delete_tag(tag)?;
                Ok(target)
            }
            _ => {
                self.write_label(LabelKey::TagName(tag), &Value::Text(to.into()))?;
                Ok(tag)
            }
        }
    }

    fn free_tag_id(&mut self, name: &str) -> Result<TagId, Error> {
        let derived = TagId::from_name(name)?;
        if !self.has_tag(derived)? {
            return Ok(derived);
        }
        let stamp = self.local.stamp(self.now_unix_ms)?;
        Ok(TagId::minted(name, stamp.node, stamp.hlc)?)
    }

    fn next_category_position(&self) -> Result<u64, Error> {
        let last: u64 = self
            .connection
            .query_row(LAST_CATEGORY_POSITION, [i64::MAX], |row| row.get(0))?;
        Ok(last.saturating_add(GAP_BETWEEN_CATEGORIES))
    }

    fn members_of(&self, query: &str, label: &[u8; 16]) -> Result<Vec<SeriesId>, Error> {
        let mut statement = self.connection.prepare(query)?;
        let series = statement
            .query_map([label], |row| stored_id(row, "series_id"))?
            .collect::<Result<_, _>>()?;
        Ok(series)
    }

    fn write_label(&mut self, key: LabelKey, value: &Value) -> Result<(), Error> {
        self.write(Key::Label(key), MergeClass::LastWriterWins, value)
    }
}
