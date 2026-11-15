export type ProvenanceKind =
  "static_verified" | "runtime_verified" | "ai_inferred" | "unknown";

export type SymbolKind =
  | "function"
  | "class"
  | "method"
  | "interface"
  | "module"
  | "variable"
  | "property"
  | "unknown";

export type EdgeKind =
  | "import"
  | "contains"
  | "calls"
  | "extends"
  | "references"
  | "renders"
  | "data_flow";

export interface LineRange {
  start_line: number;
  end_line: number;
}

export interface SnapshotRevision {
  kind: "git_commit" | "content_manifest";
  value: string;
}

export interface Snapshot {
  id: string;
  repository_id: string;
  revision: SnapshotRevision;
  manifest_hash: string;
  repository_name?: string;
}

export interface SourceFile {
  id: string;
  snapshot_id: string;
  path: string;
  language: string;
  content_hash: string;
  line_count: number;
}

export interface SourceSymbol {
  id: string;
  snapshot_id: string;
  file_id: string;
  name: string;
  qualified_name?: string | null;
  kind: SymbolKind;
  language: string;
  range: LineRange;
  docstring?: string | null;
}

export interface Citation {
  id: string;
  snapshot_id: string;
  file_id: string;
  path: string;
  range: LineRange;
  content_hash: string;
  snippet?: string;
}

export interface SourceEdge {
  id: string;
  snapshot_id: string;
  source_symbol_id: string;
  target_symbol_id: string;
  kind: EdgeKind;
  provenance: ProvenanceKind;
  evidence_citation_ids: string[];
  analyzer?: string | null;
  analyzer_version?: string | null;
  confidence?: number | null;
}

export interface SourceGraph {
  schema_version: string;
  snapshot: Snapshot;
  files: SourceFile[];
  symbols: SourceSymbol[];
  citations: Citation[];
  edges: SourceEdge[];
}

export interface FileDetailResponse {
  path: string;
  language: string;
  line_count: number;
  content: string;
  content_hash: string;
  symbols: Array<{
    id: string;
    name: string;
    kind: SymbolKind;
    range: LineRange;
  }>;
}

export interface CitationRef {
  path: string;
  range: LineRange;
  snippet?: string;
}

export interface AiExplainRequest {
  symbol_id?: string;
  path: string;
  symbol_name: string;
  prompt?: string;
}

export interface AiExplainResponse {
  explanation: string;
  citations: CitationRef[];
  provenance: ProvenanceKind;
  model: string;
}

export interface ChatMessage {
  role: "user" | "model";
  content: string;
  citations?: CitationRef[];
}

export interface AiChatRequest {
  message: string;
  active_node_id?: string;
  active_path?: string;
  history?: Array<{ role: "user" | "model"; content: string }>;
}

export interface AiChatResponse {
  reply: string;
  citations: CitationRef[];
  model: string;
}

export interface LearningChallenge {
  id: string;
  type: "locate" | "trace" | "predict";
  title: string;
  prompt: string;
  options: string[];
  target_path: string;
  hint: string;
}

export interface ChallengeEvaluationRequest {
  answer: string;
  selected_symbol_id?: string;
  selected_path?: string;
}

export interface ChallengeEvaluationResponse {
  is_correct: boolean;
  score: number;
  feedback: string;
  citations: CitationRef[];
}
