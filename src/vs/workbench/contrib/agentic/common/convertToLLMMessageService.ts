/*--------------------------------------------------------------------------------------
 *  Agentic AI — convert chat thread → runtime LLM messages
 *--------------------------------------------------------------------------------------*/

import type { ChatThread } from './agenticTypes.js';
import type { CodebaseContext } from './contextTypes.js';
import type { AgentRuntimeMode } from './agentRuntimeTypes.js';
import type { AgenticSettings } from './agenticSettingsTypes.js';
import { buildComposerModeSystemBlock, resolveApprovalOptionsForMode } from './agentModePermissions.js';
import { AGENTIC_TOOLS } from './toolTypes.js';
import type { LLMMessage, RuntimeRequest, RuntimeRequestOptions } from './llmMessageTypes.js';
import { AGENTIC_SYSTEM_PROMPT } from './llmMessageTypes.js';
import { buildMcpToolsPromptBlock } from './mcp/buildMcpToolPrompt.js';
import { buildJiraContextBlock } from './mcp/jiraContextExtractor.js';
import { buildJiraToolRegistryPromptBlock } from './mcp/jiraToolRegistry.js';
import { JIRA_MCP_DIAGNOSTICS_LLM_HINT } from './mcp/jiraMcpDiagnostics.js';
import { JIRA_EXECUTION_RUN_PROMPT, JIRA_WORKFLOW_SYSTEM_PROMPT } from './mcp/jiraWorkflow.js';
import type { SerializableMcpTool } from './mcp/agenticMcpTypes.js';
import {
	buildCapabilitiesSystemPromptBlock,
	resolveAgentCapabilities,
	type ResolvedAgentCapabilities,
} from './agentCapabilities.js';
import { buildReasoningSystemPromptBlock } from './agentReasoning.js';
import { resolveEffectiveMaxAgentTurns } from './agentLoopBudget.js';
import { trimTextToBudget } from './contextBudget.js';
import { buildDynamicContextPromptBlock } from './workspaceRules.js';

export interface ConvertToLLMOptions {
	runtimeMode: AgentRuntimeMode;
	model: string;
	settings: Pick<AgenticSettings,
		'approvalMode' | 'autoRunReadOnlyTools' | 'requireApprovalForEdits' | 'requireApprovalForMcpTools' | 'maxAgentTurns'
		| 'capabilityProfile' | 'capabilityOverrides' | 'enableJiraWorkflow' | 'maxContextChars'
		| 'dynamicContextDiscovery' | 'useWorkspaceRules'>;
	autoApplyEdits?: boolean;
	workspaceRulesBlock?: string;
	skillSystemAddendum?: string;
	dynamicContextDiscovery?: boolean;
	planOnlyMode?: boolean;
	intentSystemBlock?: string;
	toolRouterSystemBlock?: string;
	executeGatingSystemBlock?: string;
	sessionMemoryBlock?: string;
	workflowOrchestrationBlock?: string;
	composerModeSystemBlock?: string;
	executePhaseGating?: boolean;
	voidLikeSimple?: boolean;
	jiraWorkflowExecution?: boolean;
	mcpTools?: SerializableMcpTool[];
	mcpServerEnv?: Record<string, Record<string, string | undefined>>;
	jiraWorkflowIssueKey?: string;
	/** Injected live ATLASSIAN_* probe (main-process fs). */
	jiraEnvDiagnosticsPrompt?: string;
	/** Override profile history cap (pipeline may tighten for token budget) */
	historyMessageLimit?: number;
	maxContextChars?: number;
}

export function buildContextBlock(context: CodebaseContext): string {
	const parts: string[] = ['<codebase_context>'];
	if (context.workspaceFolderUris.length) {
		parts.push(`Workspace folders:\n${context.workspaceFolderUris.join('\n')}`);
	}
	if (context.activeFilePath) {
		parts.push(`Active file: ${context.activeFilePath} (${context.activeFileLanguageId ?? 'unknown'})`);
		if (context.activeFileContent) {
			parts.push(`\`\`\`\n${context.activeFileContent}\n\`\`\``);
		}
	}
	if (context.selectedCode) {
		parts.push(`Selected code:\n\`\`\`\n${context.selectedCode}\n\`\`\``);
	}
	if (context.openTabs.length) {
		parts.push(`Open tabs: ${context.openTabs.map(t => t.path).join(', ')}`);
	}
	if (context.gitBranch) {
		parts.push(`Git branch: ${context.gitBranch}`);
	}
	if (context.recentFiles.length) {
		parts.push(`Recently edited: ${context.recentFiles.join(', ')}`);
	}
	if (context.codeGraph.knowledgeGraphDigest) {
		parts.push(context.codeGraph.knowledgeGraphDigest);
	}
	const cg = context.codeGraph;
	if (cg.semanticMatches.length) {
		parts.push('Relevant code snippets:');
		for (const m of cg.semanticMatches.slice(0, 8)) {
			parts.push(`- ${m.path} (score ${m.score.toFixed(2)}):\n${m.snippet}`);
		}
	}
	if (cg.symbols.length) {
		parts.push(`Symbols in scope: ${cg.symbols.slice(0, 40).join(', ')}`);
	}
	parts.push('</codebase_context>');

	const jiraBlock = buildJiraContextBlock(context.jiraIssues ?? []);
	if (jiraBlock) {
		parts.push(jiraBlock);
	}
	return parts.join('\n\n');
}

export function buildAgenticSystemPrompt(opts: {
	mcpTools?: SerializableMcpTool[];
	jiraWorkflowIssueKey?: string;
	jiraEnvDiagnosticsPrompt?: string;
	capabilities?: ResolvedAgentCapabilities;
	workspaceRulesBlock?: string;
	skillSystemAddendum?: string;
	dynamicContextDiscovery?: boolean;
	planOnlyMode?: boolean;
	intentSystemBlock?: string;
	toolRouterSystemBlock?: string;
	executeGatingSystemBlock?: string;
	sessionMemoryBlock?: string;
	workflowOrchestrationBlock?: string;
	composerModeSystemBlock?: string;
	jiraWorkflowExecution?: boolean;
}): string {
	const blocks = [AGENTIC_SYSTEM_PROMPT];
	if (opts.composerModeSystemBlock) {
		blocks.push(opts.composerModeSystemBlock);
	}
	if (opts.intentSystemBlock) {
		blocks.push(opts.intentSystemBlock);
	}
	if (opts.toolRouterSystemBlock) {
		blocks.push(opts.toolRouterSystemBlock);
	}
	if (opts.executeGatingSystemBlock) {
		blocks.push(opts.executeGatingSystemBlock);
	}
	if (opts.sessionMemoryBlock) {
		blocks.push(opts.sessionMemoryBlock);
	}
	if (opts.workflowOrchestrationBlock) {
		blocks.push(opts.workflowOrchestrationBlock);
	}
	if (opts.workspaceRulesBlock) {
		blocks.push(opts.workspaceRulesBlock);
	}
	if (opts.dynamicContextDiscovery) {
		blocks.push(buildDynamicContextPromptBlock());
	}
	if (opts.skillSystemAddendum) {
		blocks.push(opts.skillSystemAddendum);
	}
	if (opts.planOnlyMode) {
		blocks.push('PLAN ONLY: Do not modify files or run terminal commands until the user approves the plan.');
	}
	if (opts.capabilities) {
		blocks.push(buildReasoningSystemPromptBlock(opts.capabilities));
		blocks.push(buildCapabilitiesSystemPromptBlock(opts.capabilities));
	}
	const jiraRegistry = buildJiraToolRegistryPromptBlock(opts.mcpTools);
	if (jiraRegistry) {
		blocks.push(jiraRegistry);
	}
	const mcpBlock = buildMcpToolsPromptBlock(opts.mcpTools);
	if (mcpBlock) {
		blocks.push(mcpBlock);
	}
	if (opts.jiraWorkflowIssueKey) {
		blocks.push(JIRA_WORKFLOW_SYSTEM_PROMPT);
		blocks.push(`Active JIRA workflow ticket: ${opts.jiraWorkflowIssueKey}`);
		blocks.push('To load ticket details use **fetch_jira_issue** with the issue key — never call getJiraIssue directly.');
		blocks.push(JIRA_MCP_DIAGNOSTICS_LLM_HINT);
	}
	if (opts.jiraWorkflowExecution) {
		blocks.push(JIRA_EXECUTION_RUN_PROMPT);
	}
	if (opts.jiraEnvDiagnosticsPrompt) {
		blocks.push(opts.jiraEnvDiagnosticsPrompt);
	}
	return blocks.join('\n\n');
}

export function convertThreadToLLMMessages(
	thread: ChatThread,
	context: CodebaseContext,
	opts?: Pick<ConvertToLLMOptions, 'mcpTools' | 'jiraWorkflowIssueKey' | 'jiraEnvDiagnosticsPrompt' | 'settings'
		| 'workspaceRulesBlock' | 'skillSystemAddendum' | 'dynamicContextDiscovery' | 'planOnlyMode' | 'intentSystemBlock'
		| 'toolRouterSystemBlock' | 'executeGatingSystemBlock' | 'sessionMemoryBlock' | 'workflowOrchestrationBlock'
		| 'composerModeSystemBlock'> & {
		historyMessageLimit?: number;
		maxContextChars?: number;
	},
): LLMMessage[] {
	const caps = opts?.settings ? resolveAgentCapabilities(opts.settings) : undefined;
	const maxContext = opts?.maxContextChars ?? 14_000;
	const contextBlock = trimTextToBudget(buildContextBlock(context), maxContext);
	const history: LLMMessage[] = [];
	const historyLimit = opts?.historyMessageLimit ?? caps?.historyMessageLimit ?? 40;
	const recent = thread.messages.slice(-historyLimit);
	const compressOlder = recent.length > 8;

	for (let i = 0; i < recent.length; i++) {
		const m = recent[i]!;
		const isRecent = i >= recent.length - 4;
		if (m.role === 'user' || m.role === 'assistant') {
			if (m.content.trim()) {
				let content = compressOlder && !isRecent && m.role === 'assistant'
					? trimTextToBudget(m.content, 1200)
					: m.content;
				if (m.decision?.resolved && m.role === 'assistant') {
					content = trimTextToBudget(content, 2400);
				}
				history.push({ role: m.role, content });
			}
		}
		if (m.role === 'assistant' && m.toolResults?.length) {
			for (const tr of m.toolResults) {
				const content = compressOlder && !isRecent
					? trimTextToBudget(tr.content, 480)
					: tr.content;
				history.push({
					role: 'tool',
					content,
					name: tr.toolCallId,
				});
			}
		}
	}

	return [
		{
			role: 'system',
			content: buildAgenticSystemPrompt({
				...opts ?? {},
				capabilities: caps,
				workspaceRulesBlock: opts?.workspaceRulesBlock,
				skillSystemAddendum: opts?.skillSystemAddendum,
				dynamicContextDiscovery: opts?.dynamicContextDiscovery,
				planOnlyMode: opts?.planOnlyMode,
				intentSystemBlock: opts?.intentSystemBlock,
				toolRouterSystemBlock: opts?.toolRouterSystemBlock,
				executeGatingSystemBlock: opts?.executeGatingSystemBlock,
				sessionMemoryBlock: opts?.sessionMemoryBlock,
				workflowOrchestrationBlock: opts?.workflowOrchestrationBlock,
				composerModeSystemBlock: opts?.composerModeSystemBlock,
			}),
		},
		...(contextBlock ? [{ role: 'system' as const, content: contextBlock }] : []),
		...history,
	];
}

export function convertToRuntimeRequest(
	thread: ChatThread,
	context: CodebaseContext,
	options: ConvertToLLMOptions,
	runId: string,
): RuntimeRequest {
	const caps = resolveAgentCapabilities(options.settings);
	const messages = convertThreadToLLMMessages(thread, context, {
		mcpTools: options.mcpTools,
		jiraWorkflowIssueKey: options.jiraWorkflowIssueKey,
		jiraEnvDiagnosticsPrompt: options.jiraEnvDiagnosticsPrompt,
		settings: options.settings,
		historyMessageLimit: options.historyMessageLimit ?? caps.historyMessageLimit,
		maxContextChars: options.maxContextChars ?? options.settings.maxContextChars,
		workspaceRulesBlock: options.workspaceRulesBlock,
		skillSystemAddendum: options.skillSystemAddendum,
		dynamicContextDiscovery: options.dynamicContextDiscovery,
		planOnlyMode: options.planOnlyMode,
		intentSystemBlock: options.intentSystemBlock,
		toolRouterSystemBlock: options.toolRouterSystemBlock,
		executeGatingSystemBlock: options.executeGatingSystemBlock,
		sessionMemoryBlock: options.sessionMemoryBlock,
		workflowOrchestrationBlock: options.workflowOrchestrationBlock,
		composerModeSystemBlock: buildComposerModeSystemBlock(thread.agentModeId),
	});
	const approval = resolveApprovalOptionsForMode(options.settings, {
		autoApplyEdits: options.autoApplyEdits,
		jiraWorkflowAutonomous: thread.jiraWorkflowAutonomous,
		agentModeId: thread.agentModeId,
	});
	const runtimeOptions: RuntimeRequestOptions = {
		runtimeMode: options.runtimeMode,
		model: options.model,
		autoApplyEdits: (options.autoApplyEdits ?? false) || approval.suggestedAutoApplyEdits,
		autoRunReadOnlyTools: approval.autoRunReadOnlyTools,
		requireApprovalForEdits: approval.requireApprovalForEdits,
		maxAgentTurns: resolveEffectiveMaxAgentTurns(options.settings),
		requireApprovalForMcpTools: approval.requireApprovalForMcpTools,
		requireApprovalForMcpWrites: approval.requireApprovalForMcpWrites,
		requireApprovalForTerminal: approval.requireApprovalForTerminal,
		batchEditsInSingleApproval: approval.batchEditsInSingleApproval,
		planAndVerify: options.voidLikeSimple ? false : caps.planAndVerify,
		executePhaseGating: options.executePhaseGating,
		parallelToolCalls: caps.parallelToolCalls,
		voidLikeSimple: options.voidLikeSimple === true,
		jiraWorkflowExecution: options.jiraWorkflowExecution === true,
	};

	return {
		runId,
		threadId: thread.id,
		messages,
		context,
		options: runtimeOptions,
		tools: AGENTIC_TOOLS,
		mcpTools: options.mcpTools,
		mcpServerEnv: options.mcpServerEnv,
		jiraWorkflowIssueKey: options.jiraWorkflowIssueKey,
	};
}
