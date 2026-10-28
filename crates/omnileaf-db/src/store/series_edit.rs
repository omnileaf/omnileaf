use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, OptionalExtension};

use crate::{Error, catalog::PersonRole};

const LINE_BREAK: char = '\n';
const ROLE_SEPARATOR: char = '\t';
const TITLE_AND_FLAGS: &str = "SELECT title, summary, is_adult, has_people, has_tags
    FROM series_edit WHERE series_id = ?1";
const PEOPLE: &str = "SELECT role, name FROM series_edit_person WHERE series_id = ?1
    ORDER BY position";
const TAGS: &str = "SELECT name FROM series_edit_tag WHERE series_id = ?1 ORDER BY position";

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SeriesEdits {
    pub title: Option<String>,
    pub summary: Option<String>,
    pub people: Option<Vec<EditedPerson>>,
    pub tags: Option<Vec<String>>,
    pub is_adult: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EditedPerson {
    pub name: String,
    pub roles: Vec<PersonRole>,
}

impl SeriesEdits {
    /// A name or tag with a line break or tab is written with a space, because the registers keep lists as lines.
    #[must_use]
    pub fn normalized(self) -> Self {
        Self {
            title: self.title.as_deref().and_then(clean),
            summary: self.summary,
            people: self.people.map(clean_people),
            tags: self.tags.as_deref().map(clean_tags),
            is_adult: self.is_adult,
        }
    }

    pub(crate) const fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.summary.is_none()
            && self.people.is_none()
            && self.tags.is_none()
            && !self.is_adult
    }
}

fn clean(text: &str) -> Option<String> {
    let spaced: String = text
        .chars()
        .map(|character| match character {
            '\n' | '\r' | '\t' => ' ',
            other => other,
        })
        .collect();
    let trimmed = spaced.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

fn clean_people(people: Vec<EditedPerson>) -> Vec<EditedPerson> {
    let mut cleaned: Vec<EditedPerson> = Vec::new();
    for person in people {
        let Some(name) = clean(&person.name) else {
            continue;
        };
        let index = cleaned
            .iter()
            .position(|kept| kept.name == name)
            .unwrap_or_else(|| {
                cleaned.push(EditedPerson {
                    name,
                    roles: Vec::new(),
                });
                cleaned.len() - 1
            });
        if let Some(kept) = cleaned.get_mut(index) {
            for role in person.roles {
                if !kept.roles.contains(&role) {
                    kept.roles.push(role);
                }
            }
        }
    }
    cleaned
}

fn clean_tags(tags: &[String]) -> Vec<String> {
    let mut cleaned: Vec<String> = Vec::new();
    for tag in tags.iter().filter_map(|tag| clean(tag)) {
        if !cleaned.contains(&tag) {
            cleaned.push(tag);
        }
    }
    cleaned
}

pub(crate) fn encode_people(people: &[EditedPerson]) -> String {
    let mut lines = Vec::new();
    for person in people {
        if person.roles.is_empty() {
            lines.push(format!("{ROLE_SEPARATOR}{}", person.name));
        }
        for role in &person.roles {
            lines.push(format!(
                "{}{ROLE_SEPARATOR}{}",
                role.as_stored(),
                person.name
            ));
        }
    }
    lines.join(&LINE_BREAK.to_string())
}

pub(crate) fn decode_people(text: &str) -> Vec<EditedPerson> {
    let mut people = Vec::new();
    for line in text.split(LINE_BREAK) {
        let Some((code, name)) = line.split_once(ROLE_SEPARATOR) else {
            continue;
        };
        let roles = match code {
            "" => Vec::new(),
            code => match PersonRole::ALL
                .into_iter()
                .find(|role| role.as_stored() == code)
            {
                Some(role) => vec![role],
                None => continue,
            },
        };
        people.push(EditedPerson {
            name: name.to_owned(),
            roles,
        });
    }
    clean_people(people)
}

pub(crate) fn encode_tags(tags: &[String]) -> String {
    tags.join(&LINE_BREAK.to_string())
}

pub(crate) fn decode_tags(text: &str) -> Vec<String> {
    clean_tags(
        &text
            .split(LINE_BREAK)
            .map(str::to_owned)
            .collect::<Vec<_>>(),
    )
}

pub fn series_edits(connection: &Connection, series: SeriesId) -> Result<SeriesEdits, Error> {
    let id = series.as_bytes();
    let Some((title, summary, is_adult, has_people, has_tags)) = connection
        .prepare(TITLE_AND_FLAGS)?
        .query_row([id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get::<_, bool>(2)?,
                row.get::<_, bool>(3)?,
                row.get::<_, bool>(4)?,
            ))
        })
        .optional()?
    else {
        return Ok(SeriesEdits::default());
    };
    let people = if has_people {
        Some(stored_people(connection, id)?)
    } else {
        None
    };
    let tags = if has_tags {
        Some(
            connection
                .prepare(TAGS)?
                .query_map([id], |row| row.get(0))?
                .collect::<Result<_, _>>()?,
        )
    } else {
        None
    };
    Ok(SeriesEdits {
        title,
        summary,
        people,
        tags,
        is_adult,
    })
}

fn stored_people(connection: &Connection, id: &[u8; 16]) -> Result<Vec<EditedPerson>, Error> {
    let rows: Vec<(String, String)> = connection
        .prepare(PEOPLE)?
        .query_map([id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let mut people: Vec<EditedPerson> = Vec::new();
    for (code, name) in rows {
        let role = PersonRole::ALL
            .into_iter()
            .find(|role| role.as_stored() == code);
        match people.last_mut() {
            Some(person) if person.name == name => person.roles.extend(role),
            _ => people.push(EditedPerson {
                name,
                roles: role.into_iter().collect(),
            }),
        }
    }
    Ok(people)
}
