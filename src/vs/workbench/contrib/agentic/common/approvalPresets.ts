/*--------------------------------------------------------------------------------------
 *  Agentic AI — trust presets → runtime approval flags
 *--------------------------------------------------------------------------------------*/

import type { AgenticSettings } from './agenticSettingsTypes.js';

export type ApprovalMode = 'cautious' | 'balanced' | 'fast';

export interface ResolvedApprovalOptions {
	autoRunReadOnlyTools: boolean;
	requireApprovalForEdits: boolean;
	requireApprovalForMcpTools: boolean;
	/** When false, JIRA/MCP read-like tools auto-run; writes still gated */
	requireApprovalForMcpWrites: boolean;
	/** run_terminal_command / network tools */
	requireApprovalForTerminal: boolean;
	batchEditsInSingleApproval: boolean;
	/** Suggested per-thread auto-apply for propose_file_edit (fast preset) */
	suggestedAutoApplyEdits: boolean;
}

export function resolveApprovalOptions(
	settings: Pick<AgenticSettings, 'approvalMode' | 'autoRunReadOnlyTools' | 'requireApprovalForEdits' | 'requireApprovalForMcpTools'>,
	thread?: { autoApplyEdits?: boolean; jiraWorkflowAutonomous?: boolean },
): ResolvedApprovalOptions {
	const mode: ApprovalMode = settings.approvalMode ?? 'cautious';
	let resolved: ResolvedApprovalOptions;

	switch (mode) {
		case 'fast':
			resolved = {
				autoRunReadOnlyTools: true,
				requireApprovalForEdits: false,
				requireApprovalForMcpTools: false,
				requireApprovalForMcpWrites: true,
				requireApprovalForTerminal: false,
				batchEditsInSingleApproval: true,
				suggestedAutoApplyEdits: true,
			};
			break;
		case 'balanced':
			resolved = {
				autoRunReadOnlyTools: true,
				requireApprovalForEdits: true,
				requireApprovalForMcpTools: false,
				requireApprovalForMcpWrites: true,
				requireApprovalForTerminal: true,
				batchEditsInSingleApproval: true,
				suggestedAutoApplyEdits: false,
			};
			break;
		default:
			resolved = {
				autoRunReadOnlyTools: settings.autoRunReadOnlyTools,
				requireApprovalForEdits: settings.requireApprovalForEdits,
				requireApprovalForMcpTools: settings.requireApprovalForMcpTools,
				requireApprovalForMcpWrites: true,
				requireApprovalForTerminal: true,
				batchEditsInSingleApproval: true,
				suggestedAutoApplyEdits: false,
			};
			break;
	}

	if (thread?.autoApplyEdits) {
		resolved = { ...resolved, requireApprovalForEdits: false };
	}

	if (thread?.jiraWorkflowAutonomous) {
		resolved = {
			...resolved,
			autoRunReadOnlyTools: true,
			requireApprovalForEdits: false,
			requireApprovalForMcpTools: false,
			requireApprovalForTerminal: false,
			batchEditsInSingleApproval: true,
			suggestedAutoApplyEdits: true,
		};
	}

	return resolved;
}
