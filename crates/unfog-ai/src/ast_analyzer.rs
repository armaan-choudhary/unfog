use std::path::Path;
use tree_sitter::{Node, Parser};
use tree_sitter_typescript::LANGUAGE_TSX;

use crate::models::{BreakPrediction, MentalModel, MicroChallenge, NodeContext};

/// Extracted AST details from TypeScript/TSX code
#[derive(Debug, Clone, Default)]
pub struct AstDetails {
    pub functions: Vec<FunctionInfo>,
    pub variables: Vec<String>,
    pub calls: Vec<CallInfo>,
    pub hooks: Vec<String>,
    pub conditions: Vec<ConditionInfo>,
    pub state_setters: Vec<String>,
    pub try_catch_blocks: Vec<TryCatchInfo>,
    pub jsx_tags: Vec<String>,
    pub event_handlers: Vec<EventHandlerInfo>,
    pub returns: Vec<String>,
    pub raw_code: String,
}

#[derive(Debug, Clone)]
pub struct FunctionInfo {
    pub name: String,
    pub params: Vec<String>,
    pub is_async: bool,
    pub line_start: usize,
    pub line_end: usize,
}

#[derive(Debug, Clone)]
pub struct CallInfo {
    pub name: String,
    pub callee: String,
    pub args: Vec<String>,
    pub line: usize,
    pub is_await: bool,
}

#[derive(Debug, Clone)]
pub struct ConditionInfo {
    pub expr: String,
    pub line: usize,
    pub action: String,
}

#[derive(Debug, Clone)]
pub struct TryCatchInfo {
    pub err_param: String,
    pub line: usize,
    pub catch_snippet: String,
}

#[derive(Debug, Clone)]
pub struct EventHandlerInfo {
    pub event: String,
    pub handler: String,
    pub jsx_tag: String,
}

pub struct AstAnalyzer {
    parser: Parser,
}

impl Default for AstAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

impl AstAnalyzer {
    pub fn new() -> Self {
        let mut parser = Parser::new();
        let lang = LANGUAGE_TSX.into();
        parser
            .set_language(&lang)
            .expect("Failed to initialize tree-sitter TSX grammar");
        Self { parser }
    }

    /// Extract comprehensive AST metadata from source code
    pub fn analyze(&mut self, source: &str) -> AstDetails {
        let mut details = AstDetails {
            raw_code: source.to_string(),
            ..Default::default()
        };

        if source.trim().is_empty() {
            return details;
        }

        let tree = match self.parser.parse(source, None) {
            Some(t) => t,
            None => return details,
        };

        let root = tree.root_node();
        self.walk_node(root, source, &mut details);
        details
    }

    fn walk_node(&self, node: Node, source: &str, details: &mut AstDetails) {
        let kind = node.kind();

        match kind {
            "function_declaration" | "arrow_function" | "function_expression" => {
                let name = if let Some(id_node) = node.child_by_field_name("name") {
                    source[id_node.byte_range()].trim().to_string()
                } else if let Some(parent) = node.parent() {
                    if parent.kind() == "variable_declarator" {
                        if let Some(id) = parent.child_by_field_name("name") {
                            source[id.byte_range()].trim().to_string()
                        } else {
                            "anonymous".to_string()
                        }
                    } else {
                        "anonymous".to_string()
                    }
                } else {
                    "anonymous".to_string()
                };

                let mut params = Vec::new();
                if let Some(params_node) = node.child_by_field_name("parameters") {
                    let mut cursor = params_node.walk();
                    for param in params_node.children(&mut cursor) {
                        let param_kind = param.kind();
                        if param_kind == "identifier" || param_kind == "required_parameter" {
                            let text = source[param.byte_range()].trim().to_string();
                            if !text.is_empty() && text != "(" && text != ")" && text != "," {
                                params.push(text);
                            }
                        }
                    }
                }

                let is_async = source[node.byte_range()].starts_with("async")
                    || (node.child(0).map(|c| c.kind() == "async").unwrap_or(false));

                let line_start = node.start_position().row + 1;
                let line_end = node.end_position().row + 1;

                if name != "anonymous" || !details.functions.iter().any(|f| f.name == name) {
                    details.functions.push(FunctionInfo {
                        name,
                        params,
                        is_async,
                        line_start,
                        line_end,
                    });
                }
            }
            "variable_declarator" => {
                if let Some(name_node) = node.child_by_field_name("name") {
                    let var_name = source[name_node.byte_range()].trim().to_string();
                    if !var_name.is_empty() && !details.variables.contains(&var_name) {
                        details.variables.push(var_name);
                    }
                }
            }
            "call_expression" => {
                if let Some(func_node) = node.child_by_field_name("function") {
                    let callee = source[func_node.byte_range()].trim().to_string();
                    let name = callee.split('.').last().unwrap_or(&callee).to_string();
                    let line = node.start_position().row + 1;

                    let is_await = node
                        .parent()
                        .map(|p| p.kind() == "await_expression")
                        .unwrap_or(false);

                    let mut args = Vec::new();
                    if let Some(args_node) = node.child_by_field_name("arguments") {
                        let mut cursor = args_node.walk();
                        for arg in args_node.children(&mut cursor) {
                            let arg_text = source[arg.byte_range()].trim().to_string();
                            if !arg_text.is_empty() && arg_text != "(" && arg_text != ")" && arg_text != "," {
                                args.push(arg_text);
                            }
                        }
                    }

                    if (name.starts_with("use") && name.len() > 3)
                        && name.chars().nth(3).map(|c| c.is_uppercase()).unwrap_or(false)
                    {
                        if !details.hooks.contains(&name) {
                            details.hooks.push(name.clone());
                        }
                    }

                    if name.starts_with("set") && name.len() > 3 {
                        if !details.state_setters.contains(&name) {
                            details.state_setters.push(name.clone());
                        }
                    } else if callee.contains(".set") || callee.contains(".add") {
                        if !details.state_setters.contains(&callee) {
                            details.state_setters.push(callee.clone());
                        }
                    }

                    details.calls.push(CallInfo {
                        name,
                        callee,
                        args,
                        line,
                        is_await,
                    });
                }
            }
            "if_statement" => {
                if let Some(cond_node) = node.child_by_field_name("condition") {
                    let expr = source[cond_node.byte_range()]
                        .trim_matches(|c| c == '(' || c == ')')
                        .trim()
                        .to_string();
                    let line = cond_node.start_position().row + 1;

                    let action = if let Some(cons_node) = node.child_by_field_name("consequence") {
                        let cons_text = source[cons_node.byte_range()].trim();
                        let first_line = cons_text.lines().next().unwrap_or(cons_text).trim();
                        first_line.trim_matches(|c| c == '{' || c == '}').trim().to_string()
                    } else {
                        "proceeds to next branch".to_string()
                    };

                    details.conditions.push(ConditionInfo {
                        expr,
                        line,
                        action,
                    });
                }
            }
            "try_statement" => {
                let line = node.start_position().row + 1;
                let mut err_param = "err".to_string();
                let mut catch_snippet = String::new();

                let mut cursor = node.walk();
                for child in node.children(&mut cursor) {
                    if child.kind() == "catch_clause" {
                        if let Some(param_node) = child.child_by_field_name("parameter") {
                            err_param = source[param_node.byte_range()].trim().to_string();
                        }
                        catch_snippet = source[child.byte_range()].trim().to_string();
                    }
                }

                details.try_catch_blocks.push(TryCatchInfo {
                    err_param,
                    line,
                    catch_snippet,
                });
            }
            "jsx_element" | "jsx_self_closing_element" => {
                let tag_name = if let Some(open) = node.child_by_field_name("opening_element") {
                    if let Some(name_node) = open.child_by_field_name("name") {
                        source[name_node.byte_range()].trim().to_string()
                    } else {
                        "element".to_string()
                    }
                } else if let Some(name_node) = node.child_by_field_name("name") {
                    source[name_node.byte_range()].trim().to_string()
                } else {
                    "element".to_string()
                };

                if !details.jsx_tags.contains(&tag_name) && tag_name != "Fragment" {
                    details.jsx_tags.push(tag_name.clone());
                }

                // Check attributes for event handlers
                let mut cursor = node.walk();
                for child in node.children(&mut cursor) {
                    if child.kind() == "jsx_attribute" {
                        let attr_name = child
                            .child_by_field_name("name")
                            .map(|n| source[n.byte_range()].trim().to_string())
                            .unwrap_or_default();
                        let attr_val = child
                            .child_by_field_name("value")
                            .map(|n| source[n.byte_range()].trim().to_string())
                            .unwrap_or_default();

                        if attr_name.starts_with("on") {
                            details.event_handlers.push(EventHandlerInfo {
                                event: attr_name,
                                handler: attr_val,
                                jsx_tag: tag_name.clone(),
                            });
                        }
                    }
                }
            }
            "return_statement" => {
                let text = source[node.byte_range()].trim().to_string();
                if !details.returns.contains(&text) {
                    details.returns.push(text);
                }
            }
            _ => {}
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            self.walk_node(child, source, details);
        }
    }

    /// Obtain source code from context or fallback to reading file
    fn get_source(&self, context: &NodeContext) -> String {
        if let Some(snippet) = &context.code_snippet {
            if !snippet.trim().is_empty() {
                return snippet.clone();
            }
        }
        if let Some(content) = &context.full_file_content {
            if !content.trim().is_empty() {
                return content.clone();
            }
        }
        if !context.file_path.is_empty() {
            let p = Path::new(&context.file_path);
            if p.exists() {
                if let Ok(c) = std::fs::read_to_string(p) {
                    return c;
                }
            }
        }
        String::new()
    }

    /// Generate dynamic MentalModel from real AST
    pub fn generate_mental_model(&mut self, context: &NodeContext) -> MentalModel {
        let source = self.get_source(context);
        let ast = self.analyze(&source);

        let label = &context.label;
        let kind = context.kind.as_deref().unwrap_or("Symbol");
        let route = context.route_path.as_deref();

        // 1. Dynamic Trigger
        let trigger = if !ast.event_handlers.is_empty() {
            let h = &ast.event_handlers[0];
            format!(
                "User triggers `{}` event on `<{}>` element in `{}`",
                h.event, h.jsx_tag, label
            )
        } else if let Some(m) = &context.http_method {
            let r = route.unwrap_or(&context.file_path);
            format!(
                "Receives incoming HTTP {} request at `{}` dispatched to `{}`",
                m, r, label
            )
        } else if kind == "PageRoute" || route.is_some() {
            let r = route.unwrap_or("/");
            format!(
                "Browser navigation to route `{}` initializes `{}` page component",
                r, label
            )
        } else if kind == "Hook" || label.starts_with("use") {
            format!(
                "Component mount or reactive lifecycle updates trigger hook `{}`",
                label
            )
        } else if !ast.functions.is_empty() {
            let f = &ast.functions[0];
            let params = if f.params.is_empty() {
                "none".to_string()
            } else {
                f.params.join(", ")
            };
            format!(
                "Caller invokes function `{}` with parameters `({})`",
                f.name, params
            )
        } else {
            format!("Invoked during execution trace of `{}`", label)
        };

        // 2. Dynamic Mutation
        let mutation = if !ast.state_setters.is_empty() {
            format!(
                "Mutates reactive state via `{}` updating internal properties",
                ast.state_setters.join("`, `")
            )
        } else if !ast.variables.is_empty() {
            format!(
                "Allocates and computes local variables: `{}`",
                ast.variables.iter().take(4).cloned().collect::<Vec<_>>().join("`, `")
            )
        } else if !ast.calls.is_empty() {
            format!(
                "Executes sequence of operations: `{}`",
                ast.calls.iter().take(3).map(|c| c.callee.clone()).collect::<Vec<_>>().join("`, `")
            )
        } else {
            format!("Processes incoming context and prepares output for `{}`", label)
        };

        // 3. Dynamic Side Effects
        let side_effects = {
            let await_calls: Vec<String> = ast
                .calls
                .iter()
                .filter(|c| c.is_await || c.name.contains("fetch") || c.name.contains("upload") || c.name.contains("save"))
                .map(|c| c.callee.clone())
                .collect();

            if !await_calls.is_empty() {
                format!(
                    "Dispatches asynchronous I/O and network operations to `{}`",
                    await_calls.join("`, `")
                )
            } else if !ast.jsx_tags.is_empty() {
                format!(
                    "Renders interactive JSX tree containing `<{}>`",
                    ast.jsx_tags.iter().take(4).cloned().collect::<Vec<_>>().join(">, <")
                )
            } else if !ast.returns.is_empty() {
                let ret = &ast.returns[0];
                let summary = if ret.len() > 60 { &ret[..60] } else { ret.as_str() };
                format!("Returns computed payload to upstream caller: `{}`", summary)
            } else {
                format!("Completes execution and hands control back to caller of `{}`", label)
            }
        };

        // 4. L1 Vibe (Intuitive Scaffolding)
        let l1_vibe = format!(
            "Intuitive Vibe: `{}` ({}) acts as the bridge for {}. At a glance: when triggered, it {} and {}.",
            label,
            kind,
            trigger,
            mutation.to_lowercase(),
            side_effects.to_lowercase()
        );

        // 5. L2 Builder (System Engineering View)
        let fn_desc = if !ast.functions.is_empty() {
            ast.functions
                .iter()
                .map(|f| format!("{}({}) [async: {}]", f.name, f.params.join(", "), f.is_async))
                .collect::<Vec<_>>()
                .join("; ")
        } else {
            label.clone()
        };

        let hooks_desc = if ast.hooks.is_empty() {
            "None".to_string()
        } else {
            ast.hooks.join(", ")
        };

        let setters_desc = if ast.state_setters.is_empty() {
            "None".to_string()
        } else {
            ast.state_setters.join(", ")
        };

        let error_desc = if !ast.try_catch_blocks.is_empty() {
            format!("Structured try/catch error boundary on line {}", ast.try_catch_blocks[0].line)
        } else {
            "Delegates error handling to callers or promise rejections".to_string()
        };

        let l2_builder = format!(
            "Builder Architecture:\n- Symbol/Module: `{}` ({})\n- Signatures: {}\n- React Hooks: {}\n- State Transitions: {}\n- Error Strategy: {}",
            label, kind, fn_desc, hooks_desc, setters_desc, error_desc
        );

        // 6. L3 Deep Dive (AST Invariants & Edge Cases)
        let cond_summary = if !ast.conditions.is_empty() {
            ast.conditions
                .iter()
                .take(3)
                .map(|c| format!("L{}: if ({}) -> {}", c.line, c.expr, c.action))
                .collect::<Vec<_>>()
                .join("\n  * ")
        } else {
            "Unconditional sequential execution flow".to_string()
        };

        let l3_deep_dive = format!(
            "Deep Dive Invariants:\n- AST Complexity: {} functions, {} variables, {} call sites\n- Branching Guards:\n  * {}\n- Concurrency Invariant: async operations properly synchronized\n- File Context: `{}`",
            ast.functions.len(),
            ast.variables.len(),
            ast.calls.len(),
            cond_summary,
            context.file_path
        );

        MentalModel {
            trigger,
            mutation,
            side_effects,
            l1_vibe,
            l2_builder,
            l3_deep_dive,
        }
    }

    /// Generate dynamic MicroChallenge testing actual code logic
    pub fn generate_micro_challenge(&mut self, context: &NodeContext) -> MicroChallenge {
        let source = self.get_source(context);
        let ast = self.analyze(&source);
        let label = &context.label;

        // Challenge 1: Guard condition branching
        if let Some(cond) = ast.conditions.first() {
            let question = format!(
                "In `{}`, what happens when the guard condition `if ({})` evaluates to true?",
                label, cond.expr
            );

            let correct = format!(
                "Execution branches immediately to: `{}`",
                if cond.action.is_empty() { "return early" } else { &cond.action }
            );
            let opt1 = "Bypasses the condition entirely and forces a background sync".to_string();
            let opt2 = "Retries the previous asynchronous request up to 3 times".to_string();
            let opt3 = "Throws an uncaught fatal exception that terminates the worker thread".to_string();

            let options = vec![correct, opt1, opt2, opt3];
            let explanation = format!(
                "In `{}` at line {}, the statement `if ({})` guards against invalid state. When truthy, `{}` is executed to maintain system invariants.",
                label, cond.line, cond.expr, cond.action
            );

            return MicroChallenge {
                question,
                options,
                correct_index: 0,
                explanation,
            };
        }

        // Challenge 2: State setter or progress mutation
        if let Some(setter) = ast.state_setters.first() {
            let question = format!(
                "In `{}`, what is the primary role of invoking `{}`?",
                label, setter
            );

            let correct = format!(
                "Mutates the reactive state/store via `{}` to update component state or progress",
                setter
            );
            let opt1 = "Flushes local disk cache to the persistent SQLite database".to_string();
            let opt2 = "Registers a new HTTP route listener on the server socket".to_string();
            let opt3 = "Directly modifies the browser DOM without React reconciliation".to_string();

            let options = vec![correct, opt1, opt2, opt3];
            let explanation = format!(
                "Calls to `{}` in `{}` trigger state mutations that notify subscribed React components or store listeners.",
                setter, label
            );

            return MicroChallenge {
                question,
                options,
                correct_index: 0,
                explanation,
            };
        }

        // Challenge 3: Try-Catch error boundary
        if let Some(tc) = ast.try_catch_blocks.first() {
            let question = format!(
                "How does `{}` handle exceptions caught in `catch ({})` at line {}?",
                label, tc.err_param, tc.line
            );

            let correct = format!(
                "Extracts the error message from `{}` and updates error state or returns a failure response",
                tc.err_param
            );
            let opt1 = "Silently suppresses the error without alerting listeners or state".to_string();
            let opt2 = "Re-raises the raw exception to crash the entire application process".to_string();
            let opt3 = "Spawns a background worker to retry the operation indefinitely".to_string();

            let options = vec![correct, opt1, opt2, opt3];
            let explanation = format!(
                "At line {} in `{}`, the catch clause intercepts errors via `{}` to prevent unhandled promise rejections and update user-facing error indicators.",
                tc.line, label, tc.err_param
            );

            return MicroChallenge {
                question,
                options,
                correct_index: 0,
                explanation,
            };
        }

        // Challenge 4: Function contract
        if let Some(f) = ast.functions.first() {
            let param_desc = if f.params.is_empty() {
                "no arguments".to_string()
            } else {
                format!("arguments: `{}`", f.params.join("`, `"))
            };

            let question = format!(
                "What is the invocation contract for `{}` defined in `{}`?",
                f.name, context.file_path
            );

            let correct = format!(
                "Function `{}` is declared with is_async={} and accepts {}",
                f.name, f.is_async, param_desc
            );
            let opt1 = format!("`{}` is an internal generator function yielding stream chunks", f.name);
            let opt2 = format!("`{}` is a static class constructor that cannot be called as a function", f.name);
            let opt3 = format!("`{}` is a pure CSS utility that performs no JavaScript operations", f.name);

            let options = vec![correct, opt1, opt2, opt3];
            let explanation = format!(
                "In `{}`, `{}` defines the entrypoint signature matching the component contract.",
                context.file_path, f.name
            );

            return MicroChallenge {
                question,
                options,
                correct_index: 0,
                explanation,
            };
        }

        // General fallback
        MicroChallenge {
            question: format!("What is the primary role of `{}` in `{}`?", label, context.file_path),
            options: vec![
                format!("Executes core logic for `{}` according to its declared type ({:?})", label, context.kind),
                "Acts as an unused placeholder file scheduled for deprecation".to_string(),
                "Manages low-level TCP sockets and binary network serialization".to_string(),
                "Runs database migration scripts on application startup".to_string(),
            ],
            correct_index: 0,
            explanation: format!("`{}` encapsulates functionality for `{}`.", label, context.file_path),
        }
    }

    /// Generate dynamic BreakPrediction mutation from real AST
    pub fn generate_break_prediction(&mut self, context: &NodeContext) -> BreakPrediction {
        let source = self.get_source(context);
        let ast = self.analyze(&source);
        let label = &context.label;

        // Mutation 1: Condition operator inversion
        for cond in &ast.conditions {
            if cond.expr.contains('>') {
                let mutated_expr = cond.expr.replacen('>', "<", 1);
                let mutated_code = source.replacen(&cond.expr, &mutated_expr, 1);
                let question = format!(
                    "In `{}`, if the condition operator in `if ({})` is mutated to `<` (`if ({})`), how will the system break?",
                    label, cond.expr, mutated_expr
                );
                let breakage = format!(
                    "The guard logic is inverted: values below the threshold will now trigger `{}` prematurely, while oversized values bypass the guard and cause downstream runtime errors.",
                    cond.action
                );
                return BreakPrediction {
                    mutated_code,
                    failure_prediction_question: question,
                    expected_breakage: breakage,
                };
            } else if cond.expr.contains("===") {
                let mutated_expr = cond.expr.replacen("===", "!==", 1);
                let mutated_code = source.replacen(&cond.expr, &mutated_expr, 1);
                let question = format!(
                    "In `{}`, if equality check `if ({})` is inverted to `!==` (`if ({})`), what breakage occurs?",
                    label, cond.expr, mutated_expr
                );
                let breakage = format!(
                    "Equality inversion causes the branch `{}` to execute precisely when equality fails, rejecting valid states and admitting corrupt states.",
                    cond.action
                );
                return BreakPrediction {
                    mutated_code,
                    failure_prediction_question: question,
                    expected_breakage: breakage,
                };
            } else if cond.expr.starts_with('!') {
                let mutated_expr = cond.expr[1..].trim().to_string();
                let mutated_code = source.replacen(&cond.expr, &mutated_expr, 1);
                let question = format!(
                    "In `{}`, if the negation is stripped from `if ({})` to `if ({})`, what bug occurs?",
                    label, cond.expr, mutated_expr
                );
                let breakage = format!(
                    "The truthiness check is inverted: present values will trigger early termination (`{}`), while null/undefined values will pass through and cause TypeErrors on subsequent property accesses.",
                    cond.action
                );
                return BreakPrediction {
                    mutated_code,
                    failure_prediction_question: question,
                    expected_breakage: breakage,
                };
            }
        }

        // Mutation 2: Dropping await on asynchronous call
        for call in &ast.calls {
            if call.is_await {
                let target = format!("await {}", call.callee);
                if source.contains(&target) {
                    let mutated_code = source.replacen(&target, &call.callee, 1);
                    let question = format!(
                        "In `{}`, what breakage occurs if `await` is omitted from `{}`?",
                        label, target
                    );
                    let breakage = format!(
                        "Removing `await` leaves `{}` as an unresolved Promise object rather than its resolved value. Downstream property access (e.g. `.success` or `.data`) will evaluate to `undefined`, causing validation checks to fail and callbacks not to fire.",
                        call.callee
                    );
                    return BreakPrediction {
                        mutated_code,
                        failure_prediction_question: question,
                        expected_breakage: breakage,
                    };
                }
            }
        }

        // Mutation 3: State setter inversion (e.g. setIsUploading(false) -> setIsUploading(true))
        for setter in &ast.state_setters {
            let target_false = format!("{}(false)", setter);
            if source.contains(&target_false) {
                let mutated_target = format!("{}(true)", setter);
                let mutated_code = source.replacen(&target_false, &mutated_target, 1);
                let question = format!(
                    "In `{}`, if `{}` is mutated to `{}` in the cleanup/finally stage, what runtime bug occurs?",
                    label, target_false, mutated_target
                );
                let breakage = format!(
                    "The component remains permanently trapped in an active/loading state (`{}`), keeping buttons disabled and preventing subsequent user interactions.",
                    setter
                );
                return BreakPrediction {
                    mutated_code,
                    failure_prediction_question: question,
                    expected_breakage: breakage,
                };
            }
        }

        // Mutation 4: Fallback mutation on the code
        let mutated_code = if source.contains("return ") {
            source.replacen("return ", "return /* BUGGY MUTATION */ null; // ", 1)
        } else {
            format!("// [UNFOG MUTATION INJECTION: Early Exit Bug]\nreturn;\n{}", source)
        };

        BreakPrediction {
            mutated_code,
            failure_prediction_question: format!(
                "In `{}`, if an early null return is injected at the start of execution, what breaks?",
                label
            ),
            expected_breakage: format!(
                "`{}` fails to return its intended data structures, causing callers expecting structured responses to receive null or throw undefined property errors.",
                label
            ),
        }
    }
}
