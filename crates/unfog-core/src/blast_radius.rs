use std::collections::{HashMap, HashSet, VecDeque};

use crate::graph::DependencyGraph;
use crate::models::{BlastRadiusResult, NodeKind, NodeMetadata};

pub struct BlastRadiusCalculator;

impl BlastRadiusCalculator {
    /// Computes the blast radius for a target node or file using BFS traversal
    pub fn calculate(
        graph: &DependencyGraph,
        target_query: &str,
    ) -> Result<BlastRadiusResult, anyhow::Error> {
        let target = graph.find_node(target_query).ok_or_else(|| {
            anyhow::anyhow!("Could not find target node or route matching: '{}'", target_query)
        })?;

        let mut visited = HashSet::new();
        let mut depth_map = HashMap::new();
        let mut affected_nodes: Vec<NodeMetadata> = Vec::new();
        let mut affected_routes = Vec::new();

        let mut queue = VecDeque::new();

        // Also check if target is a file or symbol
        queue.push_back((target.id.clone(), 0));
        visited.insert(target.id.clone());
        depth_map.insert(target.id.clone(), 0);

        // If target is a file node, also enqueue all its member symbols
        for (edge, symbol_node) in graph.outgoing_neighbors(&target.id) {
            if edge.label == "contains" && !visited.contains(&symbol_node.id) {
                visited.insert(symbol_node.id.clone());
                depth_map.insert(symbol_node.id.clone(), 0);
                queue.push_back((symbol_node.id.clone(), 0));
            }
        }

        // BFS traversal along incoming edges (dependents/callers)
        while let Some((curr_id, depth)) = queue.pop_front() {
            for (_, src_node) in graph.incoming_neighbors(&curr_id) {
                if !visited.contains(&src_node.id) {
                    visited.insert(src_node.id.clone());
                    let new_depth = depth + 1;
                    depth_map.insert(src_node.id.clone(), new_depth);
                    affected_nodes.push(src_node.clone());

                    if let Some(route) = &src_node.route_path {
                        if !affected_routes.contains(route) {
                            affected_routes.push(route.clone());
                        }
                    }

                    queue.push_back((src_node.id.clone(), new_depth));
                }
            }
        }

        // Sort affected nodes by depth ascending
        affected_nodes.sort_by_key(|n| depth_map.get(&n.id).copied().unwrap_or(usize::MAX));

        // Determine impact level
        let impact_level = Self::assess_impact_level(&target, affected_nodes.len(), affected_routes.len());

        let summary = format!(
            "Modifying '{}' affects {} components/modules across {} route(s) ({}). Impact level: {}.",
            target.label,
            affected_nodes.len(),
            affected_routes.len(),
            if affected_routes.is_empty() {
                "internal only".to_string()
            } else {
                affected_routes.join(", ")
            },
            impact_level
        );

        Ok(BlastRadiusResult {
            target_id: target.id.clone(),
            target_label: target.label.clone(),
            impact_level,
            affected_nodes,
            affected_routes,
            depth_map,
            summary,
        })
    }

    fn assess_impact_level(
        target: &NodeMetadata,
        affected_count: usize,
        route_count: usize,
    ) -> String {
        if target.kind == NodeKind::Store
            || target.file_path.contains("db.ts")
            || target.file_path.contains("store.ts")
            || affected_count >= 8
            || route_count >= 3
        {
            "Critical".to_string()
        } else if affected_count >= 4 || route_count >= 2 || target.file_path.contains("s3.ts") {
            "High".to_string()
        } else if affected_count >= 2 || route_count >= 1 {
            "Medium".to_string()
        } else {
            "Low".to_string()
        }
    }
}
