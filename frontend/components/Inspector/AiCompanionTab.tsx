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
  repoId?: string;
  onNavigateCitation: (citation: CitationRef) => void;
  initialPrompt?: string;
}

export function AiCompanionTab({
  selectedNode,
  repoId,
  onNavigateCitation,
  initialPrompt,
}: AiCompanionTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "model",
      content:
        "👋 Welcome! I am your Gemini Codebase Companion. Ask me anything about this repository, or click any symbol or file on the map to see grounded architectural explanations with verified code citations.",
    },
  ]);
  const [inputVal, setInputVal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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

    explainSymbol(node.path, node.name, node.id, prompt, repoId)
      .then((res) => {
        if (!isCancelled) {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: prompt },
            {
              role: "model",
              content: res.explanation,
              citations: res.citations,
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
  }, [initialPrompt, selectedNode, repoId]);

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
        repoId,
      );

      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          content: res.reply,
          citations: res.citations,
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

  // Helper to parse inline markdown (bold text, inline code)
  const renderInline = (text: string): React.ReactNode[] => {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return (
          <code
            key={i}
            style={{
              backgroundColor: "var(--color-panel)",
              border: "1px solid var(--color-border)",
              borderRadius: "4px",
              padding: "0.1rem 0.35rem",
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.825em",
              color: "var(--color-accent-teal)",
            }}
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return (
          <strong
            key={i}
            style={{ color: "var(--color-text)", fontWeight: 600 }}
          >
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  // Helper to render structured markdown
  const renderFormattedContent = (content: string) => {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    let codeBlockKey = 0;

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];

      // Code block start / end
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          elements.push(
            <pre
              key={`code-${codeBlockKey++}`}
              style={{
                backgroundColor: "var(--color-canvas)",
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                padding: "0.6rem 0.8rem",
                overflowX: "auto",
                fontSize: "0.775rem",
                fontFamily: "ui-monospace, monospace",
                margin: "0.4rem 0",
              }}
            >
              <code>{codeBlockLines.join("\n")}</code>
            </pre>,
          );
          codeBlockLines = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
          codeBlockLines = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        continue;
      }

      // Headings
      if (line.startsWith("### ")) {
        elements.push(
          <h4
            key={idx}
            style={{
              margin: "0.5rem 0 0.25rem",
              color: "var(--color-accent-teal)",
              fontSize: "0.9rem",
              fontWeight: 700,
            }}
          >
            {renderInline(line.replace("### ", ""))}
          </h4>,
        );
        continue;
      }
      if (line.startsWith("## ")) {
        elements.push(
          <h3
            key={idx}
            style={{
              margin: "0.6rem 0 0.3rem",
              color: "var(--color-accent-violet)",
              fontSize: "0.95rem",
              fontWeight: 700,
            }}
          >
            {renderInline(line.replace("## ", ""))}
          </h3>,
        );
        continue;
      }

      // Bullet lists
      if (line.startsWith("- ") || line.startsWith("* ")) {
        elements.push(
          <div
            key={idx}
            style={{
              paddingLeft: "0.75rem",
              margin: "0.15rem 0",
              display: "flex",
              gap: "0.4rem",
              alignItems: "baseline",
            }}
          >
            <span
              style={{
                color: "var(--color-accent-violet)",
                fontSize: "0.8rem",
              }}
            >
              •
            </span>
            <span>{renderInline(line.substring(2))}</span>
          </div>,
        );
        continue;
      }

      // Numbered lists (e.g. "1. Step")
      const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
      if (numMatch) {
        elements.push(
          <div
            key={idx}
            style={{
              paddingLeft: "0.75rem",
              margin: "0.15rem 0",
              display: "flex",
              gap: "0.4rem",
              alignItems: "baseline",
            }}
          >
            <span
              style={{
                color: "var(--color-accent-violet)",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              {numMatch[1]}.
            </span>
            <span>{renderInline(numMatch[2])}</span>
          </div>,
        );
        continue;
      }

      // Empty line spacing
      if (!line.trim()) {
        elements.push(<div key={idx} style={{ height: "0.35rem" }} />);
        continue;
      }

      // Regular paragraph
      elements.push(
        <p key={idx} style={{ margin: "0.2rem 0" }}>
          {renderInline(line)}
        </p>,
      );
    }

    return elements;
  };

  return (
    <div className={styles.container}>
      {/* Header with Model info */}
      <div className={styles.aiHeader}>
        <div className={styles.modelBadge}>
          <Sparkles size={12} />
          <span>Gemini 2.5 Flash</span>
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
                : "Explain the main entrypoint and architecture of this repository",
            )
          }
        >
          {selectedNode
            ? `Explain ${selectedNode.name}`
            : "Explain Architecture"}
        </button>
        <button
          type="button"
          className={styles.chipBtn}
          onClick={() =>
            handleSendMessage(
              "How does the primary data flow and execution pipeline work?",
            )
          }
        >
          Trace execution flow
        </button>
        <button
          type="button"
          className={styles.chipBtn}
          onClick={() =>
            handleSendMessage(
              "Where are domain errors and exceptions defined and handled?",
            )
          }
        >
          Error handling
        </button>
        <button
          type="button"
          className={styles.chipBtn}
          onClick={() =>
            handleSendMessage(
              "What dependencies and external packages does this codebase rely on?",
            )
          }
        >
          Dependencies
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
