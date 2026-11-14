pub mod ast_analyzer;
pub mod client;
pub mod export;
pub mod llm;
pub mod models;

pub use ast_analyzer::AstAnalyzer;
pub use client::{AiClient, LlmProvider};
pub use export::{generate_architecture_md, generate_cursorrules, generate_export};
pub use models::{BreakPrediction, ExportResult, MentalModel, MicroChallenge, NodeContext};

use unfog_core::{ExecutionTrace, NodeMetadata};

/// Legacy compatibility helpers
pub fn generate_ai_summary(trace: &ExecutionTrace) -> String {
    format!(
        "AI mental model summary for target '{}': {} steps across {} files.",
        trace.target,
        trace.steps.len(),
        trace.nodes.len()
    )
}

pub fn summarize_node(node: &NodeMetadata) -> String {
    format!(
        "Node {}: trigger={:?}, mutation={:?}, side_effects={:?}",
        node.label, node.trigger, node.mutation, node.side_effects
    )
}

/// Convenience standalone function to generate a MentalModel using detected AI provider / fallback
pub async fn get_mental_model(context: &NodeContext) -> MentalModel {
    let client = AiClient::auto_sync();
    client.generate_mental_model(context).await
}

/// Convenience standalone function to generate a MicroChallenge using detected AI provider / fallback
pub async fn get_micro_challenge(context: &NodeContext) -> MicroChallenge {
    let client = AiClient::auto_sync();
    client.generate_micro_challenge(context).await
}

/// Convenience standalone function to generate a BreakPrediction using detected AI provider / fallback
pub async fn get_break_prediction(context: &NodeContext) -> BreakPrediction {
    let client = AiClient::auto_sync();
    client.generate_break_prediction(context).await
}
