use clap::Parser;
use std::path::PathBuf;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Parser, Debug)]
#[command(
    name = "unfog",
    author = "Unfog Contributors",
    version,
    about = "Unfog: AI Codebase Trace & Comprehension Engine"
)]
struct Cli {
    /// Path to the codebase to analyze
    #[arg(default_value = "tests/fixtures/sample-app")]
    path: PathBuf,

    /// Port to listen on
    #[arg(short, long, default_value_t = 3001)]
    port: u16,

    /// Do not automatically open the browser
    #[arg(long, default_value_t = false)]
    no_browser: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let cli = Cli::parse();

    let repo_path = if cli.path.exists() {
        cli.path
    } else {
        PathBuf::from(".")
    };

    let url = format!("http://localhost:{}", cli.port);
    info!("Starting Unfog for '{}' on {}", repo_path.display(), url);

    if !cli.no_browser {
        let open_url = url.clone();
        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            let _ = webbrowser::open(&open_url);
        });
    }

    unfog_server::start_server(repo_path, cli.port).await?;
    Ok(())
}
