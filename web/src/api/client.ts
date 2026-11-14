export interface HealthResponse {
  status: string;
}

export interface IndexRequest {
  path: string;
}

export interface IndexResponse {
  total_files?: number;
  total_nodes?: number;
  total_edges?: number;
  routes?: string[];
  stats?: Record<string, unknown>;
}

export interface ScopeRequest {
  target: string;
  goal?: string;
}

export interface BackendNodeMetadata {
  id: string;
  label: string;
  file_path: string;
  kind: string;
  fog_state: 'foggy' | 'fuzzy' | 'clear';
  line_start: number;
  line_end: number;
  code_snippet?: string;
  route_path?: string;
  http_method?: string;
  description?: string;
  trigger?: string;
  mutation?: string;
  side_effects?: string;
}

export interface BackendEdgeMetadata {
  source_id: string;
  target_id: string;
  kind: string;
  label: string;
}

export interface BackendTraceStep {
  step_number: number;
  node_id: string;
  label: string;
  file_path: string;
  action: string;
  description: string;
  code_snippet?: string;
  trigger?: string;
  mutation?: string;
  side_effects?: string;
}

export interface BackendExecutionTrace {
  target: string;
  goal: string;
  steps: BackendTraceStep[];
  nodes: BackendNodeMetadata[];
  edges: BackendEdgeMetadata[];
  summary: string;
}

export interface BlastRadiusResponse {
  target_id: string;
  target_label: string;
  impact_level: string;
  affected_nodes: BackendNodeMetadata[];
  affected_routes: string[];
  depth_map: Record<string, number>;
  summary: string;
}

export interface FileContentResponse {
  path: string;
  content: string;
}

export interface VerifyRequest {
  node_id: string;
  status: string;
}

export interface StateResponse {
  understood?: string[];
  understood_nodes?: string[];
  nodes?: Record<string, string>;
  tags?: Record<string, string>;
}

export interface MentalModelResponse {
  trigger?: string;
  mutation?: string;
  side_effects?: string;
  summary?: string;
  l1_vibe?: string;
  l2_builder?: string;
  l3_deep_dive?: string;
  technical_details?: string[];
}

export interface MicroChallenge {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export interface BreakPrediction {
  mutated_code: string;
  failure_prediction_question: string;
  expected_breakage: string;
}

export interface SlopResponse {
  has_slop: boolean;
  issues: string[];
  details?: Array<{ issue_type: string; description: string; line?: number }>;
}

export interface ExportResponse {
  architecture_md?: string;
  cursorrules?: string;
  content?: string;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  async checkHealth(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
    return res.json();
  }

  async indexDirectory(path: string): Promise<IndexResponse> {
    const res = await fetch(`${this.baseUrl}/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error(`Failed to index directory: ${res.statusText}`);
    return res.json();
  }

  async getScope(target: string, goal?: string): Promise<BackendExecutionTrace> {
    const res = await fetch(`${this.baseUrl}/scope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, goal }),
    });
    if (!res.ok) throw new Error(`Failed to fetch scope: ${res.statusText}`);
    return res.json();
  }

  async getBlastRadius(target: string): Promise<BlastRadiusResponse> {
    const res = await fetch(`${this.baseUrl}/blast-radius?target=${encodeURIComponent(target)}`);
    if (!res.ok) throw new Error(`Failed to fetch blast radius: ${res.statusText}`);
    return res.json();
  }

  async getFile(filePath: string): Promise<FileContentResponse> {
    const res = await fetch(`${this.baseUrl}/file?path=${encodeURIComponent(filePath)}`);
    if (!res.ok) throw new Error(`Failed to fetch file content: ${res.statusText}`);
    return res.json();
  }

  async verifyNode(nodeId: string, status: string): Promise<{ success: boolean }> {
    const res = await fetch(`${this.baseUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeId, status }),
    });
    if (!res.ok) throw new Error(`Failed to verify node: ${res.statusText}`);
    return res.json();
  }

  async getState(): Promise<StateResponse> {
    const res = await fetch(`${this.baseUrl}/state`);
    if (!res.ok) throw new Error(`Failed to fetch state: ${res.statusText}`);
    return res.json();
  }

  async getMentalModel(
    nodeId: string,
    level?: string,
    filePath?: string,
    symbol?: string
  ): Promise<MentalModelResponse> {
    const res = await fetch(`${this.baseUrl}/mental-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        node_id: nodeId,
        level,
        file_path: filePath,
        symbol,
      }),
    });
    if (!res.ok) throw new Error(`Failed to fetch mental model: ${res.statusText}`);
    return res.json();
  }

  async getChallenge(nodeId: string, filePath?: string): Promise<MicroChallenge> {
    const res = await fetch(`${this.baseUrl}/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeId, file_path: filePath }),
    });
    if (!res.ok) throw new Error(`Failed to fetch micro-challenge: ${res.statusText}`);
    return res.json();
  }

  async getBreakSandbox(nodeId: string, filePath?: string): Promise<BreakPrediction> {
    const res = await fetch(`${this.baseUrl}/break-sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeId, file_path: filePath }),
    });
    if (!res.ok) throw new Error(`Failed to fetch break-sandbox: ${res.statusText}`);
    return res.json();
  }

  async getSlop(path?: string): Promise<SlopResponse> {
    const url = path
      ? `${this.baseUrl}/slop?path=${encodeURIComponent(path)}`
      : `${this.baseUrl}/slop`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch slop analysis: ${res.statusText}`);
    return res.json();
  }

  async getDiff(): Promise<{ summary: string; files_changed?: string[] }> {
    const res = await fetch(`${this.baseUrl}/diff`);
    if (!res.ok) throw new Error(`Failed to fetch git diff: ${res.statusText}`);
    return res.json();
  }

  async exportModel(
    understoodNodes?: string[],
    format?: string
  ): Promise<ExportResponse> {
    const res = await fetch(`${this.baseUrl}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ understood_nodes: understoodNodes, format }),
    });
    if (!res.ok) throw new Error(`Failed to export model: ${res.statusText}`);
    return res.json();
  }
}

export const api = new ApiClient();
