use tree_sitter::{Node, Parser};
use tree_sitter_typescript::LANGUAGE_TSX;

use crate::models::NodeKind;

#[derive(Debug, Clone, PartialEq)]
pub struct ImportItem {
    pub source: String,
    pub default_name: Option<String>,
    pub named_specifiers: Vec<String>,
    pub is_type_only: bool,
    pub line_start: usize,
    pub line_end: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ExportItem {
    pub names: Vec<String>,
    pub default_name: Option<String>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedFunction {
    pub name: String,
    pub is_default: bool,
    pub is_async: bool,
    pub line_start: usize,
    pub line_end: usize,
    pub code_snippet: String,
    pub kind: NodeKind,
    pub calls: Vec<String>,
    pub hook_calls: Vec<String>,
    pub rendered_components: Vec<String>,
    pub fetch_routes: Vec<String>,
    pub trigger: Option<String>,
    pub mutation: Option<String>,
    pub side_effects: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedFile {
    pub file_path: String,
    pub route_path: Option<String>,
    pub is_page: bool,
    pub is_route_handler: bool,
    pub imports: Vec<ImportItem>,
    pub exports: ExportItem,
    pub functions: Vec<ParsedFunction>,
    pub line_count: usize,
    pub raw_source: String,
}

pub struct AstParser {
    parser: Parser,
}

impl Default for AstParser {
    fn default() -> Self {
        Self::new()
    }
}

impl AstParser {
    pub fn new() -> Self {
        let mut parser = Parser::new();
        let language = LANGUAGE_TSX.into();
        parser
            .set_language(&language)
            .expect("Failed to initialize tree-sitter TSX grammar");
        Self { parser }
    }

    /// Extract App Router route path from file path
    pub fn extract_route_path(normalized_path: &str) -> Option<String> {
        let clean = normalized_path.replace('\\', "/");
        if let Some(pos) = clean.find("app/") {
            let sub = &clean[pos + 4..];
            if sub.ends_with("/page.tsx") || sub.ends_with("/page.ts") {
                let route_part = sub
                    .trim_end_matches("/page.tsx")
                    .trim_end_matches("/page.ts");
                if route_part.is_empty() {
                    return Some("/".to_string());
                } else {
                    return Some(format!("/{}", route_part));
                }
            } else if sub == "page.tsx" || sub == "page.ts" {
                return Some("/".to_string());
            } else if sub.ends_with("/route.ts") || sub.ends_with("/route.tsx") {
                let route_part = sub
                    .trim_end_matches("/route.ts")
                    .trim_end_matches("/route.tsx");
                return Some(format!("/{}", route_part));
            }
        }
        None
    }

    pub fn parse_source(&mut self, file_path: &str, source: &str) -> ParsedFile {
        let clean_path = file_path.replace('\\', "/");
        let route_path = Self::extract_route_path(&clean_path);
        let is_page = clean_path.ends_with("page.tsx") || clean_path.ends_with("page.ts");
        let is_route_handler =
            clean_path.ends_with("route.ts") || clean_path.ends_with("route.tsx");

        let tree = self
            .parser
            .parse(source, None)
            .expect("Failed to parse source file");
        let root = tree.root_node();

        let mut imports = Vec::new();
        let mut export_names = Vec::new();
        let mut default_export_name = None;
        let mut functions = Vec::new();

        let mut cursor = root.walk();
        for child in root.children(&mut cursor) {
            match child.kind() {
                "import_statement" => {
                    if let Some(item) = self.parse_import_statement(child, source) {
                        imports.push(item);
                    }
                }
                "export_statement" => {
                    self.parse_export_statement(
                        child,
                        source,
                        &clean_path,
                        &route_path,
                        is_page,
                        is_route_handler,
                        &mut export_names,
                        &mut default_export_name,
                        &mut functions,
                    );
                }
                "function_declaration" => {
                    if let Some(func) = self.parse_function_declaration(
                        child,
                        source,
                        &clean_path,
                        &route_path,
                        is_page,
                        is_route_handler,
                        false,
                    ) {
                        functions.push(func);
                    }
                }
                "lexical_declaration" => {
                    self.parse_lexical_declaration(
                        child,
                        source,
                        &clean_path,
                        &route_path,
                        is_page,
                        is_route_handler,
                        false,
                        &mut functions,
                    );
                }
                _ => {}
            }
        }

        // If file is a Next.js page but no function was matched or default export is separate
        if is_page && functions.iter().all(|f| f.kind != NodeKind::PageRoute) {
            // Find component function in this file and promote to PageRoute
            if let Some(f) = functions.first_mut() {
                if f.kind == NodeKind::Component || f.is_default {
                    f.kind = NodeKind::PageRoute;
                }
            }
        }

        let line_count = source.lines().count();

        ParsedFile {
            file_path: clean_path,
            route_path,
            is_page,
            is_route_handler,
            imports,
            exports: ExportItem {
                names: export_names,
                default_name: default_export_name,
                source: None,
            },
            functions,
            line_count,
            raw_source: source.to_string(),
        }
    }

    fn parse_import_statement(&self, node: Node, source: &str) -> Option<ImportItem> {
        let mut source_path = String::new();
        let mut default_name = None;
        let mut named_specifiers = Vec::new();
        let is_type_only = node
            .child_by_field_name("type")
            .map(|n| &source[n.byte_range()] == "type")
            .unwrap_or(false);

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.kind() == "string" {
                let raw = &source[child.byte_range()];
                source_path = raw.trim_matches(|c| c == '\'' || c == '"' || c == '`').to_string();
            } else if child.kind() == "import_clause" {
                let mut clause_cursor = child.walk();
                for clause_child in child.children(&mut clause_cursor) {
                    if clause_child.kind() == "identifier" {
                        default_name = Some(source[clause_child.byte_range()].to_string());
                    } else if clause_child.kind() == "named_imports" {
                        let mut named_cursor = clause_child.walk();
                        for spec in clause_child.children(&mut named_cursor) {
                            if spec.kind() == "import_specifier" {
                                if let Some(name_node) = spec.child_by_field_name("name") {
                                    named_specifiers
                                        .push(source[name_node.byte_range()].to_string());
                                }
                            }
                        }
                    } else if clause_child.kind() == "namespace_import" {
                        if let Some(id_node) = clause_child.child_by_field_name("name") {
                            default_name = Some(source[id_node.byte_range()].to_string());
                        }
                    }
                }
            }
        }

        if source_path.is_empty() {
            return None;
        }

        Some(ImportItem {
            source: source_path,
            default_name,
            named_specifiers,
            is_type_only,
            line_start: node.start_position().row + 1,
            line_end: node.end_position().row + 1,
        })
    }

    fn parse_export_statement(
        &self,
        node: Node,
        source: &str,
        file_path: &str,
        route_path: &Option<String>,
        is_page: bool,
        is_route_handler: bool,
        export_names: &mut Vec<String>,
        default_export_name: &mut Option<String>,
        functions: &mut Vec<ParsedFunction>,
    ) {
        let node_text = &source[node.byte_range()];
        let is_default = node_text.contains("export default");

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            match child.kind() {
                "function_declaration" => {
                    if let Some(func) = self.parse_function_declaration(
                        child,
                        source,
                        file_path,
                        route_path,
                        is_page,
                        is_route_handler,
                        is_default,
                    ) {
                        export_names.push(func.name.clone());
                        if is_default {
                            *default_export_name = Some(func.name.clone());
                        }
                        functions.push(func);
                    }
                }
                "lexical_declaration" => {
                    self.parse_lexical_declaration(
                        child,
                        source,
                        file_path,
                        route_path,
                        is_page,
                        is_route_handler,
                        is_default,
                        functions,
                    );
                    for f in functions.iter() {
                        if !export_names.contains(&f.name) {
                            export_names.push(f.name.clone());
                        }
                    }
                }
                "export_clause" => {
                    let mut clause_cursor = child.walk();
                    for spec in child.children(&mut clause_cursor) {
                        if spec.kind() == "export_specifier" {
                            if let Some(name_node) = spec.child_by_field_name("name") {
                                export_names.push(source[name_node.byte_range()].to_string());
                            }
                        }
                    }
                }
                "identifier" => {
                    if is_default {
                        *default_export_name = Some(source[child.byte_range()].to_string());
                    }
                }
                _ => {}
            }
        }
    }

    fn parse_function_declaration(
        &self,
        node: Node,
        source: &str,
        file_path: &str,
        _route_path: &Option<String>,
        is_page: bool,
        is_route_handler: bool,
        is_default: bool,
    ) -> Option<ParsedFunction> {
        let name_node = node.child_by_field_name("name")?;
        let name = source[name_node.byte_range()].to_string();
        let is_async = source[node.byte_range()].starts_with("async")
            || source[node.byte_range()].contains("async function");

        let line_start = node.start_position().row + 1;
        let line_end = node.end_position().row + 1;
        let code_snippet = source[node.byte_range()].to_string();

        let mut calls = Vec::new();
        let mut hook_calls = Vec::new();
        let mut rendered_components = Vec::new();
        let mut fetch_routes = Vec::new();

        self.extract_calls_and_jsx(
            node,
            source,
            &mut calls,
            &mut hook_calls,
            &mut rendered_components,
            &mut fetch_routes,
        );

        let kind = self.determine_node_kind(
            &name,
            file_path,
            is_page,
            is_route_handler,
            &rendered_components,
        );

        let (trigger, mutation, side_effects) =
            self.generate_mental_model(&name, kind, file_path, &calls, &fetch_routes);

        Some(ParsedFunction {
            name,
            is_default,
            is_async,
            line_start,
            line_end,
            code_snippet,
            kind,
            calls,
            hook_calls,
            rendered_components,
            fetch_routes,
            trigger,
            mutation,
            side_effects,
        })
    }

    fn parse_lexical_declaration(
        &self,
        node: Node,
        source: &str,
        file_path: &str,
        _route_path: &Option<String>,
        is_page: bool,
        is_route_handler: bool,
        is_default: bool,
        functions: &mut Vec<ParsedFunction>,
    ) {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.kind() == "variable_declarator" {
                if let Some(name_node) = child.child_by_field_name("name") {
                    let name = source[name_node.byte_range()].to_string();
                    let value_node = child.child_by_field_name("value");

                    let is_function_like = value_node
                        .map(|v| {
                            v.kind() == "arrow_function"
                                || v.kind() == "function_expression"
                                || v.kind() == "call_expression"
                                || v.kind() == "object"
                        })
                        .unwrap_or(false);

                    if is_function_like {
                        let line_start = child.start_position().row + 1;
                        let line_end = child.end_position().row + 1;
                        let code_snippet = source[child.byte_range()].to_string();

                        let mut calls = Vec::new();
                        let mut hook_calls = Vec::new();
                        let mut rendered_components = Vec::new();
                        let mut fetch_routes = Vec::new();

                        self.extract_calls_and_jsx(
                            child,
                            source,
                            &mut calls,
                            &mut hook_calls,
                            &mut rendered_components,
                            &mut fetch_routes,
                        );

                        let kind = self.determine_node_kind(
                            &name,
                            file_path,
                            is_page,
                            is_route_handler,
                            &rendered_components,
                        );

                        let (trigger, mutation, side_effects) = self.generate_mental_model(
                            &name,
                            kind,
                            file_path,
                            &calls,
                            &fetch_routes,
                        );

                        functions.push(ParsedFunction {
                            name,
                            is_default,
                            is_async: code_snippet.contains("async"),
                            line_start,
                            line_end,
                            code_snippet,
                            kind,
                            calls,
                            hook_calls,
                            rendered_components,
                            fetch_routes,
                            trigger,
                            mutation,
                            side_effects,
                        });
                    }
                }
            }
        }
    }

    fn extract_calls_and_jsx(
        &self,
        node: Node,
        source: &str,
        calls: &mut Vec<String>,
        hook_calls: &mut Vec<String>,
        rendered_components: &mut Vec<String>,
        fetch_routes: &mut Vec<String>,
    ) {
        let kind = node.kind();
        if kind == "call_expression" {
            if let Some(func_node) = node.child_by_field_name("function") {
                let call_text = &source[func_node.byte_range()];
                let base_name = call_text.split('.').last().unwrap_or(call_text).trim();

                if !base_name.is_empty() && !calls.contains(&base_name.to_string()) {
                    calls.push(base_name.to_string());
                }

                if base_name.starts_with("use")
                    && base_name.len() > 3
                    && base_name.chars().nth(3).map(|c| c.is_uppercase()).unwrap_or(false)
                {
                    if !hook_calls.contains(&base_name.to_string()) {
                        hook_calls.push(base_name.to_string());
                    }
                }

                // Detect fetch or axios
                if base_name == "fetch" || base_name == "post" || base_name == "get" {
                    if let Some(args_node) = node.child_by_field_name("arguments") {
                        let mut arg_cursor = args_node.walk();
                        for arg in args_node.children(&mut arg_cursor) {
                            if arg.kind() == "string" {
                                let route = source[arg.byte_range()]
                                    .trim_matches(|c| c == '\'' || c == '"' || c == '`')
                                    .to_string();
                                if route.starts_with('/') && !fetch_routes.contains(&route) {
                                    fetch_routes.push(route);
                                }
                            }
                        }
                    }
                }
            }
        } else if kind == "jsx_opening_element" || kind == "jsx_self_closing_element" {
            // Find tag name
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.kind() == "identifier" {
                    let tag = source[child.byte_range()].to_string();
                    if tag.chars().next().map(|c| c.is_uppercase()).unwrap_or(false)
                        && tag != "React"
                        && tag != "Fragment"
                        && tag != "Link"
                    {
                        if !rendered_components.contains(&tag) {
                            rendered_components.push(tag);
                        }
                    }
                }
            }
        }

        // Recursively traverse
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            self.extract_calls_and_jsx(
                child,
                source,
                calls,
                hook_calls,
                rendered_components,
                fetch_routes,
            );
        }
    }

    fn determine_node_kind(
        &self,
        name: &str,
        file_path: &str,
        is_page: bool,
        is_route_handler: bool,
        rendered_components: &[String],
    ) -> NodeKind {
        if is_route_handler {
            if matches!(
                name,
                "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS"
            ) {
                return NodeKind::RouteHandler;
            }
        }

        if is_page && (name.ends_with("Page") || !rendered_components.is_empty()) {
            return NodeKind::PageRoute;
        }

        if name.starts_with("use")
            && name.len() > 3
            && name.chars().nth(3).map(|c| c.is_uppercase()).unwrap_or(false)
        {
            return NodeKind::Hook;
        }

        if name == "store" || file_path.contains("store.ts") || file_path.contains("store.js") {
            return NodeKind::Store;
        }

        if name.chars().next().map(|c| c.is_uppercase()).unwrap_or(false)
            && (!rendered_components.is_empty()
                || file_path.contains("components/")
                || name.ends_with("Btn")
                || name.ends_with("Card")
                || name.ends_with("Navbar"))
        {
            return NodeKind::Component;
        }

        NodeKind::Function
    }

    fn generate_mental_model(
        &self,
        name: &str,
        kind: NodeKind,
        file_path: &str,
        calls: &[String],
        fetch_routes: &[String],
    ) -> (Option<String>, Option<String>, Option<String>) {
        match kind {
            NodeKind::PageRoute => (
                Some("User navigates to page route".to_string()),
                Some("Initializes local page state and parameters".to_string()),
                Some("Renders child components and attaches event handlers".to_string()),
            ),
            NodeKind::Component => (
                Some(format!("User interacts with `{}` UI element", name)),
                Some("Updates local input state or toggles UI loading state".to_string()),
                Some(format!("Invokes bound hooks: {:?}", calls.iter().filter(|c| c.starts_with("use")).collect::<Vec<_>>())),
            ),
            NodeKind::Hook => {
                let routes = if !fetch_routes.is_empty() {
                    fetch_routes.join(", ")
                } else {
                    "backend handler".to_string()
                };
                (
                    Some(format!("Triggered by component action via `{}`", name)),
                    Some("Updates shared reactive store or hook progress/state".to_string()),
                    Some(format!("Dispatches request to {}", routes)),
                )
            }
            NodeKind::RouteHandler => (
                Some(format!("Receives incoming HTTP {} request", name)),
                Some("Validates request body, headers, and authentication".to_string()),
                Some("Invokes storage services and returns structured response".to_string()),
            ),
            NodeKind::Store => (
                Some("State subscriber or setter invoked".to_string()),
                Some("Mutates in-memory store state".to_string()),
                Some("Notifies subscribed React components to re-render".to_string()),
            ),
            NodeKind::Function | NodeKind::File => {
                if file_path.contains("s3.ts") {
                    (
                        Some("Invoked by API route handler with binary payload".to_string()),
                        Some("Constructs S3 object key and parameters".to_string()),
                        Some("Executes cloud storage upload and returns public URL".to_string()),
                    )
                } else if file_path.contains("db.ts") {
                    (
                        Some("Invoked with persisted metadata entity".to_string()),
                        Some("Writes record into database table".to_string()),
                        Some("Returns newly created database record".to_string()),
                    )
                } else {
                    (
                        Some(format!("Invoked with parameters for `{}`", name)),
                        Some("Processes input data and computes result".to_string()),
                        Some("Returns transformed output to caller".to_string()),
                    )
                }
            }
        }
    }
}
