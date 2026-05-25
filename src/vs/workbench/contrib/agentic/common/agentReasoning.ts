/*--------------------------------------------------------------------------------------
 *  Agentic AI — think → reason → act → verify (prompts + UI mapping)
 *--------------------------------------------------------------------------------------*/

import type { AgentActivityKind } from './agenticTypes.js';
import type { ResolvedAgentCapabilities } from './agentCapabilities.js';
import type { ParsedToolCall } from './toolCallParser.js';

/** Visible reasoning in the activity feed (not hidden chain-of-thought). */
export function buildReasoningSystemPromptBlock(caps: ResolvedAgentCapabilities): string {
	const lines: string[] = [
		'<agent_reasoning>',
		'Work in a tight loop: **Observe** (context/tools) → **Reason** (1–3 short sentences) → **Act** (`tool_call`) → **Verify** (re-read or check) → repeat or finish.',
		'- Write your Reason step as plain text immediately before each ```json tool_call block. That text appears in the UI as live reasoning.',
		'- After tool results arrive, Reason about what you learned, then Act again or give a concise final answer.',
		'- Do not write long essays, hidden chain-of-thought, or step lists without tool calls in the same message.',
		'- When the task needs code or files: every turn must include at least one tool_call unless you are done and summarizing results.',
	];

	if (caps.planAndVerify) {
		lines.push('- Before declaring done on a non-trivial change: re-read edited files (read_file) or run a safe check (grep, get_symbols, run_terminal_command) to verify.');
	}
	lines.push('- You have a generous multi-turn budget for complex tasks: keep looping (reason → tool → reason) until done; do not stop early while work remains.');

	if (caps.parallelToolCalls) {
		lines.push('- You may batch several read/search tools in one turn; still add one sentence of Reason before the first tool_call.');
	}

	lines.push('</agent_reasoning>');
	return lines.join('\n');
}

export function buildVerifyStepNudge(toolCalls: ParsedToolCall[]): string {
	const paths = [...new Set(
		toolCalls
			.filter(t => t.name === 'propose_file_edit' || t.name === 'apply_file_edit' || t.name === 'write_file' || t.name === 'read_file')
			.map(t => String(t.arguments.path ?? '').trim())
			.filter(Boolean),
	)];
	const pathHint = paths.length
		? `Re-read ${paths.slice(0, 3).map(p => `"${p}"`).join(', ')} to confirm the change.`
		: 'Confirm your last tool results match the user request.';
	return [
		'[Orchestrator — verify] Before finishing this task:',
		pathHint,
		'Use read_lint_errors on edited files if you have not already.',
		'Then either call more tools to fix gaps or give a short final summary of what you did.',
	].join(' ');
}

export function toolNameToActivityKind(toolName: string): AgentActivityKind {
	switch (toolName) {
		case 'read_file':
		case 'get_active_file':
		case 'get_selected_code':
			return 'reading';
		case 'list_files':
		case 'list_workspace':
		case 'search_files':
		case 'grep':
		case 'get_symbols':
			return 'searching';
		case 'propose_file_edit':
		case 'apply_file_edit':
			return 'editing';
		case 'run_terminal_command':
			return 'terminal';
		case 'create_checkpoint':
		case 'restore_checkpoint':
			return 'planning';
		default:
			if (/jira|issue|comment|transition/i.test(toolName)) {
				return 'tool_call';
			}
			return 'tool_call';
	}
}

export function reasoningActivityLabel(text: string): string {
	const t = text.trim();
	if (!t) {
		return '';
	}
	if (/^reasoning:/i.test(t)) {
		return t;
	}
	return `Reasoning: ${t}`;
}

/** Split final assistant text into reasoning vs user-facing summary. */
export function splitReasoningAndAnswer(text: string): { reasoning: string; answer: string } {
	const trimmed = text.trim();
	const fence = trimmed.indexOf('```json');
	if (fence >= 0) {
		return {
			reasoning: trimmed.slice(0, fence).trim(),
			answer: '',
		};
	}
	const paragraphs = trimmed.split(/\n\n+/);
	if (paragraphs.length >= 2 && paragraphs[0].length < 400) {
		return { reasoning: paragraphs[0].trim(), answer: paragraphs.slice(1).join('\n\n').trim() };
	}
	return { reasoning: '', answer: trimmed };
}
