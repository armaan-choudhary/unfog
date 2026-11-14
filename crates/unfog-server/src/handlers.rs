use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Json};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tracing::{error, info};
use unfog_ai::{
    generate_export, get_break_prediction, get_mental_model, get_micro_challenge, NodeContext,
};
use unfog_core::{
    calculate_blast_radius, index_directory, prune_trace, GitDiffTracker, NodeKind, SlopDetector,
};

use crate::db;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
}

pub async fn health() -> impl IntoResponse {
    Json(HealthResponse { status: "ok" })
}

#[derive(Debug, Deserialize)]
pub struct IndexRequest {
    pub path: String,
}

pub async fn index_repo(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<IndexRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let target_path = PathBuf::from(&payload.path);
    if !target_path.exists() {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("Path does not exist: {}", payload.path),
        ));
    }

    info!("Indexing directory from request: {}", payload.path);
    let new_graph = index_directory(&target_path).map_err(|e| {
        error!("Failed to index {}: {:?}", payload.path, e);
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    let node_count = new_graph.node_count();
    let edge_count = new_graph.edge_count();

    let mut routes = Vec::new();
    for node in new_graph.all_nodes() {
        if (node.kind == NodeKind::PageRoute || node.kind == NodeKind::RouteHandler)
            && node.route_path.is_some()
        {
            let rp = node.route_path.as_ref().unwrap();
            if !routes.contains(rp) {
                routes.push(rp.clone());
            }
        }
    }
    routes.sort();

    {
        let mut path_guard = state.repo_path.write().unwrap();
        *path_guard = target_path.clone();
    }
    {
        let mut graph_guard = state.graph.write().unwrap();
        *graph_guard = Some(new_graph);
    }

    Ok(Json(json!({
        "status": "ok",
        "path": payload.path,
        "node_count": node_count,
        "edge_count": edge_count,
        "total_nodes": node_count,
        "total_edges": edge_count,
        "routes": routes,
    })))
}

#[derive(Debug, Deserialize)]
pub struct ScopeRequest {
    pub target: String,
    pub goal: Option<String>,
}

pub async fn scope_trace(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ScopeRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let graph_guard = state.graph.read().unwrap();
    let graph = graph_guard.as_ref().ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "Repository not yet indexed. Call /api/index first.".to_string(),
        )
    })?;

    let trace = prune_trace(graph, &payload.target, payload.goal.as_deref()).map_err(|e| {
        error!("Scoped pruning error for target '{}': {:?}", payload.target, e);
        (StatusCode::NOT_FOUND, e.to_string())
    })?;

    Ok(Json(trace))
}

#[derive(Debug, Deserialize)]
pub struct BlastRadiusQuery {
    pub target: String,
}

pub async fn blast_radius(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BlastRadiusQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let graph_guard = state.graph.read().unwrap();
    let graph = graph_guard.as_ref().ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "Repository not yet indexed. Call /api/index first.".to_string(),
        )
    })?;

    let result = calculate_blast_radius(graph, &query.target).map_err(|e| {
        error!("Blast radius error for target '{}': {:?}", query.target, e);
        (StatusCode::NOT_FOUND, e.to_string())
    })?;

    Ok(Json(result))
}

#[derive(Debug, Deserialize)]
pub struct FileQuery {
    pub path: String,
}

pub async fn get_file_content(
    State(state): State<Arc<AppState>>,
    Query(query): Query<FileQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let repo_dir = {
        let guard = state.repo_path.read().unwrap();
        guard.clone()
    };

    let full_path = if Path::new(&query.path).is_absolute() {
        PathBuf::from(&query.path)
    } else {
        repo_dir.join(&query.path)
    };

    if !full_path.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            format!("File not found: {}", query.path),
        ));
    }

    let content = std::fs::read_to_string(&full_path).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to read file: {}", e),
        )
    })?;

    Ok(Json(json!({
        "path": query.path,
        "content": content
    })))
}

#[derive(Debug, Deserialize)]
pub struct VerifyRequest {
    pub node_id: String,
    pub status: String,
    pub tag: Option<String>,
}

pub async fn verify_node(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<VerifyRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let db = state.db.lock().unwrap();

    db::save_node_verification(&db, &payload.node_id, &payload.status).map_err(|e| {
        error!("Failed to persist verification: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    if let Some(tag) = &payload.tag {
        db::save_confidence_tag(&db, &payload.node_id, tag).map_err(|e| {
            error!("Failed to persist confidence tag: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;
    }

    Ok(Json(json!({
        "success": true,
        "node_id": payload.node_id,
        "status": payload.status,
        "tag": payload.tag,
    })))
}

pub async fn get_state(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let db = state.db.lock().unwrap();
    let (understood, tags) = db::load_state(&db).map_err(|e| {
        error!("Failed to load state: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    let understood_keys: Vec<String> = understood.keys().cloned().collect();

    Ok(Json(json!({
        "understood": understood_keys,
        "understood_nodes": understood_keys,
        "nodes": understood,
        "tags": tags,
    })))
}

// -------------------------------------------------------------
// Phase 3-5 Endpoints: Mental Model, Challenge, Break-Sandbox, Slop, Diff, Export
// -------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct MentalModelRequest {
    pub node_id: String,
    pub level: Option<String>,
    pub file_path: Option<String>,
    pub symbol: Option<String>,
}

pub async fn mental_model(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<MentalModelRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let context = build_node_context(&state, &payload.node_id, payload.file_path.as_deref())?;
    let model = get_mental_model(&context).await;

    Ok(Json(json!({
        "node_id": payload.node_id,
        "trigger": model.trigger,
        "mutation": model.mutation,
        "side_effects": model.side_effects,
        "l1_vibe": model.l1_vibe,
        "l2_builder": model.l2_builder,
        "l3_deep_dive": model.l3_deep_dive,
        "summary": model.l1_vibe,
        "technical_details": [model.l2_builder, model.l3_deep_dive],
    })))
}

#[derive(Debug, Deserialize)]
pub struct ChallengeRequest {
    pub node_id: String,
    pub file_path: Option<String>,
}

pub async fn challenge(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ChallengeRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let context = build_node_context(&state, &payload.node_id, payload.file_path.as_deref())?;
    let ch = get_micro_challenge(&context).await;

    Ok(Json(ch))
}

#[derive(Debug, Deserialize)]
pub struct BreakSandboxRequest {
    pub node_id: String,
    pub file_path: Option<String>,
}

pub async fn break_sandbox(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<BreakSandboxRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let context = build_node_context(&state, &payload.node_id, payload.file_path.as_deref())?;
    let bp = get_break_prediction(&context).await;

    Ok(Json(bp))
}

#[derive(Debug, Deserialize)]
pub struct SlopQuery {
    pub path: Option<String>,
}

pub async fn get_slop(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SlopQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let graph_guard = state.graph.read().unwrap();
    let graph = graph_guard.as_ref().ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "Repository not yet indexed. Call /api/index first.".to_string(),
        )
    })?;

    let report = SlopDetector::analyze(graph, query.path.as_deref());

    let issues: Vec<String> = report.warnings.iter().map(|w| w.message.clone()).collect();
    let details: Vec<_> = report
        .warnings
        .iter()
        .map(|w| {
            json!({
                "issue_type": format!("{:?}", w.category),
                "description": w.message,
                "line": w.line_number,
                "suggestion": w.suggestion,
                "code_snippet": w.code_snippet,
            })
        })
        .collect();

    Ok(Json(json!({
        "has_slop": !report.warnings.is_empty(),
        "issues": issues,
        "details": details,
        "slop_score": report.slop_score,
        "summary": report.summary,
    })))
}

pub async fn get_diff(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let repo_dir = {
        let guard = state.repo_path.read().unwrap();
        guard.clone()
    };

    let report = GitDiffTracker::get_diff(&repo_dir);
    let files_changed: Vec<String> = report.files.iter().map(|f| f.file_path.clone()).collect();

    Ok(Json(json!({
        "summary": report.summary,
        "files_changed": files_changed,
        "files": report.files,
        "total_additions": report.total_additions,
        "total_deletions": report.total_deletions,
    })))
}

#[derive(Debug, Deserialize)]
pub struct ExportRequest {
    pub understood_nodes: Option<Vec<String>>,
    pub format: Option<String>,
}

pub async fn export_models(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ExportRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let graph_guard = state.graph.read().unwrap();
    let graph = graph_guard.as_ref().ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "Repository not yet indexed. Call /api/index first.".to_string(),
        )
    })?;

    let understood_ids = match payload.understood_nodes {
        Some(ids) => ids,
        None => {
            let db = state.db.lock().unwrap();
            let (understood_map, _) = db::load_state(&db).unwrap_or_default();
            understood_map.into_keys().collect()
        }
    };

    let nodes: Vec<_> = graph.all_nodes().into_iter().cloned().collect();
    let export_result = generate_export(&nodes, &understood_ids);

    let content = format!(
        "{}\n\n---\n\n{}",
        export_result.architecture_md, export_result.cursorrules
    );

    Ok(Json(json!({
        "architecture_md": export_result.architecture_md,
        "cursorrules": export_result.cursorrules,
        "content": content,
    })))
}

fn build_node_context(
    state: &Arc<AppState>,
    node_id: &str,
    file_path_hint: Option<&str>,
) -> Result<NodeContext, (StatusCode, String)> {
    let graph_guard = state.graph.read().unwrap();
    let graph = graph_guard.as_ref().ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "Repository not yet indexed. Call /api/index first.".to_string(),
        )
    })?;

    let node = graph.find_node(node_id).or_else(|| {
        if let Some(fp) = file_path_hint {
            graph.find_node(fp)
        } else {
            None
        }
    });

    let repo_dir = {
        let guard = state.repo_path.read().unwrap();
        guard.clone()
    };

    if let Some(n) = node {
        let mut ctx = NodeContext::from(n);
        let full_path = repo_dir.join(&n.file_path);
        if full_path.exists() {
            if let Ok(src) = std::fs::read_to_string(&full_path) {
                ctx.full_file_content = Some(src);
            }
        }
        Ok(ctx)
    } else {
        // Fallback context with given ID
        let clean_path = file_path_hint.unwrap_or(node_id).to_string();
        let full_path = repo_dir.join(&clean_path);
        let content = std::fs::read_to_string(&full_path).ok();

        Ok(NodeContext {
            id: node_id.to_string(),
            label: Path::new(&clean_path)
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| node_id.to_string()),
            file_path: clean_path,
            full_file_content: content,
            ..Default::default()
        })
    }
}

pub async fn fallback_html() -> impl IntoResponse {
    Html(r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Unfog Server</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    h1 { color: #0284c7; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Unfog API Server Active</h1>
  <p>The REST backend is running. Endpoints available:</p>
  <ul>
    <li><code>GET /api/health</code></li>
    <li><code>POST /api/index</code></li>
    <li><code>POST /api/scope</code></li>
    <li><code>GET /api/blast-radius?target=&lt;target&gt;</code></li>
    <li><code>GET /api/file?path=&lt;path&gt;</code></li>
    <li><code>POST /api/verify</code></li>
    <li><code>GET /api/state</code></li>
    <li><code>POST /api/mental-model</code></li>
    <li><code>POST /api/challenge</code></li>
    <li><code>POST /api/break-sandbox</code></li>
    <li><code>GET /api/slop</code></li>
    <li><code>GET /api/diff</code></li>
    <li><code>POST /api/export</code></li>
  </ul>
</body>
</html>"#)
}
