use std::sync::Mutex;
use tracing::{info, warn};

use crate::ast_analyzer::AstAnalyzer;
use crate::llm::gemini::GeminiClient;
use crate::llm::ollama::OllamaClient;
use crate::llm::openai::OpenAiClient;
use crate::models::{BreakPrediction, MentalModel, MicroChallenge, NodeContext};

#[derive(Clone)]
pub enum LlmProvider {
    Gemini(GeminiClient),
    OpenAI(OpenAiClient),
    Ollama(OllamaClient),
    Fallback,
}

pub struct AiClient {
    provider: LlmProvider,
    analyzer: Mutex<AstAnalyzer>,
}

impl Default for AiClient {
    fn default() -> Self {
        Self::auto_sync()
    }
}

impl AiClient {
    /// Detect provider synchronously from environment variables
    pub fn auto_sync() -> Self {
        if let Ok(key) = std::env::var("GEMINI_API_KEY") {
            if !key.trim().is_empty() {
                info!("Initialized AiClient with Gemini provider");
                return Self::with_gemini(key, None);
            }
        }

        if let Ok(key) = std::env::var("OPENAI_API_KEY") {
            if !key.trim().is_empty() {
                info!("Initialized AiClient with OpenAI provider");
                return Self::with_openai(key, None, None);
            }
        }

        if let Ok(url) = std::env::var("OLLAMA_BASE_URL") {
            if !url.trim().is_empty() {
                info!("Initialized AiClient with Ollama provider at {}", url);
                return Self::with_ollama(Some(url), None);
            }
        }

        info!("No LLM API keys configured. Using deterministic AST/code analysis fallback engine.");
        Self::fallback_only()
    }

    /// Detect provider asynchronously, testing Ollama connectivity if no cloud API keys set
    pub async fn auto() -> Self {
        if let Ok(key) = std::env::var("GEMINI_API_KEY") {
            if !key.trim().is_empty() {
                return Self::with_gemini(key, None);
            }
        }

        if let Ok(key) = std::env::var("OPENAI_API_KEY") {
            if !key.trim().is_empty() {
                return Self::with_openai(key, None, None);
            }
        }

        let ollama = OllamaClient::new(None, None);
        if ollama.is_available().await {
            info!("Local Ollama instance detected at http://localhost:11434");
            return Self {
                provider: LlmProvider::Ollama(ollama),
                analyzer: Mutex::new(AstAnalyzer::new()),
            };
        }

        Self::fallback_only()
    }

    pub fn with_gemini(api_key: String, model: Option<String>) -> Self {
        Self {
            provider: LlmProvider::Gemini(GeminiClient::new(api_key, model)),
            analyzer: Mutex::new(AstAnalyzer::new()),
        }
    }

    pub fn with_openai(api_key: String, base_url: Option<String>, model: Option<String>) -> Self {
        Self {
            provider: LlmProvider::OpenAI(OpenAiClient::new(api_key, base_url, model)),
            analyzer: Mutex::new(AstAnalyzer::new()),
        }
    }

    pub fn with_ollama(base_url: Option<String>, model: Option<String>) -> Self {
        Self {
            provider: LlmProvider::Ollama(OllamaClient::new(base_url, model)),
            analyzer: Mutex::new(AstAnalyzer::new()),
        }
    }

    pub fn fallback_only() -> Self {
        Self {
            provider: LlmProvider::Fallback,
            analyzer: Mutex::new(AstAnalyzer::new()),
        }
    }

    pub fn provider(&self) -> &LlmProvider {
        &self.provider
    }

    pub fn provider_name(&self) -> &'static str {
        match &self.provider {
            LlmProvider::Gemini(_) => "Gemini",
            LlmProvider::OpenAI(_) => "OpenAI",
            LlmProvider::Ollama(_) => "Ollama",
            LlmProvider::Fallback => "DeterministicASTFallback",
        }
    }

    /// Generate 3-part mental model + 3-level progressive disclosure
    pub async fn generate_mental_model(&self, ctx: &NodeContext) -> MentalModel {
        match &self.provider {
            LlmProvider::Gemini(c) => match c.generate_mental_model(ctx).await {
                Ok(m) => return m,
                Err(e) => warn!("Gemini mental model generation failed, falling back to AST: {}", e),
            },
            LlmProvider::OpenAI(c) => match c.generate_mental_model(ctx).await {
                Ok(m) => return m,
                Err(e) => warn!("OpenAI mental model generation failed, falling back to AST: {}", e),
            },
            LlmProvider::Ollama(c) => match c.generate_mental_model(ctx).await {
                Ok(m) => return m,
                Err(e) => warn!("Ollama mental model generation failed, falling back to AST: {}", e),
            },
            LlmProvider::Fallback => {}
        }

        let mut analyzer = self.analyzer.lock().unwrap();
        analyzer.generate_mental_model(ctx)
    }

    /// Generate dynamic micro-challenge testing real variables and logic
    pub async fn generate_micro_challenge(&self, ctx: &NodeContext) -> MicroChallenge {
        match &self.provider {
            LlmProvider::Gemini(c) => match c.generate_micro_challenge(ctx).await {
                Ok(ch) => return ch,
                Err(e) => warn!("Gemini challenge generation failed, falling back to AST: {}", e),
            },
            LlmProvider::OpenAI(c) => match c.generate_micro_challenge(ctx).await {
                Ok(ch) => return ch,
                Err(e) => warn!("OpenAI challenge generation failed, falling back to AST: {}", e),
            },
            LlmProvider::Ollama(c) => match c.generate_micro_challenge(ctx).await {
                Ok(ch) => return ch,
                Err(e) => warn!("Ollama challenge generation failed, falling back to AST: {}", e),
            },
            LlmProvider::Fallback => {}
        }

        let mut analyzer = self.analyzer.lock().unwrap();
        analyzer.generate_micro_challenge(ctx)
    }

    /// Generate Break-It Sandbox mutated code snippet and failure prediction
    pub async fn generate_break_prediction(&self, ctx: &NodeContext) -> BreakPrediction {
        match &self.provider {
            LlmProvider::Gemini(c) => match c.generate_break_prediction(ctx).await {
                Ok(bp) => return bp,
                Err(e) => warn!("Gemini break prediction failed, falling back to AST: {}", e),
            },
            LlmProvider::OpenAI(c) => match c.generate_break_prediction(ctx).await {
                Ok(bp) => return bp,
                Err(e) => warn!("OpenAI break prediction failed, falling back to AST: {}", e),
            },
            LlmProvider::Ollama(c) => match c.generate_break_prediction(ctx).await {
                Ok(bp) => return bp,
                Err(e) => warn!("Ollama break prediction failed, falling back to AST: {}", e),
            },
            LlmProvider::Fallback => {}
        }

        let mut analyzer = self.analyzer.lock().unwrap();
        analyzer.generate_break_prediction(ctx)
    }
}
