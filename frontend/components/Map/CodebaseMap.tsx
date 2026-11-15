"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Search } from "lucide-react";
import { SourceGraph } from "../../lib/types";
import { SymbolNode, FileNode, CodebaseNodeData } from "./CustomNode";
import styles from "./CodebaseMap.module.css";

const nodeTypes = {
  symbolNode: SymbolNode,
  fileNode: FileNode,
};

interface CodebaseMapProps {
  graph: SourceGraph;
  selectedNodeId?: string;
  highlightedPath?: string;
  onSelectNode: (nodeData: CodebaseNodeData) => void;
}

function CodebaseMapInner({
  graph,
  selectedNodeId,
  highlightedPath,
  onSelectNode,
}: CodebaseMapProps) {
  const { setCenter } = useReactFlow();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKind, setFilterKind] = useState<string>("all");

  // Compute graph nodes and layout
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Group symbols by file_id
    const symbolsByFileId = new Map<string, typeof graph.symbols>();
    graph.symbols.forEach((sym) => {
      const list = symbolsByFileId.get(sym.file_id) || [];
      list.push(sym);
      symbolsByFileId.set(sym.file_id, list);
    });

    // Column layout: layout each file at an x offset
    const columnSpacing = 360;
    const rowSpacing = 180;

    graph.files.forEach((file, fileIdx) => {
      const colX = 60 + fileIdx * columnSpacing;
      let curY = 60;

      // File Node
      const fileNodeId = `node-file-${file.id}`;
      const fileSymbols = symbolsByFileId.get(file.id) || [];

      nodes.push({
        id: fileNodeId,
        type: "fileNode",
        position: { x: colX, y: curY },
        data: {
          id: file.id,
          name: file.path.split("/").pop() || file.path,
          kind: "file",
          path: file.path,
          lineCount: file.line_count,
          symbolCount: fileSymbols.length,
          isHighlighted: highlightedPath === file.path,
        } satisfies CodebaseNodeData,
      });

      curY += rowSpacing;

      // Symbol Nodes in this file
      fileSymbols.forEach((sym) => {
        const symNodeId = `node-sym-${sym.id}`;
        nodes.push({
          id: symNodeId,
          type: "symbolNode",
          position: { x: colX, y: curY },
          data: {
            id: sym.id,
            name: sym.name,
            kind: sym.kind,
            path: file.path,
            qualifiedName: sym.qualified_name || undefined,
            range: sym.range,
            docstring: sym.docstring || undefined,
            isHighlighted:
              highlightedPath === file.path || selectedNodeId === sym.id,
          } satisfies CodebaseNodeData,
        });

        // Edge from file to symbol (contains)
        edges.push({
          id: `edge-contains-${file.id}-${sym.id}`,
          source: fileNodeId,
          target: symNodeId,
          type: "smoothstep",
          style: {
            stroke: "var(--color-border)",
            strokeWidth: 1.5,
            strokeDasharray: "3,3",
          },
        });

        curY += rowSpacing;
      });
    });

    // Map source edges (calls, references, extends)
    graph.edges.forEach((edge) => {
      const sourceNodeId = `node-sym-${edge.source_symbol_id}`;
      const targetNodeId = `node-sym-${edge.target_symbol_id}`;

      let strokeColor = "var(--color-accent-violet)";
      if (edge.kind === "extends") {
        strokeColor = "var(--color-accent-amber)";
      } else if (edge.kind === "references") {
        strokeColor = "var(--color-accent-blue)";
      }

      edges.push({
        id: `edge-${edge.id}`,
        source: sourceNodeId,
        target: targetNodeId,
        type: "bezier",
        label: edge.kind,
        labelStyle: {
          fill: "var(--color-text-muted)",
          fontSize: 10,
          fontWeight: 600,
        },
        labelBgStyle: {
          fill: "var(--color-panel)",
          color: "var(--color-text)",
          fillOpacity: 0.85,
        },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: 14,
          height: 14,
        },
        style: {
          stroke: strokeColor,
          strokeWidth: 2,
        },
        animated: edge.kind === "calls",
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [graph, highlightedPath, selectedNodeId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  // Sync state when initialNodes change
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  // Center and focus on selected node
  useEffect(() => {
    if (!selectedNodeId) return;
    const targetNode = nodes.find(
      (n) => (n.data as unknown as CodebaseNodeData)?.id === selectedNodeId,
    );
    if (targetNode && targetNode.position) {
      setCenter(targetNode.position.x + 130, targetNode.position.y + 60, {
        zoom: 1.05,
        duration: 500,
      });
    }
  }, [selectedNodeId, nodes, setCenter]);

  // Node selection handler
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const nodeData = node.data as unknown as CodebaseNodeData;
      if (nodeData) {
        onSelectNode(nodeData);
      }
    },
    [onSelectNode],
  );

  // Filter nodes based on search and kind
  const filteredNodes = useMemo(() => {
    return nodes.map((node) => {
      const data = node.data as unknown as CodebaseNodeData;
      const matchesSearch =
        searchQuery === "" ||
        data.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        data.path.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesKind =
        filterKind === "all" ||
        (filterKind === "file" && data.kind === "file") ||
        (filterKind === "function" &&
          (data.kind === "function" || data.kind === "method")) ||
        (filterKind === "class" && data.kind === "class");

      const isHidden = !matchesSearch || !matchesKind;

      return {
        ...node,
        hidden: isHidden,
        selected: selectedNodeId === data.id,
      };
    });
  }, [nodes, searchQuery, filterKind, selectedNodeId]);

  return (
    <div className={styles.mapWrapper}>
      {/* Top Map Toolbar */}
      <div className={styles.mapToolbar}>
        <div className={styles.searchContainer}>
          <Search size={14} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search symbols..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <button
            type="button"
            className={`${styles.filterBtn} ${
              filterKind === "all" ? styles.active : ""
            }`}
            onClick={() => setFilterKind("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${
              filterKind === "function" ? styles.active : ""
            }`}
            onClick={() => setFilterKind("function")}
          >
            Functions
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${
              filterKind === "class" ? styles.active : ""
            }`}
            onClick={() => setFilterKind("class")}
          >
            Classes
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${
              filterKind === "file" ? styles.active : ""
            }`}
            onClick={() => setFilterKind("file")}
          >
            Files
          </button>
        </div>
      </div>

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={filteredNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.25, includeHiddenNodes: false }}
        minZoom={0.2}
        maxZoom={2.0}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1.2}
          color="rgba(255, 255, 255, 0.08)"
        />
        <Controls
          showInteractive={false}
          style={{
            bottom: 20,
            right: 20,
            backgroundColor: "var(--color-panel)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-control)",
            overflow: "hidden",
          }}
        />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as unknown as CodebaseNodeData;
            if (data.kind === "file") return "var(--color-accent-teal)";
            if (data.kind === "class") return "var(--color-accent-amber)";
            return "var(--color-accent-violet)";
          }}
          maskColor="rgba(23, 23, 25, 0.85)"
          style={{
            bottom: 20,
            right: 80,
            backgroundColor: "var(--color-panel)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-control)",
            width: 140,
            height: 90,
          }}
        />
      </ReactFlow>

      {/* Top Semantic Legend */}
      <div className={styles.legendPanel}>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.func}`} />
          <span>Functions</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.cls}`} />
          <span>Classes</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.file}`} />
          <span>Modules</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.edge}`} />
          <span>Calls / References</span>
        </div>
      </div>
    </div>
  );
}

export function CodebaseMap(props: CodebaseMapProps) {
  return (
    <ReactFlowProvider>
      <CodebaseMapInner {...props} />
    </ReactFlowProvider>
  );
}
