use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tower::ServiceExt;
use unfog_server::{create_router, AppState};

fn get_fixture_path() -> PathBuf {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    Path::new(manifest_dir).join("../../tests/fixtures/sample-app")
}

#[tokio::test]
async fn test_health_endpoint() {
    let fixture_dir = get_fixture_path();
    let state = Arc::new(AppState::new(fixture_dir).unwrap());
    let app = create_router(state, None);

    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let val: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(val["status"], "ok");
}

#[tokio::test]
async fn test_phase2_endpoints() {
    let fixture_dir = get_fixture_path();
    let state = Arc::new(AppState::new(fixture_dir.clone()).unwrap());
    let app = create_router(state, None);

    // 1. POST /api/index
    let index_body = json!({
        "path": fixture_dir.to_str().unwrap()
    });
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/index")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_vec(&index_body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let val: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(val["status"], "ok");
    assert!(val["node_count"].as_u64().unwrap() > 10);
    assert!(val["routes"].as_array().unwrap().len() >= 3);

    // 2. POST /api/scope
    let scope_body = json!({
        "target": "/upload",
        "goal": "Trace"
    });
    let res_scope = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/scope")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_vec(&scope_body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res_scope.status(), StatusCode::OK);
    let bytes = res_scope.into_body().collect().await.unwrap().to_bytes();
    let scope_val: Value = serde_json::from_slice(&bytes).unwrap();
    let nodes = scope_val["nodes"].as_array().unwrap();
    assert!(nodes.len() >= 4 && nodes.len() <= 8, "Expected 4-8 nodes, got {}", nodes.len());

    // 3. GET /api/blast-radius
    let res_radius = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/blast-radius?target=lib/s3.ts")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res_radius.status(), StatusCode::OK);
    let bytes = res_radius.into_body().collect().await.unwrap().to_bytes();
    let radius_val: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(!radius_val["affected_nodes"].as_array().unwrap().is_empty());

    // 4. GET /api/file
    let res_file = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/file?path=components/UploadBtn.tsx")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res_file.status(), StatusCode::OK);
    let bytes = res_file.into_body().collect().await.unwrap().to_bytes();
    let file_val: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(file_val["content"].as_str().unwrap().contains("export function UploadBtn"));

    // 5. POST /api/verify
    let verify_body = json!({
        "node_id": "components/UploadBtn.tsx:UploadBtn",
        "status": "understood",
        "tag": "Got It"
    });
    let res_verify = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/verify")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_vec(&verify_body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res_verify.status(), StatusCode::OK);

    // 6. GET /api/state
    let res_state = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/state")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res_state.status(), StatusCode::OK);
    let bytes = res_state.into_body().collect().await.unwrap().to_bytes();
    let state_val: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(state_val["understood"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v == "components/UploadBtn.tsx:UploadBtn"));
}

#[tokio::test]
async fn test_phase3_5_ai_and_slop_endpoints() {
    let fixture_dir = get_fixture_path();
    let state = Arc::new(AppState::new(fixture_dir.clone()).unwrap());
    let app = create_router(state, None);

    // 1. POST /api/mental-model
    let mm_body = json!({
        "node_id": "components/UploadBtn.tsx:UploadBtn",
        "file_path": "components/UploadBtn.tsx"
    });
    let res_mm = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/mental-model")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_vec(&mm_body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res_mm.status(), StatusCode::OK);
    let bytes = res_mm.into_body().collect().await.unwrap().to_bytes();
    let mm_val: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(mm_val["trigger"].is_string());
    assert!(mm_val["mutation"].is_string());
    assert!(mm_val["side_effects"].is_string());
    assert!(mm_val["l1_vibe"].is_string());

    // 2. POST /api/challenge
    let ch_body = json!({
        "node_id": "components/UploadBtn.tsx:UploadBtn",
        "file_path": "components/UploadBtn.tsx"
    });
    let res_ch = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/challenge")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_vec(&ch_body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res_ch.status(), StatusCode::OK);
    let bytes = res_ch.into_body().collect().await.unwrap().to_bytes();
    let ch_val: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(ch_val["question"].is_string());
    assert_eq!(ch_val["options"].as_array().unwrap().len(), 4);

    // 3. POST /api/break-sandbox
    let bs_body = json!({
        "node_id": "components/UploadBtn.tsx:UploadBtn",
        "file_path": "components/UploadBtn.tsx"
    });
    let res_bs = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/break-sandbox")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_vec(&bs_body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res_bs.status(), StatusCode::OK);
    let bytes = res_bs.into_body().collect().await.unwrap().to_bytes();
    let bs_val: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(bs_val["mutated_code"].is_string());
    assert!(bs_val["failure_prediction_question"].is_string());

    // 4. GET /api/slop
    let res_slop = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/slop")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res_slop.status(), StatusCode::OK);
    let bytes = res_slop.into_body().collect().await.unwrap().to_bytes();
    let slop_val: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(slop_val["issues"].is_array());
    assert!(slop_val["details"].is_array());

    // 5. GET /api/diff
    let res_diff = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/diff")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res_diff.status(), StatusCode::OK);
    let bytes = res_diff.into_body().collect().await.unwrap().to_bytes();
    let diff_val: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(diff_val["summary"].is_string());

    // 6. POST /api/export
    let exp_body = json!({
        "understood_nodes": ["components/UploadBtn.tsx:UploadBtn"]
    });
    let res_exp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/export")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_vec(&exp_body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res_exp.status(), StatusCode::OK);
    let bytes = res_exp.into_body().collect().await.unwrap().to_bytes();
    let exp_val: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(exp_val["architecture_md"].as_str().unwrap().contains("System Architecture"));
    assert!(exp_val["cursorrules"].as_str().unwrap().contains("Project Cursor Rules"));
}
