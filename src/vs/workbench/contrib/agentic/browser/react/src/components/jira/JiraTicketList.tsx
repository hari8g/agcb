import React, { useMemo, useState } from 'react';
import type { JiraTicket } from '../../agentic-bundle-types.js';
import { partitionTicketsByOpen } from '../../agentic-bundle-ticketStatus.js';
import { JiraTicketCard } from './JiraTicketCard.js';

export type JiraTicketHighlight = 'all' | 'priority' | 'bugs' | 'stories';

const HIGHLIGHT_FILTERS: { id: JiraTicketHighlight; label: string }[] = [
	{ id: 'all', label: 'All' },
	{ id: 'priority', label: 'High priority' },
	{ id: 'bugs', label: 'Bugs' },
	{ id: 'stories', label: 'Stories' },
];

function matchesHighlight(ticket: JiraTicket, highlight: JiraTicketHighlight): boolean {
	if (highlight === 'all') {
		return true;
	}
	const priority = (ticket.priority ?? '').toLowerCase();
	const issueType = (ticket.issueType ?? '').toLowerCase();
	if (highlight === 'priority') {
		return /high|highest|critical|blocker/.test(priority);
	}
	if (highlight === 'bugs') {
		return /bug|defect/.test(issueType);
	}
	if (highlight === 'stories') {
		return /story|feature|epic/.test(issueType);
	}
	return true;
}

export function JiraTicketList(props: {
	tickets: JiraTicket[];
	openOnly?: boolean;
	onSelectOpen: (key: string) => void;
}) {
	const [highlight, setHighlight] = useState<JiraTicketHighlight>('all');
	const { open } = partitionTicketsByOpen(props.tickets);
	const baseList = props.openOnly ? open : props.tickets;

	const filtered = useMemo(
		() => baseList.filter(t => matchesHighlight(t, highlight)),
		[baseList, highlight],
	);

	const counts = useMemo(() => {
		const tally: Record<JiraTicketHighlight, number> = { all: baseList.length, priority: 0, bugs: 0, stories: 0 };
		for (const t of baseList) {
			if (matchesHighlight(t, 'priority')) {
				tally.priority++;
			}
			if (matchesHighlight(t, 'bugs')) {
				tally.bugs++;
			}
			if (matchesHighlight(t, 'stories')) {
				tally.stories++;
			}
		}
		return tally;
	}, [baseList]);

	if (!baseList.length) {
		return <p className="agentic-jira-panel__empty">No open tickets.</p>;
	}

	return (
		<div className="agentic-jira-list">
			<div className="agentic-highlight-bar" role="toolbar" aria-label="Filter tickets">
				{HIGHLIGHT_FILTERS.map(f => (
					<button
						key={f.id}
						type="button"
						className={`agentic-highlight-btn${highlight === f.id ? ' agentic-highlight-btn--active' : ''}`}
						aria-pressed={highlight === f.id}
						onClick={() => setHighlight(f.id)}
					>
						<span>{f.label}</span>
						<span className="agentic-highlight-btn__count">{counts[f.id]}</span>
					</button>
				))}
			</div>
			{!filtered.length ? (
				<p className="agentic-jira-panel__empty">No tickets match this filter.</p>
			) : (
				<ul className="agentic-jira-panel__list agentic-jira-panel__list--cards">
					{filtered.map(t => (
						<li key={t.key}>
							<JiraTicketCard ticket={t} isOpen onSelect={() => props.onSelectOpen(t.key)} />
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
