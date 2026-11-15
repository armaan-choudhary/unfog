import { Node, Edge, MarkerType } from "@xyflow/react";
import { SourceGraph, SourceFile, SourceSymbol, L1GroupSummary } from "./types";
import { CodebaseNodeData } from "../components/Map/CustomNode";

/**
 * Derives real directory/module groups (L1) from indexed SourceFiles.
 * Never invents architectural categories unsupported by repository evidence.
 */
export function extractL1Groups(graph: SourceGraph): L1GroupSummary[] {
  const groupMap = new Map<
    string,
    {
      name: string;
      pathPrefix: string;
      files: SourceFile[];
    }
  >();

  // Map file to directory prefix
  graph.files.forEach((file) => {
    const normalizedPath = file.path.replace(/\\/g, "/");
    const parts = normalizedPath.split("/");

    let groupKey = "root";
    let groupName = "Root Module";
    let pathPrefix = "";

    if (parts.length > 1) {
      const firstSegment = parts[0];
      // For standard project layouts (src/, app/, lib/), group by second level if present
      if (
        (firstSegment === "src" ||
          firstSegment === "app" ||
          firstSegment === "lib") &&
        parts.length > 2
      ) {
        groupKey = `${firstSegment}/${parts[1]}`;
        groupName = parts[1];
        pathPrefix = `${firstSegment}/${parts[1]}/`;
      } else {
        groupKey = firstSegment;
        groupName = firstSegment;
        pathPrefix = `${firstSegment}/`;
      }
    }

    const existing = groupMap.get(groupKey) || {
      name: groupName,
      pathPrefix,
      files: [],
    };
    existing.files.push(file);
    groupMap.set(groupKey, existing);
  });

  // Count symbols per group
  const symbolsByFileId = new Map<string, SourceSymbol[]>();
  graph.symbols.forEach((sym) => {
    const list = symbolsByFileId.get(sym.file_id) || [];
    list.push(sym);
    symbolsByFileId.set(sym.file_id, list);
  });

  const groups: L1GroupSummary[] = [];

  groupMap.forEach((entry, key) => {
    const fileIds = entry.files.map((f) => f.id);
    let symCount = 0;
    entry.files.forEach((f) => {
      symCount += (symbolsByFileId.get(f.id) || []).length;
    });

    const previewFiles = entry.files.slice(0, 4).map((f) => ({
      name: f.path.split("/").pop() || f.path,
      path: f.path,
      language: f.language,
    }));

    groups.push({
      id: `group-${key}`,
      name: entry.name,
      pathPrefix: entry.pathPrefix || key,
      fileCount: entry.files.length,
      symbolCount: symCount,
      fileIds,
      previewFiles,
    });
  });

  // Sort groups: core/components first, tests last, then alphabetically
  return groups.sort((a, b) => {
    const isTestA = a.name.toLowerCase().includes("test");
    const isTestB = b.name.toLowerCase().includes("test");
    if (isTestA && !isTestB) return 1;
    if (!isTestA && isTestB) return -1;
    return b.symbolCount - a.symbolCount || a.name.localeCompare(b.name);
  });
}

/**
 * Builds L1 React Flow nodes and aggregated cross-group dependency edges.
 */
export function buildL1NodesAndEdges(
  graph: SourceGraph,
  groups: L1GroupSummary[],
  onExploreGroup?: (groupId: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Layout calculation for L1
  const numCols =
    groups.length <= 2 ? groups.length : groups.length <= 6 ? 3 : 4;
  const cardWidth = 340;
  const cardHeight = 220;
  const colGap = 60;
  const rowGap = 70;

  groups.forEach((group, idx) => {
    const colIdx = idx % Math.max(1, numCols);
    const rowIdx = Math.floor(idx / Math.max(1, numCols));
    const x = 60 + colIdx * (cardWidth + colGap);
    const y = 60 + rowIdx * (cardHeight + rowGap);

    nodes.push({
      id: group.id,
      type: "groupNode",
      position: { x, y },
      data: {
        id: group.id,
        name: group.name,
        kind: "group",
        path: group.pathPrefix,
        fileCount: group.fileCount,
        symbolCount: group.symbolCount,
        previewFiles: group.previewFiles,
        onExplore: onExploreGroup ? () => onExploreGroup(group.id) : undefined,
      } satisfies CodebaseNodeData,
    });
  });

  // Build aggregated cross-group edges from underlying verified edges
  // Map symbol_id -> group.id
  const fileToGroup = new Map<string, string>();
  groups.forEach((g) => {
    g.fileIds.forEach((fid) => fileToGroup.set(fid, g.id));
  });

  const symbolToGroup = new Map<string, string>();
  graph.symbols.forEach((sym) => {
    const gid = fileToGroup.get(sym.file_id);
    if (gid) symbolToGroup.set(sym.id, gid);
  });

  // Tally cross-group dependencies
  const crossGroupLinks = new Map<
    string,
    { source: string; target: string; count: number; kinds: Set<string> }
  >();

  graph.edges.forEach((edge) => {
    const srcGroupId = symbolToGroup.get(edge.source_symbol_id);
    const tgtGroupId = symbolToGroup.get(edge.target_symbol_id);

    if (srcGroupId && tgtGroupId && srcGroupId !== tgtGroupId) {
      const linkKey = `${srcGroupId}->${tgtGroupId}`;
      const existing = crossGroupLinks.get(linkKey) || {
        source: srcGroupId,
        target: tgtGroupId,
        count: 0,
        kinds: new Set<string>(),
      };
      existing.count += 1;
      existing.kinds.add(edge.kind);
      crossGroupLinks.set(linkKey, existing);
    }
  });

  crossGroupLinks.forEach((link, key) => {
    const kindsStr = Array.from(link.kinds).join(", ");
    const label = `${link.count} ${link.count === 1 ? "dep" : "deps"} (${kindsStr})`;

    edges.push({
      id: `l1-edge-${key}`,
      source: link.source,
      target: link.target,
      type: "bezier",
      label,
      labelStyle: {
        fill: "var(--color-text-muted)",
        fontSize: 10,
        fontWeight: 600,
      },
      labelBgStyle: {
        fill: "var(--color-panel)",
        fillOpacity: 0.9,
      },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 4,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "var(--color-accent-violet)",
        width: 14,
        height: 14,
      },
      style: {
        stroke: "var(--color-accent-violet)",
        strokeWidth: Math.min(4, 1.5 + Math.log2(link.count + 1)),
      },
      animated: true,
    });
  });

  return { nodes, edges };
}

/**
 * Builds unified React Flow nodes and edges where groups expand within the same map.
 * When a group expands, it dynamically resizes into a container revealing its files
 * and internal dependencies, while other groups remain on the canvas with verified connections.
 */
export function buildUnifiedHierarchyNodesAndEdges(
  graph: SourceGraph,
  groups: L1GroupSummary[],
  expandedGroupIds: Set<string>,
  onToggleGroup: (groupId: string) => void,
  onExploreFile?: (fileId: string) => void,
  onSelectSymbol?: (symbolId: string) => void,
  selectedNodeId?: string,
  highlightedPath?: string,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Map symbols to files and groups
  const symbolsByFileId = new Map<string, SourceSymbol[]>();
  graph.symbols.forEach((sym) => {
    const list = symbolsByFileId.get(sym.file_id) || [];
    list.push(sym);
    symbolsByFileId.set(sym.file_id, list);
  });

  const fileToGroup = new Map<string, string>();
  groups.forEach((g) => {
    g.fileIds.forEach((fid) => fileToGroup.set(fid, g.id));
  });

  const symbolToFile = new Map<string, string>();
  const symbolToGroup = new Map<string, string>();
  graph.symbols.forEach((sym) => {
    symbolToFile.set(sym.id, sym.file_id);
    const gid = fileToGroup.get(sym.file_id);
    if (gid) symbolToGroup.set(sym.id, gid);
  });

  // Calculate size for each group
  const groupDimensions = new Map<
    string,
    { width: number; height: number; files: SourceFile[] }
  >();

  groups.forEach((g) => {
    const isExpanded = expandedGroupIds.has(g.id);
    const groupFiles = graph.files.filter((f) => g.fileIds.includes(f.id));

    if (!isExpanded) {
      groupDimensions.set(g.id, {
        width: 340,
        height: 220,
        files: groupFiles,
      });
    } else {
      const fileCount = groupFiles.length;
      const numCols = fileCount <= 1 ? 1 : 2;
      const width = fileCount <= 1 ? 380 : 710;
      const rows = Math.max(1, Math.ceil(fileCount / numCols));
      const height = 85 + rows * 225 + 40;
      groupDimensions.set(g.id, { width, height, files: groupFiles });
    }
  });

  // Balanced 2-column masonry placement so groups never overlap
  const col0X = 60;
  const col1X = 800;
  const colY = [60, 60];

  groups.forEach((g) => {
    const dim = groupDimensions.get(g.id)!;
    const isExpanded = expandedGroupIds.has(g.id);

    // Pick column with smallest vertical accumulation
    const colIdx = colY[0] <= colY[1] ? 0 : 1;
    const gx = colIdx === 0 ? col0X : col1X;
    const gy = colY[colIdx];
    colY[colIdx] += dim.height + 60;

    if (!isExpanded) {
      // Collapsed group card
      nodes.push({
        id: g.id,
        type: "groupNode",
        position: { x: gx, y: gy },
        data: {
          id: g.id,
          name: g.name,
          kind: "group",
          path: g.pathPrefix,
          fileCount: g.fileCount,
          symbolCount: g.symbolCount,
          previewFiles: g.previewFiles,
          isExpanded: false,
          onExplore: () => onToggleGroup(g.id),
          onToggleExpand: () => onToggleGroup(g.id),
        } satisfies CodebaseNodeData,
      });
    } else {
      // Expanded Group Container
      nodes.push({
        id: g.id,
        type: "groupNode",
        position: { x: gx, y: gy },
        style: { width: dim.width, height: dim.height },
        data: {
          id: g.id,
          name: g.name,
          kind: "group",
          path: g.pathPrefix,
          fileCount: g.fileCount,
          symbolCount: g.symbolCount,
          previewFiles: g.previewFiles,
          isExpanded: true,
          onExplore: () => onToggleGroup(g.id),
          onToggleExpand: () => onToggleGroup(g.id),
        } satisfies CodebaseNodeData,
      });

      // Child file nodes inside expanded group
      const numFileCols = dim.files.length <= 1 ? 1 : 2;
      const cardW = 320;
      const cardH = 200;
      const gapX = 25;
      const gapY = 25;
      const startX = 25;
      const startY = 80;

      dim.files.forEach((file, fIdx) => {
        const c = fIdx % numFileCols;
        const r = Math.floor(fIdx / numFileCols);
        const relX = startX + c * (cardW + gapX);
        const relY = startY + r * (cardH + gapY);

        const fileSymbols = symbolsByFileId.get(file.id) || [];
        const previewSymbols = fileSymbols.slice(0, 4).map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.kind,
        }));

        nodes.push({
          id: `node-file-${file.id}`,
          type: "fileSummaryNode",
          position: { x: relX, y: relY },
          parentId: g.id,
          extent: "parent",
          data: {
            id: file.id,
            name: file.path.split("/").pop() || file.path,
            kind: "file",
            path: file.path,
            language: file.language,
            lineCount: file.line_count,
            symbolCount: fileSymbols.length,
            previewSymbols,
            selectedSymbolId: selectedNodeId,
            isHighlighted: highlightedPath === file.path,
            onExplore: onExploreFile ? () => onExploreFile(file.id) : undefined,
            onSelectSymbol: onSelectSymbol
              ? (symId) => onSelectSymbol(symId)
              : undefined,
          } satisfies CodebaseNodeData,
        });
      });
    }
  });

  // Calculate verified dependencies: inter-file within expanded groups & cross-group
  const aggregatedEdges = new Map<
    string,
    {
      source: string;
      target: string;
      count: number;
      kinds: Set<string>;
      isIntraGroup: boolean;
    }
  >();

  graph.edges.forEach((edge) => {
    const srcGroupId = symbolToGroup.get(edge.source_symbol_id);
    const tgtGroupId = symbolToGroup.get(edge.target_symbol_id);
    const srcFileId = symbolToFile.get(edge.source_symbol_id);
    const tgtFileId = symbolToFile.get(edge.target_symbol_id);

    if (!srcGroupId || !tgtGroupId) return;

    if (srcGroupId === tgtGroupId) {
      // Intra-group dependency: only emit if this group is expanded
      if (
        expandedGroupIds.has(srcGroupId) &&
        srcFileId &&
        tgtFileId &&
        srcFileId !== tgtFileId
      ) {
        const edgeKey = `intra-${srcFileId}->${tgtFileId}`;
        const existing = aggregatedEdges.get(edgeKey) || {
          source: `node-file-${srcFileId}`,
          target: `node-file-${tgtFileId}`,
          count: 0,
          kinds: new Set<string>(),
          isIntraGroup: true,
        };
        existing.count += 1;
        existing.kinds.add(edge.kind);
        aggregatedEdges.set(edgeKey, existing);
      }
    } else {
      // Cross-group dependency
      const srcExpanded = expandedGroupIds.has(srcGroupId);
      const tgtExpanded = expandedGroupIds.has(tgtGroupId);

      const srcNodeId =
        srcExpanded && srcFileId ? `node-file-${srcFileId}` : srcGroupId;
      const tgtNodeId =
        tgtExpanded && tgtFileId ? `node-file-${tgtFileId}` : tgtGroupId;

      if (srcNodeId !== tgtNodeId) {
        const edgeKey = `cross-${srcNodeId}->${tgtNodeId}`;
        const existing = aggregatedEdges.get(edgeKey) || {
          source: srcNodeId,
          target: tgtNodeId,
          count: 0,
          kinds: new Set<string>(),
          isIntraGroup: false,
        };
        existing.count += 1;
        existing.kinds.add(edge.kind);
        aggregatedEdges.set(edgeKey, existing);
      }
    }
  });

  // Build edge objects with labels and styles
  aggregatedEdges.forEach((entry, key) => {
    const kindsStr = Array.from(entry.kinds).join(", ");
    const isIntra = entry.isIntraGroup;
    const strokeColor = isIntra
      ? "var(--color-accent-blue)"
      : "var(--color-accent-violet)";

    edges.push({
      id: `edge-${key}`,
      source: entry.source,
      target: entry.target,
      type: "bezier",
      label: `${entry.count} ${entry.count === 1 ? "dep" : "deps"} (${kindsStr})`,
      labelStyle: {
        fill: "var(--color-text-muted)",
        fontSize: 10,
        fontWeight: 600,
      },
      labelBgStyle: {
        fill: "var(--color-panel)",
        fillOpacity: 0.9,
      },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 4,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: strokeColor,
        width: 14,
        height: 14,
      },
      style: {
        stroke: strokeColor,
        strokeWidth: isIntra
          ? 2
          : Math.min(4, 1.5 + Math.log2(entry.count + 1)),
      },
      animated: true,
    });
  });

  return { nodes, edges };
}

/**
 * Builds L2 React Flow nodes for files in the selected group and inter-file dependency edges.
 */
export function buildL2NodesAndEdges(
  graph: SourceGraph,
  groupId: string,
  groups: L1GroupSummary[],
  onExploreFile?: (fileId: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const targetGroup = groups.find((g) => g.id === groupId) || groups[0];
  if (!targetGroup) return { nodes: [], edges: [] };

  const groupFileSet = new Set(targetGroup.fileIds);
  const files = graph.files.filter((f) => groupFileSet.has(f.id));

  // Map symbols to files
  const symbolsByFileId = new Map<string, SourceSymbol[]>();
  graph.symbols.forEach((sym) => {
    const list = symbolsByFileId.get(sym.file_id) || [];
    list.push(sym);
    symbolsByFileId.set(sym.file_id, list);
  });

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const fileCount = files.length;
  const numCols =
    fileCount <= 2
      ? Math.max(1, fileCount)
      : fileCount <= 6
        ? 3
        : fileCount <= 12
          ? 3
          : 4;
  const cardWidth = 320;
  const cardHeight = 200;
  const colGap = 50;
  const rowGap = 60;

  files.forEach((file, idx) => {
    const colIdx = idx % Math.max(1, numCols);
    const rowIdx = Math.floor(idx / Math.max(1, numCols));
    const x = 60 + colIdx * (cardWidth + colGap);
    const y = 60 + rowIdx * (cardHeight + rowGap);

    const fileSymbols = symbolsByFileId.get(file.id) || [];
    const previewSymbols = fileSymbols.slice(0, 3).map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
    }));

    const fileNodeId = `node-file-${file.id}`;

    nodes.push({
      id: fileNodeId,
      type: "fileSummaryNode",
      position: { x, y },
      data: {
        id: file.id,
        name: file.path.split("/").pop() || file.path,
        kind: "file",
        path: file.path,
        language: file.language,
        lineCount: file.line_count,
        symbolCount: fileSymbols.length,
        previewSymbols,
        onExplore: onExploreFile ? () => onExploreFile(file.id) : undefined,
      } satisfies CodebaseNodeData,
    });
  });

  // Inter-file verified edges within this group
  const symbolToFile = new Map<string, string>();
  graph.symbols.forEach((sym) => {
    if (groupFileSet.has(sym.file_id)) {
      symbolToFile.set(sym.id, sym.file_id);
    }
  });

  const fileEdgesMap = new Map<
    string,
    { source: string; target: string; count: number; kinds: Set<string> }
  >();

  graph.edges.forEach((edge) => {
    const srcFileId = symbolToFile.get(edge.source_symbol_id);
    const tgtFileId = symbolToFile.get(edge.target_symbol_id);

    if (srcFileId && tgtFileId && srcFileId !== tgtFileId) {
      const edgeKey = `${srcFileId}->${tgtFileId}`;
      const existing = fileEdgesMap.get(edgeKey) || {
        source: `node-file-${srcFileId}`,
        target: `node-file-${tgtFileId}`,
        count: 0,
        kinds: new Set<string>(),
      };
      existing.count += 1;
      existing.kinds.add(edge.kind);
      fileEdgesMap.set(edgeKey, existing);
    }
  });

  fileEdgesMap.forEach((entry, key) => {
    const kindsStr = Array.from(entry.kinds).join(", ");
    edges.push({
      id: `l2-edge-${key}`,
      source: entry.source,
      target: entry.target,
      type: "bezier",
      label: `${entry.count} ${kindsStr}`,
      labelStyle: {
        fill: "var(--color-text-muted)",
        fontSize: 10,
        fontWeight: 600,
      },
      labelBgStyle: {
        fill: "var(--color-panel)",
        fillOpacity: 0.9,
      },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "var(--color-accent-blue)",
        width: 12,
        height: 12,
      },
      style: {
        stroke: "var(--color-accent-blue)",
        strokeWidth: 2,
      },
    });
  });

  return { nodes, edges };
}

/**
 * Builds L3 React Flow nodes for functions, classes, and components inside a selected file.
 */
export function buildL3NodesAndEdges(
  graph: SourceGraph,
  fileId: string,
  selectedNodeId?: string,
  highlightedPath?: string,
): { nodes: Node[]; edges: Edge[] } {
  const file = graph.files.find((f) => f.id === fileId);
  if (!file) return { nodes: [], edges: [] };

  const symbols = graph.symbols.filter((s) => s.file_id === fileId);
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // File Header Node at top center
  const fileNodeId = `node-file-${file.id}`;
  nodes.push({
    id: fileNodeId,
    type: "fileNode",
    position: { x: 160, y: 40 },
    data: {
      id: file.id,
      name: file.path.split("/").pop() || file.path,
      kind: "file",
      path: file.path,
      language: file.language,
      lineCount: file.line_count,
      symbolCount: symbols.length,
      isHighlighted: highlightedPath === file.path,
    } satisfies CodebaseNodeData,
  });

  // Arrange symbols in a balanced 2D grid under the file header
  const numSymbols = symbols.length;
  const numCols =
    numSymbols <= 3 ? Math.max(1, numSymbols) : numSymbols <= 8 ? 2 : 3;
  const cardWidth = 280;
  const cardHeight = 150;
  const colGap = 40;
  const rowGap = 50;
  const startY = 220;

  symbols.forEach((sym, idx) => {
    const colIdx = idx % Math.max(1, numCols);
    const rowIdx = Math.floor(idx / Math.max(1, numCols));
    const x = 40 + colIdx * (cardWidth + colGap);
    const y = startY + rowIdx * (cardHeight + rowGap);

    const symNodeId = `node-sym-${sym.id}`;
    nodes.push({
      id: symNodeId,
      type: "symbolNode",
      position: { x, y },
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

    // Contains edge from file header to symbol
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
  });

  // Intra-file symbol edges (calls, renders, references, extends)
  const symbolIdSet = new Set(symbols.map((s) => s.id));
  graph.edges.forEach((edge) => {
    if (
      symbolIdSet.has(edge.source_symbol_id) &&
      symbolIdSet.has(edge.target_symbol_id)
    ) {
      let strokeColor = "var(--color-accent-violet)";
      if (edge.kind === "extends") strokeColor = "var(--color-accent-amber)";
      else if (edge.kind === "references")
        strokeColor = "var(--color-accent-blue)";
      else if (edge.kind === "renders") strokeColor = "#5eead4";

      edges.push({
        id: `edge-${edge.id}`,
        source: `node-sym-${edge.source_symbol_id}`,
        target: `node-sym-${edge.target_symbol_id}`,
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
    }
  });

  return { nodes, edges };
}

/**
 * Finds the hierarchy coordinates (groupId, fileId, symbolId) for any symbol ID.
 * Enables repository-wide search jumping directly into L3.
 */
export function findHierarchyLocationForSymbol(
  graph: SourceGraph,
  symbolId: string,
  groups: L1GroupSummary[],
): { groupId: string; fileId: string; symbolId: string } | null {
  const sym = graph.symbols.find((s) => s.id === symbolId);
  if (!sym) return null;

  const file = graph.files.find((f) => f.id === sym.file_id);
  if (!file) return null;

  const group = groups.find((g) => g.fileIds.includes(file.id)) || groups[0];

  return {
    groupId: group ? group.id : "group-root",
    fileId: file.id,
    symbolId: sym.id,
  };
}

/**
 * Finds the hierarchy coordinates (groupId, fileId) for any file path.
 * Enables citation navigation to jump directly to L3 for that file.
 */
export function findHierarchyLocationForPath(
  graph: SourceGraph,
  path: string,
  groups: L1GroupSummary[],
): { groupId: string; fileId: string } | null {
  const file = graph.files.find((f) => f.path === path);
  if (!file) return null;

  const group = groups.find((g) => g.fileIds.includes(file.id)) || groups[0];

  return {
    groupId: group ? group.id : "group-root",
    fileId: file.id,
  };
}
