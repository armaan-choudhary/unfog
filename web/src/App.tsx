import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { FlowCanvas } from './components/FlowCanvas';
import { VisualDataFlowInspector } from './components/VisualDataFlowInspector';
import { MentalModelDrawer } from './components/MentalModelDrawer';
import { PreMapModal } from './components/PreMapModal';
import { ExportModal } from './components/ExportModal';
import { SandboxChallengeModal } from './components/SandboxChallengeModal';
import { INITIAL_TRACE_STEPS } from './data/mockTrace';
import { ExecutionStepData, FogState, GoalSetupConfig } from './types';
import { api } from './api/client';
import { adaptBackendTraceToSteps } from './utils/adapter';
import { PanelBottomClose, PanelBottomOpen } from 'lucide-react';

export function App() {
  const [steps, setSteps] = useState<ExecutionStepData[]>(INITIAL_TRACE_STEPS);
  const [activeStepId, setActiveStepId] = useState<string>(INITIAL_TRACE_STEPS[0].id);
  const [technicalLevel, setTechnicalLevel] = useState<'L1' | 'L2' | 'L3'>('L1');
  const [isBlastMode, setIsBlastMode] = useState<boolean>(false);
  const [hoverBlastIds, setHoverBlastIds] = useState<string[]>([]);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isSandboxOpen, setIsSandboxOpen] = useState<boolean>(false);
  const [isCodeViewerExpanded, setIsCodeViewerExpanded] = useState<boolean>(true);
  const [isBackendLive, setIsBackendLive] = useState<boolean>(false);

  // Cache for fetched file contents: { [filePath]: content }
  const fileCacheRef = useRef<Record<string, string>>({});

  const [config, setConfig] = useState<GoalSetupConfig>({
    goal: 'trace',
    target: 'User uploads an image to S3',
    targetMode: 'prompt',
    technicalLevel: 'L1',
    hopRadius: 3,
  });

  const activeStep = useMemo(() => {
    return steps.find((s) => s.id === activeStepId) || steps[0];
  }, [steps, activeStepId]);

  // Combined blast radius highlights: active step blast (when blast mode is ON) + hover blast
  const blastHighlightIds = useMemo(() => {
    const list = new Set<string>();
    if (isBlastMode && activeStep) {
      list.add(activeStep.id);
      activeStep.blastRadius.affectedIds.forEach((id) => list.add(id));
    }
    hoverBlastIds.forEach((id) => list.add(id));
    return Array.from(list);
  }, [isBlastMode, activeStep, hoverBlastIds]);

  // Check backend health, sync persisted state, and slop radar on mount
  useEffect(() => {
    let mounted = true;
    async function initBackend() {
      try {
        await api.checkHealth();
        if (!mounted) return;
        setIsBackendLive(true);

        // Fetch persisted understood state
        try {
          const stateRes = await api.getState();
          const understoodList = stateRes.understood || stateRes.understood_nodes;
          if (understoodList && understoodList.length > 0) {
            setSteps((prev) =>
              prev.map((s) =>
                understoodList.includes(s.id) ? { ...s, fogState: 'clear' } : s
              )
            );
          } else if (stateRes.nodes) {
            setSteps((prev) =>
              prev.map((s) => {
                const persisted = stateRes.nodes?.[s.id];
                if (persisted === 'clear' || persisted === 'fuzzy' || persisted === 'foggy') {
                  return { ...s, fogState: persisted as FogState };
                }
                return s;
              })
            );
          }
        } catch {
          // ignore
        }

        // Fetch slop analysis from backend
        try {
          const slopRes = await api.getSlop();
          if (slopRes && slopRes.issues && slopRes.issues.length > 0) {
            setSteps((prev) =>
              prev.map((s) => {
                const matchedIssues = slopRes.issues.filter((issue) =>
                  issue.toLowerCase().includes(s.label.toLowerCase()) ||
                  issue.toLowerCase().includes(s.file.toLowerCase())
                );
                if (matchedIssues.length > 0) {
                  return {
                    ...s,
                    debtRadar: {
                      hasSlop: true,
                      issues: matchedIssues,
                    },
                  };
                }
                return s;
              })
            );
          }
        } catch {
          // ignore slop fetch error
        }
      } catch {
        if (mounted) setIsBackendLive(false);
      }
    }

    initBackend();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch real file content from /api/file when active step changes
  useEffect(() => {
    if (!activeStep || !activeStep.file) return;
    const filePath = activeStep.file;

    if (fileCacheRef.current[filePath]) {
      if (activeStep.fullCode !== fileCacheRef.current[filePath]) {
        setSteps((prev) =>
          prev.map((s) =>
            s.id === activeStep.id ? { ...s, fullCode: fileCacheRef.current[filePath] } : s
          )
        );
      }
      return;
    }

    let isSubscribed = true;
    api
      .getFile(filePath)
      .then((res) => {
        if (!isSubscribed || !res.content) return;
        fileCacheRef.current[filePath] = res.content;
        setSteps((prev) =>
          prev.map((s) =>
            s.id === activeStep.id ? { ...s, fullCode: res.content } : s
          )
        );
      })
      .catch(() => {
        // Fallback to existing mock fullCode
      });

    return () => {
      isSubscribed = false;
    };
  }, [activeStep]);

  // Load real execution trace on goal/target selection from /api/scope
  const loadScopedTrace = useCallback(async (target: string, goal: string) => {
    try {
      const trace = await api.getScope(target, goal);
      if (trace && trace.steps && trace.steps.length > 0) {
        setIsBackendLive(true);
        const adapted = adaptBackendTraceToSteps(trace, fileCacheRef.current);
        setSteps(adapted);
        if (adapted[0]) {
          setActiveStepId(adapted[0].id);
        }
      }
    } catch {
      // keep current trace on error
    }
  }, []);

  // Handle setting fog state + send /api/verify
  const handleSetFogState = useCallback((id: string, nextState: FogState) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, fogState: nextState } : step))
    );

    api.verifyNode(id, nextState).catch(() => {
      // ignore network errors in standalone mode
    });
  }, []);

  // Toggle fog state cycling: foggy -> fuzzy -> clear -> foggy
  const handleToggleFog = useCallback(
    (id: string) => {
      const current = steps.find((s) => s.id === id)?.fogState || 'foggy';
      const cycle: Record<FogState, FogState> = {
        foggy: 'fuzzy',
        fuzzy: 'clear',
        clear: 'foggy',
      };
      const next = cycle[current];
      handleSetFogState(id, next);
    },
    [steps, handleSetFogState]
  );

  // Hover blast radius calculation from /api/blast-radius
  const handleHoverStep = useCallback((nodeId: string | null) => {
    if (!nodeId) {
      setHoverBlastIds([]);
      return;
    }

    api
      .getBlastRadius(nodeId)
      .then((res) => {
        if (res && res.affected_nodes) {
          const ids = [nodeId, ...res.affected_nodes.map((n) => n.id)];
          setHoverBlastIds(ids);
        } else {
          setHoverBlastIds([nodeId]);
        }
      })
      .catch(() => {
        const step = steps.find((s) => s.id === nodeId);
        if (step) {
          setHoverBlastIds([nodeId, ...step.blastRadius.affectedIds]);
        } else {
          setHoverBlastIds([nodeId]);
        }
      });
  }, [steps]);

  const handleSelectStep = useCallback((id: string) => {
    setActiveStepId(id);
  }, []);

  const handleApplyConfig = useCallback(
    (newConfig: GoalSetupConfig) => {
      setConfig(newConfig);
      setTechnicalLevel(newConfig.technicalLevel);

      // Trigger live backend /api/scope
      loadScopedTrace(newConfig.target, newConfig.goal);
    },
    [loadScopedTrace]
  );

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0d14] text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <Header
        config={config}
        steps={steps}
        isBackendLive={isBackendLive}
        onOpenConfigModal={() => setIsConfigModalOpen(true)}
        onExportModel={() => setIsExportModalOpen(true)}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Column: Canvas (Top) + Code Viewer (Bottom) */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* XYFlow Canvas */}
          <div
            className={`w-full transition-all duration-300 relative ${
              isCodeViewerExpanded ? 'h-[55%]' : 'h-[calc(100%-40px)]'
            }`}
          >
            <FlowCanvas
              steps={steps}
              activeStepId={activeStepId}
              blastHighlightIds={blastHighlightIds}
              isBlastMode={isBlastMode}
              onSelectStep={handleSelectStep}
              onToggleFog={handleToggleFog}
              onToggleBlastMode={() => setIsBlastMode((v) => !v)}
              onHoverStep={handleHoverStep}
            />

            {/* Collapse/Expand Inspector button */}
            <button
              onClick={() => setIsCodeViewerExpanded((v) => !v)}
              className="absolute bottom-2 right-4 z-20 flex items-center gap-1.5 px-2.5 py-1 bg-[#0d0f15] hover:bg-[#151822] text-zinc-300 border border-white/10 rounded-md text-xs shadow-lg transition-colors font-mono"
              title={isCodeViewerExpanded ? 'Collapse Data Flow Inspector' : 'Expand Data Flow Inspector'}
            >
              {isCodeViewerExpanded ? (
                <>
                  <PanelBottomClose className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-[11px]">Hide Data Flow</span>
                </>
              ) : (
                <>
                  <PanelBottomOpen className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-[11px]">Show Data Flow</span>
                </>
              )}
            </button>
          </div>

          {/* Visual Data Flow Inspector Panel */}
          {isCodeViewerExpanded && (
            <div className="h-[45%] w-full overflow-hidden border-t border-white/[0.08]">
              <VisualDataFlowInspector step={activeStep} />
            </div>
          )}
        </div>

        {/* Right Column: L1/L2/L3 Mental Model Drawer */}
        <MentalModelDrawer
          step={activeStep}
          technicalLevel={technicalLevel}
          onChangeTechnicalLevel={setTechnicalLevel}
          onSetFogState={handleSetFogState}
          onShowBlastRadius={(nodeId) => {
            setActiveStepId(nodeId);
            setIsBlastMode(true);
          }}
          onOpenSandboxChallenge={() => setIsSandboxOpen(true)}
        />
      </div>

      {/* Pre-Map Setup Modal */}
      <PreMapModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onApplyConfig={handleApplyConfig}
        initialConfig={config}
      />

      {/* Export Mental Model Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        config={config}
        steps={steps}
      />

      {/* Micro-Challenges & Break-It Sandbox Modal */}
      <SandboxChallengeModal
        isOpen={isSandboxOpen}
        onClose={() => setIsSandboxOpen(false)}
        step={activeStep}
        onDefogSuccess={(nodeId) => {
          handleSetFogState(nodeId, 'clear');
        }}
      />
    </div>
  );
}

export default App;
