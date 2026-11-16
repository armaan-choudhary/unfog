"use client";

import React, {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Search,
  ArrowLeft,
  ChevronRight,
  FolderTree,
  FileCode,
  RotateCcw,
  SearchX,
  ArrowDownLeft,
  ArrowUpRight,
  X,
} from "lucide-react";
import { SourceGraph, HierarchyLevel } from "../../lib/types";
import {
  SymbolNode,
  FileNode,
  GroupNode,
  FileSummaryNode,
  CodebaseNodeData,
} from "./CustomNode";
import {
  extractL1Groups,
  buildUnifiedHierarchyNodesAndEdges,
  findHierarchyLocationForSymbol,
  findHierarchyLocationForPath,
  calculateBlastRadius,
  applyBlastRadiusToGraph,
} from "../../lib/hierarchy";
import styles from "./CodebaseMap.module.css";

const nodeTypes = {
  groupNode: GroupNode,
  fileSummaryNode: FileSummaryNode,
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
  const { fitView, setCenter } = useReactFlow();

  // Hierarchy state: L1 (Architecture) -> L2 (Modules) -> L3 (Code)
  const [level, setLevel] = useState<HierarchyLevel>("L1");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  // In-map group and file expansion state: tracks which groups and files are expanded on canvas
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    new Set(),
  );
  const [expandedFileIds, setExpandedFileIds] = useState<Set<string>>(
    new Set(),
  );

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Derive L1 architecture groups from indexed source files
  const l1Groups = useMemo(() => {
    return extractL1Groups(graph);
  }, [graph]);

  // Adjust hierarchy state when repo, selected node, or citation path changes
  const [prevRepoId, setPrevRepoId] = useState(graph.snapshot?.repository_id);
  const [prevSelectedNodeId, setPrevSelectedNodeId] = useState(selectedNodeId);
  const [prevHighlightedPath, setPrevHighlightedPath] =
    useState(highlightedPath);

  if (graph.snapshot?.repository_id !== prevRepoId) {
    setPrevRepoId(graph.snapshot?.repository_id);
    setLevel("L1");
    setSelectedGroupId(null);
    setSelectedFileId(null);
    setExpandedGroupIds(new Set());
    setExpandedFileIds(new Set());
    setSearchQuery("");
  } else if (selectedNodeId && selectedNodeId !== prevSelectedNodeId) {
    setPrevSelectedNodeId(selectedNodeId);
    const loc = findHierarchyLocationForSymbol(graph, selectedNodeId, l1Groups);
    if (loc) {
      setSelectedGroupId(loc.groupId);
      setExpandedGroupIds((prev) => new Set([...prev, loc.groupId]));
      setSelectedFileId(loc.fileId);
      setExpandedFileIds((prev) => new Set([...prev, loc.fileId]));
      setLevel("L3");
    }
  } else if (highlightedPath && highlightedPath !== prevHighlightedPath) {
    setPrevHighlightedPath(highlightedPath);
    const loc = findHierarchyLocationForPath(graph, highlightedPath, l1Groups);
    if (loc) {
      setSelectedGroupId(loc.groupId);
      setExpandedGroupIds((prev) => new Set([...prev, loc.groupId]));
      setSelectedFileId(loc.fileId);
      setExpandedFileIds((prev) => new Set([...prev, loc.fileId]));
      setLevel("L3");
    }
  }

  // Toggle in-map group expansion
  const handleToggleGroup = useCallback((groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
        if (next.size === 0) setLevel("L1");
      } else {
        next.add(groupId);
        setSelectedGroupId(groupId);
        setLevel("L2");
      }
      return next;
    });
  }, []);

  // Toggle in-map file expansion (L3 symbols in the same map)
  const handleToggleFile = useCallback(
    (fileId: string) => {
      setExpandedFileIds((prev) => {
        const next = new Set(prev);
        if (next.has(fileId)) {
          next.delete(fileId);
          if (next.size === 0) {
            setLevel(expandedGroupIds.size > 0 ? "L2" : "L1");
          }
        } else {
          next.add(fileId);
          setSelectedFileId(fileId);
          // Ensure parent group is expanded in map
          const fileObj = graph.files.find((f) => f.id === fileId);
          if (fileObj) {
            const loc = findHierarchyLocationForPath(
              graph,
              fileObj.path,
              l1Groups,
            );
            if (loc) {
              setSelectedGroupId(loc.groupId);
              setExpandedGroupIds((gPrev) => new Set([...gPrev, loc.groupId]));
            }
          }
          setLevel("L3");
        }
        return next;
      });
    },
    [graph, l1Groups, expandedGroupIds],
  );

  const handleExpandAll = useCallback(() => {
    setExpandedGroupIds(new Set(l1Groups.map((g) => g.id)));
    setExpandedFileIds(new Set(graph.files.map((f) => f.id)));
    setLevel("L3");
  }, [l1Groups, graph.files]);

  const handleCollapseAll = useCallback(() => {
    setExpandedGroupIds(new Set());
    setExpandedFileIds(new Set());
    setLevel("L1");
  }, []);

  const handleGoBack = useCallback(() => {
    if (expandedFileIds.size > 0 || level === "L3") {
      setExpandedFileIds(new Set());
      setLevel("L2");
    } else if (expandedGroupIds.size > 0 || level === "L2") {
      setExpandedGroupIds(new Set());
      setLevel("L1");
    }
  }, [expandedFileIds, expandedGroupIds, level]);

  // Active group and file helpers
  const activeGroup = useMemo(() => {
    if (!selectedGroupId) return l1Groups[0] || null;
    return (
      l1Groups.find((g) => g.id === selectedGroupId) || l1Groups[0] || null
    );
  }, [l1Groups, selectedGroupId]);

  const activeFile = useMemo(() => {
    if (!selectedFileId) {
      if (activeGroup && activeGroup.fileIds.length > 0) {
        return graph.files.find((f) => f.id === activeGroup.fileIds[0]) || null;
      }
      return graph.files[0] || null;
    }
    return (
      graph.files.find((f) => f.id === selectedFileId) || graph.files[0] || null
    );
  }, [graph.files, selectedFileId, activeGroup]);

  // Generate nodes and edges where both L2 (files) and L3 (symbols) expand within the same map
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    return buildUnifiedHierarchyNodesAndEdges(
      graph,
      l1Groups,
      expandedGroupIds,
      expandedFileIds,
      handleToggleGroup,
      handleToggleFile,
      (symId) => {
        const sym = graph.symbols.find((s) => s.id === symId);
        if (sym) {
          const file = graph.files.find((f) => f.id === sym.file_id);
          onSelectNode({
            id: sym.id,
            name: sym.name,
            kind: sym.kind,
            path: file?.path || "",
            language: sym.language || file?.language,
            range: sym.range,
            docstring: sym.docstring || undefined,
            isHighlighted: true,
          });
        }
      },
      selectedNodeId,
      highlightedPath,
    );
  }, [
    graph,
    l1Groups,
    expandedGroupIds,
    expandedFileIds,
    selectedNodeId,
    highlightedPath,
    handleToggleGroup,
    handleToggleFile,
    onSelectNode,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync React Flow nodes and edges when level or dependencies change
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Auto-fit viewport smoothly whenever level, expanded groups/files, or selection changes
  const expandedGroupKey = Array.from(expandedGroupIds).sort().join(",");
  const expandedFileKey = Array.from(expandedFileIds).sort().join(",");

  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({
        padding: 0.15,
        minZoom: 0.55,
        maxZoom: 0.85,
        duration: 400,
      });
    }, 60);
    return () => clearTimeout(timer);
  }, [
    level,
    selectedGroupId,
    selectedFileId,
    expandedGroupKey,
    expandedFileKey,
    fitView,
  ]);

  // Center on symbol in L3 when selectedNodeId changes
  useEffect(() => {
    if (level !== "L3" || !selectedNodeId) return;
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
  }, [level, selectedNodeId, nodes, setCenter]);

  // Hover preview and persistent selection state for Dependency Blast Radius
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [userSelectedNodeId, setUserSelectedNodeId] = useState<string | null>(
    selectedNodeId || null,
  );
  const [prevSelectedNodeProp, setPrevSelectedNodeProp] =
    useState(selectedNodeId);

  // Sync selection when selectedNodeId prop changes (React recommended pattern)
  if (selectedNodeId !== prevSelectedNodeProp) {
    setPrevSelectedNodeProp(selectedNodeId);
    setUserSelectedNodeId(selectedNodeId || null);
  }

  // Resolve matching canvas node ID for selected entity
  const selectedCanvasNodeId = useMemo(() => {
    if (!userSelectedNodeId) return null;
    const matched = nodes.find((n) => {
      const d = n.data as unknown as CodebaseNodeData;
      return (
        d?.id === userSelectedNodeId ||
        n.id === userSelectedNodeId ||
        n.id === `node-sym-${userSelectedNodeId}` ||
        n.id === `node-file-${userSelectedNodeId}` ||
        n.id === `group-${userSelectedNodeId}`
      );
    });
    return matched ? matched.id : userSelectedNodeId;
  }, [userSelectedNodeId, nodes]);

  // Node click handler: selects node persistently and toggles if already selected
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const nodeData = node.data as unknown as CodebaseNodeData;
      if (!nodeData) return;

      if (
        userSelectedNodeId === node.id ||
        userSelectedNodeId === nodeData.id
      ) {
        // Toggle/deselect on click of already selected node
        setUserSelectedNodeId(null);
        return;
      }

      setUserSelectedNodeId(node.id);
      onSelectNode(nodeData);
    },
    [userSelectedNodeId, onSelectNode],
  );

  // Double click toggles expand/collapse for groups and files
  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const nodeData = node.data as unknown as CodebaseNodeData;
      if (!nodeData) return;

      if (nodeData.kind === "group") {
        handleToggleGroup(nodeData.id);
      } else if (nodeData.kind === "file") {
        handleToggleFile(nodeData.id);
      }
    },
    [handleToggleGroup, handleToggleFile],
  );

  // Node hover handlers for temporary hover preview
  const handleNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setHoveredNodeId(node.id);
    },
    [],
  );

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  // Empty canvas pane click clears selection and hover
  const handlePaneClick = useCallback(() => {
    setUserSelectedNodeId(null);
    setHoveredNodeId(null);
  }, []);

  // Clear selection recovery action
  const handleClearSelection = useCallback(() => {
    setUserSelectedNodeId(null);
    setHoveredNodeId(null);
  }, []);

  // Clear filters recovery action
  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    setFilterKind("all");
  }, []);

  // Keyboard accessibility: Ctrl+K / Cmd+K to focus search, Escape to clear search or selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchFocused(true);
      } else if (e.key === "Escape") {
        if (searchQuery) {
          setSearchQuery("");
        } else if (userSelectedNodeId) {
          setUserSelectedNodeId(null);
        }
        setIsSearchFocused(false);
        searchInputRef.current?.blur();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery, userSelectedNodeId]);

  // Active blast radius target is hovered node (hover preview) or persistently selected node
  const activeBlastNodeId = hoveredNodeId || selectedCanvasNodeId;
  const isHoverPreview = Boolean(
    hoveredNodeId && hoveredNodeId !== selectedCanvasNodeId,
  );

  const blastRadius = useMemo(() => {
    if (!activeBlastNodeId) return null;
    return calculateBlastRadius(
      activeBlastNodeId,
      nodes,
      edges,
      graph,
      l1Groups,
      isHoverPreview,
    );
  }, [activeBlastNodeId, nodes, edges, graph, l1Groups, isHoverPreview]);

  // Filter nodes for search query and entity kinds
  const filteredNodes = useMemo(() => {
    return nodes.map((node) => {
      const data = node.data as unknown as CodebaseNodeData;

      const matchesKind =
        filterKind === "all" ||
        (filterKind === "component" && data.kind === "component") ||
        (filterKind === "file" && data.kind === "file") ||
        (filterKind === "function" &&
          (data.kind === "function" || data.kind === "method")) ||
        (filterKind === "class" && data.kind === "class");

      const matchesSearch =
        searchQuery === "" ||
        data.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        data.path.toLowerCase().includes(searchQuery.toLowerCase());

      const isHidden = !matchesKind || !matchesSearch;

      return {
        ...node,
        hidden: isHidden,
        selected:
          selectedCanvasNodeId === node.id || selectedNodeId === data.id,
      };
    });
  }, [nodes, filterKind, searchQuery, selectedCanvasNodeId, selectedNodeId]);

  // Apply blast radius styles to nodes & edges without recalculating layout
  const { nodes: displayNodes, edges: displayEdges } = useMemo(() => {
    return applyBlastRadiusToGraph(filteredNodes, edges, blastRadius);
  }, [filteredNodes, edges, blastRadius]);

  // Count visible nodes after filtering
  const visibleNodeCount = useMemo(() => {
    return displayNodes.filter((n) => !n.hidden).length;
  }, [displayNodes]);

  // Global repository search results (matches across all symbols and files)
  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.trim().length < 2) return [];
    const q = searchQuery.toLowerCase().trim();

    const matches: Array<{
      id: string;
      name: string;
      path: string;
      kind: string;
      symbolId?: string;
      fileId: string;
      groupId: string;
    }> = [];

    // Search symbols
    for (const sym of graph.symbols) {
      if (
        sym.name.toLowerCase().includes(q) ||
        (sym.qualified_name && sym.qualified_name.toLowerCase().includes(q))
      ) {
        const loc = findHierarchyLocationForSymbol(graph, sym.id, l1Groups);
        const file = graph.files.find((f) => f.id === sym.file_id);
        if (loc && file) {
          matches.push({
            id: sym.id,
            name: sym.name,
            path: file.path,
            kind: sym.kind,
            symbolId: sym.id,
            fileId: loc.fileId,
            groupId: loc.groupId,
          });
        }
        if (matches.length >= 8) break;
      }
    }

    // Search files
    if (matches.length < 8) {
      for (const file of graph.files) {
        if (file.path.toLowerCase().includes(q)) {
          const loc = findHierarchyLocationForPath(graph, file.path, l1Groups);
          if (loc) {
            matches.push({
              id: file.id,
              name: file.path.split("/").pop() || file.path,
              path: file.path,
              kind: "file",
              fileId: file.id,
              groupId: loc.groupId,
            });
          }
          if (matches.length >= 8) break;
        }
      }
    }

    return matches;
  }, [searchQuery, graph, l1Groups]);

  // Jump from search result directly to hierarchy location
  const handleSelectSearchResult = useCallback(
    (item: (typeof searchResults)[0]) => {
      setSelectedGroupId(item.groupId);
      setExpandedGroupIds((prev) => new Set([...prev, item.groupId]));
      setSelectedFileId(item.fileId);
      setExpandedFileIds((prev) => new Set([...prev, item.fileId]));
      setLevel("L3");
      setSearchQuery("");
      setIsSearchFocused(false);

      if (item.symbolId) {
        const sym = graph.symbols.find((s) => s.id === item.symbolId);
        if (sym) {
          onSelectNode({
            id: sym.id,
            name: sym.name,
            kind: sym.kind,
            path: item.path,
            language: sym.language,
            qualifiedName: sym.qualified_name || undefined,
            range: sym.range,
            docstring: sym.docstring || undefined,
          });
        }
      }
    },
    [graph, onSelectNode],
  );

  return (
    <div className={styles.mapWrapper}>
      {/* Top Map Toolbar: Breadcrumbs, Controls, Level Selector & Search */}
      <div className={styles.mapToolbar}>
        {/* Row 1: Breadcrumb Trail & Level Pills */}
        <div className={styles.breadcrumbsBar}>
          {level !== "L1" && (
            <button
              type="button"
              className={styles.backBtn}
              onClick={handleGoBack}
              title="Navigate up one hierarchy level"
            >
              <ArrowLeft size={13} />
              <span>Back</span>
            </button>
          )}

          {/* Breadcrumb: L1 Root */}
          <button
            type="button"
            className={`${styles.breadcrumbBtn} ${
              level === "L1" ? styles.breadcrumbActive : ""
            }`}
            onClick={handleCollapseAll}
          >
            <FolderTree size={14} />
            <span>Project</span>
          </button>

          {/* Breadcrumb: L2 Group */}
          {level !== "L1" && activeGroup && (
            <>
              <ChevronRight size={12} className={styles.breadcrumbSep} />
              <button
                type="button"
                className={`${styles.breadcrumbBtn} ${
                  level === "L2" ? styles.breadcrumbActive : ""
                }`}
                onClick={() => {
                  setExpandedFileIds(new Set());
                  setLevel("L2");
                }}
              >
                <span>{activeGroup.name}</span>
              </button>
            </>
          )}

          {/* Breadcrumb: L3 File */}
          {level === "L3" && activeFile && (
            <>
              <ChevronRight size={12} className={styles.breadcrumbSep} />
              <span
                className={`${styles.breadcrumbBtn} ${styles.breadcrumbActive}`}
              >
                <FileCode size={13} />
                <span>
                  {activeFile.path.split("/").pop() || activeFile.path}
                </span>
              </span>
            </>
          )}

          {/* Level Switcher Badges */}
          <div className={styles.levelIndicatorGroup}>
            <button
              type="button"
              className={`${styles.levelPill} ${
                level === "L1" ? styles.levelPillActive : ""
              }`}
              onClick={handleCollapseAll}
              title="Level 1: Project Architecture (Collapse all groups)"
            >
              L1 Architecture
            </button>
            <button
              type="button"
              className={`${styles.levelPill} ${
                level === "L2" ? styles.levelPillActiveL2 : ""
              }`}
              onClick={() => {
                setExpandedFileIds(new Set());
                if (expandedGroupIds.size === 0 && l1Groups.length > 0) {
                  const targetGid = selectedGroupId || l1Groups[0].id;
                  setSelectedGroupId(targetGid);
                  setExpandedGroupIds(new Set([targetGid]));
                }
                setLevel("L2");
              }}
              title="Level 2: Modules & Files (In-Map Expanded Groups)"
            >
              L2 Modules
            </button>
            <button
              type="button"
              className={`${styles.levelPill} ${
                level === "L3" ? styles.levelPillActiveL3 : ""
              }`}
              onClick={() => {
                if (activeFile) {
                  setExpandedFileIds(new Set([activeFile.id]));
                  if (activeGroup) {
                    setExpandedGroupIds(
                      (prev) => new Set([...prev, activeGroup.id]),
                    );
                  }
                  setLevel("L3");
                }
              }}
              title="Level 3: Functions & Code (In-Map Expanded Symbols)"
            >
              L3 Code
            </button>
          </div>

          {/* In-Map Expansion Quick Toggles */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              marginLeft: "auto",
            }}
          >
            <button
              type="button"
              className={styles.expandToggleBtn}
              onClick={handleExpandAll}
              title="Expand all groups within the same map"
            >
              Expand All
            </button>
            <button
              type="button"
              className={styles.expandToggleBtn}
              onClick={handleCollapseAll}
              title="Collapse all groups back to architecture cards"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Row 2: Search & Filter Toolbar */}
        <div className={styles.toolbarRow}>
          <div className={styles.searchContainer}>
            <Search size={14} className={styles.searchIcon} />
            <input
              ref={searchInputRef}
              type="text"
              className={styles.searchInput}
              placeholder="Search repository..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
            />
            {searchQuery ? (
              <button
                type="button"
                className={styles.searchClearBtn}
                onClick={() => setSearchQuery("")}
                title="Clear search query"
              >
                <X size={12} />
              </button>
            ) : (
              <kbd
                className={styles.searchKbdShortcut}
                title="Press Ctrl+K or Cmd+K to search"
              >
                ⌘K
              </kbd>
            )}
          </div>

          {/* Global search auto-complete dropdown */}
          {isSearchFocused && searchResults.length > 0 && (
            <div className={styles.searchResultsDropdown}>
              {searchResults.map((res) => (
                <button
                  key={`${res.kind}-${res.id}`}
                  type="button"
                  className={styles.searchResultItem}
                  onMouseDown={() => handleSelectSearchResult(res)}
                >
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span className={styles.searchResultTitle}>{res.name}</span>
                    <span className={styles.searchResultPath}>{res.path}</span>
                  </div>
                  <span
                    style={{
                      fontSize: "0.625rem",
                      textTransform: "uppercase",
                      color:
                        res.kind === "component"
                          ? "#5eead4"
                          : res.kind === "file"
                            ? "#38bdf8"
                            : "#c4b5fd",
                      fontWeight: 700,
                    }}
                  >
                    {res.kind}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Kind filters for current level */}
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
      </div>

      {/* Empty Filter State (Recovery Action when 0 nodes match) */}
      {visibleNodeCount === 0 && (
        <div className={styles.emptyFilterState}>
          <SearchX size={36} className={styles.emptyFilterIcon} />
          <div className={styles.emptyFilterTitle}>No matching nodes found</div>
          <div className={styles.emptyFilterSubtitle}>
            {searchQuery && `No codebase entities matching "${searchQuery}"`}
            {searchQuery && filterKind !== "all" && " with "}
            {filterKind !== "all" && `kind "${filterKind}"`}
          </div>
          <button
            type="button"
            className={styles.clearFiltersBtn}
            onClick={handleClearFilters}
          >
            <RotateCcw size={13} />
            <span>Clear Filters</span>
          </button>
        </div>
      )}

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onPaneClick={handlePaneClick}
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
          position="bottom-right"
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
          position="bottom-right"
          nodeColor={(node) => {
            const data = node.data as unknown as CodebaseNodeData;
            if (data.kind === "group") return "#a78bfa";
            if (data.kind === "component") return "#5eead4";
            if (data.kind === "file") return "#38bdf8";
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

      {/* Dependency Blast Radius HUD */}
      {blastRadius && (
        <div className={styles.blastRadiusHud}>
          <div className={styles.blastRadiusHeader}>
            <div className={styles.blastRadiusBadgeGroup}>
              <span className={styles.blastRadiusPulse} />
              <span className={styles.blastRadiusTitle}>Blast Radius:</span>
              <span
                className={styles.blastRadiusNodeName}
                title={blastRadius.activeName}
              >
                {blastRadius.activeName}
              </span>
              <span className={styles.blastRadiusKindBadge}>
                {blastRadius.activeKind}
              </span>
              {blastRadius.isHoverPreview ? (
                <span className={styles.previewTag}>Hover Preview</span>
              ) : (
                <span className={styles.selectedTag}>Selected</span>
              )}
            </div>

            {!blastRadius.isHoverPreview && (
              <button
                type="button"
                className={styles.clearSelectionBtn}
                onClick={handleClearSelection}
                title="Clear node selection and restore normal graph state"
              >
                <X size={12} />
                <span>Clear Selection</span>
              </button>
            )}
          </div>

          <div className={styles.blastRadiusStats}>
            <div
              className={styles.statPillInbound}
              title="Verified incoming relationships from indexed edges (rendered in Teal #71c2bd)"
            >
              <ArrowDownLeft size={13} />
              <span>
                Inbound: <strong>{blastRadius.inboundCount}</strong>
              </span>
              <span className={styles.subCount}>
                ({blastRadius.directInboundCount} direct,{" "}
                {blastRadius.aggregatedInboundCount} aggregated)
              </span>
            </div>

            <div
              className={styles.statPillOutbound}
              title="Verified outgoing relationships from indexed edges (rendered in Violet #7665ca)"
            >
              <ArrowUpRight size={13} />
              <span>
                Outbound: <strong>{blastRadius.outboundCount}</strong>
              </span>
              <span className={styles.subCount}>
                ({blastRadius.directOutboundCount} direct,{" "}
                {blastRadius.aggregatedOutboundCount} aggregated)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Top Right Semantic Legend with Directional Indicators */}
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
        <div className={styles.legendDivider} />
        <div
          className={styles.legendItem}
          title="Inbound dependencies (incoming calls/references rendered in Teal #71c2bd)"
        >
          <span className={`${styles.legendDot} ${styles.inboundDot}`} />
          <span className={styles.inboundLabel}>Inbound (←)</span>
        </div>
        <div
          className={styles.legendItem}
          title="Outbound dependencies (outgoing calls/references rendered in Violet #7665ca)"
        >
          <span className={`${styles.legendDot} ${styles.outboundDot}`} />
          <span className={styles.outboundLabel}>Outbound (→)</span>
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
