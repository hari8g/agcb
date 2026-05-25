/*--------------------------------------------------------------------------------------
 *  Agentic React — open/closed ticket styling (bundled here; do not import ../../../common)
 *--------------------------------------------------------------------------------------*/

import type { JiraTicket } from '../../../../../common/mcp/jiraWorkflowTypes.js';

const CLOSED_STATUS = /^(done|closed|resolved|cancelled|canceled|complete|won'?t\s*do|duplicate|released)\b/i;

function isOpen(ticket: JiraTicket): boolean {
	if (ticket.isOpen !== undefined) {
		return ticket.isOpen;
	}
	const status = (ticket.status ?? '').trim();
	return !status || !CLOSED_STATUS.test(status);
}

export function partitionTicketsByOpen(tickets: JiraTicket[]): { open: JiraTicket[]; closed: JiraTicket[] } {
	const open: JiraTicket[] = [];
	const closed: JiraTicket[] = [];
	for (const t of tickets) {
		const annotated = { ...t, isOpen: isOpen(t) };
		if (annotated.isOpen) {
			open.push(annotated);
		} else {
			closed.push(annotated);
		}
	}
	return { open, closed };
}
