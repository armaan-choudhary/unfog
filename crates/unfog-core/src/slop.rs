use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::graph::DependencyGraph;
use crate::models::NodeKind;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SlopCategory {
    HardcodedSecret,
    UnusedExport,
    UnusedProp,
    DuplicatedLogic,
    HallucinatedAbstraction,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SlopWarning {
    pub file_path: String,
    pub line_number: usize,
    pub category: SlopCategory,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_snippet: Option<String>,
    pub suggestion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SlopReport {
    pub file_path: Option<String>,
    pub warnings: Vec<SlopWarning>,
    pub slop_score: usize,
    pub summary: String,
}

pub struct SlopDetector;

impl SlopDetector {
    /// Detects AI-generated anti-patterns and slop in the repository or a single file
    pub fn analyze(graph: &DependencyGraph, file_filter: Option<&str>) -> SlopReport {
        let mut warnings = Vec::new();

        // 1. Collect all imported symbols across the entire graph to detect unused exports
        let mut imported_symbols = HashSet::new();
        for parsed_file in graph.files.values() {
            for imp in &parsed_file.imports {
                for named in &imp.named_specifiers {
                    imported_symbols.insert(named.clone());
                }
                if let Some(def) = &imp.default_name {
                    imported_symbols.insert(def.clone());
                }
            }
        }

        // 2. Scan parsed files
        for (rel_path, parsed) in &graph.files {
            if let Some(filter) = file_filter {
                if rel_path != filter && !rel_path.ends_with(filter) {
                    continue;
                }
            }

            // Check hardcoded secrets / tokens
            Self::check_hardcoded_secrets(rel_path, &parsed.raw_source, &mut warnings);

            // Check unused exports
            if !parsed.is_page && !parsed.is_route_handler {
                for exp in &parsed.exports.names {
                    // Ignore common standard exports or route methods
                    if matches!(
                        exp.as_str(),
                        "GET" | "POST" | "PUT" | "DELETE" | "default" | "metadata"
                    ) {
                        continue;
                    }

                    // Check if imported anywhere in the repo
                    if !imported_symbols.contains(exp) {
                        // Find line number
                        let line = parsed
                            .functions
                            .iter()
                            .find(|f| f.name == *exp)
                            .map(|f| f.line_start)
                            .unwrap_or(1);

                        warnings.push(SlopWarning {
                            file_path: rel_path.clone(),
                            line_number: line,
                            category: SlopCategory::UnusedExport,
                            message: format!("Exported symbol `{}` is never imported across the codebase", exp),
                            code_snippet: Some(format!("export ... {}", exp)),
                            suggestion: format!("Remove unused export `{}` or make it private to reduce codebase surface.", exp),
                        });
                    }
                }
            }

            // Check unused component props
            Self::check_unused_props(rel_path, &parsed.raw_source, parsed, &mut warnings);
        }

        let slop_score = (warnings.len() * 15).min(100);
        let summary = if warnings.is_empty() {
            "No AI slop or technical debt detected. Codebase is clean and well-structured.".to_string()
        } else {
            format!(
                "Detected {} potential AI debt items (Slop score: {}/100).",
                warnings.len(),
                slop_score
            )
        };

        SlopReport {
            file_path: file_filter.map(|s| s.to_string()),
            warnings,
            slop_score,
            summary,
        }
    }

    fn check_hardcoded_secrets(file_path: &str, source: &str, warnings: &mut Vec<SlopWarning>) {
        let suspicious_tokens = [
            ("mock_sig", "Mock signature / hardcoded credential in source"),
            ("AKIA", "Possible hardcoded AWS Access Key ID"),
            ("sk_test_", "Hardcoded Stripe/API Test Secret Key"),
            ("sk_live_", "Hardcoded Stripe/API Live Secret Key"),
            ("ghp_", "Hardcoded GitHub Personal Access Token"),
        ];

        for (line_idx, line) in source.lines().enumerate() {
            for (token, desc) in &suspicious_tokens {
                if line.contains(token) && !line.trim_start().starts_with("//") {
                    warnings.push(SlopWarning {
                        file_path: file_path.to_string(),
                        line_number: line_idx + 1,
                        category: SlopCategory::HardcodedSecret,
                        message: format!("{}: contains `{}`", desc, token),
                        code_snippet: Some(line.trim().to_string()),
                        suggestion: "Extract secret or token into an environment variable (`process.env.VAR`).".to_string(),
                    });
                }
            }
        }
    }

    fn check_unused_props(
        file_path: &str,
        _source: &str,
        parsed: &crate::parser::ParsedFile,
        warnings: &mut Vec<SlopWarning>,
    ) {
        // Inspect component functions in this file
        for func in &parsed.functions {
            if func.kind == NodeKind::Component {
                // If code snippet declares props e.g. ({ onSuccess, allowedExtensions, maxSizeBytes }: Props)
                if let Some(start_paren) = func.code_snippet.find('(') {
                    if let Some(end_paren) = func.code_snippet.find(')') {
                        let params = &func.code_snippet[start_paren + 1..end_paren];
                        if params.starts_with('{') && params.contains('}') {
                            let destructured = params
                                .trim_matches(|c| c == '{' || c == '}')
                                .split(':')
                                .next()
                                .unwrap_or("");
                            for prop in destructured.split(',') {
                                let prop_name = prop.trim();
                                if !prop_name.is_empty()
                                    && !prop_name.contains(' ')
                                    && !prop_name.starts_with('/')
                                {
                                    // Count occurrences in function body
                                    let body = &func.code_snippet[end_paren..];
                                    let count = body.matches(prop_name).count();
                                    if count == 0 {
                                        warnings.push(SlopWarning {
                                            file_path: file_path.to_string(),
                                            line_number: func.line_start,
                                            category: SlopCategory::UnusedProp,
                                            message: format!("Component `{}` accepts prop `{}` but never uses it in render or handlers", func.name, prop_name),
                                            code_snippet: Some(format!("({} ...)", prop_name)),
                                            suggestion: format!("Remove dead prop `{}` from component interface and parameters.", prop_name),
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
