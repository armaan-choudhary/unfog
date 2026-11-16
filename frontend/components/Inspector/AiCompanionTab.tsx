"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import {
  Send,
  Sparkles,
  Bot,
  ShieldCheck,
  RotateCcw,
  Copy,
  Check,
  Folder,
  GitCommit,
  FileCode,
  Layers,
  AlertCircle,
  CornerDownLeft,
} from "lucide-react";
import { ChatMessage, CitationRef, SourceGraph } from "../../lib/types";
import { sendAiChat, explainSymbol, fetchSourceGraph } from "../../lib/api";
import { CodebaseNodeData } from "../Map/CustomNode";
import { CitationBadge } from "../Common/CitationBadge";
import styles from "./AiCompanionTab.module.css";

export interface AiCompanionTabProps {
  selectedNode: CodebaseNodeData | null;
  repoId?: string;
  snapshotIdentity?: string;
  onNavigateCitation: (citation: CitationRef) => void;
  initialPrompt?: string;
}

interface SuggestionChip {
  id: string;
  label: string;
  prompt: string;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const displayLang = language.trim() ? language.toUpperCase() : "CODE";

  return (
    <div className={styles.codeBlockContainer}>
      <div className={styles.codeBlockHeader}>
        <span className={styles.codeBlockLang}>{displayLang}</span>
        <button
          type="button"
          className={styles.copyCodeBtn}
          onClick={handleCopy}
          title="Copy code to clipboard"
          aria-label="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check size={12} className={styles.copySuccessIcon} />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className={styles.codeBlockPre}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function AiCompanionTab({
  selectedNode,
  repoId,
  snapshotIdentity,
  onNavigateCitation,
  initialPrompt,
}: AiCompanionTabProps) {
  const defaultRepo = repoId || "sample_service";
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "model",
      content:
        "👋 Welcome! I am your Gemini Codebase Companion. Ask me anything about this repository, or click any symbol or file on the map to see grounded architectural explanations with verified code citations.",
      model: "gemini-2.5-flash",
    },
  ]);
  const [inputVal, setInputVal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeRepoRef = useRef(repoId);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Snapshot metadata and graph edges for relationship-aware suggestions
  const [snapshotInfo, setSnapshotInfo] = useState<{
    repoName: string;
    revision: string;
  }>({
    repoName: defaultRepo,
    revision:
      snapshotIdentity ||
      (repoId && repoId !== "sample_service"
        ? `snap-${repoId.slice(0, 7)}`
        : "snapshot-v1"),
  });
  const [graphData, setGraphData] = useState<SourceGraph | null>(null);

  // Fetch graph metadata for current repository
  useEffect(() => {
    let isCancelled = false;
    fetchSourceGraph(repoId)
      .then((g) => {
        if (!isCancelled && g) {
          setGraphData(g);
          setSnapshotInfo({
            repoName: g.snapshot?.repository_name || repoId || "sample_service",
            revision:
              snapshotIdentity ||
              g.snapshot?.revision?.value ||
              (g.snapshot?.id ? g.snapshot.id.slice(0, 8) : "snapshot-v1"),
          });
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setSnapshotInfo({
            repoName: repoId || "sample_service",
            revision:
              snapshotIdentity ||
              (repoId && repoId !== "sample_service"
                ? `snap-${repoId.slice(0, 7)}`
                : "snapshot-v1"),
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [repoId, snapshotIdentity]);

  // Clean conversation reset on repository change without state leaks
  useEffect(() => {
    if (activeRepoRef.current !== repoId) {
      activeRepoRef.current = repoId;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsLoading(false);
      setInputVal("");
      setMessages([
        {
          role: "model",
          content: `👋 Connected to repository "${
            repoId || "sample_service"
          }". Ask me anything about this codebase, or click any symbol or file on the map to explore with verified citations.`,
          model: "gemini-2.5-flash",
        },
      ]);
    }
  }, [repoId]);

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
              model: "offline-fallback",
            },
          ]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [initialPrompt, selectedNode, repoId]);

  // Compute verified relationship counts from indexed graph edges
  const relationshipCounts = useMemo(() => {
    if (!selectedNode || !graphData?.edges) {
      return { inbound: 0, outbound: 0 };
    }
    const nodeId = selectedNode.id;
    let inbound = 0;
    let outbound = 0;

    for (const edge of graphData.edges) {
      if (edge.target_symbol_id === nodeId) {
        if (
          edge.kind === "calls" ||
          edge.kind === "references" ||
          edge.kind === "renders"
        ) {
          inbound++;
        }
      }
      if (edge.source_symbol_id === nodeId) {
        if (
          edge.kind === "calls" ||
          edge.kind === "import" ||
          edge.kind === "renders" ||
          edge.kind === "extends"
        ) {
          outbound++;
        }
      }
    }
    return { inbound, outbound };
  }, [selectedNode, graphData]);

  // Generate smart suggestion chips based on selected symbol type and verified relationships
  const suggestionChips = useMemo<SuggestionChip[]>(() => {
    if (!selectedNode) {
      return [
        {
          id: "arch",
          label: "Explain Architecture",
          prompt:
            "Explain the main entrypoint and high-level architecture of this repository.",
        },
        {
          id: "flow",
          label: "Trace execution flow",
          prompt:
            "How does the primary data flow and execution pipeline work across this codebase?",
        },
        {
          id: "errors",
          label: "Error handling",
          prompt: "Where are domain errors and exceptions defined and handled?",
        },
        {
          id: "deps",
          label: "Explain dependencies",
          prompt:
            "What external packages and internal module dependencies does this codebase rely on?",
        },
      ];
    }

    const { kind, name, path } = selectedNode;
    const { inbound, outbound } = relationshipCounts;

    if (kind === "component") {
      return [
        {
          id: "comp-role",
          label: "What does this component do?",
          prompt: `What does the <${name} /> component do, what are its props, and how does it render?`,
        },
        {
          id: "comp-rendered",
          label:
            inbound > 0
              ? `Where is this rendered? (${inbound})`
              : "Where is this rendered?",
          prompt: `Where is <${name} /> rendered or imported across the codebase?`,
        },
        {
          id: "comp-deps",
          label:
            outbound > 0
              ? `Explain dependencies (${outbound})`
              : "Explain its dependencies",
          prompt: `Explain the dependencies, child components, and hooks used by <${name} />.`,
        },
        {
          id: "comp-flow",
          label: "How does data flow here?",
          prompt: `How does state and data flow into and through <${name} />?`,
        },
      ];
    }

    if (kind === "function" || kind === "method") {
      return [
        {
          id: "fn-role",
          label: `What does ${name} do?`,
          prompt: `Explain what the function ${name} in ${path} does, its arguments, and return values.`,
        },
        {
          id: "fn-callers",
          label:
            inbound > 0
              ? `Where is this called? (${inbound} callers)`
              : "Where is this called?",
          prompt: `Where is ${name} called across this repository? Trace its verified call sites.`,
        },
        {
          id: "fn-deps",
          label:
            outbound > 0
              ? `Explain dependencies (${outbound} callees)`
              : "Explain its dependencies",
          prompt: `Explain the dependencies, imports, and calls made by ${name}.`,
        },
        {
          id: "fn-flow",
          label: "How does data flow here?",
          prompt: `How does data flow through ${name}, and what exceptions or results does it produce?`,
        },
      ];
    }

    if (kind === "class" || kind === "interface") {
      return [
        {
          id: "class-role",
          label: `Explain class ${name}`,
          prompt: `Explain class ${name}, its methods, and encapsulated state invariants.`,
        },
        {
          id: "class-usage",
          label:
            inbound > 0
              ? `Where is this used? (${inbound})`
              : "Where is this used?",
          prompt: `Where is ${name} instantiated, extended, or referenced in the codebase?`,
        },
        {
          id: "class-deps",
          label:
            outbound > 0
              ? `Explain dependencies (${outbound})`
              : "Explain its dependencies",
          prompt: `What dependencies, imports, and base classes does ${name} rely on?`,
        },
        {
          id: "class-flow",
          label: "How does data flow here?",
          prompt: `How does data flow through ${name} during execution?`,
        },
      ];
    }

    if (kind === "file") {
      const fileName = path.split("/").pop() || path;
      return [
        {
          id: "file-role",
          label: `Explain ${fileName} role`,
          prompt: `Explain the architectural role of ${path} in this repository.`,
        },
        {
          id: "file-exports",
          label: "What are the key exports?",
          prompt: `What are the primary functions, classes, and exported symbols defined in ${path}?`,
        },
        {
          id: "file-deps",
          label: "Trace dependencies",
          prompt: `What modules and dependencies does ${path} import or call?`,
        },
        {
          id: "file-flow",
          label: "How does data flow here?",
          prompt: `How does data flow into and out of ${path}?`,
        },
      ];
    }

    return [
      {
        id: "node-role",
        label: `Explain ${name}`,
        prompt: `Explain the purpose and architecture of ${name} in ${path || "the repository"}.`,
      },
      {
        id: "node-callers",
        label:
          inbound > 0
            ? `Inbound connections (${inbound})`
            : "Where is this used?",
        prompt: `Where is ${name} referenced or called in this codebase?`,
      },
      {
        id: "node-deps",
        label:
          outbound > 0
            ? `Dependencies (${outbound})`
            : "Explain its dependencies",
        prompt: `What dependencies and subsystems does ${name} interact with?`,
      },
      {
        id: "node-flow",
        label: "How does data flow here?",
        prompt: `How does data flow into and out of ${name}?`,
      },
    ];
  }, [selectedNode, relationshipCounts]);

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
          model: "offline-fallback",
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

  const handleClearChat = useCallback(() => {
    setMessages([
      {
        role: "model",
        content: `👋 Conversation cleared. Ask me anything about ${
          snapshotInfo.repoName || repoId || "sample_service"
        }, or click any symbol or file on the map to explore.`,
        model: "gemini-2.5-flash",
      },
    ]);
    setInputVal("");
  }, [snapshotInfo.repoName, repoId]);

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
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
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

  // Helper to render structured markdown including code fences with language & copy button
  const renderFormattedContent = (content: string) => {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    let codeBlockLang = "";
    let codeBlockKey = 0;

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];

      // Code block start / end
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          const codeText = codeBlockLines.join("\n");
          elements.push(
            <CodeBlock
              key={`code-${codeBlockKey++}`}
              language={codeBlockLang}
              code={codeText}
            />,
          );
          codeBlockLines = [];
          codeBlockLang = "";
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
          codeBlockLines = [];
          const match = line.trim().match(/^```([a-zA-Z0-9_-]+)?/);
          codeBlockLang = match?.[1] || "";
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

    // Flush any unclosed code block
    if (inCodeBlock && codeBlockLines.length > 0) {
      elements.push(
        <CodeBlock
          key={`code-${codeBlockKey++}`}
          language={codeBlockLang}
          code={codeBlockLines.join("\n")}
        />,
      );
    }

    return elements;
  };

  return (
    <div className={styles.container}>
      {/* Header with Model info and Controls */}
      <div className={styles.aiHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.modelBadge}>
            <Sparkles size={12} />
            <span>Gemini 2.5 Flash</span>
          </div>
          <div
            className={styles.groundedBadge}
            title="AST and relationship grounded responses"
          >
            <ShieldCheck size={12} />
            <span>Grounded in AST</span>
          </div>
        </div>

        <button
          type="button"
          className={styles.clearChatBtn}
          onClick={handleClearChat}
          title="Clear chat and start fresh"
          aria-label="Clear chat"
        >
          <RotateCcw size={12} />
          <span>Clear Chat</span>
        </button>
      </div>

      {/* Active Context Banner */}
      <div className={styles.contextBanner} aria-label="Active Context Banner">
        <div className={styles.contextBannerRow}>
          <div
            className={styles.contextPill}
            title={`Active Repository: ${snapshotInfo.repoName}`}
          >
            <Folder size={12} className={styles.contextIconRepo} />
            <span className={styles.contextPillLabel}>Repo:</span>
            <span className={styles.contextPillValue}>
              {snapshotInfo.repoName}
            </span>
          </div>

          <div
            className={styles.contextPill}
            title={`Snapshot Identity: ${snapshotInfo.revision}`}
          >
            <GitCommit size={12} className={styles.contextIconGit} />
            <span className={styles.contextPillLabel}>Snap:</span>
            <span className={styles.contextPillValue}>
              {snapshotInfo.revision}
            </span>
          </div>

          {selectedNode ? (
            <>
              <div
                className={styles.contextPill}
                title={`Selected File: ${selectedNode.path}`}
              >
                <FileCode size={12} className={styles.contextIconFile} />
                <span className={styles.contextPillValue}>
                  {selectedNode.path}
                </span>
              </div>

              {selectedNode.kind !== "file" &&
                selectedNode.kind !== "group" && (
                  <div
                    className={styles.contextPill}
                    title={`Selected Symbol: ${selectedNode.name} (${selectedNode.kind})`}
                  >
                    <span className={styles.symbolKindTag}>
                      {selectedNode.kind}
                    </span>
                    <span className={styles.contextPillValueHighlight}>
                      {selectedNode.name}
                    </span>
                  </div>
                )}

              {selectedNode.range && (
                <div
                  className={styles.contextPill}
                  title={`Line Range: ${selectedNode.range.start_line} to ${selectedNode.range.end_line}`}
                >
                  <span className={styles.contextPillRange}>
                    L{selectedNode.range.start_line}–
                    {selectedNode.range.end_line}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div
              className={styles.contextPillMuted}
              title="Querying entire codebase context"
            >
              <Layers size={12} />
              <span>Whole repository scope</span>
            </div>
          )}
        </div>
      </div>

      {/* Contextual Prompt Suggestions */}
      <div
        className={styles.quickPrompts}
        aria-label="Contextual prompt suggestions"
      >
        {suggestionChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={styles.chipBtn}
            onClick={() => handleSendMessage(chip.prompt)}
            title={chip.prompt}
          >
            <Sparkles size={11} className={styles.chipIcon} />
            <span>{chip.label}</span>
            <CornerDownLeft size={10} className={styles.chipSubmitIcon} />
          </button>
        ))}
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
            <div className={styles.messageBubbleHeader}>
              <div className={styles.messageAuthor}>
                {msg.role === "model" ? (
                  <>
                    <Bot size={14} className={styles.botIcon} />
                    <span className={styles.authorLabel}>Assistant</span>
                    {msg.model &&
                    (msg.model.includes("offline") ||
                      msg.model.includes("fallback")) ? (
                      <span
                        className={styles.offlineModelBadge}
                        title="Deterministic AST fallback (Gemini unconfigured or offline)"
                      >
                        <AlertCircle size={10} />
                        <span>Offline Fallback</span>
                      </span>
                    ) : (
                      <span
                        className={styles.geminiModelBadge}
                        title="Generated using Gemini AI"
                      >
                        <Sparkles size={10} />
                        <span>{msg.model || "Gemini 2.5 Flash"}</span>
                      </span>
                    )}
                  </>
                ) : (
                  <span className={styles.authorLabelUser}>You</span>
                )}
              </div>
            </div>

            <div>{renderFormattedContent(msg.content)}</div>

            {msg.citations && msg.citations.length > 0 && (
              <div className={styles.citationsBlock}>
                <span className={styles.citationsLabel}>
                  Verified Citations:
                </span>
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
          <div
            className={`${styles.messageBubble} ${styles.modelMessage} ${styles.skeletonCard}`}
          >
            <div className={styles.skeletonHeader}>
              <div className={styles.skeletonAvatarPulse}>
                <Bot size={14} className={styles.pulseIcon} />
              </div>
              <div className={styles.skeletonHeaderMeta}>
                <span className={styles.skeletonTitle}>Gemini 2.5 Flash</span>
                <span className={styles.skeletonSubtitle}>
                  Analyzing grounded AST & citations...
                </span>
              </div>
            </div>
            <div className={styles.skeletonBody}>
              <div className={styles.skeletonLine} style={{ width: "90%" }} />
              <div className={styles.skeletonLine} style={{ width: "70%" }} />
              <div className={styles.skeletonLine} style={{ width: "85%" }} />
              <div className={styles.skeletonLine} style={{ width: "45%" }} />
              <div className={styles.skeletonCodeBlock}>
                <div
                  className={styles.skeletonCodeLine}
                  style={{ width: "35%" }}
                />
                <div
                  className={styles.skeletonCodeLine}
                  style={{ width: "75%" }}
                />
                <div
                  className={styles.skeletonCodeLine}
                  style={{ width: "60%" }}
                />
              </div>
              <div className={styles.skeletonCitationPill} />
            </div>
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
