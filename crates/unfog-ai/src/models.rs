use serde::{Deserialize, Serialize};

/// 3-part mental model + 3-level progressive disclosure
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MentalModel {
    pub trigger: String,
    pub mutation: String,
    pub side_effects: String,
    pub l1_vibe: String,
    pub l2_builder: String,
    pub l3_deep_dive: String,
}

/// Dynamic micro-challenge to test comprehension of actual code logic
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MicroChallenge {
    pub question: String,
    pub options: Vec<String>,
    pub correct_index: usize,
    pub explanation: String,
}

/// Break-it sandbox mutation prediction
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BreakPrediction {
    pub mutated_code: String,
    pub failure_prediction_question: String,
    pub expected_breakage: String,
}

/// Context passed to generate mental models, challenges, and mutations
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct NodeContext {
    #[serde(alias = "node_id")]
    pub id: String,
    pub label: String,
    pub file_path: String,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub code_snippet: Option<String>,
    #[serde(default)]
    pub route_path: Option<String>,
    #[serde(default)]
    pub http_method: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub trigger: Option<String>,
    #[serde(default)]
    pub mutation: Option<String>,
    #[serde(default)]
    pub side_effects: Option<String>,
    #[serde(default)]
    pub full_file_content: Option<String>,
}

impl From<&unfog_core::NodeMetadata> for NodeContext {
    fn from(n: &unfog_core::NodeMetadata) -> Self {
        Self {
            id: n.id.clone(),
            label: n.label.clone(),
            file_path: n.file_path.clone(),
            kind: Some(format!("{:?}", n.kind)),
            code_snippet: n.code_snippet.clone(),
            route_path: n.route_path.clone(),
            http_method: n.http_method.clone(),
            description: n.description.clone(),
            trigger: n.trigger.clone(),
            mutation: n.mutation.clone(),
            side_effects: n.side_effects.clone(),
            full_file_content: None,
        }
    }
}

impl From<unfog_core::NodeMetadata> for NodeContext {
    fn from(n: unfog_core::NodeMetadata) -> Self {
        Self::from(&n)
    }
}

/// Export package for architecture documentation and editor rules
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExportResult {
    pub architecture_md: String,
    pub cursorrules: String,
}
