import React from 'react';
import type { JiraChatMessageUi } from '../../../../../common/mcp/jiraWorkflowTypes.js';

type WorkflowStep = 'list' | 'ticket' | 'planning' | 'review' | 'running' | 'done' | 'declined';

function resolveStep(ui: JiraChatMessageUi): WorkflowStep {
	if (ui.mode === 'declined') {
		return 'declined';
	}
	if (ui.mode === 'complete') {
		return 'done';
	}
	if (ui.executing || ui.mode === 'executing') {
		return 'running';
	}
	if (ui.plan && !ui.planLoading) {
		return 'review';
	}
	if (ui.planLoading) {
		return 'planning';
	}
	if (ui.selectedTicket) {
		return 'ticket';
	}
	return 'list';
}

const LABELS: Record<WorkflowStep, string> = {
	list: 'Tickets',
	ticket: 'Ticket',
	planning: 'Plan',
	review: 'Review',
	running: 'Run',
	done: 'Done',
	declined: 'Declined',
};

const ORDER: WorkflowStep[] = ['ticket', 'planning', 'review', 'running', 'done'];

export function JiraWorkflowStatus({ ui }: { ui: JiraChatMessageUi }) {
	const step = resolveStep(ui);

	if (step === 'list') {
		return (
			<div className="agentic-jira-stepper agentic-jira-stepper--list" role="status">
				<span className="agentic-jira-stepper__badge">JIRA workspace</span>
				<span className="agentic-jira-stepper__hint">Select an open ticket</span>
			</div>
		);
	}

	if (step === 'declined') {
		return (
			<div className="agentic-jira-stepper agentic-jira-stepper--declined" role="status">
				<span className="agentic-jira-stepper__badge">JIRA workspace</span>
				<span className="agentic-jira-stepper__hint">{LABELS.declined}</span>
			</div>
		);
	}

	const activeIdx = ORDER.indexOf(step);
	const steps = step === 'done' ? ORDER : ORDER.filter(s => s !== 'done');

	return (
		<nav className="agentic-jira-stepper" aria-label="Workflow progress">
			<span className="agentic-jira-stepper__badge">JIRA workspace</span>
			<ol className="agentic-jira-stepper__track">
				{steps.map((s, i) => {
					const idx = ORDER.indexOf(s);
					const state = step === 'done'
						? 'done'
						: idx < activeIdx
							? 'done'
							: idx === activeIdx
								? 'active'
								: 'pending';
					return (
						<li
							key={s}
							className={`agentic-jira-stepper__item agentic-jira-stepper__item--${state}`}
							aria-current={state === 'active' ? 'step' : undefined}
						>
							<span className="agentic-jira-stepper__dot" aria-hidden />
							<span className="agentic-jira-stepper__label">{LABELS[s]}</span>
							{i < steps.length - 1 && <span className="agentic-jira-stepper__connector" aria-hidden />}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
