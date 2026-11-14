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
  Sliders,
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
    badgeColor: string;
  }[] = [
    {
      id: 'trace',
      title: 'Trace a Feature',
      subtitle: '"How does [X] work?"',
      description: 'Builds a chronological execution pipeline from entry trigger to database write.',
      icon: <GitFork className="w-5 h-5 text-cyan-400" />,
      badgeColor: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
    },
    {
      id: 'bug',
      title: 'Fix a Bug',
      subtitle: '"Something breaks when [Y] happens"',
      description: 'Highlights error boundaries, null states, unhandled rejections, and async fallbacks.',
      icon: <Bug className="w-5 h-5 text-rose-400" />,
      badgeColor: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
    },
    {
      id: 'edit',
      title: 'Safe to Edit?',
      subtitle: '"I want to change [File] safely"',
      description: 'Centers on target downstream Blast Radius to prevent breaking hidden dependencies.',
      icon: <ShieldAlert className="w-5 h-5 text-amber-400" />,
      badgeColor: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    },
    {
      id: 'slop',
      title: 'Audit AI Slop',
      subtitle: '"Clean up my latest prompt changes"',
      description: 'Audits hallucinated abstractions, dead code, duplicated logic, and hardcoded secrets.',
      icon: <Sparkles className="w-5 h-5 text-purple-400" />,
      badgeColor: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
    },
  ];

  const targetPresets = [
    { mode: 'prompt' as const, label: 'Natural Language Prompt', example: 'User uploads an image to S3', icon: <Terminal className="w-4 h-4" /> },
    { mode: 'route' as const, label: 'UI Route / Page', example: '/upload or app/api/upload/route.ts', icon: <Compass className="w-4 h-4" /> },
    { mode: 'file' as const, label: 'File / Component', example: 'components/UploadBtn.tsx', icon: <FileCode className="w-4 h-4" /> },
    { mode: 'commit' as const, label: 'Git Commit Diff', example: 'Last AI generation session (HEAD~1)', icon: <GitCommit className="w-4 h-4" /> },
  ];

  const handleApply = () => {
    onApplyConfig(config);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Sliders className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Goal & Scope Configurator
              </h2>
              <p className="text-xs text-slate-400">
                Filter out 80%+ repo noise. Scope strictly to what you care about right now.
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Axis 1: Intent Presets */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">
              1. Select Intent Preset
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {presets.map((preset) => {
                const isSelected = config.goal === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => setConfig({ ...config, goal: preset.id })}
                    className={`cursor-pointer rounded-xl p-3.5 border transition-all text-left flex flex-col justify-between ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-950/20 ring-1 ring-cyan-500/40 shadow-lg shadow-cyan-950/50'
                        : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-950/80'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {preset.icon}
                        <span className="text-sm font-semibold text-slate-200">
                          {preset.title}
                        </span>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-mono text-cyan-400/90 mb-1">
                      {preset.subtitle}
                    </span>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {preset.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Axis 2: Target Selection */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">
              2. Target Anchor
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {targetPresets.map((t) => (
                <button
                  key={t.mode}
                  type="button"
                  onClick={() => setConfig({ ...config, targetMode: t.mode, target: t.example })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border text-left transition-all ${
                    config.targetMode === t.mode
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/40'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-300'
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
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
              />
            </div>
          </div>

          {/* Axis 3: Technical Comfort Level (L1 / L2 / L3) */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">
              3. Technical Comfort Level
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div
                onClick={() => setConfig({ ...config, technicalLevel: 'L1' })}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  config.technicalLevel === 'L1'
                    ? 'border-cyan-500 bg-cyan-950/30 ring-1 ring-cyan-500/50'
                    : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-cyan-400">L1: Vibe Mode</span>
                  {config.technicalLevel === 'L1' && <Check className="w-4 h-4 text-cyan-400" />}
                </div>
                <p className="text-xs text-slate-400">
                  Focuses on user intent, architecture, and high-level feature purpose. No syntax wall.
                </p>
              </div>

              <div
                onClick={() => setConfig({ ...config, technicalLevel: 'L2' })}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  config.technicalLevel === 'L2'
                    ? 'border-cyan-500 bg-cyan-950/30 ring-1 ring-cyan-500/50'
                    : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-cyan-400">L2: Builder Mode</span>
                  {config.technicalLevel === 'L2' && <Check className="w-4 h-4 text-cyan-400" />}
                </div>
                <p className="text-xs text-slate-400">
                  Data flow, React hooks, API payloads, DB records, and state transitions.
                </p>
              </div>

              <div
                onClick={() => setConfig({ ...config, technicalLevel: 'L3' })}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  config.technicalLevel === 'L3'
                    ? 'border-cyan-500 bg-cyan-950/30 ring-1 ring-cyan-500/50'
                    : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-cyan-400">L3: Deep Dive</span>
                  {config.technicalLevel === 'L3' && <Check className="w-4 h-4 text-cyan-400" />}
                </div>
                <p className="text-xs text-slate-400">
                  Full syntax mechanics, closures, memory references, types, and edge cases.
                </p>
              </div>
            </div>
          </div>

          {/* Hop Radius Control */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-slate-300">
                Scope Hop Radius: <span className="text-cyan-400 font-bold">{config.hopRadius} Hops</span>
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {config.hopRadius === 1 ? 'Direct Dependencies Only' : config.hopRadius >= 4 ? 'Full Execution Pipeline' : 'Neighborhood Nodes'}
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
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/90">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-semibold rounded-xl text-xs shadow-lg shadow-cyan-500/25 transition-all"
          >
            <span>Generate Scoped Flow</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
