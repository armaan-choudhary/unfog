use std::collections::{HashSet, VecDeque};

use crate::graph::DependencyGraph;
use crate::models::{EdgeKind, EdgeMetadata, ExecutionTrace, NodeKind, NodeMetadata, TraceStep};

pub struct ScopedPruner;

impl ScopedPruner {
    /// Prunes the repository graph down to a focused 4-8 node linear execution trace
    pub fn prune_trace(
        graph: &DependencyGraph,
        target_query: &str,
        goal: Option<&str>,
    ) -> Result<ExecutionTrace, anyhow::Error> {
        let goal_str = goal.unwrap_or("Trace");

        // 1. Locate anchor node
        let anchor = graph.find_node(target_query).ok_or_else(|| {
            anyhow::anyhow!("Could not find target node or route matching: '{}'", target_query)
        })?;

        // 2. Discover upstream roots (entrypoints like PageRoute or UI Component)
        let root = Self::find_upstream_entrypoint(graph, &anchor.id);

        // 3. Extract the primary execution chain from root
        let mut ordered_nodes = Self::extract_execution_chain(graph, &root.id, &anchor.id);

        // 4. Ensure node count is between 4 and 8 nodes
        if ordered_nodes.len() < 4 {
            Self::expand_context_nodes(graph, &mut ordered_nodes, 4);
        } else if ordered_nodes.len() > 8 {
            ordered_nodes.truncate(8);
        }

        // 5. Build chronological trace steps
        let mut steps = Vec::new();
        for (i, node) in ordered_nodes.iter().enumerate() {
            let step_number = i + 1;
            let (action, description) = Self::generate_step_narrative(node, step_number, ordered_nodes.len());
            steps.push(TraceStep {
                step_number,
                node_id: node.id.clone(),
                label: node.label.clone(),
                file_path: node.file_path.clone(),
                action,
                description,
                code_snippet: node.code_snippet.clone(),
                trigger: node.trigger.clone(),
                mutation: node.mutation.clone(),
                side_effects: node.side_effects.clone(),
            });
        }

        // 6. Collect edges connecting the selected nodes
        let node_ids: HashSet<&str> = ordered_nodes.iter().map(|n| n.id.as_str()).collect();
        let mut trace_edges = Vec::new();

        for i in 0..ordered_nodes.len() {
            let src_id = &ordered_nodes[i].id;
            for (edge, target) in graph.outgoing_neighbors(src_id) {
                if node_ids.contains(target.id.as_str()) && target.id != *src_id {
                    trace_edges.push(edge.clone());
                }
            }
        }

        // If linear chain has missing links in edges, add step-to-step trace transition edges
        for i in 0..ordered_nodes.len().saturating_sub(1) {
            let src_id = &ordered_nodes[i].id;
            let dst_id = &ordered_nodes[i + 1].id;
            let already_connected = trace_edges
                .iter()
                .any(|e| e.source_id == *src_id && e.target_id == *dst_id);
            if !already_connected {
                trace_edges.push(EdgeMetadata {
                    source_id: src_id.clone(),
                    target_id: dst_id.clone(),
                    kind: EdgeKind::Calls,
                    label: "next step".to_string(),
                });
            }
        }

        // 7. Generate summary
        let summary = format!(
            "Scoped execution flow for '{}' ({} nodes): {}",
            target_query,
            ordered_nodes.len(),
            ordered_nodes
                .iter()
                .map(|n| n.label.as_str())
                .collect::<Vec<_>>()
                .join(" → ")
        );

        Ok(ExecutionTrace {
            target: target_query.to_string(),
            goal: goal_str.to_string(),
            steps,
            nodes: ordered_nodes,
            edges: trace_edges,
            summary,
        })
    }

    fn find_upstream_entrypoint<'a>(
        graph: &'a DependencyGraph,
        anchor_id: &str,
    ) -> &'a NodeMetadata {
        let anchor = match graph.get_node(anchor_id) {
            Some(n) => n,
            None => return graph.all_nodes()[0],
        };

        if anchor.kind == NodeKind::PageRoute {
            return anchor;
        }

        // Traverse incoming edges up to 4 hops to find a PageRoute or high-level Component
        let mut visited = HashSet::new();
        let mut queue = VecDeque::new();
        queue.push_back((anchor_id, 0));
        visited.insert(anchor_id);

        let mut best_root = anchor;

        while let Some((curr_id, depth)) = queue.pop_front() {
            if depth > 4 {
                break;
            }
            if let Some(node) = graph.get_node(curr_id) {
                if node.kind == NodeKind::PageRoute {
                    return node;
                }
                if node.kind == NodeKind::Component && best_root.kind != NodeKind::PageRoute {
                    best_root = node;
                }
            }

            for (_, src_node) in graph.incoming_neighbors(curr_id) {
                if !visited.contains(src_node.id.as_str()) {
                    visited.insert(src_node.id.as_str());
                    queue.push_back((&src_node.id, depth + 1));
                }
            }
        }

        best_root
    }

    fn extract_execution_chain(
        graph: &DependencyGraph,
        root_id: &str,
        anchor_id: &str,
    ) -> Vec<NodeMetadata> {
        let mut chain = Vec::new();
        let mut visited = HashSet::new();

        let mut curr_id = root_id.to_string();

        while chain.len() < 8 {
            if visited.contains(&curr_id) {
                break;
            }
            visited.insert(curr_id.clone());

            if let Some(node) = graph.get_node(&curr_id) {
                // If it's a file node and we already have symbol nodes in the file, we can prefer symbol node
                chain.push(node.clone());
            }

            // Find next best step along execution edges
            let neighbors = graph.outgoing_neighbors(&curr_id);
            if neighbors.is_empty() {
                break;
            }

            // Prefer execution edges in priority: Renders -> UsesHook -> Fetches -> Calls -> Imports
            let mut candidates: Vec<_> = neighbors
                .into_iter()
                .filter(|(_, n)| !visited.contains(&n.id) && n.id != curr_id)
                .collect();

            candidates.sort_by_key(|(edge, target)| {
                let priority = match edge.kind {
                    EdgeKind::Renders => 1,
                    EdgeKind::UsesHook => 2,
                    EdgeKind::Fetches => 3,
                    EdgeKind::Calls => 4,
                    EdgeKind::Imports => 5,
                };
                // Give extra weight if target matches anchor
                let is_anchor = if target.id == anchor_id || target.file_path == anchor_id {
                    0
                } else {
                    10
                };
                priority + is_anchor
            });

            if let Some((_, next_node)) = candidates.first() {
                curr_id = next_node.id.clone();
            } else {
                break;
            }
        }

        // If anchor wasn't visited and exists, ensure anchor is in the chain
        if !visited.contains(anchor_id) {
            if let Some(anchor_node) = graph.get_node(anchor_id) {
                if chain.len() < 8 {
                    chain.push(anchor_node.clone());
                }
            }
        }

        chain
    }

    fn expand_context_nodes(
        graph: &DependencyGraph,
        chain: &mut Vec<NodeMetadata>,
        min_nodes: usize,
    ) {
        let mut visited: HashSet<String> = chain.iter().map(|n| n.id.clone()).collect();

        // 1. Check neighbors of existing chain nodes (e.g. stores, database services, subcomponents)
        for i in 0..chain.len() {
            if chain.len() >= min_nodes {
                break;
            }
            let curr_id = chain[i].id.clone();
            for (_, neighbor) in graph.outgoing_neighbors(&curr_id) {
                if !visited.contains(&neighbor.id)
                    && neighbor.kind != NodeKind::File
                {
                    visited.insert(neighbor.id.clone());
                    chain.push(neighbor.clone());
                    if chain.len() >= min_nodes {
                        break;
                    }
                }
            }
        }

        // 2. If still below min_nodes, pull from incoming neighbors (callers / parent pages)
        for i in 0..chain.len() {
            if chain.len() >= min_nodes {
                break;
            }
            let curr_id = chain[i].id.clone();
            for (_, neighbor) in graph.incoming_neighbors(&curr_id) {
                if !visited.contains(&neighbor.id) {
                    visited.insert(neighbor.id.clone());
                    chain.insert(0, neighbor.clone());
                    if chain.len() >= min_nodes {
                        break;
                    }
                }
            }
        }

        // 3. Fallback: pull relevant domain nodes from graph if still below min_nodes
        if chain.len() < min_nodes {
            for node in graph.all_nodes() {
                if !visited.contains(&node.id)
                    && (node.kind == NodeKind::Component
                        || node.kind == NodeKind::Hook
                        || node.kind == NodeKind::RouteHandler
                        || node.kind == NodeKind::Store
                        || node.kind == NodeKind::Function)
                {
                    visited.insert(node.id.clone());
                    chain.push(node.clone());
                    if chain.len() >= min_nodes {
                        break;
                    }
                }
            }
        }
    }

    fn generate_step_narrative(
        node: &NodeMetadata,
        step_number: usize,
        total_steps: usize,
    ) -> (String, String) {
        match node.kind {
            NodeKind::PageRoute => (
                format!("Step {}: Navigate to UI Route `{}`", step_number, node.route_path.as_deref().unwrap_or("/")),
                format!("User accesses `{}`. Initializes page container and mounts interactive child components.", node.file_path),
            ),
            NodeKind::Component => (
                format!("Step {}: Render Component `{}`", step_number, node.label),
                format!("Component `{}` renders to DOM, binding input handlers and hooks.", node.label),
            ),
            NodeKind::Hook => (
                format!("Step {}: Invoke React Hook `{}`", step_number, node.label),
                format!("Hook `{}` manages reactive client state and dispatches API requests.", node.label),
            ),
            NodeKind::RouteHandler => (
                format!("Step {}: Execute Next.js Route Handler `{}`", step_number, node.label),
                format!("API route handler receives HTTP request, validates inputs, and coordinates services."),
            ),
            NodeKind::Store => (
                format!("Step {}: Update Shared State Store", step_number),
                format!("Store updates application state and broadcasts mutations to listeners."),
            ),
            NodeKind::Function | NodeKind::File => {
                if node.file_path.contains("s3.ts") {
                    (
                        format!("Step {}: Cloud Storage Upload via S3", step_number),
                        format!("Uploads file payload to cloud storage bucket and returns signed asset URL."),
                    )
                } else if node.file_path.contains("db.ts") {
                    (
                        format!("Step {}: Persist Record in Database", step_number),
                        format!("Writes asset metadata record into database for persistence and querying."),
                    )
                } else if step_number == total_steps {
                    (
                        format!("Step {}: Complete Execution & Return Result", step_number),
                        format!("Finishes processing in `{}` and completes data flow.", node.label),
                    )
                } else {
                    (
                        format!("Step {}: Call Function `{}`", step_number, node.label),
                        format!("Executes `{}` in `{}` to perform logic.", node.label, node.file_path),
                    )
                }
            }
        }
    }
}
