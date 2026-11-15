# Unfog 2.0 🌌

> **Demystifying complex codebases through source-grounded architecture maps, verifiable citations, and goal-driven AI learning.**

---

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15+-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React Flow](https://img.shields.io/badge/React_Flow-12+-FF0072?logo=react&logoColor=white)](https://reactflow.dev/)
[![Gemini 2.5](https://img.shields.io/badge/Gemini_2.5-Flash-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![Python AST / Tree-sitter](https://img.shields.io/badge/Code_Intel-AST_&_Tree--sitter-3776AB?logo=python&logoColor=white)](https://tree-sitter.github.io/)

---

## ⚡ The Problem: Hallucinatory AI vs Grounded Engineering

When engineers join new teams or explore large unfamiliar codebases, conventional AI assistants often fail them in dangerous ways:
- **Hallucinated symbols and non-existent APIs:** Generative AI invents functions and wrong module paths.
- **Out-of-context explanations:** Generic LLM answers lack structural awareness of call graphs, dependencies, and execution lifecycles.
- **Passive reading vs active understanding:** Reading generated summaries does not build genuine mental models or verify comprehension.

**Unfog** solves this by establishing a **zero-trust, evidence-grounded architecture**:
1. **100% Verifiable Source Grounding:** Every symbol, edge, and explanation is backed by real AST parser analysis, exact file line numbers (`start_line`, `end_line`), and SHA-256 content hashes.
2. **Interactive Visual Codebase Map:** A dynamic React Flow canvas rendering real package structures, function calls, and dependency graphs.
3. **Contextual Gemini AI Companion:** Explanations and chat grounded directly in retrieved AST context, citing line-level code evidence.
4. **Active Learning Arena:** Dynamic challenges (Locate, Trace, Predict) that test and verify code understanding with immediate grounded evaluation.

---

## 🏗️ Core Architecture

```
                          ┌─────────────────────────────────────┐
                          │     Next.js 15 Frontend Dashboard   │
                          │   (React Flow + CSS Custom Props)   │
                          └──────────────┬──────────────────────┘
                                         │ JSON / REST
                                         ▼
                          ┌─────────────────────────────────────┐
                          │       FastAPI Backend Engine        │
                          │        (/api/v1/codebase, ai,       │
                          │              learning)              │
                          └───┬─────────────┬────────────────┬──┘
                              │             │                │
            ┌─────────────────┴─┐     ┌─────┴────────┐     ┌─┴────────────────┐
            │  AST & Code Intel │     │  Gemini AI   │     │  Learning Arena  │
            │   (Tree-sitter)   │     │  Companion   │     │ (Locate/Trace/   │
            │  - Manifest Hash  │     │ - Grounded   │     │    Predict)      │
            │  - Static Verify  │     │   Prompts    │     │ - Real Citations │
            │  - Line Ranges    │     │ - Fallback   │     │ - Instant Eval   │
            └───────────────────┘     └──────────────┘     └──────────────────┘
```

- **Frontend:** Next.js (App Router), TypeScript, `@xyflow/react` for visual dependency exploration, pure CSS / CSS Modules adhering strictly to Figma design tokens (`--color-canvas`, `--color-accent-violet`). Zero Tailwind or generic component libraries.
- **Backend & Code Intelligence:** FastAPI with Python AST & Tree-sitter scanners, computing cryptographic SHA-256 content hashes and line-exact symbol ranges.
- **AI Engine:** Google Gemini (`gemini-2.5-flash` via `google-genai`), backed by deterministic local fallbacks for seamless offline demo resilience.
- **Persistence & Storage:** PostgreSQL 17 baseline with UUIDv4 primary keys and Redis integration.

---

## 🚀 Key Features

### 1. Source-Grounded Architecture Graph
Interactive visual graph powered by React Flow mapping out packages, modules, classes, and functions.
- Visual violet nodes with status indicators (`static_verified`).
- Distinct relationship edges showing direct call hierarchies and module dependencies.
- Zoom, pan, search, and click-to-inspect mechanics.

### 2. Multi-Tab Code & Symbol Inspector
Deep-dive into any selected node with real source context:
- **Source Inspector:** Full syntax-highlighted source inspection with accurate line counts and symbol declarations.
- **Verifiable Citations:** Clickable badges linking directly to specific file line spans (`path:start_line-end_line`).

### 3. Contextual Gemini AI Companion
Server-side Gemini 2.5 Flash integration designed specifically for codebase onboarding:
- One-click function and architecture explanations.
- Conversational chat with full context awareness of the actively viewed symbol or file.
- Strict citation requirement: every explanation provides verifiable snippets from the repository.

### 4. Active Learning Arena
Move beyond passive reading into active retention and mastery:
- **Locate Challenges:** Identify which function or class owns a specific operational responsibility.
- **Trace Challenges:** Trace execution flow through multi-step service boundaries.
- **Predict Challenges:** Reason through business logic rules and determine expected outcomes.
- **Instant Grounded Evaluation:** Direct feedback with evidence citations reinforcing the right mental model.

---

## 🏁 Quickstart Guide

### Prerequisites
- **Node.js**: v20.9+ and `npm`
- **Python**: v3.11+
- **Docker & Docker Compose** (for PostgreSQL & Redis)

---

### Step 1: Clone and Configure Environment

```bash
git clone https://github.com/armaan-choudhary/unfog.git
cd unfog

# Copy environment template
cp .env.example .env
```

Edit `.env` to configure your settings:
```env
APP_ENV=development
DATABASE_URL=postgresql+psycopg://unfog:local-only-change-me@localhost:5432/unfog
REDIS_URL=redis://localhost:6379/0

# Optional: Add your Gemini API key for live AI completions
# (If omitted, Unfog automatically uses built-in grounded fallbacks for demo reliability)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

---

### Step 2: Start Infrastructure (PostgreSQL & Redis)

Using Docker Compose:
```bash
docker compose up -d postgres redis
```

---

### Step 3: Run Backend

```bash
# Set up Python virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
pip install -r backend/requirements-dev.txt

# Run database migrations
cd backend
alembic upgrade head

# Start FastAPI server
uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --reload
```

The backend is now live at `http://localhost:8000` (`/healthz`, `/docs`).

---

### Step 4: Run Frontend

In a separate terminal:
```bash
cd frontend
npm ci
npm run dev
```

Open your browser at **`http://localhost:3000`** to access the Unfog dashboard.

---

## 🧪 Automated Smoke Test Suite

Verify that all backend endpoints, codebase graph APIs, Gemini AI routes, Learning Arena, and frontend builds are passing:

```bash
./scripts/smoke_test.sh
```

Sample output:
```text
==> 1. Verifying Backend Health & Readiness
  ✔ PASS: Liveness endpoint (/healthz) (HTTP 200 matched 'ok')
  ✔ PASS: Readiness endpoint (/readyz) (HTTP 200 matched 'ready')

==> 2. Verifying Codebase & Source Graph API
  ✔ PASS: Source Graph (/api/v1/codebase/graph) (HTTP 200 matched 'sample_service')
  ✔ PASS: File Source Inspection (/api/v1/codebase/file) (HTTP 200 matched 'verify_token')

==> 3. Verifying Gemini AI Explanation & Chat API
  ✔ PASS: AI Explanation (/api/v1/ai/explain) (HTTP 200 matched 'explanation')
  ✔ PASS: AI Contextual Chat (/api/v1/ai/chat) (HTTP 200 matched 'reply')

==> 4. Verifying Learning Arena API
  ✔ PASS: Fetch Challenges (/api/v1/learning/challenges) (HTTP 200 matched 'challenge-locate-auth')
  ✔ PASS: Evaluate Challenge (HTTP 200 matched 'correct')

==> 5. Verifying Frontend Production Build
  ✔ PASS: Frontend build succeeded (Next.js production compile)

All smoke tests passed! System is fully functional for demo.
```

---

## ⚙️ Environment Variables Reference

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `APP_ENV` | No | `development` | Application runtime environment (`development`, `production`). |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string (`postgresql+psycopg://...`). |
| `REDIS_URL` | No | `redis://localhost:6379/0` | Redis instance for async workers and cache. |
| `GEMINI_API_KEY` | Optional | - | Google Gemini API key. If omitted, deterministic offline fallbacks are used. |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Gemini model name for AI companion completions. |
| `READINESS_TIMEOUT_SECONDS` | No | `3` | Max wait time for database connection check during `/readyz`. |
| `UNFOG_DEV_AUTH_ENABLED` | No | `false` | Enable local bypass token authentication for development. |

---

## 🎬 Hackathon Presentation & Demo Script

Looking for the complete live demo walkthrough guide?
Check out **[docs/demo/DEMO_WALKTHROUGH.md](docs/demo/DEMO_WALKTHROUGH.md)** for a crisp, 3-minute stage presentation script with timestamped speaker cues and troubleshooting tips.
