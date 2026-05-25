/*--------------------------------------------------------------------------------------
 *  Agentic AI — verification loop + repair_once contract
 *--------------------------------------------------------------------------------------*/

import type { WorkflowRunPlan } from './workflowRunPlanner.js';

export type VerificationStatus = 'not_run' | 'passed' | 'failed' | 'skipped';

export interface VerificationState {
	status: VerificationStatus;
	commandsAttempted: string[];
	lintChecked: boolean;
	repairAttempted: boolean;
	lastFailureOutput?: string;
}

export function createVerificationState(): VerificationState {
	return {
		status: 'not_run',
		commandsAttempted: [],
		lintChecked: false,
		repairAttempted: false,
	};
}

export function inferVerifyCommands(plan?: WorkflowRunPlan): string[] {
	if (!plan) {
		return [];
	}
	const cmds = [...plan.verificationStrategy.suggestedCommands];
	if (plan.verificationStrategy.runLint && !cmds.some(c => /lint/i.test(c))) {
		cmds.push('npm run lint');
	}
	if (plan.verificationStrategy.runTests && !cmds.some(c => /test/i.test(c))) {
		cmds.push('npm test');
	}
	return cmds.slice(0, 3);
}

export function shouldRunVerificationAfterEdits(
	editsApplied: number,
	plan?: WorkflowRunPlan,
): boolean {
	if (editsApplied <= 0) {
		return false;
	}
	return plan?.verificationStrategy.runLint !== false || (plan?.verificationStrategy.suggestedCommands.length ?? 0) > 0;
}

export function buildVerifyNudge(plan?: WorkflowRunPlan): string {
	const cmds = inferVerifyCommands(plan);
	return [
		'[Orchestrator — verify]',
		'Edits were applied. Before finishing:',
		'1. Call read_lint_errors on changed files.',
		cmds.length ? `2. If appropriate, run: ${cmds.join(' or ')} (requires approval).` : '',
		'3. Do not claim success if lint/tests fail.',
	].filter(Boolean).join('\n');
}

export function buildRepairOnceNudge(failureOutput: string): string {
	const trimmed = failureOutput.slice(0, 4000);
	return [
		'[Orchestrator — repair_once]',
		'Verification failed. You have **one** repair attempt:',
		'- Fix the root cause using propose_file_edit or write_file.',
		'- Re-check with read_lint_errors.',
		'- Do not repeat the same failed approach.',
		'',
		'Failure output:',
		trimmed,
	].join('\n');
}

export function canAttemptRepair(state: VerificationState): boolean {
	return state.status === 'failed' && !state.repairAttempted;
}

export function markRepairAttempted(state: VerificationState): VerificationState {
	return { ...state, repairAttempted: true };
}

export function shouldBlockSuccessClaim(state: VerificationState, editsApplied: number): boolean {
	if (editsApplied === 0) {
		return false;
	}
	return state.status === 'failed' || (state.status === 'not_run' && editsApplied > 0);
}

export function buildFalseSuccessBlocker(): string {
	return [
		'[Orchestrator]',
		'Do not mark this task complete — verification failed or was not run after edits.',
		'Summarize what failed and what remains.',
	].join('\n');
}
