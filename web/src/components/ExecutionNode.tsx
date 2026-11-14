import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { ExecutionStepData } from '../types';
import { 
  Cloud, 
  Sparkles, 
  Check, 
  HelpCircle, 
  Code2, 
  Layers, 
  Radio, 
  ArrowRight,
  Flame,
  FileCode
} from 'lucide-react';

export interface ExecutionNodeData extends ExecutionStepData {
  isActive: boolean;
  isBlastHighlighted?: boolean;
  onSelectNode: (id: string) => void;
  onToggleFog: (id: string) => void;
  onHoverNode?: (id: string | null) => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  component: <Layers className="w-3 h-3 text-zinc-400" />,
  hook: <Radio className="w-3 h-3 text-zinc-400" />,
  route: <ArrowRight className="w-3 h-3 text-zinc-400" />,
  service: <Cloud className="w-3 h-3 text-zinc-400" />,
  db: <FileCode className="w-3 h-3 text-zinc-400" />,
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

  // Monochromatic Fog States with single Cyan Accent for 'clear'
  const getFogStyle = () => {
    if (fogState === 'clear') {
      return {
        card: 'border-cyan-400/60 bg-[#0e1219] shadow-[0_0_24px_rgba(6,182,212,0.12)]',
        badge: 'bg-cyan-500/10 text-cyan-300 border border-cyan-400/30',
        label: 'text-zinc-100 font-semibold',
        statusText: 'Defogged',
        icon: <Check className="w-3 h-3 text-cyan-400" />,
        borderStyle: 'border-solid border',
        bodyText: 'text-zinc-300',
      };
    }
    if (fogState === 'fuzzy') {
      return {
        card: 'border-white/20 bg-[#0c0e14] shadow-[0_4px_20px_rgba(0,0,0,0.5)]',
        badge: 'bg-white/[0.06] text-zinc-300 border border-white/15',
        label: 'text-zinc-200 font-medium',
        statusText: 'Fuzzy',
        icon: <HelpCircle className="w-3 h-3 text-zinc-400" />,
        borderStyle: 'border-dotted border',
        bodyText: 'text-zinc-400',
      };
    }
    // foggy: frosted / muted / dashed
    return {
      card: 'border-white/10 bg-[#090b10]/90 backdrop-blur-md opacity-75 hover:opacity-100 transition-opacity',
      badge: 'bg-white/[0.03] text-zinc-500 border border-white/[0.08]',
      label: 'text-zinc-400 font-medium',
      statusText: 'Foggy',
      icon: <Cloud className="w-3 h-3 text-zinc-500" />,
      borderStyle: 'border-dashed border',
      bodyText: 'text-zinc-500',
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
        isActive
          ? '!border-cyan-400 !ring-2 !ring-cyan-400/40 !bg-[#0f141f] scale-[1.02] shadow-[0_0_30px_rgba(6,182,212,0.25)]'
          : ''
      } ${
        isBlastHighlighted
          ? '!border-white !ring-1 !ring-white/80 !bg-white/[0.06] shadow-[0_0_24px_rgba(255,255,255,0.2)]'
          : ''
      }`}
    >
      {/* Handles for flow connections */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-zinc-600 !border-2 !border-[#08090c] !-left-1.5 transition-colors group-hover:!bg-cyan-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-cyan-400 !border-2 !border-[#08090c] !-right-1.5"
      />

      {/* Top Meta Bar */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center w-5 h-5 rounded text-[11px] font-mono font-semibold bg-white/[0.06] border border-white/10 text-zinc-300">
            {stepIndex}
          </span>
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-white/[0.04] text-zinc-400 border border-white/[0.08]">
            {typeIcons[nodeType] || <Code2 className="w-3 h-3" />}
            {nodeType}
          </span>
        </div>

        {/* Fog State Badge */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFog?.(id);
          }}
          title="Toggle fog state"
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider transition-colors hover:brightness-125 ${fogStyle.badge}`}
        >
          {fogStyle.icon}
          <span>{fogStyle.statusText}</span>
        </button>
      </div>

      {/* Main Node Content */}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={`text-sm tracking-tight truncate ${fogStyle.label}`}>
            {label}
          </h3>
          <span className="text-[11px] font-mono text-cyan-400/80 truncate max-w-[130px]" title={symbol}>
            .{symbol}()
          </span>
        </div>
        
        <p className="text-[11px] font-mono text-zinc-500 truncate" title={file}>
          {file}
        </p>

        <p className={`text-xs ${fogStyle.bodyText} line-clamp-2 pt-1 font-sans leading-relaxed`}>
          {shortSummary}
        </p>
      </div>

      {/* Bottom Indicators */}
      <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
        {debtRadar?.hasSlop ? (
          <span
            className="flex items-center gap-1 text-zinc-300 font-mono text-[10px] uppercase tracking-wider bg-white/[0.06] px-1.5 py-0.5 rounded border border-white/10 truncate max-w-[150px]"
            title={debtRadar.issues.join('; ')}
          >
            <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
            <span className="truncate">AI Debt Flagged</span>
          </span>
        ) : (
          <span className="text-zinc-600 font-mono text-[10px] uppercase tracking-wider">Clean</span>
        )}

        {isBlastHighlighted && (
          <span className="flex items-center gap-1 text-white font-mono text-[10px] uppercase tracking-wider font-semibold">
            <Flame className="w-3 h-3 text-white" />
            Impact Zone
          </span>
        )}

        {isActive && !isBlastHighlighted && (
          <span className="text-cyan-400 font-mono text-[10px] uppercase tracking-wider flex items-center gap-1">
            Active
          </span>
        )}
      </div>
    </div>
  );
};
