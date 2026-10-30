use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    sync::Arc,
    time::Duration,
};

use anyhow::{Context, bail};
use clap::{Parser, Subcommand, ValueEnum};
use omnileaf_relay::{
    ClientIpSource, Clock, Export, IssueNumber, Limits, Relay, ReplyAddressView, Settings,
    StatusChange, StatusKind, Store, SystemClock, TargetStatus, router,
};
use omnileaf_relay_proto::{ReportCode, pow::Difficulty};
use tracing::level_filters::LevelFilter;

const PURGE_INTERVAL: Duration = Duration::from_hours(1);
const HEALTH_TIMEOUT: Duration = Duration::from_secs(3);
const HEALTH_PATH: &str = "/relay/v1/health";

/// Takes in problem reports from the Omnileaf app and holds them for review.
#[derive(Parser)]
#[command(name = "omnileaf-relay", version)]
struct Cli {
    /// The SQLite file that holds reports, challenges and rate counts.
    #[arg(
        long,
        env = "RELAY_DATABASE",
        default_value = "relay.sqlite3",
        global = true
    )]
    database: PathBuf,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Serves the relay's HTTP endpoints.
    Serve(ServeOptions),
    /// Checks that a running relay answers its health check.
    Health {
        /// The address the relay listens on.
        #[arg(long, env = "RELAY_LISTEN", default_value = "127.0.0.1:8080")]
        listen: SocketAddr,
    },
    /// Reviews the reports people have sent.
    #[command(subcommand)]
    Reports(ReportsCommand),
}

#[derive(clap::Args)]
struct ServeOptions {
    /// The address to listen on.
    #[arg(long, env = "RELAY_LISTEN", default_value = "0.0.0.0:8080")]
    listen: SocketAddr,
    /// Leading zero bits each proof of work must reach.
    #[arg(long, env = "RELAY_POW_BITS", default_value_t = 20)]
    pow_bits: u32,
    /// Counts requests by the connecting socket's address instead of Cloudflare's header, for local runs only.
    #[arg(long, env = "RELAY_TRUST_PEER", default_value_t = false)]
    trust_peer: bool,
    /// The most detailed log level to print.
    #[arg(long, env = "RELAY_LOG", default_value = "info")]
    log: LevelFilter,
}

#[derive(Subcommand)]
enum ReportsCommand {
    /// Lists reports, newest first.
    List {
        #[arg(long)]
        status: Option<StatusArg>,
        #[arg(long, default_value_t = 50)]
        limit: u32,
    },
    /// Prints one report.
    Show {
        code: String,
        /// Also prints the address the person gave for replies.
        #[arg(long)]
        reply_address: bool,
    },
    /// Moves a report along its review.
    SetStatus {
        code: String,
        status: TargetArg,
        /// The public issue a published report became.
        #[arg(long)]
        issue: Option<u64>,
    },
    /// Prints a report as the body of a public issue, without its reply address.
    Export { code: String },
    /// Removes what the retention rules no longer keep.
    Purge,
}

#[derive(Clone, Copy, ValueEnum)]
enum StatusArg {
    Received,
    Reviewing,
    Published,
    Closed,
}

#[derive(Clone, Copy, ValueEnum)]
enum TargetArg {
    Reviewing,
    Published,
    Closed,
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Serve(options) => serve(&cli.database, &options),
        Command::Health { listen } => health(listen),
        Command::Reports(command) => review(&open(&cli.database)?, command),
    }
}

fn open(path: &std::path::Path) -> anyhow::Result<Store> {
    Store::open(path).with_context(|| format!("open the relay database at {}", path.display()))
}

fn serve(database: &std::path::Path, options: &ServeOptions) -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(options.log)
        .with_ansi(false)
        .init();
    let settings = Settings {
        difficulty: Difficulty::try_from(options.pow_bits).context("read RELAY_POW_BITS")?,
        limits: Limits::default(),
        client_ip: if options.trust_peer {
            ClientIpSource::Peer
        } else {
            ClientIpSource::CloudflareHeader
        },
    };
    let store = Arc::new(open(database)?);
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .context("start the async runtime")?
        .block_on(run(store, settings, options.listen))
}

async fn run(store: Arc<Store>, settings: Settings, listen: SocketAddr) -> anyhow::Result<()> {
    let clock: Arc<dyn Clock> = Arc::new(SystemClock);
    let purging = tokio::spawn(purge_hourly(Arc::clone(&store), Arc::clone(&clock)));
    let listener = tokio::net::TcpListener::bind(listen)
        .await
        .with_context(|| format!("listen on {listen}"))?;
    tracing::info!(%listen, "relay listening");
    let app = router(Relay::new(store, clock, settings));
    let served = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .context("serve the relay");
    purging.abort();
    served
}

async fn purge_hourly(store: Arc<Store>, clock: Arc<dyn Clock>) {
    let mut ticks = tokio::time::interval(PURGE_INTERVAL);
    loop {
        ticks.tick().await;
        let store = Arc::clone(&store);
        let now = clock.now();
        match tokio::task::spawn_blocking(move || store.purge(now)).await {
            Ok(Ok(purged)) => tracing::info!(?purged, "purged old relay records"),
            Ok(Err(error)) => tracing::error!(%error, "purge old relay records"),
            Err(error) => tracing::error!(%error, "purge old relay records"),
        }
    }
}

async fn shutdown_signal() {
    tokio::select! {
        () = interrupted() => {}
        () = terminated() => {}
    }
}

async fn interrupted() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::error!(%error, "listen for an interrupt");
        std::future::pending::<()>().await;
    }
}

#[cfg(unix)]
async fn terminated() {
    match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
        Ok(mut signals) => {
            signals.recv().await;
        }
        Err(error) => {
            tracing::error!(%error, "listen for a termination signal");
            std::future::pending::<()>().await;
        }
    }
}

#[cfg(not(unix))]
async fn terminated() {
    std::future::pending::<()>().await;
}

fn health(listen: SocketAddr) -> anyhow::Result<()> {
    let target = if listen.ip().is_unspecified() {
        SocketAddr::from(([127, 0, 0, 1], listen.port()))
    } else {
        listen
    };
    let mut stream = TcpStream::connect_timeout(&target, HEALTH_TIMEOUT)
        .with_context(|| format!("connect to the relay at {target}"))?;
    stream.set_read_timeout(Some(HEALTH_TIMEOUT))?;
    write!(
        stream,
        "GET {HEALTH_PATH} HTTP/1.1\r\nHost: {target}\r\nConnection: close\r\n\r\n"
    )?;
    let mut answer = String::new();
    stream.read_to_string(&mut answer)?;
    if answer.starts_with("HTTP/1.1 200") {
        Ok(())
    } else {
        bail!(
            "the relay answered its health check with {:?}",
            answer.lines().next().unwrap_or_default()
        )
    }
}

fn review(store: &Store, command: ReportsCommand) -> anyhow::Result<()> {
    let mut out = std::io::stdout().lock();
    match command {
        ReportsCommand::List { status, limit } => {
            for report in store.list(status.map(StatusKind::from), limit)? {
                writeln!(out, "{report}")?;
            }
        }
        ReportsCommand::Show {
            code,
            reply_address,
        } => {
            let view = if reply_address {
                ReplyAddressView::Shown
            } else {
                ReplyAddressView::Hidden
            };
            match store.show(&parse_code(code)?, view)? {
                Some(report) => write!(out, "{report}")?,
                None => bail!("no report has that code"),
            }
        }
        ReportsCommand::SetStatus {
            code,
            status,
            issue,
        } => {
            let target = target_status(status, issue)?;
            match store.set_status(&parse_code(code)?, target, SystemClock.now())? {
                StatusChange::Changed => {}
                StatusChange::NotFound => bail!("no report has that code"),
                StatusChange::Refused { from } => bail!("a {from} report can't move there"),
            }
        }
        ReportsCommand::Export { code } => match store.export(&parse_code(code)?)? {
            Export::Ready(body) => write!(out, "{body}")?,
            Export::NotFound => bail!("no report has that code"),
            Export::Purged => bail!("the report's text was removed"),
        },
        ReportsCommand::Purge => {
            let purged = store.purge(SystemClock.now())?;
            writeln!(
                out,
                "Removed {} challenges, {} report texts and {} reports.",
                purged.challenges, purged.report_texts, purged.reports
            )?;
        }
    }
    Ok(())
}

fn parse_code(code: String) -> anyhow::Result<ReportCode> {
    ReportCode::try_from(code).context("read the report code")
}

fn target_status(status: TargetArg, issue: Option<u64>) -> anyhow::Result<TargetStatus> {
    match (status, issue) {
        (TargetArg::Published, Some(number)) => IssueNumber::new(number)
            .map(TargetStatus::Published)
            .context("an issue number is a positive whole number"),
        (TargetArg::Published, None) => bail!("a published report needs --issue"),
        (TargetArg::Reviewing | TargetArg::Closed, Some(_)) => {
            bail!("only a published report takes --issue")
        }
        (TargetArg::Reviewing, None) => Ok(TargetStatus::Reviewing),
        (TargetArg::Closed, None) => Ok(TargetStatus::Closed),
    }
}

impl From<StatusArg> for StatusKind {
    fn from(status: StatusArg) -> Self {
        match status {
            StatusArg::Received => Self::Received,
            StatusArg::Reviewing => Self::Reviewing,
            StatusArg::Published => Self::Published,
            StatusArg::Closed => Self::Closed,
        }
    }
}
