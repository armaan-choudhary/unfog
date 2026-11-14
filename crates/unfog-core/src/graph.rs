use petgraph::graph::{DiGraph, NodeIndex};
use petgraph::visit::EdgeRef;
use petgraph::Direction;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use walkdir::WalkDir;

use crate::models::{EdgeKind, EdgeMetadata, FogState, NodeKind, NodeMetadata};
use crate::parser::{AstParser, ParsedFile};
use crate::resolver::ModuleResolver;

pub struct DependencyGraph {
    pub graph: DiGraph<NodeMetadata, EdgeMetadata>,
    pub node_indices: HashMap<String, NodeIndex>,
    pub files: HashMap<String, ParsedFile>,
}

impl Default for DependencyGraph {
    fn default() -> Self {
        Self::new()
    }
}

impl DependencyGraph {
    pub fn new() -> Self {
        Self {
            graph: DiGraph::new(),
            node_indices: HashMap::new(),
            files: HashMap::new(),
        }
    }

    pub fn node_count(&self) -> usize {
        self.graph.node_count()
    }

    pub fn edge_count(&self) -> usize {
        self.graph.edge_count()
    }

    pub fn get_node(&self, id: &str) -> Option<&NodeMetadata> {
        let idx = self.node_indices.get(id)?;
        self.graph.node_weight(*idx)
    }

    pub fn find_node(&self, query: &str) -> Option<&NodeMetadata> {
        // 1. Direct ID match
        if let Some(n) = self.get_node(query) {
            return Some(n);
        }

        let q_clean = query.trim().trim_start_matches('/');

        // 2. Exact route match
        for idx in self.graph.node_indices() {
            let node = &self.graph[idx];
            if let Some(rp) = &node.route_path {
                if rp.trim_start_matches('/') == q_clean {
                    return Some(node);
                }
            }
        }

        // 3. Exact file path match (prefer PageRoute/Component over File node if available)
        let mut candidates = Vec::new();
        for idx in self.graph.node_indices() {
            let node = &self.graph[idx];
            if node.file_path == query || node.file_path.ends_with(query) {
                candidates.push(node);
            }
        }
        if !candidates.is_empty() {
            // Prioritize PageRoute, Component, RouteHandler, Hook
            if let Some(c) = candidates.iter().find(|n| {
                matches!(
                    n.kind,
                    NodeKind::PageRoute
                        | NodeKind::Component
                        | NodeKind::RouteHandler
                        | NodeKind::Hook
                )
            }) {
                return Some(*c);
            }
            return Some(candidates[0]);
        }

        // 4. Label match
        for idx in self.graph.node_indices() {
            let node = &self.graph[idx];
            if node.label == query {
                return Some(node);
            }
        }

        None
    }

    pub fn all_nodes(&self) -> Vec<&NodeMetadata> {
        self.graph.node_weights().collect()
    }

    pub fn all_edges(&self) -> Vec<&EdgeMetadata> {
        self.graph.edge_weights().collect()
    }

    pub fn outgoing_neighbors(&self, id: &str) -> Vec<(&EdgeMetadata, &NodeMetadata)> {
        let mut res = Vec::new();
        if let Some(&idx) = self.node_indices.get(id) {
            for edge in self.graph.edges_directed(idx, Direction::Outgoing) {
                let target_idx = edge.target();
                res.push((edge.weight(), &self.graph[target_idx]));
            }
        }
        res
    }

    pub fn incoming_neighbors(&self, id: &str) -> Vec<(&EdgeMetadata, &NodeMetadata)> {
        let mut res = Vec::new();
        if let Some(&idx) = self.node_indices.get(id) {
            for edge in self.graph.edges_directed(idx, Direction::Incoming) {
                let source_idx = edge.source();
                res.push((edge.weight(), &self.graph[source_idx]));
            }
        }
        res
    }

    pub fn dependencies_of(&self, id: &str) -> Vec<&NodeMetadata> {
        self.outgoing_neighbors(id)
            .into_iter()
            .map(|(_, n)| n)
            .collect()
    }

    pub fn dependents_of(&self, id: &str) -> Vec<&NodeMetadata> {
        self.incoming_neighbors(id)
            .into_iter()
            .map(|(_, n)| n)
            .collect()
    }

    pub fn add_or_update_node(&mut self, metadata: NodeMetadata) -> NodeIndex {
        if let Some(&idx) = self.node_indices.get(&metadata.id) {
            self.graph[idx] = metadata;
            idx
        } else {
            let id = metadata.id.clone();
            let idx = self.graph.add_node(metadata);
            self.node_indices.insert(id, idx);
            idx
        }
    }

    pub fn add_edge_by_id(
        &mut self,
        source_id: &str,
        target_id: &str,
        kind: EdgeKind,
        label: &str,
    ) {
        if source_id == target_id {
            return;
        }

        let s_idx = match self.node_indices.get(source_id) {
            Some(&idx) => idx,
            None => return,
        };
        let t_idx = match self.node_indices.get(target_id) {
            Some(&idx) => idx,
            None => return,
        };

        // Avoid duplicate edges of same kind
        let exists = self
            .graph
            .edges_connecting(s_idx, t_idx)
            .any(|e| e.weight().kind == kind);

        if !exists {
            self.graph.add_edge(
                s_idx,
                t_idx,
                EdgeMetadata {
                    source_id: source_id.to_string(),
                    target_id: target_id.to_string(),
                    kind,
                    label: label.to_string(),
                },
            );
        }
    }

    /// Indexes an entire codebase directory and builds the dependency graph
    pub fn index_directory(&mut self, root_path: &Path) -> Result<(), anyhow::Error> {
        let mut ast_parser = AstParser::new();

        // 1. Collect all candidate TypeScript / TSX files
        let mut file_paths = Vec::new();
        for entry in WalkDir::new(root_path)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.is_file() {
                let s = path.to_string_lossy();
                if s.contains("node_modules")
                    || s.contains(".next")
                    || s.contains("/dist/")
                    || s.contains("/target/")
                    || s.contains("/.git/")
                {
                    continue;
                }
                if s.ends_with(".ts")
                    || s.ends_with(".tsx")
                    || s.ends_with(".js")
                    || s.ends_with(".jsx")
                {
                    if !s.ends_with(".d.ts") {
                        file_paths.push(path.to_path_buf());
                    }
                }
            }
        }

        // 2. Parse all files and record normalized relative paths
        let mut parsed_files = HashMap::new();
        let mut known_rel_files = HashSet::new();

        for full_path in &file_paths {
            let rel_path = full_path
                .strip_prefix(root_path)
                .unwrap_or(full_path)
                .to_string_lossy()
                .replace('\\', "/");

            if let Ok(content) = std::fs::read_to_string(full_path) {
                let parsed = ast_parser.parse_source(&rel_path, &content);
                known_rel_files.insert(rel_path.clone());
                parsed_files.insert(rel_path, parsed);
            }
        }

        let resolver = ModuleResolver::new(known_rel_files);

        // 3. Create graph nodes for files and symbols
        for (rel_path, parsed) in &parsed_files {
            // File node
            let file_node_id = rel_path.clone();
            let file_kind = if parsed.is_page {
                NodeKind::PageRoute
            } else if parsed.is_route_handler {
                NodeKind::RouteHandler
            } else {
                NodeKind::File
            };

            let file_metadata = NodeMetadata {
                id: file_node_id.clone(),
                label: Path::new(rel_path)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| rel_path.clone()),
                file_path: rel_path.clone(),
                kind: file_kind,
                fog_state: FogState::Foggy,
                line_start: 1,
                line_end: parsed.line_count,
                code_snippet: None,
                route_path: parsed.route_path.clone(),
                http_method: None,
                description: Some(format!("Module {}", rel_path)),
                trigger: None,
                mutation: None,
                side_effects: None,
            };
            self.add_or_update_node(file_metadata);

            // Symbol nodes for each function / component / hook / route in file
            for func in &parsed.functions {
                let symbol_id = format!("{}:{}", rel_path, func.name);
                let label = if func.kind == NodeKind::RouteHandler {
                    format!("{} {}", func.name, parsed.route_path.as_deref().unwrap_or(""))
                } else {
                    func.name.clone()
                };

                let http_method = if func.kind == NodeKind::RouteHandler {
                    Some(func.name.clone())
                } else {
                    None
                };

                let symbol_metadata = NodeMetadata {
                    id: symbol_id.clone(),
                    label,
                    file_path: rel_path.clone(),
                    kind: func.kind,
                    fog_state: FogState::Foggy,
                    line_start: func.line_start,
                    line_end: func.line_end,
                    code_snippet: Some(func.code_snippet.clone()),
                    route_path: parsed.route_path.clone(),
                    http_method,
                    description: Some(format!("{} in {}", func.name, rel_path)),
                    trigger: func.trigger.clone(),
                    mutation: func.mutation.clone(),
                    side_effects: func.side_effects.clone(),
                };
                self.add_or_update_node(symbol_metadata);

                // File contains symbol edge
                self.add_edge_by_id(&file_node_id, &symbol_id, EdgeKind::Imports, "contains");
            }
        }

        // 4. Resolve imports and wire file-to-file and symbol-to-symbol edges
        for (rel_path, parsed) in &parsed_files {
            let file_id = rel_path.as_str();

            // Track imported file mapping: import_specifier -> target_file_path
            let mut import_file_map: HashMap<&str, String> = HashMap::new();
            for import in &parsed.imports {
                if let Some(target_file) = resolver.resolve_import(rel_path, &import.source) {
                    self.add_edge_by_id(file_id, &target_file, EdgeKind::Imports, "imports");
                    import_file_map.insert(&import.source, target_file);
                }
            }

            // Wire symbol calls, hook usages, renders, and fetches
            for func in &parsed.functions {
                let func_symbol_id = format!("{}:{}", rel_path, func.name);

                // 4a. Hook usages
                for hook in &func.hook_calls {
                    // Look for hook in imported files or local file
                    let mut found = false;
                    for target_file in import_file_map.values() {
                        let candidate_id = format!("{}:{}", target_file, hook);
                        if self.node_indices.contains_key(&candidate_id) {
                            self.add_edge_by_id(
                                &func_symbol_id,
                                &candidate_id,
                                EdgeKind::UsesHook,
                                "uses hook",
                            );
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        // Check if in same file
                        let local_id = format!("{}:{}", rel_path, hook);
                        if self.node_indices.contains_key(&local_id) {
                            self.add_edge_by_id(
                                &func_symbol_id,
                                &local_id,
                                EdgeKind::UsesHook,
                                "uses hook",
                            );
                        }
                    }
                }

                // 4b. Rendered components (JSX)
                for comp in &func.rendered_components {
                    for target_file in import_file_map.values() {
                        let candidate_id = format!("{}:{}", target_file, comp);
                        if self.node_indices.contains_key(&candidate_id) {
                            self.add_edge_by_id(
                                &func_symbol_id,
                                &candidate_id,
                                EdgeKind::Renders,
                                "renders",
                            );
                            break;
                        }
                    }
                }

                // 4c. Function calls
                for call in &func.calls {
                    // Check imported files
                    for target_file in import_file_map.values() {
                        let candidate_id = format!("{}:{}", target_file, call);
                        if self.node_indices.contains_key(&candidate_id) {
                            self.add_edge_by_id(
                                &func_symbol_id,
                                &candidate_id,
                                EdgeKind::Calls,
                                "calls",
                            );
                            break;
                        }
                    }
                    // Check local file
                    let local_id = format!("{}:{}", rel_path, call);
                    if self.node_indices.contains_key(&local_id) && local_id != func_symbol_id {
                        self.add_edge_by_id(
                            &func_symbol_id,
                            &local_id,
                            EdgeKind::Calls,
                            "calls",
                        );
                    }
                }

                // 4d. Fetch route calls (e.g. fetch('/api/upload'))
                for route in &func.fetch_routes {
                    if let Some(target_file) = resolver.resolve_route_to_file(route) {
                        // Find POST / GET route handler symbol or the file node
                        let post_id = format!("{}:POST", target_file);
                        let get_id = format!("{}:GET", target_file);
                        let route_node_id = if self.node_indices.contains_key(&post_id) {
                            post_id
                        } else if self.node_indices.contains_key(&get_id) {
                            get_id
                        } else {
                            target_file
                        };

                        self.add_edge_by_id(
                            &func_symbol_id,
                            &route_node_id,
                            EdgeKind::Fetches,
                            "fetches",
                        );
                    }
                }
            }
        }

        self.files = parsed_files;
        Ok(())
    }

    pub fn to_json(&self) -> serde_json::Value {
        let nodes: Vec<_> = self.all_nodes();
        let edges: Vec<_> = self.all_edges();
        json!({
            "nodes": nodes,
            "edges": edges,
            "node_count": self.node_count(),
            "edge_count": self.edge_count(),
        })
    }
}
