use omnileaf_relay_proto::{InvalidReplyAddress, ReplyAddress, limits::REPLY_ADDRESS_BYTES};

fn address_of_length(bytes: usize) -> String {
    let domain = "@example.com";
    format!("{}{domain}", "a".repeat(bytes - domain.len()))
}

#[test]
fn accepts_an_address_at_the_length_cap() {
    let text = address_of_length(REPLY_ADDRESS_BYTES);

    let address = ReplyAddress::parse(&text);

    assert_eq!(address.map(|address| address.as_str().to_owned()), Ok(text));
}

#[test]
fn refuses_an_address_one_byte_over_the_cap() {
    let text = address_of_length(REPLY_ADDRESS_BYTES + 1);

    let address = ReplyAddress::parse(&text);

    assert_eq!(address, Err(InvalidReplyAddress::TooLong));
}

#[test]
fn refuses_an_address_without_an_at() {
    assert_eq!(
        ReplyAddress::parse("reader.example.com"),
        Err(InvalidReplyAddress::NoAt)
    );
}

#[test]
fn refuses_whitespace_and_control_characters() {
    let refused = [
        "reader @example.com",
        "reader@example.com\n",
        "reader\t@example.com",
        "reader\u{7}@example.com",
        "reader\u{a0}@example.com",
    ];

    let errors: Vec<_> = refused.into_iter().map(ReplyAddress::parse).collect();

    assert!(
        errors
            .iter()
            .all(|error| *error == Err(InvalidReplyAddress::Whitespace))
    );
}

#[test]
fn never_prints_the_address_in_debug_output() {
    let address = ReplyAddress::parse("reader@example.com").unwrap();

    let printed = format!("{address:?}");

    assert!(!printed.contains("reader"));
}
