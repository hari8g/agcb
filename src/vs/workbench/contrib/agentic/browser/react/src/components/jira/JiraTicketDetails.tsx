import React from 'react';
import type { JiraTicket } from '../../../../../common/mcp/jiraWorkflowTypes.js';

export function JiraTicketDetails(props: { ticket: JiraTicket | null; loading: boolean }) {
	const { ticket, loading } = props;
	if (!ticket) return null;

	return (
		<section className="agentic-jira-section">
			<h3>Selected ticket</h3>
			{loading && <div className="agentic-jira-loading">Loading ticket details…</div>}
			<div className="agentic-jira-detail-card">
				<div className="agentic-jira-detail-card__key">{ticket.key}</div>
				<div className="agentic-jira-detail-card__summary">{ticket.summary}</div>
				<dl className="agentic-jira-dl">
					{ticket.status && (
						<>
							<dt>Status</dt>
							<dd><span className="agentic-pill">{ticket.status}</span></dd>
						</>
					)}
					{ticket.priority && (
						<>
							<dt>Priority</dt>
							<dd>{ticket.priority}</dd>
						</>
					)}
					{ticket.issueType && (
						<>
							<dt>Type</dt>
							<dd>{ticket.issueType}</dd>
						</>
					)}
					{ticket.assignee && (
						<>
							<dt>Assignee</dt>
							<dd>{ticket.assignee}</dd>
						</>
					)}
					{ticket.project && (
						<>
							<dt>Project</dt>
							<dd>{ticket.project}</dd>
						</>
					)}
					{ticket.labels?.length ? (
						<>
							<dt>Labels</dt>
							<dd>{ticket.labels.join(', ')}</dd>
						</>
					) : null}
					{ticket.components?.length ? (
						<>
							<dt>Components</dt>
							<dd>{ticket.components.join(', ')}</dd>
						</>
					) : null}
				</dl>
				{ticket.description && (
					<div className="agentic-jira-description">
						<div className="agentic-jira-description__label">Description</div>
						<pre>{ticket.description.slice(0, 4000)}</pre>
					</div>
				)}
			</div>
		</section>
	);
}
