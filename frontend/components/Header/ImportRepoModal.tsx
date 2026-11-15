"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { importGithubRepo, fetchGithubRepoInfo } from "../../lib/api";
import { GithubImportResponse, GitHubRepoInfo } from "../../lib/types";
import styles from "./ImportRepoModal.module.css";

interface ImportRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (repo: GithubImportResponse) => void;
}

const STAGES = [
  "Connecting to GitHub",
  "Fetching Source",
  "Parsing Code",
  "Building Map",
  "Ready",
];

export function ImportRepoModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportRepoModalProps) {
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [repoInfo, setRepoInfo] = useState<GitHubRepoInfo | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);

  // Validate GitHub URL
  const isValidUrl =
    /^(https?:\/\/)?(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?\/?$/.test(
      url.trim(),
    );

  // Fetch trusted GitHub repository metadata before analysis
  useEffect(() => {
    if (!isOpen || !isValidUrl) {
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      setIsLoadingInfo(true);
      try {
        const info = await fetchGithubRepoInfo(url.trim());
        if (isMounted) {
          setRepoInfo(info);
        }
      } catch {
        if (isMounted) setRepoInfo(null);
      } finally {
        if (isMounted) setIsLoadingInfo(false);
      }
    }, 350);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [url, isValidUrl, isOpen]);

  // Derived metadata preview only shown for valid URLs
  const activeRepoInfo = isValidUrl ? repoInfo : null;
  const activeIsLoadingInfo = isValidUrl ? isLoadingInfo : false;

  const handleTryExample = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setUrl("https://github.com/pallets/click");
    setTouched(true);
    setErrorMsg(null);
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!isValidUrl || isLoading) return;

    setIsLoading(true);
    setErrorMsg(null);
    setCurrentStageIndex(0);

    // Staged progression timer to show authentic stage feedback
    const stageInterval = setInterval(() => {
      setCurrentStageIndex((prev) => {
        if (prev < 3) return prev + 1;
        return prev;
      });
    }, 800);

    try {
      const response = await importGithubRepo(url.trim());
      clearInterval(stageInterval);
      setCurrentStageIndex(4); // Ready

      setTimeout(() => {
        onSuccess(response);
        onClose();
      }, 500);
    } catch (err) {
      clearInterval(stageInterval);
      setIsLoading(false);
      let message =
        err instanceof Error
          ? err.message
          : "Failed to import repository. Please check URL and try again.";

      // Safely extract message from serialized error JSON if present
      if (typeof message === "string" && message.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(message);
          if (parsed?.error?.message) {
            message = parsed.error.message;
          } else if (parsed?.message) {
            message = parsed.message;
          } else if (typeof parsed?.detail === "string") {
            message = parsed.detail;
          }
        } catch {
          // Keep message as is
        }
      }

      if (
        message.includes("Python source files") ||
        message.includes("supported Python files")
      ) {
        message =
          "This repository doesn't contain supported Python files. Unfog currently supports Python repositories.";
      }

      setErrorMsg(message);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <GitBranch size={20} className={styles.headerIcon} />
            <span>Import Public GitHub Repository</span>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={isLoading}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className={styles.body}>
          <p className={styles.description}>
            Ingest and index any public GitHub Python repository. Unfog parses
            the AST, extracts dependencies and functions, and creates a verified
            codebase map without ever executing repository code.
          </p>

          <div className={styles.formGroup}>
            <div className={styles.labelRow}>
              <label className={styles.label}>GitHub Repository URL</label>
              <button
                type="button"
                className={styles.tryExampleBtn}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleTryExample(e);
                }}
                onClick={handleTryExample}
                disabled={isLoading}
              >
                Try Example (pallets/click)
              </button>
            </div>
            <div
              className={`${styles.inputWrapper} ${
                touched && !isValidUrl ? styles.invalid : ""
              }`}
            >
              <GitBranch size={16} className={styles.inputIcon} />
              <input
                type="text"
                className={styles.input}
                placeholder="https://github.com/owner/repository"
                value={url}
                disabled={isLoading}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                onBlur={() => setTouched(true)}
                autoFocus
              />
            </div>
            {touched && !isValidUrl && (
              <span className={styles.validationMsg}>
                Must be a valid GitHub URL (e.g.
                https://github.com/pallets/click)
              </span>
            )}
          </div>

          {/* Trusted GitHub Metadata Preview before analysis */}
          {activeIsLoadingInfo && (
            <div className={styles.repoInfoLoading}>
              <span className={styles.repoInfoSpinner} />
              <span>Fetching repository metadata...</span>
            </div>
          )}
          {!activeIsLoadingInfo && activeRepoInfo && (
            <div className={styles.repoPreview}>
              <div className={styles.repoPreviewHeader}>
                <span className={styles.repoFullName}>
                  {activeRepoInfo.full_name}
                </span>
                {activeRepoInfo.language ? (
                  <span
                    className={`${styles.languageBadge} ${
                      activeRepoInfo.is_python
                        ? styles.languageBadgePython
                        : styles.languageBadgeOther
                    }`}
                  >
                    {activeRepoInfo.language}
                  </span>
                ) : (
                  <span
                    className={`${styles.languageBadge} ${styles.languageBadgeOther}`}
                  >
                    Unknown
                  </span>
                )}
              </div>
              {activeRepoInfo.description && (
                <p className={styles.repoDescription}>
                  {activeRepoInfo.description}
                </p>
              )}
              {!activeRepoInfo.is_python && activeRepoInfo.language && (
                <div className={styles.languageNotice}>
                  GitHub reports primary language as{" "}
                  <strong>{activeRepoInfo.language}</strong>. Unfog currently
                  supports Python repositories.
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className={styles.errorBanner}>
              <AlertCircle size={16} className={styles.errorIcon} />
              <div className={styles.errorBody}>
                <span className={styles.errorText}>{errorMsg}</span>
                <button
                  type="button"
                  className={styles.errorTryExampleBtn}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleTryExample(e);
                  }}
                  onClick={handleTryExample}
                  disabled={isLoading}
                >
                  Try Example Repository (pallets/click)
                </button>
              </div>
            </div>
          )}

          {isLoading && (
            <div className={styles.stagesContainer}>
              <span className={styles.stagesHeader}>Ingestion Progress</span>
              <div className={styles.stageList}>
                {STAGES.map((stageName, idx) => {
                  const isCompleted = idx < currentStageIndex;
                  const isActive = idx === currentStageIndex;

                  return (
                    <div
                      key={stageName}
                      className={`${styles.stageItem} ${
                        isActive
                          ? styles.active
                          : isCompleted
                            ? styles.completed
                            : ""
                      }`}
                    >
                      {isActive ? (
                        <div className={styles.stageSpinner} />
                      ) : isCompleted ? (
                        <CheckCircle2
                          size={14}
                          style={{ color: "var(--color-accent-teal)" }}
                        />
                      ) : (
                        <div className={styles.stageCircle} />
                      )}
                      <span>{stageName}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className={styles.securityNote}>
            <ShieldCheck
              size={13}
              style={{ color: "var(--color-accent-teal)" }}
            />
            <span>
              Zero-execution sandbox: Read-only AST analysis with tarball size
              &amp; traversal limits.
            </span>
          </div>

          {/* Modal Footer */}
          <div
            className={styles.footer}
            style={{ margin: "0 -1.5rem -1.5rem" }}
          >
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={!url.trim() || !isValidUrl || isLoading}
            >
              <Sparkles size={14} />
              <span>{isLoading ? "Analyzing..." : "Analyze Repository"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
