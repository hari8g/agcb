/*--------------------------------------------------------------------------------------
 *  Agentic AI — runtime event → chat state reducer (extracted from chatThreadService)
 *--------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../../base/common/uuid.js';
import type {
	ActivityLine,
	ActivityLineKind,
	AgentActivityKind,
	AgentEvent,
	ApprovalRequest,
	ChatMessage,
	ChatThread,
	LiveAgentStatus,
	ThinkingEvent,
	ToolCall,
	ToolResult,
	TouchedFileStatus,
} from '../../common/agenticTypes.js';
import { buildPlanExecuteDecision, buildPlanExplorationDecision, buildToolApprovalDecision } from '../../common/chatDecisionTypes.js';
import { parsePlanProposalContent } from '../../common/planProposalContent.js';
import { narrateApproval, narrateComplete, narrateToolDone, narrateToolStart } from '../../common/activityNarrative.js';
import { splitStreamContent, stripToolFences } from '../../common/streamContent.js';
import { detectNonToolProgress } from '../../common/planOrchestration.js';
import { reasoningActivityLabel, splitReasoningAndAnswer, toolNameToActivityKind } from '../../common/agentReasoning.js';
import {
	buildWorkflowCompletionSummary,
	shouldPrependSummaryToContent,
} from '../../common/workflowSummary.js';
import { analyzeWorkflowRunQuality } from '../../common/workflowRunQuality.js';
import { buildRunFinalSummary, formatRunFinalSummaryMarkdown } from '../../common/orchestration/runFinalSummary.js';
import { buildRunQualityReport } from '../../common/orchestration/runQualityReport.js';
import { createVerificationState } from '../../common/orchestration/verificationLoop.js';
import { markCanonicalPhaseComplete } from '../../common/orchestration/canonicalWorkflowTracker.js';
import { isVoidLikeSimpleUiMode } from '../../common/voidLikeChatMode.js';
import { coerceSearchReplaceBlocks, coerceWriteFileContent, normalizeWriteToolArguments } from '../../common/writeFileContent.js';
import { validateSearchReplaceBlocks } from '../../common/editValidator.js';
import { buildDeliveryIncompleteNudge, buildEditFailureNudge } from '../../common/agentOrchestration.js';
import { completeWorkflowPhase } from '../../common/agentWorkflowOrchestration.js';
import { shouldOfferPlanExecuteDecision } from '../../common/executePhaseGating.js';
import type { AgenticSettings } from '../../common/agenticSettingsTypes.js';
import type { WorkflowExecutionRunResult } from '../../common/workflowExecutionTypes.js';
import type { RunMemoryInput } from '../../common/sessionMemoryTypes.js';

export const LIVE_THOUGHT_LINE_ID = 'live-thought';

export interface ChatThreadEventReducerHost {
	readonly settings: AgenticSettings;
	readonly jiraWorkflowExecuting: boolean;

	appendActivityLine(
		msg: ChatMessage,
		text: string,
		status?: ActivityLine['status'],
		lineId?: string,
		kind?: ActivityLineKind,
	): void;
	completeActivityLine(msg: ChatMessage, lineId: string): void;
	appendThinkingEvent(msg: ChatMessage, title: string, kind: AgentActivityKind, status?: ThinkingEvent['status']): void;
	completeThinkingEvents(msg: ChatMessage, kind?: AgentActivityKind): void;
	setLiveStatus(thread: ChatThread, partial: Omit<LiveAgentStatus, 'updatedAt'>): void;
	scheduleUiNotify(): void;
	notifyImmediate(): void;

	recordTouchedFile(msg: ChatMessage, path: string, status: TouchedFileStatus): void;
	revealTouchedFileInEditor(path: string, mode: 'read' | 'preview' | 'applied', searchReplaceBlocks?: string): void;
	noteFileRevealed(msg: ChatMessage, path: string, verb: 'Opened' | 'Showing edits in' | 'Created'): void;
	runPostEditLintVerify(msg: ChatMessage, path: string, lintFromApply?: string): void;
	previewProposeEditTool(msg: ChatMessage, toolName: string, args: Record<string, unknown>): void;
	previewProposeEditsForApproval(msg: ChatMessage, ar: ApprovalRequest): void;

	recordJiraFileChange(path: string, status: 'applied' | 'preview'): void;
	applyWriteFile(path: string, content: string, msg: ChatMessage): void;
	applyProposeFileEdit(path: string, blocks: string, msg: ChatMessage): void;
	cancelProposeFileEdit(path: string): void;

	setEditApprovalPending(requests: ApprovalRequest[]): void;
	recordSessionMemoryFromRun(input: RunMemoryInput): void;
	finishMetricsRun(runId: string, assistantMsg: ChatMessage, userMessage: string, status: 'completed' | 'failed'): void;
	resolveRunWait(runId: string, result: WorkflowExecutionRunResult): void;
	workflowRunMetadata(thread: ChatThread): Pick<WorkflowExecutionRunResult, 'completionKind' | 'planStall' | 'toolsRan' | 'workflowSummary'>;

	sendUserMessage(text: string): void;
	autoContinueAfterStall(userMessage: string, planText: string): void;
	clearActiveRun(): void;
	setLastFailedUserText(text: string | null): void;
}

export interface ReduceChatThreadEventResult {
	/** When true, caller should not call notifyImmediate (already scheduled or run ended). */
	skipFinalNotify: boolean;
}

export function reduceChatThreadEvent(
	host: ChatThreadEventReducerHost,
	thread: ChatThread,
	assistantMsg: ChatMessage,
	event: AgentEvent,
): ReduceChatThreadEventResult {
	const p = event.payload;
	thread.updatedAt = Date.now();
	let skipFinalNotify = false;

	switch (event.type) {
		case 'run_started':
			thread.status = 'running';
			host.setLiveStatus(thread, { phase: 'thinking', title: 'Running', detail: 'Agent loop started' });
			break;
		case 'context_collected':
			host.setLiveStatus(thread, {
				phase: 'collecting_context',
				title: 'Context ready',
				detail: String(p.contextSummary ?? '').slice(0, 120) || undefined,
			});
			break;
		case 'activity_narrative': {
			assistantMsg.state = 'thinking';
			const text = String(p.text ?? '');
			const lineId = p.lineId ? String(p.lineId) : undefined;
			const status = (p.status === 'streaming' ? 'streaming' : 'complete') as ActivityLine['status'];
			const kind: ActivityLineKind = lineId?.match(/^(plan-nudge|bootstrap|extend-|verify-|turn-limit)/)
				? 'orchestrator'
				: 'status';
			host.appendActivityLine(assistantMsg, text, status, lineId, kind);
			if (lineId?.startsWith('plan-nudge')) {
				host.setLiveStatus(thread, { phase: 'thinking', title: 'Orchestrating', detail: text });
			} else if (lineId?.startsWith('turn-')) {
				host.setLiveStatus(thread, { phase: 'thinking', title: 'Model turn', detail: text });
			}
			break;
		}
		case 'thinking_started':
		case 'thinking_delta': {
			const narrative = String(p.text ?? p.title ?? '');
			if (narrative && !/^(Querying LLM|Streaming response)/i.test(narrative) && !/^\d+ chars?$/i.test(narrative)) {
				host.appendActivityLine(
					assistantMsg,
					narrative,
					p.status === 'complete' ? 'complete' : 'streaming',
					p.id ? String(p.id) : undefined,
				);
			}
			break;
		}
		case 'model_stream_delta': {
			assistantMsg.streamRaw = (assistantMsg.streamRaw ?? '') + String(p.text ?? '');
			const parts = splitStreamContent(assistantMsg.streamRaw);

			if (parts.hasToolBlock) {
				assistantMsg.state = 'thinking';
				if (parts.working) {
					const label = reasoningActivityLabel(parts.working);
					host.appendActivityLine(assistantMsg, label, 'streaming', LIVE_THOUGHT_LINE_ID, 'reasoning');
				}
				assistantMsg.content = '';
			} else if (parts.answer) {
				assistantMsg.state = 'streaming';
				const { reasoning, answer } = splitReasoningAndAnswer(parts.answer);
				if (reasoning) {
					host.appendActivityLine(
						assistantMsg,
						reasoningActivityLabel(reasoning),
						'streaming',
						LIVE_THOUGHT_LINE_ID,
						'reasoning',
					);
				}
				if (answer) {
					host.appendActivityLine(assistantMsg, answer, 'streaming', 'live-answer');
					assistantMsg.content = answer;
				} else if (!reasoning) {
					host.appendActivityLine(assistantMsg, parts.answer, 'streaming', LIVE_THOUGHT_LINE_ID, 'reasoning');
				}
			}
			const preview = (parts.working || parts.answer || '').replace(/\s+/g, ' ').trim();
			host.setLiveStatus(thread, {
				phase: parts.hasToolBlock ? 'tool' : 'streaming',
				title: parts.hasToolBlock ? 'Preparing tool call' : 'Drafting response',
				detail: preview.slice(0, 100) || 'Streaming from model…',
			});
			host.scheduleUiNotify();
			return { skipFinalNotify: true };
		}
		case 'tool_call_started': {
			assistantMsg.state = 'waiting_for_tool';
			host.completeActivityLine(assistantMsg, LIVE_THOUGHT_LINE_ID);
			const toolName = String(p.name ?? 'tool');
			const activityKind = toolNameToActivityKind(toolName);
			host.setLiveStatus(thread, { phase: 'tool', title: `Tool: ${toolName}`, detail: 'Running tool…' });
			const rawArgs = (p.arguments as Record<string, unknown>) ?? {};
			const toolArgs = (toolName === 'write_file' || toolName === 'propose_file_edit' || toolName === 'apply_file_edit')
				? normalizeWriteToolArguments(rawArgs)
				: rawArgs;
			host.appendThinkingEvent(assistantMsg, narrateToolStart(toolName, toolArgs), activityKind, 'running');
			host.appendActivityLine(assistantMsg, narrateToolStart(toolName, toolArgs), 'complete', undefined, 'tool');
			const tc: ToolCall = {
				id: String(p.toolCallId ?? generateUuid()),
				name: toolName,
				arguments: toolArgs,
				status: 'running',
				startedAt: event.timestamp,
			};
			assistantMsg.toolCalls = assistantMsg.toolCalls ?? [];
			assistantMsg.toolCalls.push(tc);
			host.previewProposeEditTool(assistantMsg, toolName, toolArgs);
			break;
		}
		case 'tool_call_completed': {
			const toolId = String(p.toolCallId ?? '');
			const tc = assistantMsg.toolCalls?.find(t => t.id === toolId);
			const isError = !!p.isError;
			if (tc) {
				tc.status = isError ? 'failed' : 'complete';
				tc.completedAt = event.timestamp;
				tc.resultPreview = String(p.resultPreview ?? '');
				const doneLine = isError
					? `Tool failed (${tc.name}): ${(tc.resultPreview ?? '').slice(0, 120)}`
					: narrateToolDone(tc.name, tc.resultPreview ?? '');
				host.appendActivityLine(assistantMsg, doneLine, 'complete', undefined, isError ? 'orchestrator' : 'tool');
				host.completeThinkingEvents(assistantMsg, toolNameToActivityKind(tc.name));
			}
			const tr: ToolResult = {
				toolCallId: toolId,
				content: String(p.resultPreview ?? ''),
				isError,
			};
			assistantMsg.toolResults = assistantMsg.toolResults ?? [];
			assistantMsg.toolResults.push(tr);
			if (tc?.name === 'read_file') {
				const path = String(tc.arguments.path ?? '');
				host.recordTouchedFile(assistantMsg, path, 'read');
				host.revealTouchedFileInEditor(path, 'read');
				host.noteFileRevealed(assistantMsg, path, 'Opened');
			} else if (tc?.name === 'write_file') {
				const path = String(tc.arguments.path ?? '');
				const content = coerceWriteFileContent(tc.arguments.content);
				if (!isError && path && content) {
					if (host.jiraWorkflowExecuting) {
						host.recordJiraFileChange(path, 'applied');
					}
					if (thread.autoApplyEdits) {
						host.recordTouchedFile(assistantMsg, path, 'applied');
						host.applyWriteFile(path, content, assistantMsg);
						host.noteFileRevealed(assistantMsg, path, 'Created');
					} else {
						host.recordTouchedFile(assistantMsg, path, 'preview');
					}
				} else if (path) {
					host.recordTouchedFile(assistantMsg, path, 'failed');
				}
			} else if (tc?.name === 'propose_file_edit') {
				const path = String(tc.arguments.path ?? '');
				const blocks = coerceSearchReplaceBlocks(tc.arguments.searchReplaceBlocks);
				let validation = validateSearchReplaceBlocks(blocks);
				if (!validation.ok) {
					validation = validateSearchReplaceBlocks(blocks, { allowCreate: true });
				}
				const editOk = !isError && validation.ok && blocks.trim().length > 0;
				if (editOk) {
					if (host.jiraWorkflowExecuting) {
						host.recordJiraFileChange(path, 'applied');
					}
					if (thread.autoApplyEdits) {
						host.recordTouchedFile(assistantMsg, path, 'applied');
						host.applyProposeFileEdit(path, blocks, assistantMsg);
						host.noteFileRevealed(assistantMsg, path, 'Showing edits in');
					} else {
						host.recordTouchedFile(assistantMsg, path, 'preview');
					}
				} else {
					host.recordTouchedFile(assistantMsg, path, 'failed');
					if (host.jiraWorkflowExecuting) {
						host.recordJiraFileChange(path, 'preview');
					}
					host.cancelProposeFileEdit(path);
				}
			} else if (tc?.name === 'apply_file_edit') {
				const path = String(tc.arguments.path ?? '');
				host.recordTouchedFile(assistantMsg, path, 'applied');
				host.revealTouchedFileInEditor(path, 'applied');
				host.noteFileRevealed(assistantMsg, path, 'Showing edits in');
			}
			assistantMsg.streamRaw = '';
			assistantMsg.content = '';
			if (thread.status === 'running') {
				assistantMsg.state = 'thinking';
			}
			break;
		}
		case 'approval_required': {
			assistantMsg.state = 'waiting_for_approval';
			thread.status = 'waiting_approval';
			host.setLiveStatus(thread, {
				phase: 'approval',
				title: 'Waiting for you',
				detail: String(p.title ?? 'Approve or reject to continue'),
			});
			host.appendActivityLine(assistantMsg, narrateApproval(), 'complete');
			const batchId = p.batchId ? String(p.batchId) : undefined;
			const items = Array.isArray(p.items)
				? (p.items as ApprovalRequest['items'])
				: undefined;
			const existing = batchId
				? thread.approvalRequests.find(a => a.batchId === batchId && a.decision === 'pending')
				: undefined;
			let pendingAr: ApprovalRequest | undefined = existing;
			if (existing && items?.length) {
				existing.items = items;
				existing.description = String(p.description ?? existing.description);
				existing.preview = p.preview ? String(p.preview) : existing.preview;
				existing.title = String(p.title ?? existing.title);
			} else if (!existing) {
				const ar: ApprovalRequest = {
					id: String(p.approvalId ?? generateUuid()),
					toolCallId: String(p.toolCallId ?? ''),
					title: String(p.title ?? 'Approval required'),
					description: String(p.description ?? ''),
					preview: p.preview ? String(p.preview) : undefined,
					decision: 'pending',
					createdAt: event.timestamp,
					batchId,
					items,
					toolName: p.toolName ? String(p.toolName) : undefined,
					filePath: p.filePath ? String(p.filePath) : undefined,
					messageId: assistantMsg.id,
				};
				thread.approvalRequests.push(ar);
				pendingAr = ar;
			}
			if (pendingAr) {
				assistantMsg.decision = buildToolApprovalDecision(pendingAr);
				host.previewProposeEditsForApproval(assistantMsg, pendingAr);
			}
			host.setEditApprovalPending(thread.approvalRequests.filter(a => a.decision === 'pending'));
			break;
		}
		case 'checkpoint_created': {
			const fileCount = typeof p.fileCount === 'number' ? p.fileCount : undefined;
			const paths = Array.isArray(p.paths)
				? (p.paths as unknown[]).map(x => String(x)).filter(Boolean)
				: undefined;
			thread.checkpoints.push({
				id: String(p.checkpointId ?? generateUuid()),
				createdAt: event.timestamp,
				label: String(p.label ?? 'checkpoint'),
				snapshotId: p.snapshotId ? String(p.snapshotId) : undefined,
				fileCount,
				paths,
			});
			thread.currentCheckpointId = thread.checkpoints[thread.checkpoints.length - 1]?.id ?? null;
			break;
		}
		case 'run_completed': {
			if (handleRunCompleted(host, thread, assistantMsg, p)) {
				return { skipFinalNotify: true };
			}
			break;
		}
		case 'run_failed': {
			assistantMsg.state = 'error';
			assistantMsg.content = String(p.message ?? 'Run failed');
			const lastUserFail = [...thread.messages].reverse().find(m => m.role === 'user')?.content ?? '';
			assistantMsg.workflowSummary = buildWorkflowCompletionSummary({
				userMessage: lastUserFail,
				assistantMessage: assistantMsg,
				runFailed: true,
				failureMessage: assistantMsg.content,
			});
			host.appendActivityLine(assistantMsg, `I ran into a problem: ${String(p.message ?? 'unknown error')}`, 'complete');
			thread.status = 'failed';
			thread.lastError = String(p.message ?? '');
			host.setLiveStatus(thread, {
				phase: 'error',
				title: 'Run failed',
				detail: thread.lastError,
			});
			if (thread.currentRunId) {
				host.finishMetricsRun(thread.currentRunId, assistantMsg, lastUserFail, 'failed');
				host.resolveRunWait(thread.currentRunId, {
					status: 'failed',
					error: thread.lastError,
					...host.workflowRunMetadata(thread),
				});
			}
			host.clearActiveRun();
			break;
		}
		default:
			break;
	}

	return { skipFinalNotify };
}

/** @returns true when reducer handled notify (early return paths). */
function handleRunCompleted(
	host: ChatThreadEventReducerHost,
	thread: ChatThread,
	assistantMsg: ChatMessage,
	p: Record<string, unknown>,
): boolean {
	assistantMsg.state = 'complete';
	const finalRaw = String(p.finalText ?? assistantMsg.streamRaw ?? assistantMsg.content);
	host.completeActivityLine(assistantMsg, LIVE_THOUGHT_LINE_ID);
	const stripped = stripToolFences(finalRaw);
	const { reasoning, answer } = splitReasoningAndAnswer(stripped);
	if (reasoning) {
		host.appendActivityLine(
			assistantMsg,
			reasoningActivityLabel(reasoning),
			'complete',
			'reasoning-final',
			'reasoning',
		);
	}
	if (answer) {
		assistantMsg.content = answer;
	} else if (stripped && !reasoning) {
		assistantMsg.content = stripped;
	}
	assistantMsg.streamRaw = undefined;
	const lastUser = [...thread.messages].reverse().find(m => m.role === 'user')?.content ?? '';
	const toolsRan = (assistantMsg.toolCalls?.length ?? 0) > 0;
	const planStall = thread.agentRunMode !== 'plan_only'
		&& !toolsRan
		&& detectNonToolProgress(answer || finalRaw, lastUser);
	const runQuality = analyzeWorkflowRunQuality(assistantMsg, lastUser);
	const verification = thread.verificationState ?? createVerificationState();
	const qualityReport = buildRunQualityReport({
		assistantMessage: assistantMsg,
		userMessage: lastUser,
		verification,
		retryCount: thread.orchestratorStallRetries ?? 0,
		approvalRequired: thread.workflowExecuteGated === true,
	});
	if (thread.canonicalWorkflowSnapshot?.phases.includes('summarize')) {
		markCanonicalPhaseComplete(thread.canonicalWorkflowSnapshot, 'summarize');
	}
	const summary = buildRunFinalSummary({
		userMessage: lastUser,
		assistantMessage: assistantMsg,
		structuredIntent: thread.structuredIntent,
		workflowRunPlan: thread.workflowRunPlan,
		qualityReport,
		planStall,
	});
	assistantMsg.workflowSummary = summary;
	const voidLike = isVoidLikeSimpleUiMode(thread.runUiMode);
	if (!voidLike && (shouldPrependSummaryToContent(summary, assistantMsg.content) || summary.completionKind === 'success')) {
		assistantMsg.content = `${formatRunFinalSummaryMarkdown(summary)}\n\n---\n\n${assistantMsg.content}`.trim();
	}
	const writeToolsRan = (assistantMsg.toolCalls ?? []).some(tc =>
		tc.name === 'write_file' || tc.name === 'propose_file_edit' || tc.name === 'apply_file_edit',
	);
	if (host.settings.enableSessionMemory) {
		const successfulEditPaths = (assistantMsg.toolCalls ?? [])
			.filter(tc =>
				(tc.name === 'write_file' || tc.name === 'propose_file_edit' || tc.name === 'apply_file_edit')
				&& assistantMsg.toolResults?.some(tr => tr.toolCallId === tc.id && !tr.isError),
			)
			.map(tc => String(tc.arguments.path ?? '').trim())
			.filter(Boolean);
		host.recordSessionMemoryFromRun({
			userMessage: lastUser,
			intent: thread.lastIntent?.intent,
			targetPaths: thread.lastIntent?.targetPaths,
			toolNames: assistantMsg.toolCalls?.map(tc => tc.name),
			successfulEditPaths,
		});
	}
	const planParsed = parsePlanProposalContent(assistantMsg.content);
	const focusFollowUp = /^\s*Focus on:/i.test(lastUser);
	if (
		planParsed
		&& planParsed.choices.length > 0
		&& !writeToolsRan
		&& !assistantMsg.decision
		&& !focusFollowUp
	) {
		assistantMsg.decision = buildPlanExplorationDecision(planParsed);
	} else if (shouldOfferPlanExecuteDecision({
		executePhaseGated: thread.workflowExecuteGated === true,
		planOnlyMode: thread.agentRunMode === 'plan_only' || thread.activeSkillId === 'plan',
		toolsRan,
		writeToolsRan,
	})) {
		assistantMsg.decision = buildPlanExecuteDecision();
		host.setLiveStatus(thread, {
			phase: 'complete',
			title: 'Plan ready',
			detail: 'Execute or revise the plan below',
		});
	}
	const finalizeAssistantBeforeOrchestratorRetry = (hint: string) => {
		assistantMsg.state = 'complete';
		if (!assistantMsg.content?.trim()) {
			assistantMsg.content = hint;
		}
	};

	const editFailed = summary.completionKind === 'failed'
		&& runQuality.emptyBlockEditAttempts > 0;
	if (editFailed) {
		const autoContinue = !host.jiraWorkflowExecuting && !isVoidLikeSimpleUiMode(thread.runUiMode) && host.settings.autoContinueOnStall !== false;
		const stallRetries = thread.orchestratorStallRetries ?? 0;
		if (autoContinue && stallRetries < 2) {
			finalizeAssistantBeforeOrchestratorRetry('Retrying after invalid edit format…');
			thread.orchestratorStallRetries = stallRetries + 1;
			host.appendActivityLine(
				assistantMsg,
				'Edits used empty blocks — sending format reminder to the agent.',
				'complete',
				undefined,
				'orchestrator',
			);
			host.setLiveStatus(thread, {
				phase: 'thinking',
				title: 'Retrying edits',
				detail: 'Fixing search/replace format',
			});
			thread.status = 'running';
			assistantMsg.state = 'thinking';
			thread.currentRunId = null;
			host.clearActiveRun();
			host.notifyImmediate();
			host.sendUserMessage(buildEditFailureNudge(runQuality));
			return true;
		}
	}
	if (planStall) {
		host.appendActivityLine(
			assistantMsg,
			'Stopped: described work but did not run tools (list_files, read_file, propose_file_edit).',
			'complete',
			undefined,
			'orchestrator',
		);
		host.setLiveStatus(thread, {
			phase: 'complete',
			title: 'Stopped (no tools run)',
			detail: 'Use Continue below or Retry',
		});
		const autoContinue = !host.jiraWorkflowExecuting && !isVoidLikeSimpleUiMode(thread.runUiMode) && host.settings.autoContinueOnStall !== false;
		const stallRetries = thread.orchestratorStallRetries ?? 0;
		if (autoContinue && stallRetries < 2) {
			finalizeAssistantBeforeOrchestratorRetry('Continuing — the agent stopped without running tools.');
			thread.orchestratorStallRetries = stallRetries + 1;
			thread.status = 'running';
			thread.currentRunId = null;
			host.clearActiveRun();
			host.notifyImmediate();
			host.autoContinueAfterStall(lastUser, assistantMsg.content);
			return true;
		}
	} else if (runQuality.deliveryIncomplete) {
		const autoContinue = !host.jiraWorkflowExecuting && !isVoidLikeSimpleUiMode(thread.runUiMode) && host.settings.autoContinueOnStall !== false;
		const stallRetries = thread.orchestratorStallRetries ?? 0;
		if (autoContinue && stallRetries < 3) {
			finalizeAssistantBeforeOrchestratorRetry('Continuing — file edits are still required.');
			thread.orchestratorStallRetries = stallRetries + 1;
			host.appendActivityLine(
				assistantMsg,
				'No edits applied — continuing until propose_file_edit succeeds.',
				'complete',
				undefined,
				'orchestrator',
			);
			host.setLiveStatus(thread, {
				phase: 'thinking',
				title: 'Applying changes',
				detail: 'Waiting for file edits',
			});
			thread.status = 'running';
			thread.currentRunId = null;
			host.clearActiveRun();
			assistantMsg.workflowSummary = summary;
			host.notifyImmediate();
			host.sendUserMessage(buildDeliveryIncompleteNudge(lastUser));
			return true;
		}
		host.appendActivityLine(assistantMsg, 'Run ended — no file edits were applied.', 'complete', undefined, 'orchestrator');
		host.setLiveStatus(thread, {
			phase: 'error',
			title: 'Incomplete',
			detail: runQuality.blockers[0] ?? 'Enable Auto-apply and retry',
		});
		thread.status = 'failed';
		thread.lastError = runQuality.blockers[0];
		thread.currentRunId = null;
		host.clearActiveRun();
		host.notifyImmediate();
		return true;
	} else if (summary.completionKind === 'failed') {
		host.appendActivityLine(assistantMsg, 'Run ended — file edits did not apply.', 'complete', undefined, 'orchestrator');
		host.setLiveStatus(thread, {
			phase: 'error',
			title: 'Edits did not apply',
			detail: runQuality.blockers[0] ?? 'Enable Auto-apply or approve edits',
		});
	} else if (summary.completionKind === 'partial') {
		host.appendActivityLine(assistantMsg, 'Run ended — partial progress only.', 'complete', undefined, 'orchestrator');
		host.setLiveStatus(thread, {
			phase: 'complete',
			title: 'Partial',
			detail: runQuality.blockers[0] ?? 'Review summary below',
		});
	} else {
		host.appendActivityLine(assistantMsg, narrateComplete(), 'complete');
		host.setLiveStatus(thread, {
			phase: 'complete',
			title: 'Done',
			detail: 'Workflow summary ready',
			workflowPhase: thread.workflowSnapshot?.phases.includes('verify') ? 'verify' : undefined,
		});
	}
	if (thread.workflowSnapshot?.phases.includes('verify')) {
		completeWorkflowPhase(thread.workflowSnapshot, 'execute');
		if (!thread.workflowSnapshot.completedPhases.includes('verify')) {
			thread.workflowSnapshot.completedPhases.push('verify');
		}
		thread.workflowSnapshot.currentPhase = 'verify';
	}
	thread.status = 'completed';
	if (thread.currentRunId) {
		host.finishMetricsRun(thread.currentRunId, assistantMsg, lastUser, 'completed');
		host.resolveRunWait(thread.currentRunId, {
			status: 'completed',
			...host.workflowRunMetadata(thread),
		});
	}
	host.clearActiveRun();
	host.setLastFailedUserText(null);
	return false;
}
