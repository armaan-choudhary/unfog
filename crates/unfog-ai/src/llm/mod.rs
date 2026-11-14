pub mod gemini;
pub mod ollama;
pub mod openai;

use crate::models::NodeContext;
use anyhow::{anyhow, Result};

/// Extract and parse JSON object from LLM response text
pub fn parse_llm_json<T: serde::de::DeserializeOwned>(raw_text: &str) -> Result<T> {
    let trimmed = raw_text.trim();

    // 1. Direct parse attempt
    if let Ok(val) = serde_json::from_str::<T>(trimmed) {
        return Ok(val);
    }

    // 2. Strip markdown fences: ```json ... ```
    if let Some(start) = trimmed.find("```") {
        let content_after = &trimmed[start + 3..];
        let content_inner = if content_after.starts_with("json") {
            &content_after[4..]
        } else {
            content_after
        };

        if let Some(end) = content_inner.find("```") {
            let extracted = content_inner[..end].trim();
            if let Ok(val) = serde_json::from_str::<T>(extracted) {
                return Ok(val);
            }
        }
    }

    // 3. Substring between first '{' and last '}'
    if let (Some(first_brace), Some(last_brace)) = (trimmed.find('{'), trimmed.rfind('}')) {
        if last_brace > first_brace {
            let extracted = &trimmed[first_brace..=last_brace];
            if let Ok(val) = serde_json::from_str::<T>(extracted) {
                return Ok(val);
            }
        }
    }

    Err(anyhow!(
        "Failed to parse LLM response into target schema. Raw: {}",
        trimmed
    ))
}

pub fn mental_model_prompt(ctx: &NodeContext) -> String {
    let code = ctx
        .code_snippet
        .as_deref()
        .or(ctx.full_file_content.as_deref())
        .unwrap_or("");

    format!(
        r#"You are an expert code architect analyzing a software symbol for the Unfog comprehension engine.
Analyze the following code context and output a JSON object strictly matching this schema:
{{
  "trigger": "What activates or triggers this code (user event, HTTP route, hook render, caller)",
  "mutation": "What state, cache, memory, or database records are mutated",
  "side_effects": "What external systems, network calls, DOM changes, or callbacks are invoked",
  "l1_vibe": "Progressive Disclosure L1: High-level intuitive vibe and mental scaffolding",
  "l2_builder": "Progressive Disclosure L2: System builder perspective (inputs, outputs, hooks, contract)",
  "l3_deep_dive": "Progressive Disclosure L3: Deep implementation invariants, AST details, edge cases"
}}

Node Information:
Label: {}
File: {}
Kind: {}
Route: {}
HTTP Method: {}

Code Snippet:
```typescript
{}
```
Respond with ONLY valid JSON."#,
        ctx.label,
        ctx.file_path,
        ctx.kind.as_deref().unwrap_or("Symbol"),
        ctx.route_path.as_deref().unwrap_or("N/A"),
        ctx.http_method.as_deref().unwrap_or("N/A"),
        code
    )
}

pub fn micro_challenge_prompt(ctx: &NodeContext) -> String {
    let code = ctx
        .code_snippet
        .as_deref()
        .or(ctx.full_file_content.as_deref())
        .unwrap_or("");

    format!(
        r#"You are an expert educator crafting a micro-challenge to test a developer's understanding of this exact code.
Base your question on actual variables, conditionals, hooks, or logic in this code snippet.
Output a JSON object strictly matching this schema:
{{
  "question": "A specific multiple-choice question testing comprehension of logic in this snippet",
  "options": [
    "Option A",
    "Option B",
    "Option C",
    "Option D"
  ],
  "correct_index": 0,
  "explanation": "Clear explanation referencing the exact lines or variables"
}}
Constraints:
- "options" must contain EXACTLY 4 strings.
- "correct_index" must be an integer between 0 and 3.

Node Information:
Label: {}
File: {}

Code Snippet:
```typescript
{}
```
Respond with ONLY valid JSON."#,
        ctx.label, ctx.file_path, code
    )
}

pub fn break_prediction_prompt(ctx: &NodeContext) -> String {
    let code = ctx
        .code_snippet
        .as_deref()
        .or(ctx.full_file_content.as_deref())
        .unwrap_or("");

    format!(
        r#"You are an expert software engineer generating a 'Break-It Sandbox' challenge for Unfog.
Take the code snippet below and introduce ONE subtle, realistic code mutation (e.g. inverted conditional operator, missing await, altered state setter, or skipped error handling).
Output a JSON object strictly matching this schema:
{{
  "mutated_code": "The full code snippet with the single subtle mutation introduced",
  "failure_prediction_question": "Question asking how the application will fail at runtime with this mutation",
  "expected_breakage": "Detailed explanation of the exact failure mode (e.g. Promise pending, TypeError, infinite loading state)"
}}

Node Information:
Label: {}
File: {}

Original Code Snippet:
```typescript
{}
```
Respond with ONLY valid JSON."#,
        ctx.label, ctx.file_path, code
    )
}
