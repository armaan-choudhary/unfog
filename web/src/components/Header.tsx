import React from 'react';
import { GoalSetupConfig, ExecutionStepData } from '../types';
import { 
  Cloud, 
  SlidersHorizontal, 
  Download, 
  Check 
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
  const total = steps.length;
  const percentage = Math.round((clearCount / total) * 100);

  const presetLabels: Record<string, string> = {
    trace: 'Feature Trace',
    bug: 'Bug Isolation',
    edit: 'Safe Edit',
    slop: 'AI Slop Audit',
  };

  return (
    <header className="h-14 border-b border-white/[0.08] bg-[#07080c] px-5 flex items-center justify-between select-none z-20">
      {/* Brand & Target Scope */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center">
            <Cloud className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-wider text-zinc-100 flex items-center gap-1.5 uppercase font-mono">
              <span>UNFOG</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isBackendLive ? 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]' : 'bg-zinc-600'
                }`}
                title={isBackendLive ? 'Backend API connected' : 'Local Standby'}
              />
            </h1>
          </div>
        </div>

        <div className="h-4 w-[1px] bg-white/[0.08] hidden sm:block" />

        {/* Current Active Goal Badge */}
        <button
          onClick={onOpenConfigModal}
          className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.08] hover:border-white/20 text-xs transition-colors"
          title="Configure Goal & Scope"
        >
          <span className="font-mono text-cyan-400 text-[11px] font-medium uppercase tracking-wider">
            {presetLabels[config.goal] || config.goal}
          </span>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-300 font-mono text-[11px] truncate max-w-[200px] sm:max-w-xs">
            {config.target}
          </span>
          <SlidersHorizontal className="w-3 h-3 text-zinc-500 ml-0.5" />
        </button>
      </div>

      {/* Progress & Actions */}
      <div className="flex items-center gap-5">
        {/* Defog Progress Bar */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <div className="text-xs font-medium text-zinc-200 flex items-center justify-end gap-1 font-mono">
              <Check className="w-3 h-3 text-cyan-400" />
              <span>{clearCount}/{total} Cleared</span>
            </div>
            <div className="text-[10px] font-mono text-zinc-500">
              {percentage}% Owned
            </div>
          </div>

          <div className="w-24 sm:w-28 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="bg-cyan-400 h-full transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Export Button */}
        <button
          onClick={onExportModel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border border-white/10 transition-colors"
          title="Export Model"
        >
          <Download className="w-3.5 h-3.5 text-zinc-400" />
          <span className="hidden sm:inline">Export</span>
        </button>
      </div>
    </header>
  );
};
