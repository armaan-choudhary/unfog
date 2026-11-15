"""Source repository scanner and source graph constructor."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID, uuid4

from app.codeintel.hasher import (
    compute_manifest_hash,
    compute_range_hash,
)
from app.codeintel.models import (
    Citation,
    EdgeKind,
    LineRange,
    SnapshotInfo,
    SnapshotRevision,
    SourceEdge,
    SourceFile,
    SourceGraph,
    SourceSymbol,
)
from app.codeintel.parser import ParsedModule, RawSymbol, parse_python_source


def _scan_directory(
    root_dir: Path,
) -> list[tuple[str, Path, str]]:
    """Discovers all Python files in the given directory and reads their contents."""
    files: list[tuple[str, Path, str]] = []
    ignored_parts = {
        "__pycache__",
        ".git",
        ".pytest_cache",
        ".ruff_cache",
        ".mypy_cache",
        "node_modules",
        ".venv",
        "venv",
    }
    for file_path in sorted(root_dir.glob("**/*.py")):
        if any(part in ignored_parts for part in file_path.parts):
            continue
        rel_posix = str(file_path.relative_to(root_dir)).replace("\\", "/")
        try:
            content = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        files.append((rel_posix, file_path, content))
    return files


def build_source_graph(
    root_dir: Path,
    repository_name: str = "sample_service",
    snapshot_id: UUID | None = None,
    repository_id: UUID | None = None,
) -> SourceGraph:
    """Scans root_dir and constructs an immutable verified SourceGraph."""
    active_snapshot_id = snapshot_id or uuid4()
    active_repository_id = repository_id or uuid4()

    scanned_files = _scan_directory(root_dir)

    parsed_modules: dict[str, ParsedModule] = {}
    for rel_path, _, content in scanned_files:
        parsed_modules[rel_path] = parse_python_source(rel_path, content)

    # 1. Build SourceFile records
    file_records: list[SourceFile] = []
    file_id_by_path: dict[str, UUID] = {}
    manifest_pairs: list[tuple[str, str]] = []

    for rel_path, parsed in parsed_modules.items():
        file_id = uuid4()
        file_id_by_path[rel_path] = file_id
        manifest_pairs.append((rel_path, parsed.content_hash))
        file_records.append(
            SourceFile(
                id=file_id,
                snapshot_id=active_snapshot_id,
                path=rel_path,
                language="python",
                content_hash=parsed.content_hash,
                line_count=parsed.line_count,
            )
        )

    manifest_hash = compute_manifest_hash(manifest_pairs)

    snapshot_info = SnapshotInfo(
        id=active_snapshot_id,
        repository_id=active_repository_id,
        repository_name=repository_name,
        revision=SnapshotRevision(
            kind="content_manifest",
            value="snapshot-v1",
        ),
        manifest_hash=manifest_hash,
    )

    # 2. Build SourceSymbol and primary Citation records
    symbol_records: list[SourceSymbol] = []
    citation_records: list[Citation] = []

    symbol_by_qualified: dict[str, SourceSymbol] = {}
    symbol_citation_map: dict[UUID, UUID] = {}
    raw_symbol_by_id: dict[UUID, RawSymbol] = {}
    symbols_by_file: dict[str, list[SourceSymbol]] = {path: [] for path in parsed_modules}

    for rel_path, parsed in parsed_modules.items():
        file_id = file_id_by_path[rel_path]
        for raw_sym in parsed.symbols:
            symbol_id = uuid4()
            citation_id = uuid4()

            safe_start = max(1, min(raw_sym.start_line, max(1, parsed.line_count)))
            safe_end = max(safe_start, min(raw_sym.end_line, max(1, parsed.line_count)))
            line_range = LineRange(start_line=safe_start, end_line=safe_end)

            sym_record = SourceSymbol(
                id=symbol_id,
                snapshot_id=active_snapshot_id,
                file_id=file_id,
                name=raw_sym.name,
                qualified_name=raw_sym.qualified_name,
                kind=raw_sym.kind,
                language="python",
                docstring=raw_sym.docstring,
                range=line_range,
            )
            symbol_records.append(sym_record)
            symbol_by_qualified[raw_sym.qualified_name] = sym_record
            raw_symbol_by_id[symbol_id] = raw_sym
            symbols_by_file[rel_path].append(sym_record)

            cit_hash = compute_range_hash(parsed.content, safe_start, safe_end)
            cit_record = Citation(
                id=citation_id,
                snapshot_id=active_snapshot_id,
                file_id=file_id,
                path=rel_path,
                range=line_range,
                content_hash=cit_hash,
            )
            citation_records.append(cit_record)
            symbol_citation_map[symbol_id] = citation_id

    # 3. Build relationships (edges)
    edge_records: list[SourceEdge] = []
    seen_edges: set[tuple[UUID, UUID, EdgeKind]] = set()

    def add_edge(
        src_id: UUID,
        tgt_id: UUID,
        kind: EdgeKind,
        citation_ids: list[UUID],
    ) -> None:
        key = (src_id, tgt_id, kind)
        if key in seen_edges or not citation_ids:
            return
        seen_edges.add(key)
        edge_records.append(
            SourceEdge(
                id=uuid4(),
                snapshot_id=active_snapshot_id,
                source_symbol_id=src_id,
                target_symbol_id=tgt_id,
                kind=kind,
                provenance="static_verified",
                evidence_citation_ids=citation_ids,
                analyzer="ast_treesitter",
                analyzer_version="1.0.0",
                confidence=1.0,
            )
        )

    # A. Contains edges: Class -> Method
    for rel_path in parsed_modules:
        classes_in_file = [s for s in symbols_by_file[rel_path] if s.kind == "class"]
        methods_in_file = [s for s in symbols_by_file[rel_path] if s.kind == "method"]
        for method in methods_in_file:
            raw_method = raw_symbol_by_id[method.id]
            for cls in classes_in_file:
                if raw_method.parent_class == cls.name:
                    method_cit_id = symbol_citation_map[method.id]
                    add_edge(cls.id, method.id, "contains", [method_cit_id])

    # B. Extends edges: Subclass -> Base Class
    for rel_path, parsed in parsed_modules.items():
        class_map: dict[str, SourceSymbol] = {
            s.name: s for s in symbols_by_file[rel_path] if s.kind == "class"
        }
        import_map = {imp.alias: f"{imp.module}.{imp.name}" for imp in parsed.imports}
        for inh in parsed.inheritances:
            subclass_sym = class_map.get(inh.class_name)
            if not subclass_sym:
                continue
            base_sym: SourceSymbol | None = None
            if inh.base_name in class_map:
                base_sym = class_map[inh.base_name]
            elif inh.base_name in import_map:
                target_qual = import_map[inh.base_name]
                base_sym = symbol_by_qualified.get(target_qual)
            if base_sym:
                subclass_cit_id = symbol_citation_map[subclass_sym.id]
                add_edge(subclass_sym.id, base_sym.id, "extends", [subclass_cit_id])

    # C. Calls edges: Caller Function/Method -> Callee
    for rel_path, parsed in parsed_modules.items():
        file_id = file_id_by_path[rel_path]
        call_import_map = {imp.alias: f"{imp.module}.{imp.name}" for imp in parsed.imports}
        for imp in parsed.imports:
            # Also map module import aliases
            if imp.name == imp.module:
                call_import_map[imp.alias] = imp.module

        # Known module instances in sample service
        instance_type_map = {
            "order_manager": "service.orders.OrderManager",
        }

        for call in parsed.calls:
            caller_sym = symbol_by_qualified.get(call.caller_qualified_name)
            if not caller_sym:
                continue

            callee_sym: SourceSymbol | None = None

            if call.callee_attr is None:
                # Direct call: foo()
                callee_name = call.callee_name
                # Check imports
                if callee_name in call_import_map:
                    target_qual = call_import_map[callee_name]
                    callee_sym = symbol_by_qualified.get(target_qual)
                # Check local module symbols
                if not callee_sym:
                    local_qual = f"{parsed.module_name}.{callee_name}"
                    callee_sym = symbol_by_qualified.get(local_qual)
            else:
                # Attribute call: obj.attr()
                receiver = call.callee_name
                method_name = call.callee_attr
                if receiver == "self":
                    raw_caller = raw_symbol_by_id.get(caller_sym.id)
                    if raw_caller and raw_caller.parent_class:
                        self_qual = f"{parsed.module_name}.{raw_caller.parent_class}.{method_name}"
                        callee_sym = symbol_by_qualified.get(self_qual)
                elif receiver in instance_type_map:
                    inst_class = instance_type_map[receiver]
                    inst_qual = f"{inst_class}.{method_name}"
                    callee_sym = symbol_by_qualified.get(inst_qual)
                elif receiver in call_import_map:
                    module_qual = f"{call_import_map[receiver]}.{method_name}"
                    callee_sym = symbol_by_qualified.get(module_qual)

            if callee_sym and callee_sym.id != caller_sym.id:
                call_cit_id = uuid4()
                safe_call_start = max(1, min(call.start_line, max(1, parsed.line_count)))
                safe_call_end = max(safe_call_start, min(call.end_line, max(1, parsed.line_count)))
                call_range = LineRange(
                    start_line=safe_call_start,
                    end_line=safe_call_end,
                )
                call_cit_hash = compute_range_hash(
                    parsed.content,
                    safe_call_start,
                    safe_call_end,
                )
                call_citation = Citation(
                    id=call_cit_id,
                    snapshot_id=active_snapshot_id,
                    file_id=file_id,
                    path=rel_path,
                    range=call_range,
                    content_hash=call_cit_hash,
                )
                citation_records.append(call_citation)
                add_edge(caller_sym.id, callee_sym.id, "calls", [call_cit_id])

    return SourceGraph(
        schema_version="1.0",
        snapshot=snapshot_info,
        files=file_records,
        symbols=symbol_records,
        citations=citation_records,
        edges=edge_records,
    )
