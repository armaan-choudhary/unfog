import json
import re
import unittest
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any
from uuid import UUID

ROOT = Path(__file__).resolve().parents[3]
CONTRACTS = ROOT / "docs" / "contracts"


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def walk(value: Any):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def assert_uuid_v4(test: unittest.TestCase, value: str) -> None:
    parsed = UUID(value)
    test.assertEqual(parsed.version, 4)
    test.assertEqual(str(parsed), value)


def assert_hash(test: unittest.TestCase, value: str) -> None:
    test.assertRegex(value, r"^sha256:[a-f0-9]{64}$")


class ContractFixtureTests(unittest.TestCase):
    def test_schemas_are_json_with_resolvable_local_refs_and_patterns(self) -> None:
        for filename in ("source-graph.v1.schema.json", "api-responses.v1.schema.json"):
            with self.subTest(schema=filename):
                schema = read_json(CONTRACTS / filename)
                self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
                self.assertTrue(schema["$id"].startswith("urn:unfog:contract:"))
                for node in walk(schema):
                    if "$ref" in node:
                        ref = node["$ref"]
                        self.assertTrue(ref.startswith("#/"), ref)
                        target: Any = schema
                        for part in ref[2:].split("/"):
                            target = target[part.replace("~1", "/").replace("~0", "~")]
                        self.assertIsNotNone(target)
                    if "pattern" in node:
                        re.compile(node["pattern"])

    def test_graph_fixture_is_single_snapshot_and_references_resolve(self) -> None:
        graph = read_json(CONTRACTS / "examples" / "source-graph.v1.example.json")
        snapshot_id = graph["snapshot"]["id"]
        assert_uuid_v4(self, snapshot_id)
        assert_uuid_v4(self, graph["snapshot"]["repository_id"])
        assert_hash(self, graph["snapshot"]["manifest_hash"])

        files = {item["id"]: item for item in graph["files"]}
        symbols = {item["id"]: item for item in graph["symbols"]}
        citations = {item["id"]: item for item in graph["citations"]}
        all_ids = [
            *files,
            *symbols,
            *citations,
            *(item["id"] for item in graph["edges"]),
        ]
        self.assertEqual(len(all_ids), len(set(all_ids)))

        for source_file in files.values():
            assert_uuid_v4(self, source_file["id"])
            self.assertEqual(source_file["snapshot_id"], snapshot_id)
            assert_hash(self, source_file["content_hash"])
            path = PurePosixPath(source_file["path"])
            self.assertFalse(path.is_absolute())
            self.assertNotIn("..", path.parts)

        for symbol in symbols.values():
            assert_uuid_v4(self, symbol["id"])
            assert_uuid_v4(self, symbol["file_id"])
            self.assertEqual(symbol["snapshot_id"], snapshot_id)
            self.assertIn(symbol["file_id"], files)
            start, end = symbol["range"]["start_line"], symbol["range"]["end_line"]
            self.assertGreaterEqual(start, 1)
            self.assertGreaterEqual(end, start)
            self.assertLessEqual(end, files[symbol["file_id"]]["line_count"])

        for citation in citations.values():
            assert_uuid_v4(self, citation["id"])
            assert_uuid_v4(self, citation["file_id"])
            self.assertEqual(citation["snapshot_id"], snapshot_id)
            source_file = files[citation["file_id"]]
            self.assertEqual(citation["path"], source_file["path"])
            start, end = citation["range"]["start_line"], citation["range"]["end_line"]
            self.assertGreaterEqual(start, 1)
            self.assertGreaterEqual(end, start)
            self.assertLessEqual(end, source_file["line_count"])
            assert_hash(self, citation["content_hash"])

        for edge in graph["edges"]:
            assert_uuid_v4(self, edge["id"])
            assert_uuid_v4(self, edge["source_symbol_id"])
            assert_uuid_v4(self, edge["target_symbol_id"])
            self.assertEqual(edge["snapshot_id"], snapshot_id)
            self.assertIn(edge["source_symbol_id"], symbols)
            self.assertIn(edge["target_symbol_id"], symbols)
            self.assertTrue(edge["evidence_citation_ids"])
            for citation_id in edge["evidence_citation_ids"]:
                assert_uuid_v4(self, citation_id)
                self.assertIn(citation_id, citations)

    def test_error_fixture_has_safe_versioned_envelope(self) -> None:
        response = read_json(CONTRACTS / "examples" / "api-error.v1.example.json")
        self.assertEqual(response["schema_version"], "1.0")
        error = response["error"]
        assert_uuid_v4(self, error["request_id"])
        self.assertIn(
            error["code"],
            {
                "invalid_request",
                "unauthenticated",
                "forbidden",
                "not_found",
                "conflict",
                "rate_limited",
                "evidence_unavailable",
                "internal_error",
            },
        )
        self.assertGreater(len(error["message"]), 0)
        self.assertIsInstance(error["retryable"], bool)

    def test_job_fixture_has_valid_state_and_snapshot_ids(self) -> None:
        job = read_json(CONTRACTS / "examples" / "job.v1.example.json")
        self.assertEqual(job["schema_version"], "1.0")
        assert_uuid_v4(self, job["job_id"])
        assert_uuid_v4(self, job["repository_id"])
        assert_uuid_v4(self, job["snapshot_id"])
        self.assertIn(job["status"], {"queued", "running", "succeeded", "failed", "cancelled"})
        self.assertGreaterEqual(job["progress"], 0)
        self.assertLessEqual(job["progress"], 100)
        datetime.fromisoformat(job["created_at"].replace("Z", "+00:00"))
        datetime.fromisoformat(job["updated_at"].replace("Z", "+00:00"))


if __name__ == "__main__":
    unittest.main()
