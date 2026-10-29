use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use omnileaf_relay_proto::{
    Challenge, ChallengeRequest, ErrorBody, ErrorCode, Platform, Proof, ReplyAddress, ReportCode,
    ReportSubmission, StatusKey, StatusLookup, StatusLookups, StatusReplies, StatusReply,
    limits::STATUS_LOOKUPS,
    pow::{Difficulty, Puzzle, ReportContent},
};
use reqwest::{Client, StatusCode, Url};
use serde::{Serialize, de::DeserializeOwned};

const RELAY_BASE: &str = "https://omnileaf.app/relay/v1/";
#[cfg(debug_assertions)]
const RELAY_URL_VARIABLE: &str = "OMNILEAF_RELAY_URL";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const SOLVE_DEADLINE: Duration = Duration::from_secs(30);
const RETRY_PAUSE: Duration = Duration::from_secs(1);
const USER_AGENT: &str = "Omnileaf";
const CHALLENGES_PATH: &str = "challenges";
const REPORTS_PATH: &str = "reports";
const STATUSES_PATH: &str = "reports/statuses";
const CHALLENGE_ATTEMPTS: usize = 2;

pub(crate) struct RelayClient {
    challenges: Url,
    reports: Url,
    statuses: Url,
    retry_pause: Duration,
    http: Client,
}

#[derive(Clone, Debug)]
pub(crate) struct OutgoingReport {
    pub(crate) code: ReportCode,
    pub(crate) platform: Platform,
    pub(crate) version: String,
    pub(crate) report: String,
    pub(crate) reply_to: Option<ReplyAddress>,
    pub(crate) status_key: StatusKey,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum RelayError {
    #[error("reach the problem report relay")]
    Unreachable(#[from] reqwest::Error),
    #[error("the problem report relay failed with {status}")]
    Failed { status: StatusCode },
    #[error("the problem report relay limited this network")]
    RateLimited,
    #[error("the problem report relay is taking no more reports for now")]
    Busy,
    #[error("the relay asked for a proof of work of {bits} bits, more than a phone does quickly")]
    TooHard { bits: u32 },
    #[error("the proof of work ran past its deadline")]
    OutOfTime,
    #[error("the relay refused the reply address")]
    ReplyAddressInvalid,
    #[error("the relay refused the report with {code:?}")]
    Refused { code: ErrorCode },
    #[error("the relay answered {status} with a body this app can't read")]
    UnexpectedAnswer { status: StatusCode },
    #[error("solve the proof of work")]
    Solver(#[from] tokio::task::JoinError),
    #[error("{base} can't be the problem report relay's address")]
    Address { base: String },
    #[error("set up TLS for the problem report relay")]
    Tls(#[from] rustls::Error),
    #[error("the problem report relay's client didn't start")]
    NotStarted,
    #[error("a report code from an earlier version is too short for the relay")]
    CodeTooShort,
}

impl RelayClient {
    pub(crate) fn for_this_build() -> Result<Self, RelayError> {
        let base = relay_base();
        let url = Url::parse(&base).map_err(|_| RelayError::Address { base })?;
        Self::new(&url, RETRY_PAUSE)
    }

    pub(crate) fn new(base: &Url, retry_pause: Duration) -> Result<Self, RelayError> {
        let join = |path: &str| {
            base.join(path).map_err(|_| RelayError::Address {
                base: base.to_string(),
            })
        };
        Ok(Self {
            challenges: join(CHALLENGES_PATH)?,
            reports: join(REPORTS_PATH)?,
            statuses: join(STATUSES_PATH)?,
            retry_pause,
            http: http_client()?,
        })
    }

    pub(crate) async fn send(&self, report: &OutgoingReport) -> Result<(), RelayError> {
        let mut attempts_left = CHALLENGE_ATTEMPTS;
        loop {
            attempts_left -= 1;
            let submission = self.solved_submission(report).await?;
            let response = self.post(&self.reports, &submission).await?;
            match outcome_of(response).await {
                Err(RelayError::Refused {
                    code: ErrorCode::ChallengeUnknown,
                }) if attempts_left > 0 => {}
                Err(error) => return Err(error),
                Ok(()) => return Ok(()),
            }
        }
    }

    pub(crate) async fn statuses(
        &self,
        lookups: Vec<StatusLookup>,
    ) -> Result<Vec<StatusReply>, RelayError> {
        let mut replies = Vec::with_capacity(lookups.len());
        for batch in lookups.chunks(STATUS_LOOKUPS) {
            let request = StatusLookups {
                reports: batch.to_vec(),
            };
            let response = self.post(&self.statuses, &request).await?;
            let answered: StatusReplies = read_answer(response).await?;
            replies.extend(answered.reports);
        }
        Ok(replies)
    }

    async fn solved_submission(
        &self,
        report: &OutgoingReport,
    ) -> Result<ReportSubmission, RelayError> {
        let response = self.post(&self.challenges, &ChallengeRequest {}).await?;
        let challenge: Challenge = read_answer(response).await?;
        let difficulty =
            Difficulty::try_from(challenge.difficulty).map_err(|_| RelayError::TooHard {
                bits: challenge.difficulty,
            })?;
        let status_key_hash = report.status_key.hash();
        let subject = ReportContent {
            code: &report.code,
            platform: report.platform,
            version: &report.version,
            report: &report.report,
            reply_to: report.reply_to.as_ref().map(ReplyAddress::as_str),
            status_key_hash: &status_key_hash,
        }
        .subject();
        let challenge_id = challenge.id;
        let deadline = Instant::now() + SOLVE_DEADLINE;
        let nonce = tokio::task::spawn_blocking(move || {
            Puzzle {
                challenge: &challenge_id,
                subject: &subject,
                difficulty,
            }
            .solve(|| Instant::now() >= deadline)
        })
        .await?
        .ok_or(RelayError::OutOfTime)?;
        Ok(ReportSubmission {
            code: report.code.to_string(),
            platform: report.platform,
            version: report.version.clone(),
            report: report.report.clone(),
            reply_to: report
                .reply_to
                .as_ref()
                .map(|address| address.as_str().to_owned()),
            status_key_hash,
            proof: Proof {
                challenge: challenge_id,
                nonce,
            },
        })
    }

    async fn post(
        &self,
        url: &Url,
        body: &impl Serialize,
    ) -> Result<reqwest::Response, RelayError> {
        match self.http.post(url.clone()).json(body).send().await {
            Ok(response) if !is_passing_failure(response.status()) => return Ok(response),
            Err(error) if !(error.is_connect() || error.is_timeout()) => return Err(error.into()),
            Ok(_) | Err(_) => {}
        }
        tokio::time::sleep(self.retry_pause).await;
        Ok(self.http.post(url.clone()).json(body).send().await?)
    }
}

#[cfg(debug_assertions)]
fn relay_base() -> String {
    std::env::var(RELAY_URL_VARIABLE).unwrap_or_else(|_| RELAY_BASE.to_owned())
}

#[cfg(not(debug_assertions))]
fn relay_base() -> String {
    RELAY_BASE.to_owned()
}

/// Reads roots from `webpki-roots` rather than the platform verifier, which on Android needs a JNI start-up step and would set this one platform apart.
fn http_client() -> Result<Client, RelayError> {
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let roots = rustls::RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let tls = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()?
        .with_root_certificates(roots)
        .with_no_client_auth();
    Ok(Client::builder()
        .tls_backend_preconfigured(tls)
        .https_only(!cfg!(debug_assertions))
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .user_agent(USER_AGENT)
        .build()?)
}

fn is_passing_failure(status: StatusCode) -> bool {
    matches!(
        status,
        StatusCode::BAD_GATEWAY | StatusCode::GATEWAY_TIMEOUT
    )
}

async fn outcome_of(response: reqwest::Response) -> Result<(), RelayError> {
    if response.status().is_success() {
        Ok(())
    } else {
        Err(refusal(response).await)
    }
}

async fn read_answer<T: DeserializeOwned>(response: reqwest::Response) -> Result<T, RelayError> {
    let status = response.status();
    if !status.is_success() {
        return Err(refusal(response).await);
    }
    response
        .json()
        .await
        .map_err(|_| RelayError::UnexpectedAnswer { status })
}

async fn refusal(response: reqwest::Response) -> RelayError {
    let status = response.status();
    match status {
        StatusCode::TOO_MANY_REQUESTS => return RelayError::RateLimited,
        StatusCode::SERVICE_UNAVAILABLE => return RelayError::Busy,
        _ if status.is_server_error() => return RelayError::Failed { status },
        _ => {}
    }
    match response.json::<ErrorBody>().await {
        Ok(body) if body.error.code == ErrorCode::InvalidReplyAddress => {
            RelayError::ReplyAddressInvalid
        }
        Ok(body) => RelayError::Refused {
            code: body.error.code,
        },
        Err(_) => RelayError::UnexpectedAnswer { status },
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::BTreeSet,
        net::SocketAddr,
        sync::{Arc, Mutex},
    };

    use axum::{
        Json, Router,
        extract::State,
        http::{HeaderMap, StatusCode as AxumStatus},
        response::{IntoResponse, Response},
        routing::post,
    };
    use omnileaf_relay::{ClientIpSource, Limits, Relay, Settings, Store, SystemClock, router};
    use omnileaf_relay_proto::ReportStatus;
    use serde_json::{Value, json};

    use super::*;

    const TEST_BITS: u32 = 4;
    const NO_PAUSE: Duration = Duration::ZERO;

    #[derive(Clone, Default)]
    struct Recorded {
        reports: Arc<Mutex<Vec<(HeaderMap, Value)>>>,
        challenges: Arc<Mutex<usize>>,
        answers: Arc<Mutex<Vec<(AxumStatus, Value)>>>,
    }

    fn report() -> OutgoingReport {
        let code = ReportCode::from_random([1, 2, 3, 4, 5]);
        OutgoingReport {
            report: format!("Report code: {code}\nLog, names replaced:\nNothing logged yet.\n"),
            code,
            platform: Platform::Linux,
            version: "0.1.0".to_owned(),
            reply_to: Some(ReplyAddress::parse("reader@example.com").unwrap()),
            status_key: StatusKey::from_bytes([9; 32]),
        }
    }

    async fn serve(app: Router) -> Url {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(
                listener,
                app.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
        });
        Url::parse(&format!("http://{address}/relay/v1/")).unwrap()
    }

    async fn real_relay() -> RelayClient {
        let relay = Relay::new(
            Arc::new(Store::open_in_memory().unwrap()),
            Arc::new(SystemClock),
            Settings {
                difficulty: Difficulty::try_from(TEST_BITS).unwrap(),
                limits: Limits::default(),
                client_ip: ClientIpSource::Peer,
            },
        );
        RelayClient::new(&serve(router(relay)).await, NO_PAUSE).unwrap()
    }

    async fn issue_challenge(State(recorded): State<Recorded>) -> Response {
        *recorded.challenges.lock().unwrap() += 1;
        let challenge = Challenge {
            id: omnileaf_relay_proto::ChallengeId::from_bytes([7; 16]),
            difficulty: TEST_BITS,
            expires_at: 0,
        };
        (AxumStatus::CREATED, Json(challenge)).into_response()
    }

    async fn record_report(
        State(recorded): State<Recorded>,
        headers: HeaderMap,
        Json(body): Json<Value>,
    ) -> Response {
        recorded.reports.lock().unwrap().push((headers, body));
        let next = recorded.answers.lock().unwrap().pop();
        let (status, body) = next.unwrap_or((
            AxumStatus::CREATED,
            json!({ "code": "R-0000-0000", "status": "received" }),
        ));
        let mut response = (status, Json(body)).into_response();
        if status == AxumStatus::TOO_MANY_REQUESTS || status == AxumStatus::SERVICE_UNAVAILABLE {
            response
                .headers_mut()
                .insert("retry-after", axum::http::HeaderValue::from_static("60"));
        }
        response
    }

    async fn fake_relay(answers: Vec<(AxumStatus, Value)>) -> (RelayClient, Recorded) {
        let recorded = Recorded::default();
        recorded
            .answers
            .lock()
            .unwrap()
            .extend(answers.into_iter().rev());
        let app = Router::new()
            .route("/relay/v1/challenges", post(issue_challenge))
            .route("/relay/v1/reports", post(record_report))
            .with_state(recorded.clone());
        let client = RelayClient::new(&serve(app).await, NO_PAUSE).unwrap();
        (client, recorded)
    }

    fn refusal(code: &str) -> Value {
        json!({ "error": { "code": code, "message": "Refused." } })
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn sends_a_report_the_relay_takes_in_and_reads_its_status_back() {
        let client = real_relay().await;
        let outgoing = report();

        client.send(&outgoing).await.unwrap();
        let statuses = client
            .statuses(vec![StatusLookup {
                code: outgoing.code.to_string(),
                status_key: outgoing.status_key.clone(),
            }])
            .await
            .unwrap();

        assert_eq!(statuses.len(), 1);
        assert_eq!(statuses[0].status, ReportStatus::Received);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn sends_only_the_report_its_code_and_a_hash_of_its_status_key() {
        let (client, recorded) = fake_relay(vec![]).await;

        client.send(&report()).await.unwrap();

        let reports = recorded.reports.lock().unwrap();
        let (headers, body) = &reports[0];
        let keys: BTreeSet<&str> = body
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        let header_names: BTreeSet<&str> =
            headers.keys().map(axum::http::HeaderName::as_str).collect();
        assert_eq!(
            keys,
            BTreeSet::from([
                "code",
                "platform",
                "proof",
                "replyTo",
                "report",
                "statusKeyHash",
                "version"
            ])
        );
        assert!(
            header_names.is_subset(&BTreeSet::from([
                "accept",
                "content-length",
                "content-type",
                "host",
                "user-agent"
            ])),
            "{header_names:?}"
        );
        assert_eq!(headers["user-agent"], "Omnileaf");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn sends_the_same_report_again_without_a_refusal() {
        let client = real_relay().await;
        let outgoing = report();
        client.send(&outgoing).await.unwrap();

        let again = client.send(&outgoing).await;

        assert!(again.is_ok(), "{again:?}");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn tries_once_more_when_the_relay_is_briefly_unreachable() {
        let (client, recorded) = fake_relay(vec![(AxumStatus::BAD_GATEWAY, json!({}))]).await;

        let sent = client.send(&report()).await;

        assert!(sent.is_ok(), "{sent:?}");
        let reports = recorded.reports.lock().unwrap();
        assert_eq!(reports.len(), 2);
        assert_eq!(reports[0].1, reports[1].1);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn gives_up_after_a_second_gateway_failure() {
        let (client, recorded) = fake_relay(vec![
            (AxumStatus::GATEWAY_TIMEOUT, json!({})),
            (AxumStatus::BAD_GATEWAY, json!({})),
        ])
        .await;

        let sent = client.send(&report()).await;

        assert!(
            matches!(sent, Err(RelayError::Failed { status }) if status == StatusCode::BAD_GATEWAY)
        );
        assert_eq!(recorded.reports.lock().unwrap().len(), 2);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn never_retries_a_rate_limit_or_a_refusal() {
        let (limited, limited_calls) = fake_relay(vec![(
            AxumStatus::TOO_MANY_REQUESTS,
            refusal("rateLimited"),
        )])
        .await;
        let (refused, refused_calls) = fake_relay(vec![(
            AxumStatus::UNPROCESSABLE_ENTITY,
            refusal("proofRejected"),
        )])
        .await;

        let limited_outcome = limited.send(&report()).await;
        let refused_outcome = refused.send(&report()).await;

        assert!(matches!(limited_outcome, Err(RelayError::RateLimited)));
        assert!(matches!(
            refused_outcome,
            Err(RelayError::Refused {
                code: ErrorCode::ProofRejected
            })
        ));
        assert_eq!(limited_calls.reports.lock().unwrap().len(), 1);
        assert_eq!(refused_calls.reports.lock().unwrap().len(), 1);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn fetches_a_new_challenge_once_when_the_first_expired() {
        let (client, recorded) =
            fake_relay(vec![(AxumStatus::CONFLICT, refusal("challengeUnknown"))]).await;

        let sent = client.send(&report()).await;

        assert!(sent.is_ok(), "{sent:?}");
        assert_eq!(*recorded.challenges.lock().unwrap(), 2);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn tells_each_refusal_apart() {
        let cases = [
            (AxumStatus::SERVICE_UNAVAILABLE, "relayBusy"),
            (AxumStatus::UNPROCESSABLE_ENTITY, "invalidReplyAddress"),
            (AxumStatus::CONFLICT, "codeTaken"),
            (AxumStatus::PAYLOAD_TOO_LARGE, "tooLarge"),
            (AxumStatus::INTERNAL_SERVER_ERROR, "internal"),
        ];
        let mut outcomes = Vec::new();

        for (status, code) in cases {
            let (client, _) = fake_relay(vec![(status, refusal(code))]).await;
            outcomes.push(client.send(&report()).await);
        }

        assert!(matches!(outcomes[0], Err(RelayError::Busy)));
        assert!(matches!(outcomes[1], Err(RelayError::ReplyAddressInvalid)));
        assert!(matches!(
            outcomes[2],
            Err(RelayError::Refused {
                code: ErrorCode::CodeTaken
            })
        ));
        assert!(matches!(
            outcomes[3],
            Err(RelayError::Refused {
                code: ErrorCode::TooLarge
            })
        ));
        assert!(matches!(outcomes[4], Err(RelayError::Failed { .. })));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn refuses_a_challenge_harder_than_a_phone_solves_quickly() {
        let recorded = Recorded::default();
        let app = Router::new()
            .route(
                "/relay/v1/challenges",
                post(|| async {
                    (
                        AxumStatus::CREATED,
                        Json(json!({ "id": "BwcHBwcHBwcHBwcHBwcHBw", "difficulty": 25, "expiresAt": 0 })),
                    )
                }),
            )
            .route("/relay/v1/reports", post(record_report))
            .with_state(recorded.clone());
        let client = RelayClient::new(&serve(app).await, NO_PAUSE).unwrap();

        let sent = client.send(&report()).await;

        assert!(matches!(sent, Err(RelayError::TooHard { bits: 25 })));
        assert!(recorded.reports.lock().unwrap().is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn says_the_relay_is_unreachable_when_nothing_listens() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        drop(listener);
        let base = Url::parse(&format!("http://{address}/relay/v1/")).unwrap();
        let client = RelayClient::new(&base, NO_PAUSE).unwrap();

        let sent = client.send(&report()).await;

        assert!(matches!(sent, Err(RelayError::Unreachable(_))));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn reads_an_unknown_status_for_a_key_that_does_not_match() {
        let client = real_relay().await;
        let outgoing = report();
        client.send(&outgoing).await.unwrap();

        let statuses = client
            .statuses(vec![StatusLookup {
                code: outgoing.code.to_string(),
                status_key: StatusKey::from_bytes([0; 32]),
            }])
            .await
            .unwrap();

        assert_eq!(statuses[0].status, ReportStatus::Unknown);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn looks_up_more_statuses_than_one_request_carries() {
        let client = real_relay().await;
        let lookups: Vec<StatusLookup> = (0..STATUS_LOOKUPS + 3)
            .map(|index| StatusLookup {
                code: format!("R-0000-{index:04}"),
                status_key: StatusKey::from_bytes([1; 32]),
            })
            .collect();

        let statuses = client.statuses(lookups).await.unwrap();

        assert_eq!(statuses.len(), STATUS_LOOKUPS + 3);
    }
}
