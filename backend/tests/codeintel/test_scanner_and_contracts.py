"""Tests verifying repository scanner, symbol relationships, and schema contract compliance."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

import jsonschema

from app.codeintel.hasher import compute_range_hash
from app.codeintel.scanner import build_source_graph
from app.codeintel.service import find_sample_service_dir

ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = ROOT / "docs" / "contracts" / "source-graph.v1.schema.json"


def assert_uuid_v4(val: str | UUID) -> None:
    parsed = UUID(str(val))
    assert parsed.version == 4
    assert str(parsed) == str(val)


def test_sample_service_graph_contract_and_invariants() -> None:
    sample_dir = find_sample_service_dir()
    assert sample_dir.is_dir(), f"Sample directory missing: {sample_dir}"

    graph = build_source_graph(sample_dir, repository_name="sample_service")
    graph_dict = graph.model_dump(mode="json")

    # 1. JSON Schema Draft 2020-12 validation against contract
    with SCHEMA_PATH.open(encoding="utf-8") as f:
        schema = json.load(f)
    jsonschema.validate(graph_dict, schema)

    # 2. Invariants verification
    snapshot_id = graph.snapshot.id
    assert_uuid_v4(snapshot_id)
    assert_uuid_v4(graph.snapshot.repository_id)
    assert graph.snapshot.repository_name == "sample_service"
    assert graph.snapshot.manifest_hash.startswith("sha256:")

    files_by_id = {f.id: f for f in graph.files}
    symbols_by_id = {s.id: s for s in graph.symbols}
    citations_by_id = {c.id: c for c in graph.citations}

    # All IDs must be unique across the entire graph
    all_ids = (
        list(files_by_id.keys())
        + list(symbols_by_id.keys())
        + list(citations_by_id.keys())
        + [e.id for e in graph.edges]
    )
    assert len(all_ids) == len(set(all_ids))

    # File invariants
    for file_record in graph.files:
        assert_uuid_v4(file_record.id)
        assert file_record.snapshot_id == snapshot_id
        assert file_record.path.endswith(".py")
        assert not file_record.path.startswith("/")
        assert ".." not in file_record.path
        assert file_record.line_count > 0
        assert file_record.content_hash.startswith("sha256:")

    # Read original file contents to verify exact ranges
    file_contents = {f.path: (sample_dir / f.path).read_text(encoding="utf-8") for f in graph.files}

    # Symbol invariants
    for sym in graph.symbols:
        assert_uuid_v4(sym.id)
        assert sym.snapshot_id == snapshot_id
        assert sym.file_id in files_by_id
        file_rec = files_by_id[sym.file_id]
        assert sym.range.start_line >= 1
        assert sym.range.end_line >= sym.range.start_line
        assert sym.range.end_line <= file_rec.line_count

    # Citation invariants
    for cit in graph.citations:
        assert_uuid_v4(cit.id)
        assert cit.snapshot_id == snapshot_id
        assert cit.file_id in files_by_id
        file_rec = files_by_id[cit.file_id]
        assert cit.path == file_rec.path
        assert cit.range.start_line >= 1
        assert cit.range.end_line >= cit.range.start_line
        assert cit.range.end_line <= file_rec.line_count

        # Verify citation content hash matches exact file content slice
        actual_hash = compute_range_hash(
            file_contents[cit.path],
            cit.range.start_line,
            cit.range.end_line,
        )
        assert cit.content_hash == actual_hash

    # Edge invariants
    for edge in graph.edges:
        assert_uuid_v4(edge.id)
        assert edge.snapshot_id == snapshot_id
        assert edge.source_symbol_id in symbols_by_id
        assert edge.target_symbol_id in symbols_by_id
        assert len(edge.evidence_citation_ids) >= 1
        for cit_id in edge.evidence_citation_ids:
            assert cit_id in citations_by_id

    # Specific semantic relationships required by hackathon MVP
    sym_by_qual = {s.qualified_name: s for s in graph.symbols if s.qualified_name}

    assert "service.auth.verify_token" in sym_by_qual
    verify_token_sym = sym_by_qual["service.auth.verify_token"]
    assert verify_token_sym.kind == "function"
    assert verify_token_sym.docstring == "Validates bearer tokens."

    assert "service.pricing.calculate_fee" in sym_by_qual
    fee_sym = sym_by_qual["service.pricing.calculate_fee"]
    assert fee_sym.kind == "function"

    assert "service.orders.OrderManager.create_order" in sym_by_qual
    create_order_sym = sym_by_qual["service.orders.OrderManager.create_order"]
    assert create_order_sym.kind == "method"

    # Edge: create_order calls verify_token
    call_edges = [
        e
        for e in graph.edges
        if e.kind == "calls"
        and e.source_symbol_id == create_order_sym.id
        and e.target_symbol_id == verify_token_sym.id
    ]
    assert len(call_edges) >= 1, "Missing call edge: create_order -> verify_token"

    # Edge: OrderManager contains create_order
    order_mgr_sym = sym_by_qual["service.orders.OrderManager"]
    contains_edges = [
        e
        for e in graph.edges
        if e.kind == "contains"
        and e.source_symbol_id == order_mgr_sym.id
        and e.target_symbol_id == create_order_sym.id
    ]
    assert len(contains_edges) >= 1, "Missing contains edge: OrderManager -> create_order"

    # Edge: AuthenticationError extends ServiceError
    auth_err_sym = sym_by_qual["service.errors.AuthenticationError"]
    service_err_sym = sym_by_qual["service.errors.ServiceError"]
    extends_edges = [
        e
        for e in graph.edges
        if e.kind == "extends"
        and e.source_symbol_id == auth_err_sym.id
        and e.target_symbol_id == service_err_sym.id
    ]
    assert len(extends_edges) >= 1, "Missing extends edge: AuthenticationError -> ServiceError"
