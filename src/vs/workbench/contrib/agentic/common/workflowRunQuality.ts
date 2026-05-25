/*--------------------------------------------------------------------------------------
 *  Agentic AI — detect incomplete / failed runs for honest workflow summaries
 *--------------------------------------------------------------------------------------*/

import type { ChatMessage } from './agenticTypes.js';
import { validateSearchReplaceBlocks } from './editValidator.js';
import { classifyAgentIntent } from './agentIntentClassifier.js';

export interface WorkflowRunQuality {
	failedEditAttempts: number;
	emptyBlockEditAttempts: number;
	successfulEditAttempts: number;
	readOnlyToolCalls: number;
	expectsDeliverableEdits: boolean;
	deliveryIncomplete: boolean;
	outcomeClaimsFailure: boolean;
	outcomeClaimsBlocked: boolean;
	repeatedFailedEditsOnSameFile: boolean;
	blockers: string[];
}

/** User asked for real file changes (not explain-only / plan-only). */
export function expectsDeliverableEdits(userMessage: string): boolean {
	return classifyAgentIntent(userMessage).requiresEdits;
}

const OUTCOME_FAILURE_RE = /\b(still not present|not present in|did not succeed|was not added|no model changes|cannot continue|file modification is currently blocked|file edits are (not allowed|blocked|disabled)|edits did not|without running tools|multiple attempts)\b/i;
const OUTCOME_BLOCKED_RE = /\b(blocked|not allowed|enable(d)?\s+(file\s+)?edit|auto-apply|approval required)\b/i;

export function analyzeWorkflowRunQuality(msg: ChatMessage, userMessage = ''): WorkflowRunQuality {
	const toolCalls = msg.toolCalls ?? [];
	const toolResults = msg.toolResults ?? [];
	const resultByToolId = new Map(toolResults.map(r => [r.toolCallId, r]));

	let failedEditAttempts = 0;
	let emptyBlockEditAttempts = 0;
	let successfulEditAttempts = 0;
	let readOnlyToolCalls = 0;
	const failedPaths = new Map<string, number>();

	for (const tc of toolCalls) {
		if (tc.name === 'read_file' || tc.name === 'list_files' || tc.name === 'list_workspace' || tc.name === 'grep' || tc.name === 'search_files' || tc.name === 'get_symbols') {
			readOnlyToolCalls++;
		}
		if (tc.name === 'write_file') {
			const tr = resultByToolId.get(tc.id);
			const preview = (tc.resultPreview ?? tr?.content ?? '').toLowerCase();
			const isError = tc.status === 'failed' || tr?.isError === true
				|| preview.includes('requires non-empty')
				|| preview.includes('error:');
			if (isError) {
				failedEditAttempts++;
				const path = String(tc.arguments.path ?? '');
				if (path) {
					failedPaths.set(path, (failedPaths.get(path) ?? 0) + 1);
				}
			} else if (tc.status === 'complete') {
				successfulEditAttempts++;
			}
			continue;
		}
		if (tc.name !== 'propose_file_edit' && tc.name !== 'apply_file_edit') {
			continue;
		}
		const tr = resultByToolId.get(tc.id);
		const blocks = String(tc.arguments.searchReplaceBlocks ?? '');
		const validation = validateSearchReplaceBlocks(blocks);
		const preview = (tc.resultPreview ?? tr?.content ?? '').toLowerCase();
		const isError = tc.status === 'failed' || tr?.isError === true
			|| preview.includes('searchreplaceblocks is empty')
			|| preview.includes('missing <<<<<<< original')
			|| !validation.ok;

		if (isError) {
			failedEditAttempts++;
			if (!validation.ok && (validation.error?.includes('empty') || blocks.trim().length === 0)) {
				emptyBlockEditAttempts++;
			}
			const path = String(tc.arguments.path ?? '');
			if (path) {
				failedPaths.set(path, (failedPaths.get(path) ?? 0) + 1);
			}
		} else if (validation.ok && tc.status === 'complete') {
			successfulEditAttempts++;
		}
	}

	const content = msg.content.trim();
	const outcomeClaimsFailure = OUTCOME_FAILURE_RE.test(content);
	const outcomeClaimsBlocked = OUTCOME_BLOCKED_RE.test(content);
	const repeatedFailedEditsOnSameFile = [...failedPaths.values()].some(c => c >= 2);

	const blockers: string[] = [];
	if (emptyBlockEditAttempts > 0) {
		blockers.push(`${emptyBlockEditAttempts} edit(s) had empty or invalid searchReplaceBlocks`);
	}
	if (failedEditAttempts > 0 && successfulEditAttempts === 0) {
		blockers.push('No file edits were applied successfully');
	}
	if (outcomeClaimsFailure) {
		blockers.push('Agent reported the deliverable was not completed');
	}
	if (outcomeClaimsBlocked) {
		blockers.push('Edits may be blocked — check Auto-apply or approve pending edits');
	}
	if (repeatedFailedEditsOnSameFile) {
		blockers.push('Same file was edited multiple times without success');
	}

	const appliedTouched = (msg.touchedFiles ?? []).some(f => f.status === 'applied');
	const expectsEdits = expectsDeliverableEdits(userMessage);
	const deliveryIncomplete = expectsEdits
		&& successfulEditAttempts === 0
		&& !appliedTouched
		&& (readOnlyToolCalls > 0 || failedEditAttempts > 0);
	if (deliveryIncomplete && !blockers.some(b => b.includes('No file edits'))) {
		blockers.push('No file edits were proposed or applied — task not delivered');
	}

	return {
		failedEditAttempts,
		emptyBlockEditAttempts,
		successfulEditAttempts,
		readOnlyToolCalls,
		expectsDeliverableEdits: expectsEdits,
		deliveryIncomplete,
		outcomeClaimsFailure,
		outcomeClaimsBlocked,
		repeatedFailedEditsOnSameFile,
		blockers,
	};
}

export function inferCompletionKindFromQuality(
	quality: WorkflowRunQuality,
	toolsRan: boolean,
	planStall: boolean,
	runFailed?: boolean,
): 'success' | 'partial' | 'failed' | 'stalled' {
	if (runFailed) {
		return 'failed';
	}
	if (planStall || (!toolsRan && !quality.readOnlyToolCalls)) {
		return 'stalled';
	}
	const editsAttempted = quality.failedEditAttempts + quality.successfulEditAttempts > 0;
	const editsFailed = editsAttempted && quality.successfulEditAttempts === 0;
	if (editsFailed || (quality.outcomeClaimsFailure && quality.successfulEditAttempts === 0)) {
		return 'failed';
	}
	if (quality.deliveryIncomplete) {
		return 'failed';
	}
	if (quality.outcomeClaimsFailure || quality.failedEditAttempts > 0 || quality.outcomeClaimsBlocked) {
		return 'partial';
	}
	return 'success';
}
