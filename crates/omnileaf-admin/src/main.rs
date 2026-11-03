use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    time::Duration,
};

use anyhow::{Context, bail};
use clap::{Parser, Subcommand};
use omnileaf_admin::{AppState, Config, router};
use tracing::level_filters::LevelFilter;

const HEALTH_TIMEOUT: Duration = Duration::from_secs(3);
const HEALTH_PATH: &str = "/admin/health";

/// The review dashboard for problem reports.
#[derive(Parser)]
#[command(name = "omnileaf-admin", version)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Serves the review dashboard.
    Serve(Box<Config>),
    /// Checks that a running dashboard answers its health check.
    Health {
        /// The address the dashboard listens on.
        #[arg(long, env = "ADMIN_LISTEN", default_value = "127.0.0.1:8080")]
        listen: SocketAddr,
    },
}

fn main() -> anyhow::Result<()> {
    match Cli::parse().command {
        Command::Serve(config) => serve(&config),
        Command::Health { listen } => health(listen),
    }
}

fn serve(config: &Config) -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(LevelFilter::INFO)
        .with_ansi(false)
        .init();
    let listen = config.listen;
    let clock = std::sync::Arc::new(|| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_secs())
    });
    let state = AppState::new(config, clock)?;
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .context("start the async runtime")?
        .block_on(async move {
            let listener = tokio::net::TcpListener::bind(listen)
                .await
                .with_context(|| format!("listen on {listen}"))?;
            tracing::info!(%listen, "admin listening");
            axum::serve(listener, router(state))
                .with_graceful_shutdown(shutdown_signal())
                .await
                .context("serve the dashboard")
        })
}

fn health(listen: SocketAddr) -> anyhow::Result<()> {
    let target = if listen.ip().is_unspecified() {
        SocketAddr::from(([127, 0, 0, 1], listen.port()))
    } else {
        listen
    };
    let mut stream = TcpStream::connect_timeout(&target, HEALTH_TIMEOUT)
        .with_context(|| format!("connect to the dashboard at {target}"))?;
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
            "the dashboard answered its health check with {:?}",
            answer.lines().next().unwrap_or_default()
        )
    }
}

async fn shutdown_signal() {
    tokio::select! {
        () = interrupted() => {}
        () = terminated() => {}
    }
}

async fn interrupted() {
    if tokio::signal::ctrl_c().await.is_err() {
        std::future::pending::<()>().await;
    }
}

#[cfg(unix)]
async fn terminated() {
    match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
        Ok(mut signals) => {
            signals.recv().await;
        }
        Err(_) => std::future::pending::<()>().await,
    }
}

#[cfg(not(unix))]
async fn terminated() {
    std::future::pending::<()>().await;
}
