"use client";

import React, { useState } from "react";
import {
  Layers,
  FolderGit2,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Download,
} from "lucide-react";
import { ConnectionStatus } from "../../lib/api";
import { RepositoryOption, GithubImportResponse } from "../../lib/types";
import { ImportRepoModal } from "./ImportRepoModal";
import styles from "./Header.module.css";

interface HeaderProps {
  selectedRepoId: string;
  repositories: RepositoryOption[];
  onSelectRepo: (repoId: string) => void;
  onImportSuccess: (repo: GithubImportResponse) => void;
  filesCount: number;
  symbolsCount: number;
  edgesCount: number;
  connectionStatus: ConnectionStatus;
  onRefresh?: () => void;
  onResetView?: () => void;
}

export function Header({
  selectedRepoId,
  repositories,
  onSelectRepo,
  onImportSuccess,
  filesCount,
  symbolsCount,
  edgesCount,
  connectionStatus,
  onRefresh,
}: HeaderProps) {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.leftSection}>
          <div className={styles.brand}>
            <div className={styles.logoMark}>
              <Sparkles size={16} />
            </div>
            <div className={styles.brandText}>
              <span className={styles.brandTitle}>Unfog</span>
              <span className={styles.brandSubtitle}>
                Codebase Intelligence
              </span>
            </div>
          </div>

          <div className={styles.badgesGroup}>
            {/* Repository Selector */}
            <div
              className={styles.repoSelectWrapper}
              title="Active repository snapshot"
            >
              <FolderGit2 className={styles.repoIcon} />
              <select
                className={styles.repoSelect}
                value={selectedRepoId}
                onChange={(e) => onSelectRepo(e.target.value)}
              >
                {repositories.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.isBundled ? `${r.name} (Bundled)` : r.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Static Verified AST Badge */}
            <div
              className={styles.snapshotBadge}
              title="Evidence level: Static Verified AST"
            >
              <ShieldCheck className={styles.verifiedIcon} />
              <span>Static Verified</span>
            </div>

            {/* Import Repository Action Button */}
            <button
              type="button"
              className={styles.importBtn}
              onClick={() => setIsImportModalOpen(true)}
              title="Import public GitHub repository"
            >
              <Download size={14} />
              <span>Import Repository</span>
            </button>
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
              connectionStatus === "connected"
                ? styles.connected
                : styles.offline
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
              {connectionStatus === "connected"
                ? "Backend Live"
                : "Preview Mode"}
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

      {/* GitHub Import Modal */}
      {isImportModalOpen && (
        <ImportRepoModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={onImportSuccess}
        />
      )}
    </>
  );
}
