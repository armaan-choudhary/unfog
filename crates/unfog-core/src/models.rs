use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum UnfogError {
    #[error("Node not found: {0}")]
    NodeNotFound(String),
    #[error("Parse error: {0}")]
    ParseError(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("General error: {0}")]
    General(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    File,
    Component,
    Hook,
    Function,
    RouteHandler,
    PageRoute,
    Store,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FogState {
    Foggy,
    Fuzzy,
    Clear,
}

impl Default for FogState {
    fn default() -> Self {
        FogState::Foggy
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NodeMetadata {
    pub id: String,
    pub label: String,
    pub file_path: String,
    pub kind: NodeKind,
    #[serde(default)]
    pub fog_state: FogState,
    pub line_start: usize,
    pub line_end: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trigger: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mutation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side_effects: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeKind {
    Imports,
    Calls,
    UsesHook,
    Renders,
    Fetches,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EdgeMetadata {
    pub source_id: String,
    pub target_id: String,
    pub kind: EdgeKind,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TraceStep {
    pub step_number: usize,
    pub node_id: String,
    pub label: String,
    pub file_path: String,
    pub action: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trigger: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mutation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side_effects: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExecutionTrace {
    pub target: String,
    pub goal: String,
    pub steps: Vec<TraceStep>,
    pub nodes: Vec<NodeMetadata>,
    pub edges: Vec<EdgeMetadata>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BlastRadiusResult {
    pub target_id: String,
    pub target_label: String,
    pub impact_level: String,
    pub affected_nodes: Vec<NodeMetadata>,
    pub affected_routes: Vec<String>,
    pub depth_map: HashMap<String, usize>,
    pub summary: String,
}
