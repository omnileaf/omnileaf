use omnileaf_sync_proto::{CategoryId, IdError, SeriesId, norm};
use proptest::prelude::*;
use uuid::Uuid;

const RANDOM_V4: &str = "3f2b8c1e-9d4a-4e6b-8f1c-2a7d5e9b0c43";

#[test]
fn gives_folder_names_that_normalise_alike_the_same_series_id() {
    let id = SeriesId::local("Sample Series 03").unwrap();

    assert_eq!(SeriesId::local("  SAMPLE   series 03 ").unwrap(), id);
}

#[test]
fn gives_different_folder_names_different_series_ids() {
    let id = SeriesId::local("Sample Series 03").unwrap();

    assert_ne!(SeriesId::local("Sample Series 04").unwrap(), id);
}

#[test]
fn keeps_series_and_categories_with_the_same_name_apart() {
    let series = SeriesId::local("Sample Shelf").unwrap();

    let category = CategoryId::from_name("Sample Shelf").unwrap();

    assert_ne!(series.as_bytes(), category.as_bytes());
}

#[test]
fn derives_version_8_uuids_with_the_standard_variant() {
    let id = SeriesId::local("Sample Series 03").unwrap().to_string();

    assert_eq!(id.len(), 36);
    assert_eq!(id.chars().nth(14), Some('8'));
    assert!(matches!(id.chars().nth(19), Some('8' | '9' | 'a' | 'b')));
}

#[test]
fn parses_its_own_string_form() {
    let id = CategoryId::from_name("Sample Shelf").unwrap();

    assert_eq!(id.to_string().parse::<CategoryId>().unwrap(), id);
}

#[test]
fn reads_its_own_stored_bytes() {
    let id = SeriesId::local("Sample Series 03").unwrap();

    assert_eq!(SeriesId::try_from(id.as_bytes().as_slice()).unwrap(), id);
}

#[test]
fn rejects_text_that_is_not_a_uuid() {
    let parsed = "sample-series".parse::<SeriesId>();

    assert!(matches!(parsed, Err(IdError::Malformed(_))));
}

#[test]
fn rejects_a_uuid_that_was_not_derived() {
    let parsed = RANDOM_V4.parse::<SeriesId>();

    assert!(matches!(parsed, Err(IdError::NotDerived { version: 4 })));
}

#[test]
fn rejects_stored_bytes_of_the_wrong_length() {
    let read = SeriesId::try_from([8_u8; 15].as_slice());

    assert!(matches!(read, Err(IdError::WrongLength { length: 15 })));
}

#[test]
fn rejects_stored_bytes_that_were_not_derived() {
    let random = Uuid::parse_str(RANDOM_V4).unwrap();

    let read = SeriesId::try_from(random.as_bytes().as_slice());

    assert!(matches!(read, Err(IdError::NotDerived { version: 4 })));
}

proptest! {
    #[test]
    fn derives_the_same_series_id_every_time(name in any::<String>()) {
        prop_assert_eq!(SeriesId::local(&name).unwrap(), SeriesId::local(&name).unwrap());
    }

    #[test]
    fn derives_the_series_id_of_the_normalised_name(name in any::<String>()) {
        prop_assert_eq!(SeriesId::local(&norm(&name)).unwrap(), SeriesId::local(&name).unwrap());
    }

    #[test]
    fn round_trips_every_derived_id_through_text_and_bytes(name in any::<String>()) {
        let id = CategoryId::from_name(&name).unwrap();

        prop_assert_eq!(id.to_string().parse::<CategoryId>().unwrap(), id);
        prop_assert_eq!(CategoryId::try_from(id.as_bytes().as_slice()).unwrap(), id);
    }
}
