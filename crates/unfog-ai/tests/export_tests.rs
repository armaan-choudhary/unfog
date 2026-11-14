use unfog_ai::generate_export;
use unfog_core::{FogState, NodeKind, NodeMetadata};

#[test]
fn test_generate_export_artifacts() {
    let nodes = vec![
        NodeMetadata {
            id: "comp_upload_btn".to_string(),
            label: "UploadBtn".to_string(),
            file_path: "components/UploadBtn.tsx".to_string(),
            kind: NodeKind::Component,
            fog_state: FogState::Clear,
            line_start: 12,
            line_end: 76,
            code_snippet: Some("export function UploadBtn() {}".to_string()),
            route_path: None,
            http_method: None,
            description: Some("Button that triggers file uploads".to_string()),
            trigger: Some("User clicks file input".to_string()),
            mutation: Some("Updates uploadProgress".to_string()),
            side_effects: Some("Dispatches upload request".to_string()),
        },
        NodeMetadata {
            id: "route_upload".to_string(),
            label: "POST".to_string(),
            file_path: "app/api/upload/route.ts".to_string(),
            kind: NodeKind::RouteHandler,
            fog_state: FogState::Foggy,
            line_start: 1,
            line_end: 50,
            code_snippet: Some("export async function POST() {}".to_string()),
            route_path: Some("/api/upload".to_string()),
            http_method: Some("POST".to_string()),
            description: Some("Upload route".to_string()),
            trigger: Some("HTTP POST".to_string()),
            mutation: Some("Inserts record into DB".to_string()),
            side_effects: Some("Uploads file to S3".to_string()),
        },
    ];

    let understood_ids = vec!["comp_upload_btn".to_string()];

    let export = generate_export(&nodes, &understood_ids);

    // Verify ARCHITECTURE.md
    assert!(export.architecture_md.contains("System Architecture & Mental Models"));
    assert!(export.architecture_md.contains("✅ [Clear / Understood] `UploadBtn`"));
    assert!(export.architecture_md.contains("🌫️ [Foggy] `POST`"));
    assert!(export.architecture_md.contains("Verified Understood**: 1 (50%)"));

    // Verify .cursorrules
    assert!(export.cursorrules.contains("# Project Cursor Rules"));
    assert!(export.cursorrules.contains("`UploadBtn`"));
}
