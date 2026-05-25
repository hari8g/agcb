/*--------------------------------------------------------------------------------------
 *  Agentic AI — unified run quality report + score
 *--------------------------------------------------------------------------------------*/

import type { ChatMessage } from '../agenticTypes.js';
import {
	analyzeWorkflowRunQuality,
	inferCompletionKindFromQuality,
	type WorkflowRunQuality,
} from '../workflowRunQuality.js';
import type { VerificationState } from './verificationLoop.js';

export interface RunQualityReport {
	score: number;
	completionKind: 'success' | 'partial' | 'failed' | 'stalled';
	toolsUsed: number;
	filesRead: number;
	filesChanged: number;
	verificationStatus: VerificationState['status'];
	approvalRequired: boolean;
	approvalGranted?: boolean;
	retryCount: number;
	nudgeCount: number;
	issues: string[];
	blockers: string[];
}

function countFilesRead(msg: ChatMessage): number {
	return (msg.toolCalls ?? []).filter(tc =>
		['read_file', 'grep', 'search_files', 'list_files'].includes(tc.name),
	).length;
}

function countFilesChanged(msg: ChatMessage): number {
	const paths = new Set<string>();
	for (const tc of msg.toolCalls ?? []) {
		if (['write_file', 'propose_file_edit', 'apply_file_edit'].includes(tc.name) && tc.status === 'complete') {
			const p = String(tc.arguments.path ?? '');
			if (p) {
				paths.add(p);
			}
		}
	}
	return paths.size;
}

function computeScore(
	quality: WorkflowRunQuality,
	verification: VerificationState,
	toolsUsed: number,
): number {
	let score = 100;
	if (quality.deliveryIncomplete) {
		score -= 35;
	}
	if (quality.failedEditAttempts > 0) {
		score -= Math.min(30, quality.failedEditAttempts * 8);
	}
	if (quality.emptyBlockEditAttempts > 0) {
		score -= 15;
	}
	if (verification.status === 'failed') {
		score -= 25;
	} else if (verification.status === 'not_run' && quality.expectsDeliverableEdits && quality.successfulEditAttempts > 0) {
		score -= 15;
	}
	if (toolsUsed === 0 && quality.expectsDeliverableEdits) {
		score -= 40;
	}
	if (quality.outcomeClaimsFailure) {
		score -= 20;
	}
	return Math.max(0, Math.min(100, score));
}

export function buildRunQualityReport(opts: {
	assistantMessage: ChatMessage;
	userMessage: string;
	verification?: VerificationState;
	retryCount?: number;
	nudgeCount?: number;
	approvalRequired?: boolean;
	approvalGranted?: boolean;
}): RunQualityReport {
	const quality = analyzeWorkflowRunQuality(opts.assistantMessage, opts.userMessage);
	const verification = opts.verification ?? { status: 'not_run' as const, commandsAttempted: [], lintChecked: false, repairAttempted: false };
	const toolsUsed = opts.assistantMessage.toolCalls?.length ?? 0;
	const toolsRan = toolsUsed > 0;
	const completionKind = inferCompletionKindFromQuality(quality, toolsRan, false);
	const issues: string[] = [...quality.blockers];
	if (verification.status === 'failed') {
		issues.push('Verification failed');
	}
	if (verification.status === 'not_run' && quality.successfulEditAttempts > 0) {
		issues.push('Verification not run after edits');
	}

	return {
		score: computeScore(quality, verification, toolsUsed),
		completionKind,
		toolsUsed,
		filesRead: countFilesRead(opts.assistantMessage),
		filesChanged: countFilesChanged(opts.assistantMessage),
		verificationStatus: verification.status,
		approvalRequired: opts.approvalRequired ?? false,
		approvalGranted: opts.approvalGranted,
		retryCount: opts.retryCount ?? 0,
		nudgeCount: opts.nudgeCount ?? 0,
		issues,
		blockers: quality.blockers,
	};
}
