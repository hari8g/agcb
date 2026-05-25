/*--------------------------------------------------------------------------------------
 *  Agentic AI — when to stop the agent loop after deliverable work is done
 *--------------------------------------------------------------------------------------*/

import { classifyAgentIntent } from './agentIntentClassifier.js';
import { isJiraExecutionPrompt } from './agentOrchestration.js';
import { isPlanProposalContent } from './planProposalContent.js';
import { expectsDeliverableEdits } from './workflowRunQuality.js';
import type { LoopProgressState } from './agentLoopBudget.js';

const COMPLETION_CLAIM_RE = /\b(created|added|wrote|updated|done|complete|finished|successfully|is now|has been)\b/i;

export function isFileEditTool(name: string): boolean {
	return name === 'write_file' || name === 'propose_file_edit' || name === 'apply_file_edit';
}

export function recordSuccessfulFileEdit(
	state: LoopProgressState,
	toolName: string,
	path: string,
): void {
	if (!isFileEditTool(toolName)) {
		return;
	}
	state.successfulFileEditsInRun++;
	const trimmed = path.trim();
	if (trimmed) {
		state.successfulEditPaths.add(trimmed.replace(/\\/g, '/'));
	}
}

export function hasDeliverableEditInRun(state: LoopProgressState): boolean {
	return state.successfulFileEditsInRun > 0;
}

/** Allow finishing with a text-only turn after a successful write/edit. */
export function shouldAllowTextOnlyCompletion(
	userMessage: string,
	assistantText: string,
	state: LoopProgressState,
): boolean {
	if (!hasDeliverableEditInRun(state)) {
		if (isPlanProposalContent(assistantText) && state.bootstrapReadDelivered) {
			if (isJiraExecutionPrompt(userMessage)) {
				return false;
			}
			return true;
		}
		return false;
	}
	if (!expectsDeliverableEdits(userMessage)) {
		return true;
	}
	const intent = classifyAgentIntent(userMessage).intent;
	const target = resolveTargetFileFromUserMessage(userMessage);
	const wroteTarget = target
		&& [...state.successfulEditPaths].some(p =>
			p === target || p.endsWith('/' + target) || target.endsWith(p),
		);
	if (state.successfulFileEditsInRun >= 1 && (intent === 'create_file' || wroteTarget)) {
		return true;
	}
	const text = assistantText.trim();
	if (text.length < 8) {
		return false;
	}
	return COMPLETION_CLAIM_RE.test(text) || text.length < 400;
}

export function shouldSkipVerifyNudge(userMessage: string, state: LoopProgressState): boolean {
	if (!hasDeliverableEditInRun(state)) {
		return false;
	}
	const intent = classifyAgentIntent(userMessage).intent;
	const target = resolveTargetFileFromUserMessage(userMessage);
	const wroteTarget = target && state.successfulEditPaths.has(target);
	return state.successfulFileEditsInRun >= 1 && (intent === 'create_file' || !!wroteTarget);
}

export function shouldSkipDeliveryIncompleteNudge(state: LoopProgressState): boolean {
	return hasDeliverableEditInRun(state);
}

/** After write_file succeeded, stop empty propose_file_edit retries. */
export function buildEditAlreadyDeliveredNudge(path?: string): string {
	const lines = [
		'[Orchestrator] The file change is already applied (write_file succeeded).',
		'Do NOT call propose_file_edit again for the same file.',
		'Reply with a one-paragraph summary of what was created or changed, then stop.',
	];
	if (path) {
		lines.splice(1, 0, `Delivered: ${path}`);
	}
	return lines.join('\n');
}

export function resolveTargetFileFromUserMessage(userMessage: string): string | undefined {
	const intent = classifyAgentIntent(userMessage);
	if (intent.targetPaths.length) {
		return intent.targetPaths[0];
	}
	const createNamed = userMessage.match(
		/\b(?:create|add|generate|new)\s+(?:a\s+)?([\w./-]+\.\w{1,8})\b/i,
	);
	if (createNamed?.[1]) {
		return createNamed[1];
	}
	const m = userMessage.match(/\b(package\.json)\b/i);
	return m?.[1];
}
