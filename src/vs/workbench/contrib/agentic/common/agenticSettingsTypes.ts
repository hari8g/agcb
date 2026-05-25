/*--------------------------------------------------------------------------------------
 *  Agentic AI — user settings (stored in workspace/global storage, no secrets)
 *--------------------------------------------------------------------------------------*/

import type { AgentRuntimeMode } from './agentRuntimeTypes.js';
import type { ApprovalMode } from './approvalPresets.js';
import type { AgentCapabilities, AgentCapabilityProfile } from './agentCapabilities.js';

export type AgenticProviderType = 'void' | 'openai_compatible' | 'external';

export interface AgenticSettings {
	runtimeMode: AgentRuntimeMode;
	runtimeBaseUrl: string;
	/** Name of env var holding API key for openai_compatible / external */
	apiKeyEnvVar: string;
	model: string;
	providerType: AgenticProviderType;
	autoRunReadOnlyTools: boolean;
	requireApprovalForEdits: boolean;
	maxAgentTurns: number;
	requestTimeoutMs: number;
	/** Enable JIRA MCP workflow when issue keys are detected */
	enableJiraWorkflow: boolean;
	/** Require approval for MCP tools (overrides Void global when true) */
	requireApprovalForMcpTools: boolean;
	/** Trust preset: maps to approval flags at runtime (advanced checkboxes still stored) */
	approvalMode: ApprovalMode;
	/** Capability bundle: Standard / Pro / Autonomous */
	capabilityProfile: AgentCapabilityProfile;
	/** Per-capability overrides on top of the profile */
	capabilityOverrides: Partial<AgentCapabilities>;
	/** Open files in the main editor when the agent reads or proposes edits */
	revealTouchedFilesInEditor: boolean;
	/** After a plan-only finish, automatically send an orchestrator nudge (new turn) */
	autoContinueOnStall: boolean;
	/** Build a cached temporal architecture graph before LLM calls (saves tokens on large repos) */
	enableKnowledgeGraph: boolean;
	/** Max characters for the codebase context block sent to the model */
	maxContextChars: number;
	/** Omit full active file body when graph + search already cover the task */
	compactActiveFileInContext: boolean;
	/** Cursor-style: minimal upfront context; agent pulls via tools */
	dynamicContextDiscovery: boolean;
	/** Inject .voidrules / .cursorrules into agent system prompt */
	useWorkspaceRules: boolean;
	/** After applying edits, inject lint diagnostics into the active run */
	postEditLintVerify: boolean;
	/** Persist user preferences and project facts across threads in this workspace */
	enableSessionMemory: boolean;
	/** Mirror agent workflow + backend logs to browser DevTools console */
	debugWorkflowToDevTools: boolean;
	/** Include stream deltas in DevTools (noisy) */
	debugWorkflowVerbose: boolean;
	/** Bumped when default orchestration / approval behavior changes (migration) */
	settingsRevision?: number;
}

const CURRENT_SETTINGS_REVISION = 3;

export const AGENTIC_SETTINGS_STORAGE_KEY = 'agentic.settings.v1';

export const DEFAULT_AGENTIC_SETTINGS: AgenticSettings = {
	runtimeMode: 'local_provider',
	runtimeBaseUrl: '',
	apiKeyEnvVar: 'OPENAI_API_KEY',
	model: 'gpt-4o-mini',
	providerType: 'void',
	autoRunReadOnlyTools: true,
	requireApprovalForEdits: false,
	maxAgentTurns: 40,
	requestTimeoutMs: 120_000,
	enableJiraWorkflow: true,
	requireApprovalForMcpTools: false,
	approvalMode: 'fast',
	capabilityProfile: 'standard',
	capabilityOverrides: {},
	revealTouchedFilesInEditor: true,
	autoContinueOnStall: false,
	enableKnowledgeGraph: true,
	maxContextChars: 14_000,
	compactActiveFileInContext: true,
	dynamicContextDiscovery: true,
	useWorkspaceRules: true,
	postEditLintVerify: true,
	enableSessionMemory: true,
	debugWorkflowToDevTools: true,
	debugWorkflowVerbose: false,
	settingsRevision: CURRENT_SETTINGS_REVISION,
};

/** Apply one-time upgrades when orchestration defaults change. */
export function migrateAgenticSettings(settings: AgenticSettings): AgenticSettings {
	const rev = settings.settingsRevision ?? 1;
	if (rev >= CURRENT_SETTINGS_REVISION) {
		return settings;
	}
	const merged: AgenticSettings = {
		...DEFAULT_AGENTIC_SETTINGS,
		...settings,
		approvalMode: 'fast',
		requireApprovalForEdits: false,
		requireApprovalForMcpTools: false,
		settingsRevision: CURRENT_SETTINGS_REVISION,
	};
	if (rev < 3) {
		if (merged.capabilityProfile === 'pro') {
			merged.capabilityProfile = 'standard';
		}
		merged.autoContinueOnStall = false;
		merged.settingsRevision = CURRENT_SETTINGS_REVISION;
	}
	if (merged.maxAgentTurns <= 12) {
		merged.maxAgentTurns = DEFAULT_AGENTIC_SETTINGS.maxAgentTurns;
	}
	return merged;
}

export function mergeAgenticSettings(partial?: Partial<AgenticSettings>): AgenticSettings {
	return migrateAgenticSettings({ ...DEFAULT_AGENTIC_SETTINGS, ...partial });
}
