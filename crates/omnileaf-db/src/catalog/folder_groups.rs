use std::{
    fmt,
    path::{Path, PathBuf},
    str::FromStr,
};

use rusqlite::{Connection, Params, Row, named_params};

use crate::{
    Error,
    adult_content::AdultHiding,
    catalog::{
        RootId,
        cursor::{Position, hex_bytes, write_hex},
        native_path,
        page::{Page, PageRequest},
    },
    title_key::TitleCollation,
};

macro_rules! groups_of_listed_series {
    () => {
        concat!(
            "SELECT series_folder.root_id, series_folder.group_location,
            count(DISTINCT series_folder.series_local_id) AS series_count
        FROM series_folder
        JOIN series ON series.local_id = series_folder.series_local_id
        WHERE series.reading_stage IS NOT NULL AND NOT ",
            $crate::adult_content::in_hidden_adult_series!("series")
        )
    };
}

macro_rules! in_group_order {
    () => {
        " GROUP BY series_folder.group_key, series_folder.root_id, series_folder.group_location
        ORDER BY series_folder.group_key, series_folder.root_id, series_folder.group_location
        LIMIT :limit"
    };
}

const FIRST_GROUPS: &str = concat!(groups_of_listed_series!(), in_group_order!());
const GROUPS_AFTER: &str = concat!(
    groups_of_listed_series!(),
    " AND (series_folder.group_key, series_folder.root_id, series_folder.group_location)
        > (:after_key, :after_root, :after_location)",
    in_group_order!()
);

const GROUPS: &str = "SELECT DISTINCT root_id, group_location FROM series_folder";
const REKEY_GROUP: &str = "UPDATE series_folder SET group_key = ?3
     WHERE root_id = ?1 AND group_location = ?2 AND group_key IS NOT ?3";

const NESTED_GROUP: u8 = 1;
const FOLDER_END: u8 = 0;
const ROOT_ID_LENGTH: usize = size_of::<i64>();

/// A linked folder's own group has an empty location, and any other group the path of the folder holding series folders.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FolderGroup {
    pub root: RootId,
    pub location: PathBuf,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FolderGroupSummary {
    pub group: FolderGroup,
    pub series_count: u32,
}

#[tracing::instrument(skip_all, fields(size = ?request.size))]
pub fn folder_groups(
    connection: &Connection,
    request: &PageRequest,
    hiding: AdultHiding,
) -> Result<Page<FolderGroupSummary>, Error> {
    let limit = request.size.rows_to_fetch();
    let rows = match request.after.as_ref().map(|cursor| &cursor.0) {
        None => listed(
            connection,
            FIRST_GROUPS,
            named_params! {
                ":limit": limit,
                ":leaves_out_adult": hiding.leaves_out_adult,
                ":counts_age_ratings": hiding.counts_age_ratings,
            },
        ),
        Some(Position::FolderGroup { root, location }) => {
            let group = native_path::from_bytes(location.clone()).ok_or(Error::MalformedCursor)?;
            let key = group_key(&TitleCollation::stored(connection)?, &group);
            listed(
                connection,
                GROUPS_AFTER,
                named_params! {
                    ":limit": limit,
                    ":after_key": key,
                    ":after_root": root,
                    ":after_location": location,
                    ":leaves_out_adult": hiding.leaves_out_adult,
                    ":counts_age_ratings": hiding.counts_age_ratings,
                },
            )
        }
        Some(
            Position::Title { .. }
            | Position::Added { .. }
            | Position::Book { .. }
            | Position::Root { .. }
            | Position::LastRead { .. }
            | Position::Session { .. }
            | Position::LastUpdated { .. }
            | Position::UnreadCount { .. }
            | Position::TimeLeft { .. }
            | Position::Writer { .. }
            | Position::Chapter { .. },
        ) => Err(Error::CursorForAnotherList),
    }?;
    Ok(Page::of(rows, request.size))
}

/// Sorts a linked folder's own group first, then each other group by its folders in title order, a folder before those inside it.
pub(crate) fn group_key(collation: &TitleCollation, group: &Path) -> Vec<u8> {
    let mut folders = group.iter().peekable();
    if folders.peek().is_none() {
        return Vec::new();
    }
    let mut key = vec![NESTED_GROUP];
    for folder in folders {
        key.extend(collation.key(&folder.to_string_lossy()));
        key.push(FOLDER_END);
    }
    key
}

pub(crate) fn rekey_every_folder_group(
    connection: &Connection,
    collation: &TitleCollation,
) -> Result<usize, Error> {
    let groups = connection
        .prepare(GROUPS)?
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Vec<u8>>(1)?,
                native_path::stored_native_path(row, 1)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut rekey = connection.prepare(REKEY_GROUP)?;
    for (root, location, group) in &groups {
        rekey.execute((root, location, group_key(collation, group)))?;
    }
    Ok(groups.len())
}

fn listed(
    connection: &Connection,
    sql: &str,
    params: impl Params,
) -> Result<Vec<(FolderGroupSummary, Position)>, Error> {
    Ok(connection
        .prepare(sql)?
        .query_map(params, group_row)?
        .collect::<Result<_, _>>()?)
}

fn group_row(row: &Row<'_>) -> rusqlite::Result<(FolderGroupSummary, Position)> {
    let root: i64 = row.get("root_id")?;
    let location: Vec<u8> = row.get("group_location")?;
    let summary = FolderGroupSummary {
        group: FolderGroup {
            root: RootId(root),
            location: native_path::stored_native_path(row, 1)?,
        },
        series_count: row.get("series_count")?,
    };
    Ok((summary, Position::FolderGroup { root, location }))
}

impl fmt::Display for FolderGroup {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let bytes = [
            &self.root.0.to_be_bytes()[..],
            &native_path::to_bytes(&self.location),
        ]
        .concat();
        write_hex(&bytes, formatter)
    }
}

impl FromStr for FolderGroup {
    type Err = Error;

    fn from_str(text: &str) -> Result<Self, Error> {
        hex_bytes(text)
            .and_then(|bytes| {
                let (root, location) = bytes.split_first_chunk::<ROOT_ID_LENGTH>()?;
                Some(Self {
                    root: RootId(i64::from_be_bytes(*root)),
                    location: native_path::from_bytes(location.to_vec())?,
                })
            })
            .ok_or(Error::MalformedFolderGroupId)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn walks_the_folder_groups_in_key_order_without_sorting() {
        let scratch = ScratchLibrary::new("folder-groups-plan");

        let plans = [FIRST_GROUPS, GROUPS_AFTER].map(|query| scratch.query_plan(query));

        let walked = [
            "SCAN series_folder USING COVERING INDEX series_folder_by_group",
            "SEARCH series_folder USING COVERING INDEX series_folder_by_group ((group_key,root_id,group_location)>(?,?,?))",
        ];
        for (plan, walk) in plans.iter().zip(walked) {
            assert_eq!(
                plan,
                &[walk, "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)"]
            );
        }
    }

    #[test]
    fn keys_each_folder_group_again_through_the_group_index() {
        let scratch = ScratchLibrary::new("rekey-folder-groups-plan");

        let plans = [GROUPS, REKEY_GROUP].map(|query| scratch.query_plan(query));

        assert_eq!(
            plans,
            [
                ["SCAN series_folder USING COVERING INDEX series_folder_in_group"],
                [
                    "SEARCH series_folder USING INDEX series_folder_in_group (root_id=? AND group_location=?)"
                ],
            ]
        );
    }
}
