"""Archive security and safe extraction for repository tarballs."""

from __future__ import annotations

import io
import os
import re
import shutil
import tarfile
from pathlib import Path, PurePosixPath
from typing import BinaryIO
from uuid import UUID

from app.core.errors import ApplicationError, ErrorCode

MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024  # 100 MB
MAX_FILE_BYTES = 1 * 1024 * 1024  # 1 MB
MAX_FILE_COUNT = 1000
MAX_ARCHIVE_MEMBERS = 10000
DEFAULT_SANDBOX_BASE = Path("/tmp/unfog_repos")

IGNORED_DIR_NAMES = frozenset(
    {
        ".git",
        ".github",
        "venv",
        ".venv",
        "env",
        ".env",
        "node_modules",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        ".cache",
        ".tox",
        ".coverage",
        "htmlcov",
        "build",
        "dist",
        "site-packages",
    }
)

CREDENTIAL_EXTENSIONS = frozenset(
    {
        ".pem",
        ".key",
        ".cert",
        ".crt",
        ".pfx",
        ".p12",
        ".keystore",
    }
)

CREDENTIAL_FILENAMES = frozenset(
    {
        "id_rsa",
        "id_ed25519",
        "id_ecdsa",
        "id_dsa",
    }
)

CREDENTIAL_KEYWORD_PATTERN = re.compile(
    r"(?:^|[._-])(credential|secret|password|api[_-]?key|private[_-]?key)(?:[._-]|$)",
    re.IGNORECASE,
)


def should_ignore_path(relative_path: PurePosixPath) -> bool:
    """Determine whether an archive entry should be ignored."""
    # 1. Directory component checks
    for part in relative_path.parts[:-1]:
        part_lower = part.lower()
        if part.startswith("."):
            return True
        if part_lower in IGNORED_DIR_NAMES:
            return True
        if part_lower.endswith(".egg-info") or part_lower.endswith(".dist-info"):
            return True

    # 2. File name checks
    filename = relative_path.name
    filename_lower = filename.lower()

    # Dotfiles (.env, .gitignore, etc.)
    if filename.startswith("."):
        return True

    # Credentials by extension or exact name
    suffix = relative_path.suffix.lower()
    if suffix in CREDENTIAL_EXTENSIONS:
        return True
    if filename_lower in CREDENTIAL_FILENAMES:
        return True
    if filename_lower.startswith(".env"):
        return True
    if CREDENTIAL_KEYWORD_PATTERN.search(filename):
        return True

    # Non-Python files: only .py files are retained
    if suffix != ".py":
        return True

    return False


def extract_tarball_safely(
    archive_data: BinaryIO | io.BytesIO,
    repo_id: UUID,
    sandbox_base: Path = DEFAULT_SANDBOX_BASE,
) -> tuple[Path, int]:
    """Safely extracts a repository tarball into a sandboxed directory.

    Enforces:
      - Zip-slip and path traversal protection (rejects .., absolute paths, escaping paths)
      - Symlink and hardlink rejection
      - Size bounds (max 1MB per file, max 100MB uncompressed total, max 1000 files)
      - Ignores .git, .github, venvs, node_modules, dotfiles, credentials, non-python files
      - Fails with HTTP 422 if no Python files are extracted
      - Cleans up sandbox directory immediately on failure

    Returns:
      (sandbox_dir, extracted_file_count)

    Raises:
      ApplicationError: HTTP 400 on unsafe archives, 413 on size overflow, 422 on 0 py files.
    """
    dest_dir = (sandbox_base / str(repo_id)).resolve()
    dest_dir.mkdir(parents=True, exist_ok=True, mode=0o700)

    try:
        try:
            tar = tarfile.open(fileobj=archive_data, mode="r:*")
        except Exception as exc:
            raise ApplicationError(
                code=ErrorCode.INVALID_REQUEST,
                message="Failed to parse repository archive as a valid tarball.",
                status_code=400,
            ) from exc

        with tar:
            members = tar.getmembers()
            if len(members) > MAX_ARCHIVE_MEMBERS:
                raise ApplicationError(
                    code=ErrorCode.INVALID_REQUEST,
                    message="Archive contains too many entries (exceeds member limit).",
                    status_code=413,
                )

            # Determine common root prefix (standard GitHub tarball `{owner}-{repo}-{sha}/`)
            common_root: str | None = None
            if members:
                first_parts = PurePosixPath(members[0].name.replace("\\", "/")).parts
                if first_parts and not first_parts[0].endswith(".py"):
                    candidate = first_parts[0]
                    if any(
                        len(PurePosixPath(m.name.replace("\\", "/")).parts) > 1 for m in members
                    ) and all(
                        PurePosixPath(m.name.replace("\\", "/")).parts[0] == candidate
                        for m in members
                        if PurePosixPath(m.name.replace("\\", "/")).parts
                    ):
                        common_root = candidate

            total_uncompressed_bytes = 0
            extracted_file_count = 0

            for member in members:
                raw_name = member.name.replace("\\", "/")

                # Security: Reject null bytes
                if "\x00" in raw_name:
                    raise ApplicationError(
                        code=ErrorCode.FORBIDDEN,
                        message="Archive contains invalid filename with null bytes.",
                        status_code=400,
                    )

                posix = PurePosixPath(raw_name)

                # Security: Reject absolute paths
                if posix.is_absolute() or raw_name.startswith("/"):
                    raise ApplicationError(
                        code=ErrorCode.FORBIDDEN,
                        message=f"Absolute paths in archive are forbidden: {raw_name}",
                        status_code=400,
                    )

                # Security: Reject path traversal segments
                if ".." in posix.parts:
                    raise ApplicationError(
                        code=ErrorCode.FORBIDDEN,
                        message=f"Path traversal entries are forbidden: {raw_name}",
                        status_code=400,
                    )

                # Security: Reject symlinks and hardlinks
                if member.issym() or member.islnk():
                    raise ApplicationError(
                        code=ErrorCode.FORBIDDEN,
                        message=f"Archive contains forbidden link entry: {raw_name}",
                        status_code=400,
                    )

                # Security: Reject device files / pipes
                if not (member.isreg() or member.isdir()):
                    raise ApplicationError(
                        code=ErrorCode.FORBIDDEN,
                        message=f"Archive contains forbidden entry type: {raw_name}",
                        status_code=400,
                    )

                # Strip common root directory if applicable
                if common_root and len(posix.parts) > 1 and posix.parts[0] == common_root:
                    rel_path = PurePosixPath(*posix.parts[1:])
                elif common_root and len(posix.parts) == 1 and posix.parts[0] == common_root:
                    continue
                else:
                    rel_path = posix

                if not rel_path.parts:
                    continue

                # Security: Verify resolved path cannot escape sandbox directory
                target_file = (dest_dir / rel_path).resolve()
                try:
                    target_file.relative_to(dest_dir)
                except ValueError as exc:
                    raise ApplicationError(
                        code=ErrorCode.FORBIDDEN,
                        message=f"Archive entry escapes sandbox directory: {raw_name}",
                        status_code=400,
                    ) from exc

                # Apply ignore filters
                if should_ignore_path(rel_path):
                    continue

                # Only regular files are extracted; directories are created on demand
                if not member.isreg():
                    continue

                # Security: Single file size check from header
                if member.size > MAX_FILE_BYTES:
                    raise ApplicationError(
                        code=ErrorCode.INVALID_REQUEST,
                        message=f"File '{rel_path}' exceeds maximum allowed size of 1MB.",
                        status_code=413,
                    )

                # Security: File count bound
                if extracted_file_count + 1 > MAX_FILE_COUNT:
                    raise ApplicationError(
                        code=ErrorCode.INVALID_REQUEST,
                        message=f"Repository exceeds file count limit ({MAX_FILE_COUNT} files).",
                        status_code=413,
                    )

                # Extract and stream file content
                target_file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                extracted_f = tar.extractfile(member)
                if extracted_f is None:
                    continue

                file_bytes_written = 0
                with open(target_file, "wb") as out_f:
                    while True:
                        chunk = extracted_f.read(16384)
                        if not chunk:
                            break
                        file_bytes_written += len(chunk)
                        total_uncompressed_bytes += len(chunk)

                        if file_bytes_written > MAX_FILE_BYTES:
                            raise ApplicationError(
                                code=ErrorCode.INVALID_REQUEST,
                                message=f"File '{rel_path}' exceeds maximum allowed size of 1MB.",
                                status_code=413,
                            )
                        if total_uncompressed_bytes > MAX_UNCOMPRESSED_BYTES:
                            raise ApplicationError(
                                code=ErrorCode.INVALID_REQUEST,
                                message="Repository exceeds uncompressed limit (100MB).",
                                status_code=413,
                            )
                        out_f.write(chunk)

                # Ensure non-executable permissions
                os.chmod(target_file, 0o600)
                extracted_file_count += 1

            # Validate that at least one Python file was extracted
            if extracted_file_count == 0:
                raise ApplicationError(
                    code=ErrorCode.INVALID_REQUEST,
                    message=(
                        "No supported Python source files found in repository. "
                        "This repository doesn't contain supported Python files. "
                        "Unfog currently supports Python repositories."
                    ),
                    status_code=422,
                )

            return dest_dir, extracted_file_count

    except Exception:
        # Clean up sandbox directory on any error to prevent orphan leaks
        shutil.rmtree(dest_dir, ignore_errors=True)
        raise
