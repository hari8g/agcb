/*--------------------------------------------------------------------------------------
 *  Agentic AI — convert chat thread → runtime LLM messages
 *--------------------------------------------------------------------------------------*/

import type { ChatThread } from './agenticTypes.js';
import type { CodebaseContext } from './contextTypes.js';
import type { AgentRuntimeMode } from './agentRuntimeTypes.js';
import type { AgenticSettings } from './agenticSettingsTypes.js';
import { AGENTIC_TOOLS } from './toolTypes.js';
import type { LLMMessage, RuntimeRequest, RuntimeRequestOptions } from './llmMessageTypes.js';
import { AGENTIC_SYSTEM_PROMPT } from './llmMessageTypes.js';
import { buildMcpToolsPromptBlock } from './mcp/buildMcpToolPrompt.js';
import { buildJiraContextBlock } from './mcp/jiraContextExtractor.js';
import { buildJiraToolRegistryPromptBlock } from './mcp/jiraToolRegistry.js';
import { JIRA_MCP_DIAGNOSTICS_LLM_HINT } from './mcp/jiraMcpDiagnostics.js';
import { JIRA_WORKFLOW_SYSTEM_PROMPT } from './mcp/jiraWorkflow.js';
import type { SerializableMcpTool } from './mcp/agenticMcpTypes.js';

export interface ConvertToLLMOptions {
	runtimeMode: AgentRuntimeMode;
	model: string;
	settings: Pick<AgenticSettings, 'autoRunReadOnlyTools' | 'requireApprovalForEdits' | 'requireApprovalForMcpTools' | 'maxAgentTurns'>;
	autoApplyEdits?: boolean;
	mcpTools?: SerializableMcpTool[];
	mcpServerEnv?: Record<string, Record<string, string | undefined>>;
	jiraWorkflowIssueKey?: string;
	/** Injected live ATLASSIAN_* probe (main-process fs). */
	jiraEnvDiagnosticsPrompt?: string;
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
}): string {
	const blocks = [AGENTIC_SYSTEM_PROMPT];
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
	if (opts.jiraEnvDiagnosticsPrompt) {
		blocks.push(opts.jiraEnvDiagnosticsPrompt);
	}
	return blocks.join('\n\n');
}

export function convertThreadToLLMMessages(
	thread: ChatThread,
	context: CodebaseContext,
	opts?: Pick<ConvertToLLMOptions, 'mcpTools' | 'jiraWorkflowIssueKey' | 'jiraEnvDiagnosticsPrompt'>,
): LLMMessage[] {
	const contextBlock = buildContextBlock(context);
	const history: LLMMessage[] = [];

	for (const m of thread.messages.slice(-40)) {
		if (m.role === 'user' || m.role === 'assistant') {
			if (m.content.trim()) {
				history.push({ role: m.role, content: m.content });
			}
		}
		if (m.role === 'assistant' && m.toolResults?.length) {
			for (const tr of m.toolResults) {
				history.push({
					role: 'tool',
					content: tr.content,
					name: tr.toolCallId,
				});
			}
		}
	}

	return [
		{ role: 'system', content: buildAgenticSystemPrompt(opts ?? {}) },
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
	const messages = convertThreadToLLMMessages(thread, context, {
		mcpTools: options.mcpTools,
		jiraWorkflowIssueKey: options.jiraWorkflowIssueKey,
		jiraEnvDiagnosticsPrompt: options.jiraEnvDiagnosticsPrompt,
	});
	const runtimeOptions: RuntimeRequestOptions = {
		runtimeMode: options.runtimeMode,
		model: options.model,
		autoApplyEdits: options.autoApplyEdits ?? false,
		autoRunReadOnlyTools: options.settings.autoRunReadOnlyTools,
		requireApprovalForEdits: options.settings.requireApprovalForEdits,
		maxAgentTurns: options.settings.maxAgentTurns,
		requireApprovalForMcpTools: options.settings.requireApprovalForMcpTools,
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
