use rusqlite::{Connection, OptionalExtension, Row, Transaction};

use crate::Error;

const THE_CHOICE: i64 = 1;

const STORED_CHOICE: &str = "SELECT treatment, counts_age_ratings
    FROM adult_content
    WHERE id = ?1";

const SET_CHOICE: &str = "INSERT INTO adult_content (id, treatment, counts_age_ratings)
    VALUES (?1, ?2, ?3)
    ON CONFLICT (id) DO UPDATE SET
        treatment = excluded.treatment,
        counts_age_ratings = excluded.counts_age_ratings";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AdultTreatment {
    Show,
    Blur,
    Hide,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StoredAdultContent {
    pub treatment: AdultTreatment,
    pub counts_age_ratings: bool,
}

pub fn adult_content(connection: &Connection) -> Result<Option<StoredAdultContent>, Error> {
    let row = connection
        .prepare(STORED_CHOICE)?
        .query_row([THE_CHOICE], ChoiceRow::read)
        .optional()?;
    row.map(StoredAdultContent::try_from).transpose()
}

pub fn set_adult_content(
    transaction: &Transaction<'_>,
    content: &StoredAdultContent,
) -> Result<(), Error> {
    transaction.prepare(SET_CHOICE)?.execute((
        THE_CHOICE,
        content.treatment.as_stored(),
        content.counts_age_ratings,
    ))?;
    Ok(())
}

struct ChoiceRow {
    treatment: String,
    counts_age_ratings: bool,
}

impl ChoiceRow {
    fn read(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            treatment: row.get(0)?,
            counts_age_ratings: row.get(1)?,
        })
    }
}

impl TryFrom<ChoiceRow> for StoredAdultContent {
    type Error = Error;

    fn try_from(row: ChoiceRow) -> Result<Self, Self::Error> {
        Ok(Self {
            treatment: AdultTreatment::stored(row.treatment)?,
            counts_age_ratings: row.counts_age_ratings,
        })
    }
}

impl AdultTreatment {
    const fn as_stored(self) -> &'static str {
        match self {
            Self::Show => "show",
            Self::Blur => "blur",
            Self::Hide => "hide",
        }
    }

    fn stored(name: String) -> Result<Self, Error> {
        [Self::Show, Self::Blur, Self::Hide]
            .into_iter()
            .find(|treatment| treatment.as_stored() == name)
            .ok_or(Error::UnsupportedAdultTreatment { name })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn reads_the_choice_by_its_key() {
        let scratch = ScratchLibrary::new("adult-content-plan");

        let plan = scratch.query_plan(STORED_CHOICE);

        assert_eq!(
            plan,
            ["SEARCH adult_content USING INTEGER PRIMARY KEY (rowid=?)"]
        );
    }

    #[test]
    fn refuses_a_treatment_this_build_does_not_know() {
        let refused = AdultTreatment::stored("fade".to_owned());

        assert!(matches!(
            refused,
            Err(Error::UnsupportedAdultTreatment { name }) if name == "fade"
        ));
    }
}
