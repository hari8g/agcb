/*--------------------------------------------------------------------------------------
 *  Agentic AI — detect JIRA chat commands (no LLM required)
 *--------------------------------------------------------------------------------------*/

import { extractJiraIssueKeys } from './jiraContextExtractor.js';

export type JiraChatIntent =
	| { kind: 'list_open' }
	| { kind: 'refresh_list' }
	| { kind: 'select'; ticketKey: string }
	| { kind: 'accept_workflow' }
	| { kind: 'decline_workflow' }
	| { kind: 'regenerate_plan' };

const LIST_PATTERNS = [
	/show\s+(the\s+)?(list\s+of\s+)?open\s+jira\s+tickets/i,
	/list\s+(of\s+)?open\s+jira\s+tickets/i,
	/open\s+jira\s+tickets/i,
	/show\s+jira\s+tickets/i,
	/what\s+jira\s+tickets\s+are\s+open/i,
	/refresh\s+(open\s+)?jira\s+tickets/i,
	/\b(show|list|fetch|display|get)\b.*\bjira\b.*\b(tickets?|issues?)\b/i,
	/\bjira\b.*\b(tickets?|issues?)\b.*\b(open|list)\b/i,
	/\bplease\s+show\b.*\bjira\b/i,
	/^show\s+open\s+tickets$/i,
];

const SELECT_PATTERNS = [
	/\b(select|pick|choose|work\s+on|start|run|load|open)\b/i,
	/\buse\s+ticket\b/i,
];

const ACCEPT_PATTERNS = [
	/\baccept\s+(the\s+)?workflow\b/i,
	/\bapprove\s+(the\s+)?workflow\b/i,
	/\brun\s+(the\s+)?workflow\b/i,
	/\bexecute\s+(the\s+)?workflow\b/i,
	/\bproceed\s+(with\s+)?(the\s+)?(plan|workflow)\b/i,
	/\bgo\s+ahead\b/i,
	/^\s*(yes|y|ok|okay|sure|do\s+it|lgtm)\s*$/i,
	/^\s*(yes|ok|sure)\s*,?\s*(proceed|go\s+ahead|please)?\s*$/i,
];

const DECLINE_PATTERNS = [
	/\bdecline\s+(the\s+)?workflow\b/i,
	/\breject\s+(the\s+)?workflow\b/i,
	/\bcancel\s+(the\s+)?workflow\b/i,
	/^\s*(no|n|cancel|stop|decline|reject)\s*$/i,
	/^\s*no\s*,?\s*(thanks|decline|cancel)?\s*$/i,
];

const REGENERATE_PATTERNS = [
	/\bregenerate\s+(the\s+)?plan\b/i,
	/\bnew\s+workflow\s+plan\b/i,
];

export interface JiraChatIntentContext {
	/** Plan is ready and workflow is waiting for Proceed / Decline */
	awaitingWorkflowDecision?: boolean;
}

/** True when the user is asking for JIRA UI in chat (skip generic agent run). */
export function detectJiraChatIntent(text: string, ctx?: JiraChatIntentContext): JiraChatIntent | null {
	const raw = text.trim();
	if (!raw) {
		return null;
	}

	if (REGENERATE_PATTERNS.some(p => p.test(raw))) {
		return { kind: 'regenerate_plan' };
	}
	if (DECLINE_PATTERNS.some(p => p.test(raw))) {
		return { kind: 'decline_workflow' };
	}
	if (ACCEPT_PATTERNS.some(p => p.test(raw))) {
		return { kind: 'accept_workflow' };
	}

	// Short affirmatives while a plan is on screen (maps to Proceed button)
	if (ctx?.awaitingWorkflowDecision) {
		if (/^\s*(yes|y|ok|okay|sure|proceed|go\s+ahead|continue|do\s+it)\s*$/i.test(raw)) {
			return { kind: 'accept_workflow' };
		}
		if (/^\s*(no|n|cancel|stop|decline)\s*$/i.test(raw)) {
			return { kind: 'decline_workflow' };
		}
	}
	if (/^refresh\s+(open\s+)?jira/i.test(raw)) {
		return { kind: 'refresh_list' };
	}
	if (LIST_PATTERNS.some(p => p.test(raw))) {
		return { kind: 'list_open' };
	}

	const keys = extractJiraIssueKeys(raw);
	if (keys.length && SELECT_PATTERNS.some(p => p.test(raw))) {
		return { kind: 'select', ticketKey: keys[0] };
	}

	// Short form: only a ticket key (e.g. "KAN-4") after a list was shown
	if (keys.length === 1 && /^[A-Z][A-Z0-9]+-\d+$/i.test(raw.trim())) {
		return { kind: 'select', ticketKey: keys[0] };
	}

	return null;
}
