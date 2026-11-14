pub mod db;
pub mod export;
pub mod handlers;

use axum::http::{header, Method};
use axum::routing::{get, post};
use axum::Router;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tracing::info;
use unfog_core::{index_directory, DependencyGraph};

pub struct AppState {
    pub repo_path: RwLock<PathBuf>,
    pub graph: RwLock<Option<DependencyGraph>>,
    pub db: Mutex<rusqlite::Connection>,
}

impl AppState {
    pub fn new(repo_path: PathBuf) -> anyhow::Result<Self> {
        let unfog_dir = repo_path.join(".unfog");
        std::fs::create_dir_all(&unfog_dir)?;
        let db_path = unfog_dir.join("state.db");
        let conn = db::init_db(&db_path)?;

        let mut graph_opt = None;
        if repo_path.exists() {
            if let Ok(g) = index_directory(&repo_path) {
                info!(
                    "Initialized dependency graph: {} nodes, {} edges",
                    g.node_count(),
                    g.edge_count()
                );
                graph_opt = Some(g);
            }
        }

        Ok(Self {
            repo_path: RwLock::new(repo_path),
            graph: RwLock::new(graph_opt),
            db: Mutex::new(conn),
        })
    }
}

pub fn create_router(state: Arc<AppState>, dist_dir: Option<PathBuf>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS, Method::PUT])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION, header::ACCEPT]);

    let api_routes = Router::new()
        .route("/health", get(handlers::health))
        .route("/index", post(handlers::index_repo))
        .route("/scope", post(handlers::scope_trace))
        .route("/blast-radius", get(handlers::blast_radius))
        .route("/file", get(handlers::get_file_content))
        .route("/verify", post(handlers::verify_node))
        .route("/state", get(handlers::get_state))
        .route("/mental-model", post(handlers::mental_model))
        .route("/challenge", post(handlers::challenge))
        .route("/break-sandbox", post(handlers::break_sandbox))
        .route("/slop", get(handlers::get_slop))
        .route("/diff", get(handlers::get_diff))
        .route("/export", post(handlers::export_models));

    let mut app = Router::new().nest("/api", api_routes);

    if let Some(dist) = dist_dir {
        if dist.exists() {
            app = app.fallback_service(ServeDir::new(dist));
        } else {
            app = app.fallback(handlers::fallback_html);
        }
    } else {
        app = app.fallback(handlers::fallback_html);
    }

    app.layer(cors).with_state(state)
}

pub async fn start_server(repo_path: PathBuf, port: u16) -> anyhow::Result<()> {
    let state = Arc::new(AppState::new(repo_path)?);

    // Look for web/dist in workspace
    let dist_candidates = [
        PathBuf::from("web/dist"),
        PathBuf::from("../web/dist"),
        PathBuf::from("../../web/dist"),
    ];
    let dist_dir = dist_candidates.into_iter().find(|p| p.exists());

    let app = create_router(state, dist_dir);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Unfog server listening on http://127.0.0.1:{}", port);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
