import React, { useState } from 'react';
import { ExecutionStepData } from '../types';
import { CodeViewer } from './CodeViewer';
import { 
  ArrowRight, 
  Zap, 
  Activity, 
  Workflow, 
  Layers, 
  FileCode, 
  Radio, 
  Cloud, 
  Database,
  Eye,
  Code
} from 'lucide-react';

interface VisualDataFlowInspectorProps {
  step: ExecutionStepData;
}

const roleIcons: Record<string, React.ReactNode> = {
  component: <Layers className="w-4 h-4 text-cyan-400" />,
  hook: <Radio className="w-4 h-4 text-cyan-400" />,
  route: <ArrowRight className="w-4 h-4 text-cyan-400" />,
  service: <Cloud className="w-4 h-4 text-cyan-400" />,
  db: <Database className="w-4 h-4 text-cyan-400" />,
};

export const VisualDataFlowInspector: React.FC<VisualDataFlowInspectorProps> = ({ step }) => {
  const [viewMode, setViewMode] = useState<'visual' | 'code'>('visual');

  const flow = step.visualFlow || {
    inputBadge: step.nodeType === 'component' ? 'User Event' : step.nodeType === 'route' ? 'HTTP Request' : 'Input Arguments',
    inputDetails: `${step.symbol}() parameters`,
    processSteps: [
      `Triggered via ${step.label}`,
      `Executes internal logic`,
      `Emits outputs & triggers side-effects`
    ],
    outputBadge: step.nodeType === 'route' ? 'HTTP Response' : step.nodeType === 'db' ? 'SQL Record' : 'State / Dispatched Action',
    outputDetails: step.mentalModel.L1.sideEffects,
    stateDiff: {
      variable: 'status',
      before: 'idle',
      after: 'executed',
    },
  };

  return (
    <div className="flex flex-col h-full bg-[#07090e] border-t border-white/[0.08] select-none">
      {/* Top Bar with Mode Switcher */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#090b10] border-b border-white/[0.08] text-xs font-mono">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.04] border border-white/10 text-zinc-300">
            {roleIcons[step.nodeType] || <FileCode className="w-3.5 h-3.5 text-cyan-400" />}
            <span className="font-semibold">{step.label}</span>
            <span className="text-cyan-400">.{step.symbol}()</span>
          </div>
          <span className="text-[11px] text-zinc-500 font-sans hidden md:inline truncate max-w-sm">
            {step.shortSummary}
          </span>
        </div>

        {/* View Switcher: Visual Flow vs Code Peek */}
        <div className="flex items-center bg-[#07080b] p-0.5 rounded border border-white/10 text-[11px] font-mono">
          <button
            onClick={() => setViewMode('visual')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
              viewMode === 'visual'
                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-400/40 font-semibold'
                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
            }`}
          >
            <Eye className="w-3 h-3 text-cyan-400" />
            <span>Visual Data Flow</span>
          </button>
          <button
            onClick={() => setViewMode('code')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
              viewMode === 'code'
                ? 'bg-white/[0.12] text-zinc-100 font-semibold border border-white/20'
                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
            }`}
          >
            <Code className="w-3 h-3" />
            <span>Code Peek</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'visual' ? (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-center">
          <div className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
            {/* 1. INPUT PAYLOAD CARD */}
            <div className="p-3.5 rounded-xl bg-[#0b0d14] border border-white/[0.08] flex flex-col justify-between space-y-3 relative group hover:border-white/20 transition-all">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 font-bold">
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    Incoming Payload
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                    IN
                  </span>
                </div>
                
                <div className="p-2.5 rounded-lg bg-[#07090e] border border-white/[0.06] font-mono text-xs text-zinc-200">
                  <div className="text-cyan-400 font-semibold truncate mb-0.5">
                    {flow.inputBadge}
                  </div>
                  <div className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                    {flow.inputDetails}
                  </div>
                </div>
              </div>

              <div className="text-[10px] font-mono text-zinc-500">
                Trigger: <span className="text-zinc-300 font-sans">{step.mentalModel.L1.trigger}</span>
              </div>
            </div>

            {/* 2. TRANSFORMATION & MUTATION CARD (CENTER) */}
            <div className="p-3.5 rounded-xl bg-[#0d1018] border border-cyan-400/30 flex flex-col justify-between space-y-3 relative shadow-[0_0_20px_rgba(6,182,212,0.06)]">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 flex items-center gap-1.5 font-bold">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    Internal Transformation
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-400/30">
                    STEP {step.stepIndex}
                  </span>
                </div>

                <div className="space-y-1.5 font-mono text-xs">
                  {flow.processSteps.map((s, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-1.5 rounded bg-[#080a10] border border-white/[0.06] text-zinc-300 text-[11px] font-sans">
                      <span className="w-4 h-4 rounded-full bg-white/[0.06] text-zinc-400 flex items-center justify-center text-[10px] font-mono shrink-0 font-bold">
                        {idx + 1}
                      </span>
                      <span className="leading-tight">{s}</span>
                    </div>
                  ))}
                </div>

                {/* State Transformation Pill */}
                {flow.stateDiff && (
                  <div className="p-2 rounded-lg bg-cyan-950/20 border border-cyan-400/20 font-mono text-[11px] flex items-center justify-between">
                    <span className="text-zinc-400 font-medium">State Mutation:</span>
                    <div className="flex items-center gap-1.5 font-semibold">
                      <span className="text-zinc-500 line-through">{flow.stateDiff.before}</span>
                      <ArrowRight className="w-3 h-3 text-cyan-400" />
                      <span className="text-cyan-300">{flow.stateDiff.after}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-[10px] font-mono text-zinc-500 truncate">
                File: <span className="text-zinc-300">{step.file}</span>
              </div>
            </div>

            {/* 3. OUTPUT & SIDE EFFECT CARD */}
            <div className="p-3.5 rounded-xl bg-[#0b0d14] border border-white/[0.08] flex flex-col justify-between space-y-3 relative group hover:border-white/20 transition-all">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 font-bold">
                    <Workflow className="w-3.5 h-3.5 text-cyan-400" />
                    Emitted Side Effect
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                    OUT
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-[#07090e] border border-white/[0.06] font-mono text-xs text-zinc-200">
                  <div className="text-cyan-400 font-semibold truncate mb-0.5">
                    {flow.outputBadge}
                  </div>
                  <div className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                    {flow.outputDetails}
                  </div>
                </div>
              </div>

              <div className="text-[10px] font-mono text-zinc-500">
                Next Hop: <span className="text-zinc-300 font-sans">{step.mentalModel.L1.sideEffects}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 w-full overflow-hidden">
          <CodeViewer step={step} />
        </div>
      )}
    </div>
  );
};
