import { BackendExecutionTrace, BackendNodeMetadata } from '../api/client';
import { ExecutionStepData, NodeType, FogState } from '../types';

export function mapNodeKindToType(kind: string): NodeType {
  switch (kind) {
    case 'component':
      return 'component';
    case 'hook':
      return 'hook';
    case 'route_handler':
    case 'page_route':
      return 'route';
    case 'store':
      return 'service';
    case 'db':
      return 'db';
    default:
      return 'service';
  }
}

export function adaptBackendTraceToSteps(
  trace: BackendExecutionTrace,
  fileContents: Record<string, string> = {}
): ExecutionStepData[] {
  const nodeMap = new Map<string, BackendNodeMetadata>();
  for (const n of trace.nodes) {
    nodeMap.set(n.id, n);
  }

  return trace.steps.map((step, idx) => {
    const node = nodeMap.get(step.node_id);
    const nodeType = mapNodeKindToType(node?.kind || '');
    const fogState: FogState = node?.fog_state || 'foggy';
    const filePath = step.file_path || node?.file_path || '';
    const snippet = step.code_snippet || node?.code_snippet || '';
    const fullCode = fileContents[filePath] || snippet || '// Code preview loading...';
    
    const trigger = step.trigger || node?.trigger || 'Triggered by user interaction or upstream call.';
    const mutation = step.mutation || node?.mutation || 'Performs state mutation or data transformation.';
    const sideEffects = step.side_effects || node?.side_effects || 'Dispatches network requests or writes.';
    const summary = step.description || node?.description || step.action;

    const visualFlow = {
      inputBadge: nodeType === 'component' ? 'User Event' : nodeType === 'route' ? 'HTTP Request' : nodeType === 'db' ? 'SQL Payload' : 'Input Arguments',
      inputDetails: `${step.label} incoming parameters`,
      processSteps: [
        `Triggered: ${step.action}`,
        `Execute ${step.label} internal logic`,
        `Resolve outputs and side-effects`
      ],
      outputBadge: nodeType === 'route' ? 'HTTP Response' : nodeType === 'db' ? 'Committed Record' : 'State / Output Result',
      outputDetails: sideEffects,
      edgePayload: nodeType === 'component' ? 'User Action' : nodeType === 'hook' ? 'State Payload' : nodeType === 'route' ? 'API Payload' : 'Data Object',
      stateDiff: {
        variable: step.label.toLowerCase(),
        before: 'initial',
        after: 'updated',
      },
    };

    return {
      id: step.node_id,
      stepIndex: step.step_number || idx + 1,
      label: step.label || node?.label || `Step ${idx + 1}`,
      file: filePath,
      symbol: node?.label || step.label,
      nodeType,
      fogState,
      shortSummary: summary,
      activeFunctionCode: snippet,
      fullCode,
      targetLineRange: {
        start: node?.line_start || 1,
        end: node?.line_end || (snippet ? snippet.split('\n').length : 20),
      },
      visualFlow,
      mentalModel: {
        L1: {
          trigger,
          mutation,
          sideEffects,
          summary,
        },
        L2: {
          trigger: `${trigger} (Parameters and events extracted)`,
          mutation: `${mutation} (State update and reactivity triggered)`,
          sideEffects: `${sideEffects} (Network/IO dispatched)`,
          summary,
          technicalDetails: [
            `Line range: ${node?.line_start || 1} - ${node?.line_end || 20}`,
            `Action: ${step.action}`,
          ],
        },
        L3: {
          trigger: `${trigger} (Callsite boundary)`,
          mutation: `${mutation} (Heap/stack state updates)`,
          sideEffects: `${sideEffects} (Runtime boundary)`,
          summary,
          technicalDetails: [
            `Node ID: ${step.node_id}`,
            `Kind: ${node?.kind || 'unknown'}`,
          ],
        },
      },
      blastRadius: {
        affectedIds: [],
        riskScore: 'medium',
        description: 'Downstream dependents affected if this component or contract changes.',
      },
      debtRadar: {
        hasSlop: false,
        issues: [],
      },
    };
  });
}
