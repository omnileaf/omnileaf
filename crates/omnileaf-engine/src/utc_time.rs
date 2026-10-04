const FIRST_WRITABLE_MS: i64 = -62_167_219_200_000;
const LAST_WRITABLE_MS: i64 = 253_402_300_799_999;
const MS_PER_SECOND: i64 = 1_000;
const MS_PER_DAY: i64 = 86_400_000;
const SECONDS_PER_MINUTE: i64 = 60;
const MINUTES_PER_HOUR: i64 = 60;
const DAYS_FROM_YEAR_ZERO_MARCH_TO_EPOCH: i64 = 719_468;
const DAYS_PER_ERA: i64 = 146_097;
const DAYS_PER_CENTURY: i64 = 36_524;
const DAYS_PER_LEAP_CYCLE: i64 = 1_461;
const DAYS_PER_COMMON_YEAR: i64 = 365;
const YEARS_PER_ERA: i64 = 400;
const YEARS_PER_CENTURY: i64 = 100;
const YEARS_PER_LEAP_CYCLE: i64 = 4;
const MONTHS_PER_YEAR: i64 = 12;
const MONTHS_BEFORE_MARCH: i64 = 2;
const MONTHS_PER_MONTH_RUN: i64 = 5;
const DAYS_PER_MONTH_RUN: i64 = 153;
const MONTH_RUN_ROUNDING: i64 = 2;

/// Writes a moment as an RFC 3339 UTC timestamp to the millisecond, holding one outside years 0000 to 9999 at the nearer end.
pub(crate) fn rfc3339_utc(unix_ms: i64) -> String {
    let unix_ms = unix_ms.clamp(FIRST_WRITABLE_MS, LAST_WRITABLE_MS);
    let (year, month, day) = civil_date(unix_ms.div_euclid(MS_PER_DAY));
    let ms_of_day = unix_ms.rem_euclid(MS_PER_DAY);
    let seconds = ms_of_day / MS_PER_SECOND;
    let minutes = seconds / SECONDS_PER_MINUTE;
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        minutes / MINUTES_PER_HOUR,
        minutes % MINUTES_PER_HOUR,
        seconds % SECONDS_PER_MINUTE,
        ms_of_day % MS_PER_SECOND,
    )
}

/// The proleptic Gregorian year, month and day of a day counted from 1970-01-01, by Howard Hinnant's `civil_from_days` over eras of 400 years that start in March.
fn civil_date(days_since_epoch: i64) -> (i64, i64, i64) {
    let days = days_since_epoch + DAYS_FROM_YEAR_ZERO_MARCH_TO_EPOCH;
    let era = days.div_euclid(DAYS_PER_ERA);
    let day_of_era = days.rem_euclid(DAYS_PER_ERA);
    let year_of_era = (day_of_era - day_of_era / (DAYS_PER_LEAP_CYCLE - 1)
        + day_of_era / DAYS_PER_CENTURY
        - day_of_era / (DAYS_PER_ERA - 1))
        / DAYS_PER_COMMON_YEAR;
    let day_of_year = day_of_era
        - (DAYS_PER_COMMON_YEAR * year_of_era + year_of_era / YEARS_PER_LEAP_CYCLE
            - year_of_era / YEARS_PER_CENTURY);
    let month_from_march =
        (MONTHS_PER_MONTH_RUN * day_of_year + MONTH_RUN_ROUNDING) / DAYS_PER_MONTH_RUN;
    let day = day_of_year
        - (DAYS_PER_MONTH_RUN * month_from_march + MONTH_RUN_ROUNDING) / MONTHS_PER_MONTH_RUN
        + 1;
    let month = (month_from_march + MONTHS_BEFORE_MARCH) % MONTHS_PER_YEAR + 1;
    let year = year_of_era + era * YEARS_PER_ERA + i64::from(month <= MONTHS_BEFORE_MARCH);
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use proptest::prelude::*;

    use super::*;

    #[test]
    fn writes_the_epoch_and_a_leap_day_to_the_millisecond() {
        let written = [0, 951_782_400_000, 1_790_000_000_123].map(rfc3339_utc);

        assert_eq!(
            written,
            [
                "1970-01-01T00:00:00.000Z",
                "2000-02-29T00:00:00.000Z",
                "2026-09-21T14:13:20.123Z",
            ]
        );
    }

    #[test]
    fn writes_the_last_moment_of_each_month_of_a_year() {
        let first_of_2025_ms = 1_735_689_600_000;
        let month_lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let ends_ms = month_lengths.iter().scan(first_of_2025_ms, |start, days| {
            *start += days * MS_PER_DAY;
            Some(*start - 1)
        });

        let written: Vec<String> = ends_ms.map(rfc3339_utc).collect();

        assert_eq!(
            written,
            [
                "2025-01-31",
                "2025-02-28",
                "2025-03-31",
                "2025-04-30",
                "2025-05-31",
                "2025-06-30",
                "2025-07-31",
                "2025-08-31",
                "2025-09-30",
                "2025-10-31",
                "2025-11-30",
                "2025-12-31",
            ]
            .map(|day| format!("{day}T23:59:59.999Z"))
        );
    }

    #[test]
    fn writes_a_moment_before_the_epoch() {
        let written = rfc3339_utc(-1);

        assert_eq!(written, "1969-12-31T23:59:59.999Z");
    }

    #[test]
    fn holds_a_moment_outside_four_digit_years_at_the_nearer_end() {
        let written = [i64::MIN, i64::MAX].map(rfc3339_utc);

        assert_eq!(
            written,
            ["0000-01-01T00:00:00.000Z", "9999-12-31T23:59:59.999Z"]
        );
    }

    proptest! {
        #[test]
        fn orders_timestamps_as_text_the_way_their_moments_are_ordered(
            earlier in FIRST_WRITABLE_MS..=LAST_WRITABLE_MS,
            later in FIRST_WRITABLE_MS..=LAST_WRITABLE_MS,
        ) {
            let (earlier, later) = (earlier.min(later), earlier.max(later));

            let (first, second) = (rfc3339_utc(earlier), rfc3339_utc(later));

            prop_assert_eq!(first.len(), "0000-01-01T00:00:00.000Z".len());
            prop_assert!(first <= second);
            prop_assert_eq!(first == second, earlier == later);
        }
    }
}
