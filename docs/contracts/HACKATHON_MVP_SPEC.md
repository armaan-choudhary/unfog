# Unfog Hackathon MVP Specification & Shared Contracts

This document specifies the exact API contracts, data models, file ownership, and integration rules for the Unfog Hackathon MVP.

## 1. File Ownership (Strict Boundaries)

- **Agent 1 (Frontend & UI):**
  - Owns: `frontend/`
  - Must not edit: `backend/`, `samples/`, `docs/`
- **Agent 2 (Code Intelligence):**
  - Owns: `backend/app/codeintel/`, `backend/app/api/codeintel.py`, `samples/`
  - Must not edit: `frontend/`, `backend/app/ai/`, `backend/app/learning/`
- **Agent 3 (Gemini AI & Learning):**
  - Owns: `backend/app/ai/`, `backend/app/learning/`, `backend/app/api/ai.py`, `backend/app/api/learning.py`
  - Must not edit: `frontend/`, `backend/app/codeintel/`
- **Agent 4 (Demo & Delivery):**
  - Owns: `docs/demo/`, `scripts/smoke_test.sh`, `README.md`
  - Must not modify core application code
- **Agent 5 (Independent Verifier):**
  - Read-only verification, automated tests, contract checks, end-to-end user journey validation
- **Agent 0 (Coordinator):**
  - Wires routers in `backend/app/main.py` and coordinates integration

---

## 2. API Contracts

### A. Codebase & Source Graph API
- Prefix: `/api/v1/codebase`
- Router file: `backend/app/api/codeintel.py`

#### `GET /api/v1/codebase/graph`
Returns the source graph conforming to `docs/contracts/source-graph.v1.schema.json`.
```json
{
  "schema_version": "1.0",
  "snapshot": {
    "id": "<uuid>",
    "repository_name": "sample_service",
    "revision": { "kind": "local_tree", "value": "snapshot-v1" },
    "manifest_hash": "sha256:..."
  },
  "files": [
    {
      "id": "<uuid>",
      "snapshot_id": "<uuid>",
      "path": "service/auth.py",
      "language": "python",
      "content_hash": "sha256:...",
      "line_count": 45
    }
  ],
  "symbols": [
    {
      "id": "<uuid>",
      "snapshot_id": "<uuid>",
      "file_id": "<uuid>",
      "name": "verify_token",
      "qualified_name": "service.auth.verify_token",
      "kind": "function",
      "language": "python",
      "range": { "start_line": 12, "end_line": 25 },
      "docstring": "Validates bearer tokens."
    }
  ],
  "citations": [
    {
      "id": "<uuid>",
      "snapshot_id": "<uuid>",
      "file_id": "<uuid>",
      "path": "service/auth.py",
      "range": { "start_line": 12, "end_line": 25 },
      "content_hash": "sha256:..."
    }
  ],
  "edges": [
    {
      "id": "<uuid>",
      "snapshot_id": "<uuid>",
      "source_symbol_id": "<uuid>",
      "target_symbol_id": "<uuid>",
      "kind": "calls",
      "provenance": "static_verified",
      "evidence_citation_ids": ["<uuid>"]
    }
  ]
}
```

#### `GET /api/v1/codebase/file`
Query parameter: `path` (e.g. `?path=service/auth.py`)
Returns:
```json
{
  "path": "service/auth.py",
  "language": "python",
  "line_count": 45,
  "content": "def verify_token(token: str): ...",
  "content_hash": "sha256:...",
  "symbols": [
    {
      "id": "<uuid>",
      "name": "verify_token",
      "kind": "function",
      "range": { "start_line": 12, "end_line": 25 }
    }
  ]
}
```

---

### B. Gemini AI Explanation & Chat API
- Prefix: `/api/v1/ai`
- Router file: `backend/app/api/ai.py`

#### `POST /api/v1/ai/explain`
Request:
```json
{
  "symbol_id": "<uuid, optional>",
  "path": "service/auth.py",
  "symbol_name": "verify_token",
  "prompt": "How does token verification work?"
}
```
Response:
```json
{
  "explanation": "The verify_token function verifies incoming JWT tokens...",
  "citations": [
    {
      "path": "service/auth.py",
      "range": { "start_line": 12, "end_line": 25 },
      "snippet": "def verify_token(token: str):..."
    }
  ],
  "provenance": "ai_inferred",
  "model": "gemini-2.5-flash"
}
```

#### `POST /api/v1/ai/chat`
Request:
```json
{
  "message": "Where are errors handled in this service?",
  "active_node_id": "<uuid, optional>",
  "active_path": "<string, optional>",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "model", "content": "..." }
  ]
}
```
Response:
```json
{
  "reply": "Errors are handled in `service/errors.py` using custom exception classes...",
  "citations": [
    {
      "path": "service/errors.py",
      "range": { "start_line": 5, "end_line": 18 },
      "snippet": "class ServiceError(Exception):..."
    }
  ],
  "model": "gemini-2.5-flash"
}
```

---

### C. Learning Challenges API
- Prefix: `/api/v1/learning`
- Router file: `backend/app/api/learning.py`

#### `GET /api/v1/learning/challenges`
Returns available code-understanding challenges grounded in the sample repository:
```json
[
  {
    "id": "challenge-locate-auth",
    "type": "locate",
    "title": "Locate Token Verification",
    "prompt": "Which function is responsible for validating the incoming bearer token?",
    "options": ["verify_token", "hash_password", "create_session", "check_permission"],
    "target_path": "service/auth.py",
    "hint": "Check the auth module functions."
  },
  {
    "id": "challenge-trace-order",
    "type": "trace",
    "title": "Trace Order Processing Flow",
    "prompt": "When an order is submitted, what is the first validation check performed?",
    "options": ["Inventory availability", "Payment authorization", "Token signature", "User quota"],
    "target_path": "service/orders.py",
    "hint": "Look at the order creation handler."
  },
  {
    "id": "challenge-predict-fee",
    "type": "predict",
    "title": "Predict Fee Calculation",
    "prompt": "What does calculate_fee return for an order amount of 100 with standard shipping?",
    "options": ["5.0", "0.0", "10.0", "15.0"],
    "target_path": "service/pricing.py",
    "hint": "See the calculate_fee formula in pricing.py."
  }
]
```

#### `POST /api/v1/learning/challenges/{id}/evaluate`
Request:
```json
{
  "answer": "verify_token",
  "selected_symbol_id": "<uuid, optional>",
  "selected_path": "<string, optional>"
}
```
Response:
```json
{
  "is_correct": true,
  "score": 100,
  "feedback": "Correct! verify_token in service/auth.py performs the cryptographic signature check and expiration validation.",
  "citations": [
    {
      "path": "service/auth.py",
      "range": { "start_line": 12, "end_line": 25 },
      "snippet": "def verify_token(token: str): ..."
    }
  ]
}
```

---

## 3. UI Guidelines (Agent 1)

- Color tokens: Use variables in `frontend/styles/tokens.css` (`--color-canvas`, `--color-panel`, `--color-accent-violet`, `--color-border`, `--color-text`, etc.).
- Layout:
  - Top header: Unfog logo/badge, active repo status, snapshot indicator.
  - Left / Main area: Full interactive React Flow canvas (`@xyflow/react`) with custom node components (icons, label, symbol kind tag, badge for line count).
  - Right drawer / Split panel (collapsible):
    - Tab 1: **Code Inspector** (shows selected file / function, lines, code preview with syntax styling).
    - Tab 2: **AI Companion** (Gemini explanation and interactive Q&A with clickable source citations).
    - Tab 3: **Learning Challenge** (interactive Locate/Trace/Predict quiz with instant evaluation).
- No Tailwind, shadcn, or external UI component libraries. Use CSS modules and clean semantic markup.
