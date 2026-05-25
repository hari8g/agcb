/*--------------------------------------------------------------------------------------
 *  Agentic AI — open vs closed JIRA ticket classification
 *--------------------------------------------------------------------------------------*/

import type { JiraTicket } from './jiraWorkflowTypes.js';

const CLOSED_STATUS = /^(done|closed|resolved|cancelled|canceled|complete|won'?t\s*do|duplicate|released)\b/i;

export function isJiraTicketOpen(ticket: JiraTicket): boolean {
	if (ticket.isOpen !== undefined) {
		return ticket.isOpen;
	}
	const status = (ticket.status ?? '').trim();
	if (!status) {
		return true;
	}
	return !CLOSED_STATUS.test(status);
}

export function annotateTicketOpenState(tickets: JiraTicket[]): JiraTicket[] {
	return tickets.map(t => ({ ...t, isOpen: isJiraTicketOpen(t) }));
}

export function partitionTicketsByOpen(tickets: JiraTicket[]): { open: JiraTicket[]; closed: JiraTicket[] } {
	const annotated = annotateTicketOpenState(tickets);
	return {
		open: annotated.filter(t => t.isOpen),
		closed: annotated.filter(t => !t.isOpen),
	};
}
