use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::json;
use std::time::Duration;

use super::{break_prediction_prompt, mental_model_prompt, micro_challenge_prompt, parse_llm_json};
use crate::models::{BreakPrediction, MentalModel, MicroChallenge, NodeContext};

#[derive(Clone)]
pub struct OpenAiClient {
    api_key: String,
    base_url: String,
    model: String,
    client: Client,
}

impl OpenAiClient {
    pub fn new(api_key: String, base_url: Option<String>, model: Option<String>) -> Self {
        let base_url = base_url.unwrap_or_else(|| {
            if let Ok(env_url) = std::env::var("OPENAI_BASE_URL") {
                env_url.trim_end_matches('/').to_string()
            } else if api_key.starts_with("sk-or-") {
                "https://openrouter.ai/api/v1".to_string()
            } else {
                "https://api.openai.com/v1".to_string()
            }
        });

        let model = model.unwrap_or_else(|| {
            std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4o-mini".to_string())
        });

        let client = Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .unwrap_or_default();

        Self {
            api_key,
            base_url,
            model,
            client,
        }
    }

    async fn send_prompt(&self, prompt: &str) -> Result<String> {
        let url = format!("{}/chat/completions", self.base_url);

        let body = json!({
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a code comprehension engine. Output strictly valid JSON matching the schema."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "response_format": {"type": "json_object"}
        });

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| anyhow!("OpenAI/OpenRouter HTTP request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("OpenAI API error {}: {}", status, text));
        }

        let json_val: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse OpenAI JSON: {}", e))?;

        let text = json_val
            .pointer("/choices/0/message/content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Malformed OpenAI response choices: {:?}", json_val))?;

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
                "Invalid MicroChallenge options length or correct_index from OpenAI"
            ))
        }
    }

    pub async fn generate_break_prediction(&self, ctx: &NodeContext) -> Result<BreakPrediction> {
        let prompt = break_prediction_prompt(ctx);
        let raw = self.send_prompt(&prompt).await?;
        parse_llm_json(&raw)
    }
}
