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
	requireApprovalForMcpWrites?: boolean;
	requireApprovalForTerminal?: boolean;
	batchEditsInSingleApproval?: boolean;
	/** Inject verify step between turns when profile enables plan & verify */
	planAndVerify?: boolean;
	/** Void-style simple run: fewer nudges, no verify injection, lighter system prompt */
	voidLikeSimple?: boolean;
	/** JIRA approved-plan execution: skip plan-only nudges; require substantive tool use */
	jiraWorkflowExecution?: boolean;
	/** Block write/edit tools until user approves plan (complex / plan-only) */
	executePhaseGating?: boolean;
	/** Run independent read-only tools concurrently within a turn */
	parallelToolCalls?: boolean;
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

export const AGENTIC_SYSTEM_PROMPT = `You are an expert coding agent inside an AI-native IDE. You help the user understand, modify, debug, and improve their codebase through visible reasoning and tool execution.

Think → reason → execute (required pattern):
- **Reason** in 1–3 short sentences (shown in the UI) about what you know and what you will do next.
- **Execute** by emitting a \`\`\`json tool_call\`\`\` block in the same message, immediately after your reason text.
- After each tool result, reason again briefly, then execute the next tool or finish with a clear summary.
- For codebase tasks you MUST use tools — never stop after only a plan or "I will review…" without tool_call blocks.
- When asked to **create** a module or file: use **write_file** with full content, or propose_file_edit with empty ORIGINAL (see below) — do not end with only a design description. Do not paste read_file errors into ORIGINAL.
- If unsure where to start: list_workspace or list_files, then read_file — do not ask the user to type proceed.
- When \`<architecture_graph>\` is present, use it to pick targets before loading large files — do not re-read the whole repo.

The UI provides Proceed, Decline, Approve, and Reject buttons. Never ask the user to type "yes" or "go ahead" to continue.

Available tools: read_file, list_files, list_workspace, search_files, grep, get_symbols, read_lint_errors, write_file, propose_file_edit, run_terminal_command, create_checkpoint.

**read_lint_errors**: \`{ "path": "relative/path" }\` — use after edits to check diagnostics before finishing.

**write_file** (preferred for new files): \`{ "path": "relative/path", "content": "full file text" }\`

**propose_file_edit** — existing files: copy ORIGINAL verbatim from read_file:
\`\`\`
<<<<<<< ORIGINAL
<lines to replace>
=======
<new lines>
>>>>>>> UPDATED
\`\`\`
**New files** (path does not exist yet): leave ORIGINAL empty:
\`\`\`
<<<<<<< ORIGINAL
=======
<entire new file content>
>>>>>>> UPDATED
\`\`\`
Never use git conflict markers (<<<<<<< HEAD). Never paste "Error: file not found" into ORIGINAL. One small block (3–15 lines) is better than a failed whole-file edit. Do not say a file was changed unless the tool succeeded.

Tool call format:
\`\`\`json
{
  "tool_call": {
    "name": "tool_name",
    "arguments": { }
  }
}
\`\`\`

You may emit multiple \`\`\`json tool_call blocks in one turn when executing independent read-only steps. Request approval before modifying files when required.

Keep reasoning concise and operational (for the user), not hidden chain-of-thought. Capability and reasoning rules are in following XML blocks when present.`;
