"""Security and integration tests for GitHub repository ingestion."""

from __future__ import annotations

import asyncio
import io
import tarfile
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from uuid import uuid4

import pytest
from httpx2 import ASGITransport, AsyncClient, Response

from app.codeintel.service import get_codebase_service
from app.core.config import Settings
from app.core.errors import ApplicationError
from app.github.archive import (
    MAX_FILE_BYTES,
    MAX_FILE_COUNT,
    extract_tarball_safely,
    should_ignore_path,
)
from app.github.client import GitHubClient, SafeRedirectHandler
from app.github.service import GitHubService, get_github_service
from app.github.validator import validate_github_url
from app.main import create_app


def _make_tarball(files: dict[str, bytes | str]) -> io.BytesIO:
    """Creates an in-memory gzipped tarball with specified file paths and contents."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name, content in files.items():
            data = content.encode("utf-8") if isinstance(content, str) else content
            ti = tarfile.TarInfo(name=name)
            ti.size = len(data)
            ti.mtime = 1700000000
            ti.mode = 0o644
            tar.addfile(ti, io.BytesIO(data))
    buf.seek(0)
    return buf


def _settings() -> Settings:
    return Settings(database_url="sqlite+pysqlite:///:memory:", app_env="test")


def _post_json(app: Any, path: str, payload: dict[str, Any]) -> Response:
    async def run() -> Response:
        async with app.router.lifespan_context(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://testserver"
            ) as client:
                return await client.post(path, json=payload)

    return asyncio.run(run())


def _get_json(app: Any, path: str) -> Response:
    async def run() -> Response:
        async with app.router.lifespan_context(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://testserver"
            ) as client:
                return await client.get(path)

    return asyncio.run(run())


# ============================================================================
# 1. URL Validation Tests
# ============================================================================


class TestURLValidation:
    """Verifies strict validation of public GitHub URLs."""

    @pytest.mark.parametrize(
        ("url", "expected_owner", "expected_repo"),
        [
            ("https://github.com/torvalds/linux", "torvalds", "linux"),
            ("https://github.com/torvalds/linux.git", "torvalds", "linux"),
            ("https://github.com/pallets/click/", "pallets", "click"),
            ("https://github.com/pallets/click.git/", "pallets", "click"),
            ("https://github.com/armaan-choudhary/unfog", "armaan-choudhary", "unfog"),
            ("https://github.com/python/cpython.git", "python", "cpython"),
            (
                "https://github.com/user123/repo_with_underscores-and.dots",
                "user123",
                "repo_with_underscores-and.dots",
            ),
        ],
    )
    def test_valid_github_urls(self, url: str, expected_owner: str, expected_repo: str) -> None:
        owner, repo = validate_github_url(url)
        assert owner == expected_owner
        assert repo == expected_repo

    @pytest.mark.parametrize(
        "invalid_url",
        [
            "",
            "   ",
            "http://github.com/owner/repo",  # Non-HTTPS
            "git://github.com/owner/repo.git",  # Git protocol
            "ssh://git@github.com/owner/repo.git",  # SSH protocol
            "ftp://github.com/owner/repo",  # FTP protocol
            "file:///etc/passwd",  # Local file
            "/tmp/local_repo",  # Local filesystem path
            "github.com/owner/repo",  # Missing scheme
            "https://gitlab.com/owner/repo",  # Non-GitHub host
            "https://bitbucket.org/owner/repo",  # Non-GitHub host
            "https://github.com.evil.com/owner/repo",  # Host spoofing
            "https://evil-github.com/owner/repo",  # Host spoofing
            "https://127.0.0.1/owner/repo",  # IP address
            "https://169.254.169.254/owner/repo",  # Cloud metadata IP
            "https://localhost/owner/repo",  # Localhost
            "https://user:pass@github.com/owner/repo",  # Embedded credentials
            "https://token@github.com/owner/repo",  # Embedded credentials
            "https://github.com:8443/owner/repo",  # Non-standard port
            "https://github.com/owner/repo?ref=main",  # Query string
            "https://github.com/owner/repo#readme",  # Fragment
            "https://github.com/owner",  # Incomplete path
            "https://github.com/",  # Missing path
            "https://github.com/owner/repo/tree/main",  # Deep path / subpath
            "https://github.com/owner/repo/pull/1",  # PR path
            "https://github.com/../owner/repo",  # Traversal attempt
            "https://github.com/owner/..",  # Traversal attempt
            "https://github.com/-invalid-owner/repo",  # Invalid owner
            "https://github.com/owner/-invalid-repo-starts-hyphen",  # Handled
        ],
    )
    def test_invalid_github_urls_rejected(self, invalid_url: str) -> None:
        with pytest.raises(ApplicationError) as exc_info:
            validate_github_url(invalid_url)
        assert exc_info.value.status_code == 400


# ============================================================================
# 2. Archive Security & Zip-Slip Protection Tests
# ============================================================================


class TestArchiveSecurity:
    """Verifies that malicious or malformed archives are rejected."""

    def test_zip_slip_traversal_path_rejected(self, tmp_path: Path) -> None:
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            ti = tarfile.TarInfo(name="repo/../../evil.py")
            data = b"print('hacked')"
            ti.size = len(data)
            tar.addfile(ti, io.BytesIO(data))
        buf.seek(0)

        with pytest.raises(ApplicationError) as exc_info:
            extract_tarball_safely(buf, uuid4(), sandbox_base=tmp_path)
        assert exc_info.value.status_code == 400
        assert "path traversal" in exc_info.value.message.lower()

    def test_absolute_path_in_archive_rejected(self, tmp_path: Path) -> None:
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            ti = tarfile.TarInfo(name="/etc/passwd.py")
            data = b"print('root')"
            ti.size = len(data)
            tar.addfile(ti, io.BytesIO(data))
        buf.seek(0)

        with pytest.raises(ApplicationError) as exc_info:
            extract_tarball_safely(buf, uuid4(), sandbox_base=tmp_path)
        assert exc_info.value.status_code == 400
        assert "absolute" in exc_info.value.message.lower()

    def test_symlinks_rejected(self, tmp_path: Path) -> None:
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            ti = tarfile.TarInfo(name="repo/link.py")
            ti.type = tarfile.SYMTYPE
            ti.linkname = "/etc/shadow"
            tar.addfile(ti)
        buf.seek(0)

        with pytest.raises(ApplicationError) as exc_info:
            extract_tarball_safely(buf, uuid4(), sandbox_base=tmp_path)
        assert exc_info.value.status_code == 400
        assert "link" in exc_info.value.message.lower()

    def test_hardlinks_rejected(self, tmp_path: Path) -> None:
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            ti = tarfile.TarInfo(name="repo/hardlink.py")
            ti.type = tarfile.LNKTYPE
            ti.linkname = "repo/target.py"
            tar.addfile(ti)
        buf.seek(0)

        with pytest.raises(ApplicationError) as exc_info:
            extract_tarball_safely(buf, uuid4(), sandbox_base=tmp_path)
        assert exc_info.value.status_code == 400
        assert "link" in exc_info.value.message.lower()

    def test_null_bytes_in_filename_rejected(self, tmp_path: Path) -> None:
        buf = _make_tarball({"repo/main.py": "x = 1"})
        with tarfile.open(fileobj=buf, mode="r:*"):
            mock_members = [tarfile.TarInfo(name="repo/file\x00.py")]
            with patch.object(tarfile.TarFile, "getmembers", return_value=mock_members):
                buf.seek(0)
                with pytest.raises(ApplicationError) as exc_info:
                    extract_tarball_safely(buf, uuid4(), sandbox_base=tmp_path)
                assert exc_info.value.status_code == 400
                assert "null bytes" in exc_info.value.message.lower()

    def test_corrupted_archive_rejected(self, tmp_path: Path) -> None:
        corrupt_buf = io.BytesIO(b"not-a-tarball-archive-garbage-bytes")
        with pytest.raises(ApplicationError) as exc_info:
            extract_tarball_safely(corrupt_buf, uuid4(), sandbox_base=tmp_path)
        assert exc_info.value.status_code == 400

    def test_untrusted_redirect_handler_rejected(self) -> None:
        handler = SafeRedirectHandler()
        req = MagicMock()
        with pytest.raises(ApplicationError) as exc_info:
            handler.redirect_request(req, None, 302, "Found", {}, "https://evil-site.com/tarball")
        assert exc_info.value.status_code == 400
        assert "untrusted redirect" in exc_info.value.message.lower()


# ============================================================================
# 3. Ignore Filter Tests
# ============================================================================


class TestIgnoreFilters:
    """Verifies that non-python files, virtualenvs, dotfiles, and secrets are ignored."""

    @pytest.mark.parametrize(
        "ignored_path",
        [
            ".git/HEAD",
            ".git/config",
            ".github/workflows/ci.yml",
            "venv/bin/python.py",
            ".venv/lib/python3.11/site-packages/pkg.py",
            "env/bin/activate",
            "node_modules/express/index.js",
            "__pycache__/mod.cpython-311.pyc",
            ".pytest_cache/v/cache",
            ".mypy_cache/3.11/foo.json",
            ".ruff_cache/0.1/bar",
            "build/lib/mod.py",
            "dist/pkg-0.1.tar.gz",
            ".next/server/page.js",
            ".vite/deps/react.js",
            "out/index.js",
            "coverage/lcov.info",
            "package-lock.json",
            "yarn.lock",
            "pnpm-lock.yaml",
            "bun.lockb",
            "app.min.js",
            "foo.egg-info/PKG-INFO",
            ".env",
            ".env.production",
            ".gitignore",
            "id_rsa",
            "id_ed25519",
            "server.key",
            "cert.pem",
            "cert.crt",
            "my_secret_token.txt",
            "README.md",
            "package.json",
            "Makefile",
            "docker-compose.yml",
            "image.png",
        ],
    )
    def test_ignored_entries(self, ignored_path: str) -> None:
        from pathlib import PurePosixPath

        assert should_ignore_path(PurePosixPath(ignored_path)) is True

    @pytest.mark.parametrize(
        "allowed_path",
        [
            "main.py",
            "service/auth.py",
            "index.js",
            "src/App.jsx",
            "src/index.ts",
            "components/Button.tsx",
            "utils.mjs",
            "config.cjs",
            "api.mts",
            "client.cts",
        ],
    )
    def test_allowed_source_files(self, allowed_path: str) -> None:
        from pathlib import PurePosixPath

        assert should_ignore_path(PurePosixPath(allowed_path)) is False

    def test_archive_with_mixed_contents_filters_properly(self, tmp_path: Path) -> None:
        tarball = _make_tarball(
            {
                "octocat-Hello-World-abc1234/.git/config": "repo config",
                "octocat-Hello-World-abc1234/.github/ci.yml": "ci: true",
                "octocat-Hello-World-abc1234/venv/bin/script.py": "virtualenv file",
                "octocat-Hello-World-abc1234/node_modules/pkg/index.js": "console.log()",
                "octocat-Hello-World-abc1234/.env": "SECRET=123",
                "octocat-Hello-World-abc1234/cert.pem": "CERT DATA",
                "octocat-Hello-World-abc1234/README.md": "# Hello World",
                "octocat-Hello-World-abc1234/service/__init__.py": "# pkg",
                "octocat-Hello-World-abc1234/service/auth.py": "def verify(): return True",
            }
        )

        repo_id = uuid4()
        dest_dir, file_count = extract_tarball_safely(tarball, repo_id, sandbox_base=tmp_path)

        assert file_count == 2
        assert (dest_dir / "service/__init__.py").exists()
        assert (dest_dir / "service/auth.py").exists()
        assert not (dest_dir / ".git").exists()
        assert not (dest_dir / "venv").exists()
        assert not (dest_dir / "node_modules").exists()
        assert not (dest_dir / ".env").exists()
        assert not (dest_dir / "README.md").exists()


# ============================================================================
# 4. Size Bounds & Quota Enforcement Tests
# ============================================================================


class TestSizeLimits:
    """Verifies archive size bounds, extraction size, and file counts."""

    def test_single_file_exceeding_1mb_rejected(self, tmp_path: Path) -> None:
        large_content = b"x" * (MAX_FILE_BYTES + 1024)
        tarball = _make_tarball(
            {
                "repo/huge.py": large_content,
            }
        )
        with pytest.raises(ApplicationError) as exc_info:
            extract_tarball_safely(tarball, uuid4(), sandbox_base=tmp_path)
        assert exc_info.value.status_code == 413
        assert "1mb" in exc_info.value.message.lower()

    def test_file_count_limit_rejected(self, tmp_path: Path) -> None:
        # Create an archive with MAX_FILE_COUNT + 1 python files
        files = {f"repo/mod_{i}.py": f"x = {i}" for i in range(MAX_FILE_COUNT + 1)}
        tarball = _make_tarball(files)

        with pytest.raises(ApplicationError) as exc_info:
            extract_tarball_safely(tarball, uuid4(), sandbox_base=tmp_path)
        assert exc_info.value.status_code == 413
        assert "file count" in exc_info.value.message.lower()

    def test_no_supported_files_raises_422(self, tmp_path: Path) -> None:
        tarball = _make_tarball(
            {
                "repo/README.md": "# No code here",
                "repo/package.json": "{}",
                "repo/style.css": "body { color: red; }",
            }
        )
        repo_id = uuid4()
        with pytest.raises(ApplicationError) as exc_info:
            extract_tarball_safely(tarball, repo_id, sandbox_base=tmp_path)
        assert exc_info.value.status_code == 422
        assert "no supported source files" in exc_info.value.message.lower()
        # Verify sandbox directory cleaned up
        assert not (tmp_path / str(repo_id)).exists()

    def test_javascript_typescript_archive_extracted(self, tmp_path: Path) -> None:
        tarball = _make_tarball(
            {
                "owner-jsrepo-abc1234/src/App.tsx": (
                    "export function App() { return <div>App</div>; }"
                ),
                "owner-jsrepo-abc1234/src/utils.ts": (
                    "export const sum = (a: number, b: number) => a + b;"
                ),
                "owner-jsrepo-abc1234/index.js": "console.log('hello');",
                "owner-jsrepo-abc1234/components/Card.jsx": "export const Card = () => <div />;",
                "owner-jsrepo-abc1234/package-lock.json": "{}",
                "owner-jsrepo-abc1234/dist/bundle.js": "minified",
            }
        )
        repo_id = uuid4()
        dest_dir, file_count = extract_tarball_safely(tarball, repo_id, sandbox_base=tmp_path)
        assert file_count == 4
        assert (dest_dir / "src/App.tsx").exists()
        assert (dest_dir / "src/utils.ts").exists()
        assert (dest_dir / "index.js").exists()
        assert (dest_dir / "components/Card.jsx").exists()
        assert not (dest_dir / "package-lock.json").exists()
        assert not (dest_dir / "dist").exists()

    def test_client_download_tarball_size_overflow_rejected(self) -> None:
        client = GitHubClient()
        mock_response = MagicMock()
        mock_response.headers = {"Content-Length": str(30 * 1024 * 1024)}  # 30 MB > 25 MB
        mock_response.__enter__.return_value = mock_response

        with patch.object(client._opener, "open", return_value=mock_response):
            with pytest.raises(ApplicationError) as exc_info:
                client.download_tarball("owner", "repo", "sha123")
            assert exc_info.value.status_code == 413


# ============================================================================
# 5. GitHub API & Client Error Handling Tests
# ============================================================================


class TestGitHubClient:
    """Verifies handling of rate limits, 404s, private repos, and timeouts."""

    def test_not_found_or_private_raises_404(self) -> None:
        client = GitHubClient()
        http_error = HTTPError(
            url="https://api.github.com/repos/owner/missing",
            code=404,
            msg="Not Found",
            hdrs={},  # type: ignore[arg-type]
            fp=io.BytesIO(b'{"message": "Not Found"}'),
        )
        with patch.object(client._opener, "open", side_effect=http_error):
            with pytest.raises(ApplicationError) as exc_info:
                client.get_repo_details("owner", "missing")
            assert exc_info.value.status_code == 404
            assert "not found or is private" in exc_info.value.message.lower()

    def test_private_repository_flag_raises_404(self) -> None:
        client = GitHubClient()
        mock_response = MagicMock()
        mock_response.read.return_value = b'{"name": "private-repo", "private": true}'
        mock_response.__enter__.return_value = mock_response

        with patch.object(client._opener, "open", return_value=mock_response):
            with pytest.raises(ApplicationError) as exc_info:
                client.get_repo_details("owner", "private-repo")
            assert exc_info.value.status_code == 404
            assert "private" in exc_info.value.message.lower()

    def test_rate_limited_raises_429(self) -> None:
        client = GitHubClient()
        hdrs = MagicMock()
        hdrs.get.return_value = "0"  # X-RateLimit-Remaining: 0
        http_error = HTTPError(
            url="https://api.github.com/repos/owner/repo",
            code=403,
            msg="Forbidden",
            hdrs=hdrs,
            fp=io.BytesIO(b'{"message": "API rate limit exceeded for 1.2.3.4"}'),
        )
        with patch.object(client._opener, "open", side_effect=http_error):
            with pytest.raises(ApplicationError) as exc_info:
                client.get_repo_details("owner", "repo")
            assert exc_info.value.status_code == 429
            assert exc_info.value.retryable is True
            assert "rate limit" in exc_info.value.message.lower()

    def test_optional_github_token_header_included(self) -> None:
        client = GitHubClient(token="ghp_testtoken123456789")
        req = client._build_request("https://api.github.com/repos/owner/repo")
        assert req.headers.get("Authorization") == "Bearer ghp_testtoken123456789"
        assert req.get_header("User-agent") == "Unfog-Agent"


# ============================================================================
# 6. Full API Endpoint Integration Tests
# ============================================================================


class TestGitHubImportAPI:
    """Verifies POST /api/v1/github/import endpoint behavior and status codes."""

    def test_successful_github_import(self) -> None:
        sample_tarball = _make_tarball(
            {
                "owner-sample-repo-1234567/main.py": (
                    "def add(a: int, b: int) -> int:\n    return a + b\n"
                ),
                "owner-sample-repo-1234567/utils.py": "def helper():\n    return 'ok'\n",
            }
        )

        mock_client = MagicMock()
        mock_client.get_repo_details.return_value = {
            "name": "sample-repo",
            "full_name": "owner/sample-repo",
            "description": "A sample Python microservice",
            "html_url": "https://github.com/owner/sample-repo",
            "default_branch": "main",
            "private": False,
            "stargazers_count": 42,
            "forks_count": 7,
            "open_issues_count": 2,
        }
        mock_client.get_commit_sha.return_value = "1234567890abcdef1234567890abcdef12345678"
        mock_client.download_tarball.return_value = sample_tarball

        service = GitHubService(client=mock_client)
        app = create_app(_settings())
        app.dependency_overrides[get_github_service] = lambda: service

        response = _post_json(
            app,
            "/api/v1/github/import",
            {"url": "https://github.com/owner/sample-repo"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["owner"] == "owner"
        assert data["repo"] == "sample-repo"
        assert data["commit_sha"] == "1234567890abcdef1234567890abcdef12345678"
        assert data["default_branch"] == "main"
        assert data["file_count"] == 2
        assert "repo_id" in data
        assert data["metadata"]["name"] == "sample-repo"
        assert data["metadata"]["stars"] == 42

        # Verify registered in CodebaseService
        repo_id = data["repo_id"]
        codebase_svc = get_codebase_service()
        graph = codebase_svc.get_graph(repo_id=repo_id)
        assert graph.snapshot.repository_name == "owner/sample-repo"
        assert len(graph.files) == 2
        symbol_names = [s.name for s in graph.symbols]
        assert "add" in symbol_names
        assert "helper" in symbol_names

    def test_import_invalid_url_returns_400(self) -> None:
        app = create_app(_settings())
        response = _post_json(
            app,
            "/api/v1/github/import",
            {"url": "https://gitlab.com/owner/repo"},
        )
        assert response.status_code == 400
        error = response.json()["error"]
        assert "github.com" in error["message"].lower()

    def test_import_not_found_returns_404(self) -> None:
        mock_client = MagicMock()
        mock_client.get_repo_details.side_effect = ApplicationError(
            code="not_found",  # type: ignore[arg-type]
            message="Repository not found or is private on GitHub.",
            status_code=404,
        )

        service = GitHubService(client=mock_client)
        app = create_app(_settings())
        app.dependency_overrides[get_github_service] = lambda: service

        response = _post_json(
            app,
            "/api/v1/github/import",
            {"url": "https://github.com/owner/nonexistent"},
        )
        assert response.status_code == 404
        assert "not found" in response.json()["error"]["message"].lower()

    def test_import_rate_limited_returns_429(self) -> None:
        mock_client = MagicMock()
        mock_client.get_repo_details.side_effect = ApplicationError(
            code="rate_limited",  # type: ignore[arg-type]
            message="GitHub API rate limit reached. Please try again later.",
            status_code=429,
            retryable=True,
        )

        service = GitHubService(client=mock_client)
        app = create_app(_settings())
        app.dependency_overrides[get_github_service] = lambda: service

        response = _post_json(
            app,
            "/api/v1/github/import",
            {"url": "https://github.com/owner/ratelimited"},
        )
        assert response.status_code == 429
        assert "rate limit" in response.json()["error"]["message"].lower()

    def test_import_oversized_archive_returns_413(self) -> None:
        mock_client = MagicMock()
        mock_client.get_repo_details.return_value = {
            "name": "oversized",
            "full_name": "owner/oversized",
            "default_branch": "main",
        }
        mock_client.get_commit_sha.return_value = "abc1234"
        mock_client.download_tarball.side_effect = ApplicationError(
            code="invalid_request",  # type: ignore[arg-type]
            message="Repository archive exceeds maximum size limit (25MB).",
            status_code=413,
        )

        service = GitHubService(client=mock_client)
        app = create_app(_settings())
        app.dependency_overrides[get_github_service] = lambda: service

        response = _post_json(
            app,
            "/api/v1/github/import",
            {"url": "https://github.com/owner/oversized"},
        )
        assert response.status_code == 413
        assert "25mb" in response.json()["error"]["message"].lower()

    def test_import_no_supported_files_returns_422(self) -> None:
        empty_tarball = _make_tarball(
            {
                "owner-norepo-123/README.md": "# Documentation only",
                "owner-norepo-123/notes.txt": "just some text",
            }
        )

        mock_client = MagicMock()
        mock_client.get_repo_details.return_value = {
            "name": "norepo",
            "full_name": "owner/norepo",
            "default_branch": "main",
        }
        mock_client.get_commit_sha.return_value = "commit123"
        mock_client.download_tarball.return_value = empty_tarball

        service = GitHubService(client=mock_client)
        app = create_app(_settings())
        app.dependency_overrides[get_github_service] = lambda: service

        response = _post_json(
            app,
            "/api/v1/github/import",
            {"url": "https://github.com/owner/norepo"},
        )
        assert response.status_code == 422
        err_msg = response.json()["error"]["message"]
        assert "no supported source files" in err_msg.lower()

    def test_get_repo_info_python_repo(self) -> None:
        mock_client = MagicMock()
        mock_client.get_repo_details.return_value = {
            "name": "click",
            "full_name": "pallets/click",
            "description": "Composable command line interface toolkit",
            "html_url": "https://github.com/pallets/click",
            "default_branch": "main",
            "language": "Python",
            "stargazers_count": 15000,
            "forks_count": 2500,
        }

        service = GitHubService(client=mock_client)
        app = create_app(_settings())
        app.dependency_overrides[get_github_service] = lambda: service

        response = _get_json(app, "/api/v1/github/info?url=https://github.com/pallets/click")
        assert response.status_code == 200
        data = response.json()
        assert data["owner"] == "pallets"
        assert data["repo"] == "click"
        assert data["language"] == "Python"
        assert data["is_python"] is True
        assert data["is_supported"] is True
        assert data["stars"] == 15000

    def test_get_repo_info_typescript_repo(self) -> None:
        mock_client = MagicMock()
        mock_client.get_repo_details.return_value = {
            "name": "portfolio",
            "full_name": "developer/portfolio",
            "description": "Portfolio website in React/Vite",
            "html_url": "https://github.com/developer/portfolio",
            "default_branch": "main",
            "language": "TypeScript",
            "stargazers_count": 5,
            "forks_count": 1,
        }

        service = GitHubService(client=mock_client)
        app = create_app(_settings())
        app.dependency_overrides[get_github_service] = lambda: service

        response = _get_json(app, "/api/v1/github/info?url=https://github.com/developer/portfolio")
        assert response.status_code == 200
        data = response.json()
        assert data["owner"] == "developer"
        assert data["repo"] == "portfolio"
        assert data["language"] == "TypeScript"
        assert data["is_python"] is False
        assert data["is_supported"] is True

    def test_get_repo_info_unsupported_repo(self) -> None:
        mock_client = MagicMock()
        mock_client.get_repo_details.return_value = {
            "name": "rust-tool",
            "full_name": "developer/rust-tool",
            "description": "A tool written in Rust",
            "html_url": "https://github.com/developer/rust-tool",
            "default_branch": "main",
            "language": "Rust",
            "stargazers_count": 10,
            "forks_count": 2,
        }

        service = GitHubService(client=mock_client)
        app = create_app(_settings())
        app.dependency_overrides[get_github_service] = lambda: service

        response = _get_json(app, "/api/v1/github/info?url=https://github.com/developer/rust-tool")
        assert response.status_code == 200
        data = response.json()
        assert data["owner"] == "developer"
        assert data["repo"] == "rust-tool"
        assert data["language"] == "Rust"
        assert data["is_python"] is False
        assert data["is_supported"] is False

    def test_import_with_long_docstring_succeeds(self) -> None:
        long_doc = '"""' + ("A" * 5000) + '"""\n'
        sample_tarball = _make_tarball(
            {
                "owner-sample-repo-1234567/main.py": (
                    f"def function_with_long_doc():\n    {long_doc}    return 42\n"
                ),
            }
        )

        mock_client = MagicMock()
        mock_client.get_repo_details.return_value = {
            "name": "sample-repo",
            "full_name": "owner/sample-repo",
            "default_branch": "main",
            "language": "Python",
        }
        mock_client.get_commit_sha.return_value = "1234567890abcdef1234567890abcdef12345678"
        mock_client.download_tarball.return_value = sample_tarball

        service = GitHubService(client=mock_client)
        app = create_app(_settings())
        app.dependency_overrides[get_github_service] = lambda: service

        response = _post_json(
            app,
            "/api/v1/github/import",
            {"url": "https://github.com/owner/sample-repo"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["file_count"] == 1
        assert data["metadata"]["language"] == "Python"
