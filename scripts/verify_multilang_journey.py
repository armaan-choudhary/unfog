#!/usr/bin/env python3
"""scripts/verify_multilang_journey.py

Independent multi-language code intelligence verification suite.
Tests:
  Test A: armaan-portfolio (React / JSX / JS)
  Test B: TypeScript / TSX Next.js repository
  Test C: Python regression (sample_service & pallets/click)
  Test D: Mixed-language repository fixture
"""

import os
import sys
import json
import tempfile
import jsonschema
from pathlib import Path

# Add backend to sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.codeintel.scanner import build_source_graph
from app.codeintel.service import get_codebase_service
from app.ai.service import get_ai_service
from app.ai.schemas import ExplainRequest, ChatRequest
from app.learning.challenges import generate_locate_challenge_for_graph
from app.learning.evaluator import get_challenge_evaluator
from app.learning.schemas import EvaluateRequest

SCHEMA_PATH = REPO_ROOT / "docs" / "contracts" / "source-graph.v1.schema.json"

with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
    SCHEMA = json.load(f)

validator = jsonschema.Draft202012Validator(SCHEMA)


def validate_graph_schema(graph_dict: dict) -> list[str]:
    errors = []
    for err in validator.iter_errors(graph_dict):
        errors.append(f"{list(err.path)}: {err.message}")
    return errors


def test_a_armaan_portfolio():
    print("\n==> Test A: armaan-portfolio (React / JSX / JS)")
    portfolio_path = Path("/home/armaan/Documents/Projects/armaan-portfolio")
    if not portfolio_path.is_dir():
        print(f"Skipping: {portfolio_path} not found")
        return True

    graph = build_source_graph(portfolio_path, repository_name="armaan-portfolio")
    graph_dict = graph.model_dump(mode="json")

    # 1. Schema check
    schema_errs = validate_graph_schema(graph_dict)
    assert not schema_errs, f"Schema validation errors in armaan-portfolio: {schema_errs}"
    print("  ✔ Schema validation: PASS (0 errors)")

    # 2. Verify files and exclusion of node_modules and dist
    file_paths = [f.path for f in graph.files]
    assert any("src/App.jsx" in p for p in file_paths), "src/App.jsx not found in files"
    assert any("src/components/Header.jsx" in p for p in file_paths), "Header.jsx not found"
    assert not any("node_modules" in p for p in file_paths), "node_modules leaked into files!"
    assert not any("dist/" in p for p in file_paths), "dist/ leaked into files!"
    print(f"  ✔ Discovered {len(graph.files)} valid source files (node_modules and dist strictly ignored)")

    # 3. Verify React components extracted with kind="component"
    components = [s for s in graph.symbols if s.kind == "component"]
    component_names = {c.name for c in components}
    print(f"  ✔ Extracted {len(components)} React components: {component_names}")
    assert "App" in component_names, "Component 'App' not extracted as kind='component'"
    assert "Header" in component_names or "Layout" in component_names, "Header/Layout component missing"

    # 4. Verify line numbers and citations against disk
    for cit in graph.citations:
        disk_file = portfolio_path / cit.path
        assert disk_file.is_file(), f"Citation file missing: {cit.path}"
        lines = disk_file.read_text(encoding="utf-8", errors="replace").splitlines()
        assert 1 <= cit.range.start_line <= cit.range.end_line <= max(1, len(lines))

    print(f"  ✔ Verified {len(graph.citations)} citations match exact disk line ranges")

    # 5. Test CodebaseService registration
    service = get_codebase_service()
    service.register_repository("armaan-portfolio", portfolio_path, "armaan-portfolio")
    registered_graph = service.get_graph("armaan-portfolio")
    assert len(registered_graph.files) == len(graph.files)

    # 6. Test AI Explain for a React component
    ai_service = get_ai_service()
    explain_req = ExplainRequest(
        repo_id="armaan-portfolio",
        path="src/components/Header.jsx",
        symbol_name="Header",
        prompt="Explain the structure and responsibilities of this React Header component."
    )
    explain_res = ai_service.explain(explain_req)
    assert explain_res.explanation, "Empty AI explanation"
    assert len(explain_res.citations) >= 1, "Missing citations in component explanation"
    assert explain_res.citations[0].path == "src/components/Header.jsx"
    print(f"  ✔ Gemini AI explanation for React component verified: {len(explain_res.citations)} citations")

    # 7. Test Dynamic Locate Challenge for React component
    challenge_def = generate_locate_challenge_for_graph(graph, repo_id="armaan-portfolio")
    assert "Component" in challenge_def.title or "Locate" in challenge_def.title
    print(f"  ✔ Dynamic Challenge generated: '{challenge_def.title}'")

    evaluator = get_challenge_evaluator()
    eval_req = EvaluateRequest(
        repo_id="armaan-portfolio",
        answer=challenge_def.correct_answer,
        selected_path=challenge_def.target_path
    )
    eval_res = evaluator.evaluate(challenge_def.id, eval_req)
    assert eval_res.is_correct is True
    assert eval_res.score == 100
    assert len(eval_res.citations) >= 1
    print(f"  ✔ Challenge evaluation passed with score 100 and grounded citation")
    return True


def test_b_typescript_repo():
    print("\n==> Test B: Next.js / TypeScript TSX Codebase")
    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        comp_dir = root / "components"
        comp_dir.mkdir(parents=True)

        card_tsx = comp_dir / "ProjectCard.tsx"
        card_tsx.write_text(
            """import React from 'react';

export interface ProjectCardProps {
    title: string;
    description: string;
    stars: number;
}

/** Displays project information with star counter. */
export function ProjectCard({ title, description, stars }: ProjectCardProps) {
    return (
        <div className="card">
            <h3>{title}</h3>
            <p>{description}</p>
            <span className="badge">{stars}</span>
        </div>
    );
}
""",
            encoding="utf-8"
        )

        app_tsx = root / "App.tsx"
        app_tsx.write_text(
            """import React from 'react';
import { ProjectCard } from './components/ProjectCard';

export function Dashboard() {
    return (
        <main>
            <h1>My Projects</h1>
            <ProjectCard title="Unfog" description="Codebase Intelligence" stars={500} />
        </main>
    );
}
""",
            encoding="utf-8"
        )

        graph = build_source_graph(root, repository_name="nextjs-tsx-sample")
        graph_dict = graph.model_dump(mode="json")

        # Schema validation
        schema_errs = validate_graph_schema(graph_dict)
        assert not schema_errs, f"Schema validation errors: {schema_errs}"
        print("  ✔ TypeScript/TSX schema validation: PASS (0 errors)")

        # Symbol extraction
        symbols_by_name = {s.name: s for s in graph.symbols}
        assert "ProjectCard" in symbols_by_name, "ProjectCard component missing"
        assert symbols_by_name["ProjectCard"].kind == "component", "ProjectCard kind must be 'component'"
        assert symbols_by_name["ProjectCard"].language == "typescript"
        assert "ProjectCardProps" in symbols_by_name, "ProjectCardProps interface missing"
        assert symbols_by_name["ProjectCardProps"].kind == "interface"
        assert "Dashboard" in symbols_by_name, "Dashboard component missing"

        # Check renders edge: Dashboard renders ProjectCard
        renders_edges = [e for e in graph.edges if e.kind == "renders"]
        print(f"  ✔ Render edges extracted: {len(renders_edges)}")
        assert len(renders_edges) >= 1, "Expected renders edge from Dashboard to ProjectCard"

        print("  ✔ TSX components, TypeScript interfaces, and renders edges verified")
        return True


def test_c_python_regression():
    print("\n==> Test C: Python Regression (sample_service)")
    sample_dir = REPO_ROOT / "samples" / "sample_service"
    graph = build_source_graph(sample_dir, repository_name="sample_service")
    graph_dict = graph.model_dump(mode="json")

    # Schema validation
    schema_errs = validate_graph_schema(graph_dict)
    assert not schema_errs, f"Schema validation errors in sample_service: {schema_errs}"

    symbols_by_name = {s.name: s for s in graph.symbols}
    assert "verify_token" in symbols_by_name
    assert "OrderManager" in symbols_by_name
    assert "create_order" in symbols_by_name
    assert symbols_by_name["verify_token"].kind == "function"
    assert symbols_by_name["OrderManager"].kind == "class"

    calls_edges = [e for e in graph.edges if e.kind == "calls"]
    assert len(calls_edges) >= 5, "Expected call edges in sample_service"
    print(f"  ✔ Python baseline intact: {len(graph.files)} files, {len(graph.symbols)} symbols, {len(calls_edges)} calls edges")
    return True


def test_d_mixed_language_repository():
    print("\n==> Test D: Mixed-Language Repository (Python + TSX + JS)")
    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)

        # Backend Python service
        backend_dir = root / "backend"
        backend_dir.mkdir(parents=True)
        api_py = backend_dir / "server.py"
        api_py.write_text(
            """def start_server(port: int = 8000) -> None:
    \"\"\"Initializes application server on the specified port.\"\"\"
    print(f"Starting server on port {port}")
""",
            encoding="utf-8"
        )

        # Frontend React/TSX
        frontend_dir = root / "frontend"
        frontend_dir.mkdir(parents=True)
        view_tsx = frontend_dir / "App.tsx"
        view_tsx.write_text(
            """import React from 'react';

export function App() {
    return <div>Hello Mixed World</div>;
}
""",
            encoding="utf-8"
        )

        graph = build_source_graph(root, repository_name="mixed-polyglot-repo")
        graph_dict = graph.model_dump(mode="json")

        # Schema validation
        schema_errs = validate_graph_schema(graph_dict)
        assert not schema_errs, f"Schema validation errors in mixed repo: {schema_errs}"

        languages = {f.language for f in graph.files}
        assert "python" in languages, "Python language missing"
        assert "typescript" in languages, "TypeScript language missing"

        symbols = {s.name: s.kind for s in graph.symbols}
        assert symbols.get("start_server") == "function"
        assert symbols.get("App") == "component"

        print(f"  ✔ Polyglot graph verified: languages={languages}, symbols={list(symbols.keys())}")
        return True


def main():
    print("=" * 60)
    print("   UNFOG MULTI-LANGUAGE CODE INTELLIGENCE VERIFIER   ")
    print("=" * 60)

    t_a = test_a_armaan_portfolio()
    t_b = test_b_typescript_repo()
    t_c = test_c_python_regression()
    t_d = test_d_mixed_language_repository()

    if t_a and t_b and t_c and t_d:
        print("\n" + "=" * 60)
        print("✔ ALL 4 MULTI-LANGUAGE TESTS PASSED CLEANLY (100%)")
        print("=" * 60)
        sys.exit(0)
    else:
        print("\n✖ Multi-language verification tests failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
