export type FogState = 'foggy' | 'fuzzy' | 'clear';

export type NodeType = 'component' | 'hook' | 'route' | 'service' | 'db';

export interface MentalModelDepth {
  trigger: string;
  mutation: string;
  sideEffects: string;
  summary: string;
  technicalDetails?: string[];
}

export interface NodeMentalModel {
  L1: MentalModelDepth; // Vibe Mode: Architecture & High-level purpose
  L2: MentalModelDepth; // Builder Mode: Data flow, state hooks, API payloads
  L3: MentalModelDepth; // Deep Dive: Syntax, closures, types, edge cases
}

export interface ExecutionStepData {
  id: string;
  stepIndex: number;
  label: string;
  file: string;
  symbol: string;
  nodeType: NodeType;
  fogState: FogState;
  shortSummary: string;
  activeFunctionCode: string;
  fullCode: string;
  targetLineRange: { start: number; end: number };
  mentalModel: NodeMentalModel;
  blastRadius: {
    affectedIds: string[];
    riskScore: 'low' | 'medium' | 'high';
    description: string;
  };
  debtRadar?: {
    hasSlop: boolean;
    issues: string[];
  };
}

export type GoalPreset = 'trace' | 'bug' | 'edit' | 'slop';

export interface GoalSetupConfig {
  goal: GoalPreset;
  target: string;
  targetMode: 'route' | 'prompt' | 'file' | 'commit';
  technicalLevel: 'L1' | 'L2' | 'L3';
  hopRadius: number;
}
