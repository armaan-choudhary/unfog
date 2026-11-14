use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::json;
use std::time::Duration;

use super::{break_prediction_prompt, mental_model_prompt, micro_challenge_prompt, parse_llm_json};
use crate::models::{BreakPrediction, MentalModel, MicroChallenge, NodeContext};

#[derive(Clone)]
pub struct OllamaClient {
    base_url: String,
    model: String,
    client: Client,
}

impl OllamaClient {
    pub fn new(base_url: Option<String>, model: Option<String>) -> Self {
        let base_url = base_url.unwrap_or_else(|| {
            std::env::var("OLLAMA_BASE_URL")
                .unwrap_or_else(|_| "http://localhost:11434".to_string())
                .trim_end_matches('/')
                .to_string()
        });

        let model = model.unwrap_or_else(|| {
            std::env::var("OLLAMA_MODEL").unwrap_or_else(|_| "llama3.2".to_string())
        });

        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_default();

        Self {
            base_url,
            model,
            client,
        }
    }

    /// Check if local Ollama instance is alive and reachable
    pub async fn is_available(&self) -> bool {
        let check_client = Client::builder()
            .timeout(Duration::from_millis(500))
            .build()
            .unwrap_or_default();

        let url = format!("{}/api/tags", self.base_url);
        check_client.get(&url).send().await.map(|r| r.status().is_success()).unwrap_or(false)
    }

    async fn send_prompt(&self, prompt: &str) -> Result<String> {
        let url = format!("{}/api/generate", self.base_url);

        let body = json!({
            "model": self.model,
            "prompt": prompt,
            "format": "json",
            "stream": false
        });

        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| anyhow!("Ollama connection failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Ollama returned status {}: {}", status, text));
        }

        let json_val: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse Ollama response: {}", e))?;

        let text = json_val
            .get("response")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Malformed Ollama output: {:?}", json_val))?;

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
                "Invalid MicroChallenge options length or correct_index from Ollama"
            ))
        }
    }

    pub async fn generate_break_prediction(&self, ctx: &NodeContext) -> Result<BreakPrediction> {
        let prompt = break_prediction_prompt(ctx);
        let raw = self.send_prompt(&prompt).await?;
        parse_llm_json(&raw)
    }
}
