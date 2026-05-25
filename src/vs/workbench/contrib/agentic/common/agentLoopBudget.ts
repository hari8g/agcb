/*--------------------------------------------------------------------------------------
 *  Agentic AI — turn budget, progress extensions, graceful loop limits
 *--------------------------------------------------------------------------------------*/

import type { AgentCapabilityProfile } from './agentCapabilities.js';
import type { AgenticSettings } from './agenticSettingsTypes.js';

/** Model-call turns per profile (orchestrator nudges/bootstrap do not consume these). */
export const PROFILE_MODEL_TURN_BUDGET: Record<AgentCapabilityProfile, number> = {
	standard: 28,
	pro: 40,
	autonomous: 56,
};

/** Extra model turns granted when the run is making progress (tools ran recently). */
export const PROGRESS_EXTENSION_TURNS = 14;
export const MAX_PROGRESS_EXTENSIONS = 4;

/** Absolute ceiling regardless of profile/extensions. */
export const HARD_MAX_MODEL_TURNS = 80;

export interface LoopProgressState {
	toolsExecutedInRun: number;
	toolsInLastModelTurn: number;
	consecutiveNoToolTurns: number;
	progressExtensionsGranted: number;
	planNudges: number;
	bootstrapUsed: boolean;
	/** write_file / propose_file_edit / apply_file_edit that returned success this run */
	successfulFileEditsInRun: number;
	successfulEditPaths: Set<string>;
	/** Injected once when propose_file_edit fails after write_file already succeeded */
	editAlreadyDeliveredNudgeUsed: boolean;
	/** Bootstrap read_file returned real file contents */
	bootstrapReadDelivered: boolean;
	/** One-shot nudge to write after a successful bootstrap read */
	postReadEditNudgeUsed: boolean;
}

export function createLoopProgressState(): LoopProgressState {
	return {
		toolsExecutedInRun: 0,
		toolsInLastModelTurn: 0,
		consecutiveNoToolTurns: 0,
		progressExtensionsGranted: 0,
		planNudges: 0,
		bootstrapUsed: false,
		successfulFileEditsInRun: 0,
		successfulEditPaths: new Set(),
		editAlreadyDeliveredNudgeUsed: false,
		bootstrapReadDelivered: false,
		postReadEditNudgeUsed: false,
	};
}

/** Effective model-turn limit from settings + profile (migrates legacy low values). */
export function resolveEffectiveMaxAgentTurns(
	settings: Pick<AgenticSettings, 'maxAgentTurns' | 'capabilityProfile'>,
): number {
	const profile = settings.capabilityProfile ?? 'pro';
	const profileBudget = PROFILE_MODEL_TURN_BUDGET[profile];
	let fromSettings = settings.maxAgentTurns;
	if (!Number.isFinite(fromSettings) || fromSettings < 8) {
		fromSettings = profileBudget;
	}
	// Migrate persisted defaults from older builds (often 12).
	if (fromSettings <= 12) {
		fromSettings = profileBudget;
	}
	return Math.min(HARD_MAX_MODEL_TURNS, Math.max(fromSettings, profileBudget));
}

export function recordModelTurnOutcome(state: LoopProgressState, toolsThisTurn: number): void {
	state.toolsInLastModelTurn = toolsThisTurn;
	if (toolsThisTurn > 0) {
		state.toolsExecutedInRun += toolsThisTurn;
		state.consecutiveNoToolTurns = 0;
	} else {
		state.consecutiveNoToolTurns++;
	}
}

/** Grant more turns when tools ran and the agent is still working (not idle stall). */
export function shouldGrantProgressExtension(
	state: LoopProgressState,
	modelTurn: number,
	turnLimit: number,
): boolean {
	if (modelTurn < turnLimit) {
		return false;
	}
	if (state.progressExtensionsGranted >= MAX_PROGRESS_EXTENSIONS) {
		return false;
	}
	if (state.toolsExecutedInRun === 0) {
		return false;
	}
	if (state.consecutiveNoToolTurns >= 3) {
		return false;
	}
	return state.toolsInLastModelTurn > 0 || state.consecutiveNoToolTurns <= 1;
}

export function applyProgressExtension(state: LoopProgressState, turnLimit: number): number {
	state.progressExtensionsGranted++;
	return Math.min(HARD_MAX_MODEL_TURNS, turnLimit + PROGRESS_EXTENSION_TURNS);
}

export function turnBudgetActivityLine(modelTurn: number, turnLimit: number): string {
	return `Agent turn ${modelTurn + 1} of ${turnLimit}`;
}

export function buildGracefulTurnLimitMessage(opts: {
	userMessage: string;
	modelTurn: number;
	turnLimit: number;
	toolsExecuted: number;
	lastAssistantText?: string;
}): string {
	const preview = opts.lastAssistantText?.trim().slice(0, 400);
	const parts = [
		`I used ${opts.toolsExecuted} tool step(s) across ${opts.modelTurn} model turns (limit ${opts.turnLimit}).`,
		'This task may need more iterations — send **continue** or a narrower follow-up and I will pick up where we left off.',
	];
	if (preview) {
		parts.push('', 'Last progress:', preview);
	}
	return parts.join('\n');
}

export function buildProgressExtensionNudge(): string {
	return [
		'[Orchestrator] Turn budget extended because you are making progress.',
		'Continue reasoning briefly, then call tools or give a concise final summary.',
	].join(' ');
}
