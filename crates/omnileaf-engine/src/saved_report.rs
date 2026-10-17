use std::{
    fs::{self, OpenOptions},
    io::{self, Write as _},
    path::{Path, PathBuf},
};

use serde::Serialize;
use specta::Type;

use crate::{LocalDay, Platform, ProblemReport};

const FILE_PREFIX: &str = "omnileaf-report-";
const FILE_EXTENSION: &str = "txt";
const MOST_FILES_A_DAY: u32 = 100;
const HOME_MARK: &str = "~";
const DAYS_FROM_ERA_START_TO_1970: i64 = 719_468;
const DAYS_PER_YEAR: i64 = 365;
const DAYS_PER_FOUR_YEARS: i64 = 1_461;
const DAYS_PER_CENTURY: i64 = 36_524;
const DAYS_PER_ERA: i64 = 146_097;
const YEARS_PER_LEAP_YEAR: i64 = 4;
const YEARS_PER_CENTURY: i64 = 100;
const YEARS_PER_ERA: i64 = 400;
const MONTHS_PER_YEAR: i64 = 12;
const MARCH: i64 = 3;
const MONTHS_IN_A_RUN: i64 = 5;
const DAYS_IN_A_RUN_FROM_MARCH: i64 = 153;
const RUN_ROUNDING: i64 = 2;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SavedProblemReport {
    pub place: SavedPlace,
    pub file: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum SavedPlace {
    Folder { folder: String },
    AppFiles,
}

impl ProblemReport {
    pub fn save_in(&self, folder: &Path, day: LocalDay) -> io::Result<PathBuf> {
        let stem = format!("{FILE_PREFIX}{}", CalendarDate::of(day));
        let text = self.to_string();
        for copy in 1..=MOST_FILES_A_DAY {
            let path = folder.join(file_name(&stem, copy));
            match OpenOptions::new().write(true).create_new(true).open(&path) {
                Ok(file) => return write_new(file, &path, &text).map(|()| path),
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error),
            }
        }
        Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            format!(
                "save a problem report: {MOST_FILES_A_DAY} files named {stem} are there already"
            ),
        ))
    }
}

fn file_name(stem: &str, copy: u32) -> String {
    match copy {
        1 => format!("{stem}.{FILE_EXTENSION}"),
        _ => format!("{stem}-{copy}.{FILE_EXTENSION}"),
    }
}

fn write_new(mut file: fs::File, path: &Path, text: &str) -> io::Result<()> {
    file.write_all(text.as_bytes()).inspect_err(|_| {
        if let Err(error) = fs::remove_file(path) {
            tracing::warn!(%error, "remove a problem report left half written");
        }
    })
}

#[must_use]
pub fn folder_shown(folder: &Path, home: Option<&Path>, platform: Platform) -> String {
    match platform {
        Platform::Linux => match home.and_then(|home| folder.strip_prefix(home).ok()) {
            Some(within_home) => format!("{HOME_MARK}/{}", within_home.display()),
            None => folder.display().to_string(),
        },
        Platform::Android | Platform::Ios | Platform::Macos | Platform::Windows => {
            folder.file_name().map_or_else(
                || folder.display().to_string(),
                |name| name.to_string_lossy().into_owned(),
            )
        }
    }
}

struct CalendarDate {
    year: i64,
    month: i64,
    day: i64,
}

impl CalendarDate {
    fn of(day: LocalDay) -> Self {
        let from_era_start = day.0 + DAYS_FROM_ERA_START_TO_1970;
        let era = from_era_start.div_euclid(DAYS_PER_ERA);
        let day_of_era = from_era_start.rem_euclid(DAYS_PER_ERA);
        let year_of_era = year_of_era(day_of_era);
        let day_of_year = day_of_era - days_before_year_of_era(year_of_era);
        let month_from_march = month_from_march(day_of_year);
        let month = (month_from_march + MARCH - 1).rem_euclid(MONTHS_PER_YEAR) + 1;
        Self {
            year: year_of_era + era * YEARS_PER_ERA + i64::from(month < MARCH),
            month,
            day: day_of_year - days_before_month_from_march(month_from_march) + 1,
        }
    }
}

fn year_of_era(day_of_era: i64) -> i64 {
    let leap_days = day_of_era / (DAYS_PER_FOUR_YEARS - 1) - day_of_era / DAYS_PER_CENTURY
        + day_of_era / (DAYS_PER_ERA - 1);
    (day_of_era - leap_days) / DAYS_PER_YEAR
}

fn days_before_year_of_era(year_of_era: i64) -> i64 {
    DAYS_PER_YEAR * year_of_era + year_of_era / YEARS_PER_LEAP_YEAR
        - year_of_era / YEARS_PER_CENTURY
}

fn month_from_march(day_of_year: i64) -> i64 {
    (MONTHS_IN_A_RUN * day_of_year + RUN_ROUNDING) / DAYS_IN_A_RUN_FROM_MARCH
}

fn days_before_month_from_march(month_from_march: i64) -> i64 {
    (DAYS_IN_A_RUN_FROM_MARCH * month_from_march + RUN_ROUNDING) / MONTHS_IN_A_RUN
}

impl std::fmt::Display for CalendarDate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }
}
