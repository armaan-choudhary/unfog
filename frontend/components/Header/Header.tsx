"use client";

import React from "react";
import {
  Layers,
  FolderGit2,
  ShieldCheck,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { ConnectionStatus } from "../../lib/api";
import styles from "./Header.module.css";

interface HeaderProps {
  repoName?: string;
  filesCount: number;
  symbolsCount: number;
  edgesCount: number;
  connectionStatus: ConnectionStatus;
  onRefresh?: () => void;
  onResetView?: () => void;
}

export function Header({
  repoName = "sample_service",
  filesCount,
  symbolsCount,
  edgesCount,
  connectionStatus,
  onRefresh,
}: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.leftSection}>
        <div className={styles.brand}>
          <div className={styles.logoMark}>
            <Sparkles size={16} />
          </div>
          <div className={styles.brandText}>
            <span className={styles.brandTitle}>Unfog</span>
            <span className={styles.brandSubtitle}>Codebase Intelligence</span>
          </div>
        </div>

        <div className={styles.badgesGroup}>
          <div className={styles.repoBadge} title="Active repository snapshot">
            <FolderGit2 className={styles.repoIcon} />
            <span>{repoName}</span>
          </div>
          <div
            className={styles.snapshotBadge}
            title="Evidence level: Static Verified AST"
          >
            <ShieldCheck className={styles.verifiedIcon} />
            <span>Static Verified</span>
          </div>
        </div>
      </div>

      <div className={styles.rightSection}>
        <div className={styles.statsGroup}>
          <div className={styles.statItem} title="Analyzed source files">
            <Layers size={13} />
            <span>Files:</span>
            <span className={styles.statValue}>{filesCount}</span>
          </div>
          <div className={styles.statItem} title="Extracted symbols">
            <span>Symbols:</span>
            <span className={styles.statValue}>{symbolsCount}</span>
          </div>
          <div className={styles.statItem} title="Dependency edges">
            <span>Edges:</span>
            <span className={styles.statValue}>{edgesCount}</span>
          </div>
        </div>

        <div
          className={`${styles.statusIndicator} ${
            connectionStatus === "connected" ? styles.connected : styles.offline
          }`}
          title={
            connectionStatus === "connected"
              ? "Connected to live FastAPI backend"
              : "Preview Mode with verified offline fallback"
          }
        >
          <div
            className={`${styles.statusDot} ${
              connectionStatus === "connected"
                ? styles.connected
                : styles.offline
            }`}
          />
          <span>
            {connectionStatus === "connected" ? "Backend Live" : "Preview Mode"}
          </span>
        </div>

        {onRefresh && (
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onRefresh}
            title="Refresh codebase graph"
          >
            <RefreshCw size={13} />
            <span>Sync</span>
          </button>
        )}
      </div>
    </header>
  );
}
