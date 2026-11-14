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
      const x = 50 + index * 380;
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

  // Convert steps to XYFlow edges with visual data payload badges
  const edges: Edge[] = useMemo(() => {
    const list: Edge[] = [];
    for (let i = 0; i < steps.length - 1; i++) {
      const source = steps[i];
      const target = steps[i + 1];
      const isEdgeActive = source.id === activeStepId || target.id === activeStepId;
      const isBlastEdge = isBlastMode && (blastHighlightIds.includes(target.id) || source.id === activeStepId);

      const payloadLabel = source.visualFlow?.edgePayload || 'payload';

      list.push({
        id: `e-${source.id}-${target.id}`,
        source: source.id,
        target: target.id,
        type: 'smoothstep',
        animated: isEdgeActive,
        label: payloadLabel,
        labelStyle: {
          fill: isEdgeActive ? '#22d3ee' : '#a1a1aa',
          fontSize: 10,
          fontFamily: 'monospace',
          fontWeight: 600,
        },
        labelBgStyle: {
          fill: '#080a10',
          stroke: isEdgeActive ? 'rgba(34, 211, 238, 0.4)' : 'rgba(255, 255, 255, 0.1)',
          strokeWidth: 1,
        },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 4,
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
    <div className="relative w-full h-full bg-[#07080b] overflow-hidden flex flex-col select-none">
      {/* Floating Story River & Controls */}
      <div className="absolute top-4 left-5 right-5 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Interactive Step Navigator Strip */}
          <div className="flex items-center bg-[#0d0f15]/90 backdrop-blur-md border border-white/[0.08] rounded-lg p-1 text-xs font-mono shadow-xl">
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
            
            {/* Clickable mini-step pills */}
            <div className="flex items-center gap-1 px-1.5">
              {steps.map((s, idx) => {
                const isSelected = s.id === activeStepId;
                return (
                  <button
                    key={s.id}
                    onClick={() => onSelectStep(s.id)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-all ${
                      isSelected
                        ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/40'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span>{idx + 1}.</span>
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>
                );
              })}
            </div>

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

          {/* Blast Radius Toggle */}
          <button
            onClick={onToggleBlastMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider border transition-all ${
              isBlastMode
                ? 'bg-white text-zinc-950 border-white font-semibold shadow-[0_0_15px_rgba(255,255,255,0.25)]'
                : 'bg-[#0d0f15]/90 text-zinc-400 border-white/[0.08] hover:text-zinc-200 hover:border-white/20'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Blast Radius</span>
          </button>
        </div>

        {/* Minimal Monochromatic Legend */}
        <div className="hidden lg:flex items-center gap-3.5 px-3 py-1.5 bg-[#0d0f15]/90 backdrop-blur-md border border-white/[0.08] rounded-lg text-[10px] font-mono uppercase tracking-wider text-zinc-400 pointer-events-auto">
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
            gap={22}
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
