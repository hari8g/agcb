/*--------------------------------------------------------------------------------------
 *  Agentic AI — structured in-chat decisions (buttons, not "type yes to continue")
 *--------------------------------------------------------------------------------------*/

import type { ApprovalRequest } from './agenticTypes.js';
import type { JiraChatMessageUi } from './mcp/jiraWorkflowTypes.js';
import type { ParsedPlanProposal } from './planProposalContent.js';

export type ChatDecisionKind = 'jira_workflow' | 'tool_approval' | 'plan_execute' | 'plan_exploration';

export type ChatDecisionActionId =
	| 'proceed'
	| 'decline'
	| 'regenerate'
	| 'approve'
	| 'reject'
	| 'execute_plan'
	| 'revise_plan'
	| (string & {});

export interface ChatDecisionAction {
	id: ChatDecisionActionId;
	label: string;
	variant: 'primary' | 'secondary' | 'ghost';
	/** When set, clicking the action sends this user message. */
	sendMessage?: string;
}

export interface ChatDecision {
	kind: ChatDecisionKind;
	title: string;
	hint?: string;
	actions: ChatDecisionAction[];
	/** Set when kind is tool_approval */
	approvalId?: string;
	resolved?: boolean;
}

export function buildJiraWorkflowDecision(ui: JiraChatMessageUi): ChatDecision | undefined {
	const show = ui.plan
		&& !ui.planLoading
		&& ui.mode === 'detail'
		&& !ui.executing
		&& ui.selectedTicket;
	if (!show) {
		return undefined;
	}
	return {
		kind: 'jira_workflow',
		title: 'Run plan',
		actions: [
			{ id: 'proceed', label: 'Run', variant: 'primary' },
			{ id: 'decline', label: 'Cancel', variant: 'ghost' },
		],
	};
}

export function buildPlanExecuteDecision(): ChatDecision {
	return {
		kind: 'plan_execute',
		title: 'Plan ready',
		hint: 'Review the plan above, then execute in the codebase or revise.',
		actions: [
			{ id: 'execute_plan', label: 'Execute plan', variant: 'primary' },
			{ id: 'revise_plan', label: 'Revise plan', variant: 'ghost' },
		],
	};
}

export function buildPlanExplorationDecision(parsed: ParsedPlanProposal): ChatDecision {
	const actions: ChatDecisionAction[] = parsed.choices.slice(0, 4).map((c, i) => ({
		id: `plan_focus_${i}`,
		label: c.label.length > 42 ? `${c.label.slice(0, 40)}…` : c.label,
		variant: 'secondary' as const,
		sendMessage: c.sendMessage,
	}));
	actions.push({
		id: 'execute_plan',
		label: 'Execute full plan',
		variant: 'primary',
		sendMessage:
			'[Execute approved plan] Implement the full improvement plan from your previous message. Use read_file, write_file, and propose_file_edit with valid blocks.',
	});
	return {
		kind: 'plan_exploration',
		title: 'What should we do next?',
		hint: parsed.closingPrompt ?? 'Pick an area to implement, or run the full plan.',
		actions,
	};
}

export function buildToolApprovalDecision(ar: ApprovalRequest): ChatDecision {
	const count = ar.items?.length ?? 1;
	return {
		kind: 'tool_approval',
		title: ar.title,
		hint: ar.description,
		approvalId: ar.id,
		actions: [
			{
				id: 'approve',
				label: count > 1 ? `Approve all (${count})` : 'Approve',
				variant: 'primary',
			},
			{ id: 'reject', label: 'Decline', variant: 'ghost' },
		],
	};
}
