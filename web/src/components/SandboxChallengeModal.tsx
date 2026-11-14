import React, { useState, useEffect } from 'react';
import { ExecutionStepData } from '../types';
import { api, MicroChallenge, BreakPrediction } from '../api/client';
import { 
  X, 
  Sparkles, 
  HelpCircle, 
  AlertOctagon, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  Loader2,
  Check
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

  // Challenge state
  const [challenge, setChallenge] = useState<MicroChallenge | null>(null);
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  // Break-It Sandbox state
  const [breakSandbox, setBreakSandbox] = useState<BreakPrediction | null>(null);
  const [loadingBreak, setLoadingBreak] = useState(false);
  const [revealedBreak, setRevealedBreak] = useState(false);

  // Load challenge on open or step change
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
        // Fallback dynamic challenge generated from code
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
        // Fallback dynamic mutated code
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <span>Prove-It Comprehension Sandbox</span>
                <span className="text-xs font-mono text-cyan-400">({step.label})</span>
              </h2>
              <p className="text-xs text-slate-400">
                10-second comprehension checks and first-principles debugging intuition.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-6 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center gap-2">
          <button
            onClick={() => setTab('challenge')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'challenge'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>10-Second Micro-Challenge</span>
          </button>
          <button
            onClick={() => setTab('break')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'break'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>"Break It on Purpose" Sandbox</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {tab === 'challenge' && (
            <div className="space-y-4">
              {loadingChallenge ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                  <span className="text-xs font-mono">Generating dynamic comprehension challenge from AST...</span>
                </div>
              ) : challenge ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider block mb-1 font-semibold">
                      Comprehension Question:
                    </span>
                    <p className="text-sm font-medium text-slate-100 leading-relaxed">
                      {challenge.question}
                    </p>
                  </div>

                  {/* Options */}
                  <div className="space-y-2">
                    {challenge.options.map((opt, idx) => {
                      const isChosen = selectedOption === idx;
                      const isCorrect = idx === challenge.correct_index;
                      let btnStyle = 'border-slate-800 bg-slate-950/50 hover:border-slate-700 text-slate-300';

                      if (selectedOption !== null) {
                        if (isCorrect) {
                          btnStyle = 'border-emerald-500 bg-emerald-950/30 text-emerald-300 ring-1 ring-emerald-500/50';
                        } else if (isChosen) {
                          btnStyle = 'border-rose-500 bg-rose-950/30 text-rose-300 ring-1 ring-rose-500/50';
                        } else {
                          btnStyle = 'border-slate-800/50 bg-slate-950/20 text-slate-500 opacity-60';
                        }
                      }

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectAnswer(idx)}
                          disabled={selectedOption !== null}
                          className={`w-full p-3 rounded-xl border text-left text-xs transition-all flex items-start gap-3 ${btnStyle}`}
                        >
                          <span className="w-5 h-5 rounded-full border border-slate-700 flex items-center justify-center text-[10px] font-mono font-bold shrink-0 mt-0.5">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="flex-1 leading-relaxed">{opt}</span>
                          {selectedOption !== null && isCorrect && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          )}
                          {selectedOption !== null && isChosen && !isCorrect && (
                            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Explanation card */}
                  {showExplanation && (
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono uppercase tracking-wider font-semibold flex items-center gap-1.5 text-cyan-400">
                          <Check className="w-3.5 h-3.5" />
                          Explanation & Mental Model
                        </span>
                        {selectedOption === challenge.correct_index && (
                          <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                            + Node Defogged!
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
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
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-rose-400" />
                  <span className="text-xs font-mono">Synthesizing intentional failure mutation...</span>
                </div>
              ) : breakSandbox ? (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-800/40">
                    <span className="text-[11px] font-mono text-rose-400 uppercase tracking-wider block mb-1 font-semibold">
                      Sandbox Mutation (Altered Line):
                    </span>
                    <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre leading-relaxed">
                      {breakSandbox.mutated_code}
                    </pre>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <span className="text-xs font-semibold text-slate-200 block">
                      {breakSandbox.failure_prediction_question}
                    </span>

                    {!revealedBreak ? (
                      <button
                        onClick={() => setRevealedBreak(true)}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow"
                      >
                        <span>Reveal Predicted Failure</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/50 space-y-1 animate-in fade-in">
                        <span className="text-[11px] font-mono text-rose-300 uppercase tracking-wider font-bold block">
                          Expected Production Breakage:
                        </span>
                        <p className="text-xs text-slate-200 leading-relaxed">
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
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition-colors"
          >
            Close Sandbox
          </button>
        </div>
      </div>
    </div>
  );
};
