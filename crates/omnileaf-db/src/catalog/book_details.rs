use std::collections::BTreeSet;

use omnileaf_sync_proto::BookId;
use rusqlite::{Statement, Transaction};

use crate::{Error, title_key::TitleCollation};

const RECORD_DETAILS: &str = "INSERT INTO book_details (
        book_id, series, number, title, volume, summary, publisher, format, language,
        reading_direction, age_rating, year
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    ON CONFLICT (book_id) DO UPDATE SET
        series = excluded.series,
        number = excluded.number,
        title = excluded.title,
        volume = excluded.volume,
        summary = excluded.summary,
        publisher = excluded.publisher,
        format = excluded.format,
        language = excluded.language,
        reading_direction = excluded.reading_direction,
        age_rating = excluded.age_rating,
        year = excluded.year
    WHERE (series, number, title, volume, summary, publisher, format, language,
            reading_direction, age_rating, year)
        IS NOT (excluded.series, excluded.number, excluded.title, excluded.volume,
            excluded.summary, excluded.publisher, excluded.format, excluded.language,
            excluded.reading_direction, excluded.age_rating, excluded.year)";

const PEOPLE: NamedRows = NamedRows {
    stored: "SELECT role, name FROM book_person WHERE book_id = ?1",
    add: "INSERT INTO book_person (book_id, role, name, name_key) VALUES (?1, ?2, ?3, ?4)",
    remove: "DELETE FROM book_person WHERE book_id = ?1 AND role = ?2 AND name = ?3",
};

const TAGS: NamedRows = NamedRows {
    stored: "SELECT kind, name FROM book_tag WHERE book_id = ?1",
    add: "INSERT INTO book_tag (book_id, kind, name) VALUES (?1, ?2, ?3)",
    remove: "DELETE FROM book_tag WHERE book_id = ?1 AND kind = ?2 AND name = ?3",
};

const GENRE: &str = "genre";
const TAG: &str = "tag";

struct NamedRows {
    stored: &'static str,
    add: &'static str,
    remove: &'static str,
}

type Named = BTreeSet<(String, String)>;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct BookDetails {
    pub series: Option<String>,
    pub number: Option<String>,
    pub title: Option<String>,
    pub volume: Option<u32>,
    pub summary: Option<String>,
    pub people: Vec<BookPerson>,
    pub publisher: Option<String>,
    pub format: Option<String>,
    pub genres: Vec<String>,
    pub tags: Vec<String>,
    pub language: Option<String>,
    pub reading_direction: Option<ReadingDirection>,
    pub age_rating: Option<AgeRating>,
    pub year: Option<u16>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BookPerson {
    pub role: PersonRole,
    pub name: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PersonRole {
    Writer,
    Penciller,
    Inker,
    Colourist,
    Letterer,
    CoverArtist,
    Editor,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReadingDirection {
    LeftToRight,
    RightToLeft,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AgeRating {
    EarlyChildhood,
    Everyone,
    Everyone10,
    G,
    KidsToAdults,
    Pg,
    Teen,
    Ma15,
    Mature17,
    M,
    AdultsOnly18,
    R18,
    X18,
}

pub(crate) struct DetailsRecorder<'t> {
    details: Statement<'t>,
    people: NamedStatements<'t>,
    tags: NamedStatements<'t>,
}

struct NamedStatements<'t> {
    stored: Statement<'t>,
    add: Statement<'t>,
    remove: Statement<'t>,
}

impl<'t> DetailsRecorder<'t> {
    pub(crate) fn new(transaction: &'t Transaction<'_>) -> Result<Self, Error> {
        Ok(Self {
            details: transaction.prepare(RECORD_DETAILS)?,
            people: PEOPLE.prepare(transaction)?,
            tags: TAGS.prepare(transaction)?,
        })
    }

    pub(crate) fn record(
        &mut self,
        book: BookId,
        details: &BookDetails,
        collation: &TitleCollation,
    ) -> Result<(), Error> {
        self.details.execute((
            book.as_bytes(),
            &details.series,
            &details.number,
            &details.title,
            details.volume,
            &details.summary,
            &details.publisher,
            &details.format,
            &details.language,
            details.reading_direction.map(ReadingDirection::as_stored),
            details.age_rating.map(AgeRating::as_stored),
            details.year,
        ))?;
        self.people
            .keep(book, &details.named_people(), |add, role, name| {
                add.execute((book.as_bytes(), role, name, collation.key(name)))
            })?;
        self.tags
            .keep(book, &details.named_tags(), |add, kind, name| {
                add.execute((book.as_bytes(), kind, name))
            })
    }
}

impl BookDetails {
    fn named_people(&self) -> Named {
        self.people
            .iter()
            .map(|person| (person.role.as_stored().to_owned(), person.name.clone()))
            .collect()
    }

    fn named_tags(&self) -> Named {
        let genres = self.genres.iter().map(|genre| (GENRE, genre));
        let tags = self.tags.iter().map(|tag| (TAG, tag));
        genres
            .chain(tags)
            .map(|(kind, name)| (kind.to_owned(), name.clone()))
            .collect()
    }
}

impl NamedRows {
    fn prepare<'t>(&self, transaction: &'t Transaction<'_>) -> Result<NamedStatements<'t>, Error> {
        Ok(NamedStatements {
            stored: transaction.prepare(self.stored)?,
            add: transaction.prepare(self.add)?,
            remove: transaction.prepare(self.remove)?,
        })
    }
}

impl NamedStatements<'_> {
    fn keep(
        &mut self,
        book: BookId,
        wanted: &Named,
        add: impl Fn(&mut Statement<'_>, &str, &str) -> rusqlite::Result<usize>,
    ) -> Result<(), Error> {
        let stored: Named = self
            .stored
            .query_map([book.as_bytes()], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<_, _>>()?;
        for (code, name) in stored.difference(wanted) {
            self.remove.execute((book.as_bytes(), code, name))?;
        }
        for (code, name) in wanted.difference(&stored) {
            add(&mut self.add, code, name)?;
        }
        Ok(())
    }
}

impl PersonRole {
    const ALL: [Self; 7] = [
        Self::Writer,
        Self::Penciller,
        Self::Inker,
        Self::Colourist,
        Self::Letterer,
        Self::CoverArtist,
        Self::Editor,
    ];

    pub(crate) fn stored(name: String) -> Result<Self, Error> {
        Self::ALL
            .into_iter()
            .find(|role| role.as_stored() == name)
            .ok_or(Error::UnsupportedPersonRole { name })
    }

    const fn as_stored(self) -> &'static str {
        match self {
            Self::Writer => "writer",
            Self::Penciller => "penciller",
            Self::Inker => "inker",
            Self::Colourist => "colourist",
            Self::Letterer => "letterer",
            Self::CoverArtist => "cover_artist",
            Self::Editor => "editor",
        }
    }
}

impl ReadingDirection {
    const fn as_stored(self) -> &'static str {
        match self {
            Self::LeftToRight => "left_to_right",
            Self::RightToLeft => "right_to_left",
        }
    }
}

impl AgeRating {
    const fn as_stored(self) -> &'static str {
        match self {
            Self::EarlyChildhood => "early_childhood",
            Self::Everyone => "everyone",
            Self::Everyone10 => "everyone_10",
            Self::G => "g",
            Self::KidsToAdults => "kids_to_adults",
            Self::Pg => "pg",
            Self::Teen => "teen",
            Self::Ma15 => "ma_15",
            Self::Mature17 => "mature_17",
            Self::M => "m",
            Self::AdultsOnly18 => "adults_only_18",
            Self::R18 => "r_18",
            Self::X18 => "x_18",
        }
    }
}
