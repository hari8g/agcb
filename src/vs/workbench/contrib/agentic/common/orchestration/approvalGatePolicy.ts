/*--------------------------------------------------------------------------------------
 *  Agentic AI — approval gate policy (wraps executePhaseGating)
 *--------------------------------------------------------------------------------------*/

import {
	buildExecuteGatingSystemBlock,
	shouldGateExecutePhase,
	type ExecutePhaseGateInput,
} from '../executePhaseGating.js';
import type { StructuredIntent } from './structuredIntent.js';
import type { WorkflowRunPlan } from './workflowRunPlanner.js';

export interface ApprovalGateResult {
	gated: boolean;
	reason?: string;
	systemBlock: string;
}

export function resolveApprovalGate(input: {
	structuredIntent: StructuredIntent;
	planOnlyMode: boolean;
	executeApproved: boolean;
	userMessage: string;
	snapshot?: ExecutePhaseGateInput['snapshot'];
	workflowRunPlan?: WorkflowRunPlan;
}): ApprovalGateResult {
	const gated = shouldGateExecutePhase({
		planOnlyMode: input.planOnlyMode,
		executeApproved: input.executeApproved,
		userMessage: input.userMessage,
		snapshot: input.snapshot,
	});

	const reason = gated
		? (input.workflowRunPlan?.approvalReason
			?? input.structuredIntent.needsApproval
				? `Approval required (${input.structuredIntent.intent}, ${input.structuredIntent.scope})`
				: 'Execute phase gated')
		: undefined;

	return {
		gated,
		reason,
		systemBlock: buildExecuteGatingSystemBlock(gated),
	};
}

export function shouldBlockToolAtApprovalGate(
	toolName: string,
	gated: boolean,
): boolean {
	if (!gated) {
		return false;
	}
	return ['write_file', 'propose_file_edit', 'apply_file_edit', 'restore_checkpoint'].includes(toolName);
}
