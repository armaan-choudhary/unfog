import React, { useState, useEffect } from 'react';
import { ExecutionStepData } from '../types';
import { api, MicroChallenge, BreakPrediction } from '../api/client';
import { 
  X, 
  Sparkles, 
  HelpCircle, 
  AlertCircle, 
  Check, 
  ArrowRight, 
  Loader2 
} from 'lucide-react';

interface SandboxChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  step: ExecutionStepData;
  onDefogSuccess: (nodeId: string) => void;
}

export const SandboxChallengeModal: React.FC<SandboxChallengeModalProps> = ({
  isOpen,
  onClose,
  step,
  onDefogSuccess,
}) => {
  const [tab, setTab] = useState<'challenge' | 'break'>('challenge');

  const [challenge, setChallenge] = useState<MicroChallenge | null>(null);
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const [breakSandbox, setBreakSandbox] = useState<BreakPrediction | null>(null);
  const [loadingBreak, setLoadingBreak] = useState(false);
  const [revealedBreak, setRevealedBreak] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSelectedOption(null);
      setShowExplanation(false);
      setRevealedBreak(false);
      return;
    }

    setLoadingChallenge(true);
    api
      .getChallenge(step.id, step.file)
      .then((data) => {
        setChallenge(data);
      })
      .catch(() => {
        setChallenge({
          question: `In ${step.label} (${step.file}), what happens if the upstream promise throws an unhandled rejection?`,
          options: [
            'The error propagates to the global error boundary or toast notification.',
            'The component silently re-renders with empty payload.',
            'The browser tab hangs with memory saturation.',
            'The database transaction automatically commits partial data.'
          ],
          correct_index: 0,
          explanation: `In ${step.label}, asynchronous exceptions are intercepted by try/catch or the nearest Next.js error boundary to prevent state poisoning.`
        });
      })
      .finally(() => {
        setLoadingChallenge(false);
      });

    setLoadingBreak(true);
    api
      .getBreakSandbox(step.id, step.file)
      .then((data) => {
        setBreakSandbox(data);
      })
      .catch(() => {
        setBreakSandbox({
          mutated_code: step.activeFunctionCode.replace(/if\s*\(!file\)\s*return;/g, '// [MUTATED: Check removed]\n  // if (!file) return;'),
          failure_prediction_question: 'What runtime bug occurs if this null/guard check is removed?',
          expected_breakage: 'TypeError: Cannot read properties of undefined (reading size) in the downstream upload handler.'
        });
      })
      .finally(() => {
        setLoadingBreak(false);
      });
  }, [isOpen, step]);

  if (!isOpen) return null;

  const handleSelectAnswer = (idx: number) => {
    if (selectedOption !== null) return;
    setSelectedOption(idx);
    setShowExplanation(true);
    if (challenge && idx === challenge.correct_index) {
      onDefogSuccess(step.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#07080b]/85 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-[#0c0e15] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[#090b10]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-white/[0.04] border border-white/10 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-100 flex items-center gap-2">
                <span>Comprehension Sandbox</span>
                <span className="text-cyan-400">({step.label})</span>
              </h2>
              <p className="text-xs text-zinc-500 font-sans">
                10-second comprehension checks and first-principles debugging intuition.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-6 py-2.5 bg-[#090b10] border-b border-white/[0.08] flex items-center gap-2 font-mono text-xs">
          <button
            onClick={() => setTab('challenge')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
              tab === 'challenge'
                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-400/40 font-medium'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>10s Micro-Challenge</span>
          </button>
          <button
            onClick={() => setTab('break')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
              tab === 'break'
                ? 'bg-white/10 text-white border border-white/30 font-medium'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Break-It Sandbox</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {tab === 'challenge' && (
            <div className="space-y-4">
              {loadingChallenge ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                  <span className="text-xs font-mono">Analyzing AST for comprehension check...</span>
                </div>
              ) : challenge ? (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-lg bg-[#090b10] border border-white/[0.08]">
                    <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block mb-1">
                      Comprehension Prompt:
                    </span>
                    <p className="text-xs font-medium text-zinc-100 leading-relaxed font-sans">
                      {challenge.question}
                    </p>
                  </div>

                  {/* Options */}
                  <div className="space-y-2">
                    {challenge.options.map((opt, idx) => {
                      const isChosen = selectedOption === idx;
                      const isCorrect = idx === challenge.correct_index;
                      let btnStyle = 'border-white/[0.08] bg-[#090b10] hover:border-white/20 text-zinc-300';

                      if (selectedOption !== null) {
                        if (isCorrect) {
                          btnStyle = 'border-cyan-400 bg-cyan-950/30 text-cyan-300 font-medium shadow-[0_0_12px_rgba(6,182,212,0.15)]';
                        } else if (isChosen) {
                          btnStyle = 'border-white/40 bg-white/[0.06] text-zinc-400 line-through';
                        } else {
                          btnStyle = 'border-white/[0.04] bg-white/[0.02] text-zinc-600 opacity-50';
                        }
                      }

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectAnswer(idx)}
                          disabled={selectedOption !== null}
                          className={`w-full p-3 rounded-lg border text-left text-xs transition-all flex items-start gap-2.5 font-sans ${btnStyle}`}
                        >
                          <span className="w-4 h-4 rounded border border-white/20 flex items-center justify-center text-[10px] font-mono text-zinc-400 shrink-0 mt-0.5">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="flex-1 leading-relaxed">{opt}</span>
                          {selectedOption !== null && isCorrect && (
                            <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Explanation card */}
                  {showExplanation && (
                    <div className="p-3.5 rounded-lg bg-[#090b10] border border-white/[0.08] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-wider font-semibold flex items-center gap-1.5 text-cyan-400">
                          <Check className="w-3 h-3" />
                          Mental Model Insight
                        </span>
                        {selectedOption === challenge.correct_index && (
                          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-400/30">
                            Node Defogged
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                        {challenge.explanation}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {tab === 'break' && (
            <div className="space-y-4">
              {loadingBreak ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                  <span className="text-xs font-mono">Synthesizing intentional failure mutation...</span>
                </div>
              ) : breakSandbox ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-[#090b10] border border-white/[0.08]">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-1">
                      Sandbox Mutation (Altered Line):
                    </span>
                    <pre className="p-3 rounded bg-[#07080b] border border-white/[0.06] text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre leading-relaxed">
                      {breakSandbox.mutated_code}
                    </pre>
                  </div>

                  <div className="p-3.5 rounded-lg bg-[#090b10] border border-white/[0.08] space-y-2">
                    <span className="text-xs font-medium text-zinc-200 block font-sans">
                      {breakSandbox.failure_prediction_question}
                    </span>

                    {!revealedBreak ? (
                      <button
                        onClick={() => setRevealedBreak(true)}
                        className="px-3.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-zinc-950 rounded text-xs font-mono uppercase tracking-wider font-semibold transition-colors flex items-center gap-1.5"
                      >
                        <span>Reveal Prediction</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <div className="p-3 rounded bg-white/[0.03] border border-white/10 space-y-1">
                        <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block">
                          Expected Production Breakage:
                        </span>
                        <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                          {breakSandbox.expected_breakage}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/[0.08] bg-[#090b10] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 rounded text-xs font-mono uppercase tracking-wider border border-white/10 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
