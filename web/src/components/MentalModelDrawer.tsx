import React, { useState, useEffect } from 'react';
import { 
  ExecutionStepData, 
  FogState 
} from '../types';
import { api, MentalModelResponse } from '../api/client';
import { 
  Zap, 
  Activity, 
  Workflow, 
  Check, 
  HelpCircle, 
  Cloud, 
  ChevronRight,
  Flame,
  Sparkles,
  Play
} from 'lucide-react';

interface MentalModelDrawerProps {
  step: ExecutionStepData;
  technicalLevel: 'L1' | 'L2' | 'L3';
  onChangeTechnicalLevel: (level: 'L1' | 'L2' | 'L3') => void;
  onSetFogState: (id: string, state: FogState) => void;
  onShowBlastRadius: (nodeId: string) => void;
  onOpenSandboxChallenge: () => void;
}

export const MentalModelDrawer: React.FC<MentalModelDrawerProps> = ({
  step,
  technicalLevel,
  onChangeTechnicalLevel,
  onSetFogState,
  onShowBlastRadius,
  onOpenSandboxChallenge,
}) => {
  const [activeTab, setActiveTab] = useState<'model' | 'blast' | 'slop'>('model');
  const [dynamicModel, setDynamicModel] = useState<MentalModelResponse | null>(null);
  const [loadingModel, setLoadingModel] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    setLoadingModel(true);

    api
      .getMentalModel(step.id, technicalLevel, step.file, step.symbol)
      .then((res) => {
        if (!active) return;
        setDynamicModel(res);
      })
      .catch(() => {
        if (!active) return;
        setDynamicModel(null);
      })
      .finally(() => {
        if (active) setLoadingModel(false);
      });

    return () => {
      active = false;
    };
  }, [step.id, step.file, step.symbol, technicalLevel]);

  const baseModel = step.mentalModel[technicalLevel];

  const triggerText = dynamicModel?.trigger || baseModel.trigger;
  const mutationText = dynamicModel?.mutation || baseModel.mutation;
  const sideEffectsText = dynamicModel?.side_effects || baseModel.sideEffects;
  const summaryText =
    technicalLevel === 'L1'
      ? dynamicModel?.l1_vibe || dynamicModel?.summary || baseModel.summary
      : technicalLevel === 'L2'
      ? dynamicModel?.l2_builder || dynamicModel?.summary || baseModel.summary
      : dynamicModel?.l3_deep_dive || dynamicModel?.summary || baseModel.summary;

  const technicalDetails = dynamicModel?.technical_details || baseModel.technicalDetails;

  return (
    <div className="w-96 h-full flex flex-col bg-[#0a0c12] border-l border-white/[0.08] text-zinc-100 select-none overflow-hidden">
      {/* Drawer Header */}
      <div className="p-4 border-b border-white/[0.08] bg-[#0c0e15]">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-white/[0.06] text-zinc-300 border border-white/10 flex items-center justify-center text-xs font-mono font-semibold">
              {step.stepIndex}
            </span>
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Mental Model
            </span>
          </div>

          {/* Level Switcher (L1 / L2 / L3) */}
          <div className="flex items-center bg-[#07080b] p-0.5 rounded border border-white/10 text-xs font-mono">
            {(['L1', 'L2', 'L3'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => onChangeTechnicalLevel(lvl)}
                className={`px-2 py-0.5 rounded transition-all ${
                  technicalLevel === lvl
                    ? 'bg-white/[0.12] text-cyan-400 font-semibold'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-zinc-100 truncate">
            {step.label}
          </h2>
          <span className="text-xs font-mono text-cyan-400/90 truncate max-w-[140px]">
            .{step.symbol}()
          </span>
        </div>

        <p className="text-xs text-zinc-400 mt-1 font-sans leading-relaxed">
          {step.shortSummary}
        </p>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 mt-3.5 pt-2.5 border-t border-white/[0.06] text-xs font-mono">
          <button
            onClick={() => setActiveTab('model')}
            className={`flex-1 py-1 rounded transition-colors text-center ${
              activeTab === 'model'
                ? 'bg-white/[0.08] text-zinc-100 font-medium'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            3-Part Model
          </button>
          <button
            onClick={() => setActiveTab('blast')}
            className={`flex-1 py-1 rounded transition-colors text-center flex items-center justify-center gap-1 ${
              activeTab === 'blast'
                ? 'bg-white/[0.08] text-zinc-100 font-medium'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Flame className="w-3 h-3" />
            <span>Blast</span>
          </button>
          <button
            onClick={() => setActiveTab('slop')}
            className={`flex-1 py-1 rounded transition-colors text-center flex items-center justify-center gap-1 ${
              activeTab === 'slop'
                ? 'bg-white/[0.08] text-zinc-100 font-medium'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>Debt</span>
          </button>
        </div>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {activeTab === 'model' && (
          <div className="space-y-3">
            {loadingModel ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-14 bg-white/[0.03] rounded-lg border border-white/[0.06]" />
                <div className="h-20 bg-white/[0.03] rounded-lg border border-white/[0.06]" />
                <div className="h-20 bg-white/[0.03] rounded-lg border border-white/[0.06]" />
              </div>
            ) : (
              <>
                {/* Horizontal Visual Pipeline Indicator */}
                <div className="p-2.5 rounded-lg bg-[#07090e] border border-white/[0.08] flex items-center justify-between text-[11px] font-mono shadow-sm">
                  <div className="flex items-center gap-1 text-zinc-300">
                    <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Trigger</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-400/50" />
                  <div className="flex items-center gap-1 text-zinc-300">
                    <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Mutation</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-400/50" />
                  <div className="flex items-center gap-1 text-zinc-300">
                    <Workflow className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Side Effect</span>
                  </div>
                </div>

                {/* High-level Summary Pill */}
                <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-zinc-300 leading-relaxed font-sans">
                  <span className="font-mono text-[10px] text-cyan-400 uppercase tracking-wider block mb-1">
                    {technicalLevel === 'L1'
                      ? 'L1 Vibe Summary'
                      : technicalLevel === 'L2'
                      ? 'L2 Data Flow Summary'
                      : 'L3 Runtime & Closures'}
                  </span>
                  {summaryText}
                </div>

                {/* PART 1: TRIGGER */}
                <div className="p-3 rounded-lg bg-[#0d0f16] border border-white/[0.08] space-y-1 hover:border-white/20 transition-colors">
                  <div className="flex items-center gap-1.5 text-zinc-200">
                    <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider">
                      1. Trigger
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed pl-5 font-sans">
                    {triggerText}
                  </p>
                </div>

                {/* PART 2: MUTATION */}
                <div className="p-3 rounded-lg bg-[#0d0f16] border border-white/[0.08] space-y-2 hover:border-white/20 transition-colors">
                  <div className="flex items-center gap-1.5 text-zinc-200">
                    <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider">
                      2. Mutation
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed pl-5 font-sans">
                    {mutationText}
                  </p>
                  {step.visualFlow?.stateDiff && (
                    <div className="ml-5 p-2 rounded bg-cyan-950/20 border border-cyan-400/20 text-[10px] font-mono flex items-center justify-between text-zinc-400">
                      <span>State:</span>
                      <div className="flex items-center gap-1 font-semibold">
                        <span className="text-zinc-500 line-through">{step.visualFlow.stateDiff.before}</span>
                        <ChevronRight className="w-2.5 h-2.5 text-cyan-400" />
                        <span className="text-cyan-300">{step.visualFlow.stateDiff.after}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* PART 3: SIDE EFFECTS */}
                <div className="p-3 rounded-lg bg-[#0d0f16] border border-white/[0.08] space-y-1 hover:border-white/20 transition-colors">
                  <div className="flex items-center gap-1.5 text-zinc-200">
                    <Workflow className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider">
                      3. Side Effects
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed pl-5 font-sans">
                    {sideEffectsText}
                  </p>
                </div>

                {/* Technical Mechanics */}
                {technicalDetails && technicalDetails.length > 0 && (
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1.5">
                      Technical Mechanics:
                    </span>
                    <ul className="text-xs text-zinc-400 space-y-1 list-disc list-inside">
                      {technicalDetails.map((item, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {/* Prove-It Micro-Challenge Trigger Button */}
            <button
              onClick={onOpenSandboxChallenge}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-cyan-400/30 hover:border-cyan-400/80 hover:bg-cyan-500/[0.05] text-xs transition-all group"
            >
              <div className="flex items-center gap-2">
                <Play className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
                <span className="font-mono text-zinc-200 uppercase tracking-wider text-[11px]">
                  10s Defog Challenge
                </span>
              </div>
              <span className="text-[10px] font-mono text-cyan-400">
                Prove Model →
              </span>
            </button>
          </div>
        )}

        {/* Tab 2: Blast Radius */}
        {activeTab === 'blast' && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-white/[0.04] border border-white/10 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-zinc-200 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-zinc-400" />
                  Blast Radius Impact
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-white/10 text-zinc-200 border border-white/20">
                  {step.blastRadius.riskScore} Risk
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                {step.blastRadius.description}
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">
                Impacted Nodes ({step.blastRadius.affectedIds.length}):
              </span>
              {step.blastRadius.affectedIds.map((affectedId) => (
                <div
                  key={affectedId}
                  onClick={() => onShowBlastRadius(affectedId)}
                  className="flex items-center justify-between p-2 rounded bg-[#0d0f16] border border-white/[0.08] hover:border-white/20 cursor-pointer text-xs font-mono transition-colors"
                >
                  <span className="text-zinc-300 truncate">{affectedId}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: AI Debt */}
        {activeTab === 'slop' && (
          <div className="space-y-3">
            {step.debtRadar?.hasSlop ? (
              <div className="p-3 rounded-lg bg-white/[0.04] border border-white/10 space-y-2">
                <div className="flex items-center gap-1.5 text-zinc-200 text-xs font-mono uppercase tracking-wider font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>AI Anti-Patterns Flagged</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                  Subtle edge cases or unused exports detected in this block.
                </p>
                <ul className="space-y-1 pt-1.5 border-t border-white/[0.08]">
                  {step.debtRadar.issues.map((issue, idx) => (
                    <li key={idx} className="text-xs text-zinc-300 flex items-start gap-1.5 font-mono">
                      <span className="text-cyan-400">•</span>
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.08] text-center space-y-1">
                <Check className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
                <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-300">Clean Architecture</h4>
                <p className="text-xs text-zinc-500 font-sans">
                  No dead props, unused exports, or hardcoded secrets detected.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drawer Footer: Claim Ownership Actions */}
      <div className="p-4 border-t border-white/[0.08] bg-[#0c0e15] space-y-2">
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">
          Claim Code Ownership:
        </span>
        <div className="grid grid-cols-3 gap-2 font-mono">
          <button
            onClick={() => onSetFogState(step.id, 'clear')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded text-xs transition-all ${
              step.fogState === 'clear'
                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-400/40 shadow-[0_0_12px_rgba(6,182,212,0.15)] font-semibold'
                : 'bg-white/[0.03] border border-white/[0.08] text-zinc-500 hover:text-zinc-200 hover:border-white/20'
            }`}
          >
            <Check className="w-3 h-3 text-cyan-400" />
            <span className="truncate">Defogged</span>
          </button>

          <button
            onClick={() => onSetFogState(step.id, 'fuzzy')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded text-xs transition-all ${
              step.fogState === 'fuzzy'
                ? 'bg-white/10 text-white border border-white/30 font-semibold'
                : 'bg-white/[0.03] border border-white/[0.08] text-zinc-500 hover:text-zinc-200 hover:border-white/20'
            }`}
          >
            <HelpCircle className="w-3 h-3 text-zinc-400" />
            <span className="truncate">Fuzzy</span>
          </button>

          <button
            onClick={() => onSetFogState(step.id, 'foggy')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded text-xs transition-all ${
              step.fogState === 'foggy'
                ? 'bg-white/[0.06] text-zinc-400 border border-dashed border-white/20'
                : 'bg-white/[0.03] border border-white/[0.08] text-zinc-500 hover:text-zinc-200 hover:border-white/20'
            }`}
          >
            <Cloud className="w-3 h-3 text-zinc-500" />
            <span className="truncate">Foggy</span>
          </button>
        </div>
      </div>
    </div>
  );
};
