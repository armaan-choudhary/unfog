"use client";

import React, { useState, useEffect } from "react";
import {
  Trophy,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import {
  LearningChallenge,
  ChallengeEvaluationResponse,
  CitationRef,
} from "../../lib/types";
import { fetchChallenges, evaluateChallenge } from "../../lib/api";
import { CitationBadge } from "../Common/CitationBadge";
import styles from "./LearningArenaTab.module.css";

interface LearningArenaTabProps {
  onNavigateCitation: (citation: CitationRef) => void;
}

export function LearningArenaTab({
  onNavigateCitation,
}: LearningArenaTabProps) {
  const [challenges, setChallenges] = useState<LearningChallenge[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [showHint, setShowHint] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ChallengeEvaluationResponse | null>(
    null,
  );
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchChallenges()
      .then((data) => {
        if (data && data.length > 0) {
          setChallenges(data);
        }
      })
      .catch((err) => {
        console.error("Failed to load challenges:", err);
      });
  }, []);

  const activeChallenge = challenges[activeIdx];

  const handleSelectChallenge = (index: number) => {
    setActiveIdx(index);
    setSelectedOption("");
    setShowHint(false);
    setResult(null);
  };

  const handleSubmit = async () => {
    if (!activeChallenge || !selectedOption || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const evalRes = await evaluateChallenge(
        activeChallenge.id,
        selectedOption,
        undefined,
        activeChallenge.target_path,
      );
      setResult(evalRes);

      if (evalRes.is_correct && !completedIds.has(activeChallenge.id)) {
        setCompletedIds((prev) => new Set(prev).add(activeChallenge.id));
      }
    } catch {
      setResult({
        is_correct: false,
        score: 0,
        feedback:
          "Failed to communicate with evaluation server. Please ensure backend is reachable.",
        citations: [],
      });
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
          <span>Architecture Mastery</span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: "0.75rem",
              color: "var(--color-accent-teal)",
              fontWeight: 600,
              backgroundColor: "rgba(113, 194, 189, 0.15)",
              padding: "0.2rem 0.5rem",
              borderRadius: "0.375rem",
              border: "1px solid rgba(113, 194, 189, 0.3)",
            }}
          >
            Verified: {completedIds.size} / {challenges.length}
          </span>
        </div>
        <p className={styles.goalDescription}>
          Grounded challenges designed to help you locate components, trace
          cross-module execution flows, and predict business outcomes with
          verified AST citations.
        </p>

        {/* Challenge Selector Tabs */}
        <div className={styles.challengeSelector}>
          {challenges.map((c, idx) => {
            const isCompleted = completedIds.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`${styles.challengeTab} ${
                  activeIdx === idx ? styles.active : ""
                }`}
                onClick={() => handleSelectChallenge(idx)}
              >
                <span className={`${styles.typeBadge} ${typeBadgeClass}`}>
                  {c.type}
                </span>
                <span>{c.title}</span>
                {isCompleted && (
                  <CheckCircle2
                    size={12}
                    style={{ color: "var(--color-accent-teal)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Challenge Card */}
      <div className={styles.challengeCard}>
        <div className={styles.cardHeader}>
          <span className={styles.challengeTitle}>{activeChallenge.title}</span>
          <span className={`${styles.typeBadge} ${typeBadgeClass}`}>
            {activeChallenge.type} challenge
          </span>
        </div>

        <p className={styles.promptText}>{activeChallenge.prompt}</p>

        <div className={styles.optionsList}>
          {activeChallenge.options.map((opt) => (
            <button
              type="button"
              key={opt}
              className={`${styles.optionItem} ${
                selectedOption === opt ? styles.selected : ""
              }`}
              onClick={() => setSelectedOption(opt)}
            >
              <div className={styles.radioCircle}>
                {selectedOption === opt && <div className={styles.innerDot} />}
              </div>
              <span>{opt}</span>
            </button>
          ))}
        </div>

        <div>
          <button
            type="button"
            className={styles.hintToggle}
            onClick={() => setShowHint(!showHint)}
          >
            <HelpCircle
              size={12}
              style={{ display: "inline", marginRight: 4 }}
            />
            {showHint ? "Hide Hint" : "Need a hint?"}
          </button>
          {showHint && (
            <div className={styles.hintBox}>{activeChallenge.hint}</div>
          )}
        </div>

        <button
          type="button"
          className={styles.submitBtn}
          disabled={!selectedOption || isSubmitting}
          onClick={handleSubmit}
        >
          <Sparkles size={14} />
          <span>{isSubmitting ? "Evaluating..." : "Submit Answer"}</span>
        </button>

        {/* Evaluation Result Feedback */}
        {result && (
          <div
            className={`${styles.feedbackBanner} ${
              result.is_correct ? styles.correct : styles.incorrect
            }`}
          >
            <div
              className={`${styles.feedbackHeader} ${
                result.is_correct ? styles.correct : styles.incorrect
              }`}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                {result.is_correct ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <XCircle size={16} />
                )}
                <span>
                  {result.is_correct
                    ? "Correct — understanding verified"
                    : "Needs review — re-trace code evidence"}
                </span>
              </div>
              {result.is_correct && activeIdx < challenges.length - 1 && (
                <button
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.2rem",
                    background: "transparent",
                    border: "none",
                    color: "var(--color-accent-teal)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                  onClick={handleNextChallenge}
                >
                  <span>Next</span>
                  <ArrowRight size={12} />
                </button>
              )}
            </div>

            <p>{result.feedback}</p>

            {result.citations && result.citations.length > 0 && (
              <div className={styles.citationsBlock}>
                <span
                  style={{
                    fontSize: "0.675rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                  }}
                >
                  Evidence Citations:
                </span>
                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}
                >
                  {result.citations.map((c, cIdx) => (
                    <CitationBadge
                      key={cIdx}
                      citation={c}
                      onClick={onNavigateCitation}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
