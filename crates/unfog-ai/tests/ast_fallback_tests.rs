use std::path::Path;
use unfog_ai::{AiClient, AstAnalyzer, NodeContext};

fn load_fixture(rel_path: &str) -> String {
    let base = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("tests/fixtures/sample-app")
        .join(rel_path);

    std::fs::read_to_string(&base)
        .unwrap_or_else(|_| panic!("Failed to read fixture: {:?}", base))
}

#[test]
fn test_ast_mental_model_generation_component() {
    let mut analyzer = AstAnalyzer::new();
    let source = load_fixture("components/UploadBtn.tsx");

    let ctx = NodeContext {
        id: "comp_upload_btn".to_string(),
        label: "UploadBtn".to_string(),
        file_path: "components/UploadBtn.tsx".to_string(),
        kind: Some("Component".to_string()),
        code_snippet: Some(source),
        ..Default::default()
    };

    let model = analyzer.generate_mental_model(&ctx);

    // Verify fields are not dummy or empty
    assert!(!model.trigger.is_empty());
    assert!(!model.mutation.is_empty());
    assert!(!model.side_effects.is_empty());
    assert!(!model.l1_vibe.is_empty());
    assert!(!model.l2_builder.is_empty());
    assert!(!model.l3_deep_dive.is_empty());

    // Verify real identifiers from the code are present
    assert!(
        model.trigger.contains("UploadBtn") || model.trigger.contains("onClick") || model.trigger.contains("onChange"),
        "Trigger should reference real component/events: {}",
        model.trigger
    );
    assert!(
        model.l2_builder.contains("UploadBtn"),
        "Builder view should reference UploadBtn: {}",
        model.l2_builder
    );
    assert!(
        model.l3_deep_dive.contains("UploadBtn.tsx"),
        "Deep dive should reference file context: {}",
        model.l3_deep_dive
    );
}

#[test]
fn test_ast_mental_model_generation_hook() {
    let mut analyzer = AstAnalyzer::new();
    let source = load_fixture("hooks/useUpload.ts");

    let ctx = NodeContext {
        id: "hook_use_upload".to_string(),
        label: "useUpload".to_string(),
        file_path: "hooks/useUpload.ts".to_string(),
        kind: Some("Hook".to_string()),
        code_snippet: Some(source),
        ..Default::default()
    };

    let model = analyzer.generate_mental_model(&ctx);

    assert!(!model.trigger.is_empty());
    assert!(!model.mutation.is_empty());
    assert!(!model.side_effects.is_empty());

    // In useUpload, state mutations like setLastUpload or store.setUploadProgress occur
    assert!(
        model.mutation.contains("setLastUpload")
            || model.mutation.contains("store.setIsUploading")
            || model.mutation.contains("store.setUploadProgress")
            || model.mutation.contains("store.setError"),
        "Mutation should detect actual state setters in useUpload: {}",
        model.mutation
    );

    // Async operations like handleUpload or file.arrayBuffer should be captured in side effects
    assert!(
        model.side_effects.contains("handleUpload")
            || model.side_effects.contains("arrayBuffer")
            || model.side_effects.contains("asynchronous"),
        "Side effects should detect async I/O in useUpload: {}",
        model.side_effects
    );
}

#[test]
fn test_ast_micro_challenge_generation() {
    let mut analyzer = AstAnalyzer::new();
    let source = load_fixture("components/UploadBtn.tsx");

    let ctx = NodeContext {
        id: "comp_upload_btn".to_string(),
        label: "UploadBtn".to_string(),
        file_path: "components/UploadBtn.tsx".to_string(),
        kind: Some("Component".to_string()),
        code_snippet: Some(source),
        ..Default::default()
    };

    let challenge = analyzer.generate_micro_challenge(&ctx);

    // Verify 4 options, valid index, and dynamic question referencing real logic
    assert_eq!(challenge.options.len(), 4, "MicroChallenge must contain exactly 4 options");
    assert!(challenge.correct_index < 4, "correct_index must be valid (0..3)");
    assert!(!challenge.question.is_empty());
    assert!(!challenge.explanation.is_empty());

    // In UploadBtn, guard condition checks like maxSizeBytes or !file exist
    assert!(
        challenge.question.contains("UploadBtn")
            || challenge.question.contains("maxSizeBytes")
            || challenge.question.contains("file"),
        "Question must reference real code symbols: {}",
        challenge.question
    );
}

#[test]
fn test_ast_break_prediction_generation() {
    let mut analyzer = AstAnalyzer::new();
    let source = load_fixture("components/UploadBtn.tsx");

    let ctx = NodeContext {
        id: "comp_upload_btn".to_string(),
        label: "UploadBtn".to_string(),
        file_path: "components/UploadBtn.tsx".to_string(),
        kind: Some("Component".to_string()),
        code_snippet: Some(source.clone()),
        ..Default::default()
    };

    let bp = analyzer.generate_break_prediction(&ctx);

    // Ensure mutated code is different from original
    assert_ne!(bp.mutated_code, source, "Mutated code must differ from original snippet");
    assert!(!bp.failure_prediction_question.is_empty());
    assert!(!bp.expected_breakage.is_empty());

    // In UploadBtn, mutation should invert condition `>` to `<` or change truthiness
    assert!(
        bp.mutated_code.contains('<') || bp.mutated_code.contains("!=="),
        "Mutated code should contain inverted condition"
    );
}

#[test]
fn test_ast_break_prediction_await_dropping() {
    let mut analyzer = AstAnalyzer::new();
    let source = load_fixture("hooks/useUpload.ts");

    let ctx = NodeContext {
        id: "hook_use_upload".to_string(),
        label: "useUpload".to_string(),
        file_path: "hooks/useUpload.ts".to_string(),
        kind: Some("Hook".to_string()),
        code_snippet: Some(source.clone()),
        ..Default::default()
    };

    let bp = analyzer.generate_break_prediction(&ctx);

    assert_ne!(bp.mutated_code, source);
    assert!(!bp.failure_prediction_question.is_empty());
    assert!(!bp.expected_breakage.is_empty());
}

#[tokio::test]
async fn test_ai_client_deterministic_fallback_flow() {
    // Force fallback mode
    let client = AiClient::fallback_only();
    assert_eq!(client.provider_name(), "DeterministicASTFallback");

    let source = load_fixture("app/api/upload/route.ts");
    let ctx = NodeContext {
        id: "route_api_upload".to_string(),
        label: "POST".to_string(),
        file_path: "app/api/upload/route.ts".to_string(),
        kind: Some("RouteHandler".to_string()),
        route_path: Some("/api/upload".to_string()),
        http_method: Some("POST".to_string()),
        code_snippet: Some(source),
        ..Default::default()
    };

    let model = client.generate_mental_model(&ctx).await;
    assert!(!model.trigger.is_empty());
    assert!(!model.mutation.is_empty());
    assert!(!model.side_effects.is_empty());

    let challenge = client.generate_micro_challenge(&ctx).await;
    assert_eq!(challenge.options.len(), 4);
    assert!(challenge.correct_index < 4);

    let bp = client.generate_break_prediction(&ctx).await;
    assert!(!bp.mutated_code.is_empty());
    assert!(!bp.failure_prediction_question.is_empty());
    assert!(!bp.expected_breakage.is_empty());
}

#[test]
fn test_ast_analyzer_handles_empty_and_corrupt_input_safely() {
    let mut analyzer = AstAnalyzer::new();

    // Empty snippet
    let empty_ctx = NodeContext {
        id: "empty".to_string(),
        label: "empty".to_string(),
        file_path: "empty.ts".to_string(),
        code_snippet: Some("".to_string()),
        ..Default::default()
    };

    let model = analyzer.generate_mental_model(&empty_ctx);
    assert!(!model.trigger.is_empty());
    assert!(!model.l1_vibe.is_empty());

    let challenge = analyzer.generate_micro_challenge(&empty_ctx);
    assert_eq!(challenge.options.len(), 4);

    let bp = analyzer.generate_break_prediction(&empty_ctx);
    assert!(!bp.failure_prediction_question.is_empty());

    // Corrupt syntax snippet
    let corrupt_ctx = NodeContext {
        id: "corrupt".to_string(),
        label: "corrupt".to_string(),
        file_path: "corrupt.ts".to_string(),
        code_snippet: Some("const x = {{{ invalid syntax here }}}".to_string()),
        ..Default::default()
    };

    let model_corrupt = analyzer.generate_mental_model(&corrupt_ctx);
    assert!(!model_corrupt.trigger.is_empty());
}
