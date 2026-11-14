# Unfog — Product & Feature Specification

**Core Concept:** Unfog helps "vibecoders" transition from blindly prompting AI to actually owning and understanding their codebase. Freshly generated or uninspected code starts in a "foggy" (unowned) state and clears up as the user traces logic, inspects data flows, or verifies their understanding—strictly scoped to what they care about right now, without forced daily streaks.

---

## 1. Core Features to Drive Code Ownership

| Feature | How It Works | Why Vibecoders Need It |
| :--- | :--- | :--- |
| **Vibe-to-Flow Tracer** | Connects a plain-English user story (*"User uploads an image"*) to a step-by-step execution breadcrumb across files (`UploadBtn.tsx` $\rightarrow$ `api/upload.ts` $\rightarrow$ `s3.ts`). | Vibecoders think in *features and prompts*, not file trees or architectural layers. |
| **Blast Radius Preview** | Selecting or hovering over a function/state variable highlights every downstream feature, route, or component that breaks if it changes. | Eliminates the fear of manually editing AI-generated code. |
| **Plain-English Mental Models** | Replaces raw AST/line-by-line documentation with a concise 3-part summary for any code block: **Trigger**, **Mutation**, and **Side Effects**. | Builds rapid system-level intuition without reading walls of text. |
| **"Defog" Micro-Challenges** | Optional 10-second comprehension checks on critical modules (e.g., *"Where does `userSession` update if this API fails?"* or tweaking a hardcoded value). | Converts passive reading into active mental ownership without feeling like a school exam. |
| **AI Slop & Debt Radar** | Flags typical AI-generated anti-patterns: duplicated logic across files, unused props, hallucinated abstractions, and hardcoded secrets. | Gives users immediate, high-value cleanup wins they can fix themselves. |
| **Prompt Diffing (Commit Translator)** | Hooks into Git/local history after an AI coding session and summarizes: *"Your last prompt touched 4 files: added a state hook here, changed a schema there."* | Stops the codebase from silently drifting away from the user's mental model during fast prompting loops. |
| **"Break It on Purpose" Sandbox** | Temporarily alters or comments out a line in a preview environment and asks the user to predict what will break before revealing the result. | Builds first-principles debugging intuition rapidly. |
| **Mental Model Exporter** | Exports the cleared, understood flow into an `ARCHITECTURE.md` or `.cursorrules` snippet. | Ensures neither the user nor their AI coding assistant breaks that logic in future prompts. |

---

## 2. Intent-Driven User Flow (Upload $\rightarrow$ Unfogged)

Instead of overwhelming the user with the entire repository or gamified streaks, Unfog creates a disposable, goal-oriented session around a specific boundary.

| Stage | User Action | System Behavior |
| :--- | :--- | :--- |
| **1. Ingest** | Pastes GitHub URL, drops a folder, or links a local directory. | Runs fast static/AST indexing in the background; extracts routes, entry points, API endpoints, and state stores before making LLM calls. |
| **2. Scope & Goal Setup** | Selects an **Intent Preset** and target before any map is generated. | Filters out $80\%+$ of the repo. Runs analysis strictly on the dependency subgraph tied to the user's immediate goal. |
| **3. Scoped Dependency Mapping** | Views the filtered dependency pipeline (4–8 core nodes instead of 100+ files). | Displays the targeted execution path (e.g., `LoginForm.tsx` $\rightarrow$ `useAuth.ts` $\rightarrow$ `api/session.ts`). Unrelated files are collapsed into external context. |
| **4. Interactive Trace** | Steps through the execution chronologically (Step 1 $\rightarrow$ Step 2 $\rightarrow$ Step 3). | Isolates only the active functions and lines involved in that specific step; automatically folds unrelated functions in the same file. |
| **5. Customize Depth** | Toggles explanation depth (**L1 / L2 / L3**) or expands neighbor nodes on demand. | Dynamically adjusts the complexity of the explanations and exposes deeper dependencies only when requested. |
| **6. Verify & Claim** | Clicks **"Mark as Understood"**, completes an optional **Micro-Challenge**, or fixes flagged AI debt. | Clears the "fog" on that specific node and updates the scoped session progress (e.g., `Auth Flow: 3/4 Nodes Clear`). |
| **7. Export / Exit** | Finishes the goal and closes, or exports the summary. | Generates documentation or AI context rules (`ARCHITECTURE.md` / `.cursorrules`) for the newly understood flow. |

---

## 3. Goal & Scope Configurator (Pre-Map Setup)

To keep the experience customizable and low-friction, users configure three axes before diving into the code:

| Customization Axis | Options Presented to User | System Impact |
| :--- | :--- | :--- |
| **1. Current Goal** | • **Trace a Feature:** *"How does [X] work?"*<br>• **Fix a Bug:** *"Something breaks when [Y] happens"*<br>• **Safe to Edit?:** *"I want to change [File] without breaking things"*<br>• **Audit AI Slop:** *"Clean up my latest prompt changes"* | • **Trace:** Builds a chronological execution pipeline.<br>• **Bug:** Highlights error boundaries, null states, and async calls.<br>• **Edit:** Centers on the target file's downstream Blast Radius.<br>• **Audit:** Focuses strictly on recently modified diffs. |
| **2. Target Selection** | • **By UI Route/Page** (e.g., `/checkout`, `/dashboard`)<br>• **By Natural Language** (*"Where Stripe webhooks are handled"*)<br>• **By File/Folder Picker** (Manual selection)<br>• **By Git Commit** (*"Last 3 commits"*) | Traces imports, exports, and calls $N$ hops upstream and downstream from the selected anchor point; hides everything else. |
| **3. Technical Comfort Level** | • **Vibe Mode (L1):** Architecture & high-level purpose<br>• **Builder Mode (L2):** Data flow, state hooks, API payloads, DB queries<br>• **Deep Dive (L3):** Full syntax, closures, types, and edge cases | Sets the default explanation depth and calibrates whether optional verification checks ask conceptual or code-level questions. |

---

## 4. On-the-Fly Customization & Filtering Rules

* **Progressive Disclosure (L1 $\rightarrow$ L2 $\rightarrow$ L3):** Users can switch explanation depth at any time between **L1: Vibe** (what it does for the user), **L2: Data Flow** (inputs, outputs, state mutations), and **L3: Syntax** (exact framework and language mechanics).
* **Hop-Radius Control (`1 Hop` $\leftrightarrow$ `Full Repo`):** Dynamically expands or shrinks how many connected files are pulled into the active scope around the target node.
* **Noise Toggles:** One-click filters to strip out boilerplate: `UI/Styling`, `Types/Interfaces`, `Config/Boilerplate`, and `Third-Party Libraries`.
* **Verification Mode Switch:**
  * **Self-Paced Mode (Zero Quizzes):** Users manually mark blocks as understood at their own pace with zero friction.
  * **Prove-It Mode:** Unlocks the "Break It on Purpose" predictions and 10-second micro-challenges for users who want to test their mental model on tricky modules.
* **Confidence Tagging:** Users can tag any block as `Got It`, `Fuzzy`, or `AI Magic (Need Help)` to bookmark specific areas for later refactoring.
* **Saved Lenses:** Users can group 3–4 related files into a saved custom lens (e.g., *"Payment Flow"*, *"Auth Logic"*) to revisit whenever they prompt or edit that feature.