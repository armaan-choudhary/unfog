"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Trophy,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  Sparkles,
  Lightbulb,
  Code2,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Copy,
  Check,
  Layers,
  RotateCcw,
} from "lucide-react";
import {
  LearningChallenge,
  ChallengeEvaluationResponse,
  CitationRef,
  AttemptProvenance,
  LineRange,
} from "../../lib/types";
import {
  fetchChallenges,
  evaluateChallenge,
  fetchFileDetail,
} from "../../lib/api";
import { CitationBadge } from "../Common/CitationBadge";
import styles from "./LearningArenaTab.module.css";

interface LearningArenaTabProps {
  repoId?: string;
  onNavigateCitation: (citation: CitationRef) => void;
}

const DEFAULT_ARCHITECTURAL_GOALS = [
  "Architecture & Entrypoints",
  "Call Graph & Data Flow",
  "Business Logic",
] as const;

export function getChallengeGoal(challenge: LearningChallenge): string {
  if (challenge.goal && challenge.goal.trim()) {
    return challenge.goal.trim();
  }
  const id = challenge.id.toLowerCase();
  const path = (challenge.target_path || "").toLowerCase();
  const type = challenge.type;

  if (
    type === "locate" ||
    id.includes("auth") ||
    path.includes("auth") ||
    path.includes("errors")
  ) {
    return "Architecture & Entrypoints";
  }
  if (type === "trace" || path.includes("order")) {
    return "Call Graph & Data Flow";
  }
  if (type === "predict" || path.includes("pricing")) {
    return "Business Logic";
  }
  return "Architecture & Entrypoints";
}

const GROUNDED_REFERENCE_EXCERPTS: Record<
  string,
  { path: string; range: LineRange; snippet: string }
> = {
  "challenge-locate-auth": {
    path: "service/auth.py",
    range: { start_line: 41, end_line: 71 },
    snippet: `def verify_token(token: str) -> dict[str, Any]:
    """Validates bearer tokens."""
    if not token or not isinstance(token, str):
        raise AuthenticationError("Token is missing or malformed.")

    parts = token.strip().split(".")
    if len(parts) != 3:
        raise AuthenticationError("Bearer token format invalid.")

    user_id, expires_str, signature = parts
    try:
        expires_at = int(expires_str)
    except ValueError as exc:
        raise AuthenticationError("Token timestamp is invalid.") from exc

    current_time = int(time.time())
    if current_time > expires_at:
        raise AuthenticationError("Bearer token has expired.")

    expected_data = f"{user_id}:{expires_at}".encode("utf-8")
    expected_sig = hmac.new(
        TOKEN_SECRET.encode("utf-8"), expected_data, hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(signature, expected_sig):
        raise AuthenticationError("Token signature validation failed.")

    return {
        "sub": user_id,
        "permissions": ["orders:read", "orders:write"],
    }`,
  },
  "challenge-trace-order": {
    path: "service/orders.py",
    range: { start_line: 51, end_line: 75 },
    snippet: `    def create_order(
        self,
        token: str,
        items: list[dict[str, Any]],
        shipping_tier: str = "standard",
        discount_code: str | None = None,
    ) -> dict[str, Any]:
        """Creates and validates a new customer order.

        Validation pipeline sequence:
        1. Token signature check (validates caller authorization)
        2. Inventory availability verification
        3. Pricing and fee computation
        4. Payment authorization
        5. Order persistence and tracking number generation
        """
        # Step 1: Perform token signature check
        user_payload = verify_token(token)
        user_id = user_payload["sub"]`,
  },
  "challenge-predict-fee": {
    path: "service/pricing.py",
    range: { start_line: 25, end_line: 33 },
    snippet: `def calculate_fee(amount: float, shipping_tier: str = "standard") -> float:
    """Calculates order processing and shipping fee based on tier and amount."""
    tier = shipping_tier.strip().lower()
    if tier == "express":
        return 15.0
    if tier == "priority":
        return 10.0
    return 5.0`,
  },
  "challenge-locate-errors": {
    path: "service/errors.py",
    range: { start_line: 6, end_line: 13 },
    snippet: `class ServiceError(Exception):
    """Base exception for all service domain errors."""

    def __init__(self, message: str, code: str = "service_error") -> None:
        super().__init__(message)
        self.message = message
        self.code = code`,
  },
};

export function LearningArenaTab({
  repoId,
  onNavigateCitation,
}: LearningArenaTabProps) {
  const [challenges, setChallenges] = useState<LearningChallenge[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedGoal, setSelectedGoal] = useState<string>("All");

  // Per-challenge state to preserve progress during non-linear exploration
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string>
  >({});
  const [hintStages, setHintStages] = useState<Record<string, number>>({});
  const [hintsUsed, setHintsUsed] = useState<Record<string, number>>({});
  const [hintsExpanded, setHintsExpanded] = useState<Record<string, boolean>>(
    {},
  );
  const [solutionRevealed, setSolutionRevealed] = useState<
    Record<string, boolean>
  >({});
  const [codeDrawerOpen, setCodeDrawerOpen] = useState<Record<string, boolean>>(
    {},
  );
  const [dynamicExcerpts, setDynamicExcerpts] = useState<
    Record<string, { path: string; range: LineRange; snippet: string }>
  >({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<
    Record<string, ChallengeEvaluationResponse>
  >({});
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [provenances, setProvenances] = useState<
    Record<string, AttemptProvenance>
  >({});
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    fetchChallenges(repoId)
      .then((data) => {
        if (data && data.length > 0) {
          setChallenges(data);
          setActiveIdx(0);
        }
      })
      .catch((err) => {
        console.error("Failed to load challenges:", err);
      });
  }, [repoId]);

  const activeChallenge = challenges[activeIdx];

  // Fetch dynamic reference code if not provided on challenge or static map
  useEffect(() => {
    if (!activeChallenge) return;
    const challengeId = activeChallenge.id;
    if (activeChallenge.code_excerpt?.snippet) return;
    if (GROUNDED_REFERENCE_EXCERPTS[challengeId]) return;
    if (dynamicExcerpts[challengeId]) return;

    if (activeChallenge.target_path) {
      fetchFileDetail(activeChallenge.target_path, repoId)
        .then((file) => {
          if (file && file.content) {
            const lines = file.content.split("\n");
            // Default to first 30 lines or whole file if short
            const snippet = lines.slice(0, 35).join("\n");
            setDynamicExcerpts((prev) => ({
              ...prev,
              [challengeId]: {
                path: file.path,
                range: { start_line: 1, end_line: Math.min(35, lines.length) },
                snippet,
              },
            }));
          }
        })
        .catch(() => {
          // Dynamic excerpt fallback gracefully fails to default path preview
        });
    }
  }, [activeChallenge, repoId, dynamicExcerpts]);

  // Derived Goal statistics
  const { goalList, goalStats } = useMemo(() => {
    const goalsSet = new Set<string>();
    const stats: Record<string, { total: number; solved: number }> = {};

    DEFAULT_ARCHITECTURAL_GOALS.forEach((g) => {
      goalsSet.add(g);
      stats[g] = { total: 0, solved: 0 };
    });

    challenges.forEach((c) => {
      const g = getChallengeGoal(c);
      goalsSet.add(g);
      if (!stats[g]) {
        stats[g] = { total: 0, solved: 0 };
      }
      stats[g].total += 1;
      if (completedIds.has(c.id)) {
        stats[g].solved += 1;
      }
    });

    return {
      goalList: Array.from(goalsSet),
      goalStats: stats,
    };
  }, [challenges, completedIds]);

  // Filtered challenges based on selected architectural goal
  const filteredChallenges = useMemo(() => {
    if (selectedGoal === "All") return challenges;
    return challenges.filter((c) => getChallengeGoal(c) === selectedGoal);
  }, [challenges, selectedGoal]);

  const activeChallengeId = activeChallenge ? activeChallenge.id : "";
  const currentSelectedOption = selectedOptions[activeChallengeId] || "";
  const currentResult = results[activeChallengeId] || null;
  const currentHintStage = hintStages[activeChallengeId] || 0;
  const currentHintsUsed = hintsUsed[activeChallengeId] || 0;
  const isHintExpanded = hintsExpanded[activeChallengeId] ?? false;
  const isSolutionRevealed = solutionRevealed[activeChallengeId] ?? false;
  const isCodeOpen = codeDrawerOpen[activeChallengeId] ?? false;
  const currentProvenance = provenances[activeChallengeId] || null;

  // Resolve reference code excerpt
  const referenceExcerpt = useMemo(() => {
    if (!activeChallenge) return null;
    if (activeChallenge.code_excerpt?.snippet) {
      return activeChallenge.code_excerpt;
    }
    if (GROUNDED_REFERENCE_EXCERPTS[activeChallenge.id]) {
      return GROUNDED_REFERENCE_EXCERPTS[activeChallenge.id];
    }
    if (dynamicExcerpts[activeChallenge.id]) {
      return dynamicExcerpts[activeChallenge.id];
    }
    return {
      path: activeChallenge.target_path || "main.py",
      range: { start_line: 1, end_line: 25 },
      snippet: `# Source file: ${activeChallenge.target_path}\n# Inspect file in source viewer for detailed AST definition.`,
    };
  }, [activeChallenge, dynamicExcerpts]);

  const handleSelectChallenge = (index: number) => {
    setActiveIdx(index);
  };

  const handleSelectOption = (option: string) => {
    if (!activeChallengeId) return;
    setSelectedOptions((prev) => ({
      ...prev,
      [activeChallengeId]: option,
    }));
  };

  // Progressive Hint Handler (preserves selectedOption)
  const handleRequestHint = useCallback(() => {
    if (!activeChallengeId) return;
    const nextStage = Math.min((hintStages[activeChallengeId] || 0) + 1, 2);
    setHintStages((prev) => ({ ...prev, [activeChallengeId]: nextStage }));
    setHintsUsed((prev) => ({
      ...prev,
      [activeChallengeId]: Math.max(prev[activeChallengeId] || 0, nextStage),
    }));
    setHintsExpanded((prev) => ({ ...prev, [activeChallengeId]: true }));
  }, [activeChallengeId, hintStages]);

  const handleToggleHintExpanded = () => {
    if (!activeChallengeId) return;
    if (currentHintStage === 0) {
      handleRequestHint();
    } else {
      setHintsExpanded((prev) => ({
        ...prev,
        [activeChallengeId]: !isHintExpanded,
      }));
    }
  };

  const handleRevealSolution = () => {
    if (!activeChallengeId) return;
    setSolutionRevealed((prev) => ({ ...prev, [activeChallengeId]: true }));
    setHintsExpanded((prev) => ({ ...prev, [activeChallengeId]: true }));
  };

  const handleToggleCodeDrawer = () => {
    if (!activeChallengeId) return;
    setCodeDrawerOpen((prev) => ({
      ...prev,
      [activeChallengeId]: !isCodeOpen,
    }));
  };

  const handleCopyCode = async () => {
    if (!referenceExcerpt?.snippet) return;
    try {
      await navigator.clipboard.writeText(referenceExcerpt.snippet);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Keyboard navigation & Shortcuts (Ctrl+K hints, Esc handling)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K: request progressive hint without losing selection
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleRequestHint();
        return;
      }

      // Escape: Close open drawers or dismiss hint
      if (e.key === "Escape") {
        if (isCodeOpen) {
          e.preventDefault();
          setCodeDrawerOpen((prev) => ({
            ...prev,
            [activeChallengeId]: false,
          }));
        } else if (isHintExpanded) {
          e.preventDefault();
          setHintsExpanded((prev) => ({
            ...prev,
            [activeChallengeId]: false,
          }));
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRequestHint, isCodeOpen, isHintExpanded, activeChallengeId]);

  // Arrow key navigation for options list
  const handleOptionKeyDown = (
    e: React.KeyboardEvent,
    currentIndex: number,
    totalCount: number,
  ) => {
    if (!activeChallenge) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      const nextIdx = (currentIndex + 1) % totalCount;
      handleSelectOption(activeChallenge.options[nextIdx]);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      const prevIdx = (currentIndex - 1 + totalCount) % totalCount;
      handleSelectOption(activeChallenge.options[prevIdx]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSelectOption(activeChallenge.options[currentIndex]);
    }
  };

  const handleSubmit = async () => {
    if (!activeChallenge || !currentSelectedOption || isSubmitting) return;

    setIsSubmitting(true);
    const hintsCount = currentHintsUsed;
    const isRevealed = isSolutionRevealed;

    let computedProvenance: AttemptProvenance = "independent";
    if (isRevealed) {
      computedProvenance = "solution_revealed";
    } else if (hintsCount > 0) {
      computedProvenance = "hint_assisted";
    }

    try {
      const evalRes = await evaluateChallenge(
        activeChallenge.id,
        currentSelectedOption,
        undefined,
        activeChallenge.target_path,
        repoId,
        hintsCount,
        isRevealed,
      );

      const finalResult: ChallengeEvaluationResponse = {
        ...evalRes,
        provenance: evalRes.provenance || computedProvenance,
        explanation:
          evalRes.explanation || activeChallenge.solution_explanation,
      };

      setResults((prev) => ({ ...prev, [activeChallenge.id]: finalResult }));

      if (evalRes.is_correct) {
        setCompletedIds((prev) => new Set(prev).add(activeChallenge.id));
        setProvenances((prev) => ({
          ...prev,
          [activeChallenge.id]: computedProvenance,
        }));
      }
    } catch {
      setResults((prev) => ({
        ...prev,
        [activeChallenge.id]: {
          is_correct: false,
          score: 0,
          feedback:
            "Failed to communicate with evaluation server. Please ensure backend is reachable.",
          citations: [],
          provenance: computedProvenance,
        },
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextChallenge = () => {
    if (activeIdx < challenges.length - 1) {
      handleSelectChallenge(activeIdx + 1);
    }
  };

  if (!activeChallenge) {
    return (
      <div className={styles.container}>
        <div style={{ padding: "2rem", textAlign: "center", color: "#888" }}>
          Loading interactive challenges...
        </div>
      </div>
    );
  }

  const activeGoal = getChallengeGoal(activeChallenge);

  let typeBadgeClass = styles.typeLocate;
  if (activeChallenge.type === "trace") typeBadgeClass = styles.typeTrace;
  else if (activeChallenge.type === "predict")
    typeBadgeClass = styles.typePredict;

  return (
    <div className={styles.container}>
      {/* Learning Arena Header */}
      <div className={styles.arenaHeader}>
        <div className={styles.goalTitle}>
          <Trophy size={16} style={{ color: "var(--color-accent-amber)" }} />
          <span>Learning Arena</span>
          <span className={styles.progressBadge}>
            {completedIds.size} / {challenges.length} Solved
          </span>
        </div>
        <p className={styles.goalDescription}>
          Grounded challenges designed to help you locate components, trace
          cross-module execution flows, and predict business logic outcomes with
          verified AST citations.
        </p>

        {/* Goal Grouping Filters */}
        <div
          className={styles.goalFilterBar}
          role="tablist"
          aria-label="Architectural Goals"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedGoal === "All"}
            className={`${styles.goalFilterPill} ${
              selectedGoal === "All" ? styles.active : ""
            }`}
            onClick={() => setSelectedGoal("All")}
          >
            <span>All Goals</span>
            <span className={styles.goalFilterCount}>
              {completedIds.size}/{challenges.length}
            </span>
          </button>
          {goalList.map((goal) => {
            const stats = goalStats[goal] || { total: 0, solved: 0 };
            if (stats.total === 0) return null;
            const isGoalActive = selectedGoal === goal;
            return (
              <button
                key={goal}
                type="button"
                role="tab"
                aria-selected={isGoalActive}
                className={`${styles.goalFilterPill} ${
                  isGoalActive ? styles.active : ""
                }`}
                onClick={() => setSelectedGoal(goal)}
              >
                <span>{goal}</span>
                <span className={styles.goalFilterCount}>
                  {stats.solved}/{stats.total}
                </span>
              </button>
            );
          })}
        </div>

        {/* Challenge Selector Tabs (Preserving Non-linear Exploration) */}
        <div
          className={styles.challengeSelector}
          role="tablist"
          aria-label="Challenges"
        >
          {filteredChallenges.map((c) => {
            const originalIdx = challenges.findIndex((ch) => ch.id === c.id);
            const isCompleted = completedIds.has(c.id);
            const prov = provenances[c.id];
            const isActive = activeIdx === originalIdx;

            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`${styles.challengeTab} ${
                  isActive ? styles.active : ""
                }`}
                onClick={() => handleSelectChallenge(originalIdx)}
                title={c.title}
              >
                <span className={`${styles.typeBadge} ${typeBadgeClass}`}>
                  {c.type}
                </span>
                <span>{c.title}</span>
                {isCompleted && (
                  <>
                    <CheckCircle2
                      size={13}
                      style={{ color: "var(--color-accent-teal)" }}
                    />
                    {prov === "independent" && (
                      <span
                        className={`${styles.provenanceBadge} ${styles.provenanceIndependent}`}
                      >
                        Indep
                      </span>
                    )}
                    {prov === "hint_assisted" && (
                      <span
                        className={`${styles.provenanceBadge} ${styles.provenanceHint}`}
                      >
                        Hint
                      </span>
                    )}
                    {prov === "solution_revealed" && (
                      <span
                        className={`${styles.provenanceBadge} ${styles.provenanceRevealed}`}
                      >
                        Rev
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Challenge Card */}
      <div className={styles.challengeCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardMetaRow}>
            <span className={styles.goalTag}>
              <Layers size={11} />
              <span>{activeGoal}</span>
            </span>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <span className={`${styles.typeBadge} ${typeBadgeClass}`}>
                {activeChallenge.type}
              </span>
              {currentProvenance && (
                <span
                  className={`${styles.provenanceBadge} ${
                    currentProvenance === "independent"
                      ? styles.provenanceIndependent
                      : currentProvenance === "hint_assisted"
                        ? styles.provenanceHint
                        : styles.provenanceRevealed
                  }`}
                >
                  {currentProvenance === "independent" && (
                    <>
                      <Sparkles size={10} />
                      <span>Independent</span>
                    </>
                  )}
                  {currentProvenance === "hint_assisted" && (
                    <>
                      <HelpCircle size={10} />
                      <span>Hint Assisted ({currentHintsUsed})</span>
                    </>
                  )}
                  {currentProvenance === "solution_revealed" && (
                    <>
                      <BookOpen size={10} />
                      <span>Solution Revealed</span>
                    </>
                  )}
                </span>
              )}
            </div>
          </div>
          <span className={styles.challengeTitle}>{activeChallenge.title}</span>
        </div>

        <p className={styles.promptText}>{activeChallenge.prompt}</p>

        {/* Accessible Options Radio Group */}
        <div
          className={styles.optionsList}
          role="radiogroup"
          aria-label="Challenge Options"
        >
          {activeChallenge.options.map((opt, optIdx) => {
            const isSelected = currentSelectedOption === opt;
            return (
              <div
                key={opt}
                role="radio"
                aria-checked={isSelected}
                tabIndex={
                  isSelected || (!currentSelectedOption && optIdx === 0)
                    ? 0
                    : -1
                }
                className={`${styles.optionItem} ${
                  isSelected ? styles.selected : ""
                }`}
                onClick={() => handleSelectOption(opt)}
                onKeyDown={(e) =>
                  handleOptionKeyDown(e, optIdx, activeChallenge.options.length)
                }
              >
                <div className={styles.radioCircle}>
                  {isSelected && <div className={styles.innerDot} />}
                </div>
                <span>{opt}</span>
              </div>
            );
          })}
        </div>

        {/* Actions Row: Progressive Hints & Reference Code Drawers */}
        <div className={styles.actionsRow}>
          <button
            type="button"
            className={`${styles.drawerToggleBtn} ${
              isHintExpanded ? styles.active : ""
            }`}
            onClick={handleToggleHintExpanded}
            aria-expanded={isHintExpanded}
            title="Request progressive hint (Shortcut: Ctrl+K)"
          >
            <Lightbulb
              size={13}
              style={{ color: "var(--color-accent-amber)" }}
            />
            <span>
              {currentHintStage === 0
                ? "Request Hint"
                : isHintExpanded
                  ? "Hide Hint"
                  : `Show Hint (${currentHintStage}/2)`}
            </span>
            <kbd className={styles.kbdShortcut}>Ctrl+K</kbd>
          </button>

          <button
            type="button"
            className={`${styles.drawerToggleBtn} ${
              isCodeOpen ? styles.active : ""
            }`}
            onClick={handleToggleCodeDrawer}
            aria-expanded={isCodeOpen}
            title="Inspect reference code excerpt"
          >
            <Code2 size={13} style={{ color: "var(--color-accent-teal)" }} />
            <span>{isCodeOpen ? "Hide Code" : "Inspect Reference Code"}</span>
            {isCodeOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>

        {/* Progressive Hint Drawer */}
        {isHintExpanded && (
          <div className={styles.hintDrawer}>
            <div className={styles.hintDrawerHeader}>
              <span className={styles.hintStepBadge}>
                {currentHintStage === 1
                  ? "Hint 1 of 2: Architectural Clue"
                  : "Hint 2 of 2: Implementation Pointer"}
              </span>
              <button
                type="button"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  fontSize: "0.7rem",
                }}
                onClick={() =>
                  setHintsExpanded((prev) => ({
                    ...prev,
                    [activeChallengeId]: false,
                  }))
                }
              >
                Close (Esc)
              </button>
            </div>

            <p className={styles.hintText}>
              {currentHintStage === 1 ? (
                <>
                  Focus on module <code>{activeChallenge.target_path}</code>.
                  Consider how this component establishes boundaries and handles
                  its primary responsibilities within the service architecture.
                </>
              ) : (
                activeChallenge.hint
              )}
            </p>

            {isSolutionRevealed && (
              <div className={styles.solutionExplanationBlock}>
                <span className={styles.solutionExplanationTitle}>
                  Solution Explanation
                </span>
                <p className={styles.solutionExplanationText}>
                  {activeChallenge.solution_explanation ||
                    "Review the referenced AST structure in the reference code drawer to trace the exact execution path."}
                </p>
              </div>
            )}

            <div className={styles.hintFooter}>
              {currentHintStage < 2 ? (
                <button
                  type="button"
                  className={styles.progressiveHintAction}
                  onClick={handleRequestHint}
                >
                  <Lightbulb size={11} />
                  <span>Request Next Hint (2 of 2)</span>
                </button>
              ) : (
                !isSolutionRevealed && (
                  <button
                    type="button"
                    className={styles.revealSolutionBtn}
                    onClick={handleRevealSolution}
                  >
                    <BookOpen size={11} />
                    <span>Reveal Solution Explanation</span>
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Inspect Reference Code Drawer */}
        {isCodeOpen && referenceExcerpt && (
          <div className={styles.referenceDrawer}>
            <div className={styles.referenceDrawerHeader}>
              <div className={styles.referencePathBlock}>
                <Code2
                  size={12}
                  style={{ color: "var(--color-accent-teal)" }}
                />
                <span>{referenceExcerpt.path}</span>
                {referenceExcerpt.range && (
                  <span className={styles.referenceRangeBadge}>
                    L{referenceExcerpt.range.start_line}–
                    {referenceExcerpt.range.end_line}
                  </span>
                )}
              </div>
              <div className={styles.referenceActions}>
                <button
                  type="button"
                  className={styles.referenceActionBtn}
                  onClick={handleCopyCode}
                  title="Copy reference code snippet"
                >
                  {copiedCode ? <Check size={11} /> : <Copy size={11} />}
                  <span>{copiedCode ? "Copied" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  className={styles.referenceActionBtn}
                  onClick={() =>
                    onNavigateCitation({
                      path: referenceExcerpt.path,
                      range: referenceExcerpt.range,
                      snippet: referenceExcerpt.snippet,
                    })
                  }
                  title="Open source file in full inspector"
                >
                  <span>Inspector</span>
                  <ArrowRight size={10} />
                </button>
              </div>
            </div>

            <div className={styles.codeExcerptContainer}>
              <div className={styles.lineNumbers} aria-hidden="true">
                {(referenceExcerpt.snippet || "")
                  .split("\n")
                  .map((_, lineIdx) => (
                    <span key={lineIdx}>
                      {(referenceExcerpt.range?.start_line || 1) + lineIdx}
                    </span>
                  ))}
              </div>
              <pre className={styles.codeContent}>
                <code>
                  {referenceExcerpt.snippet ||
                    "# Source file loaded. Inspect in Source Inspector for full tree."}
                </code>
              </pre>
            </div>
          </div>
        )}

        <button
          type="button"
          className={styles.submitBtn}
          disabled={!currentSelectedOption || isSubmitting}
          onClick={handleSubmit}
        >
          <Sparkles size={14} />
          <span>{isSubmitting ? "Evaluating..." : "Submit Answer"}</span>
        </button>

        {/* Evaluation Result Feedback & Evidence Citations */}
        {currentResult && (
          <div
            className={`${styles.feedbackBanner} ${
              currentResult.is_correct ? styles.correct : styles.incorrect
            }`}
          >
            <div
              className={`${styles.feedbackHeader} ${
                currentResult.is_correct ? styles.correct : styles.incorrect
              }`}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                {currentResult.is_correct ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <XCircle size={16} />
                )}
                <span>
                  {currentResult.is_correct
                    ? `Correct (+${currentResult.score} pts)`
                    : "Incorrect"}
                </span>
                {currentResult.provenance && (
                  <span
                    className={`${styles.provenanceBadge} ${
                      currentResult.provenance === "independent"
                        ? styles.provenanceIndependent
                        : currentResult.provenance === "hint_assisted"
                          ? styles.provenanceHint
                          : styles.provenanceRevealed
                    }`}
                  >
                    {currentResult.provenance === "independent" &&
                      "Independent"}
                    {currentResult.provenance === "hint_assisted" &&
                      `Hint Assisted (${currentHintsUsed})`}
                    {currentResult.provenance === "solution_revealed" &&
                      "Solution Revealed"}
                  </span>
                )}
              </div>

              {currentResult.is_correct ? (
                activeIdx < challenges.length - 1 && (
                  <button
                    type="button"
                    className={styles.nextBtn}
                    onClick={handleNextChallenge}
                  >
                    <span>Next Challenge</span>
                    <ArrowRight size={12} />
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className={styles.retryBtn}
                  onClick={() => {
                    setResults((prev) => {
                      const next = { ...prev };
                      delete next[activeChallengeId];
                      return next;
                    });
                  }}
                >
                  <RotateCcw size={11} />
                  <span>Try Again</span>
                </button>
              )}
            </div>

            <p className={styles.feedbackMessage}>{currentResult.feedback}</p>

            {/* Solution Explanation in results */}
            {(currentResult.explanation ||
              activeChallenge.solution_explanation) && (
              <div className={styles.solutionExplanationBlock}>
                <span className={styles.solutionExplanationTitle}>
                  Architectural Rationale
                </span>
                <p className={styles.solutionExplanationText}>
                  {currentResult.explanation ||
                    activeChallenge.solution_explanation}
                </p>
              </div>
            )}

            {/* Verified Evidence Citations */}
            {currentResult.citations && currentResult.citations.length > 0 && (
              <div className={styles.citationsBlock}>
                <div className={styles.citationsBlockHeader}>
                  <span>Evidence Citations</span>
                  <span className={styles.verifiedTag}>static_verified</span>
                </div>
                {currentResult.citations.map((c, cIdx) => (
                  <div key={cIdx} className={styles.citationCard}>
                    <div className={styles.citationTopRow}>
                      <CitationBadge
                        citation={c}
                        onClick={onNavigateCitation}
                      />
                    </div>
                    {c.snippet && (
                      <pre className={styles.citationSnippet}>
                        <code>{c.snippet}</code>
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
