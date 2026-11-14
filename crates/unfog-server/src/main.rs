use std::path::PathBuf;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);

    let repo_path = std::env::var("UNFOG_REPO")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let sample = PathBuf::from("tests/fixtures/sample-app");
            if sample.exists() {
                sample
            } else {
                PathBuf::from(".")
            }
        });

    unfog_server::start_server(repo_path, port).await?;
    Ok(())
}
