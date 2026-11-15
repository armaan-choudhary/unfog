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
  "Connecting to GitHub API...",
  "Fetching repository archive...",
  "Parsing AST & dependencies...",
  "Building codebase map...",
  "Ready to explore!",
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
    /^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(\/)?$/.test(
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
    if (!isValidUrl || isLoading) return;

    setIsLoading(true);
    setErrorMsg(null);
    setCurrentStageIndex(0);

    // Simulate genuine backend progress ticks for authentic UX
    const stageInterval = setInterval(() => {
      setCurrentStageIndex((prev) => {
        if (prev < STAGES.length - 2) return prev + 1;
        return prev;
      });
    }, 600);

    try {
      const response = await importGithubRepo(url.trim());
      clearInterval(stageInterval);
      setCurrentStageIndex(STAGES.length - 1);

      // Brief delay so user sees "Ready" state
      setTimeout(() => {
        setIsLoading(false);
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

      setErrorMsg(message);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <GitBranch className={styles.titleIcon} size={20} />
            <h2 className={styles.title}>Import Public GitHub Repository</h2>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close dialog"
            disabled={isLoading}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className={styles.body}>
          <p className={styles.description}>
            Ingest and index any public GitHub repository (Python, TypeScript,
            JavaScript, JSX, TSX). Unfog parses the AST, extracts React
            components, functions, classes, and dependencies, and creates a
            verified codebase map without ever executing repository code.
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
              <GitBranch className={styles.inputIcon} size={16} />
              <input
                type="url"
                className={styles.input}
                placeholder="https://github.com/owner/repository"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setErrorMsg(null);
                }}
                onBlur={() => setTouched(true)}
                disabled={isLoading}
                autoFocus
              />
            </div>
            {touched && !isValidUrl && (
              <span className={styles.validationMsg}>
                Must be a valid GitHub URL (e.g.
                https://github.com/pallets/click or
                https://github.com/owner/repo)
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
                      activeRepoInfo.is_supported !== false
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
              {activeRepoInfo.is_supported === false &&
                activeRepoInfo.language && (
                  <div className={styles.languageNotice}>
                    GitHub reports primary language as{" "}
                    <strong>{activeRepoInfo.language}</strong>. Unfog currently
                    supports Python, TypeScript, JavaScript, JSX, and TSX.
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

          {/* Authentic Stage Progress Pipeline */}
          {isLoading && (
            <div className={styles.stagesContainer}>
              {STAGES.map((stage, idx) => {
                const isComplete = idx < currentStageIndex;
                const isCurrent = idx === currentStageIndex;

                return (
                  <div
                    key={stage}
                    className={`${styles.stageItem} ${
                      isComplete
                        ? styles.complete
                        : isCurrent
                          ? styles.current
                          : styles.pending
                    }`}
                  >
                    {isComplete ? (
                      <CheckCircle2
                        size={16}
                        className={styles.stageIconDone}
                      />
                    ) : isCurrent ? (
                      <span className={styles.spinner} />
                    ) : (
                      <span className={styles.stageDot} />
                    )}
                    <span className={styles.stageLabel}>{stage}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sandbox & Security Trust Notice */}
          <div className={styles.securityNotice}>
            <ShieldCheck
              size={14}
              style={{ color: "var(--color-accent-teal)" }}
            />
            <span>
              Zero-execution sandbox: Read-only AST analysis (Python,
              TypeScript, JavaScript, JSX, TSX) with strict size limits.
            </span>
          </div>

          {/* Modal Actions */}
          <div className={styles.actions}>
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
              disabled={!isValidUrl || isLoading}
            >
              {isLoading ? (
                <>
                  <span className={styles.spinner} />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Analyze Repository</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
