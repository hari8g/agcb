/*--------------------------------------------------------------------------------------
 *  Agentic AI — capability profiles and runtime behavior flags
 *--------------------------------------------------------------------------------------*/

import type { AgenticSettings } from './agenticSettingsTypes.js';

export type AgentCapabilityProfile = 'standard' | 'pro' | 'autonomous';

export interface AgentCapabilities {
	/** Index-backed semantic search over the workspace */
	semanticCodebaseSearch: boolean;
	/** Model may emit multiple tool JSON blocks in one turn */
	parallelToolCalls: boolean;
	/** Plan → act → verify loop in instructions */
	planAndVerify: boolean;
	/** create_checkpoint tool + rollback guidance */
	checkpoints: boolean;
	/** run_terminal_command tool */
	terminalExecution: boolean;
	/** MCP tools from connected servers */
	mcpIntegrations: boolean;
	/** JIRA keys + workflow when settings allow */
	jiraWorkflow: boolean;
	/** Longer chat history in LLM context */
	extendedThreadMemory: boolean;
	/** Git branch / diff awareness in prompts (context when available) */
	gitAwareness: boolean;
}

export interface ResolvedAgentCapabilities extends AgentCapabilities {
	historyMessageLimit: number;
	maxSemanticMatches: number;
}

export type AgentCapabilityId = keyof AgentCapabilities;

export interface AgentCapabilityDefinition {
	id: AgentCapabilityId;
	label: string;
	description: string;
}

export const AGENT_CAPABILITY_CATALOG: AgentCapabilityDefinition[] = [
	{ id: 'semanticCodebaseSearch', label: 'Semantic codebase search', description: 'Rank relevant files and snippets from the workspace index before each run.' },
	{ id: 'parallelToolCalls', label: 'Parallel tool calls', description: 'Run multiple read/search tools in a single agent turn when the model requests them.' },
	{ id: 'planAndVerify', label: 'Plan & verify', description: 'Outline steps, execute tools, then validate results before finishing.' },
	{ id: 'checkpoints', label: 'Checkpoints', description: 'Save rollback points before large edits via the create_checkpoint tool.' },
	{ id: 'terminalExecution', label: 'Terminal execution', description: 'Run shell commands (build, test, install) with user approval when required.' },
	{ id: 'mcpIntegrations', label: 'MCP integrations', description: 'Use tools from connected MCP servers (JIRA, APIs, custom servers).' },
	{ id: 'jiraWorkflow', label: 'JIRA workflow', description: 'Detect issue keys in chat and enrich context from JIRA MCP.' },
	{ id: 'extendedThreadMemory', label: 'Extended thread memory', description: 'Include more prior messages in the model context for long sessions.' },
	{ id: 'gitAwareness', label: 'Git awareness', description: 'Use branch and workspace context when reasoning about changes.' },
];

const PROFILE_DEFAULTS: Record<AgentCapabilityProfile, ResolvedAgentCapabilities> = {
	standard: {
		semanticCodebaseSearch: true,
		parallelToolCalls: false,
		planAndVerify: false,
		checkpoints: true,
		terminalExecution: false,
		mcpIntegrations: true,
		jiraWorkflow: true,
		extendedThreadMemory: false,
		gitAwareness: true,
		historyMessageLimit: 32,
		maxSemanticMatches: 8,
	},
	pro: {
		semanticCodebaseSearch: true,
		parallelToolCalls: true,
		planAndVerify: true,
		checkpoints: true,
		terminalExecution: true,
		mcpIntegrations: true,
		jiraWorkflow: true,
		extendedThreadMemory: true,
		gitAwareness: true,
		historyMessageLimit: 56,
		maxSemanticMatches: 14,
	},
	autonomous: {
		semanticCodebaseSearch: true,
		parallelToolCalls: true,
		planAndVerify: true,
		checkpoints: true,
		terminalExecution: true,
		mcpIntegrations: true,
		jiraWorkflow: true,
		extendedThreadMemory: true,
		gitAwareness: true,
		historyMessageLimit: 80,
		maxSemanticMatches: 18,
	},
};

export const AGENT_CAPABILITY_PROFILE_LABELS: Record<AgentCapabilityProfile, string> = {
	standard: 'Standard',
	pro: 'Pro',
	autonomous: 'Autonomous',
};

export function resolveAgentCapabilities(
	settings: Pick<AgenticSettings, 'capabilityProfile' | 'capabilityOverrides' | 'enableJiraWorkflow'>,
): ResolvedAgentCapabilities {
	const profile = settings.capabilityProfile ?? 'pro';
	const base = { ...PROFILE_DEFAULTS[profile] };
	const overrides = settings.capabilityOverrides ?? {};
	const merged: ResolvedAgentCapabilities = { ...base, ...overrides };
	if (overrides.extendedThreadMemory === true) {
		merged.historyMessageLimit = PROFILE_DEFAULTS.pro.historyMessageLimit;
	} else if (overrides.extendedThreadMemory === false) {
		merged.historyMessageLimit = PROFILE_DEFAULTS.standard.historyMessageLimit;
	}
	merged.jiraWorkflow = merged.jiraWorkflow && settings.enableJiraWorkflow;
	return merged;
}

export function buildCapabilitiesSystemPromptBlock(caps: ResolvedAgentCapabilities): string {
	const lines: string[] = ['<agent_capabilities>'];

	switch (caps.parallelToolCalls) {
		case true:
			lines.push('- You may call multiple tools in one turn by emitting several ```json tool_call blocks. Prefer batching independent read-only tools (read_file, grep, search_files, list_files) together.');
			break;
		default:
			lines.push('- Use one tool per turn unless the user explicitly asks for parallel work.');
	}

	if (caps.planAndVerify) {
		lines.push('- For non-trivial tasks: at most 2 sentences of plan, then call tools in the same turn; after results, verify (re-read, test) before declaring done. Never end a turn with only a plan.');
	}

	if (caps.semanticCodebaseSearch) {
		lines.push('- Use semantic matches in codebase_context and search/grep tools to ground answers in real project files—do not invent paths.');
	}

	if (caps.checkpoints) {
		lines.push('- Before large or risky multi-file edits, call create_checkpoint with a short label.');
	}

	if (caps.terminalExecution) {
		lines.push('- You may use run_terminal_command for builds and tests; prefer non-destructive commands and explain what you run.');
	} else {
		lines.push('- Do not use run_terminal_command unless the user explicitly requests a shell command.');
	}

	if (caps.mcpIntegrations) {
		lines.push('- Use MCP tools when they match the task (see MCP tool list). Respect approval gates for writes.');
	}

	if (caps.jiraWorkflow) {
		lines.push('- JIRA issue keys in context are authoritative; use fetch_jira_issue / MCP tools for ticket data.');
	}

	if (caps.gitAwareness) {
		lines.push('- Consider git branch and recent edits when proposing changes.');
	}

	lines.push('</agent_capabilities>');
	return lines.join('\n');
}

export function getActiveCapabilityLabels(caps: ResolvedAgentCapabilities): string[] {
	return AGENT_CAPABILITY_CATALOG
		.filter(def => caps[def.id])
		.map(def => def.label);
}
