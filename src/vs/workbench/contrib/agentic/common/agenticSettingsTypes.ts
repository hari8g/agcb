/*--------------------------------------------------------------------------------------
 *  Agentic AI — user settings (stored in workspace/global storage, no secrets)
 *--------------------------------------------------------------------------------------*/

import type { AgentRuntimeMode } from './agentRuntimeTypes.js';

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
}

export const AGENTIC_SETTINGS_STORAGE_KEY = 'agentic.settings.v1';

export const DEFAULT_AGENTIC_SETTINGS: AgenticSettings = {
	runtimeMode: 'local_provider',
	runtimeBaseUrl: '',
	apiKeyEnvVar: 'OPENAI_API_KEY',
	model: 'gpt-4o-mini',
	providerType: 'void',
	autoRunReadOnlyTools: true,
	requireApprovalForEdits: true,
	maxAgentTurns: 12,
	requestTimeoutMs: 120_000,
	enableJiraWorkflow: true,
	requireApprovalForMcpTools: true,
};

export function mergeAgenticSettings(partial?: Partial<AgenticSettings>): AgenticSettings {
	return { ...DEFAULT_AGENTIC_SETTINGS, ...partial };
}
