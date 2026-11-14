use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::json;
use std::time::Duration;

use super::{break_prediction_prompt, mental_model_prompt, micro_challenge_prompt, parse_llm_json};
use crate::models::{BreakPrediction, MentalModel, MicroChallenge, NodeContext};

#[derive(Clone)]
pub struct GeminiClient {
    api_key: String,
    model: String,
    client: Client,
}

impl GeminiClient {
    pub fn new(api_key: String, model: Option<String>) -> Self {
        let model = model.unwrap_or_else(|| {
            std::env::var("GEMINI_MODEL").unwrap_or_else(|_| "gemini-1.5-flash".to_string())
        });

        let client = Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .unwrap_or_default();

        Self {
            api_key,
            model,
            client,
        }
    }

    async fn send_prompt(&self, prompt: &str) -> Result<String> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            self.model, self.api_key
        );

        let body = json!({
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}]
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json"
            }
        });

        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| anyhow!("Gemini HTTP request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Gemini API returned status {}: {}", status, text));
        }

        let json_val: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| anyhow!("Failed to deserialize Gemini response: {}", e))?;

        let text = json_val
            .pointer("/candidates/0/content/parts/0/text")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Malformed Gemini response payload: {:?}", json_val))?;

        Ok(text.to_string())
    }

    pub async fn generate_mental_model(&self, ctx: &NodeContext) -> Result<MentalModel> {
        let prompt = mental_model_prompt(ctx);
        let raw = self.send_prompt(&prompt).await?;
        parse_llm_json(&raw)
    }

    pub async fn generate_micro_challenge(&self, ctx: &NodeContext) -> Result<MicroChallenge> {
        let prompt = micro_challenge_prompt(ctx);
        let raw = self.send_prompt(&prompt).await?;
        let challenge: MicroChallenge = parse_llm_json(&raw)?;
        if challenge.options.len() == 4 && challenge.correct_index < 4 {
            Ok(challenge)
        } else {
            Err(anyhow!(
                "Invalid MicroChallenge options length or correct_index from Gemini"
            ))
        }
    }

    pub async fn generate_break_prediction(&self, ctx: &NodeContext) -> Result<BreakPrediction> {
        let prompt = break_prediction_prompt(ctx);
        let raw = self.send_prompt(&prompt).await?;
        parse_llm_json(&raw)
    }
}
