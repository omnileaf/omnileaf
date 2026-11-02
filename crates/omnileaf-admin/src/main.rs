use anyhow::Context;
use clap::Parser;
use omnileaf_admin::{AppState, Config, router};
use tracing::level_filters::LevelFilter;

fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(LevelFilter::INFO)
        .with_ansi(false)
        .init();
    let config = Config::parse();
    let listen = config.listen;
    let clock = std::sync::Arc::new(|| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_secs())
    });
    let state = AppState::new(&config, clock)?;
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
