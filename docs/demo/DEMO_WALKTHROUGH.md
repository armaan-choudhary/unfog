# Unfog 2.0 — Hackathon Demo Walkthrough & Presentation Guide 🎬

This guide provides a comprehensive 3-minute stage presentation script, click-by-click presenter actions, and operational troubleshooting tips for presenting **Unfog** at hackathon judging sessions.

---

## ⏱️ 3-Minute Live Presentation Script

| Timestamp | Screen / Visual Target | Presenter Voiceover Script | Action / Click Guide |
| :--- | :--- | :--- | :--- |
| **0:00 - 0:25**<br>*(Hook & Problem)* | Browser landing on Unfog dashboard (`http://localhost:3000`) | *"Software engineers spend up to 70% of their time reading unfamiliar code. And while LLMs promise to help, typical AI chat tools hallucinate APIs, invent fake function signatures, and lack verified structural context. Welcome to **Unfog 2.0** — the zero-trust, source-grounded codebase intelligence and learning platform."* | Open browser to Unfog dashboard. Point out the clean dark interface with Figma-aligned violet styling and repository badge (`sample_service`). |
| **0:25 - 0:55**<br>*(Visual Architecture)* | Interactive React Flow Canvas | *"Instead of raw text or generic trees, Unfog parses the genuine repository using AST scanners, computing cryptographic content hashes and building a live dependency graph. Notice how each file, class, and function node is mapped with genuine relationships and marked as `static_verified`."* | Click and pan across the React Flow canvas. Zoom in on `service/auth.py` and `service/orders.py`. Hover over connecting call edges. |
| **0:55 - 1:25**<br>*(Inspector & Grounded Citations)* | Inspector Panel (Tab 1: Source Inspector) | *"When I select `verify_token`, Unfog immediately pulls the exact source slice directly from the repository. No guesswork. Notice the verified line numbers 12 through 25, content hash, and qualified symbol name. Every single piece of evidence is verifiable."* | Click the node `verify_token` on the canvas. Inspector panel opens on the right. Highlight syntax-highlighted code and exact line range citations. |
| **1:25 - 2:05**<br>*(Gemini AI Companion)* | Inspector Panel (Tab 2: AI Companion) | *"Now let's ask our contextual Gemini AI Companion: 'How does token verification work?'. Unlike ordinary AI chat, Unfog feeds the exact AST context and symbol metadata to Gemini 2.5 Flash. The answer provides a crystal-clear explanation accompanied by exact line-level citations linking directly back to the source code."* | Switch to **AI Companion** tab. Click 'Explain Symbol' or ask a question. Point to the returned Markdown explanation and click a citation badge to jump to the code. |
| **2:05 - 2:45**<br>*(Learning Arena)* | Inspector Panel (Tab 3: Learning Arena) | *"Understanding code isn't just passive reading — it's active comprehension. Unfog features the Learning Arena with Locate, Trace, and Predict challenges. Let's tackle this challenge: 'Which function validates incoming bearer tokens?'. I select `verify_token` and submit."* | Switch to **Learning Arena** tab. Select the active challenge. Choose option `verify_token` and click **Submit Answer**. |
| **2:45 - 3:00**<br>*(Instant Feedback & Closing)* | Challenge Evaluation & Score Card | *"Instant score, constructive explanation, and code citations proving why the answer is correct. With Unfog, developer onboarding transforms from overwhelming cognitive fog into verified, interactive mastery. Thank you!"* | Display green Success feedback badge and final score. Wrap up with Q&A invitation. |

---

## 🧭 Step-by-Step User Journey Checklist

Follow this checklist during practice runs to ensure smooth execution:

- [ ] **1. Dashboard Open:** Open `http://localhost:3000`. Verify header shows "Unfog", repository "sample_service", and snapshot badge "Static Verified".
- [ ] **2. Explore Architecture Graph:**
  - Pan around canvas using left mouse drag.
  - Zoom in and out using mouse wheel or mini-map controls.
  - Observe function and class nodes connected by verified `calls` edges.
- [ ] **3. Select Symbol:**
  - Click on `verify_token` in `service/auth.py`.
  - Confirm node highlights with violet border and right drawer opens.
- [ ] **4. Inspect Source:**
  - Review syntax-highlighted code snippet.
  - Confirm line numbers (e.g. lines 12–25) match genuine repository file.
- [ ] **5. Test AI Companion:**
  - Click **AI Companion** tab.
  - Click "Explain `verify_token`" or enter "How does token verification work?".
  - Verify generated explanation contains clickable line citations.
- [ ] **6. Run Learning Arena:**
  - Click **Learning Arena** tab.
  - Select challenge: `Locate Token Verification`.
  - Pick `verify_token` and hit **Submit**.
  - Confirm score updates and feedback displays with citation reference.

---

## 🛠️ Smoke Test Execution Guide

Before stepping onto stage or recording a demo video, run the automated smoke test script to verify all systems:

```bash
# Ensure backend and frontend are running or ready
./scripts/smoke_test.sh
```

### Overriding Backend URL
If your backend runs on a custom port or remote host:
```bash
BACKEND_BASE_URL="http://127.0.0.1:8000" ./scripts/smoke_test.sh
```

---

## 🚨 Troubleshooting & Demo Resilience Tips

| Symptom | Cause | Rapid Fix |
| :--- | :--- | :--- |
| **Backend connection refused (`Failed to connect to localhost:8000`)** | FastAPI server is not running | Start backend: `cd backend && uvicorn app.main:create_app --factory --port 8000` |
| **Gemini AI returns fallback explanation** | `GEMINI_API_KEY` is unset or quota exhausted | Unfog is intentionally designed with deterministic local fallbacks for demo reliability. The explanation still succeeds and provides grounded citations! If live model generation is preferred, set `export GEMINI_API_KEY="AIzaSy..."` in `.env` and restart backend. |
| **Frontend displays empty graph** | Codebase graph API returned empty list or backend offline | Frontend includes graceful sample fallback data. Check browser console (`F12`) to verify network calls to `/api/v1/codebase/graph`. |
| **Port 3000 or 8000 already in use** | Stray dev server process running | Identify and terminate: `lsof -ti:3000,8000 \| xargs kill -9 2>/dev/null \|\| true` |
| **Node.js build error on frontend** | Outdated dependencies or dirty cache | Run `cd frontend && rm -rf .next && npm ci && npm run build` |
