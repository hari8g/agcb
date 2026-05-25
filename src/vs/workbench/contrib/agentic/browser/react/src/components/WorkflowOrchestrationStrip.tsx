import React from 'react';
import type { AgentWorkflowPhase, AgentWorkflowSnapshot } from '../../../../common/agentWorkflowOrchestration.js';
import { workflowPhaseLiveTitle } from '../../../../common/agentWorkflowOrchestration.js';
import type { CanonicalWorkflowSnapshot } from '../../../../common/orchestration/canonicalWorkflowTracker.js';
import { canonicalPhaseLabel } from '../../../../common/orchestration/workflowPhases.js';

const LEGACY_PHASE_ORDER: AgentWorkflowPhase[] = [
	'intent_parse',
	'classify',
	'context_graph',
	'plan',
	'analyse',
	'impact',
	'execute',
	'verify',
];

function CanonicalStrip({
	snapshot,
	isRunning,
}: {
	snapshot: CanonicalWorkflowSnapshot;
	isRunning?: boolean;
}) {
	const activePhases = snapshot.phases;
	if (!activePhases.length) {
		return null;
	}
	const current = snapshot.currentPhase;

	return (
		<div className="agentic-workflow-strip agentic-workflow-strip--canonical" role="list" aria-label="Agent workflow pipeline">
			{activePhases.map(phase => {
				const done = snapshot.completedPhases.includes(phase);
				const isCurrent = phase === current && isRunning;
				const state = done ? 'done' : isCurrent ? 'active' : 'pending';
				return (
					<div
						key={phase}
						className={`agentic-workflow-strip__step agentic-workflow-strip__step--${state}`}
						role="listitem"
						title={canonicalPhaseLabel(phase)}
					>
						<span className="agentic-workflow-strip__dot" aria-hidden />
						<span className="agentic-workflow-strip__label">{canonicalPhaseLabel(phase)}</span>
					</div>
				);
			})}
		</div>
	);
}

function LegacyStrip({
	snapshot,
	isRunning,
}: {
	snapshot: AgentWorkflowSnapshot;
	isRunning?: boolean;
}) {
	const activePhases = snapshot.phases.filter(p => LEGACY_PHASE_ORDER.includes(p));
	if (!activePhases.length) {
		return null;
	}
	const current = snapshot.currentPhase;

	return (
		<div className="agentic-workflow-strip" role="list" aria-label="Agent workflow pipeline">
			{activePhases.map(phase => {
				const done = snapshot.completedPhases.includes(phase);
				const isCurrent = phase === current && isRunning;
				const state = done ? 'done' : isCurrent ? 'active' : 'pending';
				return (
					<div
						key={phase}
						className={`agentic-workflow-strip__step agentic-workflow-strip__step--${state}`}
						role="listitem"
						title={workflowPhaseLiveTitle(phase)}
					>
						<span className="agentic-workflow-strip__dot" aria-hidden />
						<span className="agentic-workflow-strip__label">{workflowPhaseLiveTitle(phase)}</span>
					</div>
				);
			})}
		</div>
	);
}

export function WorkflowOrchestrationStrip({
	snapshot,
	canonicalSnapshot,
	isRunning,
}: {
	snapshot?: AgentWorkflowSnapshot | null;
	canonicalSnapshot?: CanonicalWorkflowSnapshot | null;
	isRunning?: boolean;
}) {
	if (canonicalSnapshot?.phases.length) {
		return <CanonicalStrip snapshot={canonicalSnapshot} isRunning={isRunning} />;
	}
	if (!snapshot) {
		return null;
	}
	return <LegacyStrip snapshot={snapshot} isRunning={isRunning} />;
}
