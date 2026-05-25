import React from 'react';
import type { JiraChatMessageUi } from '../../../../../common/mcp/jiraWorkflowTypes.js';
import { getChatService } from '../../util/agenticServices.js';
import { JiraTicketList } from './JiraTicketList.js';
import { JiraWorkflowPlanView } from './JiraWorkflowPlan.js';

function JiraActions(props: {
	canRun: boolean;
	isRunning: boolean;
	onRun: () => void;
	onCancel: () => void;
}) {
	if (props.isRunning || !props.canRun) {
		return null;
	}
	return (
		<div className="agentic-jira-panel__actions">
			<button type="button" className="agentic-btn agentic-btn-primary" onClick={props.onRun}>
				Run
			</button>
			<button type="button" className="agentic-btn agentic-btn-ghost" onClick={props.onCancel}>
				Cancel
			</button>
		</div>
	);
}

export function JiraChatBlock({ ui }: { ui: JiraChatMessageUi }) {
	const chat = getChatService();
	const canRun = !!(ui.plan && !ui.planLoading && ui.mode === 'detail' && !ui.executing && ui.selectedTicket);
	const isRunning = ui.executing || ui.mode === 'executing';

	if (ui.error) {
		return (
			<div className="agentic-jira-panel agentic-jira-panel--error">
				<p className="agentic-jira-panel__error">{ui.error}</p>
				<button type="button" className="agentic-btn agentic-btn-ghost agentic-btn--sm" onClick={() => void chat.refreshJiraTicketsInChat()}>
					Retry
				</button>
			</div>
		);
	}

	if (ui.mode === 'list' || (ui.mode === 'detail' && !ui.selectedTicket && ui.tickets.length)) {
		return (
			<div className="agentic-jira-panel">
				<div className="agentic-jira-panel__head">
					<span className="agentic-jira-panel__title">Open tickets</span>
					<button
						type="button"
						className="agentic-btn agentic-btn-ghost agentic-btn--sm"
						title="Refresh"
						onClick={() => void chat.refreshJiraTicketsInChat()}
					>
						Refresh
					</button>
				</div>
				<div className="agentic-jira-panel__body">
					<JiraTicketList
						tickets={ui.tickets}
						openOnly
						onSelectOpen={key => void chat.pickJiraTicketInChat(key)}
					/>
				</div>
			</div>
		);
	}

	if (ui.selectedTicket) {
		const t = ui.selectedTicket;
		return (
			<div className="agentic-jira-panel">
				<div className="agentic-jira-panel__head">
					<button type="button" className="agentic-jira-panel__back" onClick={() => chat.showJiraTicketListInChat()}>
						← Tickets
					</button>
				</div>
				<div className="agentic-jira-panel__body">
					<div className="agentic-jira-panel__ticket">
						<span className="agentic-jira-panel__key">{t.key}</span>
						<span className="agentic-jira-panel__summary">{t.summary}</span>
					</div>
					{ui.planLoading && <p className="agentic-jira-panel__status">Planning…</p>}
					{!ui.planLoading && ui.plan && <JiraWorkflowPlanView plan={ui.plan} loading={false} minimal />}
					{isRunning && <p className="agentic-jira-panel__status">Running — check the editor for changes</p>}
					{ui.mode === 'complete' && <p className="agentic-jira-panel__status agentic-jira-panel__status--ok">Done</p>}
					{ui.mode === 'stalled' && (
						<p className="agentic-jira-panel__status agentic-jira-panel__status--warn">
							Stopped without tools — use Continue with tools in the Composer JIRA panel.
						</p>
					)}
					{ui.mode === 'declined' && <p className="agentic-jira-panel__status">Cancelled</p>}
					<JiraActions
						canRun={canRun}
						isRunning={isRunning}
						onRun={() => void chat.acceptJiraWorkflowInChat()}
						onCancel={() => chat.declineJiraWorkflowInChat()}
					/>
				</div>
			</div>
		);
	}

	return null;
}
