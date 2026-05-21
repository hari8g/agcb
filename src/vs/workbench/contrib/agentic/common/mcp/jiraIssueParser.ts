/*--------------------------------------------------------------------------------------
 *  Agentic AI — parse Atlassian MCP JIRA JSON into structured tickets
 *--------------------------------------------------------------------------------------*/

import type { JiraIssueContext } from './jiraTypes.js';
import type { JiraTicket } from './jiraWorkflowTypes.js';

function fieldName(v: unknown): string | undefined {
	if (v == null) return undefined;
	if (typeof v === 'string') return v;
	if (typeof v === 'object' && v !== null && 'name' in v) {
		return String((v as { name: unknown }).name);
	}
	return String(v);
}

function fieldText(v: unknown): string | undefined {
	if (v == null) return undefined;
	if (typeof v === 'string') return v;
	if (typeof v === 'object' && v !== null) {
		if ('content' in v && Array.isArray((v as { content: unknown }).content)) {
			return extractAdfText((v as { content: unknown[] }).content);
		}
	}
	return undefined;
}

function extractAdfText(nodes: unknown[]): string {
	const parts: string[] = [];
	for (const n of nodes) {
		if (typeof n !== 'object' || n === null) continue;
		const node = n as Record<string, unknown>;
		if (node.type === 'text' && typeof node.text === 'string') {
			parts.push(node.text);
		}
		if (Array.isArray(node.content)) {
			parts.push(extractAdfText(node.content));
		}
	}
	return parts.join('');
}

/** Parse a single issue from getJiraIssue / Teamwork Graph MCP JSON text. */
export function parseJiraTicketFromMcpText(text: string, issueKey: string): JiraTicket {
	const ctx = parseIssueContextFromMcpText(text, issueKey);
	return contextToTicket(ctx);
}

export function parseIssueContextFromMcpText(text: string, issueKey: string): JiraIssueContext {
	const ctx: JiraIssueContext = {
		issueKey: issueKey.toUpperCase(),
		rawText: text,
		fetchedAt: Date.now(),
	};
	try {
		const json = JSON.parse(text) as Record<string, unknown>;
		if (json.error === true && typeof json.message === 'string') {
			ctx.rawText = json.message;
			return ctx;
		}
		const fields = (json.fields ?? json) as Record<string, unknown>;
		ctx.summary = fieldName(json.summary ?? fields.summary);
		ctx.description = fieldText(fields.description) ?? fieldName(fields.description);
		ctx.status = fieldName(fields.status ?? json.status);
		ctx.issueType = fieldName(fields.issuetype ?? fields.issueType ?? json.issueType);
		ctx.assignee = fieldName(
			(fields.assignee as Record<string, unknown>)?.displayName ?? fields.assignee,
		);
		if (Array.isArray(fields.labels)) {
			ctx.labels = fields.labels.map(String);
		}
	} catch {
		const summaryMatch = text.match(/summary[:\s]+(.+)/i);
		if (summaryMatch) {
			ctx.summary = summaryMatch[1].trim();
		}
	}
	return ctx;
}

export function contextToTicket(ctx: JiraIssueContext): JiraTicket {
	const project = ctx.issueKey.includes('-') ? ctx.issueKey.split('-')[0] : undefined;
	return {
		key: ctx.issueKey,
		summary: ctx.summary ?? ctx.issueKey,
		description: ctx.description,
		status: ctx.status,
		assignee: ctx.assignee,
		issueType: ctx.issueType,
		project,
		labels: ctx.labels,
	};
}

/** Parse searchJiraIssuesUsingJql MCP response into ticket cards. */
export function parseJiraSearchResults(text: string): JiraTicket[] {
	try {
		const json = JSON.parse(text) as Record<string, unknown>;
		const issues = (json.issues ?? json.results ?? json.values) as unknown[] | undefined;
		if (!Array.isArray(issues)) {
			return [];
		}
		const tickets: JiraTicket[] = [];
		for (const item of issues) {
			if (typeof item !== 'object' || item === null) {
				continue;
			}
			const issue = item as Record<string, unknown>;
			const key = String(issue.key ?? '');
			if (!key) {
				continue;
			}
			const fields = (issue.fields ?? {}) as Record<string, unknown>;
			tickets.push({
				key,
				summary: fieldName(fields.summary) ?? key,
				status: fieldName(fields.status),
				priority: fieldName(fields.priority),
				assignee: fieldName(
					(fields.assignee as Record<string, unknown>)?.displayName ?? fields.assignee,
				),
				issueType: fieldName(fields.issuetype),
				project: key.includes('-') ? key.split('-')[0] : undefined,
				updated: fieldName(fields.updated ?? fields.statuscategorychangedate),
				labels: Array.isArray(fields.labels) ? fields.labels.map(String) : undefined,
				components: Array.isArray(fields.components)
					? fields.components.map(c => fieldName(c) ?? String(c))
					: undefined,
			});
		}
		return tickets;
	} catch {
		return [];
	}
}

/** Parse getTransitionsForJiraIssue response → { id, name }[]. */
export function parseJiraTransitions(text: string): { id: string; name: string }[] {
	try {
		const json = JSON.parse(text) as Record<string, unknown>;
		const transitions = (json.transitions ?? json.values) as unknown[] | undefined;
		if (!Array.isArray(transitions)) {
			return [];
		}
		return transitions
			.map(t => {
				if (typeof t !== 'object' || t === null) return null;
				const tr = t as Record<string, unknown>;
				const id = String(tr.id ?? '');
				const name = fieldName(tr.name ?? tr.to) ?? id;
				return id ? { id, name } : null;
			})
			.filter((x): x is { id: string; name: string } => !!x);
	} catch {
		return [];
	}
}

/** Pick closest transition for target status label. */
export function pickTransitionForStatus(
	transitions: { id: string; name: string }[],
	targetStatus: string,
): { id: string; name: string } | undefined {
	const t = targetStatus.toLowerCase();
	const exact = transitions.find(x => x.name.toLowerCase() === t);
	if (exact) return exact;
	const partial = transitions.find(x =>
		x.name.toLowerCase().includes(t) || t.includes(x.name.toLowerCase()),
	);
	if (partial) return partial;
	if (/review/i.test(targetStatus)) {
		return transitions.find(x => /review/i.test(x.name));
	}
	if (/done|complete/i.test(targetStatus)) {
		return transitions.find(x => /done|complete/i.test(x.name));
	}
	return transitions[0];
}
