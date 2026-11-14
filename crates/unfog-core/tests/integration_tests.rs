use std::path::Path;
use unfog_core::{
    calculate_blast_radius, index_directory, prune_trace, NodeKind,
};

fn get_fixture_path() -> std::path::PathBuf {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    Path::new(manifest_dir).join("../../tests/fixtures/sample-app")
}

#[test]
fn test_index_sample_app() {
    let fixture_dir = get_fixture_path();
    assert!(fixture_dir.exists(), "Fixture directory must exist at {:?}", fixture_dir);

    let graph = index_directory(&fixture_dir).expect("Failed to index sample app");

    // Verify substantial node and edge count
    assert!(
        graph.node_count() >= 15,
        "Expected at least 15 nodes, got {}",
        graph.node_count()
    );
    assert!(
        graph.edge_count() >= 20,
        "Expected at least 20 edges, got {}",
        graph.edge_count()
    );

    // Verify key files are present in the graph
    let upload_page = graph.find_node("app/upload/page.tsx");
    assert!(upload_page.is_some(), "app/upload/page.tsx should be indexed");

    let upload_btn = graph.find_node("UploadBtn");
    assert!(upload_btn.is_some(), "UploadBtn component should be indexed");

    let use_upload = graph.find_node("useUpload");
    assert!(use_upload.is_some(), "useUpload hook should be indexed");

    let api_upload = graph.find_node("app/api/upload/route.ts");
    assert!(api_upload.is_some(), "app/api/upload/route.ts should be indexed");

    let s3_lib = graph.find_node("lib/s3.ts");
    assert!(s3_lib.is_some(), "lib/s3.ts should be indexed");

    let db_lib = graph.find_node("lib/db.ts");
    assert!(db_lib.is_some(), "lib/db.ts should be indexed");
}

#[test]
fn test_route_extraction() {
    let fixture_dir = get_fixture_path();
    let graph = index_directory(&fixture_dir).expect("Failed to index");

    // Test page route /upload
    let upload_route = graph.find_node("/upload");
    assert!(upload_route.is_some(), "Route /upload should be found");
    assert_eq!(upload_route.unwrap().route_path.as_deref(), Some("/upload"));

    // Test page route /dashboard
    let dashboard_route = graph.find_node("/dashboard");
    assert!(dashboard_route.is_some(), "Route /dashboard should be found");
    assert_eq!(dashboard_route.unwrap().route_path.as_deref(), Some("/dashboard"));

    // Test API route /api/upload
    let api_route = graph.find_node("/api/upload");
    assert!(api_route.is_some(), "Route /api/upload should be found");
    assert_eq!(api_route.unwrap().route_path.as_deref(), Some("/api/upload"));
}

#[test]
fn test_symbol_classification() {
    let fixture_dir = get_fixture_path();
    let graph = index_directory(&fixture_dir).expect("Failed to index");

    let upload_btn = graph.find_node("UploadBtn").expect("UploadBtn not found");
    assert_eq!(upload_btn.kind, NodeKind::Component);

    let use_upload = graph.find_node("useUpload").expect("useUpload not found");
    assert_eq!(use_upload.kind, NodeKind::Hook);

    let use_auth = graph.find_node("useAuth").expect("useAuth not found");
    assert_eq!(use_auth.kind, NodeKind::Hook);

    let s3_upload = graph.find_node("uploadToS3").expect("uploadToS3 not found");
    assert_eq!(s3_upload.kind, NodeKind::Function);

    let store = graph.find_node("store").expect("store not found");
    assert_eq!(store.kind, NodeKind::Store);
}

#[test]
fn test_scoped_pruning_upload_route() {
    let fixture_dir = get_fixture_path();
    let graph = index_directory(&fixture_dir).expect("Failed to index");

    let trace = prune_trace(&graph, "/upload", Some("Trace"))
        .expect("Pruning should succeed for /upload");

    println!("Pruned trace summary: {}", trace.summary);
    for step in &trace.steps {
        println!("  Step {}: {} ({})", step.step_number, step.label, step.file_path);
    }

    // Verify 4-8 node constraint
    assert!(
        trace.nodes.len() >= 4 && trace.nodes.len() <= 8,
        "Scoped pruning must produce between 4 and 8 nodes, got {}",
        trace.nodes.len()
    );

    // Verify steps match node count
    assert_eq!(trace.steps.len(), trace.nodes.len());

    // Verify essential nodes in the upload pipeline are included
    let file_paths: Vec<&str> = trace.nodes.iter().map(|n| n.file_path.as_str()).collect();
    let labels: Vec<&str> = trace.nodes.iter().map(|n| n.label.as_str()).collect();

    assert!(
        file_paths.iter().any(|p| p.contains("upload/page.tsx")),
        "Trace should contain upload page"
    );
    assert!(
        labels.iter().any(|l| *l == "UploadBtn") || file_paths.iter().any(|p| p.contains("UploadBtn.tsx")),
        "Trace should contain UploadBtn"
    );
    assert!(
        labels.iter().any(|l| *l == "useUpload") || file_paths.iter().any(|p| p.contains("useUpload.ts")),
        "Trace should contain useUpload hook"
    );

    // Steps should have valid sequential numbering starting at 1
    for (idx, step) in trace.steps.iter().enumerate() {
        assert_eq!(step.step_number, idx + 1);
        assert!(!step.action.is_empty());
        assert!(!step.description.is_empty());
    }
}

#[test]
fn test_scoped_pruning_component_target() {
    let fixture_dir = get_fixture_path();
    let graph = index_directory(&fixture_dir).expect("Failed to index");

    let trace = prune_trace(&graph, "components/UploadBtn.tsx", Some("Edit"))
        .expect("Pruning should succeed for UploadBtn");

    assert!(
        trace.nodes.len() >= 4 && trace.nodes.len() <= 8,
        "Scoped pruning for component must produce 4-8 nodes, got {}",
        trace.nodes.len()
    );
}

#[test]
fn test_blast_radius_s3() {
    let fixture_dir = get_fixture_path();
    let graph = index_directory(&fixture_dir).expect("Failed to index");

    let radius = calculate_blast_radius(&graph, "lib/s3.ts")
        .expect("Blast radius calculation should succeed for lib/s3.ts");

    println!("Blast radius summary: {}", radius.summary);
    println!("Affected count: {}", radius.affected_nodes.len());
    println!("Affected routes: {:?}", radius.affected_routes);

    assert!(
        !radius.affected_nodes.is_empty(),
        "lib/s3.ts should affect callers"
    );

    // Check that affected nodes include route or hook or component
    let affected_files: Vec<&str> = radius
        .affected_nodes
        .iter()
        .map(|n| n.file_path.as_str())
        .collect();

    assert!(
        affected_files.iter().any(|f| f.contains("route.ts") || f.contains("useUpload.ts") || f.contains("UploadBtn.tsx")),
        "S3 changes must propagate to api/upload or useUpload or UploadBtn"
    );

    // Impact level should be at least High
    assert!(
        radius.impact_level == "High" || radius.impact_level == "Critical",
        "Expected High or Critical impact level, got {}",
        radius.impact_level
    );
}

#[test]
fn test_blast_radius_db() {
    let fixture_dir = get_fixture_path();
    let graph = index_directory(&fixture_dir).expect("Failed to index");

    let radius = calculate_blast_radius(&graph, "lib/db.ts")
        .expect("Blast radius calculation should succeed for lib/db.ts");

    println!("DB blast radius summary: {}", radius.summary);
    assert_eq!(radius.impact_level, "Critical");
    assert!(radius.affected_nodes.len() >= 3);
}
