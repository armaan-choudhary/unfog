import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { ExecutionStepData } from '../types';
import { 
  Cloud, 
  Sparkles, 
  CheckCircle2, 
  HelpCircle, 
  Code2, 
  Database, 
  Layers, 
  Radio, 
  Flame,
  ArrowRight
} from 'lucide-react';

export interface ExecutionNodeData extends ExecutionStepData {
  isActive: boolean;
  isBlastHighlighted?: boolean;
  onSelectNode: (id: string) => void;
  onToggleFog: (id: string) => void;
  onHoverNode?: (id: string | null) => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  component: <Layers className="w-3.5 h-3.5 text-blue-400" />,
  hook: <Radio className="w-3.5 h-3.5 text-purple-400" />,
  route: <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />,
  service: <Cloud className="w-3.5 h-3.5 text-cyan-400" />,
  db: <Database className="w-3.5 h-3.5 text-rose-400" />,
};

export const ExecutionNode: React.FC<NodeProps> = ({ data }) => {
  const nodeData = data as unknown as ExecutionNodeData;
  const {
    id,
    stepIndex,
    label,
    file,
    symbol,
    nodeType,
    fogState,
    shortSummary,
    isActive,
    isBlastHighlighted,
    debtRadar,
    onSelectNode,
    onToggleFog,
    onHoverNode,
  } = nodeData;

  // Fog State Styling
  // foggy = dashed/muted
  // fuzzy = amber
  // clear = solid/bright
  const getFogStyle = () => {
    if (fogState === 'clear') {
      return {
        card: 'border-emerald-500/80 bg-slate-900/90 shadow-[0_0_24px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500/30',
        badge: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
        label: 'text-emerald-300 font-semibold',
        statusText: 'Understood (Clear)',
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
        borderStyle: 'border-solid border-2',
      };
    }
    if (fogState === 'fuzzy') {
      return {
        card: 'border-amber-500/80 bg-slate-900/90 shadow-[0_0_20px_rgba(245,158,11,0.22)] ring-1 ring-amber-500/30',
        badge: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
        label: 'text-amber-200 font-semibold',
        statusText: 'Fuzzy / Tricky',
        icon: <HelpCircle className="w-3.5 h-3.5 text-amber-400" />,
        borderStyle: 'border-solid border-2',
      };
    }
    // foggy: dashed / muted
    return {
      card: 'border-slate-700/80 bg-slate-950/70 opacity-80 hover:opacity-100 shadow-[0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur-sm',
      badge: 'bg-slate-800/80 text-slate-400 border border-slate-700',
      label: 'text-slate-300 font-medium',
      statusText: 'Unfog Needed',
      icon: <Cloud className="w-3.5 h-3.5 text-slate-400" />,
      borderStyle: 'border-dashed border-2',
    };
  };

  const fogStyle = getFogStyle();

  return (
    <div
      onClick={() => onSelectNode?.(id)}
      onMouseEnter={() => onHoverNode?.(id)}
      onMouseLeave={() => onHoverNode?.(null)}
      className={`relative w-80 rounded-xl transition-all duration-200 cursor-pointer select-none text-left p-4 ${
        fogStyle.borderStyle
      } ${fogStyle.card} ${
        isActive ? 'ring-2 ring-cyan-400 scale-[1.02] shadow-[0_0_30px_rgba(34,211,238,0.35)]' : ''
      } ${
        isBlastHighlighted ? 'ring-2 ring-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.35)] animate-pulse' : ''
      }`}
    >
      {/* Handles for flow connections */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-slate-900 !-left-2"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-slate-900 !-right-2"
      />

      {/* Top Bar: Step Index + NodeType + Fog Status Pill */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center w-5 h-5 rounded-full text-xs font-mono font-bold bg-slate-800 border border-slate-700 text-slate-200">
            {stepIndex}
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono uppercase tracking-wider bg-slate-800/60 text-slate-400 border border-slate-700/50">
            {typeIcons[nodeType] || <Code2 className="w-3 h-3" />}
            {nodeType}
          </span>
        </div>

        {/* Fog State Pill (Click to toggle) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFog?.(id);
          }}
          title="Click to toggle fog state"
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors hover:brightness-125 ${fogStyle.badge}`}
        >
          {fogStyle.icon}
          <span>{fogStyle.statusText}</span>
        </button>
      </div>

      {/* Main Node Content */}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={`text-base tracking-tight truncate ${fogStyle.label}`}>
            {label}
          </h3>
          <span className="text-[11px] font-mono text-cyan-400/90 truncate max-w-[130px]" title={symbol}>
            .{symbol}()
          </span>
        </div>
        
        <p className="text-xs font-mono text-slate-400 truncate" title={file}>
          {file}
        </p>

        <p className="text-xs text-slate-300/90 line-clamp-2 pt-1 font-sans leading-relaxed">
          {shortSummary}
        </p>
      </div>

      {/* Bottom Indicators: AI Slop Warning or Blast Warning */}
      <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
        {debtRadar?.hasSlop ? (
          <span
            className="flex items-center gap-1 text-purple-300 font-mono text-[11px] bg-purple-500/15 px-1.5 py-0.5 rounded border border-purple-500/40 truncate max-w-[150px]"
            title={debtRadar.issues.join('; ')}
          >
            <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
            <span className="truncate">
              {debtRadar.issues[0]?.toLowerCase().includes('secret')
                ? 'Hardcoded Secret'
                : debtRadar.issues[0]?.toLowerCase().includes('prop')
                ? 'Unused Prop'
                : 'AI Slop Flagged'}
            </span>
          </span>
        ) : (
          <span className="text-slate-500 font-mono text-[11px]">Clean Flow</span>
        )}

        {isBlastHighlighted && (
          <span className="flex items-center gap-1 text-rose-400 font-mono font-medium animate-pulse">
            <Flame className="w-3 h-3" />
            In Blast Radius
          </span>
        )}

        {isActive && (
          <span className="text-cyan-400 font-mono text-[11px] flex items-center gap-1">
            Active Focus
          </span>
        )}
      </div>
    </div>
  );
};
