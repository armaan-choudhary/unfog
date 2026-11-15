"use client";

import React from "react";
import { FileCode } from "lucide-react";
import { CitationRef } from "../../lib/types";
import styles from "./CitationBadge.module.css";

interface CitationBadgeProps {
  citation: CitationRef;
  onClick?: (citation: CitationRef) => void;
  title?: string;
}

export function CitationBadge({
  citation,
  onClick,
  title,
}: CitationBadgeProps) {
  const rangeStr = citation.range
    ? `L${citation.range.start_line}–${citation.range.end_line}`
    : "";

  return (
    <button
      type="button"
      className={styles.citationBadge}
      onClick={() => onClick?.(citation)}
      title={
        title || citation.snippet || `Navigate to ${citation.path} ${rangeStr}`
      }
    >
      <FileCode className={styles.citationIcon} />
      <span className={styles.citationPath}>{citation.path}</span>
      {rangeStr && <span className={styles.citationRange}>:{rangeStr}</span>}
    </button>
  );
}
