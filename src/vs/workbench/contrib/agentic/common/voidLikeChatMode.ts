/*--------------------------------------------------------------------------------------
 *  Agentic AI — Void-style simple chat (minimal orchestration UI + loop)
 *--------------------------------------------------------------------------------------*/

import type { QueryComplexity } from './agentPipeline.js';
import type { ComposerAgentModeId } from './agentModes.js';
import type { AgenticSettings } from './agenticSettingsTypes.js';

export type AgentRunUiMode = 'void-simple' | 'orchestrated';

/** True when the run should behave like Void SidebarChat: thin chrome, no workflow strip. */
export function resolveAgentRunUiMode(opts: {
	complexity: QueryComplexity;
	planOnlyMode: boolean;
	agentModeId?: ComposerAgentModeId;
	workflowExecuteGated?: boolean;
	forceOrchestrated?: boolean;
}): AgentRunUiMode {
	if (opts.forceOrchestrated) {
		return 'orchestrated';
	}
	if (opts.planOnlyMode || opts.workflowExecuteGated) {
		return 'orchestrated';
	}
	if (opts.agentModeId === 'plan' || opts.agentModeId === 'debug') {
		return 'orchestrated';
	}
	if (opts.complexity === 'simple') {
		return 'void-simple';
	}
	return 'orchestrated';
}

export function isVoidLikeSimpleUiMode(mode: AgentRunUiMode | undefined): boolean {
	return mode === 'void-simple';
}

/** Max in-loop plan nudges for void-simple (Void has none). */
export function voidLikeMaxPlanNudges(mode: AgentRunUiMode | undefined): number {
	return isVoidLikeSimpleUiMode(mode) ? 1 : 5;
}

export function shouldSkipWorkflowChrome(mode: AgentRunUiMode | undefined): boolean {
	return isVoidLikeSimpleUiMode(mode);
}

export function defaultCapabilityProfileForVoidLike(settings: AgenticSettings): AgenticSettings['capabilityProfile'] {
	return settings.capabilityProfile === 'autonomous' ? 'autonomous' : 'standard';
}
