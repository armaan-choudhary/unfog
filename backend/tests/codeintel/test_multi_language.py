"""Tests for multi-language (JS, JSX, TS, TSX, Python) code intelligence and React components."""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema

from app.codeintel.parser import parse_source_file
from app.codeintel.scanner import build_source_graph
from app.codeintel.service import CodebaseService

ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = ROOT / "docs" / "contracts" / "source-graph.v1.schema.json"


def test_parse_typescript_react_components() -> None:
    source_tsx = """import React, { useState } from 'react';
import { Avatar } from './Avatar';

export interface UserProfileProps {
    id: string;
    username: string;
}

/**
 * Renders user profile card.
 */
export const UserCard: React.FC<UserProfileProps> = ({ id, username }) => {
    const [active, setActive] = useState(false);
    return (
        <div className="user-card" onClick={() => setActive(!active)}>
            <Avatar userId={id} />
            <h2>{username}</h2>
        </div>
    );
};

export default function App() {
    return (
        <main>
            <UserCard id="u1" username="alice" />
        </main>
    );
}

export class AnalyticsTracker {
    track(event: string): void {
        console.log(event);
    }
}
"""

    parsed = parse_source_file("src/components/UserCard.tsx", source_tsx)
    assert parsed.tree_sitter_valid is True
    assert parsed.line_count == len(source_tsx.splitlines())

    symbol_by_name = {s.name: s for s in parsed.symbols}
    assert "UserProfileProps" in symbol_by_name
    assert symbol_by_name["UserProfileProps"].kind == "interface"

    assert "UserCard" in symbol_by_name
    user_card = symbol_by_name["UserCard"]
    assert user_card.kind == "component"
    assert user_card.docstring == "Renders user profile card."
    assert user_card.start_line == 12

    assert "App" in symbol_by_name
    app_comp = symbol_by_name["App"]
    assert app_comp.kind == "component"

    assert "AnalyticsTracker" in symbol_by_name
    tracker = symbol_by_name["AnalyticsTracker"]
    assert tracker.kind == "class"

    assert "track" in symbol_by_name
    track_fn = symbol_by_name["track"]
    assert track_fn.kind == "method"
    assert track_fn.qualified_name == "src.components.UserCard.AnalyticsTracker.track"

    # Verify JSX renders: UserCard renders Avatar, App renders UserCard
    renders = parsed.renders
    user_card_renders = [r.component_name for r in renders if "UserCard" in r.caller_qualified_name]
    assert "Avatar" in user_card_renders

    app_renders = [r.component_name for r in renders if "App" in r.caller_qualified_name]
    assert "UserCard" in app_renders


def test_parse_javascript_es_modules() -> None:
    source_js = """import { formatCurrency } from './utils';

// Helper function
export function calculateTax(amount) {
    return amount * 0.15;
}

export const Button = ({ label, onClick }) => {
    return <button onClick={onClick}>{label}</button>;
};
"""

    parsed = parse_source_file("src/ui/Button.jsx", source_js)
    assert parsed.tree_sitter_valid is True

    sym_by_name = {s.name: s for s in parsed.symbols}
    assert "calculateTax" in sym_by_name
    assert sym_by_name["calculateTax"].kind == "function"

    assert "Button" in sym_by_name
    assert sym_by_name["Button"].kind == "component"


def test_multi_language_source_graph_and_contract(tmp_path: Path) -> None:
    repo_dir = tmp_path / "mixed_repo"
    src_dir = repo_dir / "src"
    src_dir.mkdir(parents=True)

    # 1. Python backend file
    (repo_dir / "main.py").write_text(
        '''"""Backend API."""

def get_status() -> str:
    """Returns status ok."""
    return "ok"
''',
        encoding="utf-8",
    )

    # 2. React component TSX file
    (src_dir / "Header.tsx").write_text(
        """import React from 'react';

/**
 * Top navigation header component.
 */
export const Header: React.FC = () => {
    return <header><h1>Unfog Dashboard</h1></header>;
};
""",
        encoding="utf-8",
    )

    # 3. TS page rendering Header
    (src_dir / "App.tsx").write_text(
        """import React from 'react';
import { Header } from './Header';

export default function App() {
    return (
        <div>
            <Header />
        </div>
    );
}
""",
        encoding="utf-8",
    )

    # Build graph
    graph = build_source_graph(repo_dir, repository_name="mixed_repo")
    graph_dict = graph.model_dump(mode="json")

    # Validate against JSON schema draft 2020-12
    with SCHEMA_PATH.open(encoding="utf-8") as f:
        schema = json.load(f)
    jsonschema.validate(graph_dict, schema)

    # Verify file languages
    files_by_path = {f.path: f for f in graph.files}
    assert files_by_path["main.py"].language == "python"
    assert files_by_path["src/Header.tsx"].language == "typescript"
    assert files_by_path["src/App.tsx"].language == "typescript"

    # Verify symbols
    sym_by_name = {s.name: s for s in graph.symbols}
    assert "get_status" in sym_by_name
    assert sym_by_name["get_status"].language == "python"

    assert "Header" in sym_by_name
    assert sym_by_name["Header"].kind == "component"
    assert sym_by_name["Header"].language == "typescript"
    assert sym_by_name["Header"].docstring == "Top navigation header component."

    assert "App" in sym_by_name
    assert sym_by_name["App"].kind == "component"
    assert sym_by_name["App"].language == "typescript"

    # Verify renders relationship edge: App -> Header
    app_sym = sym_by_name["App"]
    header_sym = sym_by_name["Header"]
    render_edges = [
        e
        for e in graph.edges
        if e.kind == "renders"
        and e.source_symbol_id == app_sym.id
        and e.target_symbol_id == header_sym.id
    ]
    assert len(render_edges) == 1
    assert render_edges[0].provenance == "static_verified"

    # Test file inspection via CodebaseService
    service = CodebaseService()
    service.register_repository("mixed_1", repo_dir, "mixed_repo")

    file_detail = service.get_file("src/Header.tsx", repo_id="mixed_1")
    assert file_detail.language == "typescript"
    assert file_detail.path == "src/Header.tsx"
    assert any(s.name == "Header" and s.kind == "component" for s in file_detail.symbols)
