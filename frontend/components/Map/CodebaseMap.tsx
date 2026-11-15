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

function getFileTier(path: string): number {
  const p = path.toLowerCase();
  // Tier 1: Entrypoints / Root architecture / Main servers
  if (
    p.includes("app.") ||
    p.includes("main.") ||
    p.includes("index.") ||
    p.includes("server.") ||
    p.includes("layout.") ||
    p.includes("page.") ||
    p.includes("auth.")
  ) {
    return 1;
  }
  // Tier 2: Components / Domain Models / Views / Core Logic
  if (
    p.includes("component") ||
    p.includes("order") ||
    p.includes("model") ||
    p.includes("view") ||
    p.includes("route") ||
    p.includes("pricing.")
  ) {
    return 2;
  }
  // Tier 3: Utilities / Database / Errors / Lib
  return 3;
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

  // Compute graph nodes and balanced 2D cluster layout
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

    // 1. Sort files into logical architecture tiers
    const sortedFiles = [...graph.files].sort((a, b) => {
      const tierA = getFileTier(a.path);
      const tierB = getFileTier(b.path);
      if (tierA !== tierB) return tierA - tierB;
      return a.path.localeCompare(b.path);
    });

    // 2. Dynamic 2D column count based on file count and aspect ratio ~1.2
    const fileCount = sortedFiles.length;
    let numCols: number;
    if (fileCount <= 3) {
      numCols = Math.max(1, fileCount);
    } else if (fileCount <= 6) {
      numCols = 3;
    } else if (fileCount <= 12) {
      numCols = 3;
    } else if (fileCount <= 20) {
      numCols = 4;
    } else {
      numCols = Math.max(4, Math.ceil(Math.sqrt(fileCount * 1.2)));
    }

    const clusterWidth = 320;
    const colGap = 50;
    const rowGap = 70;
    const symbolRowSpacing = 160;
    const fileHeaderSpacing = 160;

    // 3. Pre-calculate cluster height for each file
    const fileClusterHeights = sortedFiles.map((file) => {
      const fileSymbols = symbolsByFileId.get(file.id) || [];
      return fileHeaderSpacing + fileSymbols.length * symbolRowSpacing;
    });

    // 4. Compute maximum cluster height for each grid row
    const rowMaxHeights: number[] = [];
    sortedFiles.forEach((_, idx) => {
      const rowIdx = Math.floor(idx / numCols);
      const h = fileClusterHeights[idx];
      rowMaxHeights[rowIdx] = Math.max(rowMaxHeights[rowIdx] || 0, h);
    });

    // 5. Compute Y start offsets for each grid row
    const rowYStarts: number[] = [60];
    for (let r = 0; r < rowMaxHeights.length - 1; r++) {
      rowYStarts.push(rowYStarts[r] + rowMaxHeights[r] + rowGap);
    }

    // 6. Place file clusters in the 2D grid
    sortedFiles.forEach((file, fileIdx) => {
      const colIdx = fileIdx % numCols;
      const rowIdx = Math.floor(fileIdx / numCols);

      const colX = 60 + colIdx * (clusterWidth + colGap);
      let curY = rowYStarts[rowIdx];

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
          language: file.language,
          lineCount: file.line_count,
          symbolCount: fileSymbols.length,
          isHighlighted: highlightedPath === file.path,
        } satisfies CodebaseNodeData,
      });

      curY += fileHeaderSpacing;

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
            language: sym.language || file.language,
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

        curY += symbolRowSpacing;
      });
    });

    // 7. Map source edges (calls, references, extends, renders)
    graph.edges.forEach((edge) => {
      const sourceNodeId = `node-sym-${edge.source_symbol_id}`;
      const targetNodeId = `node-sym-${edge.target_symbol_id}`;

      let strokeColor = "var(--color-accent-violet)";
      if (edge.kind === "extends") {
        strokeColor = "var(--color-accent-amber)";
      } else if (edge.kind === "references") {
        strokeColor = "var(--color-accent-blue)";
      } else if (edge.kind === "renders") {
        strokeColor = "#5eead4";
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
        animated: edge.kind === "calls" || edge.kind === "renders",
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [graph, highlightedPath, selectedNodeId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync state when initialNodes or initialEdges change (e.g. repo switch)
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Center on node when selectedNodeId changes
  useEffect(() => {
    if (!selectedNodeId) return;
    const target = nodes.find((n) => {
      const data = n.data as unknown as CodebaseNodeData;
      return data.id === selectedNodeId;
    });
    if (target) {
      setCenter(target.position.x + 140, target.position.y + 60, {
        zoom: 0.8,
        duration: 400,
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
        (filterKind === "component" && data.kind === "component") ||
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
              filterKind === "component" ? styles.active : ""
            }`}
            onClick={() => setFilterKind("component")}
          >
            Components
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
        fitViewOptions={{
          padding: 0.15,
          minZoom: 0.6,
          maxZoom: 0.85,
          includeHiddenNodes: false,
        }}
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
            if (data.kind === "component") return "#5eead4";
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
          <span className={`${styles.legendDot} ${styles.comp}`} />
          <span>Components</span>
        </div>
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
