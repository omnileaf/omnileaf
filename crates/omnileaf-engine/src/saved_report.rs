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
const DAYS_BEFORE_1970_IN_ERA: i64 = 719_468;
const DAYS_PER_ERA: i64 = 146_097;

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
            Some(within_home) => Path::new(HOME_MARK).join(within_home).display().to_string(),
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
    /// Howard Hinnant's `civil_from_days`, which counts in 400-year eras starting on 1 March.
    fn of(day: LocalDay) -> Self {
        let from_era_start = day.0 + DAYS_BEFORE_1970_IN_ERA;
        let era = from_era_start.div_euclid(DAYS_PER_ERA);
        let day_of_era = from_era_start.rem_euclid(DAYS_PER_ERA);
        let year_of_era =
            (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
        let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
        let month_from_march = (5 * day_of_year + 2) / 153;
        let month = if month_from_march < 10 {
            month_from_march + 3
        } else {
            month_from_march - 9
        };
        let year = year_of_era + era * 400 + i64::from(month <= 2);
        Self {
            year,
            month,
            day: day_of_year - (153 * month_from_march + 2) / 5 + 1,
        }
    }
}

impl std::fmt::Display for CalendarDate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }
}
