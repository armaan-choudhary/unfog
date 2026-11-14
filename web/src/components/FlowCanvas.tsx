import React, { useMemo, useCallback } from 'react';
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
      // Horizontal sequential pipeline layout
      const x = 50 + index * 360;
      // Slight vertical wave for visual appeal
      const y = 140 + (index % 2 === 0 ? 0 : 40);

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
          stroke: isBlastEdge ? '#f43f5e' : isEdgeActive ? '#38bdf8' : '#334155',
          strokeWidth: isEdgeActive ? 3 : 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isBlastEdge ? '#f43f5e' : isEdgeActive ? '#38bdf8' : '#475569',
          width: 16,
          height: 16,
        },
      });
    }
    return list;
  }, [steps, activeStepId, blastHighlightIds, isBlastMode]);

  const activeIndex = steps.findIndex((s) => s.id === activeStepId);

  const handlePrev = useCallback(() => {
    if (activeIndex > 0) {
      onSelectStep(steps[activeIndex - 1].id);
    }
  }, [activeIndex, steps, onSelectStep]);

  const handleNext = useCallback(() => {
    if (activeIndex < steps.length - 1) {
      onSelectStep(steps[activeIndex + 1].id);
    }
  }, [activeIndex, steps, onSelectStep]);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#0a0d14] overflow-hidden">
      {/* Top Floating Action Bar */}
      <div className="absolute top-4 left-6 z-10 flex items-center gap-3">
        {/* Step Prev/Next Navigator */}
        <div className="flex items-center bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-lg p-1 shadow-lg">
          <button
            onClick={handlePrev}
            disabled={activeIndex <= 0}
            className="p-1.5 text-slate-400 hover:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-400 rounded transition-colors"
            title="Previous Step"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 text-xs font-mono text-slate-300">
            Step <span className="text-cyan-400 font-bold">{activeIndex + 1}</span> of {steps.length}
          </span>
          <button
            onClick={handleNext}
            disabled={activeIndex >= steps.length - 1}
            className="p-1.5 text-slate-400 hover:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-400 rounded transition-colors"
            title="Next Step"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Blast Radius Toggle */}
        <button
          onClick={onToggleBlastMode}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all backdrop-blur-md shadow-lg ${
            isBlastMode
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-rose-500/20 ring-1 ring-rose-500/40'
              : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:border-slate-700'
          }`}
        >
          <Flame className={`w-3.5 h-3.5 ${isBlastMode ? 'text-rose-400 animate-bounce' : 'text-slate-400'}`} />
          <span>Blast Radius Preview</span>
        </button>

        {/* Legend */}
        <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-lg text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border border-dashed border-slate-500 bg-slate-800" />
            <span>Foggy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border border-amber-500 bg-amber-500/30" />
            <span>Fuzzy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border border-emerald-500 bg-emerald-500/40" />
            <span>Clear</span>
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
          fitViewOptions={{ padding: 0.3 }}
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
            color="#1e293b"
          />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap
            position="bottom-right"
            nodeColor={(n) => {
              const d = n.data as any;
              if (d?.fogState === 'clear') return '#10b981';
              if (d?.fogState === 'fuzzy') return '#f59e0b';
              return '#475569';
            }}
            maskColor="rgba(10, 13, 20, 0.75)"
            className="!bg-slate-950/80 !border !border-slate-800 !rounded-lg"
          />
        </ReactFlow>
      </div>
    </div>
  );
};
