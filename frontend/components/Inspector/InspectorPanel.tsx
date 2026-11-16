"use client";

import React, { useState } from "react";
import { Code2, Bot, Trophy, ChevronRight, ChevronLeft } from "lucide-react";
import { CodebaseNodeData } from "../Map/CustomNode";
import { CitationRef } from "../../lib/types";
import {
  SourceInspectorTab,
  RelationshipFocusDirection,
} from "./SourceInspectorTab";
import { AiCompanionTab } from "./AiCompanionTab";
import { LearningArenaTab } from "./LearningArenaTab";
import styles from "./InspectorPanel.module.css";

export type InspectorTab = "source" | "ai" | "learning";

export interface InspectorPanelProps {
  selectedNode: CodebaseNodeData | null;
  repoId?: string;
  activeTab: InspectorTab;
  onChangeTab: (tab: InspectorTab) => void;
  onNavigateCitation: (citation: CitationRef) => void;
  onFocusRelationships?: (
    direction: RelationshipFocusDirection,
    symbolId: string,
  ) => void;
  repoOwner?: string;
  repoName?: string;
  commitSha?: string;
  isBundled?: boolean;
}

export function InspectorPanel({
  selectedNode,
  repoId,
  activeTab,
  onChangeTab,
  onNavigateCitation,
  onFocusRelationships,
  repoOwner,
  repoName,
  commitSha,
  isBundled,
}: InspectorPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | undefined>(
    undefined,
  );

  const handleAskAiFromSource = (prompt: string) => {
    setAiInitialPrompt(prompt);
    onChangeTab("ai");
    setIsCollapsed(false);
  };

  return (
    <aside className={`${styles.panel} ${isCollapsed ? styles.collapsed : ""}`}>
      {/* Tab bar / Collapse Toggle */}
      <div className={styles.panelTabBar}>
        {!isCollapsed && (
          <div className={styles.tabsGroup}>
            <button
              type="button"
              className={`${styles.tabBtn} ${
                activeTab === "source" ? styles.active : ""
              }`}
              onClick={() => onChangeTab("source")}
            >
              <Code2 size={14} />
              <span>Source Inspector</span>
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${
                activeTab === "ai" ? styles.active : ""
              }`}
              onClick={() => onChangeTab("ai")}
            >
              <Bot size={14} />
              <span>AI Companion</span>
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${
                activeTab === "learning" ? styles.active : ""
              }`}
              onClick={() => onChangeTab("learning")}
            >
              <Trophy size={14} />
              <span>Learning Arena</span>
            </button>
          </div>
        )}

        <button
          type="button"
          className={styles.collapseToggle}
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expand panel" : "Collapse panel"}
        >
          {isCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Collapsed state vertical icons */}
      {isCollapsed ? (
        <div className={styles.collapsedColumn}>
          <button
            type="button"
            className={`${styles.collapsedTabBtn} ${
              activeTab === "source" ? styles.active : ""
            }`}
            onClick={() => {
              onChangeTab("source");
              setIsCollapsed(false);
            }}
            title="Source Inspector"
          >
            <Code2 size={16} />
          </button>
          <button
            type="button"
            className={`${styles.collapsedTabBtn} ${
              activeTab === "ai" ? styles.active : ""
            }`}
            onClick={() => {
              onChangeTab("ai");
              setIsCollapsed(false);
            }}
            title="AI Companion"
          >
            <Bot size={16} />
          </button>
          <button
            type="button"
            className={`${styles.collapsedTabBtn} ${
              activeTab === "learning" ? styles.active : ""
            }`}
            onClick={() => {
              onChangeTab("learning");
              setIsCollapsed(false);
            }}
            title="Learning Arena"
          >
            <Trophy size={16} />
          </button>
        </div>
      ) : (
        /* Expanded tab content */
        <div className={styles.tabContent}>
          {activeTab === "source" && (
            <SourceInspectorTab
              selectedNode={selectedNode}
              repoId={repoId}
              onAskAi={handleAskAiFromSource}
              onFocusRelationships={onFocusRelationships}
              repoOwner={repoOwner}
              repoName={repoName}
              commitSha={commitSha}
              isBundled={isBundled}
            />
          )}

          {activeTab === "ai" && (
            <AiCompanionTab
              selectedNode={selectedNode}
              repoId={repoId}
              onNavigateCitation={onNavigateCitation}
              initialPrompt={aiInitialPrompt}
            />
          )}

          {activeTab === "learning" && (
            <LearningArenaTab
              repoId={repoId}
              onNavigateCitation={onNavigateCitation}
            />
          )}
        </div>
      )}
    </aside>
  );
}
