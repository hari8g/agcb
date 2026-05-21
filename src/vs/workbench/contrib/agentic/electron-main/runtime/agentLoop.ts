/*--------------------------------------------------------------------------------------
 *  Agentic AI — multi-turn agent loop (model ↔ tools)
 *--------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../../base/common/uuid.js';
import type { AgentEvent } from '../../common/agenticTypes.js';
import type { RuntimeRequest } from '../../common/llmMessageTypes.js';
import type { LLMMessage } from '../../common/llmMessageTypes.js';
import { getToolDefinition } from '../../common/toolTypes.js';
import { canAutoExecute, requiresUserApproval } from '../../common/toolPermission.js';
import { agenticLog } from '../../common/agenticObservability.js';
import { streamOpenAICompatibleChat, readOpenAIConfigFromEnv } from '../provider/openAICompatibleProvider.js';
import { streamViaVoidProvider } from '../provider/voidProviderStream.js';
import { executeAnyAgenticTool } from '../tools/agenticToolsService.js';
import { isAgenticMcpTool } from '../mcp/executeMcpTool.js';
import { isJiraVirtualReadTool, isJiraVirtualToolName } from '../mcp/jiraVirtualTools.js';
import { buildEditPreview } from '../tools/editTools.js';
import { extractToolCall } from '../../common/toolCallParser.js';
import { narrateModelThinking, narrateApproval } from '../../common/activityNarrative.js';

export type EmitFn = (type: AgentEvent['type'], payload: Record<string, unknown>) => void;

export interface AgentLoopState {
	messages: LLMMessage[];
	turn: number;
}

export interface PendingApprovalState {
	request: RuntimeRequest;
	workspaceRoot: string;
	toolCall: { name: string; arguments: Record<string, unknown> };
	toolId: string;
	messages: LLMMessage[];
	assistantText: string;
	config: { baseUrl: string; apiKey: string; model: string; temperature: number; maxTokens: number };
	ev: EmitFn;
}

const pendingApprovals = new Map<string, PendingApprovalState>();

export function getPendingApproval(requestId: string): PendingApprovalState | undefined {
	return pendingApprovals.get(requestId);
}

export function clearPendingApproval(requestId: string): void {
	pendingApprovals.delete(requestId);
}

export async function runAgentLoop(
	requestId: string,
	request: RuntimeRequest,
	workspaceRoot: string,
	ac: AbortController,
	ev: EmitFn,
): Promise<void> {
	const maxTurns = request.options.maxAgentTurns ?? 8;
	const messages: LLMMessage[] = [...request.messages];
	const runId = request.runId;

	agenticLog({ kind: 'runtime_request_started', runId, threadId: request.threadId });

	const envConfig = readOpenAIConfigFromEnv();
	const useVoid = !!request.voidProvider;
	const config = {
		baseUrl: request.options.externalGatewayUrl || envConfig.baseUrl || 'https://api.openai.com/v1',
		apiKey: process.env[request.options.apiKeyEnvVar ?? 'OPENAI_API_KEY'] ?? envConfig.apiKey ?? '',
		model: request.options.model || envConfig.model || 'gpt-4o-mini',
		temperature: request.options.temperature ?? envConfig.temperature ?? 0.2,
		maxTokens: request.options.maxTokens ?? envConfig.maxTokens ?? 4096,
	};

	if (!useVoid && !config.apiKey && request.options.runtimeMode !== 'external_agent_runtime') {
		ev('run_failed', { message: 'No API key configured. Set OPENAI_API_KEY or configure Chat in Agentic_MPS Settings.' });
		return;
	}

	const approvalOpts = {
		autoRunReadOnlyTools: request.options.autoRunReadOnlyTools,
		requireApprovalForEdits: request.options.requireApprovalForEdits,
		requireApprovalForMcpTools: request.options.requireApprovalForMcpTools,
	};
	const toolCtx = {
		workspaceRoot,
		runId,
		mcpTools: request.mcpTools,
		atlassianEnv: request.mcpServerEnv?.['atlassian'],
	};

	for (let turn = 0; turn < maxTurns; turn++) {
		if (ac.signal.aborted) {
			return;
		}

		agenticLog({ kind: 'agent_turn', runId, meta: { turn } });

		const modelLabel = useVoid
			? `${request.voidProvider!.providerName} / ${request.voidProvider!.modelName}`
			: config.model;

		ev('activity_narrative', {
			lineId: `turn-${turn}`,
			text: narrateModelThinking(turn, modelLabel),
			status: 'complete',
		});

		let fullText = '';
		let gotFirstToken = false;

		const onStreamDelta = (text: string) => {
			if (!gotFirstToken) {
				gotFirstToken = true;
				agenticLog({ kind: 'first_token_received', runId });
			}
			fullText += text;
			ev('model_stream_delta', { text });
		};

		try {
			if (useVoid && request.voidProvider) {
				await streamViaVoidProvider(request.voidProvider, messages, ac.signal, {
					onDelta: onStreamDelta,
					onDone: () => { },
					onError: (message) => ev('run_failed', { message }),
				});
			} else {
				await streamOpenAICompatibleChat(
					config,
					messages.map(m => ({ role: m.role, content: m.content })),
					ac.signal,
					{
						onDelta: onStreamDelta,
						onDone: () => { },
						onError: (message) => ev('run_failed', { message }),
					},
				);
			}
		} catch (e) {
			ev('run_failed', { message: e instanceof Error ? e.message : String(e) });
			return;
		}

		if (ac.signal.aborted) {
			return;
		}

		const toolCall = extractToolCall(fullText);
		if (!toolCall) {
			ev('run_completed', { finalText: fullText });
			agenticLog({ kind: 'thread_completed', runId, threadId: request.threadId });
			return;
		}

		const def = getToolDefinition(toolCall.name);
		const isMcp = isAgenticMcpTool(toolCall.name, request.mcpTools)
			|| (isJiraVirtualToolName(toolCall.name) && !isJiraVirtualReadTool(toolCall.name));
		const toolId = generateUuid();
		ev('tool_call_started', {
			toolCallId: toolId,
			name: toolCall.name,
			arguments: toolCall.arguments,
		});
		const needsApproval = requiresUserApproval(toolCall.name, approvalOpts, def, isMcp)
			&& !canAutoExecute(toolCall.name, approvalOpts, def, isMcp)
			&& !(request.options.autoApplyEdits && toolCall.name === 'propose_file_edit');

		if (needsApproval) {
			const preview = toolCall.name === 'propose_file_edit'
				? buildEditPreview(String(toolCall.arguments.path ?? ''), String(toolCall.arguments.searchReplaceBlocks ?? ''))
				: null;

			ev('approval_required', {
				approvalId: generateUuid(),
				toolCallId: toolId,
				title: `Approve ${toolCall.name}`,
				description: preview?.previewSummary ?? JSON.stringify(toolCall.arguments),
				preview: preview?.searchReplaceBlocks?.slice(0, 2000),
			});
			ev('activity_narrative', { text: narrateApproval(), status: 'complete' });

			pendingApprovals.set(requestId, {
				request,
				workspaceRoot,
				toolCall,
				toolId,
				messages: [
					...messages,
					{ role: 'assistant', content: fullText },
				],
				assistantText: fullText,
				config,
				ev,
			});
			return;
		}

		const { content, isError } = await executeAnyAgenticTool(
			toolCtx,
			toolCall.name,
			toolCall.arguments,
		);

		ev('tool_call_completed', {
			toolCallId: toolId,
			resultPreview: content.slice(0, 4000),
			isError,
		});

		messages.push({ role: 'assistant', content: fullText });
		messages.push({ role: 'tool', content, name: toolCall.name });
	}

	ev('run_failed', { message: `Agent reached maximum turns (${maxTurns})` });
}

export async function continueAfterApproval(
	requestId: string,
	decision: 'approved' | 'rejected',
	ac: AbortController,
): Promise<void> {
	const pending = pendingApprovals.get(requestId);
	if (!pending) {
		return;
	}
	pendingApprovals.delete(requestId);

	if (decision === 'rejected') {
		pending.ev('run_completed', { finalText: pending.assistantText + '\n\n[Tool execution rejected by user.]' });
		return;
	}

	const { content, isError } = await executeAnyAgenticTool(
		{
			workspaceRoot: pending.workspaceRoot,
			runId: pending.request.runId,
			mcpTools: pending.request.mcpTools,
			atlassianEnv: pending.request.mcpServerEnv?.['atlassian'],
		},
		pending.toolCall.name,
		pending.toolCall.arguments,
	);

	pending.ev('tool_call_completed', {
		toolCallId: pending.toolId,
		resultPreview: content.slice(0, 4000),
		isError,
	});

	const messages: LLMMessage[] = [
		...pending.messages,
		{ role: 'tool', content, name: pending.toolCall.name },
	];

	// Continue loop with remaining turns
	const req = { ...pending.request, messages };
	await runAgentLoop(requestId, req, pending.workspaceRoot, ac, pending.ev);
}
