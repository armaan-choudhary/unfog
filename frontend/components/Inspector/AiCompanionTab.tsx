"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Bot, ShieldCheck } from "lucide-react";
import { ChatMessage, CitationRef } from "../../lib/types";
import { sendAiChat, explainSymbol } from "../../lib/api";
import { CodebaseNodeData } from "../Map/CustomNode";
import { CitationBadge } from "../Common/CitationBadge";
import styles from "./AiCompanionTab.module.css";

interface AiCompanionTabProps {
  selectedNode: CodebaseNodeData | null;
  onNavigateCitation: (citation: CitationRef) => void;
  initialPrompt?: string;
}

export function AiCompanionTab({
  selectedNode,
  onNavigateCitation,
  initialPrompt,
}: AiCompanionTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "model",
      content:
        "👋 Welcome! I am your Gemini Codebase Companion. Ask me anything about `sample_service`, or click any symbol to see grounded architectural explanations with verified code citations.",
      citations: [
        {
          path: "service/auth.py",
          range: { start_line: 12, end_line: 25 },
          snippet: "verify_token implementation",
        },
      ],
    },
  ]);
  const [inputVal, setInputVal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeModel, setActiveModel] = useState<string>("gemini-2.5-flash");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Handle triggered initialPrompt asynchronously
  useEffect(() => {
    if (!initialPrompt || !selectedNode) return;
    const prompt = initialPrompt;
    const node = selectedNode;
    let isCancelled = false;

    explainSymbol(node.path, node.name, node.id, prompt)
      .then((res) => {
        if (!isCancelled) {
          if (res.model) setActiveModel(res.model);
          setMessages((prev) => [
            ...prev,
            { role: "user", content: prompt },
            {
              role: "model",
              content: res.explanation,
              citations: res.citations,
              model: res.model,
            },
          ]);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: prompt },
            {
              role: "model",
              content:
                "Unable to contact Gemini backend service. Please check that the API server is running.",
            },
          ]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [initialPrompt, selectedNode]);

  const handleSendMessage = async (msgText: string) => {
    if (!msgText.trim() || isLoading) return;

    const userMsg = msgText.trim();
    setInputVal("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await sendAiChat(
        userMsg,
        selectedNode?.id,
        selectedNode?.path,
        history,
      );

      if (res.model) setActiveModel(res.model);
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          content: res.reply,
          citations: res.citations,
          model: res.model,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          content:
            "Encountered an issue communicating with the AI backend. Please verify your connection.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendMessage(inputVal);
    }
  };

  // Helper to render formatted markdown-like text
  const renderFormattedContent = (content: string) => {
    const lines = content.split("\n");
    return lines.map((line, idx) => {
      if (line.startsWith("### ")) {
        return (
          <h4
            key={idx}
            style={{
              margin: "0.4rem 0 0.2rem",
              color: "var(--color-accent-teal)",
              fontSize: "0.9rem",
            }}
          >
            {line.replace("### ", "")}
          </h4>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <h3
            key={idx}
            style={{
              margin: "0.5rem 0 0.25rem",
              color: "var(--color-accent-violet)",
              fontSize: "0.95rem",
            }}
          >
            {line.replace("## ", "")}
          </h3>
        );
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return (
          <div
            key={idx}
            style={{
              paddingLeft: "0.75rem",
              margin: "0.15rem 0",
              display: "flex",
              gap: "0.4rem",
            }}
          >
            <span style={{ color: "var(--color-accent-violet)" }}>•</span>
            <span>{line.substring(2)}</span>
          </div>
        );
      }
      if (!line.trim()) {
        return <div key={idx} style={{ height: "0.4rem" }} />;
      }
      return (
        <p key={idx} style={{ margin: "0.2rem 0" }}>
          {line}
        </p>
      );
    });
  };

  return (
    <div className={styles.container}>
      {/* Header with Model info */}
      <div className={styles.aiHeader}>
        <div
          className={styles.modelBadge}
          style={
            activeModel.includes("offline") || activeModel.includes("fallback")
              ? {
                  borderColor: "var(--color-accent-amber)",
                  color: "var(--color-accent-amber)",
                }
              : undefined
          }
        >
          <Sparkles size={12} />
          <span>
            {activeModel.includes("offline") || activeModel.includes("fallback")
              ? "Deterministic Offline Engine"
              : activeModel}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            fontSize: "0.7rem",
            color: "var(--color-accent-teal)",
          }}
        >
          <ShieldCheck size={12} />
          <span>Grounded in AST</span>
        </div>
      </div>

      {/* Quick Prompts */}
      <div className={styles.quickPrompts}>
        <button
          type="button"
          className={styles.chipBtn}
          onClick={() =>
            handleSendMessage(
              selectedNode
                ? `Explain ${selectedNode.name} in ${selectedNode.path}`
                : "Explain token verification in auth.py",
            )
          }
        >
          {selectedNode ? `Explain ${selectedNode.name}` : "Explain auth.py"}
        </button>
        <button
          type="button"
          className={styles.chipBtn}
          onClick={() =>
            handleSendMessage("How does OrderProcessor process orders?")
          }
        >
          Trace order flow
        </button>
        <button
          type="button"
          className={styles.chipBtn}
          onClick={() =>
            handleSendMessage("Where are domain errors and exceptions defined?")
          }
        >
          Error handling
        </button>
        <button
          type="button"
          className={styles.chipBtn}
          onClick={() =>
            handleSendMessage("How is calculate_fee implemented in pricing.py?")
          }
        >
          Pricing fee logic
        </button>
      </div>

      {/* Messages */}
      <div className={styles.messagesList}>
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`${styles.messageBubble} ${
              msg.role === "user" ? styles.userMessage : styles.modelMessage
            }`}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              {msg.role === "model" ? (
                <Bot
                  size={14}
                  style={{ color: "var(--color-accent-violet)" }}
                />
              ) : null}
              <div style={{ flex: 1 }}>
                {renderFormattedContent(msg.content)}
              </div>
            </div>

            {msg.citations && msg.citations.length > 0 && (
              <div className={styles.citationsBlock}>
                <span className={styles.citationsLabel}>Citations:</span>
                <div className={styles.citationsList}>
                  {msg.citations.map((cit, cIdx) => (
                    <CitationBadge
                      key={cIdx}
                      citation={cit}
                      onClick={onNavigateCitation}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className={styles.loadingIndicator}>
            <div className={styles.spinner} />
            <span>Gemini is generating grounded explanation...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        className={styles.inputForm}
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage(inputVal);
        }}
      >
        <input
          type="text"
          className={styles.inputField}
          placeholder={
            selectedNode
              ? `Ask about ${selectedNode.name}...`
              : "Ask a question about the repository..."
          }
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          className={styles.sendBtn}
          disabled={!inputVal.trim() || isLoading}
          title="Send question"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
