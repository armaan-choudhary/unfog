import { Node, Edge, MarkerType } from "@xyflow/react";
import { SourceGraph, SourceFile, SourceSymbol, L1GroupSummary } from "./types";
import { CodebaseNodeData } from "../components/Map/CustomNode";

export interface CodebaseEdgeData extends Record<string, unknown> {
  edgeType: "direct" | "aggregated";
  count: number;
  kinds: string[];
  underlyingEdgeIds: string[];
  sourceSymbolId?: string;
  targetSymbolId?: string;
}

export interface BlastRadiusResult {
  activeNodeId: string;
  activeRawId: string;
  activeKind: string;
  activeName: string;
  isHoverPreview: boolean;
  descendantNodeIds?: Set<string>;

  inboundNodeIds: Set<string>;
  outboundNodeIds: Set<string>;
  inboundEdgeIds: Set<string>;
  outboundEdgeIds: Set<string>;

  inboundCount: number;
  outboundCount: number;
  directInboundCount: number;
  directOutboundCount: number;
  aggregatedInboundCount: number;
  aggregatedOutboundCount: number;
}

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
    {
      source: string;
      target: string;
      count: number;
      kinds: Set<string>;
      underlyingEdgeIds: string[];
    }
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
        underlyingEdgeIds: [] as string[],
      };
      existing.count += 1;
      existing.kinds.add(edge.kind);
      existing.underlyingEdgeIds.push(edge.id);
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
      data: {
        edgeType: "aggregated",
        count: link.count,
        kinds: Array.from(link.kinds),
        underlyingEdgeIds: link.underlyingEdgeIds,
      } satisfies CodebaseEdgeData,
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
 * Builds unified React Flow nodes and edges where groups and files expand within the same map.
 * When a group expands (L2), it reveals its files in-place on the canvas.
 * When a file expands (L3), it reveals its symbols and call graph in-place within the same map.
 * All unexpanded groups and files remain on the canvas with accurately routed dependencies.
 */
export function buildUnifiedHierarchyNodesAndEdges(
  graph: SourceGraph,
  groups: L1GroupSummary[],
  expandedGroupIds: Set<string>,
  expandedFileIds: Set<string>,
  onToggleGroup: (groupId: string) => void,
  onToggleFile?: (fileId: string) => void,
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

  // Calculate size for each group based on L2 and L3 expansion states
  const groupDimensions = new Map<
    string,
    {
      width: number;
      height: number;
      files: SourceFile[];
      hasExpandedFile: boolean;
      fileLayouts: Map<
        string,
        {
          width: number;
          height: number;
          relX: number;
          relY: number;
          isExpanded: boolean;
        }
      >;
    }
  >();

  groups.forEach((g) => {
    const isGroupExpanded = expandedGroupIds.has(g.id);
    const groupFiles = graph.files.filter((f) => g.fileIds.includes(f.id));
    const hasExpandedFile = groupFiles.some((f) => expandedFileIds.has(f.id));

    if (!isGroupExpanded) {
      groupDimensions.set(g.id, {
        width: 340,
        height: 220,
        files: groupFiles,
        hasExpandedFile: false,
        fileLayouts: new Map(),
      });
      return;
    }

    const fileLayouts = new Map<
      string,
      {
        width: number;
        height: number;
        relX: number;
        relY: number;
        isExpanded: boolean;
      }
    >();

    if (!hasExpandedFile) {
      // Standard L2 grid: 2 columns of 320px file cards
      const fileCount = groupFiles.length;
      const numCols = fileCount <= 1 ? 1 : 2;
      const width = fileCount <= 1 ? 380 : 710;
      const cardW = 320;
      const cardH = 200;
      const gapX = 25;
      const gapY = 25;
      const startX = 25;
      const startY = 80;

      groupFiles.forEach((f, fIdx) => {
        const c = fIdx % numCols;
        const r = Math.floor(fIdx / numCols);
        fileLayouts.set(f.id, {
          width: cardW,
          height: cardH,
          relX: startX + c * (cardW + gapX),
          relY: startY + r * (cardH + gapY),
          isExpanded: false,
        });
      });

      const rows = Math.max(1, Math.ceil(fileCount / numCols));
      const height = 85 + rows * 225 + 40;
      groupDimensions.set(g.id, {
        width,
        height,
        files: groupFiles,
        hasExpandedFile: false,
        fileLayouts,
      });
    } else {
      // L3 In-Map Expanded layout: vertical stack accommodating expanded files and symbols
      const width = 720;
      const fileW = 660;
      const startX = 30;
      let currentRelY = 85;

      groupFiles.forEach((f) => {
        const isFileExpanded = expandedFileIds.has(f.id);
        let fileH = 240;

        if (isFileExpanded) {
          const syms = symbolsByFileId.get(f.id) || [];
          const symCount = Math.max(1, syms.length);
          const symRows = Math.ceil(symCount / 2);
          fileH = 80 + symRows * 175 + 25;
        }

        fileLayouts.set(f.id, {
          width: fileW,
          height: fileH,
          relX: startX,
          relY: currentRelY,
          isExpanded: isFileExpanded,
        });

        currentRelY += fileH + 25;
      });

      const height = currentRelY + 35;
      groupDimensions.set(g.id, {
        width,
        height,
        files: groupFiles,
        hasExpandedFile: true,
        fileLayouts,
      });
    }
  });

  // Balanced 2-column masonry placement so groups never overlap
  const col0X = 60;
  const col1X = 800;
  const colY = [60, 60];

  groups.forEach((g) => {
    const dim = groupDimensions.get(g.id)!;
    const isGroupExpanded = expandedGroupIds.has(g.id);

    // Pick column with smallest vertical accumulation
    const colIdx = colY[0] <= colY[1] ? 0 : 1;
    const gx = colIdx === 0 ? col0X : col1X;
    const gy = colY[colIdx];
    colY[colIdx] += dim.height + 60;

    if (!isGroupExpanded) {
      // Collapsed group card (L1)
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
      // Expanded Group Container (L2)
      nodes.push({
        id: g.id,
        type: "groupNode",
        position: { x: gx, y: gy },
        style: { width: dim.width, height: dim.height, zIndex: 0 },
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

      // Child file nodes & symbol nodes inside this expanded group
      dim.files.forEach((file) => {
        const layout = dim.fileLayouts.get(file.id)!;
        const fileSymbols = symbolsByFileId.get(file.id) || [];
        const previewSymbols = fileSymbols.slice(0, 4).map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.kind,
        }));

        const isFileExpanded = layout.isExpanded;

        // Emit File Node (either compact module card or expanded frame)
        nodes.push({
          id: `node-file-${file.id}`,
          type: "fileSummaryNode",
          position: { x: layout.relX, y: layout.relY },
          parentId: g.id,
          extent: "parent",
          style: {
            width: layout.width,
            height: layout.height,
            zIndex: isFileExpanded ? 2 : 5,
          },
          data: {
            id: file.id,
            name: file.path.split("/").pop() || file.path,
            kind: "file",
            path: file.path,
            language: file.language,
            lineCount: file.line_count,
            symbolCount: fileSymbols.length,
            previewSymbols,
            isExpanded: isFileExpanded,
            selectedSymbolId: selectedNodeId,
            isHighlighted: highlightedPath === file.path,
            onExplore: onToggleFile ? () => onToggleFile(file.id) : undefined,
            onToggleExpand: onToggleFile
              ? () => onToggleFile(file.id)
              : undefined,
            onSelectSymbol: onSelectSymbol
              ? (symId) => onSelectSymbol(symId)
              : undefined,
          } satisfies CodebaseNodeData,
        });

        // When file is expanded to L3: Emit child symbol nodes in the same map!
        if (isFileExpanded) {
          fileSymbols.forEach((sym, sIdx) => {
            const symCol = sIdx % 2;
            const symRow = Math.floor(sIdx / 2);
            const symRelX = layout.relX + 15 + symCol * 315;
            const symRelY = layout.relY + 75 + symRow * 175;

            nodes.push({
              id: `node-sym-${sym.id}`,
              type: "symbolNode",
              position: { x: symRelX, y: symRelY },
              parentId: g.id,
              extent: "parent",
              style: { zIndex: 10 },
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
          });
        }
      });
    }
  });

  // Calculate dependencies: intra-file symbol edges, inter-file edges, and cross-group edges
  const symbolNodeSet = new Set<string>();
  const fileNodeSet = new Set<string>();
  const groupNodeSet = new Set<string>();

  nodes.forEach((n) => {
    if (n.id.startsWith("node-sym-")) symbolNodeSet.add(n.id);
    else if (n.id.startsWith("node-file-")) fileNodeSet.add(n.id);
    else groupNodeSet.add(n.id);
  });

  // 1. Intra-file symbol call/render/reference edges for L3 expanded files
  graph.edges.forEach((edge) => {
    const srcSymNodeId = `node-sym-${edge.source_symbol_id}`;
    const tgtSymNodeId = `node-sym-${edge.target_symbol_id}`;

    if (symbolNodeSet.has(srcSymNodeId) && symbolNodeSet.has(tgtSymNodeId)) {
      let strokeColor = "var(--color-accent-violet)";
      if (edge.kind === "extends") strokeColor = "var(--color-accent-amber)";
      else if (edge.kind === "references")
        strokeColor = "var(--color-accent-blue)";
      else if (edge.kind === "renders") strokeColor = "#5eead4";

      edges.push({
        id: `intra-sym-${edge.source_symbol_id}->${edge.target_symbol_id}`,
        source: srcSymNodeId,
        target: tgtSymNodeId,
        type: "bezier",
        label: edge.kind,
        data: {
          edgeType: "direct",
          count: 1,
          kinds: [edge.kind],
          underlyingEdgeIds: [edge.id],
          sourceSymbolId: edge.source_symbol_id,
          targetSymbolId: edge.target_symbol_id,
        } satisfies CodebaseEdgeData,
        labelStyle: {
          fill: "var(--color-text-muted)",
          fontSize: 9,
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
          color: strokeColor,
          width: 12,
          height: 12,
        },
        style: {
          stroke: strokeColor,
          strokeWidth: 2,
        },
        animated: true,
      });
    }
  });

  // 2. Inter-file and Cross-group aggregated edges
  const aggregatedEdges = new Map<
    string,
    {
      source: string;
      target: string;
      count: number;
      kinds: Set<string>;
      underlyingEdgeIds: string[];
      isIntraGroup: boolean;
    }
  >();

  graph.edges.forEach((edge) => {
    const srcGroupId = symbolToGroup.get(edge.source_symbol_id);
    const tgtGroupId = symbolToGroup.get(edge.target_symbol_id);
    const srcFileId = symbolToFile.get(edge.source_symbol_id);
    const tgtFileId = symbolToFile.get(edge.target_symbol_id);

    if (!srcGroupId || !tgtGroupId) return;

    // Determine currently visible source endpoint
    let srcEndpoint: string | null = null;
    const srcSymId = `node-sym-${edge.source_symbol_id}`;
    const srcFileNodeId = `node-file-${srcFileId}`;

    if (symbolNodeSet.has(srcSymId)) {
      srcEndpoint = srcSymId;
    } else if (fileNodeSet.has(srcFileNodeId)) {
      srcEndpoint = srcFileNodeId;
    } else if (groupNodeSet.has(srcGroupId)) {
      srcEndpoint = srcGroupId;
    }

    // Determine currently visible target endpoint
    let tgtEndpoint: string | null = null;
    const tgtSymId = `node-sym-${edge.target_symbol_id}`;
    const tgtFileNodeId = `node-file-${tgtFileId}`;

    if (symbolNodeSet.has(tgtSymId)) {
      tgtEndpoint = tgtSymId;
    } else if (fileNodeSet.has(tgtFileNodeId)) {
      tgtEndpoint = tgtFileNodeId;
    } else if (groupNodeSet.has(tgtGroupId)) {
      tgtEndpoint = tgtGroupId;
    }

    if (!srcEndpoint || !tgtEndpoint || srcEndpoint === tgtEndpoint) return;

    // Avoid duplicate symbol-level edges already emitted above
    if (
      srcEndpoint.startsWith("node-sym-") &&
      tgtEndpoint.startsWith("node-sym-")
    ) {
      return;
    }

    const edgeKey = `${srcEndpoint}->${tgtEndpoint}`;
    const isIntra = srcGroupId === tgtGroupId;
    const existing = aggregatedEdges.get(edgeKey) || {
      source: srcEndpoint,
      target: tgtEndpoint,
      count: 0,
      kinds: new Set<string>(),
      underlyingEdgeIds: [] as string[],
      isIntraGroup: isIntra,
    };
    existing.count += 1;
    existing.kinds.add(edge.kind);
    existing.underlyingEdgeIds.push(edge.id);
    aggregatedEdges.set(edgeKey, existing);
  });

  aggregatedEdges.forEach((entry, key) => {
    const kindsStr = Array.from(entry.kinds).join(", ");
    const isIntra = entry.isIntraGroup;
    const strokeColor = isIntra
      ? "var(--color-accent-blue)"
      : "var(--color-accent-violet)";
    const isDirect =
      entry.source.startsWith("node-sym-") &&
      entry.target.startsWith("node-sym-");

    edges.push({
      id: `edge-${key}`,
      source: entry.source,
      target: entry.target,
      type: "bezier",
      label: `${entry.count} ${entry.count === 1 ? "dep" : "deps"} (${kindsStr})`,
      data: {
        edgeType: isDirect ? "direct" : "aggregated",
        count: entry.count,
        kinds: Array.from(entry.kinds),
        underlyingEdgeIds: entry.underlyingEdgeIds,
      } satisfies CodebaseEdgeData,
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
    {
      source: string;
      target: string;
      count: number;
      kinds: Set<string>;
      underlyingEdgeIds: string[];
    }
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
        underlyingEdgeIds: [] as string[],
      };
      existing.count += 1;
      existing.kinds.add(edge.kind);
      existing.underlyingEdgeIds.push(edge.id);
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
      data: {
        edgeType: "aggregated",
        count: entry.count,
        kinds: Array.from(entry.kinds),
        underlyingEdgeIds: entry.underlyingEdgeIds,
      } satisfies CodebaseEdgeData,
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
        data: {
          edgeType: "direct",
          count: 1,
          kinds: [edge.kind],
          underlyingEdgeIds: [edge.id],
          sourceSymbolId: edge.source_symbol_id,
          targetSymbolId: edge.target_symbol_id,
        } satisfies CodebaseEdgeData,
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

/**
 * Calculates verified incoming and outgoing blast radius relationships from indexed edges.
 * Supports active nodes at any level: Group (L1), File (L2), or Symbol (L3).
 */
export function calculateBlastRadius(
  activeNodeId: string,
  nodes: Node[],
  edges: Edge[],
  graph: SourceGraph,
  groups: L1GroupSummary[],
  isHoverPreview = false,
): BlastRadiusResult | null {
  const activeNode = nodes.find((n) => n.id === activeNodeId);
  if (!activeNode) return null;

  const nodeData = activeNode.data as unknown as CodebaseNodeData;
  const activeKind = (nodeData?.kind as string) || "unknown";
  const activeName = (nodeData?.name as string) || activeNodeId;
  const activeRawId = (nodeData?.id as string) || activeNodeId;

  // Collect active node and all its child/descendant nodes currently on canvas
  const activeNodeAndDescendantIds = new Set<string>([activeNodeId]);

  // If active node is an expanded group, include its child file nodes and symbol nodes
  nodes.forEach((n) => {
    if (n.parentId === activeNodeId) {
      activeNodeAndDescendantIds.add(n.id);
    }
  });

  // If active node is a file node (e.g. node-file-xxx), also include its child symbol nodes if visible
  if (activeNodeId.startsWith("node-file-")) {
    const rawFileId = activeRawId;
    const fileSymbols = graph.symbols.filter((s) => s.file_id === rawFileId);
    const symNodeIdSet = new Set(fileSymbols.map((s) => `node-sym-${s.id}`));
    nodes.forEach((n) => {
      if (symNodeIdSet.has(n.id)) {
        activeNodeAndDescendantIds.add(n.id);
      }
    });
  }

  // If active node is a group node (e.g. group-xxx), include all files and symbols in this group
  if (activeNodeId.startsWith("group-") || activeKind === "group") {
    const group = groups.find(
      (g) => g.id === activeRawId || g.id === activeNodeId,
    );
    if (group) {
      const fileIdSet = new Set(group.fileIds);
      const groupSymbols = graph.symbols.filter((s) =>
        fileIdSet.has(s.file_id),
      );
      const fileNodeIdSet = new Set(
        group.fileIds.map((fid) => `node-file-${fid}`),
      );
      const symNodeIdSet = new Set(groupSymbols.map((s) => `node-sym-${s.id}`));
      nodes.forEach((n) => {
        if (fileNodeIdSet.has(n.id) || symNodeIdSet.has(n.id)) {
          activeNodeAndDescendantIds.add(n.id);
        }
      });
    }
  }

  const inboundNodeIds = new Set<string>();
  const outboundNodeIds = new Set<string>();
  const inboundEdgeIds = new Set<string>();
  const outboundEdgeIds = new Set<string>();

  let inboundCount = 0;
  let outboundCount = 0;
  let directInboundCount = 0;
  let directOutboundCount = 0;
  let aggregatedInboundCount = 0;
  let aggregatedOutboundCount = 0;

  edges.forEach((edge) => {
    // Skip contains- edges (hierarchy containment, not dependencies)
    if (edge.id.startsWith("edge-contains-")) return;

    const edgeData = edge.data as CodebaseEdgeData | undefined;
    const weight = edgeData?.count ?? 1;
    const isDirect =
      edgeData?.edgeType === "direct" ||
      (edge.source.startsWith("node-sym-") &&
        edge.target.startsWith("node-sym-"));

    const isSourceActive = activeNodeAndDescendantIds.has(edge.source);
    const isTargetActive = activeNodeAndDescendantIds.has(edge.target);

    // If both endpoints are inside the active node, it's internal
    if (isSourceActive && isTargetActive) {
      return;
    }

    if (isSourceActive && !isTargetActive) {
      // Outbound from active node
      outboundEdgeIds.add(edge.id);
      outboundNodeIds.add(edge.target);
      outboundCount += weight;
      if (isDirect) {
        directOutboundCount += weight;
      } else {
        aggregatedOutboundCount += weight;
      }
    } else if (isTargetActive && !isSourceActive) {
      // Inbound to active node
      inboundEdgeIds.add(edge.id);
      inboundNodeIds.add(edge.source);
      inboundCount += weight;
      if (isDirect) {
        directInboundCount += weight;
      } else {
        aggregatedInboundCount += weight;
      }
    }
  });

  return {
    activeNodeId,
    activeRawId,
    activeKind,
    activeName,
    isHoverPreview,
    descendantNodeIds: activeNodeAndDescendantIds,
    inboundNodeIds,
    outboundNodeIds,
    inboundEdgeIds,
    outboundEdgeIds,
    inboundCount,
    outboundCount,
    directInboundCount,
    directOutboundCount,
    aggregatedInboundCount,
    aggregatedOutboundCount,
  };
}

/**
 * Applies blast radius styling to graph nodes and edges without recalculating layout positions:
 * - Inbound connections in Teal (#71c2bd)
 * - Outbound connections in Violet (#7665ca)
 * - Dims unrelated nodes and edges to 20-30% opacity
 * - Preserves ancestor containers so child cards are not visually obscured
 */
export function applyBlastRadiusToGraph(
  nodes: Node[],
  edges: Edge[],
  blastRadius: BlastRadiusResult | null,
): { nodes: Node[]; edges: Edge[] } {
  if (!blastRadius) {
    // Normal graph state: clear blast radius overrides, restore normal opacity
    const restoredNodes = nodes.map((node) => {
      const data = node.data as unknown as CodebaseNodeData;
      if (!data.blastRadiusState || data.blastRadiusState === "normal") {
        return node;
      }
      return {
        ...node,
        style: {
          ...node.style,
          opacity: 1,
        },
        data: {
          ...data,
          blastRadiusState: "normal" as const,
        },
      };
    });

    const restoredEdges = edges.map((edge) => {
      const edgeData = edge.data as CodebaseEdgeData | undefined;
      const isDirect = edgeData?.edgeType === "direct";
      const strokeColor = isDirect
        ? "var(--color-accent-violet)"
        : "var(--color-accent-violet)";
      return {
        ...edge,
        style: {
          ...edge.style,
          stroke:
            edge.style?.stroke &&
            edge.style.stroke !== "#71c2bd" &&
            edge.style.stroke !== "#7665ca"
              ? edge.style.stroke
              : strokeColor,
          opacity: 1,
        },
        animated: edge.animated ?? true,
      };
    });

    return { nodes: restoredNodes, edges: restoredEdges };
  }

  // Active blast radius:
  // Preserved nodes: active node, all descendants, inbound sources, outbound targets, and their parent containers
  const preservedNodeIds = new Set<string>([blastRadius.activeNodeId]);
  blastRadius.inboundNodeIds.forEach((id) => preservedNodeIds.add(id));
  blastRadius.outboundNodeIds.forEach((id) => preservedNodeIds.add(id));
  if (blastRadius.descendantNodeIds) {
    blastRadius.descendantNodeIds.forEach((id) => preservedNodeIds.add(id));
  }

  // Also preserve all parent containers of preserved nodes (going UP)
  const parentMap = new Map<string, string>();
  nodes.forEach((n) => {
    if (n.parentId) parentMap.set(n.id, n.parentId);
  });

  preservedNodeIds.forEach((id) => {
    let p = parentMap.get(id);
    while (p) {
      preservedNodeIds.add(p);
      p = parentMap.get(p);
    }
  });

  // Preserve all child nodes of any preserved/active container (going DOWN)
  // Selecting or highlighting an expanded parent must NEVER gray out its child nodes!
  const containerPaths = new Set<string>();
  const containerParentIds = new Set<string>();

  preservedNodeIds.forEach((id) => {
    containerParentIds.add(id);
    const n = nodes.find((node) => node.id === id);
    const nData = n?.data as unknown as CodebaseNodeData;
    if (nData?.path) {
      containerPaths.add(nData.path);
    }
  });

  nodes.forEach((n) => {
    const nData = n.data as unknown as CodebaseNodeData;
    // 1. Direct parentId match (e.g. child file or symbol of an expanded group)
    if (n.parentId && containerParentIds.has(n.parentId)) {
      preservedNodeIds.add(n.id);
    }
    // 2. File path match (e.g. child symbol belonging to an expanded file container)
    if (nData?.path && containerPaths.has(nData.path)) {
      preservedNodeIds.add(n.id);
    }
  });

  // Calculate per-node blast radius state
  const updatedNodes = nodes.map((node) => {
    const data = node.data as unknown as CodebaseNodeData;
    const isPreserved = preservedNodeIds.has(node.id);
    const isActive = node.id === blastRadius.activeNodeId;
    const isInbound = blastRadius.inboundNodeIds.has(node.id);
    const isOutbound = blastRadius.outboundNodeIds.has(node.id);

    let state:
      "active" | "inbound" | "outbound" | "both" | "dimmed" | "normal" =
      "normal";

    if (isActive) {
      state = "active";
    } else if (isInbound && isOutbound) {
      state = "both";
    } else if (isInbound) {
      state = "inbound";
    } else if (isOutbound) {
      state = "outbound";
    } else if (!isPreserved) {
      state = "dimmed";
    } else {
      state = "normal";
    }

    const opacity = isPreserved ? 1.0 : 0.25;

    return {
      ...node,
      style: {
        ...node.style,
        opacity,
      },
      data: {
        ...data,
        blastRadiusState: state,
      },
    };
  });

  // Calculate per-edge blast radius state
  const updatedEdges = edges.map((edge) => {
    // Skip contains edges
    if (edge.id.startsWith("edge-contains-")) {
      const isPreserved =
        preservedNodeIds.has(edge.source) && preservedNodeIds.has(edge.target);
      return {
        ...edge,
        style: {
          ...edge.style,
          opacity: isPreserved ? 0.7 : 0.15,
        },
      };
    }

    const isInbound = blastRadius.inboundEdgeIds.has(edge.id);
    const isOutbound = blastRadius.outboundEdgeIds.has(edge.id);

    if (isInbound) {
      return {
        ...edge,
        style: {
          ...edge.style,
          stroke: "#71c2bd", // Teal for Inbound
          strokeWidth: 2.5,
          opacity: 1.0,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#71c2bd",
          width: 14,
          height: 14,
        },
        labelStyle: {
          fill: "#71c2bd",
          fontSize: 10,
          fontWeight: 700,
        },
        labelBgStyle: {
          fill: "rgba(18, 30, 32, 0.95)",
          color: "#71c2bd",
          fillOpacity: 0.95,
        },
        animated: true,
        zIndex: 15,
      };
    }

    if (isOutbound) {
      return {
        ...edge,
        style: {
          ...edge.style,
          stroke: "#7665ca", // Violet for Outbound
          strokeWidth: 2.5,
          opacity: 1.0,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#7665ca",
          width: 14,
          height: 14,
        },
        labelStyle: {
          fill: "#c4b5fd",
          fontSize: 10,
          fontWeight: 700,
        },
        labelBgStyle: {
          fill: "rgba(28, 20, 42, 0.95)",
          color: "#c4b5fd",
          fillOpacity: 0.95,
        },
        animated: true,
        zIndex: 15,
      };
    }

    // Unrelated edge: dim to 20% opacity
    return {
      ...edge,
      style: {
        ...edge.style,
        stroke: "var(--color-border)",
        strokeWidth: 1,
        opacity: 0.2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "var(--color-border)",
        width: 10,
        height: 10,
      },
      labelStyle: {
        opacity: 0.2,
      },
      labelBgStyle: {
        fill: "var(--color-panel)",
        fillOpacity: 0.2,
      },
      animated: false,
      zIndex: 12,
    };
  });

  return { nodes: updatedNodes, edges: updatedEdges };
}
