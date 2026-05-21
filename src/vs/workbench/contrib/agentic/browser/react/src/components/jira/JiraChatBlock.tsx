import React from 'react';
import type { JiraChatMessageUi } from '../../../../../common/mcp/jiraWorkflowTypes.js';
import { getChatService } from '../../util/agenticServices.js';
import { JiraTicketCard } from './JiraTicketCard.js';
import { JiraWorkflowPlanView } from './JiraWorkflowPlan.js';
import { JiraWorkflowStream } from './JiraWorkflowStream.js';

export function JiraChatBlock({ ui }: { ui: JiraChatMessageUi }) {
	const chat = getChatService();

	if (ui.error) {
		return (
			<div className="agentic-jira-chat">
				<div className="agentic-jira-error">{ui.error}</div>
				<button
					type="button"
					className="agentic-btn agentic-btn-ghost agentic-btn--sm"
					onClick={() => void chat.refreshJiraTicketsInChat()}
				>
					Retry
				</button>
			</div>
		);
	}

	if (ui.mode === 'list' || (ui.mode === 'detail' && !ui.selectedTicket && ui.tickets.length)) {
		return (
			<div className="agentic-jira-chat">
				<div className="agentic-jira-chat__toolbar">
					<button type="button" className="agentic-btn agentic-btn-ghost agentic-btn--sm" onClick={() => void chat.refreshJiraTicketsInChat()}>
						Refresh
					</button>
				</div>
				{ui.tickets.length === 0 ? (
					<div className="agentic-jira-empty">No open tickets returned. Check MCP connection and JQL permissions.</div>
				) : (
					<div className="agentic-jira-cards agentic-jira-cards--chat">
						{ui.tickets.map(t => (
							<JiraTicketCard
								key={t.key}
								ticket={t}
								selected={ui.selectedTicket?.key === t.key}
								onSelect={() => void chat.pickJiraTicketInChat(t.key)}
							/>
						))}
					</div>
				)}
			</div>
		);
	}

	if (ui.selectedTicket) {
		const t = ui.selectedTicket;
		return (
			<div className="agentic-jira-chat">
				{ui.tickets.length > 1 && (
					<div className="agentic-jira-chat__toolbar">
						<button type="button" className="agentic-btn agentic-btn-ghost agentic-btn--sm" onClick={() => chat.showJiraTicketListInChat()}>
							Back to list
						</button>
					</div>
				)}
				<div className="agentic-jira-detail-card agentic-jira-detail-card--chat">
					<div className="agentic-jira-detail-card__key">{t.key}</div>
					<div className="agentic-jira-detail-card__summary">{t.summary}</div>
					{t.status && <span className="agentic-pill">{t.status}</span>}
					{t.description && (
						<div className="agentic-jira-description">
							<pre>{t.description.slice(0, 2000)}</pre>
						</div>
					)}
				</div>
				<JiraWorkflowPlanView plan={ui.plan} loading={ui.planLoading} />
				{ui.plan && !ui.planLoading && ui.mode !== 'declined' && ui.mode !== 'complete' && !ui.executing && (
					<div className="agentic-jira-decisions">
						<button type="button" className="agentic-btn agentic-btn-primary" onClick={() => void chat.acceptJiraWorkflowInChat()}>
							Accept workflow
						</button>
						<button type="button" className="agentic-btn" onClick={() => void chat.regenerateJiraPlanInChat()}>
							Regenerate plan
						</button>
						<button type="button" className="agentic-btn agentic-btn-ghost" onClick={() => chat.declineJiraWorkflowInChat()}>
							Decline
						</button>
					</div>
				)}
				{ui.events.length > 0 && <JiraWorkflowStream events={ui.events} />}
			</div>
		);
	}

	return null;
}
