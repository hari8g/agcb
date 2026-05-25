/*--------------------------------------------------------------------------------------
 *  Agentic AI — canonical 11-phase workflow model
 *--------------------------------------------------------------------------------------*/

import type { AgentWorkflowPhase } from '../agentWorkflowOrchestration.js';

/** Production workflow phases (single source of truth). */
export type CanonicalWorkflowPhase =
	| 'understand'
	| 'classify'
	| 'collect_context'
	| 'build_knowledge_graph'
	| 'plan'
	| 'analyse_impact'
	| 'approval_gate'
	| 'execute'
	| 'verify'
	| 'repair_once'
	| 'summarize';

export const CANONICAL_PHASE_ORDER: CanonicalWorkflowPhase[] = [
	'understand',
	'classify',
	'collect_context',
	'build_knowledge_graph',
	'plan',
	'analyse_impact',
	'approval_gate',
	'execute',
	'verify',
	'repair_once',
	'summarize',
];

export function canonicalPhaseLabel(phase: CanonicalWorkflowPhase): string {
	switch (phase) {
		case 'understand': return 'Understand';
		case 'classify': return 'Classify';
		case 'collect_context': return 'Collect context';
		case 'build_knowledge_graph': return 'Knowledge graph';
		case 'plan': return 'Plan';
		case 'analyse_impact': return 'Analyse impact';
		case 'approval_gate': return 'Approval';
		case 'execute': return 'Execute';
		case 'verify': return 'Verify';
		case 'repair_once': return 'Repair';
		case 'summarize': return 'Summarize';
	}
}

/** Map legacy preflight phases → canonical (for UI strip compatibility). */
export function legacyPhaseToCanonical(phase: AgentWorkflowPhase): CanonicalWorkflowPhase {
	switch (phase) {
		case 'intent_parse': return 'understand';
		case 'classify': return 'classify';
		case 'context_graph': return 'collect_context';
		case 'plan': return 'plan';
		case 'analyse': return 'analyse_impact';
		case 'impact': return 'analyse_impact';
		case 'execute': return 'execute';
		case 'verify': return 'verify';
	}
}

export function selectCanonicalPhases(opts: {
	needsContextGraph: boolean;
	needsPlan: boolean;
	needsImpact: boolean;
	needsApproval: boolean;
	needsVerify: boolean;
}): CanonicalWorkflowPhase[] {
	const phases: CanonicalWorkflowPhase[] = ['understand', 'classify', 'collect_context'];
	if (opts.needsContextGraph) {
		phases.push('build_knowledge_graph');
	}
	if (opts.needsPlan) {
		phases.push('plan');
	}
	if (opts.needsImpact) {
		phases.push('analyse_impact');
	}
	if (opts.needsApproval) {
		phases.push('approval_gate');
	}
	phases.push('execute');
	if (opts.needsVerify) {
		phases.push('verify', 'repair_once');
	}
	phases.push('summarize');
	return phases;
}
