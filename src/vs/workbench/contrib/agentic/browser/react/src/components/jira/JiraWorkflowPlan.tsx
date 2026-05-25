import React from 'react';
import type { JiraWorkflowPlan } from '../../agentic-bundle-types.js';

function PlanBlock(props: { title: string; children: React.ReactNode }) {
	return (
		<div className="agentic-jira-plan-block">
			<div className="agentic-jira-plan-block__title">{props.title}</div>
			{props.children}
		</div>
	);
}

function PlanList(props: { items: string[]; max?: number }) {
	const items = props.max ? props.items.slice(0, props.max) : props.items;
	if (!items.length) {
		return <p className="agentic-jira-panel__muted">—</p>;
	}
	return (
		<ul className="agentic-jira-plan-list">
			{items.map((item, i) => (
				<li key={i}>{item}</li>
			))}
		</ul>
	);
}

export function JiraWorkflowPlanView(props: {
	plan: JiraWorkflowPlan | null;
	loading: boolean;
	minimal?: boolean;
}) {
	const { plan, loading, minimal } = props;
	if (loading || !plan) {
		return null;
	}

	if (minimal) {
		return (
			<ol className="agentic-jira-panel__steps">
				{plan.implementationSteps.slice(0, 6).map((step, i) => (
					<li key={i}>{step}</li>
				))}
			</ol>
		);
	}

	return (
		<section className="agentic-jira-section">
			<h3>Plan</h3>
			<p className="agentic-jira-plan-compact__summary">{plan.problemUnderstanding}</p>
			<div className="agentic-jira-plan-grid">
				<PlanBlock title="Scope">
					<PlanList items={plan.scope} />
				</PlanBlock>
				<PlanBlock title="Likely files">
					<PlanList items={plan.likelyFiles} max={12} />
				</PlanBlock>
				<PlanBlock title="Implementation steps">
					<PlanList items={plan.implementationSteps} />
				</PlanBlock>
				<PlanBlock title="Commands to run">
					<PlanList items={plan.commandsToRun} />
				</PlanBlock>
				{plan.risks.length > 0 && (
					<PlanBlock title="Risks">
						<PlanList items={plan.risks} />
					</PlanBlock>
				)}
				<PlanBlock title="Validation">
					<PlanList items={plan.validationCriteria} />
				</PlanBlock>
			</div>
			<p className="agentic-jira-panel__muted">
				Target status: <strong>{plan.recommendedTransitionStatus}</strong>
			</p>
		</section>
	);
}
