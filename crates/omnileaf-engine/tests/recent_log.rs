use omnileaf_engine::RecentLog;
use tracing::Subscriber as _;
use tracing_subscriber::{Layer as _, filter::LevelFilter, layer::SubscriberExt};

fn listening(log: &RecentLog) -> tracing::subscriber::DefaultGuard {
    tracing::subscriber::set_default(tracing_subscriber::registry().with(log.clone()))
}

#[test]
fn keeps_only_the_most_recent_200_lines() {
    let log = RecentLog::default();
    let _listening = listening(&log);

    for number in 1..=205 {
        tracing::info!(number, "count");
    }

    let lines = log.lines();
    assert_eq!(lines.len(), 200);
    assert_eq!(
        lines.first().map(String::as_str),
        Some("INFO recent_log: count number=6")
    );
}

#[test]
fn leaves_out_lines_finer_than_info() {
    let log = RecentLog::default();
    let _listening = listening(&log);

    tracing::debug!("read a page ahead");
    tracing::trace!("the router stopped waiting");
    tracing::warn!("keep a transcoded page for next time");

    assert_eq!(
        log.lines(),
        ["WARN recent_log: keep a transcoded page for next time"]
    );
}

#[test]
fn asks_the_app_for_nothing_finer_than_info() {
    let subscriber = tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer().with_filter(LevelFilter::INFO))
        .with(RecentLog::default());

    assert_eq!(subscriber.max_level_hint(), Some(LevelFilter::INFO));
}

#[test]
fn keeps_a_message_over_several_lines_on_one_line() {
    let log = RecentLog::default();
    let _listening = listening(&log);

    let report = "Panic: boom\nAt: src/lib.rs:4:2";

    tracing::error!(report = %report, "the core panicked");

    assert_eq!(
        log.lines(),
        [r"ERROR recent_log: the core panicked report=Panic: boom\nAt: src/lib.rs:4:2"]
    );
}

#[test]
fn cuts_a_long_line_short_with_an_ellipsis() {
    let log = RecentLog::default();
    let _listening = listening(&log);
    let value = "é".repeat(4_000);

    tracing::info!(long = %value, "a long value");

    let lines = log.lines();
    let line = lines.first().map(String::as_str).unwrap_or_default();
    assert!(line.len() <= 1_000, "kept {} bytes", line.len());
    assert!(line.starts_with("INFO recent_log: a long value long=éé"));
    assert!(line.ends_with('…'));
}
