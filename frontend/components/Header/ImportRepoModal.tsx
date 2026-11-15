"use client";

import React, { useState } from "react";
import {
  X,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { importGithubRepo } from "../../lib/api";
import { GithubImportResponse } from "../../lib/types";
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

  // Validate GitHub URL
  const isValidUrl =
    /^(https?:\/\/)?(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?\/?$/.test(
      url.trim(),
    );

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
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Failed to import repository. Please check URL and try again.",
      );
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
            Ingest and index any public GitHub repository (Python, TypeScript,
            JavaScript, JSX, TSX). Unfog parses the AST, extracts React
            components, functions, classes, and dependencies, and creates a
            verified codebase map without ever executing repository code.
          </p>

          <div className={styles.formGroup}>
            <label className={styles.label}>GitHub Repository URL</label>
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
                https://github.com/pallets/click or
                https://github.com/owner/repo)
              </span>
            )}
          </div>

          {errorMsg && (
            <div className={styles.errorBanner}>
              <AlertCircle size={16} className={styles.errorIcon} />
              <span>{errorMsg}</span>
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
              Zero-execution sandbox: Read-only AST analysis (Python,
              TypeScript, JavaScript, JSX, TSX) with strict size limits.
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
