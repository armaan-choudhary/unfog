"""HTTP client for GitHub public API and tarball archive streaming."""

from __future__ import annotations

import io
import json
import os
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import urlsplit

from app.core.errors import ApplicationError, ErrorCode

MAX_ARCHIVE_BYTES = 25 * 1024 * 1024  # 25 MB
DEFAULT_TIMEOUT_SECONDS = 15.0
ALLOWED_REDIRECT_HOSTS = frozenset({"github.com", "api.github.com", "codeload.github.com"})


class SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Restricts HTTP redirects strictly to trusted HTTPS GitHub domains."""

    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> urllib.request.Request | None:
        parsed = urlsplit(newurl)
        hostname = (parsed.hostname or "").lower()
        is_trusted = (
            hostname in ALLOWED_REDIRECT_HOSTS
            or hostname.endswith(".github.com")
            or hostname.endswith(".githubusercontent.com")
        )
        if parsed.scheme.lower() != "https" or not is_trusted:
            raise ApplicationError(
                code=ErrorCode.FORBIDDEN,
                message=f"Untrusted redirect location rejected: {newurl}",
                status_code=400,
            )
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class GitHubClient:
    """Client for querying GitHub API and downloading repository tarballs."""

    def __init__(
        self,
        token: str | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.token = token or os.getenv("GITHUB_TOKEN")
        self.timeout_seconds = timeout_seconds
        self._opener = urllib.request.build_opener(SafeRedirectHandler())

    def _build_request(self, url: str) -> urllib.request.Request:
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Unfog-Agent",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return urllib.request.Request(url, headers=headers)

    def _handle_http_error(self, exc: urllib.error.HTTPError) -> None:
        if exc.code == 404:
            raise ApplicationError(
                code=ErrorCode.NOT_FOUND,
                message="Repository not found or is private on GitHub.",
                status_code=404,
            ) from exc

        if exc.code in (403, 429):
            remaining = exc.headers.get("X-RateLimit-Remaining")
            try:
                raw_body = exc.read().decode("utf-8", errors="ignore")
            except Exception:
                raw_body = ""

            if (remaining is not None and remaining == "0") or "rate limit" in raw_body.lower():
                raise ApplicationError(
                    code=ErrorCode.RATE_LIMITED,
                    message="GitHub API rate limit reached. Please try again later.",
                    status_code=429,
                    retryable=True,
                ) from exc

            # Other 403 (e.g. forbidden / access denied to private repository)
            raise ApplicationError(
                code=ErrorCode.NOT_FOUND,
                message="Repository not found or is private on GitHub.",
                status_code=404,
            ) from exc

        if exc.code == 413:
            raise ApplicationError(
                code=ErrorCode.INVALID_REQUEST,
                message="Repository archive exceeds size limits.",
                status_code=413,
            ) from exc

        raise ApplicationError(
            code=ErrorCode.INTERNAL_ERROR,
            message=f"GitHub API error: HTTP {exc.code}.",
            status_code=502,
            retryable=True,
        ) from exc

    def get_repo_details(self, owner: str, repo: str) -> dict[str, Any]:
        """Fetch repository metadata from https://api.github.com/repos/{owner}/{repo}."""
        url = f"https://api.github.com/repos/{owner}/{repo}"
        request = self._build_request(url)

        try:
            with self._opener.open(request, timeout=self.timeout_seconds) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            self._handle_http_error(exc)
        except urllib.error.URLError as exc:
            raise ApplicationError(
                code=ErrorCode.INTERNAL_ERROR,
                message=f"Network error communicating with GitHub: {exc.reason}",
                status_code=504,
                retryable=True,
            ) from exc
        except TimeoutError as exc:
            raise ApplicationError(
                code=ErrorCode.INTERNAL_ERROR,
                message=f"Request to GitHub timed out ({self.timeout_seconds}s limit).",
                status_code=504,
                retryable=True,
            ) from exc

        if not isinstance(data, dict):
            raise ApplicationError(
                code=ErrorCode.INTERNAL_ERROR,
                message="Unexpected response payload from GitHub API.",
                status_code=502,
            )

        if data.get("private") is True:
            raise ApplicationError(
                code=ErrorCode.NOT_FOUND,
                message="Repository is private. Only public repositories are supported.",
                status_code=404,
            )

        return data

    def get_commit_sha(self, owner: str, repo: str, branch: str) -> str:
        """Resolve immutable commit SHA for a branch."""
        url = f"https://api.github.com/repos/{owner}/{repo}/commits/{branch}"
        request = self._build_request(url)

        try:
            with self._opener.open(request, timeout=self.timeout_seconds) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            self._handle_http_error(exc)
        except urllib.error.URLError as exc:
            raise ApplicationError(
                code=ErrorCode.INTERNAL_ERROR,
                message=f"Network error communicating with GitHub: {exc.reason}",
                status_code=504,
                retryable=True,
            ) from exc
        except TimeoutError as exc:
            raise ApplicationError(
                code=ErrorCode.INTERNAL_ERROR,
                message=f"Request to GitHub timed out ({self.timeout_seconds}s limit).",
                status_code=504,
                retryable=True,
            ) from exc

        if not isinstance(data, dict) or "sha" not in data or not isinstance(data["sha"], str):
            raise ApplicationError(
                code=ErrorCode.INTERNAL_ERROR,
                message="Failed to resolve commit SHA from GitHub API.",
                status_code=502,
            )

        return data["sha"]

    def download_tarball(self, owner: str, repo: str, commit_sha: str) -> io.BytesIO:
        """Stream tarball archive from GitHub with strict size bounds (max 25MB)."""
        url = f"https://api.github.com/repos/{owner}/{repo}/tarball/{commit_sha}"
        request = self._build_request(url)

        try:
            with self._opener.open(request, timeout=self.timeout_seconds) as resp:
                content_len_header = resp.headers.get("Content-Length")
                if content_len_header:
                    try:
                        content_len = int(content_len_header)
                        if content_len > MAX_ARCHIVE_BYTES:
                            raise ApplicationError(
                                code=ErrorCode.INVALID_REQUEST,
                                message="Repository archive exceeds maximum size limit (25MB).",
                                status_code=413,
                            )
                    except ValueError:
                        pass

                buffer = io.BytesIO()
                downloaded = 0
                chunk_size = 65536  # 64 KB

                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    downloaded += len(chunk)
                    if downloaded > MAX_ARCHIVE_BYTES:
                        raise ApplicationError(
                            code=ErrorCode.INVALID_REQUEST,
                            message="Repository archive exceeds maximum size limit (25MB).",
                            status_code=413,
                        )
                    buffer.write(chunk)

                buffer.seek(0)
                return buffer

        except urllib.error.HTTPError as exc:
            self._handle_http_error(exc)
            # Reached only if _handle_http_error did not raise
            raise ApplicationError(
                code=ErrorCode.INTERNAL_ERROR,
                message=f"GitHub archive download error: HTTP {exc.code}.",
                status_code=502,
            ) from exc
        except urllib.error.URLError as exc:
            raise ApplicationError(
                code=ErrorCode.INTERNAL_ERROR,
                message=f"Network error downloading archive: {exc.reason}",
                status_code=504,
                retryable=True,
            ) from exc
        except TimeoutError as exc:
            raise ApplicationError(
                code=ErrorCode.INTERNAL_ERROR,
                message=f"Archive download timed out ({self.timeout_seconds}s limit).",
                status_code=504,
                retryable=True,
            ) from exc
