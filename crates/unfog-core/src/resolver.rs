use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

pub struct ModuleResolver {
    known_files: HashSet<String>,
}

impl ModuleResolver {
    pub fn new(known_files: HashSet<String>) -> Self {
        Self { known_files }
    }

    /// Resolves an import specifier from an importing file to a project-relative file path.
    pub fn resolve_import(
        &self,
        importing_file: &str,
        import_specifier: &str,
    ) -> Option<String> {
        let spec = import_specifier.trim();

        // Skip non-local imports (e.g. 'react', 'next/link')
        if !spec.starts_with('.') && !spec.starts_with('@') && !spec.starts_with('~') && !spec.starts_with('/') {
            return None;
        }

        let base_path = if spec.starts_with('@') || spec.starts_with('~') {
            // Alias mapped to repo root
            let trimmed = spec.trim_start_matches('@').trim_start_matches('~').trim_start_matches('/');
            PathBuf::from(trimmed)
        } else {
            let importing_dir = Path::new(importing_file)
                .parent()
                .unwrap_or_else(|| Path::new(""));
            let joined = importing_dir.join(spec);
            normalize_path(&joined)
        };

        self.match_file_candidates(&base_path)
    }

    /// Resolves an HTTP / Next.js route path (e.g. "/api/upload" or "/dashboard") to the route handler or page file.
    pub fn resolve_route_to_file(&self, route_path: &str) -> Option<String> {
        let clean = route_path.trim().trim_start_matches('/');

        // 1. Try App Router route handler (e.g. app/api/upload/route.ts)
        let route_handler_path = if clean.is_empty() {
            "app/route.ts".to_string()
        } else {
            format!("app/{}/route.ts", clean)
        };
        if let Some(f) = self.find_known(&route_handler_path) {
            return Some(f);
        }
        let route_handler_tsx = if clean.is_empty() {
            "app/route.tsx".to_string()
        } else {
            format!("app/{}/route.tsx", clean)
        };
        if let Some(f) = self.find_known(&route_handler_tsx) {
            return Some(f);
        }

        // 2. Try App Router page (e.g. app/upload/page.tsx or app/page.tsx)
        let page_path = if clean.is_empty() {
            "app/page.tsx".to_string()
        } else {
            format!("app/{}/page.tsx", clean)
        };
        if let Some(f) = self.find_known(&page_path) {
            return Some(f);
        }
        let page_ts = if clean.is_empty() {
            "app/page.ts".to_string()
        } else {
            format!("app/{}/page.ts", clean)
        };
        if let Some(f) = self.find_known(&page_ts) {
            return Some(f);
        }

        None
    }

    fn match_file_candidates(&self, base: &Path) -> Option<String> {
        let base_str = base.to_string_lossy().replace('\\', "/");

        // Exact match
        if let Some(f) = self.find_known(&base_str) {
            return Some(f);
        }

        // Common extensions
        let extensions = [
            ".tsx",
            ".ts",
            ".jsx",
            ".js",
            "/index.tsx",
            "/index.ts",
            "/index.jsx",
            "/index.js",
            "/route.ts",
            "/page.tsx",
        ];

        for ext in extensions {
            let candidate = format!("{}{}", base_str, ext);
            if let Some(f) = self.find_known(&candidate) {
                return Some(f);
            }
        }

        None
    }

    fn find_known(&self, candidate: &str) -> Option<String> {
        let norm_cand = candidate.replace('\\', "/");
        if self.known_files.contains(&norm_cand) {
            return Some(norm_cand);
        }

        // Check suffix match (in case paths are prefixed with repository dir)
        for known in &self.known_files {
            if known.ends_with(&norm_cand) {
                return Some(known.clone());
            }
        }

        None
    }
}

pub fn normalize_path(path: &Path) -> PathBuf {
    let mut components = Vec::new();
    for comp in path.components() {
        match comp {
            Component::Normal(c) => components.push(c),
            Component::ParentDir => {
                components.pop();
            }
            Component::CurDir => {}
            _ => {}
        }
    }
    components.into_iter().collect()
}
