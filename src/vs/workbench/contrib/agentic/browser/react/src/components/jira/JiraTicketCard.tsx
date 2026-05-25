import React from 'react';
import type { JiraTicket } from '../../agentic-bundle-types.js';

function priorityClass(priority?: string): string {
	const p = (priority ?? '').toLowerCase();
	if (/high|highest|critical|blocker/.test(p)) {
		return 'agentic-pill--priority-high';
	}
	if (/low|lowest|minor/.test(p)) {
		return 'agentic-pill--priority-low';
	}
	return 'agentic-pill--muted';
}

export function JiraTicketCard(props: {
	ticket: JiraTicket;
	isOpen: boolean;
	onSelect: () => void;
}) {
	const { ticket, isOpen, onSelect } = props;

	if (!isOpen) {
		return (
			<div className="agentic-jira-card agentic-jira-card--closed">
				<div className="agentic-jira-card__row">
					<span className="agentic-jira-card__key">{ticket.key}</span>
					<span className="agentic-jira-card__summary">{ticket.summary}</span>
				</div>
			</div>
		);
	}

	return (
		<button type="button" className="agentic-jira-card agentic-jira-card--open" onClick={onSelect}>
			<div className="agentic-jira-card__row">
				<span className="agentic-jira-card__key">{ticket.key}</span>
				{ticket.status && <span className="agentic-pill agentic-pill--status">{ticket.status}</span>}
			</div>
			<div className="agentic-jira-card__summary">{ticket.summary}</div>
			{(ticket.priority || ticket.issueType || ticket.assignee) && (
				<div className="agentic-jira-card__meta">
					{ticket.priority && (
						<span className={`agentic-pill ${priorityClass(ticket.priority)}`}>{ticket.priority}</span>
					)}
					{ticket.issueType && <span className="agentic-pill agentic-pill--type">{ticket.issueType}</span>}
					{ticket.assignee && <span className="agentic-jira-card__assignee">{ticket.assignee}</span>}
				</div>
			)}
			<span className="agentic-jira-card__cta" aria-hidden>
				Open →
			</span>
		</button>
	);
}
