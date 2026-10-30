#![expect(
    clippy::unwrap_used,
    reason = "the harness builds fixed requests, so a failed set-up should stop the test"
)]

use std::sync::{
    Arc,
    atomic::{AtomicI64, Ordering},
};

use axum::{
    Router,
    body::{Body, to_bytes},
    http::{HeaderMap, Request, StatusCode},
};
use omnileaf_relay::{
    ClientIpSource, Clock, Limits, NewReport, Relay, Settings, Store, UnixTime, router,
};
use omnileaf_relay_proto::{
    Challenge, Platform, ReportCode, StatusKey,
    pow::{Difficulty, Puzzle, ReportContent},
};
use serde_json::{Value, json};
use tower::ServiceExt;

pub(crate) const START: UnixTime = UnixTime::from_seconds(1_761_696_000);
pub(crate) const TEST_BITS: u32 = 4;
pub(crate) const CLIENT_IP: &str = "203.0.113.7";
const BODY_READ_LIMIT: usize = 1024 * 1024;

pub(crate) struct FakeClock(AtomicI64);

impl FakeClock {
    pub(crate) fn advance(&self, seconds: i64) {
        self.0.fetch_add(seconds, Ordering::SeqCst);
    }
}

impl Clock for FakeClock {
    fn now(&self) -> UnixTime {
        UnixTime::from_seconds(self.0.load(Ordering::SeqCst))
    }
}

pub(crate) struct TestRelay {
    pub(crate) router: Router,
    pub(crate) clock: Arc<FakeClock>,
    pub(crate) store: Arc<Store>,
}

pub(crate) struct Answer {
    pub(crate) status: StatusCode,
    pub(crate) headers: HeaderMap,
    pub(crate) body: Value,
}

#[derive(Clone)]
pub(crate) struct Draft {
    pub(crate) code: String,
    pub(crate) platform: Platform,
    pub(crate) version: String,
    pub(crate) report: String,
    pub(crate) reply_to: Option<String>,
    pub(crate) status_key: StatusKey,
}

pub(crate) fn settings(limits: Limits) -> Settings {
    Settings {
        difficulty: Difficulty::try_from(TEST_BITS).unwrap(),
        limits,
        client_ip: ClientIpSource::CloudflareHeader,
    }
}

pub(crate) fn relay() -> TestRelay {
    relay_with(
        settings(Limits::default()),
        Store::open_in_memory().unwrap(),
    )
}

pub(crate) fn relay_limited(limits: Limits) -> TestRelay {
    relay_with(settings(limits), Store::open_in_memory().unwrap())
}

pub(crate) fn relay_with(settings: Settings, store: Store) -> TestRelay {
    let clock = Arc::new(FakeClock(AtomicI64::new(START.seconds())));
    let store = Arc::new(store);
    let relay = Relay::new(
        Arc::clone(&store),
        Arc::clone(&clock) as Arc<dyn Clock>,
        settings,
    );
    TestRelay {
        router: router(relay),
        clock,
        store,
    }
}

pub(crate) fn code(text: &str) -> ReportCode {
    ReportCode::try_from(text.to_owned()).unwrap()
}

pub(crate) fn draft(code: &str) -> Draft {
    Draft {
        code: code.to_owned(),
        platform: Platform::Android,
        version: "0.1.0".to_owned(),
        report: format!(
            "Report code: {code}\nOmnileaf 0.1.0 on Android\nLog, names replaced:\nNothing logged yet.\n"
        ),
        reply_to: None,
        status_key: StatusKey::from_bytes([5; 32]),
    }
}

impl Draft {
    pub(crate) fn with_reply_to(mut self, address: &str) -> Self {
        self.reply_to = Some(address.to_owned());
        self
    }

    pub(crate) fn with_report(mut self, report: String) -> Self {
        self.report = report;
        self
    }

    pub(crate) fn with_status_key(mut self, seed: u8) -> Self {
        self.status_key = StatusKey::from_bytes([seed; 32]);
        self
    }

    pub(crate) fn solved_for(&self, challenge: &Challenge) -> Value {
        let nonce = nonce_solving(challenge, self);
        self.submission(challenge, nonce)
    }

    pub(crate) fn submission(&self, challenge: &Challenge, nonce: u64) -> Value {
        json!({
            "code": self.code,
            "platform": self.platform,
            "version": self.version,
            "report": self.report,
            "replyTo": self.reply_to,
            "statusKeyHash": self.status_key.hash(),
            "proof": { "challenge": challenge.id, "nonce": nonce },
        })
    }

    pub(crate) fn as_new_report(&self, received_at: UnixTime) -> NewReport {
        let code = code(&self.code);
        let status_key_hash = self.status_key.hash();
        let body_hash = ReportContent {
            code: &code,
            platform: self.platform,
            version: &self.version,
            report: &self.report,
            reply_to: self.reply_to.as_deref(),
            status_key_hash: &status_key_hash,
        }
        .subject();
        NewReport {
            code,
            status_key_hash,
            body_hash,
            platform: self.platform,
            version: self.version.clone(),
            report: self.report.clone(),
            reply_to: self
                .reply_to
                .as_deref()
                .map(|address| omnileaf_relay_proto::ReplyAddress::parse(address).unwrap()),
            received_at,
        }
    }
}

impl TestRelay {
    pub(crate) async fn send(&self, request: Request<Body>) -> Answer {
        let response = self.router.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        let bytes = to_bytes(response.into_body(), BODY_READ_LIMIT)
            .await
            .unwrap();
        let body = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap()
        };
        Answer {
            status,
            headers,
            body,
        }
    }

    pub(crate) async fn post_from(&self, ip: &str, path: &str, body: &Value) -> Answer {
        self.send(
            Request::post(path)
                .header("content-type", "application/json")
                .header("cf-connecting-ip", ip)
                .body(Body::from(serde_json::to_vec(body).unwrap()))
                .unwrap(),
        )
        .await
    }

    pub(crate) async fn post(&self, path: &str, body: &Value) -> Answer {
        self.post_from(CLIENT_IP, path, body).await
    }

    pub(crate) async fn challenge(&self) -> Challenge {
        let answer = self.post("/relay/v1/challenges", &json!({})).await;
        assert_eq!(answer.status, StatusCode::CREATED, "{}", answer.body);
        serde_json::from_value(answer.body).unwrap()
    }

    pub(crate) async fn submit(&self, draft: &Draft) -> Answer {
        let challenge = self.challenge().await;
        self.post("/relay/v1/reports", &draft.solved_for(&challenge))
            .await
    }

    pub(crate) async fn statuses(&self, lookups: &[(&str, &StatusKey)]) -> Answer {
        let reports: Vec<Value> = lookups
            .iter()
            .map(|(code, key)| json!({ "code": code, "statusKey": key }))
            .collect();
        self.post("/relay/v1/reports/statuses", &json!({ "reports": reports }))
            .await
    }
}

pub(crate) fn error_code(answer: &Answer) -> &str {
    answer
        .body
        .pointer("/error/code")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
}

pub(crate) fn nonce_solving(challenge: &Challenge, solved: &Draft) -> u64 {
    let code = code(&solved.code);
    let hash = solved.status_key.hash();
    let subject = ReportContent {
        code: &code,
        platform: solved.platform,
        version: &solved.version,
        report: &solved.report,
        reply_to: solved.reply_to.as_deref(),
        status_key_hash: &hash,
    }
    .subject();
    Puzzle {
        challenge: &challenge.id,
        subject: &subject,
        difficulty: Difficulty::try_from(challenge.difficulty).unwrap(),
    }
    .solve(|| false)
    .unwrap()
}
