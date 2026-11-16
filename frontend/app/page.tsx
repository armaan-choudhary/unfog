"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  SourceGraph,
  CitationRef,
  RepositoryOption,
  GithubImportResponse,
} from "../lib/types";
import {
  fetchSourceGraph,
  subscribeConnectionStatus,
  ConnectionStatus,
} from "../lib/api";
import { MOCK_SOURCE_GRAPH } from "../lib/mockData";
import { Header } from "../components/Header/Header";
import { CodebaseMap } from "../components/Map/CodebaseMap";
import {
  InspectorPanel,
  InspectorTab,
} from "../components/Inspector/InspectorPanel";
import { CodebaseNodeData } from "../components/Map/CustomNode";

export default function DashboardPage() {
  const [repositories, setRepositories] = useState<RepositoryOption[]>([
    {
      id: "sample_service",
      name: "sample_service",
      isBundled: true,
    },
  ]);
  const [selectedRepoId, setSelectedRepoId] =
    useState<string>("sample_service");
  const [graph, setGraph] = useState<SourceGraph>(MOCK_SOURCE_GRAPH);
  const [selectedNode, setSelectedNode] = useState<CodebaseNodeData | null>(
    null,
  );
  const [highlightedPath, setHighlightedPath] = useState<string | undefined>(
    undefined,
  );
  const [activeTab, setActiveTab] = useState<InspectorTab>("source");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("checking");

  // Load graph on mount and listen to backend status
  const loadGraph = useCallback(() => {
    fetchSourceGraph(selectedRepoId)
      .then((data) => {
        setGraph(data);
      })
      .catch((err) => {
        console.warn("Failed to fetch source graph:", err);
      });
  }, [selectedRepoId]);

  useEffect(() => {
    let isSubscribed = true;
    const unsub = subscribeConnectionStatus((status) => {
      if (isSubscribed) setConnectionStatus(status);
    });

    fetchSourceGraph("sample_service")
      .then((data) => {
        if (isSubscribed) {
          setGraph(data);
          // Synchronize selectedNode with authoritative symbol coordinates from live graph
          setSelectedNode((prev) => {
            if (!prev) return null;
            const matching = data.symbols.find(
              (s) => (prev.name && s.name === prev.name) || s.id === prev.id,
            );
            if (matching) {
              const file = data.files.find((f) => f.id === matching.file_id);
              return {
                id: matching.id,
                name: matching.name,
                kind: matching.kind,
                path: file?.path || prev.path,
                qualifiedName: matching.qualified_name || undefined,
                range: matching.range,
                docstring: matching.docstring || undefined,
              };
            }
            return prev;
          });
        }
      })
      .catch((err) => {
        console.warn("Failed to fetch source graph:", err);
      });

    return () => {
      isSubscribed = false;
      unsub();
    };
  }, []);

  // Handler for switching active repository
  const handleSelectRepo = useCallback((repoId: string) => {
    setSelectedRepoId(repoId);
    setSelectedNode(null);
    setHighlightedPath(undefined);
    setActiveTab("source");

    fetchSourceGraph(repoId)
      .then((data) => {
        setGraph(data);
      })
      .catch((err) => {
        console.error("Failed to switch repository graph:", err);
      });
  }, []);

  // Handler when a new GitHub repository is imported
  const handleImportSuccess = useCallback(
    (imported: GithubImportResponse) => {
      const newOption: RepositoryOption = {
        id: imported.repo_id,
        name: `${imported.owner}/${imported.repo}`,
        owner: imported.owner,
        repo: imported.repo,
        isBundled: false,
      };

      setRepositories((prev) => {
        const exists = prev.some((r) => r.id === imported.repo_id);
        return exists ? prev : [...prev, newOption];
      });

      handleSelectRepo(imported.repo_id);
    },
    [handleSelectRepo],
  );

  // Handler when a user selects a node from the React Flow canvas
  const handleSelectNode = useCallback((nodeData: CodebaseNodeData) => {
    setSelectedNode(nodeData);
    setHighlightedPath(nodeData.path);
  }, []);

  // Handler when a user clicks a citation badge anywhere in AI companion or Learning arena
  const handleNavigateCitation = useCallback(
    (citation: CitationRef) => {
      setHighlightedPath(citation.path);

      // Find if there is a matching symbol in this path and range
      const matchingSym = graph.symbols.find((s) => {
        const file = graph.files.find((f) => f.id === s.file_id);
        if (file && file.path !== citation.path) return false;
        if (!citation.range) return false;
        return (
          (s.range.start_line <= citation.range.start_line &&
            s.range.end_line >= citation.range.end_line) ||
          (citation.range.start_line <= s.range.start_line &&
            citation.range.end_line >= s.range.end_line)
        );
      });

      if (matchingSym) {
        setSelectedNode({
          id: matchingSym.id,
          name: matchingSym.name,
          kind: matchingSym.kind,
          path: citation.path,
          qualifiedName: matchingSym.qualified_name || undefined,
          range: citation.range || matchingSym.range,
          docstring: matchingSym.docstring || undefined,
        });
      } else {
        // Fallback to file citation node
        setSelectedNode({
          id: `citation-${citation.path}`,
          name: citation.path.split("/").pop() || citation.path,
          kind: "file",
          path: citation.path,
          range: citation.range,
        });
      }

      // Switch to Source Inspector tab so the code snippet is visible immediately
      setActiveTab("source");
    },
    [graph],
  );

  const handleFocusRelationships = useCallback(
    (
      _direction: "callers" | "dependencies" | "inbound" | "outbound",
      symbolId: string,
    ) => {
      if (symbolId) {
        const matchingSym = graph.symbols.find((s) => s.id === symbolId);
        if (matchingSym) {
          const file = graph.files.find((f) => f.id === matchingSym.file_id);
          setSelectedNode({
            id: matchingSym.id,
            name: matchingSym.name,
            kind: matchingSym.kind,
            path: file?.path || "",
            qualifiedName: matchingSym.qualified_name || undefined,
            range: matchingSym.range,
            docstring: matchingSym.docstring || undefined,
          });
        }
      }
    },
    [graph],
  );

  const currentRepoOption = repositories.find((r) => r.id === selectedRepoId);
  const isBundled =
    currentRepoOption?.isBundled ?? selectedRepoId === "sample_service";
  const repoOwner = currentRepoOption?.owner;
  const repoName = currentRepoOption?.repo || currentRepoOption?.name;
  const commitSha =
    graph.snapshot?.revision?.kind === "git_commit"
      ? graph.snapshot.revision.value
      : undefined;

  return (
    <div className="appContainer">
      {/* Top Header */}
      <Header
        selectedRepoId={selectedRepoId}
        repositories={repositories}
        onSelectRepo={handleSelectRepo}
        onImportSuccess={handleImportSuccess}
        filesCount={graph.files.length}
        symbolsCount={graph.symbols.length}
        edgesCount={graph.edges.length}
        connectionStatus={connectionStatus}
        onRefresh={loadGraph}
      />

      {/* Main Workspace */}
      <div className="mainContent">
        <CodebaseMap
          key={graph.snapshot?.id || selectedRepoId}
          graph={graph}
          selectedNodeId={selectedNode?.id}
          highlightedPath={highlightedPath}
          onSelectNode={handleSelectNode}
        />

        <InspectorPanel
          key={selectedRepoId}
          selectedNode={selectedNode}
          repoId={selectedRepoId}
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          onNavigateCitation={handleNavigateCitation}
          onFocusRelationships={handleFocusRelationships}
          repoOwner={repoOwner}
          repoName={repoName}
          commitSha={commitSha}
          isBundled={isBundled}
        />
      </div>
    </div>
  );
}
