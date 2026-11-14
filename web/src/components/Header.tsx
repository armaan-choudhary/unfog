import React from 'react';
import { GoalSetupConfig, ExecutionStepData } from '../types';
import { 
  CloudFog, 
  Sliders, 
  FileDown, 
  ShieldCheck 
} from 'lucide-react';

interface HeaderProps {
  config: GoalSetupConfig;
  steps: ExecutionStepData[];
  isBackendLive?: boolean;
  onOpenConfigModal: () => void;
  onExportModel: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  steps,
  isBackendLive = false,
  onOpenConfigModal,
  onExportModel,
}) => {
  const clearCount = steps.filter((s) => s.fogState === 'clear').length;
  const fuzzyCount = steps.filter((s) => s.fogState === 'fuzzy').length;
  const total = steps.length;
  const percentage = Math.round((clearCount / total) * 100);

  const presetLabels: Record<string, string> = {
    trace: 'Feature Trace',
    bug: 'Bug Isolation',
    edit: 'Safe Edit',
    slop: 'AI Slop Audit',
  };

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md px-5 flex items-center justify-between select-none z-20">
      {/* Brand & Target Scope */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <CloudFog className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              <span>UNFOG</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 uppercase">
                v0.1
              </span>
              <span
                className={`w-2 h-2 rounded-full ml-1 ${
                  isBackendLive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-amber-400/80'
                }`}
                title={isBackendLive ? 'Axum REST API Connected (127.0.0.1:3001)' : 'Standby / Fallback Mock Mode'}
              />
            </h1>
          </div>
        </div>

        <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

        {/* Current Active Goal Badge */}
        <button
          onClick={onOpenConfigModal}
          className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-850 text-xs transition-colors"
          title="Click to change goal & scope"
        >
          <span className="font-mono text-cyan-400 font-semibold uppercase text-[11px]">
            {presetLabels[config.goal] || config.goal}
          </span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-300 font-medium truncate max-w-[200px] sm:max-w-xs font-mono text-[11px]">
            {config.target}
          </span>
          <Sliders className="w-3.5 h-3.5 text-slate-400 ml-1" />
        </button>
      </div>

      {/* Progress & Actions */}
      <div className="flex items-center gap-4">
        {/* Defog Progress */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <div className="text-xs font-medium text-slate-200 flex items-center justify-end gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{clearCount}/{total} Nodes Understood</span>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {percentage}% Code Ownership
            </div>
          </div>

          <div className="w-24 sm:w-32 h-2 rounded-full bg-slate-800 overflow-hidden flex">
            <div
              className="bg-emerald-500 h-full transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
            <div
              className="bg-amber-500 h-full transition-all duration-300"
              style={{ width: `${Math.round((fuzzyCount / total) * 100)}%` }}
            />
          </div>
        </div>

        {/* Export ARCHITECTURE.md / .cursorrules */}
        <button
          onClick={onExportModel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-colors"
          title="Export Mental Model as ARCHITECTURE.md or .cursorrules"
        >
          <FileDown className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Export Model</span>
        </button>
      </div>
    </header>
  );
};
