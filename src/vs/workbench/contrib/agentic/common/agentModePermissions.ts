/*--------------------------------------------------------------------------------------
 *  Agentic AI — per composer mode (agent / plan / debug) tool & approval behavior
 *--------------------------------------------------------------------------------------*/

import type { ComposerAgentModeId } from './agentModes.js';
import { getComposerAgentMode } from './agentModes.js';
import type { ResolvedApprovalOptions } from './approvalPresets.js';
import { resolveApprovalOptions } from './approvalPresets.js';
import type { AgenticSettings } from './agenticSettingsTypes.js';

export interface ModePermissionOverlay {
	/** Extra system prompt block for this mode */
	systemBlock: string;
	/** Force plan-only execute gating regardless of complexity */
	forcePlanOnly?: boolean;
	/** Override: block all write tools until user approves plan */
	blockWritesUntilPlanApproved?: boolean;
	/** Debug: prefer read-only tools first */
	preferDiagnostics?: boolean;
}

const MODE_OVERLAYS: Record<ComposerAgentModeId, ModePermissionOverlay> = {
	agent: {
		systemBlock: [
			'<composer_mode>agent</composer_mode>',
			'Implement directly with tools — minimal planning prose.',
			'For **new files / apps / scaffolding**: use `write_file` immediately with full contents; at most one `read_file` if the path is unclear.',
			'Do not wait for user approval between files on straightforward create tasks.',
		].join('\n'),
	},
	plan: {
		systemBlock: [
			'<composer_mode>plan</composer_mode>',
			'You are in **Plan** mode. Produce a clear, actionable plan only.',
			'Do **not** call write_file, propose_file_edit, apply_file_edit, or restore_checkpoint until the user approves execution.',
			'You **may** use read_file, list_files, grep, search_files, get_symbols, read_lint_errors, and create_checkpoint.',
		].join('\n'),
		forcePlanOnly: true,
		blockWritesUntilPlanApproved: true,
	},
	debug: {
		systemBlock: [
			'<composer_mode>debug</composer_mode>',
			'You are in **Debug** mode. Gather evidence before changing code.',
			'Prefer: read_file, read_lint_errors, grep, run_terminal_command (tests), get_symbols.',
			'State root cause and reproduction steps before proposing fixes.',
			'Use propose_file_edit or write_file only after identifying the failure.',
		].join('\n'),
		preferDiagnostics: true,
	},
};

export function getModePermissionOverlay(modeId: ComposerAgentModeId | undefined): ModePermissionOverlay {
	return MODE_OVERLAYS[modeId ?? 'agent'] ?? MODE_OVERLAYS.agent;
}

export function resolveApprovalOptionsForMode(
	settings: Pick<AgenticSettings, 'approvalMode' | 'autoRunReadOnlyTools' | 'requireApprovalForEdits' | 'requireApprovalForMcpTools'>,
	thread?: { autoApplyEdits?: boolean; jiraWorkflowAutonomous?: boolean; agentModeId?: ComposerAgentModeId },
): ResolvedApprovalOptions {
	const base = resolveApprovalOptions(settings, thread);
	const mode = getComposerAgentMode(thread?.agentModeId);
	const overlay = getModePermissionOverlay(mode.id);

	if (mode.id === 'plan' || overlay.blockWritesUntilPlanApproved) {
		return {
			...base,
			requireApprovalForEdits: true,
			suggestedAutoApplyEdits: false,
			autoRunReadOnlyTools: true,
		};
	}
	if (mode.id === 'debug') {
		return {
			...base,
			requireApprovalForEdits: base.requireApprovalForEdits,
			autoRunReadOnlyTools: true,
			batchEditsInSingleApproval: true,
		};
	}
	if (mode.id === 'agent' && settings.approvalMode !== 'cautious') {
		return {
			...base,
			requireApprovalForEdits: false,
			autoRunReadOnlyTools: true,
			batchEditsInSingleApproval: true,
			suggestedAutoApplyEdits: true,
		};
	}
	return base;
}

export function buildComposerModeSystemBlock(modeId: ComposerAgentModeId | undefined): string {
	return getModePermissionOverlay(modeId).systemBlock.trim();
}

export function shouldForcePlanOnlyForMode(modeId: ComposerAgentModeId | undefined): boolean {
	return getModePermissionOverlay(modeId).forcePlanOnly === true
		|| getComposerAgentMode(modeId).agentRunMode === 'plan_only';
}
