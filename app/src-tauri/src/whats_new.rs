use omnileaf_engine::{ReleaseNotes, ReleaseNotesError};

const BUNDLED_NOTES: &str = include_str!(env!("OMNILEAF_RELEASE_NOTES"));

pub(crate) fn bundled_notes() -> Result<ReleaseNotes, ReleaseNotesError> {
    ReleaseNotes::parse(BUNDLED_NOTES)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_notes_bundled_into_the_build() {
        let bundled = bundled_notes();

        assert!(bundled.is_ok(), "{bundled:?}");
    }
}
