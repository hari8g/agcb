/*--------------------------------------------------------------------------------------
 *  Agentic AI — end-of-run workflow summary (asked → approach → actions → outcome)
 *--------------------------------------------------------------------------------------*/

import type { ChatMessage, ToolCall, TouchedFile } from './agenticTypes.js';
import {
	analyzeWorkflowRunQuality,
	inferCompletionKindFromQuality,
	type WorkflowRunQuality,
} from './workflowRunQuality.js';
import { validateSearchReplaceBlocks } from './editValidator.js';

export interface WorkflowActionSummary {
	toolName: string;
	label: string;
	outcomePreview?: string;
	status: string;
}

export interface WorkflowCompletionSummary {
	/** What the user requested */
	asked: string;
	/** How the agent interpreted and planned the work */
	approach: string[];
	/** Tools executed and key results */
	actions: WorkflowActionSummary[];
	/** Files read or edited */
	filesTouched: TouchedFile[];
	/** Final answer / deliverable shown to the user */
	outcome: string;
	/** run_completed | run_failed | turn_limit */
	completionKind: 'success' | 'partial' | 'failed' | 'stalled';
	generatedAt: number;
}

const SKIP_ACTIVITY_RE = /^(all set|orchestrator|turn budget|agent turn \d|plan without tools|verify step|bootstrap complete|continuing while|done with list|finished reading|opened .+ in the editor)/i;
const TOOL_ECHO_RE = /^\[tool_(result|error):/i;

function basename(p: string): string {
	const parts = p.replace(/\\/g, '/').split('/');
	return parts[parts.length - 1] || p;
}

function summarizeToolCall(tc: ToolCall): WorkflowActionSummary {
	const args = tc.arguments ?? {};
	const failed = tc.status === 'failed';
	let label = tc.name.replace(/_/g, ' ');
	switch (tc.name) {
		case 'read_file':
			label = `Read ${basename(String(args.path ?? 'file'))}`;
			break;
		case 'propose_file_edit': {
			const path = basename(String(args.path ?? 'file'));
			const v = validateSearchReplaceBlocks(String(args.searchReplaceBlocks ?? ''));
			if (failed || !v.ok) {
				label = `Edit failed for ${path}${v.error ? ` (${v.error})` : ''}`;
			} else {
				label = `Proposed edits to ${path}`;
			}
			break;
		}
		case 'apply_file_edit':
			label = failed
				? `Apply failed for ${basename(String(args.path ?? 'file'))}`
				: `Applied edits to ${basename(String(args.path ?? 'file'))}`;
			break;
		case 'list_workspace':
			label = 'Listed workspace structure';
			break;
		case 'list_files':
			label = `Listed files in ${String(args.path ?? '.')}`;
			break;
		case 'grep':
			label = `Searched for "${String(args.pattern ?? '').slice(0, 60)}"`;
			break;
		case 'search_files':
			label = `Searched files for "${String(args.query ?? '').slice(0, 60)}"`;
			break;
		case 'run_terminal_command':
			label = `Ran command: ${String(args.command ?? '').slice(0, 80)}`;
			break;
		default:
			if (args.path) {
				label = `${label} (${basename(String(args.path))})`;
			}
	}
	return {
		toolName: tc.name,
		label,
		outcomePreview: tc.resultPreview?.replace(/\s+/g, ' ').trim().slice(0, 220) || undefined,
		status: failed ? 'failed' : tc.status,
	};
}

function extractApproachSteps(msg: ChatMessage): string[] {
	const steps: string[] = [];
	const seen = new Set<string>();

	const add = (raw: string) => {
		const t = raw.replace(/^Reasoning:\s*/i, '').trim();
		if (t.length < 12 || t.length > 500 || SKIP_ACTIVITY_RE.test(t) || seen.has(t)) {
			return;
		}
		seen.add(t);
		steps.push(t);
	};

	for (const line of msg.activityLines ?? []) {
		if (line.kind === 'orchestrator') {
			continue;
		}
		if (TOOL_ECHO_RE.test(line.text)) {
			continue;
		}
		if (line.kind === 'reasoning' || line.kind === 'tool' || line.kind === 'status' || !line.kind) {
			add(line.text);
		}
	}

	for (const ev of msg.thinkingEvents ?? []) {
		if (ev.title) {
			add(ev.title);
		}
	}

	return steps.slice(0, 12);
}

function dedupeParagraphs(text: string): string {
	const parts = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const p of parts) {
		const key = p.replace(/\s+/g, ' ').toLowerCase();
		if (!seen.has(key)) {
			seen.add(key);
			unique.push(p);
		}
	}
	return unique.join('\n\n');
}

export function buildWorkflowCompletionSummary(opts: {
	userMessage: string;
	assistantMessage: ChatMessage;
	planStall?: boolean;
	runFailed?: boolean;
	failureMessage?: string;
	runQuality?: WorkflowRunQuality;
}): WorkflowCompletionSummary {
	const { userMessage, assistantMessage } = opts;
	const toolCalls = assistantMessage.toolCalls ?? [];
	const toolsRan = toolCalls.length > 0;
	const quality = opts.runQuality ?? analyzeWorkflowRunQuality(assistantMessage, userMessage);
	const actions = toolCalls.map(summarizeToolCall);
	const approach = extractApproachSteps(assistantMessage);

	if (!approach.length && toolsRan) {
		approach.push('Gathered context from the workspace, then used tools to inspect and change files as needed.');
	} else if (!approach.length) {
		approach.push('Responded from context and conversation without running tools.');
	}

	let outcome = dedupeParagraphs(assistantMessage.content.trim());
	if (!outcome && opts.failureMessage) {
		outcome = opts.failureMessage;
	}
	if (!outcome && actions.length) {
		outcome = `Completed ${actions.length} tool step(s). See actions below for details.`;
	}

	const kind = inferCompletionKindFromQuality(quality, toolsRan, !!opts.planStall, opts.runFailed);

	if (kind === 'failed' && quality.blockers.length) {
		outcome = `${outcome ? `${outcome}\n\n` : ''}**Blockers:** ${quality.blockers.join('; ')}.`;
	} else if (kind === 'partial' && quality.blockers.length) {
		outcome = `${outcome ? `${outcome}\n\n` : ''}**Note:** ${quality.blockers.join('; ')}.`;
	}

	if (kind !== 'success' && /^completed \d+ tool step/i.test(outcome)) {
		outcome = quality.blockers[0] ?? 'The requested changes were not fully delivered.';
	}
	if (quality.deliveryIncomplete && kind === 'failed') {
		outcome = quality.blockers[0] ?? 'Read files but never applied edits. Enable Auto-apply or approve edits when prompted.';
	}

	return {
		asked: userMessage.trim(),
		approach,
		actions,
		filesTouched: [...(assistantMessage.touchedFiles ?? [])],
		outcome,
		completionKind: kind,
		generatedAt: Date.now(),
	};
}

export function formatWorkflowSummaryMarkdown(s: WorkflowCompletionSummary): string {
	const statusLabel = {
		success: 'Completed successfully',
		partial: 'Incomplete — explored codebase but deliverable not finished',
		failed: 'Edits did not apply — task not delivered',
		stalled: 'Finished without running tools',
	}[s.completionKind];

	const lines: string[] = [
		`## Workflow summary`,
		``,
		`**Status:** ${statusLabel}`,
		``,
		`### What you asked`,
		s.asked,
		``,
		`### How I approached it`,
		...s.approach.map(step => `- ${step}`),
	];

	if (s.actions.length) {
		lines.push('', `### What I did`);
		for (const a of s.actions) {
			const outcome = a.outcomePreview ? ` — ${a.outcomePreview}` : '';
			lines.push(`- **${a.label}** (${a.status})${outcome}`);
		}
	}

	if (s.filesTouched.length) {
		lines.push('', `### Files touched`);
		for (const f of s.filesTouched) {
			lines.push(`- \`${f.path}\` (${f.status})`);
		}
	}

	lines.push('', `### Result`, s.outcome || '_No final message._');
	return lines.join('\n');
}

/** When the model answer is thin but work ran, prepend the summary for the chat bubble. */
export function shouldPrependSummaryToContent(
	summary: WorkflowCompletionSummary,
	answer: string,
): boolean {
	if (summary.completionKind === 'success') {
		return false;
	}
	if (summary.completionKind === 'stalled' || summary.completionKind === 'failed' || summary.completionKind === 'partial') {
		return answer.trim().length < 80;
	}
	return false;
}
