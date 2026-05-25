import React, { useState } from 'react';
import type { WorkflowRunPlan } from '../../../../common/orchestration/workflowRunPlanner.js';
import type { AgentWorkflowSnapshot } from '../../../../common/agentWorkflowOrchestration.js';

const BLAST_LABEL: Record<WorkflowRunPlan['blastRadius']['level'], string> = {
	low: 'Low blast radius',
	medium: 'Medium blast radius',
	high: 'High blast radius',
};

export function WorkflowRunPlanPanel({
	plan,
	snapshot,
	isRunning,
}: {
	plan?: WorkflowRunPlan | null;
	snapshot?: AgentWorkflowSnapshot | null;
	isRunning?: boolean;
}) {
	const [expanded, setExpanded] = useState(isRunning ?? false);

	if (!plan && !snapshot?.plan && !snapshot?.analysis && !snapshot?.impact) {
		return null;
	}

	const steps = plan?.steps ?? snapshot?.plan?.steps ?? [];
	const blast = plan?.blastRadius;
	const verify = plan?.verificationStrategy;

	return (
		<section className="agentic-run-plan" aria-label="Run plan">
			<button
				type="button"
				className="agentic-run-plan__toggle"
				onClick={() => setExpanded(e => !e)}
				aria-expanded={expanded}
			>
				<span className="agentic-run-plan__title">
					{plan?.intent.intent ? `Plan: ${plan.intent.intent.replace(/_/g, ' ')}` : 'Run plan'}
				</span>
				{blast && (
					<span className={`agentic-run-plan__blast agentic-run-plan__blast--${blast.level}`}>
						{BLAST_LABEL[blast.level]}
					</span>
				)}
				<span className="agentic-run-plan__chevron">{expanded ? '▾' : '▸'}</span>
			</button>
			{expanded && (
				<div className="agentic-run-plan__body">
					{snapshot?.plan?.goal && (
						<p className="agentic-run-plan__goal">{snapshot.plan.goal}</p>
					)}
					{steps.length > 0 && (
						<ol className="agentic-run-plan__steps">
							{steps.map(step => (
								<li key={step.id} className={`agentic-run-plan__step agentic-run-plan__step--${step.kind}`}>
									<span className="agentic-run-plan__step-kind">{step.kind}</span>
									{step.title}
								</li>
							))}
						</ol>
					)}
					{snapshot?.analysis?.summary && (
						<div className="agentic-run-plan__section">
							<strong>Analysis</strong>
							<p>{snapshot.analysis.summary}</p>
						</div>
					)}
					{snapshot?.impact?.blastRadiusSummary && (
						<div className="agentic-run-plan__section">
							<strong>Impact</strong>
							<p>{snapshot.impact.blastRadiusSummary}</p>
						</div>
					)}
					{blast?.summary && (
						<p className="agentic-run-plan__blast-summary">{blast.summary}</p>
					)}
					{verify && (verify.runLint || verify.runTests || verify.suggestedCommands.length > 0) && (
						<div className="agentic-run-plan__verify">
							<strong>Verify</strong>
							{verify.runLint && <span className="agentic-run-plan__tag">lint</span>}
							{verify.runTests && <span className="agentic-run-plan__tag">tests</span>}
							{verify.suggestedCommands.map(cmd => (
								<code key={cmd} className="agentic-run-plan__cmd">{cmd}</code>
							))}
						</div>
					)}
				</div>
			)}
		</section>
	);
}
