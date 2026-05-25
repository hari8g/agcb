/*--------------------------------------------------------------------------------------
 *  Agentic AI — execute-phase gating for complex workflows (plan before edits)
 *--------------------------------------------------------------------------------------*/

import type { AgentThreadRunMode } from './agenticTypes.js';
import { classifyAgentIntent, intentRequiresDeliverableEdits } from './agentIntentClassifier.js';
import type { AgentWorkflowSnapshot } from './agentWorkflowOrchestration.js';
import { isFileEditTool } from './agentRunCompletion.js';

export interface ExecutePhaseGateInput {
	userMessage: string;
	planOnlyMode: boolean;
	executeApproved: boolean;
	snapshot?: AgentWorkflowSnapshot;
}

const EXECUTE_APPROVED_MARKER = /\[Execute approved plan\]/i;

/** Repo-wide / architectural work that warrants plan-before-execute (opt-in gating). */
const REPO_WIDE_GATE_RE =
	/\b(refactor|migrate|monorepo|codebase[- ]wide|across the (?:codebase|repo|project)|entire project|service layer|architect(?:ure)?|restructure the)\b/i;

/** Routine implementation — never gate unless user is explicitly in plan-only mode. */
const ROUTINE_EDIT_INTENTS = new Set([
	'create_file',
	'edit_file',
	'improve_code',
	'fix_bug',
	'write_tests',
	'execute_plan',
]);

/** User explicitly approved running the plan (button or marker message). */
export function isExecutePhaseApproved(opts: {
	userMessage: string;
	agentRunMode?: AgentThreadRunMode;
}): boolean {
	if (EXECUTE_APPROVED_MARKER.test(opts.userMessage)) {
		return true;
	}
	if (opts.agentRunMode === 'execute_approved_plan') {
		return true;
	}
	return classifyAgentIntent(opts.userMessage).intent === 'execute_plan';
}

/**
 * Block write/edit tools until the user approves execution.
 * **Opt-in only:** Plan composer mode, /plan intent, or explicit repo-wide refactor/migrate asks.
 * Routine create/edit/fix tasks run immediately (no "Execute plan" wall).
 */
export function shouldGateExecutePhase(input: ExecutePhaseGateInput): boolean {
	if (input.executeApproved) {
		return false;
	}
	if (input.planOnlyMode) {
		return true;
	}

	const classified = classifyAgentIntent(input.userMessage);
	if (classified.intent === 'plan_task') {
		return true;
	}

	const snap = input.snapshot;
	if (!snap) {
		return false;
	}

	// Routine deliverable work — execute immediately in Agent mode
	if (ROUTINE_EDIT_INTENTS.has(snap.intent.intent)) {
		return false;
	}

	if (snap.intent.intent === 'refactor' && snap.complexity === 'complex' && REPO_WIDE_GATE_RE.test(input.userMessage)) {
		return intentRequiresDeliverableEdits(snap.intent);
	}

	if (snap.complexity !== 'complex') {
		return false;
	}
	if (!REPO_WIDE_GATE_RE.test(input.userMessage)) {
		return false;
	}
	if (!intentRequiresDeliverableEdits(snap.intent)) {
		return false;
	}

	return snap.phases.includes('plan') && snap.phases.includes('impact');
}

export function isExecuteGatedWriteTool(toolName: string): boolean {
	return isFileEditTool(toolName) || toolName === 'restore_checkpoint';
}

export function buildExecuteGatingSystemBlock(gated: boolean): string {
	if (!gated) {
		return '';
	}
	return [
		'<execute_gating>',
		'**Execute phase is gated** for this run (Plan mode or repo-wide refactor).',
		'- Use read-only tools only until the user approves: read_file, list_files, grep, search_files, get_symbols, read_lint_errors.',
		'- Do **not** call write_file, propose_file_edit, apply_file_edit, or restore_checkpoint until approval.',
		'- Present a short plan; the user clicks **Execute plan** or sends `[Execute approved plan]`.',
		'</execute_gating>',
	].join('\n');
}

export function buildExecuteGatedToolError(toolName: string): string {
	return [
		`Tool \`${toolName}\` is blocked: this run is in plan-first mode.`,
		'Click **Execute plan** in the chat, or send `[Execute approved plan]`, then retry edits.',
	].join(' ');
}

export function shouldOfferPlanExecuteDecision(opts: {
	executePhaseGated: boolean;
	planOnlyMode: boolean;
	toolsRan: boolean;
	writeToolsRan: boolean;
}): boolean {
	if (!opts.executePhaseGated && !opts.planOnlyMode) {
		return false;
	}
	if (opts.writeToolsRan) {
		return false;
	}
	return true;
}
