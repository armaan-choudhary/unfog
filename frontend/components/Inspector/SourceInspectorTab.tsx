"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Copy,
  Check,
  ShieldCheck,
  Sparkles,
  FileCode,
  ExternalLink,
  Link2,
  CornerDownRight,
  CornerUpRight,
  FunctionSquare,
  Box,
  Component,
  Layers,
  AlertCircle,
  Info,
  X,
} from "lucide-react";
import { CodebaseNodeData } from "../Map/CustomNode";
import { FileDetailResponse, SymbolKind } from "../../lib/types";
import { fetchFileDetail } from "../../lib/api";
import styles from "./SourceInspectorTab.module.css";

export type RelationshipFocusDirection =
  "callers" | "dependencies" | "inbound" | "outbound";

export interface SourceInspectorTabProps {
  selectedNode: CodebaseNodeData | null;
  repoId?: string;
  onAskAi: (prompt: string, symbol: CodebaseNodeData) => void;
  onFocusRelationships?: (
    direction: RelationshipFocusDirection,
    symbolId: string,
  ) => void;
  repoOwner?: string;
  repoName?: string;
  commitSha?: string;
  isBundled?: boolean;
}

const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "default",
  "const",
  "let",
  "var",
  "function",
  "return",
  "class",
  "interface",
  "type",
  "extends",
  "implements",
  "async",
  "await",
  "def",
  "if",
  "else",
  "elif",
  "for",
  "while",
  "try",
  "except",
  "catch",
  "finally",
  "raise",
  "throw",
  "new",
  "this",
  "self",
  "True",
  "False",
  "None",
  "true",
  "false",
  "null",
  "undefined",
  "yield",
  "lambda",
  "with",
  "as",
  "in",
  "is",
  "not",
  "and",
  "or",
  "global",
  "nonlocal",
  "pass",
  "break",
  "continue",
  "public",
  "private",
  "protected",
  "static",
  "readonly",
]);

function highlightCodeLine(line: string, path: string): React.ReactNode {
  const isPython = path.endsWith(".py");
  const commentChar = isPython ? "#" : "//";

  // Check for line comments
  let codePart = line;
  let commentPart = "";
  const commentIdx = line.indexOf(commentChar);
  if (commentIdx !== -1) {
    codePart = line.substring(0, commentIdx);
    commentPart = line.substring(commentIdx);
  }

  // Tokenize codePart by strings, words, and numbers
  const tokens = codePart.split(
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b[A-Za-z_][A-Za-z0-9_]*\b|\b\d+(?:\.\d+)?\b|<\/?[A-Z][A-Za-z0-9_]*>?)/g,
  );

  return (
    <>
      {tokens.map((token, i) => {
        if (!token) return null;
        if (
          (token.startsWith('"') && token.endsWith('"')) ||
          (token.startsWith("'") && token.endsWith("'")) ||
          (token.startsWith("`") && token.endsWith("`"))
        ) {
          return (
            <span key={i} className={styles.syntaxString}>
              {token}
            </span>
          );
        }
        if (KEYWORDS.has(token)) {
          return (
            <span key={i} className={styles.syntaxKeyword}>
              {token}
            </span>
          );
        }
        if (/^\d+(\.\d+)?$/.test(token)) {
          return (
            <span key={i} className={styles.syntaxNumber}>
              {token}
            </span>
          );
        }
        if (/^<\/?[A-Z][A-Za-z0-9_]*>?$/.test(token)) {
          return (
            <span key={i} className={styles.syntaxTag}>
              {token}
            </span>
          );
        }
        return token;
      })}
      {commentPart && (
        <span className={styles.syntaxComment}>{commentPart}</span>
      )}
    </>
  );
}

function getFormattedLanguage(path: string, lang?: string): string {
  if (path.endsWith(".tsx")) return "TypeScript (TSX)";
  if (path.endsWith(".jsx")) return "JavaScript (JSX)";
  if (path.endsWith(".ts")) return "TypeScript";
  if (path.endsWith(".js")) return "JavaScript";
  if (path.endsWith(".py")) return "Python";
  if (lang) return lang.toUpperCase();
  return "Plain Text";
}

function renderSymbolIcon(kind: SymbolKind | string) {
  switch (kind) {
    case "function":
    case "method":
      return <FunctionSquare size={13} className={styles.kindIconFn} />;
    case "class":
      return <Box size={13} className={styles.kindIconClass} />;
    case "component":
      return <Component size={13} className={styles.kindIconCmp} />;
    case "interface":
      return <Layers size={13} className={styles.kindIconInterface} />;
    default:
      return <FileCode size={13} className={styles.kindIconDefault} />;
  }
}

export function SourceInspectorTab({
  selectedNode,
  repoId,
  onAskAi,
  onFocusRelationships,
  repoOwner,
  repoName,
  commitSha,
  isBundled,
}: SourceInspectorTabProps) {
  const [fileDetail, setFileDetail] = useState<FileDetailResponse | null>(null);
  const [fileLoadError, setFileLoadError] = useState<string | null>(null);
  const [userSelectedSymbolId, setUserSelectedSymbolId] = useState<
    string | null
  >(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedCitation, setCopiedCitation] = useState(false);
  const [activeFocusDirection, setActiveFocusDirection] =
    useState<RelationshipFocusDirection | null>(null);

  const codeScrollRef = useRef<HTMLDivElement>(null);

  // Fetch file details when selected path or repository changes
  useEffect(() => {
    if (!selectedNode?.path) return;

    let isCancelled = false;

    fetchFileDetail(selectedNode.path, repoId)
      .then((detail) => {
        if (!isCancelled) {
          setFileDetail(detail);
          setFileLoadError(null);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error("Failed to fetch file detail:", err);
          setFileLoadError(
            err instanceof Error ? err.message : "Failed to load source file",
          );
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedNode?.path, repoId]);

  // Ensure active file detail matches currently selected path
  const currentFileDetail =
    fileDetail && fileDetail.path === selectedNode?.path ? fileDetail : null;

  // Indexed symbols in current file sorted by line number
  const indexedSymbols = useMemo(() => {
    if (!currentFileDetail?.symbols) return [];
    return [...currentFileDetail.symbols].sort(
      (a, b) => a.range.start_line - b.range.start_line,
    );
  }, [currentFileDetail]);

  // Determine currently active symbol
  const activeSymbol = useMemo(() => {
    if (!currentFileDetail?.symbols?.length) return null;
    if (userSelectedSymbolId) {
      const userMatch = currentFileDetail.symbols.find(
        (s) => s.id === userSelectedSymbolId,
      );
      if (userMatch) return userMatch;
    }
    if (selectedNode) {
      const match = currentFileDetail.symbols.find(
        (s) => s.id === selectedNode.id || s.name === selectedNode.name,
      );
      if (match) return match;
    }
    return null;
  }, [currentFileDetail, userSelectedSymbolId, selectedNode]);

  const activeSymbolId = activeSymbol?.id || null;

  const startLine =
    activeSymbol?.range?.start_line ?? selectedNode?.range?.start_line;
  const endLine =
    activeSymbol?.range?.end_line ?? selectedNode?.range?.end_line;

  // Auto-scroll to highlighted symbol or line range
  const scrollToLine = (targetLine?: number) => {
    if (!targetLine || !codeScrollRef.current) return;
    const lineElement = codeScrollRef.current.querySelector(
      `[data-line="${targetLine}"]`,
    );
    if (lineElement) {
      lineElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  useEffect(() => {
    if (startLine) {
      scrollToLine(startLine);
    }
  }, [startLine, currentFileDetail]);

  // Handle symbol selection from the in-file outline
  const handleSelectSymbol = (symbolId: string) => {
    setUserSelectedSymbolId(symbolId || null);
    const sym = indexedSymbols.find((s) => s.id === symbolId);
    if (sym) {
      scrollToLine(sym.range.start_line);
    }
  };

  // Copy full source code handler
  const handleCopyCode = () => {
    if (!currentFileDetail?.content) return;
    navigator.clipboard.writeText(currentFileDetail.content).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  // Formatted citation (e.g. path#L<start>-L<end>)
  const formattedCitation = useMemo(() => {
    if (!selectedNode?.path) return "";
    if (startLine && endLine) {
      return `${selectedNode.path}#L${startLine}-L${endLine}`;
    }
    if (startLine) {
      return `${selectedNode.path}#L${startLine}`;
    }
    return selectedNode.path;
  }, [selectedNode?.path, startLine, endLine]);

  // Copy citation action handler
  const handleCopyCitation = () => {
    if (!formattedCitation) return;
    navigator.clipboard.writeText(formattedCitation).then(() => {
      setCopiedCitation(true);
      setTimeout(() => setCopiedCitation(false), 2000);
    });
  };

  // Resolve GitHub link or local bundled fallback
  const isBundledRepo = useMemo(() => {
    if (typeof isBundled === "boolean") return isBundled;
    if (!repoId || repoId === "sample_service" || repoId === "bundled") {
      return true;
    }
    const nodeObj = selectedNode as Record<string, unknown> | null;
    if (nodeObj?.isBundled === true) return true;
    return false;
  }, [isBundled, repoId, selectedNode]);

  const { resolvedOwner, resolvedRepo } = useMemo(() => {
    let owner = repoOwner;
    let repo = repoName;

    if (!owner && !repo && repoId && repoId.includes("/")) {
      const parts = repoId.split("/");
      owner = parts[0];
      repo = parts[1];
    } else if (!owner && !repo && repoName && repoName.includes("/")) {
      const parts = repoName.split("/");
      owner = parts[0];
      repo = parts[1];
    }

    return { resolvedOwner: owner, resolvedRepo: repo };
  }, [repoOwner, repoName, repoId]);

  const isGitHubAvailable =
    !isBundledRepo && Boolean(resolvedOwner && resolvedRepo);
  const resolvedSha =
    commitSha && commitSha !== "snapshot-v1" ? commitSha : "main";
  const cleanPath = selectedNode ? selectedNode.path.replace(/^\/+/, "") : "";
  const lineAnchor =
    startLine && endLine
      ? `#L${startLine}-L${endLine}`
      : startLine
        ? `#L${startLine}`
        : "";

  const githubUrl = isGitHubAvailable
    ? `https://github.com/${resolvedOwner}/${resolvedRepo}/blob/${resolvedSha}/${cleanPath}${lineAnchor}`
    : null;

  // Relationship focus handler for Find Callers and Find Dependencies
  const handleFocusRelationship = (direction: RelationshipFocusDirection) => {
    const targetSymbolId =
      activeSymbol?.id ||
      (selectedNode &&
      selectedNode.kind !== "file" &&
      selectedNode.kind !== "group"
        ? selectedNode.id
        : "");

    if (!targetSymbolId && indexedSymbols.length > 0) {
      const firstSym = indexedSymbols[0];
      setUserSelectedSymbolId(firstSym.id);
      setActiveFocusDirection(direction);
      onFocusRelationships?.(direction, firstSym.id);
      return;
    }

    if (activeFocusDirection === direction) {
      // Toggle off
      setActiveFocusDirection(null);
      onFocusRelationships?.(
        direction === "callers" ? "inbound" : "outbound",
        "",
      );
    } else {
      setActiveFocusDirection(direction);
      onFocusRelationships?.(
        direction,
        targetSymbolId || selectedNode?.id || "",
      );
    }
  };

  // Empty state: no node selected
  if (!selectedNode) {
    return (
      <div className={styles.emptyState}>
        <FileCode size={44} className={styles.emptyIcon} />
        <h3 className={styles.emptyTitle}>No Node Selected</h3>
        <p className={styles.emptyDescription}>
          Click any file, function, class, or React component on the codebase
          map to inspect its source code, AST symbol outline, and verified
          citations.
        </p>
        <div className={styles.emptyHints}>
          <div className={styles.hintItem}>
            <span className={styles.hintKey}>L1 Groups:</span>
            <span>Inspect architecture layers and package directories</span>
          </div>
          <div className={styles.hintItem}>
            <span className={styles.hintKey}>L2 Files:</span>
            <span>View full source, symbol outlines, and line citations</span>
          </div>
          <div className={styles.hintItem}>
            <span className={styles.hintKey}>L3 Symbols:</span>
            <span>
              Explore definitions, trace callers, and find dependencies
            </span>
          </div>
        </div>
      </div>
    );
  }

  const isLoading = Boolean(
    selectedNode?.path &&
    (!currentFileDetail || currentFileDetail.path !== selectedNode.path) &&
    !fileLoadError,
  );
  const lines = currentFileDetail?.content.split("\n") || [];
  const displayLang = getFormattedLanguage(
    selectedNode.path,
    currentFileDetail?.language,
  );

  const displaySymbolName = activeSymbol?.name || selectedNode.name;
  const displaySymbolKind = activeSymbol?.kind || selectedNode.kind;

  return (
    <div className={styles.container}>
      {/* Symbol / File Header */}
      <div className={styles.symbolHeader}>
        <div className={styles.titleRow}>
          <div className={styles.titleWithIcon}>
            {renderSymbolIcon(displaySymbolKind)}
            <span className={styles.symbolName}>{displaySymbolName}</span>
          </div>
          <div className={styles.provenanceBadge} title="Verified AST evidence">
            <ShieldCheck size={12} />
            <span>static_verified</span>
          </div>
        </div>

        {/* Metadata Grid */}
        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>File Path</span>
            <span className={styles.metaValue} title={selectedNode.path}>
              {selectedNode.path}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Symbol Kind</span>
            <span className={styles.metaValue}>{displaySymbolKind}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Line Range</span>
            <span className={styles.metaValue}>
              {startLine && endLine
                ? `L${startLine} – L${endLine}`
                : startLine
                  ? `L${startLine}`
                  : "Full File"}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Citation</span>
            <span
              className={`${styles.metaValue} ${styles.citationPreview}`}
              title={formattedCitation}
            >
              {formattedCitation}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Language</span>
            <span className={styles.metaValue}>{displayLang}</span>
          </div>
        </div>

        {/* Action Row: Find Callers, Find Dependencies, Copy Citation, Open in GitHub, Ask AI */}
        <div className={styles.actionRow}>
          {/* Find Callers */}
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.callersBtn} ${
              activeFocusDirection === "callers" ? styles.activeTealBtn : ""
            }`}
            onClick={() => handleFocusRelationship("callers")}
            title="Highlight incoming calls/references to this symbol on the codebase map"
          >
            <CornerDownRight size={13} />
            <span>
              {activeFocusDirection === "callers"
                ? "Focusing Callers"
                : "Find Callers"}
            </span>
          </button>

          {/* Find Dependencies */}
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.depsBtn} ${
              activeFocusDirection === "dependencies"
                ? styles.activeVioletBtn
                : ""
            }`}
            onClick={() => handleFocusRelationship("dependencies")}
            title="Highlight outgoing dependencies referenced by this symbol on the codebase map"
          >
            <CornerUpRight size={13} />
            <span>
              {activeFocusDirection === "dependencies"
                ? "Focusing Dependencies"
                : "Find Dependencies"}
            </span>
          </button>

          {/* Copy Citation */}
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.citationBtn}`}
            onClick={handleCopyCitation}
            title={`Copy formatted citation (${formattedCitation})`}
          >
            {copiedCitation ? <Check size={13} /> : <Link2 size={13} />}
            <span>{copiedCitation ? "Citation Copied!" : "Copy Citation"}</span>
          </button>

          {/* Open in GitHub / Bundled Local Fallback */}
          {isGitHubAvailable && githubUrl ? (
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.actionBtn} ${styles.githubBtn}`}
              title={`Open ${cleanPath}${lineAnchor} in GitHub (${resolvedOwner}/${resolvedRepo})`}
            >
              <ExternalLink size={13} />
              <span>Open in GitHub</span>
            </a>
          ) : (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.githubBtn} ${styles.disabledBtn}`}
              disabled
              title={
                isBundledRepo
                  ? "Local bundled repository (sample_service) - GitHub link unavailable for local fixtures"
                  : "GitHub link unavailable: repository owner or URL not resolved"
              }
            >
              <ExternalLink size={13} />
              <span>Bundled Local Repo</span>
            </button>
          )}

          {/* Ask AI */}
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.askAiBtn}`}
            onClick={() =>
              onAskAi(
                `Explain the purpose, structure, and behavior of ${displaySymbolName} in ${selectedNode.path}.`,
                activeSymbol
                  ? {
                      ...selectedNode,
                      id: activeSymbol.id,
                      name: activeSymbol.name,
                      kind: activeSymbol.kind,
                      range: activeSymbol.range,
                    }
                  : selectedNode,
              )
            }
            title="Ask AI Companion to explain this symbol"
          >
            <Sparkles size={13} />
            <span>Explain with AI</span>
          </button>
        </div>

        {/* Relationship Focus Status Banner */}
        {activeFocusDirection && (
          <div className={styles.focusStatusBanner}>
            <Info size={13} />
            <span>
              Focusing verified <strong>{activeFocusDirection}</strong> for{" "}
              <code>{displaySymbolName}</code> in the codebase graph.
            </span>
            <button
              type="button"
              className={styles.clearFocusBtn}
              onClick={() => {
                setActiveFocusDirection(null);
                onFocusRelationships?.(
                  activeFocusDirection === "callers" ? "inbound" : "outbound",
                  "",
                );
              }}
              title="Clear relationship focus"
            >
              <X size={12} />
              <span>Clear</span>
            </button>
          </div>
        )}
      </div>

      {/* File Load Error Notice */}
      {fileLoadError && (
        <div className={styles.errorBanner}>
          <AlertCircle size={16} className={styles.errorIcon} />
          <div className={styles.errorContent}>
            <strong>Source File Unavailable:</strong>
            <p>
              Could not load source code for <code>{selectedNode.path}</code>:{" "}
              {fileLoadError}.
            </p>
            <span className={styles.errorSubtext}>
              This file may not be present in the active snapshot or was
              excluded from static analysis.
            </span>
          </div>
        </div>
      )}

      {/* In-File Symbol Outline (Sticky navigation header) */}
      <div className={styles.symbolOutline}>
        <div className={styles.outlineHeader}>
          <div className={styles.outlineTitleGroup}>
            <Layers size={13} className={styles.outlineIcon} />
            <span className={styles.outlineTitle}>In-file Symbol Outline</span>
            <span className={styles.symbolCountBadge}>
              {indexedSymbols.length}
            </span>
          </div>

          {/* Jump-to-symbol dropdown selector */}
          {indexedSymbols.length > 0 && (
            <select
              className={styles.outlineSelect}
              value={activeSymbolId || ""}
              onChange={(e) => handleSelectSymbol(e.target.value)}
              title="Select a symbol in this file to scroll to its line range"
            >
              <option value="">
                -- Jump to symbol ({indexedSymbols.length}) --
              </option>
              {indexedSymbols.map((sym) => (
                <option key={sym.id} value={sym.id}>
                  {sym.name} ({sym.kind}, L{sym.range.start_line}–
                  {sym.range.end_line})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Horizontal scrollable outline chips */}
        {indexedSymbols.length > 0 ? (
          <div className={styles.outlineChipList}>
            {indexedSymbols.map((sym) => {
              const isActive = sym.id === activeSymbolId;
              return (
                <button
                  key={sym.id}
                  type="button"
                  className={`${styles.outlineItem} ${
                    isActive ? styles.outlineItemActive : ""
                  }`}
                  onClick={() => handleSelectSymbol(sym.id)}
                  title={`Jump to ${sym.kind} ${sym.name} (L${sym.range.start_line}–L${sym.range.end_line})`}
                >
                  {renderSymbolIcon(sym.kind)}
                  <span className={styles.outlineItemName}>{sym.name}</span>
                  <span className={styles.outlineItemRange}>
                    L{sym.range.start_line}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className={styles.noSymbolsNote}>
            No indexed functions, classes, or components in this file.
          </div>
        )}
      </div>

      {/* Code Viewer with Syntax Highlighting and Line Numbers */}
      <div className={styles.codeViewerContainer}>
        <div className={styles.codeViewerHeader}>
          <span className={styles.filePathLabel}>
            {selectedNode.path}{" "}
            {currentFileDetail?.line_count
              ? `(${currentFileDetail.line_count} lines)`
              : ""}
          </span>
          <button
            type="button"
            className={styles.copyCodeBtn}
            onClick={handleCopyCode}
            title="Copy full source code to clipboard"
          >
            {copiedCode ? <Check size={12} /> : <Copy size={12} />}
            <span>{copiedCode ? "Copied" : "Copy Code"}</span>
          </button>
        </div>

        <div className={styles.codeScroll} ref={codeScrollRef}>
          {isLoading ? (
            <div className={styles.loadingMessage}>Loading source file...</div>
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
                  <span className={styles.lineText}>
                    {highlightCodeLine(lineText, selectedNode.path)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
