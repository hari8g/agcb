/*--------------------------------------------------------------------------------------
 *  Agentic AI — LLM / runtime message types
 *--------------------------------------------------------------------------------------*/

import type { AgentEvent } from './agenticTypes.js';
import type { CodebaseContext } from './contextTypes.js';
import type { AgentRuntimeMode } from './agentRuntimeTypes.js';
import type { VoidProviderConfig } from './voidProviderConfig.js';
import type { SerializableMcpTool } from './mcp/agenticMcpTypes.js';
import { AGENTIC_TOOLS } from './toolTypes.js';

export { convertToRuntimeRequest, convertThreadToLLMMessages, buildContextBlock } from './convertToLLMMessageService.js';
export type { ConvertToLLMOptions } from './convertToLLMMessageService.js';

export type LLMMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMMessage {
	role: LLMMessageRole;
	content: string;
	name?: string;
}

export interface RuntimeRequestOptions {
	runtimeMode: AgentRuntimeMode;
	model: string;
	temperature?: number;
	maxTokens?: number;
	autoApplyEdits: boolean;
	autoRunReadOnlyTools: boolean;
	requireApprovalForEdits: boolean;
	maxAgentTurns: number;
	requireApprovalForMcpTools?: boolean;
	/** External gateway base URL when runtimeMode is external_agent_runtime */
	externalGatewayUrl?: string;
	apiKeyEnvVar?: string;
	requestTimeoutMs?: number;
}

export interface RuntimeRequest {
	runId: string;
	threadId: string;
	messages: LLMMessage[];
	context: CodebaseContext;
	options: RuntimeRequestOptions;
	/** When set, electron-main uses Void's provider stack (same keys/streaming as Chat). */
	voidProvider?: VoidProviderConfig;
	tools: typeof AGENTIC_TOOLS;
	/** MCP tools snapshot from connected servers (JIRA/Atlassian, etc.) */
	mcpTools?: SerializableMcpTool[];
	/** Env vars from mcp.json per server (e.g. atlassian → ATLASSIAN_SITE) */
	mcpServerEnv?: Record<string, Record<string, string | undefined>>;
	/** When set, append JIRA workflow instructions */
	jiraWorkflowIssueKey?: string;
}

export interface RuntimeResponse {
	runId: string;
	finalText: string;
}

export interface RuntimeStreamEvent {
	requestId: string;
	event: AgentEvent;
}

export const AGENTIC_SYSTEM_PROMPT = `You are an expert coding agent inside an AI-native IDE. You help the user understand, modify, debug, and improve their codebase. You must reason carefully, use tools when needed, avoid unnecessary edits, and request approval before modifying files.

Available tools include: read_file, list_files, list_workspace, search_files, grep, get_symbols, propose_file_edit, run_terminal_command, create_checkpoint.

When you need to call a tool, output a single JSON object in a fenced code block with language "json":
\`\`\`json
{
  "tool_call": {
    "name": "tool_name",
    "arguments": { }
  }
}
\`\`\`

After a tool runs you will receive the result and may continue. Use one tool per turn when possible.

Do not expose private chain-of-thought. Give concise operational summaries only when explaining what you are doing.`;
