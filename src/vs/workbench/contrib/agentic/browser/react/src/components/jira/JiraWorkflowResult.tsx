import React from 'react';
import type { JiraChatMessageUi } from '../../agentic-bundle-types.js';
import { getChatService } from '../../util/agenticServices.js';
import { WorkflowSummaryPanel } from '../WorkflowSummaryPanel.js';

export function JiraWorkflowResult({ ui }: { ui: JiraChatMessageUi }) {
	const latest = ui.events.length > 0 ? ui.events[ui.events.length - 1] : null;
	const chat = getChatService();
	const summary = ui.agentExecutionSummary;

	if (ui.mode === 'declined') {
		return (
			<div className="agentic-jira-outcome agentic-jira-outcome--muted">
				Workflow cancelled — no changes applied.
			</div>
		);
	}

	if (ui.executing || ui.mode === 'executing') {
		return (
			<div className="agentic-jira-outcome agentic-jira-outcome--running">
				<span className="agentic-jira-outcome__spinner" aria-hidden />
				<div>
					<div className="agentic-jira-outcome__title">Running workflow</div>
					<div className="agentic-jira-outcome__detail">
						{latest?.message ?? 'Agent is implementing the plan in the main editor.'}
					</div>
				</div>
			</div>
		);
	}

	if (ui.mode === 'stalled' && summary) {
		return (
			<div className="agentic-jira-outcome agentic-jira-outcome--stalled">
				<div className="agentic-jira-outcome__title">Stopped — no tools run</div>
				<div className="agentic-jira-outcome__detail">
					JIRA was not updated. Continue with tools to resume the agent, then run the workflow again.
				</div>
				<WorkflowSummaryPanel summary={summary} />
				<div className="agentic-jira-outcome__actions">
					<button
						type="button"
						className="agentic-btn agentic-btn-primary agentic-btn--sm"
						onClick={() => void chat.continueAfterStall()}
					>
						Continue with tools
					</button>
					<button
						type="button"
						className="agentic-btn agentic-btn-ghost agentic-btn--sm"
						onClick={() => void chat.acceptJiraWorkflowInChat()}
					>
						Re-run workflow
					</button>
				</div>
			</div>
		);
	}

	if (ui.mode !== 'complete' && ui.mode !== 'stalled') {
		return null;
	}

	const key = ui.selectedTicket?.key ?? 'ticket';
	const status = ui.selectedTicket?.status;
	const stalled = ui.agentRunStalled;

	return (
		<div className={`agentic-jira-outcome${stalled ? ' agentic-jira-outcome--stalled' : ' agentic-jira-outcome--success'}`}>
			<div className="agentic-jira-outcome__title">
				{stalled ? 'Incomplete' : 'Complete'} — {key}
			</div>
			{status && (
				<div className="agentic-jira-outcome__detail">
					JIRA status: <strong>{status}</strong>
				</div>
			)}
			{latest && <div className="agentic-jira-outcome__detail">{latest.message}</div>}
			{summary && <WorkflowSummaryPanel summary={summary} />}
			{stalled && (
				<div className="agentic-jira-outcome__actions">
					<button
						type="button"
						className="agentic-btn agentic-btn-primary agentic-btn--sm"
						onClick={() => void chat.continueAfterStall()}
					>
						Continue with tools
					</button>
				</div>
			)}
		</div>
	);
}
