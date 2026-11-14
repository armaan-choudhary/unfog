import React, { useState } from 'react';
import { 
  GoalPreset, 
  GoalSetupConfig 
} from '../types';
import { 
  GitFork, 
  Bug, 
  ShieldAlert, 
  Sparkles, 
  Compass, 
  Terminal, 
  FileCode, 
  GitCommit, 
  X,
  ArrowRight,
  SlidersHorizontal,
  Check
} from 'lucide-react';

interface PreMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyConfig: (config: GoalSetupConfig) => void;
  initialConfig: GoalSetupConfig;
}

export const PreMapModal: React.FC<PreMapModalProps> = ({
  isOpen,
  onClose,
  onApplyConfig,
  initialConfig,
}) => {
  const [config, setConfig] = useState<GoalSetupConfig>(initialConfig);

  if (!isOpen) return null;

  const presets: {
    id: GoalPreset;
    title: string;
    subtitle: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'trace',
      title: 'Trace a Feature',
      subtitle: '"How does [X] work?"',
      description: 'Builds a chronological execution pipeline from entry trigger to database write.',
      icon: <GitFork className="w-4 h-4 text-zinc-400" />,
    },
    {
      id: 'bug',
      title: 'Fix a Bug',
      subtitle: '"Something breaks when [Y] happens"',
      description: 'Highlights error boundaries, null states, unhandled rejections, and async fallbacks.',
      icon: <Bug className="w-4 h-4 text-zinc-400" />,
    },
    {
      id: 'edit',
      title: 'Safe to Edit?',
      subtitle: '"I want to change [File] safely"',
      description: 'Centers on target downstream Blast Radius to prevent breaking hidden dependencies.',
      icon: <ShieldAlert className="w-4 h-4 text-zinc-400" />,
    },
    {
      id: 'slop',
      title: 'Audit AI Slop',
      subtitle: '"Clean up my latest prompt changes"',
      description: 'Audits hallucinated abstractions, dead code, duplicated logic, and hardcoded secrets.',
      icon: <Sparkles className="w-4 h-4 text-zinc-400" />,
    },
  ];

  const targetPresets = [
    { mode: 'prompt' as const, label: 'Natural Language Prompt', example: 'User uploads an image to S3', icon: <Terminal className="w-3.5 h-3.5" /> },
    { mode: 'route' as const, label: 'UI Route / Page', example: '/upload or app/api/upload/route.ts', icon: <Compass className="w-3.5 h-3.5" /> },
    { mode: 'file' as const, label: 'File / Component', example: 'components/UploadBtn.tsx', icon: <FileCode className="w-3.5 h-3.5" /> },
    { mode: 'commit' as const, label: 'Git Commit Diff', example: 'Last AI generation session (HEAD~1)', icon: <GitCommit className="w-3.5 h-3.5" /> },
  ];

  const handleApply = () => {
    onApplyConfig(config);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#07080b]/85 backdrop-blur-md">
      <div className="relative w-full max-w-3xl bg-[#0c0e15] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[#090b10]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-white/[0.04] border border-white/10 flex items-center justify-center">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100 font-mono uppercase tracking-wider">
                Goal & Scope Configurator
              </h2>
              <p className="text-xs text-zinc-500 font-sans">
                Filter out 80%+ repo noise. Scope strictly to your immediate focus.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-200 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Axis 1: Intent Presets */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-2.5">
              1. Select Intent Preset
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {presets.map((preset) => {
                const isSelected = config.goal === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => setConfig({ ...config, goal: preset.id })}
                    className={`cursor-pointer rounded-lg p-3.5 border transition-all text-left flex flex-col justify-between ${
                      isSelected
                        ? 'border-cyan-400/80 bg-cyan-950/20 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                        : 'border-white/[0.08] bg-[#090b10] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {preset.icon}
                        <span className={`text-xs font-semibold ${isSelected ? 'text-zinc-100' : 'text-zinc-300'}`}>
                          {preset.title}
                        </span>
                      </div>
                      {isSelected && (
                        <div className="w-4 h-4 rounded bg-cyan-400 text-zinc-950 flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-cyan-400 mb-1">
                      {preset.subtitle}
                    </span>
                    <p className="text-xs text-zinc-500 font-sans leading-relaxed">
                      {preset.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Axis 2: Target Selection */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-2.5">
              2. Target Anchor
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2.5 font-mono text-xs">
              {targetPresets.map((t) => (
                <button
                  key={t.mode}
                  type="button"
                  onClick={() => setConfig({ ...config, targetMode: t.mode, target: t.example })}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs border text-left transition-all ${
                    config.targetMode === t.mode
                      ? 'border-cyan-400/80 bg-cyan-500/10 text-cyan-300'
                      : 'border-white/[0.08] bg-[#090b10] text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                  }`}
                >
                  {t.icon}
                  <span className="truncate">{t.label}</span>
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                type="text"
                value={config.target}
                onChange={(e) => setConfig({ ...config, target: e.target.value })}
                placeholder="Enter prompt story, file path, route, or commit..."
                className="w-full px-3.5 py-2 bg-[#090b10] border border-white/10 rounded-lg text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-400 transition-colors"
              />
            </div>
          </div>

          {/* Axis 3: Technical Comfort Level (L1 / L2 / L3) */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-2.5">
              3. Technical Depth Level
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div
                onClick={() => setConfig({ ...config, technicalLevel: 'L1' })}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  config.technicalLevel === 'L1'
                    ? 'border-cyan-400/80 bg-cyan-950/20'
                    : 'border-white/[0.08] bg-[#090b10] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-semibold text-zinc-200">L1: Vibe</span>
                  {config.technicalLevel === 'L1' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </div>
                <p className="text-xs text-zinc-500 font-sans">
                  User intent and high-level architecture. No syntax walls.
                </p>
              </div>

              <div
                onClick={() => setConfig({ ...config, technicalLevel: 'L2' })}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  config.technicalLevel === 'L2'
                    ? 'border-cyan-400/80 bg-cyan-950/20'
                    : 'border-white/[0.08] bg-[#090b10] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-semibold text-zinc-200">L2: Builder</span>
                  {config.technicalLevel === 'L2' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </div>
                <p className="text-xs text-zinc-500 font-sans">
                  Data flow, React state hooks, API payloads, and state mutations.
                </p>
              </div>

              <div
                onClick={() => setConfig({ ...config, technicalLevel: 'L3' })}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  config.technicalLevel === 'L3'
                    ? 'border-cyan-400/80 bg-cyan-950/20'
                    : 'border-white/[0.08] bg-[#090b10] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-semibold text-zinc-200">L3: Deep Dive</span>
                  {config.technicalLevel === 'L3' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </div>
                <p className="text-xs text-zinc-500 font-sans">
                  Syntax mechanics, closures, memory references, and edge cases.
                </p>
              </div>
            </div>
          </div>

          {/* Hop Radius Control */}
          <div className="p-3.5 rounded-lg bg-[#090b10] border border-white/[0.08]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-zinc-300">
                Scope Hop Radius: <span className="text-cyan-400 font-bold">{config.hopRadius} Hops</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                {config.hopRadius === 1 ? 'Direct Dependencies Only' : config.hopRadius >= 4 ? 'Full Execution Pipeline' : 'Bounded Neighborhood'}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={config.hopRadius}
              onChange={(e) => setConfig({ ...config, hopRadius: parseInt(e.target.value, 10) })}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-white/[0.08] bg-[#090b10]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex items-center gap-1.5 px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-zinc-950 font-semibold rounded-md text-xs font-mono uppercase tracking-wider transition-colors shadow-sm"
          >
            <span>Generate Scoped Flow</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
