"""URL validation and security checks for public GitHub repositories."""

from __future__ import annotations

import re
from urllib.parse import urlsplit

from app.core.errors import ApplicationError, ErrorCode

# GitHub username/organization rules:
# - Max 39 characters
# - Alphanumeric with single hyphens
# - Cannot start or end with a hyphen, no consecutive hyphens
GITHUB_OWNER_PATTERN = re.compile(r"^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$")

# GitHub repository name rules:
# - Max 100 characters
# - Alphanumeric, dots, hyphens, underscores
GITHUB_REPO_PATTERN = re.compile(r"^[a-zA-Z0-9._-]+$")


def validate_github_url(url: str) -> tuple[str, str]:
    """Validate that the given URL is a legitimate public GitHub repository URL.

    Accepts:
      - https://github.com/{owner}/{repo}
      - https://github.com/{owner}/{repo}.git
      - With optional trailing slash

    Rejects:
      - Non-https schemes (http, git, ssh, file, etc.)
      - Hosts other than github.com (IPs, subdomains, localhost, gitlab, etc.)
      - Embedded credentials (user:pass@github.com)
      - Query strings or URL fragments
      - Subpaths (e.g. /tree/main, /pull/1)
      - Path traversal attempts (..)
      - Malformed owner or repo names

    Returns:
      (owner, repo) tuple with .git stripped from repo name.

    Raises:
      ApplicationError: HTTP 400 if validation fails.
    """
    if not url or not isinstance(url, str):
        raise ApplicationError(
            code=ErrorCode.INVALID_REQUEST,
            message="GitHub URL is required.",
            status_code=400,
        )

    clean_url = url.strip()
    try:
        parsed = urlsplit(clean_url)
    except Exception as exc:
        raise ApplicationError(
            code=ErrorCode.INVALID_REQUEST,
            message="Malformed URL provided.",
            status_code=400,
        ) from exc

    # 1. Scheme must be strictly https
    if parsed.scheme.lower() != "https":
        raise ApplicationError(
            code=ErrorCode.INVALID_REQUEST,
            message="Only HTTPS GitHub URLs are permitted (must begin with https://).",
            status_code=400,
        )

    # 2. Host must be strictly github.com (no credentials, no port, no subdomains, no IPs)
    if parsed.netloc.lower() != "github.com":
        raise ApplicationError(
            code=ErrorCode.INVALID_REQUEST,
            message="Host must be strictly github.com.",
            status_code=400,
        )

    # 3. No query strings or fragments allowed
    if parsed.query or parsed.fragment:
        raise ApplicationError(
            code=ErrorCode.INVALID_REQUEST,
            message="GitHub repository URL must not contain query parameters or fragments.",
            status_code=400,
        )

    # 4. Path must contain exactly two segments: owner and repo
    path_segments = [seg for seg in parsed.path.strip("/").split("/") if seg]
    if len(path_segments) != 2:
        raise ApplicationError(
            code=ErrorCode.INVALID_REQUEST,
            message="URL path must match the format /{owner}/{repo}.",
            status_code=400,
        )

    owner, repo = path_segments[0], path_segments[1]

    # Strip optional .git suffix from repo name
    if repo.endswith(".git"):
        repo = repo[:-4]

    if not repo:
        raise ApplicationError(
            code=ErrorCode.INVALID_REQUEST,
            message="Repository name must not be empty.",
            status_code=400,
        )

    # 5. Prevent path traversal in owner or repo
    if ".." in owner or ".." in repo or "." == repo or ".." == repo:
        raise ApplicationError(
            code=ErrorCode.INVALID_REQUEST,
            message="Invalid repository identifier.",
            status_code=400,
        )

    # 6. Validate owner name against GitHub conventions
    if not GITHUB_OWNER_PATTERN.match(owner):
        raise ApplicationError(
            code=ErrorCode.INVALID_REQUEST,
            message=f"Invalid GitHub owner/organization name: '{owner}'.",
            status_code=400,
        )

    # 7. Validate repository name against GitHub conventions
    if (
        len(repo) > 100
        or not GITHUB_REPO_PATTERN.match(repo)
        or repo.startswith(("-", "."))
        or repo.endswith(("-", "."))
    ):
        raise ApplicationError(
            code=ErrorCode.INVALID_REQUEST,
            message=f"Invalid GitHub repository name: '{repo}'.",
            status_code=400,
        )

    return owner, repo
