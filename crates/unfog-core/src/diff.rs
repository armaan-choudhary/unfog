use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileDiff {
    pub file_path: String,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
    pub summary: String,
    pub diff_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiffReport {
    pub files: Vec<FileDiff>,
    pub total_additions: usize,
    pub total_deletions: usize,
    pub summary: String,
}

pub struct GitDiffTracker;

impl GitDiffTracker {
    /// Tracks git diff changes and translates recent edits into prompt summaries
    pub fn get_diff(repo_dir: &Path) -> DiffReport {
        let status_output = Command::new("git")
            .arg("status")
            .arg("--porcelain")
            .current_dir(repo_dir)
            .output();

        let mut files = Vec::new();
        let mut total_additions = 0;
        let mut total_deletions = 0;

        if let Ok(out) = status_output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                if line.len() < 3 {
                    continue;
                }
                let status_code = line[0..2].trim();
                let file_path = line[3..].trim().to_string();

                let status_str = match status_code {
                    "M" => "modified",
                    "A" => "added",
                    "D" => "deleted",
                    "??" => "untracked",
                    _ => "changed",
                };

                let diff_output = Command::new("git")
                    .args(["diff", "HEAD", "--", &file_path])
                    .current_dir(repo_dir)
                    .output();

                let diff_text = diff_output
                    .ok()
                    .map(|d| String::from_utf8_lossy(&d.stdout).to_string())
                    .unwrap_or_default();

                let additions = diff_text
                    .lines()
                    .filter(|l| l.starts_with('+') && !l.starts_with("+++"))
                    .count();
                let deletions = diff_text
                    .lines()
                    .filter(|l| l.starts_with('-') && !l.starts_with("---"))
                    .count();

                total_additions += additions;
                total_deletions += deletions;

                let summary = format!("{}: +{} / -{} lines", status_str, additions, deletions);

                files.push(FileDiff {
                    file_path,
                    status: status_str.to_string(),
                    additions,
                    deletions,
                    summary,
                    diff_text,
                });
            }
        }

        let summary = if files.is_empty() {
            "No uncommitted changes in current session.".to_string()
        } else {
            format!(
                "Session prompt touched {} file(s): +{} / -{} lines changed.",
                files.len(),
                total_additions,
                total_deletions
            )
        };

        DiffReport {
            files,
            total_additions,
            total_deletions,
            summary,
        }
    }
}
