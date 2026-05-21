/*--------------------------------------------------------------------------------------
 *  Agentic AI — client-side chat state + event reducer
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import type {
	ActivityLine,
	AgentEvent,
	ApprovalRequest,
	ChatMessage,
	ChatThread,
	LiveAgentStatus,
	ToolCall,
	ToolResult,
} from '../../common/agenticTypes.js';
import {
	narrateApproval,
	narrateComplete,
	narrateContextCollected,
	narrateToolDone,
	narrateToolStart,
	narrateUnderstanding,
} from '../../common/activityNarrative.js';
import { splitStreamContent, stripToolFences } from '../../common/streamContent.js';
import { convertToRuntimeRequest } from '../../common/llmMessageTypes.js';
import type { VoidProviderConfig } from '../../common/voidProviderConfig.js';
import { IAgenticRuntimeService } from '../../common/agenticRuntimeService.js';
import { IContextCollectorService } from './contextCollectorService.js';
import { IEditApprovalService } from './editApprovalService.js';
import { IAgenticSettingsService } from './agenticSettingsService.js';
import { IAgenticMcpService } from './agenticMcpService.js';
import { IJiraWorkflowService, detectIssueKeyFromText } from './jiraWorkflowServiceInterface.js';
import { detectJiraChatIntent, type JiraChatIntent } from '../../common/mcp/jiraChatIntent.js';
import {
	createEmptyJiraChatUi,
	jiraInteractiveToChatUi,
	type JiraChatMessageUi,
} from '../../common/mcp/jiraWorkflowTypes.js';
import { narrateWorkflowStage } from '../../common/mcp/jiraWorkflow.js';
import { IVoidSettingsService } from '../../../void/common/voidSettingsService.js';
import { isFeatureNameDisabled } from '../../../void/common/voidSettingsTypes.js';
import { setAgenticLogSink, formatAgenticLogLine } from '../../common/agenticObservability.js';

const THREADS_STORAGE_KEY = 'agentic.chatThreads.v1';

const LIVE_THOUGHT_LINE_ID = 'live-thought';

export const IAgenticChatThreadService = createDecorator<IAgenticChatThreadService>('agenticChatThreadService');

export interface IAgenticChatThreadService {
	readonly _serviceBrand: undefined;
	readonly state: { threads: ChatThread[]; currentThreadId: string | null };
	readonly onDidChange: import('../../../../../base/common/event.js').Event<void>;
	readonly onDidLiveStatusChange: import('../../../../../base/common/event.js').Event<LiveAgentStatus | null>;
	createThread(): string;
	getLiveStatus(): LiveAgentStatus | null;
	getCurrentThread(): ChatThread | null;
	switchThread(threadId: string): void;
	sendUserMessage(text: string): Promise<void>;
	startJiraWorkflow(issueKey: string): Promise<void>;
	openMcpConfig(): Promise<void>;
	retryLastMessage(): Promise<void>;
	stopCurrentRun(): void;
	approveEdit(approvalId: string): void;
	rejectEdit(approvalId: string): void;
	setIncludeActiveFile(v: boolean): void;
	setIncludeSelection(v: boolean): void;
	setAutoApplyEdits(v: boolean): void;
	/** Chat-embedded JIRA: pick ticket from list UI */
	pickJiraTicketInChat(ticketKey: string): Promise<void>;
	acceptJiraWorkflowInChat(): Promise<void>;
	declineJiraWorkflowInChat(): void;
	regenerateJiraPlanInChat(): Promise<void>;
	refreshJiraTicketsInChat(): Promise<void>;
	showJiraTicketListInChat(): void;
	getJiraMcpStatusSummary(): Promise<string>;
	/** Load open JIRA tickets into the chat thread (not gated by enableJiraWorkflow). */
	loadJiraTicketsInChat(): Promise<void>;
}

class AgenticChatThreadService extends Disposable implements IAgenticChatThreadService {
	declare readonly _serviceBrand: undefined;

	threads: ChatThread[] = [];
	currentThreadId: string | null = null;
	private activeRequestId: string | null = null;
	private activeRunId: string | null = null;
	private lastFailedUserText: string | null = null;
	private _uiNotifyScheduled = false;
	/** Assistant message id receiving live JIRA list / plan / stream UI */
	private activeJiraChatMessageId: string | null = null;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _onDidLiveStatusChange = this._register(new Emitter<LiveAgentStatus | null>());
	readonly onDidLiveStatusChange = this._onDidLiveStatusChange.event;

	constructor(
		@IAgenticRuntimeService private readonly runtimeService: IAgenticRuntimeService,
		@IContextCollectorService private readonly contextCollector: IContextCollectorService,
		@IEditApprovalService private readonly editApproval: IEditApprovalService,
		@IVoidSettingsService private readonly voidSettings: IVoidSettingsService,
		@IAgenticSettingsService private readonly agenticSettings: IAgenticSettingsService,
		@IAgenticMcpService private readonly agenticMcp: IAgenticMcpService,
		@IJiraWorkflowService private readonly jiraWorkflow: IJiraWorkflowService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		setAgenticLogSink(ev => this.logService.info(formatAgenticLogLine(ev)));
		this._register(this.jiraWorkflow.onDidChange(() => this._syncJiraChatMessage()));
		this._register(this.jiraWorkflow.onDidEmitEvent(() => this._syncJiraChatMessage()));
		this._loadThreads();
		if (this.threads.length === 0) {
			this.createThread();
		}
	}

	get state() {
		return { threads: this.threads, currentThreadId: this.currentThreadId };
	}

	getLiveStatus(): LiveAgentStatus | null {
		return this._current()?.liveStatus ?? null;
	}

	private _notify() {
		this._onDidChange.fire();
		this._persistThreads();
	}

	private _scheduleUiNotify(): void {
		if (this._uiNotifyScheduled) {
			return;
		}
		this._uiNotifyScheduled = true;
		const schedule = typeof requestAnimationFrame === 'function'
			? requestAnimationFrame
			: (fn: () => void) => setTimeout(fn, 16);
		schedule(() => {
			this._uiNotifyScheduled = false;
			this._notify();
		});
	}

	private _notifyImmediate() {
		this._uiNotifyScheduled = false;
		this._notify();
	}

	private _current(): ChatThread | null {
		return this.threads.find(t => t.id === this.currentThreadId) ?? null;
	}

	private _persistThreads(): void {
		try {
			this.storageService.store(
				THREADS_STORAGE_KEY,
				JSON.stringify({ threads: this.threads, currentThreadId: this.currentThreadId }),
				StorageScope.WORKSPACE,
				StorageTarget.USER,
			);
		} catch { /* ignore quota */ }
	}

	private _loadThreads(): void {
		const raw = this.storageService.get(THREADS_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) return;
		try {
			const data = JSON.parse(raw) as { threads: ChatThread[]; currentThreadId: string | null };
			this.threads = (data.threads ?? []).map(t => ({
				...t,
				updatedAt: t.updatedAt ?? t.createdAt,
				status: t.status ?? 'idle',
				currentCheckpointId: t.currentCheckpointId ?? null,
				liveStatus: null,
			}));
			this.currentThreadId = data.currentThreadId;
		} catch { /* ignore */ }
	}

	createThread(): string {
		const now = Date.now();
		const thread: ChatThread = {
			id: generateUuid(),
			title: 'New chat',
			createdAt: now,
			updatedAt: now,
			status: 'idle',
			messages: [],
			currentRunId: null,
			currentCheckpointId: null,
			approvalRequests: [],
			checkpoints: [],
			includeActiveFile: true,
			includeSelection: true,
			autoApplyEdits: false,
			liveStatus: null,
		};
		this.threads.push(thread);
		this.currentThreadId = thread.id;
		this._notify();
		return thread.id;
	}

	getCurrentThread(): ChatThread | null {
		return this._current();
	}

	switchThread(threadId: string): void {
		this.currentThreadId = threadId;
		this._notify();
	}

	setIncludeActiveFile(v: boolean): void {
		const t = this._current();
		if (t) { t.includeActiveFile = v; t.updatedAt = Date.now(); }
		this._notify();
	}

	setIncludeSelection(v: boolean): void {
		const t = this._current();
		if (t) { t.includeSelection = v; t.updatedAt = Date.now(); }
		this._notify();
	}

	setAutoApplyEdits(v: boolean): void {
		const t = this._current();
		if (t) { t.autoApplyEdits = v; t.updatedAt = Date.now(); }
		this._notify();
	}

	async retryLastMessage(): Promise<void> {
		if (!this.lastFailedUserText) return;
		await this.sendUserMessage(this.lastFailedUserText);
	}

	async startJiraWorkflow(issueKey: string): Promise<void> {
		this.jiraWorkflow.startWorkflow(issueKey);
		await this.sendUserMessage(this.jiraWorkflow.buildWorkflowUserPrompt(issueKey));
	}

	async openMcpConfig(): Promise<void> {
		await this.agenticMcp.revealMcpConfig();
	}

	async sendUserMessage(text: string): Promise<void> {
		const thread = this._current();
		if (!thread || !text.trim()) return;

		// JIRA chat commands (list/select/accept) always work when user asks explicitly.
		const chatIntent = detectJiraChatIntent(text);
		if (chatIntent) {
			await this._handleJiraChatIntent(text.trim(), chatIntent);
			return;
		}

		this.lastFailedUserText = text.trim();
		thread.updatedAt = Date.now();
		thread.status = 'running';
		thread.lastError = undefined;

		const userMsg: ChatMessage = {
			id: generateUuid(),
			role: 'user',
			content: text.trim(),
			createdAt: Date.now(),
		};
		thread.messages.push(userMsg);
		if (thread.messages.filter(m => m.role === 'user').length === 1) {
			thread.title = text.trim().slice(0, 48);
		}

		const assistantMsg: ChatMessage = {
			id: generateUuid(),
			role: 'assistant',
			content: '',
			createdAt: Date.now(),
			state: 'thinking',
			activityLines: [],
			streamRaw: '',
			toolCalls: [],
			toolResults: [],
		};
		thread.messages.push(assistantMsg);

		const runId = generateUuid();
		thread.currentRunId = runId;
		this.activeRunId = runId;

		this._appendActivityLine(assistantMsg, narrateUnderstanding(text), 'complete');
		this._notify();

		const settings = this.agenticSettings.settings;

		const context = await this.contextCollector.collect(text, {
			includeActiveFile: thread.includeActiveFile,
			includeSelection: thread.includeSelection,
		});

		const issueKey = detectIssueKeyFromText(text);
		const jiraWorkflowIssueKey = settings.enableJiraWorkflow && issueKey ? issueKey : undefined;

		if (jiraWorkflowIssueKey) {
			this.jiraWorkflow.startWorkflow(jiraWorkflowIssueKey);
			this._appendActivityLine(assistantMsg, narrateWorkflowStage('fetch', jiraWorkflowIssueKey), 'streaming', 'status-jira-fetch');
			try {
				context.jiraIssues = await this.agenticMcp.fetchJiraIssuesForMessage(text);
				this._completeActivityLine(assistantMsg, 'status-jira-fetch');
				for (const issue of context.jiraIssues) {
					const failed = issue.rawText?.includes('<jira_fetch_status>FAILED</jira_fetch_status>');
					if (failed) {
						const kindMatch = issue.rawText?.match(/<jira_fetch_failure kind="([^"]+)">/);
						const kind = kindMatch?.[1] ?? 'unknown';
						this._appendActivityLine(
							assistantMsg,
							`JIRA pre-fetch failed for ${issue.issueKey} (${kind}) — see diagnostics in reply`,
							'complete',
						);
					} else {
						this._appendActivityLine(
							assistantMsg,
							issue.summary ? `Loaded ${issue.issueKey}: ${issue.summary}` : `Loaded ${issue.issueKey} from JIRA`,
							'complete',
						);
					}
				}
			} catch (e) {
				this._appendActivityLine(
					assistantMsg,
					`Could not fetch JIRA ticket: ${e instanceof Error ? e.message : String(e)}`,
					'complete',
				);
			}
		}

		for (const line of narrateContextCollected(context)) {
			this._appendActivityLine(assistantMsg, line, 'complete');
		}

		const mcpTools = this.agenticMcp.getSerializableTools();
		const mcpServerEnv = await this.agenticMcp.getMcpServerEnvs();
		const jiraEnvDiagnosticsPrompt = jiraWorkflowIssueKey
			? await this.agenticMcp.getAtlassianEnvDiagnosticsPrompt()
			: undefined;
		if (mcpTools.length) {
			const servers = this.agenticMcp.getConnectedServerNames();
			this._appendActivityLine(
				assistantMsg,
				`Connected to MCP: ${servers.join(', ')} (${mcpTools.length} tools available)`,
				'complete',
			);
		}

		this._notify();

		const voidState = this.voidSettings.state;
		const chatDisabled = isFeatureNameDisabled('Chat', voidState);

		let runtimeMode = settings.runtimeMode;
		let voidProvider: VoidProviderConfig | undefined;

		if (settings.providerType === 'void' && !chatDisabled) {
			const modelSelection = voidState.modelSelectionOfFeature.Chat!;
			voidProvider = {
				providerName: modelSelection.providerName,
				modelName: modelSelection.modelName,
				settingsOfProvider: voidState.settingsOfProvider,
				modelSelectionOptions: voidState.optionsOfModelSelection.Chat?.[modelSelection.providerName]?.[modelSelection.modelName],
			};
			runtimeMode = 'local_provider';
		} else if (chatDisabled && settings.providerType === 'void') {
			assistantMsg.state = 'error';
			assistantMsg.content = 'Configure a Chat model in Agentic_MPS Settings or switch Agentic provider to OpenAI-compatible.';
			thread.status = 'failed';
			thread.currentRunId = null;
			this._setLiveStatus(thread, { phase: 'error', title: 'No model configured', detail: 'Open Agentic_MPS Settings' });
			this._notifyImmediate();
			return;
		}

		const modelName = settings.providerType === 'void' && voidProvider
			? voidProvider.modelName
			: settings.model;

		const request = convertToRuntimeRequest(
			thread,
			context,
			{
				runtimeMode,
				model: modelName,
				settings,
				autoApplyEdits: thread.autoApplyEdits,
				mcpTools,
				mcpServerEnv,
				jiraWorkflowIssueKey,
				jiraEnvDiagnosticsPrompt,
			},
			runId,
		);
		request.voidProvider = voidProvider;
		request.options.externalGatewayUrl = settings.runtimeBaseUrl;
		request.options.apiKeyEnvVar = settings.apiKeyEnvVar;
		request.options.requestTimeoutMs = settings.requestTimeoutMs;

		this._notifyImmediate();

		this.activeRequestId = this.runtimeService.startRun({
			request,
			onEvent: (event) => this._reduceEvent(thread, assistantMsg, event),
			onError: ({ message }) => {
				assistantMsg.state = 'error';
				assistantMsg.content = message;
				thread.status = 'failed';
				thread.lastError = message;
				this._setLiveStatus(thread, { phase: 'error', title: 'Run failed', detail: message });
				thread.currentRunId = null;
				this.activeRequestId = null;
				this._notify();
			},
		});
	}

	stopCurrentRun(): void {
		if (this.activeRequestId) {
			this.runtimeService.abort(this.activeRequestId);
			this.activeRequestId = null;
		}
		const thread = this._current();
		if (thread) {
			thread.currentRunId = null;
			thread.status = 'idle';
			thread.liveStatus = null;
			this._onDidLiveStatusChange.fire(null);
		}
		this._notifyImmediate();
	}

	private _setLiveStatus(thread: ChatThread, partial: Omit<LiveAgentStatus, 'updatedAt'>): void {
		thread.liveStatus = { ...partial, updatedAt: Date.now() };
		this._onDidLiveStatusChange.fire(thread.liveStatus);
	}

	private _appendActivityLine(
		msg: ChatMessage,
		text: string,
		status: ActivityLine['status'] = 'complete',
		lineId?: string,
	): void {
		if (!text.trim()) {
			return;
		}
		msg.activityLines = msg.activityLines ?? [];
		const id = lineId ?? generateUuid();
		const line: ActivityLine = { id, text: text.trim(), status, timestamp: Date.now() };
		const idx = msg.activityLines.findIndex(l => l.id === id);
		if (idx >= 0) {
			msg.activityLines[idx] = line;
		} else {
			msg.activityLines.push(line);
		}
	}

	private _completeActivityLine(msg: ChatMessage, lineId: string): void {
		const line = msg.activityLines?.find(l => l.id === lineId);
		if (line) {
			line.status = 'complete';
		}
	}

	approveEdit(approvalId: string): void {
		this._resolveApproval(approvalId, 'approved');
	}

	rejectEdit(approvalId: string): void {
		this._resolveApproval(approvalId, 'rejected');
	}

	private _resolveApproval(approvalId: string, decision: 'approved' | 'rejected'): void {
		const thread = this._current();
		if (!thread || !this.activeRequestId || !this.activeRunId) return;

		const ar = thread.approvalRequests.find(a => a.id === approvalId);
		if (ar) ar.decision = decision;
		this.editApproval.decide(approvalId, decision);

		const assistantMsg = [...thread.messages].reverse().find(m => m.role === 'assistant');
		if (!assistantMsg) return;

		this.runtimeService.resolveApproval({
			requestId: this.activeRequestId,
			runId: this.activeRunId,
			approvalId,
			decision,
			onEvent: (event) => this._reduceEvent(thread, assistantMsg, event),
			onError: ({ message }) => {
				assistantMsg.state = 'error';
				assistantMsg.content = message;
				this._notify();
			},
		});
	}

	private _reduceEvent(thread: ChatThread, assistantMsg: ChatMessage, event: AgentEvent): void {
		const p = event.payload;
		thread.updatedAt = Date.now();

		switch (event.type) {
			case 'run_started':
				thread.status = 'running';
				break;
			case 'context_collected':
				break;
			case 'activity_narrative': {
				assistantMsg.state = 'thinking';
				const text = String(p.text ?? '');
				const lineId = p.lineId ? String(p.lineId) : undefined;
				const status = (p.status === 'streaming' ? 'streaming' : 'complete') as ActivityLine['status'];
				this._appendActivityLine(assistantMsg, text, status, lineId);
				break;
			}
			case 'thinking_started':
			case 'thinking_delta': {
				const narrative = String(p.text ?? p.title ?? '');
				if (narrative && !/^(Querying LLM|Streaming response)/i.test(narrative) && !/^\d+ chars?$/i.test(narrative)) {
					this._appendActivityLine(
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
						this._appendActivityLine(assistantMsg, parts.working, 'complete', LIVE_THOUGHT_LINE_ID);
					}
					assistantMsg.content = '';
				} else if (parts.answer) {
					assistantMsg.state = 'streaming';
					// Stream the model’s own words in the activity feed while working
					this._appendActivityLine(assistantMsg, parts.answer, 'streaming', LIVE_THOUGHT_LINE_ID);
					assistantMsg.content = '';
				}
				this._scheduleUiNotify();
				return;
			}
			case 'tool_call_started': {
				assistantMsg.state = 'waiting_for_tool';
				this._completeActivityLine(assistantMsg, LIVE_THOUGHT_LINE_ID);
				const toolName = String(p.name ?? 'tool');
				const toolArgs = (p.arguments as Record<string, unknown>) ?? {};
				this._appendActivityLine(assistantMsg, narrateToolStart(toolName, toolArgs), 'complete');
				const tc: ToolCall = {
					id: String(p.toolCallId ?? generateUuid()),
					name: toolName,
					arguments: toolArgs,
					status: 'running',
					startedAt: event.timestamp,
				};
				assistantMsg.toolCalls = assistantMsg.toolCalls ?? [];
				assistantMsg.toolCalls.push(tc);
				break;
			}
			case 'tool_call_completed': {
				const toolId = String(p.toolCallId ?? '');
				const tc = assistantMsg.toolCalls?.find(t => t.id === toolId);
				if (tc) {
					tc.status = 'complete';
					tc.completedAt = event.timestamp;
					tc.resultPreview = String(p.resultPreview ?? '');
					this._appendActivityLine(assistantMsg, narrateToolDone(tc.name, tc.resultPreview ?? ''), 'complete');
				}
				const tr: ToolResult = {
					toolCallId: toolId,
					content: String(p.resultPreview ?? ''),
					isError: !!p.isError,
				};
				assistantMsg.toolResults = assistantMsg.toolResults ?? [];
				assistantMsg.toolResults.push(tr);
				assistantMsg.streamRaw = '';
				assistantMsg.content = '';
				break;
			}
			case 'approval_required': {
				assistantMsg.state = 'waiting_for_approval';
				thread.status = 'waiting_approval';
				this._appendActivityLine(assistantMsg, narrateApproval(), 'complete');
				const ar: ApprovalRequest = {
					id: String(p.approvalId ?? generateUuid()),
					toolCallId: String(p.toolCallId ?? ''),
					title: String(p.title ?? 'Approval required'),
					description: String(p.description ?? ''),
					preview: p.preview ? String(p.preview) : undefined,
					decision: 'pending',
					createdAt: event.timestamp,
				};
				thread.approvalRequests.push(ar);
				this.editApproval.setPending(thread.approvalRequests.filter(a => a.decision === 'pending'));
				break;
			}
			case 'checkpoint_created': {
				thread.checkpoints.push({
					id: String(p.checkpointId ?? generateUuid()),
					createdAt: event.timestamp,
					label: String(p.label ?? 'checkpoint'),
					snapshotId: p.snapshotId ? String(p.snapshotId) : undefined,
				});
				thread.currentCheckpointId = thread.checkpoints[thread.checkpoints.length - 1]?.id ?? null;
				break;
			}
			case 'run_completed': {
				assistantMsg.state = 'complete';
				const finalRaw = String(p.finalText ?? assistantMsg.streamRaw ?? assistantMsg.content);
				this._completeActivityLine(assistantMsg, LIVE_THOUGHT_LINE_ID);
				const answer = stripToolFences(finalRaw);
				if (answer) {
					assistantMsg.content = answer;
				}
				assistantMsg.streamRaw = undefined;
				this._appendActivityLine(assistantMsg, narrateComplete(), 'complete');
				thread.status = 'completed';
				thread.liveStatus = null;
				thread.currentRunId = null;
				this.activeRequestId = null;
				this.lastFailedUserText = null;
				break;
			}
			case 'run_failed': {
				assistantMsg.state = 'error';
				assistantMsg.content = String(p.message ?? 'Run failed');
				this._appendActivityLine(assistantMsg, `I ran into a problem: ${String(p.message ?? 'unknown error')}`, 'complete');
				thread.status = 'failed';
				thread.lastError = String(p.message ?? '');
				thread.liveStatus = null;
				thread.currentRunId = null;
				this.activeRequestId = null;
				break;
			}
			default:
				break;
		}
		this._notifyImmediate();
	}

	async pickJiraTicketInChat(ticketKey: string): Promise<void> {
		const thread = this._current();
		if (!thread) {
			return;
		}
		const key = ticketKey.toUpperCase();
		thread.messages.push({
			id: generateUuid(),
			role: 'user',
			content: `Selected ${key}`,
			createdAt: Date.now(),
		});
		thread.updatedAt = Date.now();
		this._notify();
		await this._jiraChatSelectTicket(key);
	}

	async acceptJiraWorkflowInChat(): Promise<void> {
		await this.jiraWorkflow.acceptWorkflow();
		this._syncJiraChatMessage();
	}

	declineJiraWorkflowInChat(): void {
		this.jiraWorkflow.declineWorkflow();
		this._syncJiraChatMessage();
	}

	async regenerateJiraPlanInChat(): Promise<void> {
		await this.jiraWorkflow.regeneratePlan();
		this._syncJiraChatMessage();
	}

	async refreshJiraTicketsInChat(): Promise<void> {
		await this._jiraChatShowOpenTickets('Refresh open JIRA tickets', true);
	}

	showJiraTicketListInChat(): void {
		this.jiraWorkflow.backToTicketList();
		this._syncJiraChatMessage();
	}

	async getJiraMcpStatusSummary(): Promise<string> {
		return this.agenticMcp.getJiraMcpStatusSummary();
	}

	async loadJiraTicketsInChat(): Promise<void> {
		await this._jiraChatShowOpenTickets('Show open JIRA tickets in chat');
	}

	private async _handleJiraChatIntent(userText: string, intent: JiraChatIntent): Promise<void> {
		switch (intent.kind) {
			case 'list_open':
				await this._jiraChatShowOpenTickets(userText);
				break;
			case 'refresh_list':
				await this._jiraChatShowOpenTickets(userText, true);
				break;
			case 'select':
				await this._jiraChatSelectTicket(intent.ticketKey, true);
				break;
			case 'accept_workflow':
				await this.acceptJiraWorkflowInChat();
				break;
			case 'decline_workflow':
				this.declineJiraWorkflowInChat();
				break;
			case 'regenerate_plan':
				await this.regenerateJiraPlanInChat();
				break;
		}
	}

	private async _jiraChatShowOpenTickets(userText: string, refreshOnly = false): Promise<void> {
		const thread = this._current();
		if (!thread) {
			return;
		}

		if (!refreshOnly) {
			thread.messages.push({
				id: generateUuid(),
				role: 'user',
				content: userText,
				createdAt: Date.now(),
			});
		}

		const assistantMsg: ChatMessage = {
			id: generateUuid(),
			role: 'assistant',
			content: 'Loading open JIRA tickets…',
			createdAt: Date.now(),
			state: 'thinking',
			jiraChat: { ...createEmptyJiraChatUi(), planLoading: true },
			activityLines: [],
		};
		thread.messages.push(assistantMsg);
		this.activeJiraChatMessageId = assistantMsg.id;
		thread.status = 'running';
		thread.updatedAt = Date.now();
		this._notify();

		try {
			const tickets = await this.agenticMcp.listOpenTickets();
			this.jiraWorkflow.applyOpenTicketsFromChat(tickets);
			assistantMsg.state = 'complete';
			thread.status = 'idle';
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			assistantMsg.state = 'complete';
			assistantMsg.content = `Could not load JIRA tickets: ${msg}`;
			this.jiraWorkflow.setChatError(msg);
			thread.status = 'idle';
		}
		this._applyJiraChatToMessage(assistantMsg);
		this._notify();
	}

	private async _jiraChatSelectTicket(ticketKey: string, addUserMessage = false): Promise<void> {
		const thread = this._current();
		if (!thread) {
			return;
		}

		const key = ticketKey.toUpperCase();

		if (addUserMessage) {
			thread.messages.push({
				id: generateUuid(),
				role: 'user',
				content: `Work on ${key}`,
				createdAt: Date.now(),
			});
		}

		let assistantMsg = this.activeJiraChatMessageId
			? thread.messages.find(m => m.id === this.activeJiraChatMessageId)
			: undefined;

		if (!assistantMsg || assistantMsg.role !== 'assistant') {
			assistantMsg = {
				id: generateUuid(),
				role: 'assistant',
				content: `Loading ${key}…`,
				createdAt: Date.now(),
				state: 'thinking',
				jiraChat: createEmptyJiraChatUi(),
				activityLines: [],
			};
			thread.messages.push(assistantMsg);
			this.activeJiraChatMessageId = assistantMsg.id;
		}

		assistantMsg.state = 'thinking';
		thread.status = 'running';
		thread.updatedAt = Date.now();
		this._notify();

		try {
			const fromList = this.jiraWorkflow.interactive.openTickets.find(t => t.key === key);
			if (fromList) {
				await this.jiraWorkflow.selectTicket(fromList);
			} else {
				await this.jiraWorkflow.selectTicketByKey(key);
			}
			assistantMsg.state = 'complete';
			thread.status = 'idle';
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			assistantMsg.state = 'complete';
			assistantMsg.content = `Could not load ${key}: ${msg}`;
			this.jiraWorkflow.setChatError(msg);
			thread.status = 'idle';
		}
		this._applyJiraChatToMessage(assistantMsg);
		this._notify();
	}

	private _applyJiraChatToMessage(msg: ChatMessage): void {
		if (!msg.jiraChat) {
			msg.jiraChat = createEmptyJiraChatUi();
		}
		const ui = jiraInteractiveToChatUi(this.jiraWorkflow.interactive);
		msg.jiraChat = ui;
		msg.content = this._jiraChatSummaryText(ui);
		if (ui.executing) {
			msg.state = 'streaming';
		} else if (ui.error) {
			msg.state = 'complete';
		} else if (ui.mode === 'complete' || ui.mode === 'declined' || (ui.mode === 'detail' && ui.plan && !ui.planLoading)) {
			msg.state = msg.state === 'error' ? 'error' : 'complete';
		}
	}

	private _syncJiraChatMessage(): void {
		const thread = this._current();
		if (!thread || !this.activeJiraChatMessageId) {
			return;
		}
		const msg = thread.messages.find(m => m.id === this.activeJiraChatMessageId);
		if (!msg) {
			return;
		}
		this._applyJiraChatToMessage(msg);
		thread.updatedAt = Date.now();
		this._notify();
	}

	private _jiraChatSummaryText(ui: JiraChatMessageUi): string {
		if (ui.error) {
			return `JIRA workflow error: ${ui.error}`;
		}
		switch (ui.mode) {
			case 'list':
				return ui.tickets.length
					? `${ui.tickets.length} open JIRA ticket(s) — click a ticket below to continue.`
					: 'No open JIRA tickets found. Check Atlassian MCP in settings or try Refresh.';
			case 'detail':
				if (ui.selectedTicket) {
					return `${ui.selectedTicket.key}: ${ui.selectedTicket.summary} — review the workflow plan and accept to run.`;
				}
				return 'Select a JIRA ticket from the list.';
			case 'executing':
				return `Running workflow for ${ui.selectedTicket?.key ?? 'ticket'}… (see live stream below)`;
			case 'complete':
				return `Workflow completed for ${ui.selectedTicket?.key ?? 'ticket'}.`;
			case 'declined':
				return 'Workflow declined — no code or JIRA changes were made.';
			default:
				return 'JIRA workflow';
		}
	}
}

registerSingleton(IAgenticChatThreadService, AgenticChatThreadService, InstantiationType.Eager);
