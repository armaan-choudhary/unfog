"use client";

import React, { useState, useEffect, useCallback } from "react";
import { SourceGraph, CitationRef } from "../lib/types";
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
  const [graph, setGraph] = useState<SourceGraph>(MOCK_SOURCE_GRAPH);
  const [selectedNode, setSelectedNode] = useState<CodebaseNodeData | null>(
    () => {
      // Default initial selection to verify_token
      const firstSym = MOCK_SOURCE_GRAPH.symbols[0];
      const firstFile = MOCK_SOURCE_GRAPH.files.find(
        (f) => f.id === firstSym?.file_id,
      );
      if (firstSym && firstFile) {
        return {
          id: firstSym.id,
          name: firstSym.name,
          kind: firstSym.kind,
          path: firstFile.path,
          qualifiedName: firstSym.qualified_name || undefined,
          range: firstSym.range,
          docstring: firstSym.docstring || undefined,
        };
      }
      return null;
    },
  );
  const [highlightedPath, setHighlightedPath] = useState<string | undefined>(
    "service/auth.py",
  );
  const [activeTab, setActiveTab] = useState<InspectorTab>("source");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("checking");

  // Load graph on mount and listen to backend status
  const loadGraph = useCallback(() => {
    fetchSourceGraph()
      .then((data) => {
        setGraph(data);
      })
      .catch((err) => {
        console.warn("Failed to fetch source graph:", err);
      });
  }, []);

  useEffect(() => {
    let isSubscribed = true;
    const unsub = subscribeConnectionStatus((status) => {
      if (isSubscribed) setConnectionStatus(status);
    });

    fetchSourceGraph()
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

  return (
    <div className="appContainer">
      {/* Top Header */}
      <Header
        repoName={graph.snapshot.repository_name || "sample_service"}
        filesCount={graph.files.length}
        symbolsCount={graph.symbols.length}
        edgesCount={graph.edges.length}
        connectionStatus={connectionStatus}
        onRefresh={loadGraph}
      />

      {/* Main Workspace */}
      <div className="mainContent">
        <CodebaseMap
          graph={graph}
          selectedNodeId={selectedNode?.id}
          highlightedPath={highlightedPath}
          onSelectNode={handleSelectNode}
        />

        <InspectorPanel
          selectedNode={selectedNode}
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          onNavigateCitation={handleNavigateCitation}
        />
      </div>
    </div>
  );
}
