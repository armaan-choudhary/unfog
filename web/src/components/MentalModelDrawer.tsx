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
  CheckCircle2, 
  HelpCircle, 
  Cloud, 
  Flame, 
  Sparkles, 
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  PlayCircle
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

  // Dynamic mental model generation via /api/mental-model with skeleton loader
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

  // Merge dynamic model if available, fallback to base AST model
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
    <div className="w-96 h-full flex flex-col bg-slate-900/95 border-l border-slate-800 text-slate-100 backdrop-blur-md overflow-hidden">
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/90">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center text-xs font-mono font-bold">
              {step.stepIndex}
            </span>
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Mental Model
            </span>
          </div>

          {/* Level Switcher (L1 / L2 / L3) */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
            {(['L1', 'L2', 'L3'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => onChangeTechnicalLevel(lvl)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-all ${
                  technicalLevel === lvl
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={
                  lvl === 'L1'
                    ? 'L1 Vibe: High-level purpose'
                    : lvl === 'L2'
                    ? 'L2 Builder: Data flow & state'
                    : 'L3 Deep: Full syntax & mechanics'
                }
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-1.5 truncate">
            <span>{step.label}</span>
            <span className="text-xs font-mono text-cyan-400">.{step.symbol}()</span>
          </h2>

          {/* Prove-It / Challenge Quick Action */}
          <button
            onClick={onOpenSandboxChallenge}
            className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-mono font-medium transition-colors shrink-0"
            title="Open 10s Comprehension Challenge & Break Sandbox"
          >
            <PlayCircle className="w-3 h-3 text-amber-400" />
            <span>Challenge</span>
          </button>
        </div>

        <p className="text-xs text-slate-400 mt-1 line-clamp-2">
          {step.shortSummary}
        </p>

        {/* Quick Tabs: Mental Model | Blast Radius | AI Debt */}
        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-800/80 text-xs">
          <button
            onClick={() => setActiveTab('model')}
            className={`flex-1 py-1 rounded text-center font-medium transition-colors ${
              activeTab === 'model'
                ? 'bg-slate-800 text-cyan-300 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3-Part Model
          </button>
          <button
            onClick={() => setActiveTab('blast')}
            className={`flex-1 py-1 rounded text-center font-medium transition-colors flex items-center justify-center gap-1 ${
              activeTab === 'blast'
                ? 'bg-slate-800 text-rose-300 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame className="w-3 h-3 text-rose-400" />
            <span>Blast</span>
          </button>
          <button
            onClick={() => setActiveTab('slop')}
            className={`flex-1 py-1 rounded text-center font-medium transition-colors flex items-center justify-center gap-1 ${
              activeTab === 'slop'
                ? 'bg-slate-800 text-purple-300 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>Debt {step.debtRadar?.hasSlop && '(!)'}</span>
          </button>
        </div>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'model' && (
          <div className="space-y-3.5">
            {/* Skeleton / Loading indicator */}
            {loadingModel ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-14 bg-cyan-950/20 rounded-xl border border-cyan-800/20" />
                <div className="h-20 bg-slate-950/60 rounded-xl border border-slate-800" />
                <div className="h-20 bg-slate-950/60 rounded-xl border border-slate-800" />
                <div className="h-20 bg-slate-950/60 rounded-xl border border-slate-800" />
              </div>
            ) : (
              <>
                {/* High-level Summary Pill */}
                <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-xs text-cyan-200 leading-relaxed">
                  <span className="font-semibold text-cyan-400 block mb-0.5 font-mono text-[11px] uppercase tracking-wider">
                    {technicalLevel === 'L1'
                      ? 'L1 Vibe Summary'
                      : technicalLevel === 'L2'
                      ? 'L2 Builder Summary'
                      : 'L3 Syntax & Runtime Summary'}
                  </span>
                  {summaryText}
                </div>

                {/* PART 1: TRIGGER */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5 hover:border-slate-700 transition-colors">
                  <div className="flex items-center gap-2 text-cyan-400">
                    <div className="p-1 rounded bg-cyan-500/10 border border-cyan-500/20">
                      <Zap className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider">
                      1. Trigger (Why It Runs)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed pl-6">
                    {triggerText}
                  </p>
                </div>

                {/* PART 2: MUTATION */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5 hover:border-slate-700 transition-colors">
                  <div className="flex items-center gap-2 text-purple-400">
                    <div className="p-1 rounded bg-purple-500/10 border border-purple-500/20">
                      <Activity className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider">
                      2. Mutation (What Changes)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed pl-6">
                    {mutationText}
                  </p>
                </div>

                {/* PART 3: SIDE EFFECTS */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5 hover:border-slate-700 transition-colors">
                  <div className="flex items-center gap-2 text-amber-400">
                    <div className="p-1 rounded bg-amber-500/10 border border-amber-500/20">
                      <Workflow className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider">
                      3. Side Effects (What Spawns)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed pl-6">
                    {sideEffectsText}
                  </p>
                </div>

                {/* Technical Details in L2/L3 */}
                {technicalDetails && technicalDetails.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80">
                    <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-2">
                      Technical Mechanics:
                    </span>
                    <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
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
          </div>
        )}

        {/* Tab 2: Blast Radius */}
        {activeTab === 'blast' && (
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-rose-300 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-rose-400" />
                  Blast Radius Impact
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    step.blastRadius.riskScore === 'high'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : step.blastRadius.riskScore === 'medium'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {step.blastRadius.riskScore} Risk
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {step.blastRadius.description}
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                Directly Affected Nodes ({step.blastRadius.affectedIds.length}):
              </span>
              {step.blastRadius.affectedIds.map((affectedId) => (
                <div
                  key={affectedId}
                  onClick={() => onShowBlastRadius(affectedId)}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer text-xs transition-colors"
                >
                  <span className="font-mono text-cyan-300">{affectedId}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: AI Slop & Debt Radar */}
        {activeTab === 'slop' && (
          <div className="space-y-3">
            {step.debtRadar?.hasSlop ? (
              <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-800/40 space-y-2">
                <div className="flex items-center gap-1.5 text-purple-300 text-xs font-semibold">
                  <AlertTriangle className="w-4 h-4 text-purple-400" />
                  <span>AI Anti-Patterns Detected</span>
                </div>
                <p className="text-xs text-slate-300">
                  Freshly generated AI code often leaves subtle edge cases, unhandled state transitions, or dead props.
                </p>
                <ul className="space-y-1.5 pt-2 border-t border-purple-800/30">
                  {step.debtRadar.issues.map((issue, idx) => (
                    <li key={idx} className="text-xs text-slate-200 flex items-start gap-1.5">
                      <span className="text-purple-400 font-bold">•</span>
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/30 text-center space-y-1">
                <ShieldCheck className="w-6 h-6 text-emerald-400 mx-auto" />
                <h4 className="text-xs font-semibold text-emerald-300">Clean Architecture</h4>
                <p className="text-xs text-slate-400">
                  No dead props, unused exports, or hardcoded secrets detected in this block.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drawer Footer: Claim Ownership Actions */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/90 space-y-2">
        <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
          Claim Code Ownership:
        </span>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => onSetFogState(step.id, 'clear')}
            className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-lg text-xs font-medium border transition-all ${
              step.fogState === 'clear'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 ring-1 ring-emerald-500/40'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-slate-700'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="truncate">Understood</span>
          </button>

          <button
            onClick={() => onSetFogState(step.id, 'fuzzy')}
            className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-lg text-xs font-medium border transition-all ${
              step.fogState === 'fuzzy'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 ring-1 ring-amber-500/40'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-amber-400 hover:border-slate-700'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span className="truncate">Fuzzy</span>
          </button>

          <button
            onClick={() => onSetFogState(step.id, 'foggy')}
            className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-lg text-xs font-medium border transition-all ${
              step.fogState === 'foggy'
                ? 'bg-slate-800 text-slate-200 border-slate-600'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300 hover:border-slate-700'
            }`}
          >
            <Cloud className="w-3.5 h-3.5 text-slate-400" />
            <span className="truncate">Unfog</span>
          </button>
        </div>
      </div>
    </div>
  );
};
