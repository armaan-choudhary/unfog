"""AST and Tree-sitter parser extracting functions, classes, imports, and calls."""

from __future__ import annotations

import ast
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Literal

import tree_sitter
import tree_sitter_python

from app.codeintel.hasher import compute_content_hash

_PY_LANGUAGE = tree_sitter.Language(tree_sitter_python.language())
_TREE_SITTER_PARSER = tree_sitter.Parser(_PY_LANGUAGE)


@dataclass
class RawSymbol:
    name: str
    qualified_name: str
    kind: Literal[
        "function",
        "class",
        "method",
        "interface",
        "module",
        "variable",
        "property",
        "unknown",
    ]
    start_line: int
    end_line: int
    docstring: str | None
    parent_class: str | None = None


@dataclass
class RawImport:
    module: str
    name: str
    alias: str


@dataclass
class RawCall:
    caller_qualified_name: str
    callee_name: str
    callee_attr: str | None
    start_line: int
    end_line: int


@dataclass
class RawInheritance:
    class_name: str
    base_name: str
    start_line: int
    end_line: int


@dataclass
class ParsedModule:
    path: str
    module_name: str
    content: str
    content_hash: str
    line_count: int
    symbols: list[RawSymbol] = field(default_factory=list)
    imports: list[RawImport] = field(default_factory=list)
    calls: list[RawCall] = field(default_factory=list)
    inheritances: list[RawInheritance] = field(default_factory=list)
    assigned_instances: dict[str, str] = field(default_factory=dict)
    tree_sitter_node_count: int = 0
    tree_sitter_valid: bool = True


def path_to_module_name(relative_path: str) -> str:
    """Converts a relative POSIX file path to a Python module path."""
    posix = PurePosixPath(relative_path)
    parts = list(posix.parts)
    if not parts:
        return ""
    if parts[-1].endswith(".py"):
        parts[-1] = parts[-1][:-3]
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def verify_tree_sitter_syntax(source: str) -> tuple[bool, int]:
    """Uses tree-sitter to verify Python syntax and count syntax tree nodes."""
    tree = _TREE_SITTER_PARSER.parse(source.encode("utf-8"))
    root = tree.root_node
    is_valid = not root.has_error

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

    return is_valid, node_count


class _ASTVisitor(ast.NodeVisitor):
    def __init__(self, module_name: str) -> None:
        self.module_name = module_name
        self.symbols: list[RawSymbol] = []
        self.imports: list[RawImport] = []
        self.calls: list[RawCall] = []
        self.inheritances: list[RawInheritance] = []
        self.assigned_instances: dict[str, str] = {}
        self._current_class: str | None = None
        self._current_callable: str | None = None

    def visit_Assign(self, node: ast.Assign) -> None:
        if isinstance(node.value, ast.Call):
            target_class: str | None = None
            if isinstance(node.value.func, ast.Name):
                target_class = node.value.func.id
            elif isinstance(node.value.func, ast.Attribute):
                target_class = node.value.func.attr
            if target_class:
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        self.assigned_instances[target.id] = target_class
        self.generic_visit(node)

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            imported_alias = alias.asname or alias.name
            self.imports.append(
                RawImport(
                    module=alias.name,
                    name=alias.name,
                    alias=imported_alias,
                )
            )
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        module = node.module or ""
        for alias in node.names:
            imported_alias = alias.asname or alias.name
            self.imports.append(
                RawImport(
                    module=module,
                    name=alias.name,
                    alias=imported_alias,
                )
            )
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        qualified = f"{self.module_name}.{node.name}" if self.module_name else node.name
        start_line = max(1, node.lineno)
        end_line = max(start_line, node.end_lineno or start_line)
        docstring = ast.get_docstring(node)

        self.symbols.append(
            RawSymbol(
                name=node.name,
                qualified_name=qualified,
                kind="class",
                start_line=start_line,
                end_line=end_line,
                docstring=docstring,
                parent_class=None,
            )
        )

        for base in node.bases:
            base_name: str | None = None
            if isinstance(base, ast.Name):
                base_name = base.id
            elif isinstance(base, ast.Attribute):
                base_name = base.attr
            if base_name:
                self.inheritances.append(
                    RawInheritance(
                        class_name=node.name,
                        base_name=base_name,
                        start_line=start_line,
                        end_line=end_line,
                    )
                )

        prev_class = self._current_class
        self._current_class = node.name
        for item in node.body:
            self.visit(item)
        self._current_class = prev_class

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._handle_function(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._handle_function(node)

    def _handle_function(self, node: ast.FunctionDef | ast.AsyncFunctionDef) -> None:
        is_method = self._current_class is not None
        kind: Literal["function", "method"] = "method" if is_method else "function"

        if is_method and self._current_class:
            qualified = (
                f"{self.module_name}.{self._current_class}.{node.name}"
                if self.module_name
                else f"{self._current_class}.{node.name}"
            )
        else:
            qualified = f"{self.module_name}.{node.name}" if self.module_name else node.name

        start_line = max(1, node.lineno)
        end_line = max(start_line, node.end_lineno or start_line)
        docstring = ast.get_docstring(node)

        self.symbols.append(
            RawSymbol(
                name=node.name,
                qualified_name=qualified,
                kind=kind,
                start_line=start_line,
                end_line=end_line,
                docstring=docstring,
                parent_class=self._current_class,
            )
        )

        prev_callable = self._current_callable
        self._current_callable = qualified
        for stmt in node.body:
            self.visit(stmt)
        self._current_callable = prev_callable

    def visit_Call(self, node: ast.Call) -> None:
        if self._current_callable is not None:
            callee_name = ""
            callee_attr: str | None = None
            if isinstance(node.func, ast.Name):
                callee_name = node.func.id
            elif isinstance(node.func, ast.Attribute):
                callee_attr = node.func.attr
                if isinstance(node.func.value, ast.Name):
                    callee_name = node.func.value.id
                elif isinstance(node.func.value, ast.Attribute):
                    callee_name = node.func.value.attr

            if callee_name or callee_attr:
                call_start = max(1, node.lineno)
                call_end = max(call_start, node.end_lineno or call_start)
                self.calls.append(
                    RawCall(
                        caller_qualified_name=self._current_callable,
                        callee_name=callee_name,
                        callee_attr=callee_attr,
                        start_line=call_start,
                        end_line=call_end,
                    )
                )

        self.generic_visit(node)


def parse_python_source(relative_path: str, source_code: str) -> ParsedModule:
    """Parses Python source using AST visitor and Tree-sitter grammar validation."""
    content_hash = compute_content_hash(source_code)
    lines = source_code.splitlines()
    line_count = len(lines)
    module_name = path_to_module_name(relative_path)

    tree_valid, node_count = verify_tree_sitter_syntax(source_code)

    parsed_ast = ast.parse(source_code, filename=relative_path)
    visitor = _ASTVisitor(module_name)
    visitor.visit(parsed_ast)

    return ParsedModule(
        path=relative_path,
        module_name=module_name,
        content=source_code,
        content_hash=content_hash,
        line_count=line_count,
        symbols=visitor.symbols,
        imports=visitor.imports,
        calls=visitor.calls,
        inheritances=visitor.inheritances,
        assigned_instances=visitor.assigned_instances,
        tree_sitter_node_count=node_count,
        tree_sitter_valid=tree_valid,
    )
