import React, { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  MarkerType,
  BackgroundVariant,
  ConnectionLineType,
} from '@xyflow/react';
import { ExecutionNode } from './ExecutionNode';
import { ExecutionStepData } from '../types';
import { 
  Flame, 
  ChevronLeft, 
  ChevronRight 
} from 'lucide-react';

interface FlowCanvasProps {
  steps: ExecutionStepData[];
  activeStepId: string;
  blastHighlightIds: string[];
  isBlastMode: boolean;
  onSelectStep: (id: string) => void;
  onToggleFog: (id: string) => void;
  onToggleBlastMode: () => void;
  onHoverStep?: (id: string | null) => void;
}

const nodeTypes = {
  executionNode: ExecutionNode,
};

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
  steps,
  activeStepId,
  blastHighlightIds,
  isBlastMode,
  onSelectStep,
  onToggleFog,
  onToggleBlastMode,
  onHoverStep,
}) => {
  // Convert steps to XYFlow nodes
  const nodes: Node[] = useMemo(() => {
    return steps.map((step, index) => {
      const x = 50 + index * 360;
      const y = 140 + (index % 2 === 0 ? 0 : 36);

      const isActive = step.id === activeStepId;
      const isBlastHighlighted = blastHighlightIds.includes(step.id);

      return {
        id: step.id,
        type: 'executionNode',
        position: { x, y },
        data: {
          ...step,
          isActive,
          isBlastHighlighted,
          onSelectNode: onSelectStep,
          onToggleFog: onToggleFog,
          onHoverNode: onHoverStep,
        },
      };
    });
  }, [steps, activeStepId, blastHighlightIds, onSelectStep, onToggleFog, onHoverStep]);

  // Convert steps to XYFlow edges
  const edges: Edge[] = useMemo(() => {
    const list: Edge[] = [];
    for (let i = 0; i < steps.length - 1; i++) {
      const source = steps[i];
      const target = steps[i + 1];
      const isEdgeActive = source.id === activeStepId || target.id === activeStepId;
      const isBlastEdge = isBlastMode && (blastHighlightIds.includes(target.id) || source.id === activeStepId);

      list.push({
        id: `e-${source.id}-${target.id}`,
        source: source.id,
        target: target.id,
        type: 'smoothstep',
        animated: isEdgeActive,
        style: {
          stroke: isBlastEdge ? '#ffffff' : isEdgeActive ? '#22d3ee' : 'rgba(255,255,255,0.12)',
          strokeWidth: isEdgeActive ? 2.5 : 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isBlastEdge ? '#ffffff' : isEdgeActive ? '#22d3ee' : 'rgba(255,255,255,0.2)',
          width: 14,
          height: 14,
        },
      });
    }
    return list;
  }, [steps, activeStepId, blastHighlightIds, isBlastMode]);

  const activeIndex = steps.findIndex((s) => s.id === activeStepId);

  return (
    <div className="relative w-full h-full bg-[#07080b] overflow-hidden flex flex-col">
      {/* Canvas Floating Control Bar */}
      <div className="absolute top-4 left-5 z-10 flex items-center gap-2.5">
        {/* Step Navigation Pill */}
        <div className="flex items-center bg-[#0d0f15] border border-white/[0.08] rounded-md p-0.5 text-xs font-mono text-zinc-300 shadow-md">
          <button
            onClick={() => {
              if (activeIndex > 0) {
                onSelectStep(steps[activeIndex - 1].id);
              }
            }}
            disabled={activeIndex <= 0}
            className="p-1 hover:bg-white/[0.08] rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="Previous Step"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          
          <span className="px-2.5 py-0.5 font-medium text-[11px]">
            Step <span className="text-cyan-400 font-bold">{activeIndex + 1}</span> of {steps.length}
          </span>

          <button
            onClick={() => {
              if (activeIndex < steps.length - 1) {
                onSelectStep(steps[activeIndex + 1].id);
              }
            }}
            disabled={activeIndex >= steps.length - 1}
            className="p-1 hover:bg-white/[0.08] rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="Next Step"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Blast Radius Preview Toggle */}
        <button
          onClick={onToggleBlastMode}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono uppercase tracking-wider border transition-all ${
            isBlastMode
              ? 'bg-white text-zinc-950 border-white font-semibold shadow-[0_0_15px_rgba(255,255,255,0.25)]'
              : 'bg-[#0d0f15] text-zinc-400 border-white/[0.08] hover:text-zinc-200 hover:border-white/20'
          }`}
        >
          <Flame className="w-3 h-3" />
          <span>Blast Radius</span>
        </button>

        {/* Minimal Monochromatic Legend */}
        <div className="hidden lg:flex items-center gap-3.5 px-3 py-1 bg-[#0d0f15] border border-white/[0.08] rounded-md text-[10px] font-mono uppercase tracking-wider text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border border-dashed border-zinc-500 bg-transparent" />
            <span>Foggy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border border-dotted border-zinc-300 bg-white/20" />
            <span>Fuzzy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-zinc-200">Defogged</span>
          </div>
        </div>
      </div>

      {/* ReactFlow Interactive Canvas */}
      <div className="flex-1 w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          connectionLineType={ConnectionLineType.SmoothStep}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          onNodeMouseEnter={(_, node) => onHoverStep?.(node.id)}
          onNodeMouseLeave={() => onHoverStep?.(null)}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#181a22"
          />
          <Controls position="bottom-left" showInteractive={false} className="!bg-[#0d0f15] !border !border-white/[0.08] !rounded-md" />
          <MiniMap
            position="bottom-right"
            nodeColor={(n) => {
              const d = n.data as any;
              if (d?.fogState === 'clear') return '#22d3ee';
              if (d?.fogState === 'fuzzy') return '#71717a';
              return '#27272a';
            }}
            maskColor="rgba(7, 8, 11, 0.85)"
            className="!bg-[#0d0f15] !border !border-white/[0.08] !rounded-md"
          />
        </ReactFlow>
      </div>
    </div>
  );
};
