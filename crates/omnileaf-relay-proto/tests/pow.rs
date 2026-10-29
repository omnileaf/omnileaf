#![expect(
    clippy::unwrap_used,
    reason = "the fixed codes and difficulties are valid, so a failed set-up should stop the test"
)]

use omnileaf_relay_proto::{
    ChallengeId, Platform, ReportCode, StatusKey, StatusKeyHash,
    limits::MAX_ACCEPTED_DIFFICULTY,
    pow::{Difficulty, PROOF_DOMAIN, Puzzle, ReportContent, SUBJECT_DOMAIN, Subject},
};

const EASY_BITS: u32 = 8;

fn code() -> ReportCode {
    ReportCode::try_from("R-7K2M-QX9D".to_owned()).unwrap()
}

fn key_hash(seed: u8) -> StatusKeyHash {
    StatusKey::from_bytes([seed; 32]).hash()
}

fn subject_of(content: &ReportContent<'_>) -> Subject {
    content.subject()
}

fn content<'a>(code: &'a ReportCode, hash: &'a StatusKeyHash) -> ReportContent<'a> {
    ReportContent {
        code,
        platform: Platform::Android,
        version: "0.1.0",
        report: "Report code: R-7K2M-QX9D\nLog, names replaced:\nNothing logged yet.\n",
        reply_to: Some("reader@example.com"),
        status_key_hash: hash,
    }
}

fn easy() -> Difficulty {
    Difficulty::try_from(EASY_BITS).unwrap()
}

fn solved(challenge: &ChallengeId, subject: &Subject) -> u64 {
    Puzzle {
        challenge,
        subject,
        difficulty: easy(),
    }
    .solve(|| false)
    .unwrap()
}

fn leading_zero_bits(challenge: &ChallengeId, subject: &Subject, nonce: u64) -> u32 {
    let mut hasher = blake3::Hasher::new();
    hasher.update(PROOF_DOMAIN.as_bytes());
    hasher.update(challenge.as_bytes());
    hasher.update(subject.as_bytes());
    hasher.update(&nonce.to_le_bytes());
    let digest = hasher.finalize();
    let mut bits = 0;
    for byte in digest.as_bytes() {
        bits += byte.leading_zeros();
        if *byte != 0 {
            break;
        }
    }
    bits
}

#[test]
fn a_solved_nonce_is_accepted() {
    let (code, hash) = (code(), key_hash(1));
    let subject = subject_of(&content(&code, &hash));
    let challenge = ChallengeId::from_bytes([7; 16]);

    let nonce = solved(&challenge, &subject);

    assert!(
        Puzzle {
            challenge: &challenge,
            subject: &subject,
            difficulty: easy()
        }
        .is_solved_by(nonce)
    );
}

#[test]
fn a_digest_one_bit_short_is_rejected() {
    let (code, hash) = (code(), key_hash(1));
    let subject = subject_of(&content(&code, &hash));
    let challenge = ChallengeId::from_bytes([7; 16]);
    let nonce = solved(&challenge, &subject);
    let achieved = leading_zero_bits(&challenge, &subject, nonce);

    let one_more = Difficulty::try_from(achieved + 1).unwrap();

    assert!(
        !Puzzle {
            challenge: &challenge,
            subject: &subject,
            difficulty: one_more
        }
        .is_solved_by(nonce)
    );
}

#[test]
fn changing_any_field_invalidates_the_proof() {
    let (code, hash, other_hash) = (code(), key_hash(1), key_hash(2));
    let other_code = ReportCode::try_from("R-0000-0001".to_owned()).unwrap();
    let original = content(&code, &hash);
    let challenge = ChallengeId::from_bytes([7; 16]);
    let nonce = solved(&challenge, &original.subject());
    let changed = [
        ReportContent {
            code: &other_code,
            ..original
        },
        ReportContent {
            platform: Platform::Ios,
            ..original
        },
        ReportContent {
            version: "0.1.1",
            ..original
        },
        ReportContent {
            report: "Report code: R-7K2M-QX9D\n",
            ..original
        },
        ReportContent {
            reply_to: None,
            ..original
        },
        ReportContent {
            reply_to: Some("other@example.com"),
            ..original
        },
        ReportContent {
            status_key_hash: &other_hash,
            ..original
        },
    ];

    let still_solved: Vec<bool> = changed
        .iter()
        .map(|content| {
            let subject = content.subject();
            Puzzle {
                challenge: &challenge,
                subject: &subject,
                difficulty: easy(),
            }
            .is_solved_by(nonce)
        })
        .collect();

    assert!(
        changed
            .iter()
            .all(|content| content.subject() != original.subject())
    );
    assert_eq!(still_solved.iter().filter(|solved| **solved).count(), 0);
}

#[test]
fn an_empty_reply_address_and_none_differ() {
    let (code, hash) = (code(), key_hash(1));
    let original = content(&code, &hash);

    let empty = ReportContent {
        reply_to: Some(""),
        ..original
    }
    .subject();
    let none = ReportContent {
        reply_to: None,
        ..original
    }
    .subject();

    assert_ne!(empty, none);
}

#[test]
fn a_proof_for_another_challenge_is_rejected() {
    let (code, hash) = (code(), key_hash(1));
    let subject = subject_of(&content(&code, &hash));
    let first = ChallengeId::from_bytes([7; 16]);
    let second = ChallengeId::from_bytes([8; 16]);
    let nonce = solved(&first, &subject);

    let accepted = Puzzle {
        challenge: &second,
        subject: &subject,
        difficulty: easy(),
    }
    .is_solved_by(nonce);

    assert!(!accepted);
}

#[test]
fn refuses_a_difficulty_above_the_maximum() {
    let most = u32::from(MAX_ACCEPTED_DIFFICULTY);

    let at_most = Difficulty::try_from(most);
    let above = Difficulty::try_from(most + 1);

    assert_eq!(at_most.map(Difficulty::bits), Ok(MAX_ACCEPTED_DIFFICULTY));
    assert!(above.is_err());
}

#[test]
fn gives_up_when_asked() {
    let (code, hash) = (code(), key_hash(1));
    let subject = subject_of(&content(&code, &hash));
    let challenge = ChallengeId::from_bytes([7; 16]);
    let hardest = Difficulty::try_from(u32::from(MAX_ACCEPTED_DIFFICULTY)).unwrap();

    let nonce = Puzzle {
        challenge: &challenge,
        subject: &subject,
        difficulty: hardest,
    }
    .solve(|| true);

    assert_eq!(nonce, None);
}

#[test]
fn keeps_its_domain_separation_strings() {
    assert_eq!(SUBJECT_DOMAIN, "omnileaf-relay subject v1");
    assert_eq!(PROOF_DOMAIN, "omnileaf-relay pow v1");
}

#[test]
fn keeps_the_subject_of_a_known_report() {
    let (code, hash) = (code(), key_hash(1));

    let subject = content(&code, &hash).subject();

    assert_eq!(
        blake3::Hash::from_bytes(*subject.as_bytes())
            .to_hex()
            .as_str(),
        "87d2d150d5a31437be5906cbab85f81df7423bdec7db1862c66053296cc669a4"
    );
}
