/*--------------------------------------------------------------------------------------
 *  Agentic AI — canonical phase snapshot tracking (browser/runtime adapters)
 *--------------------------------------------------------------------------------------*/

import type { AgentWorkflowPhase } from '../agentWorkflowOrchestration.js';
import {
	type CanonicalWorkflowPhase,
	legacyPhaseToCanonical,
} from './workflowPhases.js';

export interface CanonicalWorkflowSnapshot {
	phases: CanonicalWorkflowPhase[];
	completedPhases: CanonicalWorkflowPhase[];
	currentPhase?: CanonicalWorkflowPhase;
	updatedAt: number;
}

export function createCanonicalWorkflowSnapshot(
	phases: CanonicalWorkflowPhase[],
): CanonicalWorkflowSnapshot {
	return {
		phases,
		completedPhases: [],
		currentPhase: phases[0],
		updatedAt: Date.now(),
	};
}

export function markCanonicalPhaseComplete(
	snapshot: CanonicalWorkflowSnapshot,
	phase: CanonicalWorkflowPhase,
): void {
	if (!snapshot.phases.includes(phase)) {
		return;
	}
	if (!snapshot.completedPhases.includes(phase)) {
		snapshot.completedPhases.push(phase);
	}
	snapshot.updatedAt = Date.now();
	const next = snapshot.phases.find(p => !snapshot.completedPhases.includes(p));
	snapshot.currentPhase = next;
}

export function markCanonicalPhasesCompleteThrough(
	snapshot: CanonicalWorkflowSnapshot,
	throughPhase: CanonicalWorkflowPhase,
): void {
	const end = snapshot.phases.indexOf(throughPhase);
	if (end < 0) {
		return;
	}
	for (let i = 0; i <= end; i++) {
		markCanonicalPhaseComplete(snapshot, snapshot.phases[i]!);
	}
}

export function syncCanonicalFromLegacyPhase(
	snapshot: CanonicalWorkflowSnapshot,
	legacyPhase: AgentWorkflowPhase,
): void {
	markCanonicalPhaseComplete(snapshot, legacyPhaseToCanonical(legacyPhase));
}

export function bootstrapCanonicalSnapshotAfterPreflight(
	phases: CanonicalWorkflowPhase[],
	opts?: {
		hasPlan?: boolean;
		hasImpact?: boolean;
		approvalPending?: boolean;
	},
): CanonicalWorkflowSnapshot {
	const snap = createCanonicalWorkflowSnapshot(phases);
	markCanonicalPhasesCompleteThrough(snap, 'collect_context');
	if (opts?.hasPlan && phases.includes('plan')) {
		markCanonicalPhasesCompleteThrough(snap, 'plan');
	}
	if (opts?.hasImpact && phases.includes('analyse_impact')) {
		markCanonicalPhasesCompleteThrough(snap, 'analyse_impact');
	}
	if (opts?.approvalPending && phases.includes('approval_gate')) {
		snap.currentPhase = 'approval_gate';
	} else if (snap.currentPhase === 'approval_gate' || !snap.currentPhase) {
		const executeIdx = phases.indexOf('execute');
		snap.currentPhase = executeIdx >= 0 ? 'execute' : snap.currentPhase;
	}
	return snap;
}
