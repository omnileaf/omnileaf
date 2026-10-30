use std::fmt;

use crate::clock::{SECONDS_PER_DAY, UnixTime};

pub(crate) struct UtcText(pub(crate) UnixTime);

impl fmt::Display for UtcText {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let seconds = self.0.seconds();
        let (year, month, day) = civil_from_days(seconds.div_euclid(SECONDS_PER_DAY));
        let of_day = seconds.rem_euclid(SECONDS_PER_DAY);
        write!(
            f,
            "{year:04}-{month:02}-{day:02} {:02}:{:02} UTC",
            of_day / 3600,
            of_day % 3600 / 60
        )
    }
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    (year, month, day)
}
