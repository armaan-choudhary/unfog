import React, { useState, useEffect } from 'react';
import { ExecutionStepData, GoalSetupConfig } from '../types';
import { api } from '../api/client';
import { X, Copy, Check, FileCode, Download, Loader2 } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: GoalSetupConfig;
  steps: ExecutionStepData[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  config,
  steps,
}) => {
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [mode, setMode] = useState<'architecture' | 'cursorrules'>('architecture');
  const [serverExport, setServerExport] = useState<{ architecture_md?: string; cursorrules?: string } | null>(null);
  const [loadingExport, setLoadingExport] = useState(false);

  const understoodNodeIds = steps
    .filter((s) => s.fogState === 'clear')
    .map((s) => s.id);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingExport(true);
    api
      .exportModel(understoodNodeIds)
      .then((res) => {
        setServerExport(res);
      })
      .catch(() => {
        setServerExport(null);
      })
      .finally(() => {
        setLoadingExport(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const generateLocalArchitectureMarkdown = () => {
    return `# Architecture Mental Model: ${config.target}

> Scoped Execution Flow generated via Unfog.
> Goal: ${config.goal.toUpperCase()} | Technical Comfort: ${config.technicalLevel}

## Chronological Flow Breakdown

${steps
  .map(
    (s) => `### ${s.stepIndex}. ${s.label} (\`${s.file}\`)
- **Symbol:** \`${s.symbol}()\`
- **Type:** ${s.nodeType}
- **Status:** ${s.fogState.toUpperCase()}
- **Trigger:** ${s.mentalModel[config.technicalLevel].trigger}
- **Mutation:** ${s.mentalModel[config.technicalLevel].mutation}
- **Side Effects:** ${s.mentalModel[config.technicalLevel].sideEffects}
`
  )
  .join('\n')}

---
*Created with Unfog — Defogging AI codebases.*
`;
  };

  const generateLocalCursorRules = () => {
    return `# .cursorrules / AI Context Snippet
# Execution Flow Contract: ${config.target}

CRITICAL EXECUTION DEPENDENCY PIPELINE:
${steps.map((s) => `${s.stepIndex}. [${s.file}] ${s.symbol}() -> ${s.mentalModel.L1.summary}`).join('\n')}

RULES FOR AI GENERATION:
1. Do not alter the function signature of ${steps.map((s) => s.symbol).join(', ')} without updating dependent callers.
2. Maintain the validation boundaries enforced in ${steps[0]?.file || 'entrypoint'}.
3. Respect asynchronous side effects and database transactions in downstream adapters.
`;
  };

  const content =
    mode === 'architecture'
      ? serverExport?.architecture_md || generateLocalArchitectureMarkdown()
      : serverExport?.cursorrules || generateLocalCursorRules();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedType(mode);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownload = () => {
    const filename = mode === 'architecture' ? 'ARCHITECTURE.md' : '.cursorrules';
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-semibold text-slate-100">
              Export Scoped Mental Model
            </h2>
            {loadingExport && <Loader2 className="w-4 h-4 animate-spin text-cyan-400 ml-2" />}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('architecture')}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-colors ${
                mode === 'architecture'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ARCHITECTURE.md
            </button>
            <button
              onClick={() => setMode('cursorrules')}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-colors ${
                mode === 'cursorrules'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              .cursorrules
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
              title="Download file directly"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-semibold shadow transition-colors"
            >
              {copiedType === mode ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy to Clipboard</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto bg-slate-950/60 font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap selection:bg-cyan-500/30">
          {content}
        </div>
      </div>
    </div>
  );
};
