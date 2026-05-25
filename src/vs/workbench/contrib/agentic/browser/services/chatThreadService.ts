/*--------------------------------------------------------------------------------------
 *  Agentic AI — client-side chat state + event reducer
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import type {
	ActivityLine,
	ActivityLineKind,
	AgentActivityKind,
	AgentEvent,
	ChatMessage,
	ChatThread,
	Checkpoint,
	ThinkingEvent,
	LiveAgentStatus,
	TouchedFileStatus,
} from '../../common/agenticTypes.js';
import { getComposerAgentMode, type ComposerAgentModeId } from '../../common/agentModes.js';
import { IAgenticWorkspaceRulesService } from './workspaceRulesService.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { recordLintVerificationResult } from '../../common/orchestration/verificationAdapter.js';
import { hasLintErrors } from '../../common/postEditVerify.js';
import { IAgenticVoidToolBridgeService } from './agenticVoidToolBridgeService.js';
import { buildEscalatingNudge } from '../../common/agentOrchestration.js';
import type { WorkflowExecutionPromptOptions, WorkflowExecutionRunResult } from '../../common/workflowExecutionTypes.js';
import {
	workflowPhaseLabel,
	workflowPhaseLiveTitle,
	type AgentWorkflowPhase,
} from '../../common/agentWorkflowOrchestration.js';
import { syncCanonicalFromLegacyPhase } from '../../common/orchestration/canonicalWorkflowTracker.js';
import { isVoidLikeSimpleUiMode } from '../../common/voidLikeChatMode.js';
import { IKnowledgeGraphService } from './knowledgeGraphService.js';
import { ISymbolImpactService } from './symbolImpactService.js';
import { ISessionMemoryService } from './sessionMemoryService.js';
import { IAgenticRuntimeService } from '../../common/agenticRuntimeService.js';
import { IContextCollectorService } from './contextCollectorService.js';
import { ICodeIntelligenceService } from './codeIntelligenceService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEditApprovalService } from './editApprovalService.js';
import { IAgenticSettingsService } from './agenticSettingsService.js';
import { IAgenticMcpService } from './agenticMcpService.js';
import { IJiraWorkflowService } from './jiraWorkflowServiceInterface.js';
import { IAgenticEditorBridgeService } from './agenticEditorBridgeService.js';
import { isJiraTicketOpen } from '../../common/mcp/jiraTicketStatus.js';
import { detectJiraChatIntent, type JiraChatIntent } from '../../common/mcp/jiraChatIntent.js';
import { IVoidSettingsService } from '../../../void/common/voidSettingsService.js';
import { isFeatureNameDisabled } from '../../../void/common/voidSettingsTypes.js';
import { setAgenticLogSink, formatAgenticLogLine } from '../../common/agenticObservability.js';
import {
	configureAgenticDevConsole,
	logAgentEventToDevConsole,
	logAgenticObservabilityToDevConsole,
	logAgenticWorkflowError,
} from '../../common/agenticDevConsole.js';
import { loadChatThreads, persistChatThreads } from './chatThreadStorage.js';
import { IAgentMetricsService } from './agentMetricsService.js';
import { LIVE_THOUGHT_LINE_ID, reduceChatThreadEvent, type ChatThreadEventReducerHost } from './chatThreadEventReducer.js';
import { executeChatThreadSend, type ChatThreadSendHost } from './chatThreadSendService.js';
import {
	previewProposeEditTool,
	previewProposeEditsForApproval,
	resolveChatThreadApproval,
	type ChatThreadApprovalHost,
	type ChatThreadApprovalResolveHost,
} from './chatThreadApprovalService.js';
import type { RunMemoryInput } from '../../common/sessionMemoryTypes.js';
import { AgentCheckpointStore, type PersistedCheckpointSnapshot } from './agentCheckpointStore.js';
import { loadMentionSnippets, resolveMentionPaths, type MentionResolverDeps } from './chatThreadMentionsService.js';

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
	/** Re-run with orchestrator nudge after a plan-only stall */
	continueAfterStall(): Promise<void>;
	stopCurrentRun(): void;
	approveEdit(approvalId: string): void;
	rejectEdit(approvalId: string): void;
	setIncludeActiveFile(v: boolean): void;
	setIncludeSelection(v: boolean): void;
	setAutoApplyEdits(v: boolean): void;
	setAgentMode(modeId: import('../../common/agentModes.js').ComposerAgentModeId): void;
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
	/** Run agent for JIRA execution (skips chat intent routing; waits until run ends). */
	sendWorkflowExecutionPrompt(text: string, options?: WorkflowExecutionPromptOptions): Promise<WorkflowExecutionRunResult>;
	/** Open a file from the workflow strip (restores live diff preview when applicable). */
	openTouchedFile(filePath: string, messageId?: string): Promise<void>;
	/** Search workspace paths for @ mention picker */
	searchComposerContext(query: string): Promise<{ path: string; score: number }[]>;
	resolvePlanDecision(): void;
	executeApprovedPlan(): Promise<void>;
	/** Restore workspace files from a checkpoint created during this thread's agent run. */
	restoreCheckpoint(checkpointId: string): Promise<{ ok: boolean; message: string }>;
	/** Snapshot touched files in the current thread (persisted across restarts). */
	createManualCheckpoint(label?: string): Promise<{ ok: boolean; message: string }>;
}

class AgenticChatThreadService extends Disposable implements IAgenticChatThreadService {
	declare readonly _serviceBrand: undefined;

	threads: ChatThread[] = [];
	currentThreadId: string | null = null;
	private activeRequestId: string | null = null;
	private activeRunId: string | null = null;
	private lastFailedUserText: string | null = null;
	private _uiNotifyScheduled = false;
	private _suppressJiraChatIntent = false;
	private readonly _checkpointStore = new AgentCheckpointStore(this.storageService);
	private _lastPersistedCheckpointId: string | null = null;
	private _runWait: {
		runId: string;
		resolve: (r: { status: 'completed' | 'failed' | 'stopped'; error?: string }) => void;
	} | null = null;
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
		@IAgenticEditorBridgeService private readonly editorBridge: IAgenticEditorBridgeService,
		@IAgenticVoidToolBridgeService private readonly voidToolBridge: IAgenticVoidToolBridgeService,
		@IKnowledgeGraphService private readonly knowledgeGraph: IKnowledgeGraphService,
		@ISymbolImpactService private readonly symbolImpact: ISymbolImpactService,
		@ISessionMemoryService private readonly sessionMemory: ISessionMemoryService,
		@IAgentMetricsService private readonly agentMetrics: IAgentMetricsService,
		@IAgenticWorkspaceRulesService private readonly workspaceRules: IAgenticWorkspaceRulesService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContext: IWorkspaceContextService,
		@ICodeIntelligenceService private readonly codeIntelligence: ICodeIntelligenceService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._syncDevConsoleFromSettings();
		this._register(this.agenticSettings.onDidChange(() => this._syncDevConsoleFromSettings()));
		setAgenticLogSink(ev => {
			this.agentMetrics.ingestLog(ev);
			this.logService.info(formatAgenticLogLine(ev));
			logAgenticObservabilityToDevConsole(ev);
		});
		this._register(this.jiraWorkflow.onDidChange(() => this._notify()));
		this._register(this.jiraWorkflow.onDidEmitEvent(() => this._notify()));
		this._loadThreads();
		for (const t of this.threads) {
			this._syncThreadCheckpoints(t);
		}
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
		persistChatThreads(this.storageService, this.threads, this.currentThreadId);
	}

	private _loadThreads(): void {
		const data = loadChatThreads(this.storageService);
		if (data.threads.length) {
			this.threads = data.threads;
			this.currentThreadId = data.currentThreadId;
			for (const t of this.threads) {
				this._syncThreadCheckpoints(t);
			}
		}
	}

	private _syncThreadCheckpoints(thread: ChatThread): void {
		thread.checkpoints = this._checkpointStore.mergeThreadCheckpoints(thread.id, thread.checkpoints);
	}

	private _mentionDeps(): MentionResolverDeps {
		return {
			fileService: this.fileService,
			searchComposerContext: q => this.searchComposerContext(q),
		};
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
			autoApplyEdits: true,
			agentModeId: 'agent',
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
		const t = this._current();
		if (t) {
			this._syncThreadCheckpoints(t);
		}
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

	setAgentMode(modeId: ComposerAgentModeId): void {
		const t = this._current();
		if (!t) {
			return;
		}
		const mode = getComposerAgentMode(modeId);
		t.agentModeId = mode.id;
		if (mode.agentRunMode === 'plan_only') {
			t.agentRunMode = 'plan_only';
		} else if (t.agentRunMode === 'plan_only') {
			t.agentRunMode = 'default';
		}
		t.updatedAt = Date.now();
		this._notify();
	}

	async retryLastMessage(): Promise<void> {
		if (!this.lastFailedUserText) return;
		await this.sendUserMessage(this.lastFailedUserText);
	}

	async continueAfterStall(): Promise<void> {
		const thread = this._current();
		if (!thread) {
			return;
		}
		const lastUser = [...thread.messages].reverse().find(m => m.role === 'user')?.content ?? '';
		const lastAssistant = [...thread.messages].reverse().find(m => m.role === 'assistant');
		const planText = lastAssistant?.content ?? '';
		await this.sendUserMessage(buildEscalatingNudge(0, planText, lastUser));
	}

	private async _autoContinueAfterStall(userMessage: string, planText: string): Promise<void> {
		await this.sendUserMessage(buildEscalatingNudge(0, planText, userMessage));
	}

	async startJiraWorkflow(issueKey: string): Promise<void> {
		this.jiraWorkflow.startWorkflow(issueKey);
		await this.sendUserMessage(this.jiraWorkflow.buildWorkflowUserPrompt(issueKey));
	}

	async openMcpConfig(): Promise<void> {
		await this.agenticMcp.revealMcpConfig();
	}

	async sendWorkflowExecutionPrompt(text: string, options?: WorkflowExecutionPromptOptions): Promise<WorkflowExecutionRunResult> {
		this._suppressJiraChatIntent = true;
		try {
			await this._sendUserMessageCore(text, options);
			const thread = this._current();
			const runId = thread?.currentRunId;
			if (!runId) {
				if (thread?.status === 'failed') {
					return {
						status: 'failed',
						error: thread.lastError ?? 'Run failed',
						...this._workflowRunMetadata(thread),
					};
				}
				if (thread?.status === 'completed') {
					return { status: 'completed', ...this._workflowRunMetadata(thread) };
				}
				return { status: 'failed', error: 'No active agent run' };
			}
			return await this._waitForRunCompletion(runId);
		} finally {
			this._suppressJiraChatIntent = false;
		}
	}

	async sendUserMessage(text: string): Promise<void> {
		try {
			await this._sendUserMessageCore(text);
		} catch (e) {
			this._failCurrentRun(e instanceof Error ? e.message : String(e));
		}
	}

	async searchComposerContext(query: string): Promise<{ path: string; score: number }[]> {
		const q = query.trim();
		const chunks = await this.codeIntelligence.getRelevantContext(q || 'src', 16);
		const filtered = q
			? chunks.filter(c => c.path.toLowerCase().includes(q.toLowerCase()))
			: chunks;
		return (filtered.length ? filtered : chunks).map(c => ({ path: c.path, score: c.score }));
	}

	resolvePlanDecision(): void {
		const thread = this._current();
		if (!thread) {
			return;
		}
		const lastAssistant = [...thread.messages].reverse().find(m => m.role === 'assistant');
		if (
			(lastAssistant?.decision?.kind === 'plan_execute' || lastAssistant?.decision?.kind === 'plan_exploration')
			&& !lastAssistant.decision.resolved
		) {
			lastAssistant.decision = { ...lastAssistant.decision, resolved: true };
			this._notify();
		}
	}

	async executeApprovedPlan(): Promise<void> {
		this.resolvePlanDecision();
		const thread = this._current();
		if (!thread) {
			return;
		}
		thread.agentRunMode = 'execute_approved_plan';
		thread.activeSkillId = undefined;
		await this._sendUserMessageCore(
			'[Execute approved plan] Implement the plan from your previous message. Use tools — read_file, propose_file_edit with valid searchReplaceBlocks, run_terminal_command for tests.',
		);
	}

	async restoreCheckpoint(checkpointId: string): Promise<{ ok: boolean; message: string }> {
		const thread = this._current();
		const cp = thread?.checkpoints.find(c => c.id === checkpointId);
		if (!thread || !cp) {
			return { ok: false, message: 'Checkpoint not found in this chat.' };
		}
		const folder = this.workspaceContext.getWorkspace().folders[0]?.uri.fsPath;
		if (!folder) {
			return { ok: false, message: 'Open a workspace folder to restore checkpoints.' };
		}

		const persisted = this._checkpointStore.get(checkpointId);
		if (persisted?.files.length) {
			let restored = 0;
			for (const file of persisted.files) {
				try {
					await this.editorBridge.writeFile(file.path, file.content);
					restored++;
				} catch {
					// continue with other files
				}
			}
			if (restored === 0) {
				return { ok: false, message: 'Could not restore any files from the saved snapshot.' };
			}
			thread.currentCheckpointId = checkpointId;
			thread.updatedAt = Date.now();
			const assistantMsg = [...thread.messages].reverse().find(m => m.role === 'assistant');
			if (assistantMsg) {
				this._appendActivityLine(
					assistantMsg,
					`Restored checkpoint “${cp.label}” (${restored} file${restored === 1 ? '' : 's'}).`,
					'complete',
					`cp-restore-${checkpointId}`,
					'orchestrator',
				);
			}
			this._notifyImmediate();
			return { ok: true, message: `Restored ${restored} file${restored === 1 ? '' : 's'} from saved snapshot.` };
		}

		const result = await this.runtimeService.restoreCheckpoint(checkpointId, folder);
		if (!result.ok) {
			return { ok: false, message: result.message };
		}

		thread.currentCheckpointId = checkpointId;
		thread.updatedAt = Date.now();

		const assistantMsg = [...thread.messages].reverse().find(m => m.role === 'assistant');
		if (assistantMsg) {
			this._appendActivityLine(
				assistantMsg,
				`Restored checkpoint “${cp.label}” (${result.restoredPaths.length} file${result.restoredPaths.length === 1 ? '' : 's'}).`,
				'complete',
				`cp-restore-${checkpointId}`,
				'orchestrator',
			);
		}

		for (const rel of result.restoredPaths.slice(0, 24)) {
			const full = rel.startsWith(folder)
				? rel
				: `${folder}/${rel.replace(/^[/\\]/, '')}`;
			try {
				const content = (await this.fileService.readFile(URI.file(full))).value.toString();
				await this.editorBridge.writeFile(rel, content);
			} catch {
				void this.editorBridge.openFileInEditor(rel);
			}
		}

		void this._persistSnapshotFromMain(thread, checkpointId, cp.label, cp.createdAt);
		this._notifyImmediate();
		return { ok: true, message: result.message };
	}

	async createManualCheckpoint(label = 'Manual checkpoint'): Promise<{ ok: boolean; message: string }> {
		const thread = this._current();
		if (!thread) {
			return { ok: false, message: 'No active chat.' };
		}
		const paths = this._collectCheckpointPaths(thread);
		if (!paths.length) {
			return { ok: false, message: 'No touched files yet — run the agent or edit files first.' };
		}
		const files = await this._readFilesForCheckpoint(paths);
		if (!files.length) {
			return { ok: false, message: 'Could not read any files for this checkpoint.' };
		}
		const checkpointId = generateUuid();
		const now = Date.now();
		const snapshot: PersistedCheckpointSnapshot = {
			checkpointId,
			threadId: thread.id,
			label,
			createdAt: now,
			fileCount: files.length,
			files,
		};
		this._checkpointStore.upsert(snapshot);
		this._lastPersistedCheckpointId = checkpointId;
		const meta: Checkpoint = {
			id: checkpointId,
			createdAt: now,
			label,
			snapshotId: checkpointId,
			fileCount: files.length,
			paths: files.map(f => f.path),
		};
		thread.checkpoints.push(meta);
		thread.currentCheckpointId = checkpointId;
		thread.updatedAt = Date.now();
		this._syncThreadCheckpoints(thread);
		this._notifyImmediate();
		return { ok: true, message: `Saved checkpoint with ${files.length} file${files.length === 1 ? '' : 's'}.` };
	}

	private _collectCheckpointPaths(thread: ChatThread): string[] {
		const paths = new Set<string>();
		for (const m of thread.messages) {
			for (const f of m.touchedFiles ?? []) {
				if (f.path?.trim()) {
					paths.add(f.path.trim());
				}
			}
		}
		for (const cp of thread.checkpoints) {
			for (const p of cp.paths ?? []) {
				if (p.trim()) {
					paths.add(p.trim());
				}
			}
		}
		return [...paths].slice(0, 40);
	}

	private async _readFilesForCheckpoint(paths: string[]): Promise<{ path: string; content: string }[]> {
		const folder = this.workspaceContext.getWorkspace().folders[0]?.uri.fsPath;
		const files: { path: string; content: string }[] = [];
		for (const p of paths) {
			const candidates = folder && !p.startsWith(folder)
				? [`${folder}/${p.replace(/^[/\\]/, '')}`, p]
				: [p];
			for (const full of candidates) {
				try {
					const content = (await this.fileService.readFile(URI.file(full))).value.toString();
					files.push({ path: p, content });
					break;
				} catch { /* try next */ }
			}
		}
		return files;
	}

	private async _persistSnapshotFromMain(
		thread: ChatThread,
		checkpointId: string,
		label: string,
		createdAt: number,
	): Promise<void> {
		try {
			const snap = await this.runtimeService.getCheckpointSnapshot(checkpointId);
			if (!snap.found || !snap.files.length) {
				return;
			}
			this._checkpointStore.upsert({
				checkpointId: snap.checkpointId,
				threadId: thread.id,
				label,
				createdAt,
				fileCount: snap.files.length,
				files: snap.files,
			});
			this._lastPersistedCheckpointId = checkpointId;
			this._syncThreadCheckpoints(thread);
		} catch { /* main snapshot may be gone */ }
	}

	private async _persistLatestCheckpoint(thread: ChatThread, cp: Checkpoint): Promise<void> {
		if (cp.id === this._lastPersistedCheckpointId) {
			return;
		}
		if (this._checkpointStore.get(cp.id)?.files.length) {
			this._lastPersistedCheckpointId = cp.id;
			return;
		}
		try {
			const snap = await this.runtimeService.getCheckpointSnapshot(cp.id);
			if (snap.found && snap.files.length) {
				this._checkpointStore.upsert({
					checkpointId: snap.checkpointId,
					threadId: thread.id,
					label: cp.label,
					createdAt: cp.createdAt,
					fileCount: snap.files.length,
					files: snap.files,
				});
				cp.paths = snap.files.map(f => f.path);
				cp.fileCount = snap.files.length;
				this._lastPersistedCheckpointId = cp.id;
				this._syncThreadCheckpoints(thread);
				return;
			}
		} catch { /* fall through */ }

		const paths = cp.paths?.length ? cp.paths : this._collectCheckpointPaths(thread);
		if (!paths.length) {
			return;
		}
		const files = await this._readFilesForCheckpoint(paths);
		if (!files.length) {
			return;
		}
		this._checkpointStore.upsert({
			checkpointId: cp.id,
			threadId: thread.id,
			label: cp.label,
			createdAt: cp.createdAt,
			fileCount: files.length,
			files,
		});
		cp.paths = files.map(f => f.path);
		cp.fileCount = files.length;
		this._lastPersistedCheckpointId = cp.id;
		this._syncThreadCheckpoints(thread);
	}

	private _sendHost(): ChatThreadSendHost {
		const svc = this;
		return {
			get suppressJiraChatIntent() {
				return svc._suppressJiraChatIntent;
			},
			get settings() {
				return svc.agenticSettings.settings;
			},
			getThread: () => svc._current(),
			detectJiraChatIntent: (raw, opts) => detectJiraChatIntent(raw, opts),
			isJiraAwaitingWorkflowDecision: () =>
				svc.jiraWorkflow.interactive.phase === 'awaiting_decision'
				&& !!svc.jiraWorkflow.interactive.plan
				&& !svc.jiraWorkflow.interactive.planLoading,
			handleJiraChatIntent: (raw, intent) => svc._handleJiraChatIntent(raw, intent),
			recordExplicitUserMessage: text => {
				void svc.sessionMemory.recordExplicitUserMessage(text);
			},
			resolveMentionPaths: paths =>
				resolveMentionPaths(
					svc._mentionDeps(),
					svc.workspaceContext.getWorkspace().folders.map(f => f.uri.fsPath),
					paths,
				),
			loadMentionSnippets: paths => loadMentionSnippets(svc._mentionDeps(), paths),
			setLastFailedUserText: text => {
				svc.lastFailedUserText = text;
			},
			setActiveRunId: runId => {
				svc.activeRunId = runId;
			},
			appendActivityLine: (msg, text, status, lineId, kind) =>
				svc._appendActivityLine(msg, text, status, lineId, kind),
			completeActivityLine: (msg, lineId) => svc._completeActivityLine(msg, lineId),
			advanceWorkflowPhase: (thread, msg, phase, detail) =>
				svc._advanceWorkflowPhase(thread, msg, phase, detail),
			setLiveStatus: (thread, partial) => svc._setLiveStatus(thread, partial),
			notify: () => svc._notify(),
			notifyImmediate: () => svc._notifyImmediate(),
			getWorkspaceRulesBlock: () => svc.workspaceRules.getRulesPromptBlock(),
			getSessionMemoryBlock: () => svc.sessionMemory.getPromptBlock(),
			getKnowledgeGraphCached: () => svc.knowledgeGraph.getCached(),
			ensureKnowledgeGraphLoaded: () => svc.knowledgeGraph.ensureLoaded(),
			backgroundKnowledgeGraphBuild: userText => {
				void svc.knowledgeGraph.getOrBuild(userText).catch(() => { /* background */ });
			},
			collectContext: (userText, opts, caps) =>
				svc.contextCollector.collect(userText, {
					includeActiveFile: opts.includeActiveFile,
					includeSelection: opts.includeSelection,
					enableSemanticSearch: caps.semanticCodebaseSearch,
					semanticSearchLimit: opts.semanticSearchLimit,
					dynamicContextDiscovery: opts.dynamicDiscovery,
					extraContextBlocks: opts.extraContextBlocks,
					includeOpenTabs: opts.includeOpenTabs,
					includeRecentFiles: opts.includeRecentFiles,
					includeRelatedTests: opts.includeRelatedTests,
					relatedTestPaths: opts.relatedTestPaths,
				}),
			beginRunMetrics: (runId, threadId, opts) => svc.agentMetrics.beginRun(runId, threadId, opts),
			startJiraWorkflow: key => svc.jiraWorkflow.startWorkflow(key),
			fetchJiraIssuesForMessage: text => svc.agenticMcp.fetchJiraIssuesForMessage(text),
			getJiraEnvDiagnosticsPrompt: () => svc.agenticMcp.getAtlassianEnvDiagnosticsPrompt(),
			getMcpTools: () => svc.agenticMcp.getSerializableTools(),
			getMcpServerEnvs: () => svc.agenticMcp.getMcpServerEnvs(),
			analyzeSymbolTargets: paths =>
				svc.symbolImpact.analyzeTargets(paths, { maxFiles: 6, maxSymbolsPerFile: 4 }),
			readTargetFilesParallel: paths =>
				svc.symbolImpact.readTargetFilesParallel(paths, { maxFiles: 6, maxCharsPerFile: 4000 }),
			isVoidChatDisabled: () => !!isFeatureNameDisabled('Chat', svc.voidSettings.state),
			getVoidProviderConfig: () => {
				const voidState = svc.voidSettings.state;
				const modelSelection = voidState.modelSelectionOfFeature.Chat!;
				return {
					providerName: modelSelection.providerName,
					modelName: modelSelection.modelName,
					settingsOfProvider: voidState.settingsOfProvider,
					modelSelectionOptions: voidState.optionsOfModelSelection.Chat?.[modelSelection.providerName]?.[modelSelection.modelName],
				};
			},
			startRuntimeRun: ({ request, thread, assistantMsg, runId }) => {
				svc.activeRequestId = svc.runtimeService.startRun({
					request,
					onEvent: event => svc._reduceEvent(thread, assistantMsg, event),
					onError: ({ message, fullError }) => {
						logAgenticWorkflowError('runtime', message, {
							runId: runId.slice(0, 8),
							stack: fullError?.stack,
						});
						assistantMsg.state = 'error';
						assistantMsg.content = message;
						thread.status = 'failed';
						thread.lastError = message;
						svc._setLiveStatus(thread, { phase: 'error', title: 'Run failed', detail: message });
						svc._resolveRunWait(runId, { status: 'failed', error: message });
						thread.currentRunId = null;
						svc.activeRequestId = null;
						svc._notify();
					},
				});
			},
		};
	}

	private async _sendUserMessageCore(text: string, options?: WorkflowExecutionPromptOptions): Promise<void> {
		const outcome = await executeChatThreadSend(this._sendHost(), text, options);
		if (outcome.kind === 'noop' || outcome.kind === 'jira_handled') {
			return;
		}
		if (outcome.kind === 'provider_error') {
			return;
		}
	}

	private _workflowRunMetadata(thread: ChatThread | null | undefined): Pick<
		WorkflowExecutionRunResult,
		'completionKind' | 'planStall' | 'toolsRan' | 'workflowSummary'
	> {
		const assistant = thread?.messages
			? [...thread.messages].reverse().find(m => m.role === 'assistant')
			: undefined;
		const summary = assistant?.workflowSummary;
		const toolsRan = (assistant?.toolCalls?.length ?? 0) > 0;
		return {
			completionKind: summary?.completionKind,
			planStall: summary?.completionKind === 'stalled',
			toolsRan,
			workflowSummary: summary,
		};
	}

	private _waitForRunCompletion(runId: string): Promise<WorkflowExecutionRunResult> {
		const settled = (): WorkflowExecutionRunResult | undefined => {
			const thread = this._current();
			if (!thread) {
				return { status: 'failed', error: 'No active chat thread' };
			}
			if (thread.status === 'completed') {
				return { status: 'completed', ...this._workflowRunMetadata(thread) };
			}
			if (thread.status === 'failed') {
				return {
					status: 'failed',
					error: thread.lastError ?? 'Run failed',
					...this._workflowRunMetadata(thread),
				};
			}
			return undefined;
		};

		const immediate = settled();
		if (immediate && !this._current()?.currentRunId) {
			return Promise.resolve(immediate);
		}

		return new Promise(resolve => {
			const timeoutMs = 45 * 60 * 1000;
			let done = false;
			const finish = (r: WorkflowExecutionRunResult) => {
				if (done) {
					return;
				}
				done = true;
				clearTimeout(timer);
				disposable.dispose();
				if (this._runWait?.runId === runId) {
					this._runWait = null;
				}
				resolve(r);
			};
			const timer = setTimeout(() => finish({ status: 'failed', error: 'Agent run timed out' }), timeoutMs);
			const disposable = this.onDidChange(() => {
				const r = settled();
				if (r && !this._current()?.currentRunId) {
					finish(r);
				}
			});
			this._runWait = {
				runId,
				resolve: r => finish(r),
			};
		});
	}

	private _resolveRunWait(runId: string, result: WorkflowExecutionRunResult): void {
		if (this._runWait?.runId === runId) {
			this._runWait.resolve(result);
			this._runWait = null;
		}
	}

	private _failCurrentRun(message: string): void {
		const thread = this._current();
		if (!thread) {
			return;
		}
		const assistantMsg = [...thread.messages].reverse().find(m => m.role === 'assistant');
		if (assistantMsg && assistantMsg.state !== 'complete' && assistantMsg.state !== 'error') {
			assistantMsg.state = 'error';
			assistantMsg.content = message;
			this._appendActivityLine(assistantMsg, message, 'complete');
		}
		const runId = thread.currentRunId;
		if (runId) {
			this._resolveRunWait(runId, { status: 'failed', error: message });
		}
		thread.status = 'failed';
		thread.lastError = message;
		thread.currentRunId = null;
		this.activeRunId = null;
		this.activeRequestId = null;
		this._setLiveStatus(thread, { phase: 'error', title: 'Could not start run', detail: message });
		this._notifyImmediate();
	}

	stopCurrentRun(): void {
		const thread = this._current();
		const runId = thread?.currentRunId ?? this.activeRunId;
		if (this.activeRequestId) {
			this.runtimeService.abort(this.activeRequestId);
			this.activeRequestId = null;
		}
		if (thread) {
			const assistantMsg = [...thread.messages].reverse().find(m => m.role === 'assistant');
			if (assistantMsg && assistantMsg.state !== 'complete' && assistantMsg.state !== 'error') {
				assistantMsg.state = 'error';
				this._completeActivityLine(assistantMsg, LIVE_THOUGHT_LINE_ID);
				this._appendActivityLine(assistantMsg, 'Run cancelled.', 'complete');
			}
			if (runId) {
				this._resolveRunWait(runId, { status: 'stopped' });
			}
			thread.currentRunId = null;
			thread.status = 'idle';
			this._setLiveStatus(thread, { phase: 'error', title: 'Stopped', detail: 'You cancelled this run' });
		}
		this.activeRunId = null;
		this._notifyImmediate();
	}

	private _setLiveStatus(thread: ChatThread, partial: Omit<LiveAgentStatus, 'updatedAt'>): void {
		thread.liveStatus = { ...partial, updatedAt: Date.now() };
		this._onDidLiveStatusChange.fire(thread.liveStatus);
	}

	private _advanceWorkflowPhase(
		thread: ChatThread,
		assistantMsg: ChatMessage,
		phase: AgentWorkflowPhase,
		detail?: string,
	): void {
		if (!thread.workflowSnapshot) {
			return;
		}
		thread.workflowSnapshot.currentPhase = phase;
		if (!thread.workflowSnapshot.completedPhases.includes(phase)) {
			thread.workflowSnapshot.completedPhases.push(phase);
		}
		thread.workflowSnapshot.updatedAt = Date.now();
		if (thread.canonicalWorkflowSnapshot) {
			syncCanonicalFromLegacyPhase(thread.canonicalWorkflowSnapshot, phase);
		}
		this._appendActivityLine(
			assistantMsg,
			workflowPhaseLabel(phase),
			'complete',
			`wf-${phase}`,
			'orchestrator',
		);
		this._setLiveStatus(thread, {
			phase: phase === 'execute' || phase === 'verify' ? 'thinking' : 'collecting_context',
			title: workflowPhaseLiveTitle(phase),
			detail: detail ?? workflowPhaseLabel(phase),
			workflowPhase: phase,
		});
		this._notifyImmediate();
	}

	private _touchedFileRank(status: TouchedFileStatus): number {
		switch (status) {
			case 'rejected': return 0;
			case 'failed': return 1;
			case 'read': return 2;
			case 'preview': return 3;
			case 'applied': return 4;
		}
	}

	private _recordTouchedFile(msg: ChatMessage, path: string, status: TouchedFileStatus): void {
		const trimmed = path.trim();
		if (!trimmed) {
			return;
		}
		msg.touchedFiles = msg.touchedFiles ?? [];
		const idx = msg.touchedFiles.findIndex(f => f.path === trimmed);
		if (idx >= 0) {
			const cur = msg.touchedFiles[idx]!;
			if (this._touchedFileRank(status) >= this._touchedFileRank(cur.status)) {
				msg.touchedFiles[idx] = { path: trimmed, status, updatedAt: Date.now() };
			}
		} else {
			msg.touchedFiles.push({ path: trimmed, status, updatedAt: Date.now() });
		}
	}

	private _basenamePath(p: string): string {
		const parts = p.replace(/\\/g, '/').split('/');
		return parts[parts.length - 1] || p;
	}

	private _revealTouchedFileInEditor(
		path: string,
		mode: 'read' | 'preview' | 'applied',
		searchReplaceBlocks?: string,
	): void {
		if (!this.agenticSettings.settings.revealTouchedFilesInEditor) {
			return;
		}
		if (mode === 'preview' && searchReplaceBlocks?.trim()) {
			void this.editorBridge.previewProposeFileEdit(path, searchReplaceBlocks);
			return;
		}
		void this.editorBridge.openFileInEditor(path);
	}

	private _noteFileRevealed(msg: ChatMessage, path: string, verb: 'Opened' | 'Showing edits in' | 'Created'): void {
		const name = this._basenamePath(path);
		this._appendActivityLine(
			msg,
			`${verb} ${name} in the editor`,
			'complete',
			`file-reveal-${path}`,
		);
	}

	/** Push lint diagnostics into the active agent run after a successful apply. */
	private _runPostEditLintVerify(msg: ChatMessage, path: string, lintFromApply?: string): void {
		const thread = this._current();
		if (isVoidLikeSimpleUiMode(thread?.runUiMode)) {
			return;
		}
		if (!this.agenticSettings.settings.postEditLintVerify || !this.activeRequestId || !path.trim()) {
			return;
		}
		// New JSON/config scaffolds rarely benefit from an extra lint-driven agent turn
		if (/package\.json$|\.json$/i.test(path)) {
			return;
		}
		if (!thread || thread.status !== 'running') {
			return;
		}
		const requestId = this.activeRequestId;
		void (async () => {
			const lint = lintFromApply ?? await this.voidToolBridge.readLintErrors(path);
			const outcome = recordLintVerificationResult(thread, path, lint, hasLintErrors(lint));
		if (outcome.activityText) {
			this._appendActivityLine(
				msg,
				outcome.activityText,
				'complete',
				`lint-verify-${path}`,
				'orchestrator',
			);
		}
		if (outcome.injectMessage) {
			this.runtimeService.injectRunMessage(requestId, outcome.injectMessage);
		}
		this._notify();
		})();
	}

	async openTouchedFile(filePath: string, messageId?: string): Promise<void> {
		const thread = this._current();
		if (!thread) {
			return;
		}
		const path = filePath.trim();
		const msg = messageId
			? thread.messages.find(m => m.id === messageId)
			: [...thread.messages].reverse().find(m => m.role === 'assistant');
		const tc = msg?.toolCalls?.find(
			t => t.name === 'propose_file_edit' && String(t.arguments.path ?? '').trim() === path,
		);
		const touched = msg?.touchedFiles?.find(f => f.path === path);
		if (tc && touched?.status === 'preview') {
			await this.editorBridge.previewProposeFileEdit(
				path,
				String(tc.arguments.searchReplaceBlocks ?? ''),
			);
		} else {
			await this.editorBridge.openFileInEditor(path);
		}
		this._notifyImmediate();
	}

	private _appendActivityLine(
		msg: ChatMessage,
		text: string,
		status: ActivityLine['status'] = 'complete',
		lineId?: string,
		kind: ActivityLineKind = 'status',
	): void {
		if (!text.trim()) {
			return;
		}
		msg.activityLines = msg.activityLines ?? [];
		const id = lineId ?? generateUuid();
		const line: ActivityLine = { id, text: text.trim(), status, timestamp: Date.now(), kind };
		const idx = msg.activityLines.findIndex(l => l.id === id);
		if (idx >= 0) {
			msg.activityLines[idx] = line;
		} else {
			const prev = msg.activityLines[msg.activityLines.length - 1];
			if (!lineId && prev && prev.text === line.text && prev.kind === kind) {
				return;
			}
			msg.activityLines.push(line);
		}
	}

	private _appendThinkingEvent(
		msg: ChatMessage,
		title: string,
		kind: AgentActivityKind,
		status: ThinkingEvent['status'] = 'running',
	): void {
		msg.thinkingEvents = msg.thinkingEvents ?? [];
		msg.thinkingEvents.push({
			id: generateUuid(),
			timestamp: Date.now(),
			title,
			status,
			kind,
		});
	}

	private _completeThinkingEvents(msg: ChatMessage, kind?: AgentActivityKind): void {
		for (const ev of msg.thinkingEvents ?? []) {
			if (!kind || ev.kind === kind) {
				ev.status = 'complete';
			}
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

	private _approvalHost(): ChatThreadApprovalHost {
		const svc = this;
		return {
			get jiraWorkflowExecuting() {
				return svc.jiraWorkflow.interactive.executing;
			},
			recordTouchedFile: (msg, path, status) => svc._recordTouchedFile(msg, path, status),
			revealTouchedFileInEditor: (path, mode, blocks) =>
				svc._revealTouchedFileInEditor(path, mode, blocks),
			noteFileRevealed: (msg, path, verb) => svc._noteFileRevealed(msg, path, verb),
			runPostEditLintVerify: (msg, path, lint) => svc._runPostEditLintVerify(msg, path, lint),
			recordJiraFileChange: (path, status) => svc.jiraWorkflow.recordExecutionFileChange(path, status),
			writeFile: (path, content, msg) => {
				void svc.editorBridge.writeFile(path, content).then(r => {
					svc._runPostEditLintVerify(msg, path, r.lintSummary);
				});
			},
			finalizeProposeFileEdit: (path, blocks, msg) => {
				void svc.editorBridge.finalizeProposeFileEdit(path, blocks).then(r => {
					svc._runPostEditLintVerify(msg, path, r.lintSummary);
				});
			},
			cancelProposeFileEdit: path => svc.editorBridge.cancelProposeFileEdit(path),
			previewProposeFileEdit: (path, preview) => {
				void svc.editorBridge.previewProposeFileEdit(path, preview);
			},
		};
	}

	private _approvalResolveHost(): ChatThreadApprovalResolveHost {
		const svc = this;
		return {
			...svc._approvalHost(),
			decideEditApproval: (approvalId, decision) => svc.editApproval.decide(approvalId, decision),
			reduceEvent: (thread, assistantMsg, event) => svc._reduceEvent(thread, assistantMsg, event),
			notify: () => svc._notify(),
		};
	}

	private _resolveApproval(approvalId: string, decision: 'approved' | 'rejected'): void {
		const thread = this._current();
		if (!thread || !this.activeRequestId || !this.activeRunId) {
			return;
		}
		resolveChatThreadApproval(this._approvalResolveHost(), {
			thread,
			approvalId,
			decision,
			activeRequestId: this.activeRequestId,
			activeRunId: this.activeRunId,
			runtimeResolveApproval: opts => this.runtimeService.resolveApproval(opts),
		});
	}

	private _eventReducerHost(thread: ChatThread): ChatThreadEventReducerHost {
		const svc = this;
		return {
			get settings() {
				return svc.agenticSettings.settings;
			},
			get jiraWorkflowExecuting() {
				return svc.jiraWorkflow.interactive.executing;
			},
			appendActivityLine: (msg, text, status, lineId, kind) =>
				svc._appendActivityLine(msg, text, status, lineId, kind),
			completeActivityLine: (msg, lineId) => svc._completeActivityLine(msg, lineId),
			appendThinkingEvent: (msg, title, kind, status) =>
				svc._appendThinkingEvent(msg, title, kind, status),
			completeThinkingEvents: (msg, kind) => svc._completeThinkingEvents(msg, kind),
			setLiveStatus: (t, partial) => svc._setLiveStatus(t, partial),
			scheduleUiNotify: () => svc._scheduleUiNotify(),
			notifyImmediate: () => svc._notifyImmediate(),
			recordTouchedFile: (msg, path, status) => svc._recordTouchedFile(msg, path, status),
			revealTouchedFileInEditor: (path, mode, blocks) =>
				svc._revealTouchedFileInEditor(path, mode, blocks),
			noteFileRevealed: (msg, path, verb) => svc._noteFileRevealed(msg, path, verb),
			runPostEditLintVerify: (msg, path, lint) => svc._runPostEditLintVerify(msg, path, lint),
			previewProposeEditTool: (msg, toolName, args) =>
				previewProposeEditTool(svc._approvalHost(), msg, toolName, args),
			previewProposeEditsForApproval: (msg, ar) =>
				previewProposeEditsForApproval(svc._approvalHost(), msg, ar),
			recordJiraFileChange: (path, status) => svc.jiraWorkflow.recordExecutionFileChange(path, status),
			applyWriteFile: (path, content, msg) => {
				void svc.editorBridge.writeFile(path, content).then(r => {
					svc._runPostEditLintVerify(msg, path, r.lintSummary);
				});
			},
			applyProposeFileEdit: (path, blocks, msg) => {
				void svc.editorBridge.finalizeProposeFileEdit(path, blocks).then(r => {
					svc._runPostEditLintVerify(msg, path, r.lintSummary);
				});
			},
			cancelProposeFileEdit: path => svc.editorBridge.cancelProposeFileEdit(path),
			setEditApprovalPending: requests => svc.editApproval.setPending(requests),
			recordSessionMemoryFromRun: (input: RunMemoryInput) => {
				void svc.sessionMemory.recordFromRun(input);
			},
			finishMetricsRun: (runId, msg, userMessage, status) =>
				svc.agentMetrics.finishRun(runId, msg, userMessage, status),
			resolveRunWait: (runId, result) => svc._resolveRunWait(runId, result),
			workflowRunMetadata: t => svc._workflowRunMetadata(t),
			sendUserMessage: text => {
				void svc.sendUserMessage(text);
			},
			autoContinueAfterStall: (userMessage, planText) => {
				void svc._autoContinueAfterStall(userMessage, planText);
			},
			clearActiveRun: () => {
				thread.currentRunId = null;
				svc.activeRequestId = null;
			},
			setLastFailedUserText: text => {
				svc.lastFailedUserText = text;
			},
		};
	}

	private _syncDevConsoleFromSettings(): void {
		const s = this.agenticSettings.settings;
		configureAgenticDevConsole({
			enabled: s.debugWorkflowToDevTools,
			verbose: s.debugWorkflowVerbose,
		});
	}

	private _reduceEvent(thread: ChatThread, assistantMsg: ChatMessage, event: AgentEvent): void {
		logAgentEventToDevConsole(event);
		const prevCheckpointCount = thread.checkpoints.length;
		const { skipFinalNotify } = reduceChatThreadEvent(
			this._eventReducerHost(thread),
			thread,
			assistantMsg,
			event,
		);
		if (event.type === 'checkpoint_created' && thread.checkpoints.length > prevCheckpointCount) {
			const cp = thread.checkpoints[thread.checkpoints.length - 1];
			if (cp) {
				void this._persistLatestCheckpoint(thread, cp);
			}
		}
		if (!skipFinalNotify) {
			this._notifyImmediate();
		}
	}

	async pickJiraTicketInChat(ticketKey: string): Promise<void> {
		const thread = this._current();
		if (!thread) {
			return;
		}
		const key = ticketKey.toUpperCase();
		const listed = this.jiraWorkflow.interactive.openTickets.find(t => t.key === key);
		if (listed && !isJiraTicketOpen(listed)) {
			return;
		}
		await this._jiraWorkspaceSelectTicket(key);
	}

	async acceptJiraWorkflowInChat(): Promise<void> {
		const thread = this._current();
		if (thread) {
			thread.autoApplyEdits = true;
			thread.jiraWorkflowAutonomous = true;
			thread.updatedAt = Date.now();
		}
		await this.jiraWorkflow.acceptWorkflow();
		this._notify();
	}

	declineJiraWorkflowInChat(): void {
		this.jiraWorkflow.declineWorkflow();
		this._notify();
	}

	async regenerateJiraPlanInChat(): Promise<void> {
		await this.jiraWorkflow.regeneratePlan();
		this._notify();
	}

	async refreshJiraTicketsInChat(): Promise<void> {
		await this._fetchJiraTickets();
	}

	showJiraTicketListInChat(): void {
		this.jiraWorkflow.backToTicketList();
		this._notify();
	}

	async getJiraMcpStatusSummary(): Promise<string> {
		return this.agenticMcp.getJiraMcpStatusSummary();
	}

	async loadJiraTicketsInChat(): Promise<void> {
		const thread = this._current();
		if (thread) {
			thread.messages = [];
			thread.updatedAt = Date.now();
		}
		this.jiraWorkflow.resetChatWorkspace();
		await this._fetchJiraTickets();
	}

	private async _handleJiraChatIntent(_userText: string, intent: JiraChatIntent): Promise<void> {
		switch (intent.kind) {
			case 'list_open':
				await this.loadJiraTicketsInChat();
				break;
			case 'refresh_list':
				await this.refreshJiraTicketsInChat();
				break;
			case 'select':
				await this._jiraWorkspaceSelectTicket(intent.ticketKey);
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

	private async _fetchJiraTickets(): Promise<void> {
		const thread = this._current();
		if (!thread) {
			return;
		}
		this.jiraWorkflow.interactive.ticketsLoading = true;
		this.jiraWorkflow.interactive.error = null;
		thread.status = 'running';
		thread.updatedAt = Date.now();
		this._notify();
		try {
			const tickets = await this.agenticMcp.listAllTickets();
			this.jiraWorkflow.applyOpenTicketsFromChat(tickets);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			this.jiraWorkflow.setChatError(msg);
		} finally {
			this.jiraWorkflow.interactive.ticketsLoading = false;
			thread.status = 'idle';
			thread.updatedAt = Date.now();
			this._notify();
		}
	}

	private async _jiraWorkspaceSelectTicket(ticketKey: string): Promise<void> {
		const thread = this._current();
		if (!thread) {
			return;
		}
		const key = ticketKey.toUpperCase();
		const listed = this.jiraWorkflow.interactive.openTickets.find(t => t.key === key);
		if (listed && !isJiraTicketOpen(listed)) {
			return;
		}
		thread.status = 'running';
		thread.updatedAt = Date.now();
		this._notify();
		try {
			if (listed) {
				await this.jiraWorkflow.selectTicket(listed);
			} else {
				await this.jiraWorkflow.selectTicketByKey(key);
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			this.jiraWorkflow.setChatError(msg);
		} finally {
			thread.status = 'idle';
			thread.updatedAt = Date.now();
			this._notify();
		}
	}
}

registerSingleton(IAgenticChatThreadService, AgenticChatThreadService, InstantiationType.Eager);
