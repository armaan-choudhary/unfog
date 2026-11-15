"use client";

import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import {
  FileCode,
  FunctionSquare,
  ShieldCheck,
  Box,
  Component,
  FolderTree,
  ArrowRight,
} from "lucide-react";
import { SymbolKind } from "../../lib/types";
import styles from "./CustomNode.module.css";

export interface CodebaseNodeData extends Record<string, unknown> {
  id: string;
  name: string;
  kind: "file" | "group" | SymbolKind;
  path: string;
  language?: string;
  qualifiedName?: string;
  range?: { start_line: number; end_line: number };
  lineCount?: number;
  symbolCount?: number;
  fileCount?: number;
  docstring?: string;
  isHighlighted?: boolean;
  previewFiles?: Array<{ name: string; path: string; language: string }>;
  previewSymbols?: Array<{ id: string; name: string; kind: SymbolKind }>;
  onExplore?: () => void;
}

function getLanguageLabel(path: string, lang?: string): string {
  if (lang) {
    if (lang === "typescript") return path.endsWith(".tsx") ? "TSX" : "TS";
    if (lang === "javascript") return path.endsWith(".jsx") ? "JSX" : "JS";
    if (lang === "python") return "PY";
    return lang.slice(0, 3).toUpperCase();
  }
  if (path.endsWith(".tsx")) return "TSX";
  if (path.endsWith(".jsx")) return "JSX";
  if (path.endsWith(".ts")) return "TS";
  if (path.endsWith(".js")) return "JS";
  if (path.endsWith(".py")) return "PY";
  return "";
}

/**
 * L1 Architecture Group Node.
 */
export function GroupNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CodebaseNodeData;

  return (
    <div
      className={`${styles.groupContainer} ${selected ? styles.selected : ""} ${
        nodeData.isHighlighted ? styles.highlighted : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className={styles.handle} />

      <div className={styles.nodeHeader}>
        <div className={styles.badgeGroup}>
          <span className={`${styles.kindBadge} ${styles.kindGroup}`}>
            DIRECTORY
          </span>
          <span className={styles.langBadge}>{nodeData.fileCount} files</span>
        </div>
        <span className={styles.rangeBadge}>
          {nodeData.symbolCount} symbols
        </span>
      </div>

      <div className={styles.nodeTitle}>
        <FolderTree size={18} className={styles.groupIcon} />
        <span>{nodeData.name}</span>
      </div>

      <div className={styles.nodeSubtext}>{nodeData.path}</div>

      {nodeData.previewFiles && nodeData.previewFiles.length > 0 && (
        <div className={styles.previewGrid}>
          {nodeData.previewFiles.map((pf) => (
            <span key={pf.path} className={styles.previewPill} title={pf.path}>
              {pf.name}
            </span>
          ))}
        </div>
      )}

      {nodeData.onExplore && (
        <button
          type="button"
          className={styles.exploreBtn}
          onClick={(e) => {
            e.stopPropagation();
            nodeData.onExplore?.();
          }}
        >
          <span>Explore Group</span>
          <ArrowRight size={13} />
        </button>
      )}

      <div className={styles.nodeFooter}>
        <div className={styles.provenanceBadge}>
          <ShieldCheck size={12} />
          <span>static_verified</span>
        </div>
        <span className={styles.statsText}>
          {nodeData.fileCount} files · {nodeData.symbolCount} symbols
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className={styles.handle}
      />
    </div>
  );
}

/**
 * L2 File Summary Node with preview symbols.
 */
export function FileSummaryNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CodebaseNodeData;
  const langLabel = getLanguageLabel(nodeData.path, nodeData.language);

  return (
    <div
      className={`${styles.fileSummaryContainer} ${selected ? styles.selected : ""} ${
        nodeData.isHighlighted ? styles.highlighted : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className={styles.handle} />

      <div className={styles.nodeHeader}>
        <div className={styles.badgeGroup}>
          <span className={`${styles.kindBadge} ${styles.kindFile}`}>
            MODULE
          </span>
          {langLabel && <span className={styles.langBadge}>{langLabel}</span>}
        </div>
        <span className={styles.rangeBadge}>{nodeData.lineCount} lines</span>
      </div>

      <div className={styles.nodeTitle}>
        <FileCode size={16} className={styles.fileIcon} />
        <span>{nodeData.name}</span>
      </div>

      <div className={styles.nodeSubtext}>{nodeData.path}</div>

      {nodeData.previewSymbols && nodeData.previewSymbols.length > 0 && (
        <div className={styles.previewGrid}>
          {nodeData.previewSymbols.map((ps) => (
            <span key={ps.id} className={styles.previewPill} title={ps.name}>
              {ps.name}
            </span>
          ))}
        </div>
      )}

      {nodeData.onExplore && (
        <button
          type="button"
          className={`${styles.exploreBtn} ${styles.exploreBtnBlue}`}
          onClick={(e) => {
            e.stopPropagation();
            nodeData.onExplore?.();
          }}
        >
          <span>Explore Symbols</span>
          <ArrowRight size={13} />
        </button>
      )}

      <div className={styles.nodeFooter}>
        <div className={styles.provenanceBadge}>
          <ShieldCheck size={12} />
          <span>AST Indexed</span>
        </div>
        <span className={styles.statsText}>
          {nodeData.symbolCount ?? 0} symbols
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className={styles.handle}
      />
    </div>
  );
}

/**
 * L3 Code Symbol Node.
 */
export function SymbolNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CodebaseNodeData;
  const isComponent = nodeData.kind === "component";
  const isFunction = nodeData.kind === "function" || nodeData.kind === "method";
  const isClass = nodeData.kind === "class";

  let kindClass = styles.kindFunction;
  if (isComponent) kindClass = styles.kindComponent;
  else if (isClass) kindClass = styles.kindClass;
  else if (nodeData.kind === "method") kindClass = styles.kindMethod;

  const rangeText = nodeData.range
    ? `L${nodeData.range.start_line}–${nodeData.range.end_line}`
    : "";

  const langLabel = getLanguageLabel(nodeData.path, nodeData.language);

  return (
    <div
      className={`${styles.nodeContainer} ${selected ? styles.selected : ""} ${
        nodeData.isHighlighted ? styles.highlighted : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className={styles.handle} />

      <div className={styles.nodeHeader}>
        <div className={styles.badgeGroup}>
          <span className={`${styles.kindBadge} ${kindClass}`}>
            {nodeData.kind}
          </span>
          {langLabel && <span className={styles.langBadge}>{langLabel}</span>}
        </div>
        {rangeText && <span className={styles.rangeBadge}>{rangeText}</span>}
      </div>

      <div className={styles.nodeTitle}>
        {isComponent ? (
          <Component size={16} className={styles.componentIcon} />
        ) : isFunction ? (
          <FunctionSquare size={16} className={styles.symbolIcon} />
        ) : (
          <Box size={16} className={styles.symbolIcon} />
        )}
        <span>{nodeData.name}</span>
      </div>

      <div className={styles.nodeSubtext}>
        {nodeData.docstring || nodeData.qualifiedName || nodeData.path}
      </div>

      <div className={styles.nodeFooter}>
        <div className={styles.provenanceBadge}>
          <ShieldCheck size={12} />
          <span>static_verified</span>
        </div>
        <span className={styles.statsText}>{nodeData.path}</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className={styles.handle}
      />
    </div>
  );
}

/**
 * Full file header node for L3.
 */
export function FileNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CodebaseNodeData;
  const langLabel = getLanguageLabel(nodeData.path, nodeData.language);

  return (
    <div
      className={`${styles.nodeContainer} ${selected ? styles.selected : ""} ${
        nodeData.isHighlighted ? styles.highlighted : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className={styles.handle} />

      <div className={styles.nodeHeader}>
        <div className={styles.badgeGroup}>
          <span className={`${styles.kindBadge} ${styles.kindFile}`}>
            MODULE
          </span>
          {langLabel && <span className={styles.langBadge}>{langLabel}</span>}
        </div>
        <span className={styles.rangeBadge}>{nodeData.lineCount} lines</span>
      </div>

      <div className={styles.nodeTitle}>
        <FileCode size={16} className={styles.fileIcon} />
        <span>{nodeData.name}</span>
      </div>

      <div className={styles.nodeSubtext}>{nodeData.path}</div>

      <div className={styles.nodeFooter}>
        <div className={styles.provenanceBadge}>
          <ShieldCheck size={12} />
          <span>AST Indexed</span>
        </div>
        <span className={styles.statsText}>
          {nodeData.symbolCount ?? 0} symbols
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className={styles.handle}
      />
    </div>
  );
}
