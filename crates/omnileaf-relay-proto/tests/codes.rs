use omnileaf_relay_proto::ReportCode;

#[test]
fn spells_forty_random_bits_as_two_groups_of_four() {
    let code = ReportCode::from_random([0xff, 0x00, 0x00, 0x00, 0x00]);

    assert_eq!(code.as_str(), "R-Z700-0000");
}

#[test]
fn spells_every_bit_of_the_random_bytes() {
    let codes: Vec<String> = (0..40)
        .map(|bit| {
            let mut random = [0u8; 5];
            random[bit / 8] = 1 << (bit % 8);
            ReportCode::from_random(random).to_string()
        })
        .collect();

    let mut distinct = codes.clone();
    distinct.sort();
    distinct.dedup();
    assert_eq!(distinct.len(), 40);
    assert!(
        codes
            .iter()
            .all(|code| ReportCode::try_from(code.clone()).is_ok())
    );
}

#[test]
fn reads_a_code_it_wrote() {
    let written = ReportCode::from_random([1, 2, 3, 4, 5]);

    let read = ReportCode::try_from(written.to_string());

    assert_eq!(read, Ok(written));
}

#[test]
fn refuses_text_that_is_not_a_wide_code() {
    let refused = [
        "",
        "R-7K2M",
        "R-7K2MQX9D",
        "R-7K2M-QX9",
        "R-7K2M-QX9DD",
        "r-7K2M-QX9D",
        "R-7K2M-QX9I",
        "R-7K2M-QX9U",
        "X-7K2M-QX9D",
        "R-7k2m-qx9d",
        "R-7K2M_QX9D",
    ];

    let accepted: Vec<&str> = refused
        .into_iter()
        .filter(|text| ReportCode::try_from((*text).to_owned()).is_ok())
        .collect();

    assert_eq!(accepted, Vec::<&str>::new());
}

#[test]
fn deserializes_only_valid_codes() {
    let valid: Result<ReportCode, _> = serde_json::from_str("\"R-7K2M-QX9D\"");
    let invalid: Result<ReportCode, _> = serde_json::from_str("\"R-7K2M\"");

    assert_eq!(valid.unwrap().as_str(), "R-7K2M-QX9D");
    assert!(invalid.is_err());
}
