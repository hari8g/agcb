import React from 'react';
import type { JiraTicket } from '../../../../../common/mcp/jiraWorkflowTypes.js';

export function JiraTicketCard(props: {
	ticket: JiraTicket;
	selected: boolean;
	onSelect: () => void;
}) {
	const { ticket, selected, onSelect } = props;
	return (
		<button
			type="button"
			className={`agentic-jira-card${selected ? ' agentic-jira-card--selected' : ''}`}
			onClick={onSelect}
		>
			<div className="agentic-jira-card__key">{ticket.key}</div>
			<div className="agentic-jira-card__summary">{ticket.summary}</div>
			<div className="agentic-jira-card__meta">
				{ticket.status && <span className="agentic-pill">{ticket.status}</span>}
				{ticket.priority && <span className="agentic-pill agentic-pill--muted">{ticket.priority}</span>}
				{ticket.issueType && <span className="agentic-pill agentic-pill--muted">{ticket.issueType}</span>}
			</div>
			{(ticket.assignee || ticket.updated) && (
				<div className="agentic-jira-card__footer">
					{ticket.assignee && <span>{ticket.assignee}</span>}
					{ticket.updated && <span className="agentic-jira-card__date">{ticket.updated}</span>}
				</div>
			)}
		</button>
	);
}
