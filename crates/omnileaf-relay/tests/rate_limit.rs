#![expect(
    clippy::unwrap_used,
    reason = "the scratch database and requests are fixtures, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "each test file uses the part of the harness it needs"
)]
mod support;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use omnileaf_relay::{ActionLimit, Limits, Store};
use omnileaf_testkit::ScratchFolder;
use rusqlite::{Connection, types::ValueRef};
use serde_json::json;
use support::{TestRelay, relay_limited, relay_with, settings};

const HOUR: i64 = 60 * 60;
const DAY: i64 = 24 * HOUR;

fn limits(per_hour: u32, per_day: u32) -> Limits {
    Limits {
        challenge: ActionLimit { per_hour, per_day },
        ..Limits::default()
    }
}

async fn challenge_from(relay: &TestRelay, ip: &str) -> StatusCode {
    relay
        .post_from(ip, "/relay/v1/challenges", &json!({}))
        .await
        .status
}

#[tokio::test]
async fn limits_an_address_within_the_hour() {
    let relay = relay_limited(limits(2, 10));
    challenge_from(&relay, "203.0.113.7").await;
    challenge_from(&relay, "203.0.113.7").await;

    let answer = relay
        .post_from("203.0.113.7", "/relay/v1/challenges", &json!({}))
        .await;

    assert_eq!(answer.status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(answer.body["error"]["code"], "rateLimited");
    assert_eq!(answer.headers["retry-after"], (HOUR).to_string().as_str());
}

#[tokio::test]
async fn lets_an_address_in_again_the_next_hour() {
    let relay = relay_limited(limits(1, 10));
    challenge_from(&relay, "203.0.113.7").await;
    relay.clock.advance(HOUR);

    let status = challenge_from(&relay, "203.0.113.7").await;

    assert_eq!(status, StatusCode::CREATED);
}

#[tokio::test]
async fn limits_an_address_within_the_day_until_the_next_day() {
    let relay = relay_limited(limits(1, 2));
    challenge_from(&relay, "203.0.113.7").await;
    relay.clock.advance(HOUR);
    challenge_from(&relay, "203.0.113.7").await;
    relay.clock.advance(HOUR);

    let answer = relay
        .post_from("203.0.113.7", "/relay/v1/challenges", &json!({}))
        .await;

    assert_eq!(answer.status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(
        answer.headers["retry-after"],
        (DAY - 2 * HOUR).to_string().as_str()
    );
}

#[tokio::test]
async fn counts_each_address_on_its_own() {
    let relay = relay_limited(limits(1, 10));
    challenge_from(&relay, "203.0.113.7").await;

    let status = challenge_from(&relay, "203.0.113.8").await;

    assert_eq!(status, StatusCode::CREATED);
}

#[tokio::test]
async fn counts_an_ipv6_site_prefix_as_one_address() {
    let relay = relay_limited(limits(1, 10));
    challenge_from(&relay, "2001:db8:1:2::1").await;

    let same_site = challenge_from(&relay, "2001:db8:1:ff00::9").await;
    let other_site = challenge_from(&relay, "2001:db8:2:2::1").await;

    assert_eq!(same_site, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(other_site, StatusCode::CREATED);
}

#[tokio::test]
async fn counts_requests_without_a_client_address_together() {
    let relay = relay_limited(limits(1, 10));
    let unaddressed = || {
        Request::post("/relay/v1/challenges")
            .header("content-type", "application/json")
            .body(Body::from("{}"))
            .unwrap()
    };
    relay.send(unaddressed()).await;

    let second = relay.send(unaddressed()).await;

    assert_eq!(second.status, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn forgets_old_salts_and_counts_the_next_day() {
    let folder = ScratchFolder::new("relay-rollover");
    let path = folder.path().join("relay.sqlite3");
    let relay = relay_with(settings(limits(1, 1)), Store::open(&path).unwrap());
    challenge_from(&relay, "203.0.113.7").await;
    relay.clock.advance(DAY);

    let status = challenge_from(&relay, "203.0.113.7").await;

    let database = Connection::open(&path).unwrap();
    let salts: i64 = database
        .query_row("SELECT count(*) FROM ip_salts", [], |row| row.get(0))
        .unwrap();
    let counts: i64 = database
        .query_row("SELECT count(*) FROM ip_counts", [], |row| row.get(0))
        .unwrap();
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!((salts, counts), (1, 1));
}

#[tokio::test]
async fn never_writes_a_client_address_to_the_database() {
    let folder = ScratchFolder::new("relay-no-addresses");
    let path = folder.path().join("relay.sqlite3");
    let relay = relay_with(settings(Limits::default()), Store::open(&path).unwrap());
    let addresses = ["203.0.113.7", "198.51.100.23", "2001:db8:1:2::1"];
    for address in addresses {
        let challenge: omnileaf_relay_proto::Challenge = serde_json::from_value(
            relay
                .post_from(address, "/relay/v1/challenges", &json!({}))
                .await
                .body,
        )
        .unwrap();
        let draft = support::draft("R-7K2M-QX9D");
        relay
            .post_from(address, "/relay/v1/reports", &draft.solved_for(&challenge))
            .await;
        relay
            .post_from(
                address,
                "/relay/v1/reports/statuses",
                &json!({ "reports": [{ "code": "R-7K2M-QX9D", "statusKey": draft.status_key }] }),
            )
            .await;
    }

    let stored = every_stored_value(&Connection::open(&path).unwrap());

    let leaks: Vec<&Vec<u8>> = stored
        .iter()
        .filter(|value| {
            addresses.iter().any(|address| {
                let text = address.as_bytes();
                let raw: Vec<u8> = match address.parse::<std::net::IpAddr>().unwrap() {
                    std::net::IpAddr::V4(v4) => v4.octets().to_vec(),
                    std::net::IpAddr::V6(v6) => v6.octets()[..6].to_vec(),
                };
                contains(value, text) || contains(value, &raw)
            })
        })
        .collect();
    assert!(!stored.is_empty());
    assert!(
        leaks.is_empty(),
        "{} stored values hold a client address",
        leaks.len()
    );
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

fn every_stored_value(database: &Connection) -> Vec<Vec<u8>> {
    let mut tables = database
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
        .unwrap();
    let names: Vec<String> = tables
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    let mut values = Vec::new();
    for name in names {
        let mut rows = database
            .prepare(&format!("SELECT * FROM \"{name}\""))
            .unwrap();
        let columns = rows.column_count();
        let mut cursor = rows.query([]).unwrap();
        while let Some(row) = cursor.next().unwrap() {
            for column in 0..columns {
                values.push(match row.get_ref(column).unwrap() {
                    ValueRef::Null => Vec::new(),
                    ValueRef::Integer(number) => number.to_string().into_bytes(),
                    ValueRef::Real(number) => number.to_string().into_bytes(),
                    ValueRef::Text(bytes) | ValueRef::Blob(bytes) => bytes.to_vec(),
                });
            }
        }
    }
    values
}

fn request_from_peer(peer: &str, header: &str) -> Request<Body> {
    let mut request = Request::post("/relay/v1/challenges")
        .header("content-type", "application/json")
        .header("cf-connecting-ip", header)
        .body(Body::from("{}"))
        .unwrap();
    request.extensions_mut().insert(axum::extract::ConnectInfo(
        peer.parse::<std::net::SocketAddr>().unwrap(),
    ));
    request
}

#[tokio::test]
async fn counts_by_the_peer_address_when_told_to_trust_it() {
    let relay = relay_with(
        omnileaf_relay::Settings {
            client_ip: omnileaf_relay::ClientIpSource::Peer,
            ..settings(limits(1, 10))
        },
        Store::open_in_memory().unwrap(),
    );
    relay
        .send(request_from_peer("192.0.2.1:5000", "203.0.113.7"))
        .await;

    let same_peer = relay
        .send(request_from_peer("192.0.2.1:5001", "203.0.113.8"))
        .await;
    let other_peer = relay
        .send(request_from_peer("192.0.2.2:5000", "203.0.113.7"))
        .await;

    assert_eq!(same_peer.status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(other_peer.status, StatusCode::CREATED);
}

#[tokio::test]
async fn counts_an_ipv4_address_written_as_ipv6_as_itself() {
    let relay = relay_limited(limits(1, 10));
    challenge_from(&relay, "203.0.113.7").await;

    let mapped = challenge_from(&relay, "::ffff:203.0.113.7").await;

    assert_eq!(mapped, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn limits_each_action_on_its_own() {
    let relay = relay_limited(limits(1, 10));
    challenge_from(&relay, "203.0.113.7").await;

    let status = relay
        .post_from(
            "203.0.113.7",
            "/relay/v1/reports/statuses",
            &json!({ "reports": [{ "code": "R-7K2M-QX9D", "statusKey": omnileaf_relay_proto::StatusKey::from_bytes([1; 32]) }] }),
        )
        .await;

    assert_eq!(status.status, StatusCode::OK);
}
