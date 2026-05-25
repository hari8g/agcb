/*--------------------------------------------------------------------------------------
 *  Agentic AI — multi-turn agent loop (model ↔ tools)
 *--------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { generateUuid } from '../../../../../base/common/uuid.js';
import type { AgentEvent } from '../../common/agenticTypes.js';
import type { ApprovalBatchItem } from '../../common/agenticTypes.js';
import type { RuntimeRequest } from '../../common/llmMessageTypes.js';
import type { LLMMessage } from '../../common/llmMessageTypes.js';
import { getToolDefinition } from '../../common/toolTypes.js';
import { canAutoExecute, requiresUserApproval, type ToolApprovalOptions } from '../../common/toolPermission.js';
import { agenticLog } from '../../common/agenticObservability.js';
import { streamOpenAICompatibleChat, readOpenAIConfigFromEnv } from '../provider/openAICompatibleProvider.js';
import { streamViaVoidProvider } from '../provider/voidProviderStream.js';
import { executeAnyAgenticTool } from '../tools/agenticToolsService.js';
import { isAgenticMcpTool } from '../mcp/executeMcpTool.js';
import { isJiraVirtualReadTool, isJiraVirtualToolName } from '../mcp/jiraVirtualTools.js';
import { buildEditPreview } from '../tools/editTools.js';
import { extractAllToolCalls, type ParsedToolCall } from '../../common/toolCallParser.js';
import {
	type EditToolRouteContext,
	prepareProposeFileEdit,
	routeEditToolCall,
} from '../../common/agentEditPipeline.js';
import {
	buildExecuteGatedToolError,
	isExecuteGatedWriteTool,
} from '../../common/executePhaseGating.js';
import {
	buildEditAlreadyDeliveredNudge,
	hasDeliverableEditInRun,
	isFileEditTool,
	recordSuccessfulFileEdit,
	shouldAllowTextOnlyCompletion,
	shouldSkipDeliveryIncompleteNudge,
	shouldSkipVerifyNudge,
} from '../../common/agentRunCompletion.js';
import { drainRunMessageInjects } from './runMessageInject.js';
import { coerceWriteFileContent, normalizeWriteToolArguments } from '../../common/writeFileContent.js';
import { stringifyToolResult } from '../../common/toolValidation.js';
import { expectsDeliverableEdits } from '../../common/workflowRunQuality.js';
import { narrateModelThinking, narrateApproval } from '../../common/activityNarrative.js';
import {
	bootstrapActivityLine,
	buildDeliveryIncompleteNudge,
	buildEditFailureNudge,
	buildEscalatingNudge,
	buildPostReadEditNudge,
	detectNonToolProgress,
	findLastReadFileInMessages,
	mustNotCompleteWithoutEdits,
	DEFAULT_ORCHESTRATOR_BOOTSTRAP_TURNS,
	pickBootstrapTool,
	resolveTaskFilePath,
	shouldBootstrapProgress,
	shouldNudgePlanContinuation,
	shouldFailJiraExecution,
	markReadFileDelivered,
	mustNotCompleteWithoutTools,
} from '../../common/agentOrchestration.js';
import { buildVerifyStepNudge } from '../../common/agentReasoning.js';
import { buildVerifyNudge } from '../../common/orchestration/verificationLoop.js';
import { mapToolErrorToEdgeCase, resolveEdgeCase } from '../../common/orchestration/edgeCasePlaybook.js';
import {
	applyProgressExtension,
	buildGracefulTurnLimitMessage,
	buildProgressExtensionNudge,
	createLoopProgressState,
	type LoopProgressState,
	recordModelTurnOutcome,
	shouldGrantProgressExtension,
	turnBudgetActivityLine,
} from '../../common/agentLoopBudget.js';
import {
	canExecuteToolsInParallel,
	partitionToolCallsForExecution,
} from '../../common/parallelToolExecution.js';
import { voidLikeMaxPlanNudges } from '../../common/voidLikeChatMode.js';

export type EmitFn = (type: AgentEvent['type'], payload: Record<string, unknown>) => void;

function createEditToolRouteContext(workspaceRoot: string, userMessage: string): EditToolRouteContext {
	return {
		workspaceRoot,
		userMessage,
		pathExists: (relPath: string) => {
			const trimmed = relPath.trim();
			if (!trimmed) {
				return false;
			}
			const full = path.isAbsolute(trimmed) ? trimmed : path.join(workspaceRoot, trimmed);
			return fs.existsSync(full);
		},
		readFileContent: (relPath: string) => {
			const trimmed = relPath.trim();
			if (!trimmed) {
				return undefined;
			}
			const full = path.isAbsolute(trimmed) ? trimmed : path.join(workspaceRoot, trimmed);
			try {
				return fs.readFileSync(full, 'utf8');
			} catch {
				return undefined;
			}
		},
	};
}

export interface AgentLoopState {
	messages: LLMMessage[];
	turn: number;
}

export interface PendingBatchEntry {
	toolCallId: string;
	toolCall: ParsedToolCall;
}

export interface PendingApprovalState {
	request: RuntimeRequest;
	workspaceRoot: string;
	toolCall: ParsedToolCall;
	toolId: string;
	messages: LLMMessage[];
	assistantText: string;
	config: { baseUrl: string; apiKey: string; model: string; temperature: number; maxTokens: number };
	ev: EmitFn;
	batch?: PendingBatchEntry[];
}

interface RunEditBatchCollector {
	items: ApprovalBatchItem[];
	entries: PendingBatchEntry[];
	messages: LLMMessage[];
	assistantText: string;
	request: RuntimeRequest;
	workspaceRoot: string;
	config: PendingApprovalState['config'];
	ev: EmitFn;
}

const pendingApprovals = new Map<string, PendingApprovalState>();
const runEditBatchCollectors = new Map<string, RunEditBatchCollector>();

export function getPendingApproval(requestId: string): PendingApprovalState | undefined {
	return pendingApprovals.get(requestId);
}

export function clearPendingApproval(requestId: string): void {
	pendingApprovals.delete(requestId);
	runEditBatchCollectors.delete(requestId);
}

function approvalOptsFromRequest(request: RuntimeRequest): ToolApprovalOptions {
	return {
		autoRunReadOnlyTools: request.options.autoRunReadOnlyTools,
		requireApprovalForEdits: request.options.requireApprovalForEdits,
		requireApprovalForMcpTools: request.options.requireApprovalForMcpTools,
		requireApprovalForMcpWrites: request.options.requireApprovalForMcpWrites,
		requireApprovalForTerminal: request.options.requireApprovalForTerminal,
	};
}

function isMcpToolCall(name: string, request: RuntimeRequest): boolean {
	return isAgenticMcpTool(name, request.mcpTools)
		|| (isJiraVirtualToolName(name) && !isJiraVirtualReadTool(name));
}

function skipsEditApproval(request: RuntimeRequest, toolName: string): boolean {
	return !!(request.options.autoApplyEdits && (toolName === 'propose_file_edit' || toolName === 'write_file'));
}

function needsApproval(
	request: RuntimeRequest,
	toolCall: ParsedToolCall,
	opts: ToolApprovalOptions,
): boolean {
	const def = getToolDefinition(toolCall.name);
	const isMcp = isMcpToolCall(toolCall.name, request);
	if (skipsEditApproval(request, toolCall.name)) {
		return false;
	}
	return requiresUserApproval(toolCall.name, opts, def, isMcp)
		&& !canAutoExecute(toolCall.name, opts, def, isMcp);
}

function getOrCreateBatchCollector(
	requestId: string,
	request: RuntimeRequest,
	workspaceRoot: string,
	messages: LLMMessage[],
	assistantText: string,
	config: PendingApprovalState['config'],
	ev: EmitFn,
): RunEditBatchCollector {
	let c = runEditBatchCollectors.get(requestId);
	if (!c) {
		c = {
			items: [],
			entries: [],
			messages: [...messages],
			assistantText,
			request,
			workspaceRoot,
			config,
			ev,
		};
		runEditBatchCollectors.set(requestId, c);
	}
	return c;
}

async function flushEditBatchCollector(requestId: string): Promise<boolean> {
	const collector = runEditBatchCollectors.get(requestId);
	if (!collector || collector.items.length === 0) {
		return false;
	}
	runEditBatchCollectors.delete(requestId);

	const batchId = generateUuid();
	const approvalId = generateUuid();
	collector.ev('approval_required', {
		approvalId,
		batchId,
		toolCallId: collector.entries[0]?.toolCallId ?? '',
		title: collector.items.length === 1
			? collector.items[0].title
			: `Approve ${collector.items.length} file edits`,
		description: collector.items.map(i => i.description).join('\n'),
		preview: collector.items.map(i => i.preview).filter(Boolean).join('\n---\n').slice(0, 4000),
		items: collector.items,
		toolName: 'propose_file_edit',
	});
	collector.ev('activity_narrative', { text: narrateApproval(), status: 'complete' });

	pendingApprovals.set(requestId, {
		request: collector.request,
		workspaceRoot: collector.workspaceRoot,
		toolCall: collector.entries[0].toolCall,
		toolId: collector.entries[0].toolCallId,
		messages: collector.messages,
		assistantText: collector.assistantText,
		config: collector.config,
		ev: collector.ev,
		batch: collector.entries,
	});
	return true;
}

async function pauseForApproval(
	requestId: string,
	request: RuntimeRequest,
	workspaceRoot: string,
	messages: LLMMessage[],
	assistantText: string,
	config: PendingApprovalState['config'],
	ev: EmitFn,
	toolCall: ParsedToolCall,
	toolId: string,
	batch?: PendingBatchEntry[],
): Promise<void> {
	const preview = toolCall.name === 'propose_file_edit'
		? buildEditPreview(String(toolCall.arguments.path ?? ''), String(toolCall.arguments.searchReplaceBlocks ?? ''))
		: null;

	const items: ApprovalBatchItem[] | undefined = batch?.map(entry => {
		const p = entry.toolCall.name === 'propose_file_edit'
			? buildEditPreview(String(entry.toolCall.arguments.path ?? ''), String(entry.toolCall.arguments.searchReplaceBlocks ?? ''))
			: null;
		return {
			toolCallId: entry.toolCallId,
			toolName: entry.toolCall.name,
			title: `Approve ${entry.toolCall.name}`,
			description: p?.previewSummary ?? JSON.stringify(entry.toolCall.arguments),
			preview: p?.searchReplaceBlocks?.slice(0, 2000),
			filePath: entry.toolCall.name === 'propose_file_edit' ? String(entry.toolCall.arguments.path ?? '') : undefined,
		};
	});

	const singleItem = items?.[0];
	ev('approval_required', {
		approvalId: generateUuid(),
		batchId: batch && batch.length > 1 ? generateUuid() : undefined,
		toolCallId: toolId,
		title: items && items.length > 1
			? `Approve ${items.length} actions`
			: `Approve ${toolCall.name}`,
		description: singleItem?.description ?? preview?.previewSummary ?? JSON.stringify(toolCall.arguments),
		preview: singleItem?.preview ?? preview?.searchReplaceBlocks?.slice(0, 2000),
		items,
		toolName: toolCall.name,
		filePath: toolCall.name === 'propose_file_edit' ? String(toolCall.arguments.path ?? '') : undefined,
	});
	ev('activity_narrative', { text: narrateApproval(), status: 'complete' });

	pendingApprovals.set(requestId, {
		request,
		workspaceRoot,
		toolCall,
		toolId,
		messages: [...messages, { role: 'assistant', content: assistantText }],
		assistantText,
		config,
		ev,
		batch,
	});
}

async function executeToolTurn(
	requestId: string,
	request: RuntimeRequest,
	workspaceRoot: string,
	messages: LLMMessage[],
	assistantText: string,
	config: PendingApprovalState['config'],
	ev: EmitFn,
	toolCall: ParsedToolCall,
	toolId: string,
): Promise<{ content: string; isError: boolean }> {
	return executeAnyAgenticTool(
		{
			workspaceRoot,
			runId: request.runId,
			mcpTools: request.mcpTools,
			atlassianEnv: request.mcpServerEnv?.['atlassian'],
		},
		toolCall.name,
		toolCall.arguments,
	);
}

/** Run read-only tools concurrently; returns how many succeeded. */
async function executeParallelReadToolsInTurn(
	requestId: string,
	request: RuntimeRequest,
	workspaceRoot: string,
	messages: LLMMessage[],
	fullText: string,
	config: PendingApprovalState['config'],
	ev: EmitFn,
	toolCalls: ParsedToolCall[],
	lastReadRef: { current?: { path: string; content: string } },
): Promise<number> {
	let succeeded = 0;
	await Promise.all(toolCalls.map(async (toolCall) => {
		const toolId = generateUuid();
		ev('tool_call_started', {
			toolCallId: toolId,
			name: toolCall.name,
			arguments: toolCall.arguments,
		});
		if (request.options.executePhaseGating && isExecuteGatedWriteTool(toolCall.name)) {
			const errMsg = buildExecuteGatedToolError(toolCall.name);
			ev('tool_call_completed', { toolCallId: toolId, resultPreview: errMsg, isError: true });
			messages.push({ role: 'tool', content: errMsg, name: toolCall.name });
			return;
		}
		const { content, isError } = await executeToolTurn(
			requestId, request, workspaceRoot, messages, fullText, config, ev, toolCall, toolId,
		);
		ev('tool_call_completed', {
			toolCallId: toolId,
			resultPreview: content.slice(0, 4000),
			isError,
		});
		messages.push({ role: 'tool', content, name: toolCall.name });
		if (!isError) {
			succeeded++;
			if (toolCall.name === 'read_file') {
				lastReadRef.current = {
					path: String(toolCall.arguments.path ?? ''),
					content,
				};
			}
		}
	}));
	if (toolCalls.length >= 2) {
		ev('activity_narrative', {
			lineId: `parallel-tools-${generateUuid()}`,
			text: `Ran ${toolCalls.length} read-only tools in parallel (${succeeded} succeeded).`,
			status: 'complete',
		});
	}
	return succeeded;
}

export async function runAgentLoop(
	requestId: string,
	request: RuntimeRequest,
	workspaceRoot: string,
	ac: AbortController,
	ev: EmitFn,
): Promise<void> {
	const messages: LLMMessage[] = [...request.messages];
	const runId = request.runId;
	const opts = approvalOptsFromRequest(request);
	const batchEdits = !!request.options.batchEditsInSingleApproval;
	const userMessage = request.context.userMessage ?? '';
	const loopProgress = createLoopProgressState();
	const pathsTouchedThisRun = new Set<string>();
	let editFormatFailuresThisRun = 0;
	let lastReadForEdit: { path: string; content: string } | undefined;
	let planContinuationNudges = 0;
	let deliveryIncompleteNudges = 0;
	let verifyStepsUsed = 0;
	const MAX_EDIT_FORMAT_FAILURES = 99;
	const streamTimeoutMs = request.options.requestTimeoutMs ?? 120_000;
	const voidLikeSimple = request.options.voidLikeSimple === true;
	const jiraExec = request.options.jiraWorkflowExecution === true;
	const maxNudges = jiraExec
		? 6
		: voidLikeMaxPlanNudges(voidLikeSimple ? 'void-simple' : 'orchestrated');
	let turnLimit = request.options.maxAgentTurns ?? 40;
	let lastAssistantText = '';

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

	let modelTurn = 0;
	let postBootstrapAttempted = false;

	while (true) {
		if (ac.signal.aborted) {
			return;
		}
		const injected = drainRunMessageInjects(requestId);
		if (injected.length > 0) {
			messages.push(...injected);
			ev('activity_narrative', {
				lineId: `inject-${modelTurn}-${Date.now()}`,
				text: 'Post-edit verify — lint feedback queued for the model…',
				status: 'complete',
			});
		}

		if (modelTurn >= turnLimit) {
			if (shouldGrantProgressExtension(loopProgress, modelTurn, turnLimit)) {
				turnLimit = applyProgressExtension(loopProgress, turnLimit);
				messages.push({ role: 'user', content: buildProgressExtensionNudge() });
				ev('activity_narrative', {
					lineId: `extend-${loopProgress.progressExtensionsGranted}`,
					text: `Turn budget extended to ${turnLimit} — continuing while progress is being made…`,
					status: 'streaming',
				});
				agenticLog({ kind: 'agent_turn', runId, meta: { progressExtension: loopProgress.progressExtensionsGranted, turnLimit } });
				continue;
			}
			if (!postBootstrapAttempted && loopProgress.toolsExecutedInRun === 0) {
				postBootstrapAttempted = true;
				const boot = pickBootstrapTool(userMessage, request.context);
				if (boot && await executeBootstrapTool(request, workspaceRoot, messages, '', ev, boot, loopProgress)) {
					loopProgress.bootstrapUsed = true;
					loopProgress.toolsExecutedInRun++;
					turnLimit += DEFAULT_ORCHESTRATOR_BOOTSTRAP_TURNS;
					agenticLog({ kind: 'agent_turn', runId, meta: { orchestratorBootstrap: boot.name, turnLimit } });
					continue;
				}
			}
			break;
		}

		if (ac.signal.aborted) {
			return;
		}

		agenticLog({ kind: 'agent_turn', runId, meta: { modelTurn, turnLimit } });

		const modelLabel = useVoid
			? `${request.voidProvider!.providerName} / ${request.voidProvider!.modelName}`
			: config.model;

		if (!voidLikeSimple || modelTurn === 0) {
			ev('activity_narrative', {
				lineId: `turn-${modelTurn}`,
				text: voidLikeSimple
					? narrateModelThinking(modelTurn, modelLabel)
					: `${turnBudgetActivityLine(modelTurn, turnLimit)} — ${narrateModelThinking(modelTurn, modelLabel)}`,
				status: modelTurn === 0 ? 'streaming' : 'complete',
			});
		}

		let fullText = '';
		let gotFirstToken = false;
		let streamError: string | undefined;

		const onStreamDelta = (text: string) => {
			if (!gotFirstToken) {
				gotFirstToken = true;
				agenticLog({ kind: 'first_token_received', runId });
			}
			fullText += text;
			ev('model_stream_delta', { text });
		};

		const runStream = async (): Promise<void> => {
			if (useVoid && request.voidProvider) {
				await streamViaVoidProvider(request.voidProvider, messages, ac.signal, {
					onDelta: (text) => onStreamDelta(text),
					onDone: () => { },
					onError: (message) => { streamError = message; },
				}, streamTimeoutMs);
			} else {
				await streamOpenAICompatibleChat(
					config,
					messages.map(m => ({ role: m.role, content: m.content })),
					ac.signal,
					{
						onDelta: onStreamDelta,
						onDone: () => { },
						onError: (message) => { streamError = message; },
					},
				);
			}
		};

		try {
			await Promise.race([
				runStream(),
				new Promise<void>((_resolve, reject) => {
					setTimeout(
						() => reject(new Error(`Model request timed out after ${streamTimeoutMs}ms`)),
						streamTimeoutMs,
					);
				}),
			]);
		} catch (e) {
			streamError = e instanceof Error ? e.message : String(e);
		}

		if (streamError) {
			ev('run_failed', { message: streamError });
			return;
		}

		if (ac.signal.aborted) {
			return;
		}

		lastAssistantText = fullText;
		const toolCalls = extractAllToolCalls(fullText).map(tc => {
			if (tc.name === 'write_file' || tc.name === 'propose_file_edit' || tc.name === 'apply_file_edit') {
				return { name: tc.name, arguments: normalizeWriteToolArguments(tc.arguments) };
			}
			return tc;
		});
		if (!toolCalls.length) {
			recordModelTurnOutcome(loopProgress, 0);
			if (shouldNudgePlanContinuation({
				assistantText: fullText,
				userMessage,
				nudgesUsed: planContinuationNudges,
				maxNudges,
				bootstrapReadDelivered: loopProgress.bootstrapReadDelivered,
				jiraExecution: jiraExec,
			})) {
				planContinuationNudges++;
				loopProgress.planNudges = planContinuationNudges;
				messages.push({ role: 'assistant', content: fullText });
				messages.push({
					role: 'user',
					content: buildEscalatingNudge(planContinuationNudges - 1, fullText, userMessage),
				});
				ev('activity_narrative', {
					lineId: `plan-nudge-${planContinuationNudges}`,
					text: `Orchestrator nudge ${planContinuationNudges}/${maxNudges}…`,
					status: 'streaming',
				});
				agenticLog({ kind: 'agent_turn', runId, meta: { planContinuationNudge: planContinuationNudges } });
				modelTurn++;
				continue;
			}
			if (
				loopProgress.bootstrapReadDelivered
				&& expectsDeliverableEdits(userMessage)
				&& !loopProgress.postReadEditNudgeUsed
				&& detectNonToolProgress(fullText, userMessage)
			) {
				loopProgress.postReadEditNudgeUsed = true;
				const targetPath = resolveTaskFilePath(userMessage, request.context) ?? 'the target file';
				messages.push({ role: 'assistant', content: fullText });
				messages.push({ role: 'user', content: buildPostReadEditNudge(targetPath) });
				ev('activity_narrative', {
					lineId: 'post-read-edit-nudge',
					text: 'File read — orchestrator requesting write_file / propose_file_edit…',
					status: 'complete',
				});
				modelTurn++;
				continue;
			}
			if (shouldBootstrapProgress({
				assistantText: fullText,
				userMessage,
				nudgesUsed: planContinuationNudges,
				maxNudges,
				bootstrapUsed: loopProgress.bootstrapUsed,
			})) {
				const boot = pickBootstrapTool(userMessage, request.context);
				if (boot && await executeBootstrapTool(
					request, workspaceRoot, messages, fullText, ev, boot, loopProgress,
				)) {
					loopProgress.bootstrapUsed = true;
					loopProgress.toolsExecutedInRun++;
					agenticLog({ kind: 'agent_turn', runId, meta: { orchestratorBootstrap: boot.name } });
					modelTurn++;
					continue;
				}
			}
			if (shouldAllowTextOnlyCompletion(userMessage, fullText, loopProgress)) {
				if (await flushEditBatchCollector(requestId)) {
					return;
				}
				ev('run_completed', { finalText: fullText });
				agenticLog({ kind: 'thread_completed', runId, threadId: request.threadId, meta: { deliverableSatisfied: true } });
				return;
			}
			if (mustNotCompleteWithoutEdits(userMessage, fullText, {
				successfulFileEditsInRun: loopProgress.successfulFileEditsInRun,
			}) || mustNotCompleteWithoutTools(userMessage, fullText)) {
				const boot = pickBootstrapTool(userMessage, request.context);
				if (boot && !loopProgress.bootstrapUsed && await executeBootstrapTool(
					request, workspaceRoot, messages, fullText, ev, boot, loopProgress,
				)) {
					loopProgress.bootstrapUsed = true;
					loopProgress.toolsExecutedInRun++;
					agenticLog({ kind: 'agent_turn', runId, meta: { forcedBootstrap: boot.name } });
					modelTurn++;
					continue;
				}
				if (planContinuationNudges < maxNudges && (!loopProgress.bootstrapReadDelivered || jiraExec)) {
					planContinuationNudges++;
					loopProgress.planNudges = planContinuationNudges;
					messages.push({ role: 'assistant', content: fullText });
					messages.push({
						role: 'user',
						content: buildEscalatingNudge(planContinuationNudges - 1, fullText, userMessage),
					});
					ev('activity_narrative', {
						lineId: `plan-nudge-${planContinuationNudges}`,
						text: 'Stopped plan-only reply — must run tools before finishing…',
						status: 'streaming',
					});
					modelTurn++;
					continue;
				}
			}
			if (jiraExec && shouldFailJiraExecution(loopProgress) && !hasDeliverableEditInRun(loopProgress)) {
				ev('run_failed', {
					message: 'JIRA execution stopped: use list_workspace, grep, and read_file to explore, then write_file or propose_file_edit for implementation code (not package.json only).',
					jiraStall: true,
					consecutiveNoToolTurns: loopProgress.consecutiveNoToolTurns,
					toolsExecutedInRun: loopProgress.toolsExecutedInRun,
				});
				return;
			}
			if (await flushEditBatchCollector(requestId)) {
				return;
			}
			ev('run_completed', { finalText: fullText });
			agenticLog({ kind: 'thread_completed', runId, threadId: request.threadId });
			return;
		}

		messages.push({ role: 'assistant', content: fullText });

		const immediateBatch: PendingBatchEntry[] = [];
		let verifyInjected = false;
		let toolsThisTurn = 0;
		const approvalOpts = approvalOptsFromRequest(request);
		const parallelEnabled = request.options.parallelToolCalls === true;
		let toolCallsThisTurn = toolCalls;

		if (parallelEnabled && toolCalls.length >= 2) {
			const allParallel = canExecuteToolsInParallel(toolCalls, { parallelToolCallsEnabled: true })
				&& toolCalls.every(tc => !needsApproval(request, tc, approvalOpts));
			if (allParallel) {
				const lastReadRef: { current?: { path: string; content: string } } = {};
				toolsThisTurn += await executeParallelReadToolsInTurn(
					requestId, request, workspaceRoot, messages, fullText, config, ev, toolCalls, lastReadRef,
				);
				if (lastReadRef.current) {
					lastReadForEdit = lastReadRef.current;
				}
				toolCallsThisTurn = [];
			} else {
				const { parallel, sequential } = partitionToolCallsForExecution(toolCalls);
				if (parallel.length >= 2) {
					const lastReadRef: { current?: { path: string; content: string } } = {};
					toolsThisTurn += await executeParallelReadToolsInTurn(
						requestId, request, workspaceRoot, messages, fullText, config, ev, parallel, lastReadRef,
					);
					if (lastReadRef.current) {
						lastReadForEdit = lastReadRef.current;
					}
					toolCallsThisTurn = sequential;
				}
			}
		}

		for (const toolCall of toolCallsThisTurn) {
			if (ac.signal.aborted) {
				return;
			}

			const toolId = generateUuid();
			ev('tool_call_started', {
				toolCallId: toolId,
				name: toolCall.name,
				arguments: toolCall.arguments,
			});

			if (request.options.executePhaseGating && isExecuteGatedWriteTool(toolCall.name)) {
				const errMsg = buildExecuteGatedToolError(toolCall.name);
				ev('tool_call_completed', {
					toolCallId: toolId,
					resultPreview: errMsg,
					isError: true,
				});
				messages.push({ role: 'tool', content: errMsg, name: toolCall.name });
				ev('activity_narrative', {
					lineId: `execute-gate-${toolId}`,
					text: 'Execute gated — approve the plan to unlock edits.',
					status: 'complete',
				});
				continue;
			}

			const editRouteCtx = createEditToolRouteContext(workspaceRoot, userMessage);
			if (toolCall.name === 'write_file' || toolCall.name === 'propose_file_edit') {
				const routed = routeEditToolCall(toolCall, editRouteCtx);
				toolCall.name = routed.toolCall.name;
				toolCall.arguments = { ...routed.toolCall.arguments };
				if (routed.routed && routed.routeReason) {
					ev('activity_narrative', {
						lineId: `edit-route-${toolId}`,
						text: `Tool router: ${routed.routeReason}`,
						status: 'complete',
					});
				}
			}

			if (toolCall.name === 'create_checkpoint') {
				const pathsArg = toolCall.arguments.paths;
				const explicitPaths = Array.isArray(pathsArg)
					? (pathsArg as unknown[]).map(p => String(p ?? '').trim()).filter(Boolean)
					: [];
				if (!explicitPaths.length && pathsTouchedThisRun.size > 0) {
					toolCall.arguments = {
						...toolCall.arguments,
						paths: [...pathsTouchedThisRun],
					};
				}
			}

			if (toolCall.name === 'write_file') {
				toolCall.arguments = normalizeWriteToolArguments(toolCall.arguments);
				const filePath = String(toolCall.arguments.path ?? '').trim();
				const content = coerceWriteFileContent(toolCall.arguments.content);
				if (!filePath || !content) {
					const errMsg = 'write_file requires non-empty path and content';
					ev('tool_call_completed', { toolCallId: toolId, resultPreview: errMsg, isError: true });
					messages.push({ role: 'tool', content: errMsg, name: toolCall.name });
					continue;
				}
			}

			if (toolCall.name === 'propose_file_edit') {
				const prepared = prepareProposeFileEdit(toolCall, editRouteCtx);
				if (prepared.routedWrite?.content.trim()) {
					toolCall.name = 'write_file';
					toolCall.arguments = {
						path: prepared.routedWrite.path,
						content: prepared.routedWrite.content,
					};
					ev('activity_narrative', {
						lineId: `edit-write-fallback-${toolId}`,
						text: 'Applied edit via write_file (search/replace auto-recovery)',
						status: 'complete',
					});
				} else if (editFormatFailuresThisRun >= MAX_EDIT_FORMAT_FAILURES) {
					const errMsg = 'Too many invalid edit blocks — use write_file with the full file after read_file, or copy exact ORIGINAL lines from read_file.';
					ev('tool_call_completed', {
						toolCallId: toolId,
						resultPreview: errMsg,
						isError: true,
					});
					messages.push({ role: 'tool', content: errMsg, name: toolCall.name });
					messages.push({
						role: 'user',
						content: '[Orchestrator] Stop using propose_file_edit. read_file once, then write_file with the complete updated file content.',
					});
					continue;
				} else {
				const blocksRaw = prepared.blocks;
				const targetPath = prepared.path;
				const validation = prepared.validation;
				if (!validation.ok) {
					const errMsg = validation.error ?? 'Invalid search/replace blocks';
					editFormatFailuresThisRun++;
					const lastRead = findLastReadFileInMessages(messages, targetPath) ?? lastReadForEdit;
					ev('tool_call_completed', {
						toolCallId: toolId,
						resultPreview: errMsg,
						isError: true,
					});
					messages.push({ role: 'tool', content: errMsg, name: toolCall.name });
					const edgeKind = mapToolErrorToEdgeCase(errMsg);
					if (edgeKind) {
						const policy = resolveEdgeCase(edgeKind, errMsg);
						if (policy.action === 'nudge' || policy.action === 'retry') {
							messages.push({ role: 'user', content: policy.message });
						}
					}
					if (
						loopProgress.successfulFileEditsInRun > 0
						&& !loopProgress.editAlreadyDeliveredNudgeUsed
					) {
						loopProgress.editAlreadyDeliveredNudgeUsed = true;
						messages.push({
							role: 'user',
							content: buildEditAlreadyDeliveredNudge(targetPath),
						});
						ev('activity_narrative', {
							lineId: 'edit-already-delivered',
							text: 'Orchestrator: file already written — stopping redundant edits.',
							status: 'complete',
						});
					} else if (editFormatFailuresThisRun === 1) {
						messages.push({
							role: 'user',
							content: `[Orchestrator] Edit format failed (${errMsg}). read_file "${targetPath || lastRead?.path || 'the file'}", then use write_file with the full updated file — or copy exact ORIGINAL lines into propose_file_edit.`,
						});
					} else if (editFormatFailuresThisRun === 2 || editFormatFailuresThisRun === 3) {
						const nudge = buildEditFailureNudge(
							{
								emptyBlockEditAttempts: editFormatFailuresThisRun,
								failedEditAttempts: editFormatFailuresThisRun,
								blockers: [errMsg],
							},
							{
								targetPath: targetPath || lastRead?.path,
								fileHead: lastRead?.content?.slice(0, 2000),
								attemptCount: editFormatFailuresThisRun,
							},
						);
						messages.push({ role: 'user', content: nudge });
						ev('activity_narrative', {
							lineId: `edit-format-${editFormatFailuresThisRun}`,
							text: `Orchestrator: invalid edit format (${editFormatFailuresThisRun}/${MAX_EDIT_FORMAT_FAILURES}) — see example in context.`,
							status: 'complete',
						});
					}
					continue;
				}
				toolCall.arguments.searchReplaceBlocks = blocksRaw;
				}
			}

			const deferEditToBatch = batchEdits
				&& toolCall.name === 'propose_file_edit'
				&& needsApproval(request, toolCall, opts);

			if (deferEditToBatch) {
				const preview = buildEditPreview(
					String(toolCall.arguments.path ?? ''),
					String(toolCall.arguments.searchReplaceBlocks ?? ''),
				);
				const collector = getOrCreateBatchCollector(requestId, request, workspaceRoot, messages, fullText, config, ev);
				collector.items.push({
					toolCallId: toolId,
					toolName: toolCall.name,
					title: `Approve ${toolCall.name}`,
					description: preview.previewSummary,
					preview: preview.searchReplaceBlocks.slice(0, 2000),
					filePath: String(toolCall.arguments.path ?? ''),
				});
				collector.entries.push({ toolCallId: toolId, toolCall });
				const { content, isError } = await executeToolTurn(
					requestId, request, workspaceRoot, messages, fullText, config, ev, toolCall, toolId,
				);
				ev('tool_call_completed', {
					toolCallId: toolId,
					resultPreview: content.slice(0, 4000),
					isError,
				});
				messages.push({ role: 'tool', content, name: toolCall.name });
				if (!isError) {
					toolsThisTurn++;
				}
				continue;
			}

			if (needsApproval(request, toolCall, opts)) {
				if (await flushEditBatchCollector(requestId)) {
					return;
				}
				if (toolCalls.length > 1) {
					immediateBatch.push({ toolCallId: toolId, toolCall });
					continue;
				}
				await pauseForApproval(requestId, request, workspaceRoot, messages, fullText, config, ev, toolCall, toolId);
				return;
			}

			const { content, isError } = await executeToolTurn(
				requestId, request, workspaceRoot, messages, fullText, config, ev, toolCall, toolId,
			);
			ev('tool_call_completed', {
				toolCallId: toolId,
				resultPreview: content.slice(0, 4000),
				isError,
			});
			messages.push({ role: 'tool', content, name: toolCall.name });
			if (!isError) {
				toolsThisTurn++;
				const touchedPath = String(toolCall.arguments.path ?? '').trim();
				if (touchedPath && (isFileEditTool(toolCall.name) || toolCall.name === 'read_file')) {
					pathsTouchedThisRun.add(touchedPath);
				}
				if (isFileEditTool(toolCall.name)) {
					recordSuccessfulFileEdit(
						loopProgress,
						toolCall.name,
						touchedPath,
					);
				}
				if (toolCall.name === 'read_file') {
					lastReadForEdit = {
						path: touchedPath,
						content,
					};
					markReadFileDelivered(loopProgress, content);
				}
				if (toolCall.name === 'create_checkpoint') {
					const idMatch = content.match(/Checkpoint created:\s*([^\s(]+)/i);
					const countMatch = content.match(/\((\d+)\s+files?\)/i);
					if (idMatch) {
						const pathsArg = toolCall.arguments.paths;
						const paths = Array.isArray(pathsArg)
							? (pathsArg as unknown[]).map(x => String(x)).filter(Boolean)
							: [...pathsTouchedThisRun];
						ev('checkpoint_created', {
							checkpointId: idMatch[1],
							snapshotId: idMatch[1],
							label: String(toolCall.arguments.label ?? 'checkpoint'),
							fileCount: countMatch ? Number(countMatch[1]) : 0,
							paths,
						});
					}
				}
			}
		}

		recordModelTurnOutcome(loopProgress, toolsThisTurn);

		const editToolsThisTurn = toolCalls.filter(t =>
			t.name === 'propose_file_edit' || t.name === 'apply_file_edit' || t.name === 'write_file',
		).length;
		if (
			expectsDeliverableEdits(userMessage)
			&& toolsThisTurn > 0
			&& editToolsThisTurn === 0
			&& deliveryIncompleteNudges < 4
			&& !shouldSkipDeliveryIncompleteNudge(loopProgress)
		) {
			deliveryIncompleteNudges++;
			messages.push({ role: 'user', content: buildDeliveryIncompleteNudge(userMessage) });
			ev('activity_narrative', {
				lineId: `delivery-nudge-${deliveryIncompleteNudges}`,
				text: 'Orchestrator: edits required — propose_file_edit next.',
				status: 'complete',
			});
			modelTurn++;
			continue;
		}

		if (immediateBatch.length > 0) {
			if (await flushEditBatchCollector(requestId)) {
				return;
			}
			await pauseForApproval(
				requestId,
				request,
				workspaceRoot,
				messages,
				fullText,
				config,
				ev,
				immediateBatch[0].toolCall,
				immediateBatch[0].toolCallId,
				immediateBatch,
			);
			return;
		}

		if (await flushEditBatchCollector(requestId)) {
			return;
		}

		const editsFailedThisTurn = toolCalls.some(t => t.name === 'propose_file_edit')
			&& toolsThisTurn === 0
			&& toolCalls.filter(t => t.name === 'propose_file_edit').length > 0;
		const hadSuccessfulEdit = toolCalls.some(t =>
			(t.name === 'propose_file_edit' || t.name === 'apply_file_edit' || t.name === 'write_file') && toolsThisTurn > 0,
		);
		if (
			!voidLikeSimple
			&& request.options.planAndVerify
			&& !verifyInjected
			&& verifyStepsUsed < 1
			&& !editsFailedThisTurn
			&& hadSuccessfulEdit
			&& toolCalls.length > 0
			&& !shouldSkipVerifyNudge(userMessage, loopProgress)
		) {
			verifyStepsUsed++;
			verifyInjected = true;
			messages.push({
				role: 'user',
				content: `${buildVerifyStepNudge(toolCalls)}\n\n${buildVerifyNudge()}`,
			});
			ev('activity_narrative', {
				lineId: `verify-${modelTurn}`,
				text: 'Verify step — checking results before continuing…',
				status: 'streaming',
			});
		}

		modelTurn++;
	}

	if (await flushEditBatchCollector(requestId)) {
		return;
	}

	const graceful = buildGracefulTurnLimitMessage({
		userMessage,
		modelTurn,
		turnLimit,
		toolsExecuted: loopProgress.toolsExecutedInRun,
		lastAssistantText,
	});
	ev('activity_narrative', {
		lineId: 'turn-limit',
		text: `Turn budget reached (${turnLimit} model turns) — wrapping up with summary.`,
		status: 'complete',
	});
	if (loopProgress.toolsExecutedInRun > 0) {
		ev('run_completed', { finalText: graceful });
		agenticLog({ kind: 'thread_completed', runId, threadId: request.threadId, meta: { turnLimitReached: true } });
	} else {
		ev('run_failed', {
			message: `Agent reached the turn limit (${turnLimit}) without running tools. Try a more specific request or increase Max agent turns in settings.`,
		});
	}
}

async function executeBootstrapTool(
	request: RuntimeRequest,
	workspaceRoot: string,
	messages: LLMMessage[],
	assistantText: string,
	ev: EmitFn,
	tool: ParsedToolCall,
	loopProgress?: LoopProgressState,
): Promise<boolean> {
	const toolId = generateUuid();
	ev('activity_narrative', {
		lineId: `bootstrap-${toolId}`,
		text: bootstrapActivityLine(tool.name),
		status: 'streaming',
	});
	ev('tool_call_started', {
		toolCallId: toolId,
		name: tool.name,
		arguments: tool.arguments,
	});
	const { content, isError } = await executeAnyAgenticTool(
		{
			workspaceRoot,
			runId: request.runId,
			mcpTools: request.mcpTools,
			atlassianEnv: request.mcpServerEnv?.['atlassian'],
		},
		tool.name,
		tool.arguments,
	);
	ev('tool_call_completed', {
		toolCallId: toolId,
		resultPreview: content.slice(0, 4000),
		isError,
	});
	if (isError) {
		ev('activity_narrative', {
			lineId: `bootstrap-fail-${toolId}`,
			text: `Orchestrator bootstrap failed: ${content.slice(0, 200)}`,
			status: 'complete',
		});
		return false;
	}
	if (
		tool.name === 'read_file'
		&& (content.includes('[object Object]') || /file not found/i.test(content))
	) {
		const rel = String(tool.arguments.path ?? 'package.json');
		messages.push({
			role: 'user',
			content: `[Orchestrator] read_file did not return file contents (${content.slice(0, 120)}). Use workspace-relative path "${rel}" and call read_file again, then write_file or propose_file_edit.`,
		});
		ev('activity_narrative', {
			lineId: `bootstrap-read-retry-${toolId}`,
			text: 'Bootstrap read failed — retrying with workspace-relative path…',
			status: 'complete',
		});
		return true;
	}
	if (loopProgress && tool.name === 'read_file') {
		markReadFileDelivered(loopProgress, content);
	}
	if (assistantText.trim()) {
		messages.push({ role: 'assistant', content: assistantText });
	}
	messages.push({
		role: 'user',
		content: `[Orchestrator] I ran ${tool.name} to keep progress. Use the tool result below and continue with more tools as needed.`,
	});
	messages.push({ role: 'tool', content, name: tool.name });
	ev('activity_narrative', {
		lineId: `bootstrap-done-${toolId}`,
		text: `Bootstrap complete — ${tool.name} finished. Continuing agent loop…`,
		status: 'complete',
	});
	return true;
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
	runEditBatchCollectors.delete(requestId);

	if (decision === 'rejected') {
		pending.ev('run_completed', { finalText: pending.assistantText + '\n\n[Tool execution rejected by user.]' });
		return;
	}

	const entries: PendingBatchEntry[] = pending.batch?.length
		? pending.batch
		: [{ toolCallId: pending.toolId, toolCall: pending.toolCall }];

	const messages: LLMMessage[] = [...pending.messages];

	for (const entry of entries) {
		const toolName = entry.toolCall.name;
		// Browser already applied write_file on Accept — re-running would corrupt content (e.g. String(object)).
		if (toolName === 'write_file') {
			const filePath = String(entry.toolCall.arguments.path ?? '').trim();
			const bytes = coerceWriteFileContent(entry.toolCall.arguments.content).length;
			const toolResult = stringifyToolResult(toolName, `Wrote ${filePath} (${bytes} bytes) — applied in editor`);
			pending.ev('tool_call_completed', {
				toolCallId: entry.toolCallId,
				resultPreview: toolResult.slice(0, 4000),
				isError: false,
			});
			messages.push({ role: 'tool', content: toolResult, name: toolName });
			continue;
		}
		if (toolName === 'propose_file_edit') {
			const filePath = String(entry.toolCall.arguments.path ?? '').trim();
			const toolResult = stringifyToolResult(
				toolName,
				filePath
					? `Edit applied in editor for ${filePath} — do not call propose_file_edit again for the same change.`
					: 'Edit applied in editor',
			);
			pending.ev('tool_call_completed', {
				toolCallId: entry.toolCallId,
				resultPreview: toolResult.slice(0, 4000),
				isError: false,
			});
			messages.push({ role: 'tool', content: toolResult, name: toolName });
			continue;
		}

		const { content, isError } = await executeAnyAgenticTool(
			{
				workspaceRoot: pending.workspaceRoot,
				runId: pending.request.runId,
				mcpTools: pending.request.mcpTools,
				atlassianEnv: pending.request.mcpServerEnv?.['atlassian'],
			},
			toolName,
			entry.toolCall.arguments,
		);

		pending.ev('tool_call_completed', {
			toolCallId: entry.toolCallId,
			resultPreview: content.slice(0, 4000),
			isError,
		});
		messages.push({ role: 'tool', content, name: toolName });
	}

	const req = { ...pending.request, messages };
	await runAgentLoop(requestId, req, pending.workspaceRoot, ac, pending.ev);
}
