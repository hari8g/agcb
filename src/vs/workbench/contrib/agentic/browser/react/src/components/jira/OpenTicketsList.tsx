import React from 'react';
import { JiraTicketCard } from './JiraTicketCard.js';
import type { JiraTicket } from '../../../../../common/mcp/jiraWorkflowTypes.js';

export function OpenTicketsList(props: {
	tickets: JiraTicket[];
	selectedKey: string | null;
	loading: boolean;
	error: string | null;
	onRefresh: () => void;
	onSelect: (t: JiraTicket) => void;
}) {
	const { tickets, selectedKey, loading, error, onRefresh, onSelect } = props;

	return (
		<section className="agentic-jira-section">
			<div className="agentic-jira-section__head">
				<h3>Open tickets</h3>
				<button
					type="button"
					className="agentic-btn agentic-btn-ghost"
					disabled={loading}
					onClick={onRefresh}
				>
					{loading ? 'Refreshing…' : 'Refresh open tickets'}
				</button>
			</div>
			{error && <div className="agentic-jira-error">{error}</div>}
			{!loading && !error && tickets.length === 0 && (
				<div className="agentic-jira-empty">No open tickets found. Try refresh or check MCP config.</div>
			)}
			<div className="agentic-jira-cards">
				{tickets.map(t => (
					<JiraTicketCard
						key={t.key}
						ticket={t}
						selected={selectedKey === t.key}
						onSelect={() => onSelect(t)}
					/>
				))}
			</div>
		</section>
	);
}
