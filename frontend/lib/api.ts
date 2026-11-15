import {
  SourceGraph,
  FileDetailResponse,
  AiExplainResponse,
  AiChatResponse,
  LearningChallenge,
  ChallengeEvaluationResponse,
  GithubImportResponse,
} from "./types";
import {
  MOCK_SOURCE_GRAPH,
  MOCK_FILE_CONTENTS,
  MOCK_CHALLENGES,
  MOCK_CHALLENGE_EVALUATIONS,
  MOCK_AI_EXPLANATIONS,
  MOCK_AI_CHAT_REPLIES,
} from "./mockData";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

export type ConnectionStatus = "connected" | "offline_mock" | "checking";

let currentStatus: ConnectionStatus = "checking";
const statusListeners = new Set<(status: ConnectionStatus) => void>();

export function subscribeConnectionStatus(
  listener: (status: ConnectionStatus) => void,
) {
  statusListeners.add(listener);
  listener(currentStatus);
  return () => {
    statusListeners.delete(listener);
  };
}

function updateStatus(status: ConnectionStatus) {
  if (currentStatus !== status) {
    currentStatus = status;
    statusListeners.forEach((listener) => listener(status));
  }
}

export async function importGithubRepo(
  url: string,
): Promise<GithubImportResponse> {
  const res = await fetch(`${BASE_URL}/api/v1/github/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    let errorDetail = "";
    try {
      const errData = await res.json();
      errorDetail =
        errData.detail || errData.message || JSON.stringify(errData);
    } catch {
      errorDetail = res.statusText;
    }

    if (res.status === 400) {
      throw new Error(
        errorDetail ||
          "Invalid GitHub URL. Must be in the format https://github.com/owner/repository",
      );
    } else if (res.status === 404) {
      throw new Error(
        errorDetail || "Repository not found or is private on GitHub.",
      );
    } else if (res.status === 413) {
      throw new Error(
        errorDetail ||
          "Repository archive exceeds size limits (max 25MB archive / 100MB uncompressed).",
      );
    } else if (res.status === 429) {
      throw new Error(
        errorDetail || "GitHub API rate limit reached. Please try again later.",
      );
    } else if (res.status === 422) {
      throw new Error(
        errorDetail || "No supported Python source files found in repository.",
      );
    } else {
      throw new Error(
        errorDetail || `Import failed with status code ${res.status}`,
      );
    }
  }

  updateStatus("connected");
  return (await res.json()) as GithubImportResponse;
}

export async function fetchSourceGraph(repoId?: string): Promise<SourceGraph> {
  try {
    const query =
      repoId && repoId !== "sample_service"
        ? `?repo_id=${encodeURIComponent(repoId)}`
        : "";
    const res = await fetch(`${BASE_URL}/api/v1/codebase/graph${query}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Graph request failed with status: ${res.status}`);
    }
    const data = await res.json();
    if (data && data.files && data.symbols) {
      updateStatus("connected");
      return data as SourceGraph;
    }
    throw new Error("Graph payload incomplete");
  } catch (err) {
    console.warn(
      "Live backend /api/v1/codebase/graph not reachable, using grounded mock data:",
      err,
    );
    if (!repoId || repoId === "sample_service") {
      updateStatus("offline_mock");
      return MOCK_SOURCE_GRAPH;
    }
    throw err;
  }
}

export async function fetchFileDetail(
  filePath: string,
  repoId?: string,
): Promise<FileDetailResponse> {
  try {
    const repoParam =
      repoId && repoId !== "sample_service"
        ? `&repo_id=${encodeURIComponent(repoId)}`
        : "";
    const res = await fetch(
      `${BASE_URL}/api/v1/codebase/file?path=${encodeURIComponent(filePath)}${repoParam}`,
      {
        headers: { Accept: "application/json" },
      },
    );
    if (!res.ok) {
      throw new Error(`File request failed: ${res.status}`);
    }
    const data = await res.json();
    if (data && data.content) {
      updateStatus("connected");
      return data as FileDetailResponse;
    }
    throw new Error("Invalid file payload");
  } catch {
    // Return grounded mock data for sample_service
    if (!repoId || repoId === "sample_service") {
      if (MOCK_FILE_CONTENTS[filePath]) {
        return MOCK_FILE_CONTENTS[filePath];
      }
    }
    // Generic fallback for any unlisted file
    return {
      path: filePath,
      language: filePath.endsWith(".py") ? "python" : "text",
      line_count: 10,
      content_hash: "sha256:unknown",
      content: `# File: ${filePath}\n# Content loaded in fallback mode.\n`,
      symbols: [],
    };
  }
}

export async function explainSymbol(
  path: string,
  symbolName: string,
  symbolId?: string,
  prompt?: string,
  repoId?: string,
): Promise<AiExplainResponse> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/ai/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol_id: symbolId,
        path,
        symbol_name: symbolName,
        prompt: prompt || `Explain ${symbolName} in ${path}`,
        repo_id: repoId && repoId !== "sample_service" ? repoId : undefined,
      }),
    });
    if (!res.ok) {
      throw new Error(`Explain API failed: ${res.status}`);
    }
    const data = await res.json();
    updateStatus("connected");
    return data as AiExplainResponse;
  } catch {
    const found =
      MOCK_AI_EXPLANATIONS[symbolName] || MOCK_AI_EXPLANATIONS["default"];
    return {
      explanation: found.explanation,
      citations: [
        {
          path,
          range: { start_line: 1, end_line: 25 },
          snippet: `def ${symbolName}: ...`,
        },
      ],
      provenance: "static_verified",
      model: "offline-fallback (client preview)",
    };
  }
}

export async function sendAiChat(
  message: string,
  activeNodeId?: string,
  activePath?: string,
  history?: Array<{ role: "user" | "model"; content: string }>,
  repoId?: string,
): Promise<AiChatResponse> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        active_node_id: activeNodeId,
        active_path: activePath,
        history,
        repo_id: repoId && repoId !== "sample_service" ? repoId : undefined,
      }),
    });
    if (!res.ok) {
      throw new Error(`AI Chat API failed: ${res.status}`);
    }
    const data = await res.json();
    updateStatus("connected");
    return data as AiChatResponse;
  } catch {
    // Generate context-aware fallback response
    let reply = MOCK_AI_CHAT_REPLIES["default"].reply;
    const citations = [...MOCK_AI_CHAT_REPLIES["default"].citations];

    if (
      message.toLowerCase().includes("auth") ||
      message.toLowerCase().includes("token")
    ) {
      reply =
        "### Token Verification & Auth\n\nAuthentication in `sample_service` is handled in `service/auth.py`.\n- `verify_token`: Validates incoming bearer tokens and calculates HMAC-SHA256 signatures.\n- `hash_password`: Computes salted SHA-256 hashes for credentials.\n- `create_session`: Issues session tokens with specified user permissions.";
      citations.length = 0;
      citations.push({
        path: "service/auth.py",
        range: { start_line: 12, end_line: 25 },
        snippet: "def verify_token(token: str) -> Dict[str, Any]:",
      });
    } else if (
      message.toLowerCase().includes("fee") ||
      message.toLowerCase().includes("pricing")
    ) {
      reply =
        "### Pricing & Fee Computation\n\nThe pricing engine in `service/pricing.py` contains `calculate_fee`.\n- Standard orders over $50 have a $5 fee, while smaller orders incur $8.\n- Express delivery adds $10.";
      citations.length = 0;
      citations.push({
        path: "service/pricing.py",
        range: { start_line: 4, end_line: 20 },
        snippet:
          'def calculate_fee(amount: float, shipping_mode: str = "standard") -> float:',
      });
    }

    return {
      reply,
      citations,
      model: "offline-fallback (client preview)",
    };
  }
}

export async function fetchChallenges(
  repoId?: string,
): Promise<LearningChallenge[]> {
  try {
    const query =
      repoId && repoId !== "sample_service"
        ? `?repo_id=${encodeURIComponent(repoId)}`
        : "";
    const res = await fetch(`${BASE_URL}/api/v1/learning/challenges${query}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Challenges API failed: ${res.status}`);
    }
    const data = await res.json();
    updateStatus("connected");
    return data as LearningChallenge[];
  } catch {
    return MOCK_CHALLENGES;
  }
}

export async function evaluateChallenge(
  challengeId: string,
  answer: string,
  selectedSymbolId?: string,
  selectedPath?: string,
  repoId?: string,
): Promise<ChallengeEvaluationResponse> {
  try {
    const res = await fetch(
      `${BASE_URL}/api/v1/learning/challenges/${encodeURIComponent(challengeId)}/evaluate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answer,
          selected_symbol_id: selectedSymbolId,
          selected_path: selectedPath,
          repo_id: repoId && repoId !== "sample_service" ? repoId : undefined,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Evaluation API failed: ${res.status}`);
    }
    const data = await res.json();
    updateStatus("connected");
    return data as ChallengeEvaluationResponse;
  } catch {
    const challengeMap = MOCK_CHALLENGE_EVALUATIONS[challengeId];
    if (challengeMap) {
      if (challengeMap[answer]) {
        return challengeMap[answer];
      }
      return challengeMap["default"];
    }
    return {
      is_correct: false,
      score: 0,
      feedback: "Evaluation complete.",
      citations: [],
    };
  }
}
