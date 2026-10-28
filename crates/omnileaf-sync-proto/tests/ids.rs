use omnileaf_sync_proto::{
    BookId, BookmarkId, CategoryId, Hlc, IdError, NodeId, SeriesId, SourceId, TagId, norm,
};
use proptest::prelude::*;
use uuid::Uuid;

const RANDOM_V4: &str = "3f2b8c1e-9d4a-4e6b-8f1c-2a7d5e9b0c43";
const VERSION_8_NCS_VARIANT: &str = "ab0d5155-6fef-852c-182f-d8add37808d4";

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
fn keeps_tags_and_categories_with_the_same_name_apart() {
    let category = CategoryId::from_name("Sample Shelf").unwrap();

    let tag = TagId::from_name("Sample Shelf").unwrap();

    assert_ne!(category.as_bytes(), tag.as_bytes());
}

#[test]
fn mints_a_tag_id_apart_from_the_one_its_name_derives_and_from_those_of_other_stamps() {
    let node = NodeId::from([0xa0; 16]);

    let minted = TagId::minted("Sample Tag", node, Hlc::from(5)).unwrap();
    let later = TagId::minted("Sample Tag", node, Hlc::from(6)).unwrap();

    assert_ne!(minted, TagId::from_name("Sample Tag").unwrap());
    assert_ne!(minted, later);
    assert_eq!(
        minted,
        TagId::minted("  SAMPLE tag", node, Hlc::from(5)).unwrap()
    );
    assert_eq!(minted.to_string(), "1e5d257b-280f-8994-8b50-6051d9f0a679");
}

#[test]
fn reads_no_membership_field_that_is_not_a_lowercase_hex_id() {
    let tag = TagId::from_name("Sample Tag").unwrap();
    let field = tag.membership_field();

    assert_eq!(TagId::from_membership_field(&field), Some(tag));
    assert_eq!(TagId::from_membership_field(&field.to_uppercase()), None);
    assert_eq!(TagId::from_membership_field("tag.zz"), None);
    assert_eq!(TagId::from_membership_field("cat.0123"), None);
    assert_eq!(CategoryId::from_membership_field(&field), None);
}

#[test]
fn gives_a_page_of_a_book_the_same_bookmark_id_everywhere_and_each_page_its_own() {
    let book: BookId = "a9874d5a-1607-8103-9c82-2ffaf786c06c".parse().unwrap();
    let other_book: BookId = "d1f9e7c0-2a4b-8c3d-9e5f-0a1b2c3d4e5f".parse().unwrap();

    let ids = [
        BookmarkId::of(book, 3),
        BookmarkId::of(book, 3),
        BookmarkId::of(book, 4),
        BookmarkId::of(other_book, 3),
    ];

    assert_eq!(ids[0], ids[1]);
    assert_ne!(ids[0], ids[2]);
    assert_ne!(ids[0], ids[3]);
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
fn reads_the_local_source_id_from_its_stored_bytes() {
    let id = SourceId::local();

    assert_eq!(SourceId::try_from(id.as_bytes().as_slice()).unwrap(), id);
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
fn rejects_a_version_8_uuid_of_another_variant() {
    let parsed = VERSION_8_NCS_VARIANT.parse::<SeriesId>();

    assert!(matches!(parsed, Err(IdError::WrongVariant)));
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
        let tag = TagId::from_name(&name).unwrap();
        prop_assert_eq!(tag.to_string().parse::<TagId>().unwrap(), tag);
        prop_assert_eq!(TagId::try_from(tag.as_bytes().as_slice()).unwrap(), tag);
    }
}

#[test]
fn keeps_same_name_series_folders_in_two_places_apart() {
    let first = SeriesId::folder("Sample Library", &["Author A", "Sample Series 02"]).unwrap();

    let second = SeriesId::folder("Sample Library", &["Author B", "Sample Series 02"]).unwrap();

    assert_ne!(first, second);
}

#[test]
fn keeps_the_same_series_folder_in_two_linked_folders_apart() {
    let first = SeriesId::folder("Sample Library", &["Sample Series 02"]).unwrap();

    let second = SeriesId::folder("Second Library", &["Sample Series 02"]).unwrap();

    assert_ne!(first, second);
}

#[test]
fn gives_series_folders_whose_names_normalise_alike_the_same_series_id() {
    let id = SeriesId::folder("Sample Library", &["Sample Author", "Sample Series 02"]).unwrap();

    let alike = SeriesId::folder(
        " SAMPLE  library",
        &["sample   author", "SAMPLE Series 02 "],
    )
    .unwrap();

    assert_eq!(alike, id);
}

#[test]
fn keeps_a_series_folder_apart_from_the_series_named_like_it() {
    let folder = SeriesId::folder("", &["Sample Series 02"]).unwrap();

    let named = SeriesId::local("Sample Series 02").unwrap();

    assert_ne!(folder, named);
}

#[test]
fn keeps_a_folder_named_with_a_fullwidth_solidus_apart_from_the_folders_it_reads_like() {
    let named = SeriesId::folder("Sample Library", &["Author A\u{ff0f}Sample Series 02"]).unwrap();

    let nested = SeriesId::folder("Sample Library", &["Author A", "Sample Series 02"]).unwrap();

    assert_ne!(named, nested);
}

#[test]
fn gives_series_named_alike_in_one_format_family_the_same_series_id() {
    let id = SeriesId::named("comics", "Sample Series 07").unwrap();

    let alike = SeriesId::named("comics", "  SAMPLE   series 07 ").unwrap();

    assert_eq!(alike, id);
}

#[test]
fn keeps_series_named_alike_in_two_format_families_apart() {
    let comics = SeriesId::named("comics", "Sample Series 07").unwrap();

    let books = SeriesId::named("books", "Sample Series 07").unwrap();

    assert_ne!(comics, books);
}

#[test]
fn keeps_a_named_series_apart_from_the_folder_and_the_series_named_like_it() {
    let named = SeriesId::named("comics", "Sample Series 07").unwrap();

    let others = [
        SeriesId::local("Sample Series 07").unwrap(),
        SeriesId::folder("comics", &["Sample Series 07"]).unwrap(),
    ];

    assert!(!others.contains(&named));
}
