/// Writes a unix time as `2025-03-01 14:05 UTC`, using the proleptic Gregorian calendar.
pub(crate) fn utc_minute(seconds: u64) -> String {
    let days = i64::try_from(seconds / 86_400).unwrap_or(0);
    let of_day = seconds % 86_400;
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02} UTC",
        of_day / 3_600,
        of_day % 3_600 / 60
    )
}

#[cfg(test)]
mod tests {
    use super::utc_minute;

    #[test]
    fn writes_the_epoch() {
        assert_eq!(utc_minute(0), "1970-01-01 00:00 UTC");
    }

    #[test]
    fn writes_a_leap_day_and_the_end_of_a_year() {
        assert_eq!(utc_minute(1_709_210_100), "2024-02-29 12:35 UTC");
        assert_eq!(utc_minute(1_767_225_540), "2025-12-31 23:59 UTC");
    }
}
