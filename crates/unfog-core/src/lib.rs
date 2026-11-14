pub mod blast_radius;
pub mod diff;
pub mod graph;
pub mod models;
pub mod parser;
pub mod prune;
pub mod resolver;
pub mod slop;

use std::path::Path;

pub use blast_radius::BlastRadiusCalculator;
pub use diff::{DiffReport, FileDiff, GitDiffTracker};
pub use graph::DependencyGraph;
pub use models::*;
pub use parser::AstParser;
pub use prune::ScopedPruner;
pub use resolver::ModuleResolver;
pub use slop::{SlopCategory, SlopDetector, SlopReport, SlopWarning};

/// Convenient entrypoint to index a TypeScript / TSX repository
pub fn index_directory(path: &Path) -> Result<DependencyGraph, anyhow::Error> {
    let mut graph = DependencyGraph::new();
    graph.index_directory(path)?;
    Ok(graph)
}

/// Convenient entrypoint to prune a graph down to a 4-8 node execution trace
pub fn prune_trace(
    graph: &DependencyGraph,
    target: &str,
    goal: Option<&str>,
) -> Result<ExecutionTrace, anyhow::Error> {
    ScopedPruner::prune_trace(graph, target, goal)
}

/// Convenient entrypoint to calculate the blast radius of a file or symbol
pub fn calculate_blast_radius(
    graph: &DependencyGraph,
    target: &str,
) -> Result<BlastRadiusResult, anyhow::Error> {
    BlastRadiusCalculator::calculate(graph, target)
}
