/*--------------------------------------------------------------------------------------
 *  Agentic AI — browser-side verification state updates (lint / repair_once)
 *--------------------------------------------------------------------------------------*/

import type { ChatThread } from '../agenticTypes.js';
import {
	buildRepairOnceNudge,
	canAttemptRepair,
	createVerificationState,
	markRepairAttempted,
	type VerificationState,
} from './verificationLoop.js';
import { markCanonicalPhaseComplete } from './canonicalWorkflowTracker.js';

export function ensureThreadVerificationState(thread: ChatThread): VerificationState {
	if (!thread.verificationState) {
		thread.verificationState = createVerificationState();
	}
	return thread.verificationState;
}

export function recordLintVerificationResult(
	thread: ChatThread,
	path: string,
	lintResult: string,
	hasErrors: boolean,
): { injectMessage?: string; activityText?: string } {
	const state = ensureThreadVerificationState(thread);
	state.lintChecked = true;

    if (!state.commandsAttempted.includes('read_lint_errors')) {
		state.commandsAttempted.push('read_lint_errors');
	}

	const snap = thread.canonicalWorkflowSnapshot;
	if (snap?.phases.includes('verify') && !snap.completedPhases.includes('verify')) {
		snap.currentPhase = 'verify';
	}

	if (!hasErrors) {
		state.status = 'passed';
		if (snap?.phases.includes('verify')) {
			markCanonicalPhaseComplete(snap, 'verify');
		}
		return { activityText: `Lint clean on ${basename(path)}` };
	}

	state.status = 'failed';
	state.lastFailureOutput = lintResult;

	if (canAttemptRepair(state)) {
		thread.verificationState = markRepairAttempted(state);
		if (snap?.phases.includes('repair_once')) {
			snap.currentPhase = 'repair_once';
		}
		return {
			injectMessage: buildRepairOnceNudge(lintResult),
			activityText: `Lint issues in ${basename(path)} — one repair attempt`,
		};
	}

	return {
		activityText: `Lint still failing on ${basename(path)} after repair`,
	};
}

function basename(path: string): string {
	const parts = path.split(/[/\\]/);
	return parts[parts.length - 1] || path;
}
