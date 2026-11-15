"""Service orchestrating GitHub URL validation, download, extraction, and indexing."""

from __future__ import annotations

from uuid import uuid4

from app.codeintel.service import CodebaseService, get_codebase_service
from app.github.archive import extract_tarball_safely
from app.github.client import GitHubClient
from app.github.schemas import GitHubImportResponse, GitHubRepoInfo, RepositoryMetadata
from app.github.validator import validate_github_url

SUPPORTED_PRIMARY_LANGUAGES = frozenset({"python", "javascript", "typescript", "jsx", "tsx"})


class GitHubService:
    """Orchestrates secure public GitHub repository ingestion."""

    def __init__(
        self,
        client: GitHubClient | None = None,
        codebase_service: CodebaseService | None = None,
    ) -> None:
        self.client = client or GitHubClient()
        self.codebase_service = codebase_service or get_codebase_service()

    def import_repository(self, url: str) -> GitHubImportResponse:
        """Validate, ingest, extract, and index a public GitHub repository.

        Steps:
          1. Validate GitHub URL strictly.
          2. Fetch repository metadata and verify visibility is public.
          3. Resolve default branch and immutable commit SHA.
          4. Download tarball with 25MB archive limit and 15s timeout.
          5. Safely extract into sandboxed directory (/tmp/unfog_repos/{repo_id}).
          6. Register repository with CodebaseService to index AST and symbols.
          7. Return structured metadata and ingest summary.
        """
        owner, repo = validate_github_url(url)

        # Query repository metadata
        repo_details = self.client.get_repo_details(owner, repo)
        default_branch = repo_details.get("default_branch") or "main"
        full_name = repo_details.get("full_name") or f"{owner}/{repo}"

        # Resolve immutable commit SHA for default branch
        commit_sha = self.client.get_commit_sha(owner, repo, default_branch)

        # Generate persistent UUID identifier
        repo_id = uuid4()

        # Stream tarball archive
        archive_buffer = self.client.download_tarball(owner, repo, commit_sha)

        # Extract safely into sandbox
        dest_dir, file_count = extract_tarball_safely(archive_buffer, repo_id)

        # Index with CodebaseService
        self.codebase_service.register_repository(
            repo_id=str(repo_id),
            root_dir=dest_dir,
            repository_name=full_name,
        )

        lang = repo_details.get("language")
        lang_str = str(lang).strip().lower() if lang else ""
        is_supported = bool(lang_str in SUPPORTED_PRIMARY_LANGUAGES) if lang else True

        metadata = RepositoryMetadata(
            name=repo_details.get("name") or repo,
            full_name=full_name,
            description=repo_details.get("description"),
            html_url=repo_details.get("html_url") or f"https://github.com/{owner}/{repo}",
            default_branch=default_branch,
            visibility="public",
            language=lang,
            is_supported=is_supported,
            stars=repo_details.get("stargazers_count", 0),
            forks=repo_details.get("forks_count", 0),
            open_issues=repo_details.get("open_issues_count", 0),
        )

        return GitHubImportResponse(
            repo_id=repo_id,
            owner=owner,
            repo=repo,
            commit_sha=commit_sha,
            default_branch=default_branch,
            file_count=file_count,
            metadata=metadata,
            extracted_path=str(dest_dir),
        )

    def get_repository_info(self, url: str) -> GitHubRepoInfo:
        """Fetch trusted repository metadata before importing or extracting."""
        owner, repo = validate_github_url(url)
        repo_details = self.client.get_repo_details(owner, repo)
        lang = repo_details.get("language")
        lang_str = str(lang).strip().lower() if lang else ""
        is_python = bool(lang_str == "python")
        is_supported = bool(lang_str in SUPPORTED_PRIMARY_LANGUAGES) if lang else True

        return GitHubRepoInfo(
            owner=owner,
            repo=repo,
            full_name=repo_details.get("full_name") or f"{owner}/{repo}",
            description=repo_details.get("description"),
            html_url=repo_details.get("html_url") or f"https://github.com/{owner}/{repo}",
            default_branch=repo_details.get("default_branch") or "main",
            visibility="public",
            language=lang,
            is_python=is_python,
            is_supported=is_supported,
            stars=repo_details.get("stargazers_count", 0),
            forks=repo_details.get("forks_count", 0),
        )


_DEFAULT_GITHUB_SERVICE: GitHubService | None = None


def get_github_service() -> GitHubService:
    """Dependency provider returning singleton GitHubService instance."""
    global _DEFAULT_GITHUB_SERVICE
    if _DEFAULT_GITHUB_SERVICE is None:
        _DEFAULT_GITHUB_SERVICE = GitHubService()
    return _DEFAULT_GITHUB_SERVICE
