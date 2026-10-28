use omnileaf_sync_proto::{MergeClass, SeriesId, Value};

use super::Writer;
use crate::{
    Error,
    store::{
        key::{Key, SeriesEditKey},
        series_edit::{SeriesEdits, encode_people, encode_tags, series_edits},
    },
};

impl Writer<'_> {
    #[tracing::instrument(skip_all, fields(%series))]
    pub fn edit_series(&mut self, series: SeriesId, edits: SeriesEdits) -> Result<(), Error> {
        let wanted = edits.normalized();
        let kept = series_edits(self.connection, series)?;
        if wanted.title != kept.title {
            self.write_edit(SeriesEditKey::Title(series), &optional_text(wanted.title))?;
        }
        if wanted.summary != kept.summary {
            self.write_edit(
                SeriesEditKey::Summary(series),
                &optional_text(wanted.summary),
            )?;
        }
        if wanted.people != kept.people {
            let people = wanted.people.map(|people| encode_people(&people));
            self.write_edit(SeriesEditKey::People(series), &optional_text(people))?;
        }
        if wanted.tags != kept.tags {
            let tags = wanted.tags.map(|tags| encode_tags(&tags));
            self.write_edit(SeriesEditKey::Tags(series), &optional_text(tags))?;
        }
        if wanted.is_adult != kept.is_adult {
            self.write_edit(SeriesEditKey::Adult(series), &Value::Bool(wanted.is_adult))?;
        }
        Ok(())
    }

    fn write_edit(&mut self, key: SeriesEditKey, value: &Value) -> Result<(), Error> {
        self.write(Key::SeriesEdit(key), MergeClass::LastWriterWins, value)
    }
}

fn optional_text(text: Option<String>) -> Value {
    text.map_or(Value::Null, Value::Text)
}
