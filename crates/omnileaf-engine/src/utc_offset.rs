use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

/// How many minutes the device's clock is ahead of UTC, crossing IPC as a whole number of minutes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "i16", try_from = "i16")]
pub struct UtcOffset(i16);

#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
#[error(
    "read a UTC offset of {minutes} minutes, beyond the {} minutes either side of UTC a clock can be",
    UtcOffset::FURTHEST_MINUTES
)]
pub struct UtcOffsetOutOfRange {
    minutes: i16,
}

impl UtcOffset {
    pub const UTC: Self = Self(0);
    const FURTHEST_MINUTES: i16 = 18 * 60;

    #[must_use]
    pub const fn minutes(self) -> i16 {
        self.0
    }
}

impl TryFrom<i16> for UtcOffset {
    type Error = UtcOffsetOutOfRange;

    fn try_from(minutes: i16) -> Result<Self, Self::Error> {
        if (-Self::FURTHEST_MINUTES..=Self::FURTHEST_MINUTES).contains(&minutes) {
            Ok(Self(minutes))
        } else {
            Err(UtcOffsetOutOfRange { minutes })
        }
    }
}

impl From<UtcOffset> for i16 {
    fn from(offset: UtcOffset) -> Self {
        offset.0
    }
}

impl Type for UtcOffset {
    fn definition(types: &mut Types) -> DataType {
        i16::definition(types)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn takes_an_offset_of_up_to_eighteen_hours_either_side_of_utc() {
        let taken = [-1080, -210, 0, 345, 1080].map(|minutes| UtcOffset::try_from(minutes).ok());

        assert_eq!(
            taken.map(|offset| offset.map(UtcOffset::minutes)),
            [Some(-1080), Some(-210), Some(0), Some(345), Some(1080)]
        );
    }

    #[test]
    fn refuses_an_offset_beyond_eighteen_hours() {
        let refused =
            [-1081, 1081, i16::MIN, i16::MAX].map(|minutes| UtcOffset::try_from(minutes).is_err());

        assert_eq!(refused, [true; 4]);
    }

    #[test]
    fn reads_an_offset_the_interface_sends_as_a_number_of_minutes() {
        let read: Result<UtcOffset, _> = serde_json::from_str("-300");
        let refused: Result<UtcOffset, _> = serde_json::from_str("1200");

        assert_eq!(read.ok(), UtcOffset::try_from(-300).ok());
        assert!(refused.is_err());
    }
}
