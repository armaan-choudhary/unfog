use serde_json::json;
use unfog_ai::llm::parse_llm_json;
use unfog_ai::models::{BreakPrediction, MentalModel, MicroChallenge};

#[test]
fn test_parse_clean_mental_model_json() {
    let raw = r#"{
        "trigger": "User clicks Upload button",
        "mutation": "Sets isUploading to true and progress to 20",
        "side_effects": "POST to /api/upload with file buffer",
        "l1_vibe": "Handles file uploads",
        "l2_builder": "UploadBtn -> useUpload -> /api/upload",
        "l3_deep_dive": "AST node call_expression with await file.arrayBuffer()"
    }"#;

    let parsed: MentalModel = parse_llm_json(raw).expect("Failed to parse clean MentalModel");
    assert_eq!(parsed.trigger, "User clicks Upload button");
    assert_eq!(parsed.mutation, "Sets isUploading to true and progress to 20");
    assert_eq!(parsed.side_effects, "POST to /api/upload with file buffer");
    assert_eq!(parsed.l1_vibe, "Handles file uploads");
    assert_eq!(parsed.l2_builder, "UploadBtn -> useUpload -> /api/upload");
    assert_eq!(
        parsed.l3_deep_dive,
        "AST node call_expression with await file.arrayBuffer()"
    );
}

#[test]
fn test_parse_markdown_fenced_json() {
    let raw = r#"```json
{
  "question": "What happens if file size exceeds maxSizeBytes in UploadBtn?",
  "options": [
    "Alert is displayed and function returns early",
    "File is automatically compressed",
    "Request is sent with truncated payload",
    "Fatal unhandled exception is thrown"
  ],
  "correct_index": 0,
  "explanation": "UploadBtn checks file.size > maxSizeBytes and alerts without calling uploadFile"
}
```"#;

    let parsed: MicroChallenge = parse_llm_json(raw).expect("Failed to parse markdown fenced JSON");
    assert_eq!(
        parsed.question,
        "What happens if file size exceeds maxSizeBytes in UploadBtn?"
    );
    assert_eq!(parsed.options.len(), 4);
    assert_eq!(parsed.correct_index, 0);
    assert!(parsed.explanation.contains("UploadBtn"));
}

#[test]
fn test_parse_conversational_llm_wrapper() {
    let raw = r#"Here is the Break-It sandbox prediction you requested:

{
  "mutated_code": "const res = uploadFile(file);",
  "failure_prediction_question": "What occurs when 'await' is removed from uploadFile?",
  "expected_breakage": "res becomes a Promise rather than resolved response, causing res.success to evaluate to undefined."
}

I hope this helps your understanding!"#;

    let parsed: BreakPrediction =
        parse_llm_json(raw).expect("Failed to extract JSON from conversational wrapper");
    assert_eq!(parsed.mutated_code, "const res = uploadFile(file);");
    assert_eq!(
        parsed.failure_prediction_question,
        "What occurs when 'await' is removed from uploadFile?"
    );
    assert!(parsed.expected_breakage.contains("Promise"));
}

#[test]
fn test_gemini_payload_structure_extraction() {
    // Simulating response payload from Gemini generateContent API
    let gemini_json = json!({
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": "```json\n{\n  \"trigger\": \"HTTP POST /api/upload\",\n  \"mutation\": \"Writes record to SQLite\",\n  \"side_effects\": \"Streams bytes to S3 bucket\",\n  \"l1_vibe\": \"Server upload pipeline\",\n  \"l2_builder\": \"POST /api/upload -> uploadToS3 -> saveUploadRecord\",\n  \"l3_deep_dive\": \"Handles multipart/form-data and buffers\"\n}\n```"
                        }
                    ]
                }
            }
        ]
    });

    let text = gemini_json
        .pointer("/candidates/0/content/parts/0/text")
        .and_then(|v| v.as_str())
        .expect("Missing text in mock Gemini response");

    let parsed: MentalModel = parse_llm_json(text).expect("Failed to parse Gemini text part");
    assert_eq!(parsed.trigger, "HTTP POST /api/upload");
    assert_eq!(parsed.mutation, "Writes record to SQLite");
    assert_eq!(parsed.side_effects, "Streams bytes to S3 bucket");
}

#[test]
fn test_openai_payload_structure_extraction() {
    // Simulating response payload from OpenAI / OpenRouter chat completions API
    let openai_json = json!({
        "choices": [
            {
                "message": {
                    "content": "{\n  \"question\": \"What does useUpload return?\",\n  \"options\": [\"UseUploadReturn object\", \"void\", \"Promise<boolean>\", \"null\"],\n  \"correct_index\": 0,\n  \"explanation\": \"useUpload returns an object conforming to UseUploadReturn.\"\n}"
                }
            }
        ]
    });

    let content = openai_json
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .expect("Missing content in mock OpenAI response");

    let parsed: MicroChallenge =
        parse_llm_json(content).expect("Failed to parse OpenAI message content");
    assert_eq!(parsed.options.len(), 4);
    assert_eq!(parsed.correct_index, 0);
}

#[test]
fn test_ollama_payload_structure_extraction() {
    // Simulating response payload from Ollama /api/generate
    let ollama_json = json!({
        "response": "{\n  \"mutated_code\": \"file.size < maxSizeBytes\",\n  \"failure_prediction_question\": \"What happens if > is mutated to <?\",\n  \"expected_breakage\": \"Valid small files are rejected while large files pass through.\"\n}"
    });

    let response_str = ollama_json
        .get("response")
        .and_then(|v| v.as_str())
        .expect("Missing response in mock Ollama output");

    let parsed: BreakPrediction =
        parse_llm_json(response_str).expect("Failed to parse Ollama response");
    assert_eq!(parsed.mutated_code, "file.size < maxSizeBytes");
}

#[test]
fn test_invalid_json_handling() {
    let malformed = "This is not json at all!";
    let res: Result<MentalModel, _> = parse_llm_json(malformed);
    assert!(res.is_err());
}
