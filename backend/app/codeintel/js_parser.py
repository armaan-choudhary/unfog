"""Tree-sitter parser for JavaScript, JSX, TypeScript, and TSX files."""

from __future__ import annotations

from pathlib import PurePosixPath

import tree_sitter
import tree_sitter_javascript
import tree_sitter_typescript

from app.codeintel.hasher import compute_content_hash
from app.codeintel.models import SymbolKind
from app.codeintel.parser import (
    ParsedModule,
    RawCall,
    RawImport,
    RawInheritance,
    RawRender,
    RawSymbol,
    path_to_module_name,
)

_TSX_LANGUAGE = tree_sitter.Language(tree_sitter_typescript.language_tsx())
_TS_LANGUAGE = tree_sitter.Language(tree_sitter_typescript.language_typescript())
_JS_LANGUAGE = tree_sitter.Language(tree_sitter_javascript.language())

_TSX_PARSER = tree_sitter.Parser(_TSX_LANGUAGE)
_TS_PARSER = tree_sitter.Parser(_TS_LANGUAGE)
_JS_PARSER = tree_sitter.Parser(_JS_LANGUAGE)


def _node_text(node: tree_sitter.Node | None) -> str:
    """Safely extracts UTF-8 string from a Tree-sitter node."""
    if node is None or node.text is None:
        return ""
    return node.text.decode("utf-8")


def _get_parser_for_path(path: str) -> tree_sitter.Parser:
    ext = PurePosixPath(path).suffix.lower()
    if ext in {".tsx", ".jsx"}:
        return _TSX_PARSER
    if ext in {".ts", ".mts", ".cts"}:
        return _TS_PARSER
    # For .js, .mjs, .cjs: use TSX parser as it supports JSX and modern JS syntax
    return _TSX_PARSER


def _has_jsx(node: tree_sitter.Node) -> bool:
    """Recursively checks if a node contains any JSX element syntax."""
    if node.type in ("jsx_element", "jsx_self_closing_element", "jsx_fragment"):
        return True
    return any(_has_jsx(child) for child in node.children)


def _clean_docstring(text: str) -> str:
    """Cleans JSDoc / slash comment markers into a plain docstring."""
    lines = text.strip().splitlines()
    cleaned: list[str] = []
    for line in lines:
        stripped = line.strip().lstrip("/*").rstrip("*/").strip().lstrip("*").strip()
        if stripped.startswith("//"):
            stripped = stripped.lstrip("/").strip()
        if stripped:
            cleaned.append(stripped)
    return " ".join(cleaned)


def _extract_calls_and_renders(
    node: tree_sitter.Node,
    caller_qualified_name: str,
    calls: list[RawCall],
    renders: list[RawRender],
) -> None:
    """Walks an AST subtree to extract function calls and JSX rendered components."""
    if node.type == "call_expression":
        fn_node = node.child_by_field_name("function")
        if fn_node:
            call_start = node.start_point.row + 1
            call_end = node.end_point.row + 1
            if fn_node.type == "identifier":
                calls.append(
                    RawCall(
                        caller_qualified_name=caller_qualified_name,
                        callee_name=_node_text(fn_node),
                        callee_attr=None,
                        start_line=call_start,
                        end_line=call_end,
                    )
                )
            elif fn_node.type == "member_expression":
                obj_node = fn_node.child_by_field_name("object")
                prop_node = fn_node.child_by_field_name("property")
                obj_text = _node_text(obj_node)
                prop_text = _node_text(prop_node)
                if obj_text and prop_text:
                    calls.append(
                        RawCall(
                            caller_qualified_name=caller_qualified_name,
                            callee_name=obj_text,
                            callee_attr=prop_text,
                            start_line=call_start,
                            end_line=call_end,
                        )
                    )

    elif node.type in ("jsx_element", "jsx_self_closing_element"):
        tag_node = node.child_by_field_name("opening_element") or node
        name_node = tag_node.child_by_field_name("name")
        if name_node:
            tag_name = _node_text(name_node)
            # PascalCase identifies custom React components (vs standard HTML tags)
            if tag_name and tag_name[0].isupper():
                render_start = node.start_point.row + 1
                render_end = node.end_point.row + 1
                renders.append(
                    RawRender(
                        caller_qualified_name=caller_qualified_name,
                        component_name=tag_name,
                        start_line=render_start,
                        end_line=render_end,
                    )
                )

    for child in node.children:
        _extract_calls_and_renders(child, caller_qualified_name, calls, renders)


def parse_js_ts_source(relative_path: str, source_code: str) -> ParsedModule:
    """Parses JavaScript, JSX, TypeScript, or TSX source into a ParsedModule."""
    content_hash = compute_content_hash(source_code)
    lines = source_code.splitlines()
    line_count = len(lines)
    module_name = path_to_module_name(relative_path)
    ext = PurePosixPath(relative_path).suffix.lower()

    parser = _get_parser_for_path(relative_path)
    raw_bytes = source_code.encode("utf-8")
    tree = parser.parse(raw_bytes)
    root = tree.root_node
    tree_valid = not root.has_error

    # Node count
    node_count = 0
    cursor = tree.walk()
    visited_children = False
    while True:
        if not visited_children:
            node_count += 1
            if cursor.goto_first_child():
                continue
        if cursor.goto_next_sibling():
            visited_children = False
        elif cursor.goto_parent():
            visited_children = True
        else:
            break

    symbols: list[RawSymbol] = []
    imports: list[RawImport] = []
    calls: list[RawCall] = []
    renders: list[RawRender] = []
    inheritances: list[RawInheritance] = []
    assigned_instances: dict[str, str] = {}

    # Map preceding JSDoc comments to line numbers
    last_comment_text: str | None = None
    last_comment_end_line = -1

    for child in root.children:
        child_start_line = child.start_point.row + 1
        child_end_line = child.end_point.row + 1

        if child.type == "comment":
            last_comment_text = _clean_docstring(_node_text(child))
            last_comment_end_line = child_end_line
            continue

        # Determine docstring: must immediately precede statement
        docstring: str | None = None
        if last_comment_text and (child_start_line <= last_comment_end_line + 2):
            docstring = last_comment_text
        last_comment_text = None

        # 1. Imports
        if child.type == "import_statement":
            source_node = child.child_by_field_name("source")
            mod_path = _node_text(source_node).strip("'\"")
            for clause in child.children:
                if clause.type == "import_clause":
                    for item in clause.children:
                        if item.type == "identifier":
                            imports.append(
                                RawImport(
                                    module=mod_path,
                                    name="default",
                                    alias=_node_text(item),
                                )
                            )
                        elif item.type == "namespace_import":
                            name_ident = item.child_by_field_name("name")
                            if not name_ident:
                                for c in item.children:
                                    if c.type == "identifier":
                                        name_ident = c
                                        break
                            alias_name = _node_text(name_ident) if name_ident else "*"
                            imports.append(
                                RawImport(
                                    module=mod_path,
                                    name="*",
                                    alias=alias_name,
                                )
                            )
                        elif item.type == "named_imports":
                            for spec in item.children:
                                if spec.type == "import_specifier":
                                    n_node = spec.child_by_field_name("name")
                                    a_node = spec.child_by_field_name("alias")
                                    name = _node_text(n_node)
                                    alias = _node_text(a_node) if a_node else name
                                    if name:
                                        imports.append(
                                            RawImport(
                                                module=mod_path,
                                                name=name,
                                                alias=alias,
                                            )
                                        )
            continue

        # Unwrap export statements
        target_node = child
        if child.type == "export_statement":
            decl = child.child_by_field_name("declaration") or child.child_by_field_name("value")
            if decl:
                target_node = decl

        # 2. Function Declarations
        if target_node.type == "function_declaration":
            name_node = target_node.child_by_field_name("name")
            name = _node_text(name_node) if name_node else "default_export"
            is_comp = _has_jsx(target_node) or (
                bool(name) and name[0].isupper() and ext in {".jsx", ".tsx"}
            )
            fn_kind: SymbolKind = "component" if is_comp else "function"
            start_line = child.start_point.row + 1
            end_line = child.end_point.row + 1
            qual_name = f"{module_name}.{name}" if module_name else name

            symbols.append(
                RawSymbol(
                    name=name,
                    qualified_name=qual_name,
                    kind=fn_kind,
                    start_line=start_line,
                    end_line=end_line,
                    docstring=docstring,
                    parent_class=None,
                )
            )
            _extract_calls_and_renders(target_node, qual_name, calls, renders)

        # 3. Class Declarations
        elif target_node.type == "class_declaration":
            name_node = target_node.child_by_field_name("name")
            name = _node_text(name_node) if name_node else "AnonymousClass"
            start_line = child.start_point.row + 1
            end_line = child.end_point.row + 1
            qual_name = f"{module_name}.{name}" if module_name else name

            # Check inheritance: extends X
            heritage = target_node.child_by_field_name("heritage")
            if not heritage:
                for c in target_node.children:
                    if c.type == "class_heritage":
                        heritage = c
                        break
            if heritage:
                for hc in heritage.children:
                    if hc.type == "extends_clause":
                        for base_ident in hc.children:
                            if base_ident.type == "identifier":
                                inheritances.append(
                                    RawInheritance(
                                        class_name=name,
                                        base_name=_node_text(base_ident),
                                        start_line=start_line,
                                        end_line=end_line,
                                    )
                                )

            is_comp = _has_jsx(target_node)
            class_kind: SymbolKind = "component" if is_comp else "class"

            symbols.append(
                RawSymbol(
                    name=name,
                    qualified_name=qual_name,
                    kind=class_kind,
                    start_line=start_line,
                    end_line=end_line,
                    docstring=docstring,
                    parent_class=None,
                )
            )

            # Class methods
            body = target_node.child_by_field_name("body")
            if body:
                for member in body.children:
                    if member.type == "method_definition":
                        m_name_node = member.child_by_field_name("name")
                        m_name = _node_text(m_name_node) if m_name_node else "method"
                        m_start = member.start_point.row + 1
                        m_end = member.end_point.row + 1
                        m_qual = f"{qual_name}.{m_name}"

                        symbols.append(
                            RawSymbol(
                                name=m_name,
                                qualified_name=m_qual,
                                kind="method",
                                start_line=m_start,
                                end_line=m_end,
                                docstring=None,
                                parent_class=name,
                            )
                        )
                        _extract_calls_and_renders(member, m_qual, calls, renders)

        # 4. Interfaces (TypeScript)
        elif target_node.type == "interface_declaration":
            name_node = target_node.child_by_field_name("name")
            name = _node_text(name_node) if name_node else "AnonymousInterface"
            start_line = child.start_point.row + 1
            end_line = child.end_point.row + 1
            qual_name = f"{module_name}.{name}" if module_name else name

            symbols.append(
                RawSymbol(
                    name=name,
                    qualified_name=qual_name,
                    kind="interface",
                    start_line=start_line,
                    end_line=end_line,
                    docstring=docstring,
                    parent_class=None,
                )
            )

        # 5. Type Aliases (TypeScript)
        elif target_node.type == "type_alias_declaration":
            name_node = target_node.child_by_field_name("name")
            name = _node_text(name_node) if name_node else "AnonymousType"
            start_line = child.start_point.row + 1
            end_line = child.end_point.row + 1
            qual_name = f"{module_name}.{name}" if module_name else name

            symbols.append(
                RawSymbol(
                    name=name,
                    qualified_name=qual_name,
                    kind="interface",
                    start_line=start_line,
                    end_line=end_line,
                    docstring=docstring,
                    parent_class=None,
                )
            )

        # 6. Lexical / Variable Declarations (const / let / var)
        elif target_node.type in ("lexical_declaration", "variable_declaration"):
            for decl in target_node.children:
                if decl.type == "variable_declarator":
                    name_node = decl.child_by_field_name("name")
                    val_node = decl.child_by_field_name("value")
                    if not name_node:
                        continue
                    name = _node_text(name_node)
                    start_line = child.start_point.row + 1
                    end_line = child.end_point.row + 1
                    qual_name = f"{module_name}.{name}" if module_name else name

                    # Class instance assignment: const x = new ClassName()
                    if val_node and val_node.type == "new_expression":
                        ctor = val_node.child_by_field_name("constructor")
                        if ctor:
                            assigned_instances[name] = _node_text(ctor)

                    # Function or Arrow Function or React Component
                    if val_node and val_node.type in ("arrow_function", "function_expression"):
                        is_comp = _has_jsx(val_node) or (
                            bool(name) and name[0].isupper() and ext in {".jsx", ".tsx"}
                        )
                        var_kind: SymbolKind = "component" if is_comp else "function"

                        symbols.append(
                            RawSymbol(
                                name=name,
                                qualified_name=qual_name,
                                kind=var_kind,
                                start_line=start_line,
                                end_line=end_line,
                                docstring=docstring,
                                parent_class=None,
                            )
                        )
                        _extract_calls_and_renders(val_node, qual_name, calls, renders)

                    # Higher-order React component (React.memo, React.forwardRef, etc.)
                    elif val_node and val_node.type == "call_expression":
                        if bool(name) and name[0].isupper():
                            symbols.append(
                                RawSymbol(
                                    name=name,
                                    qualified_name=qual_name,
                                    kind="component",
                                    start_line=start_line,
                                    end_line=end_line,
                                    docstring=docstring,
                                    parent_class=None,
                                )
                            )
                            _extract_calls_and_renders(val_node, qual_name, calls, renders)

    return ParsedModule(
        path=relative_path,
        module_name=module_name,
        content=source_code,
        content_hash=content_hash,
        line_count=line_count,
        symbols=symbols,
        imports=imports,
        calls=calls,
        inheritances=inheritances,
        assigned_instances=assigned_instances,
        renders=renders,
        tree_sitter_node_count=node_count,
        tree_sitter_valid=tree_valid,
    )
