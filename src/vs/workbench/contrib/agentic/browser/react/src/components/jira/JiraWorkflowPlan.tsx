import React from 'react';
import type { JiraWorkflowPlan } from '../../../../../common/mcp/jiraWorkflowTypes.js';

function PlanSection(props: { title: string; children: React.ReactNode }) {
	return (
		<div className="agentic-jira-plan-block">
			<div className="agentic-jira-plan-block__title">{props.title}</div>
			<div className="agentic-jira-plan-block__body">{props.children}</div>
		</div>
	);
}

function PlanList(props: { items: string[] }) {
	if (!props.items.length) return <span className="agentic-muted">—</span>;
	return (
		<ul className="agentic-jira-plan-list">
			{props.items.map((item, i) => (
				<li key={i}>{item}</li>
			))}
		</ul>
	);
}

export function JiraWorkflowPlanView(props: { plan: JiraWorkflowPlan | null; loading: boolean }) {
	const { plan, loading } = props;
	if (loading) {
		return (
			<section className="agentic-jira-section">
				<h3>Workflow plan</h3>
				<div className="agentic-jira-loading">Generating structured plan…</div>
			</section>
		);
	}
	if (!plan) return null;

	return (
		<section className="agentic-jira-section">
			<h3>Workflow plan</h3>
			<div className="agentic-jira-plan-grid">
				<PlanSection title="Problem understanding">
					<p>{plan.problemUnderstanding}</p>
				</PlanSection>
				<PlanSection title="Scope">
					<PlanList items={plan.scope} />
				</PlanSection>
				<PlanSection title="Affected areas">
					<PlanList items={plan.affectedAreas} />
				</PlanSection>
				<PlanSection title="Likely files">
					<PlanList items={plan.likelyFiles} />
				</PlanSection>
				<PlanSection title="Commands to run">
					<PlanList items={plan.commandsToRun} />
				</PlanSection>
				<PlanSection title="Risks">
					<PlanList items={plan.risks} />
				</PlanSection>
				<PlanSection title="Implementation steps">
					<PlanList items={plan.implementationSteps} />
				</PlanSection>
				<PlanSection title="Validation criteria">
					<PlanList items={plan.validationCriteria} />
				</PlanSection>
				<PlanSection title="Recommended JIRA transition">
					<span className="agentic-pill agentic-pill--accent">{plan.recommendedTransitionStatus}</span>
				</PlanSection>
			</div>
		</section>
	);
}
