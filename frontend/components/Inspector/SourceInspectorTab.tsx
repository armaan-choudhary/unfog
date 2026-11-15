"use client";

import React, { useState, useEffect, useRef } from "react";
import { Copy, Check, ShieldCheck, Sparkles, FileCode } from "lucide-react";
import { CodebaseNodeData } from "../Map/CustomNode";
import { FileDetailResponse } from "../../lib/types";
import { fetchFileDetail } from "../../lib/api";
import styles from "./SourceInspectorTab.module.css";

interface SourceInspectorTabProps {
  selectedNode: CodebaseNodeData | null;
  onAskAi: (prompt: string, symbol: CodebaseNodeData) => void;
}

export function SourceInspectorTab({
  selectedNode,
  onAskAi,
}: SourceInspectorTabProps) {
  const [fileDetail, setFileDetail] = useState<FileDetailResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const codeScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedNode?.path) return;
    let isCancelled = false;

    fetchFileDetail(selectedNode.path)
      .then((detail) => {
        if (!isCancelled) {
          setFileDetail(detail);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch file detail:", err);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedNode?.path]);

  // Auto-scroll to highlighted symbol or line range
  const startLine = selectedNode?.range?.start_line;
  const endLine = selectedNode?.range?.end_line;

  useEffect(() => {
    if (!startLine || !codeScrollRef.current) return;
    const lineElement = codeScrollRef.current.querySelector(
      `[data-line="${startLine}"]`,
    );
    if (lineElement) {
      lineElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [fileDetail, startLine]);

  const handleCopy = () => {
    if (!fileDetail?.content) return;
    navigator.clipboard.writeText(fileDetail.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!selectedNode) {
    return (
      <div className={styles.emptyState}>
        <FileCode size={40} className={styles.emptyIcon} />
        <h3>No Node Selected</h3>
        <p>
          Click any file, function, or class on the codebase map to inspect its
          source code and static analysis evidence.
        </p>
      </div>
    );
  }

  const isLoading = Boolean(
    selectedNode?.path &&
    (!fileDetail || fileDetail.path !== selectedNode.path),
  );
  const lines = fileDetail?.content.split("\n") || [];

  return (
    <div className={styles.container}>
      {/* Symbol / File Header */}
      <div className={styles.symbolHeader}>
        <div className={styles.titleRow}>
          <span className={styles.symbolName}>{selectedNode.name}</span>
          <div className={styles.provenanceBadge}>
            <ShieldCheck size={12} />
            <span>static_verified</span>
          </div>
        </div>

        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>File Path</span>
            <span className={styles.metaValue}>{selectedNode.path}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Symbol Kind</span>
            <span className={styles.metaValue}>{selectedNode.kind}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Line Range</span>
            <span className={styles.metaValue}>
              {startLine && endLine
                ? `L${startLine} – L${endLine}`
                : "Full File"}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Language</span>
            <span className={styles.metaValue}>
              {fileDetail?.language || "python"}
            </span>
          </div>
        </div>

        <div className={styles.aiActionRow}>
          <button
            type="button"
            className={styles.askAiBtn}
            onClick={() =>
              onAskAi(
                `Explain the purpose, arguments, and behavior of ${selectedNode.name} in ${selectedNode.path}.`,
                selectedNode,
              )
            }
          >
            <Sparkles size={14} />
            <span>Explain with AI</span>
          </button>
        </div>
      </div>

      {/* Code Viewer */}
      <div className={styles.codeViewerContainer}>
        <div className={styles.codeViewerHeader}>
          <span>
            {selectedNode.path}{" "}
            {fileDetail?.line_count ? `(${fileDetail.line_count} lines)` : ""}
          </span>
          <button
            type="button"
            className={styles.copyBtn}
            onClick={handleCopy}
            title="Copy code"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>

        <div ref={codeScrollRef} className={styles.codeScroll}>
          {isLoading ? (
            <div
              style={{ padding: "2rem", textAlign: "center", color: "#888" }}
            >
              Loading source file...
            </div>
          ) : (
            lines.map((lineText, idx) => {
              const lineNum = idx + 1;
              const isHighlighted =
                startLine !== undefined &&
                endLine !== undefined &&
                lineNum >= startLine &&
                lineNum <= endLine;

              return (
                <div
                  key={lineNum}
                  data-line={lineNum}
                  className={`${styles.codeLine} ${
                    isHighlighted ? styles.highlightedLine : ""
                  }`}
                >
                  <span className={styles.lineNumber}>{lineNum}</span>
                  <span className={styles.lineText}>{lineText}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
