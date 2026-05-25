/*--------------------------------------------------------------------------------------
 *  Agentic AI — interactive JIRA workflow orchestration (browser)
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IJiraWorkflowService } from './jiraWorkflowServiceInterface.js';
import { Emitter } from '../../../../../base/common/event.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import type { JiraWorkflowStage, JiraWorkflowState } from '../../common/mcp/jiraTypes.js';
import { JIRA_WORKFLOW_STAGES, narrateWorkflowStage } from '../../common/mcp/jiraWorkflow.js';
import {
	createEmptyInteractiveState,
	type InteractiveJiraWorkflowState,
	type JiraExecutionFileStatus,
	type JiraTicket,
	type JiraWorkflowCheckpoint,
	type JiraWorkflowCheckpointStage,
	type JiraWorkflowEvent,
	type JiraWorkflowEventLevel,
	type JiraWorkflowPlan,
	type JiraWorkflowSyncResult,
} from '../../common/mcp/jiraWorkflowTypes.js';
import { annotateTicketOpenState } from '../../common/mcp/jiraTicketStatus.js';
import { IAgenticEditorBridgeService } from './agenticEditorBridgeService.js';
import {
	buildExecutionUserPrompt,
	generateWorkflowPlan,
	type WorkspaceScanHint,
} from '../../common/mcp/jiraPlanGenerator.js';
import { isSourceOrConfigPath } from '../../common/mcp/jiraWorkspaceDiscovery.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAgenticMcpService } from './agenticMcpService.js';
import { IAgenticChatThreadService } from './chatThreadService.js';
import { JiraWorkflowCheckpointStore } from './jiraWorkflowCheckpointStore.js';
import { formatWorkflowSummaryMarkdown } from '../../common/workflowSummary.js';
import type { WorkflowCompletionSummary } from '../../common/workflowSummary.js';

export { IJiraWorkflowService, detectIssueKeyFromText } from './jiraWorkflowServiceInterface.js';

class JiraWorkflowService extends Disposable implements IJiraWorkflowService {
	declare readonly _serviceBrand: undefined;

	state: JiraWorkflowState | null = null;
	interactive: InteractiveJiraWorkflowState = createEmptyInteractiveState();

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _onDidEmitEvent = this._register(new Emitter<JiraWorkflowEvent>());
	readonly onDidEmitEvent = this._onDidEmitEvent.event;

	private readonly _checkpointStore: JiraWorkflowCheckpointStore;

	constructor(
		@IAgenticMcpService private readonly agenticMcp: IAgenticMcpService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAgenticEditorBridgeService private readonly editorBridge: IAgenticEditorBridgeService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContext: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
	) {
		super();
		this._checkpointStore = new JiraWorkflowCheckpointStore(storageService);
		this.interactive.checkpoints = this._checkpointStore.loadAll();
	}

	private _notify(): void {
		this._onDidChange.fire();
	}

	private _emit(
		message: string,
		opts: {
			stage?: string;
			level?: JiraWorkflowEventLevel;
			ticketKey?: string;
			payload?: unknown;
		} = {},
	): JiraWorkflowEvent {
		const evt: JiraWorkflowEvent = {
			id: `evt_${generateUuid()}`,
			timestamp: new Date().toISOString(),
			ticketKey: opts.ticketKey ?? this.interactive.selectedTicket?.key,
			stage: opts.stage ?? this.interactive.phase,
			level: opts.level ?? 'info',
			message,
			payload: opts.payload,
		};
		this.interactive.events = [...this.interactive.events, evt].slice(-200);
		this._onDidEmitEvent.fire(evt);
		this._notify();
		return evt;
	}

	private _createCheckpoint(
		stage: JiraWorkflowCheckpointStage,
		summary: string,
		payload?: unknown,
	): JiraWorkflowCheckpoint {
		const ticketKey = this.interactive.selectedTicket?.key ?? '—';
		const cp: JiraWorkflowCheckpoint = {
			id: `cp_${generateUuid()}`,
			timestamp: new Date().toISOString(),
			ticketKey,
			stage,
			summary,
			payload,
		};
		this.interactive.checkpoints = this._checkpointStore.append(cp);
		this._emit(`Checkpoint: ${summary}`, { stage, level: 'success', ticketKey });
		return cp;
	}

	startWorkflow(issueKey: string): void {
		this.state = {
			issueKey: issueKey.toUpperCase(),
			currentStage: 'fetch',
			startedAt: Date.now(),
			completedStages: [],
		};
		this._notify();
	}

	advanceStage(): JiraWorkflowStage {
		if (!this.state) {
			return 'fetch';
		}
		const idx = JIRA_WORKFLOW_STAGES.indexOf(this.state.currentStage);
		const next = JIRA_WORKFLOW_STAGES[Math.min(idx + 1, JIRA_WORKFLOW_STAGES.length - 1)];
		this.state.currentStage = next;
		this._notify();
		return next;
	}

	markStageComplete(stage: JiraWorkflowStage): void {
		if (!this.state) return;
		if (!this.state.completedStages.includes(stage)) {
			this.state.completedStages.push(stage);
		}
		this._notify();
	}

	setImplementationSummary(text: string): void {
		if (!this.state) return;
		this.state.implementationSummary = text;
		this._notify();
	}

	clear(): void {
		this.state = null;
		this.interactive = createEmptyInteractiveState();
		this.interactive.checkpoints = this._checkpointStore.loadAll();
		this._notify();
	}

	buildWorkflowUserPrompt(issueKey: string): string {
		const key = issueKey.toUpperCase();
		const plan = this.interactive.plan;
		if (plan && plan.ticketKey === key && this.interactive.selectedTicket) {
			return buildExecutionUserPrompt(plan, this.interactive.selectedTicket);
		}
		return [
			`Run the full JIRA engineering workflow for ticket ${key}.`,
			'',
			'Steps: fetch ticket via MCP → read & identify scope → understand codebase → propose edits → run tests → create branch/PR if needed → comment on JIRA and transition status.',
			'',
			narrateWorkflowStage('fetch', key),
		].join('\n');
	}

	async openMcpConfig(): Promise<void> {
		await this.agenticMcp.revealMcpConfig();
	}

	setManualIssueKey(key: string): void {
		this.interactive.manualIssueKey = key.toUpperCase();
		this._notify();
	}

	setShowAdvancedInput(show: boolean): void {
		this.interactive.showAdvancedInput = show;
		this._notify();
	}

	backToTicketList(): void {
		this.interactive.selectedTicket = null;
		this.interactive.plan = null;
		this.interactive.planLoading = false;
		this.interactive.executing = false;
		this.interactive.phase = this.interactive.openTickets.length ? 'tickets_ready' : 'idle';
		this._notify();
	}

	resetChatWorkspace(): void {
		this.interactive = createEmptyInteractiveState();
		this.state = null;
		this._notify();
	}

	async openExecutionFileInEditor(filePath: string): Promise<void> {
		await this.editorBridge.openFileInEditor(filePath);
	}

	recordExecutionFileChange(filePath: string, status: JiraExecutionFileStatus): void {
		const path = filePath.trim();
		if (!path || !this.interactive.executing) {
			return;
		}
		const existing = this.interactive.executionChangedFiles.find(f => f.path === path);
		if (existing) {
			existing.status = status;
			existing.updatedAt = Date.now();
		} else {
			this.interactive.executionChangedFiles = [
				...this.interactive.executionChangedFiles,
				{ path, status, updatedAt: Date.now() },
			];
		}
		this._notify();
	}

	applyOpenTicketsFromChat(tickets: JiraTicket[]): void {
		this.interactive.openTickets = tickets;
		this.interactive.error = null;
		this.interactive.phase = tickets.length ? 'tickets_ready' : 'idle';
		this.interactive.ticketsLoading = false;
		this._emit(`Fetched ${tickets.length} ticket(s).`, {
			stage: 'open-tickets-fetched',
			level: tickets.length ? 'success' : 'warning',
		});
		this._notify();
	}

	setChatError(message: string): void {
		this.interactive.error = message;
		this.interactive.phase = 'failed';
		this.interactive.ticketsLoading = false;
		this._emit(message, { level: 'error' });
		this._notify();
	}

	async refreshOpenTickets(projectKey?: string): Promise<void> {
		this.interactive.error = null;
		this.interactive.ticketsLoading = true;
		this.interactive.phase = 'loading_tickets';
		this._notify();
		this._emit('Checking Atlassian MCP configuration.', { stage: 'mcp-check' });
		try {
			const ready = await this.agenticMcp.validateAtlassianReady();
			if (!ready.ok) {
				throw new Error(ready.message);
			}
			this._emit('Atlassian MCP is configured.', { stage: 'mcp-check', level: 'success' });
			this._emit('Fetching open tickets.', { stage: 'open-tickets-fetched' });
			const tickets = await this.agenticMcp.listOpenTickets(projectKey);
			this.interactive.openTickets = tickets;
			this.interactive.phase = tickets.length ? 'tickets_ready' : 'tickets_ready';
			this._emit(`Fetched ${tickets.length} open ticket(s).`, {
				stage: 'open-tickets-fetched',
				level: tickets.length ? 'success' : 'warning',
			});
			this._createCheckpoint('open-tickets-fetched', `Listed ${tickets.length} open tickets`, {
				count: tickets.length,
				projectKey,
			});
			if (!tickets.length) {
				this._emit('No open tickets found for the current JQL filter.', { level: 'warning' });
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			this.interactive.error = msg;
			this.interactive.phase = 'failed';
			this._emit(msg, { level: 'error' });
		} finally {
			this.interactive.ticketsLoading = false;
			this._notify();
		}
	}

	async selectTicket(ticket: JiraTicket): Promise<void> {
		this.interactive.selectedTicket = ticket;
		this.interactive.error = null;
		this.interactive.phase = 'loading_details';
		this.interactive.detailsLoading = true;
		this._notify();
		this._emit(`Selected ${ticket.key}.`, { stage: 'ticket-selected', ticketKey: ticket.key, level: 'success' });
		this._createCheckpoint('ticket-selected', `Selected ${ticket.key}`, { summary: ticket.summary });
		try {
			this._emit(`Fetching full details for ${ticket.key}.`, { stage: 'ticket-details-fetched', ticketKey: ticket.key });
			const detailed = await this.agenticMcp.fetchTicketDetails(ticket.key);
			this.interactive.selectedTicket = { ...ticket, ...detailed };
			this.interactive.phase = 'details_ready';
			this._emit(`Loaded ticket ${ticket.key}: ${detailed.summary}.`, {
				stage: 'ticket-details-fetched',
				ticketKey: ticket.key,
				level: 'success',
			});
			this._createCheckpoint('ticket-details-fetched', `Fetched ${ticket.key}`, {
				status: detailed.status,
				type: detailed.issueType,
			});
			await this._generatePlanInternal();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			this.interactive.error = msg;
			this.interactive.phase = 'failed';
			this._emit(msg, { level: 'error', ticketKey: ticket.key });
		} finally {
			this.interactive.detailsLoading = false;
			this._notify();
		}
	}

	async selectTicketByKey(ticketKey: string): Promise<void> {
		const key = ticketKey.trim().toUpperCase();
		if (!key) return;
		const stub: JiraTicket = { key, summary: key };
		await this.selectTicket(stub);
	}

	async regeneratePlan(): Promise<void> {
		if (!this.interactive.selectedTicket) return;
		await this._generatePlanInternal();
	}

	private async _generatePlanInternal(): Promise<void> {
		const ticket = this.interactive.selectedTicket;
		if (!ticket) return;
		this.interactive.planLoading = true;
		this.interactive.phase = 'generating_plan';
		this.interactive.plan = null;
		this._notify();
		this._emit('Analyzing ticket summary and description.', { stage: 'workflow-plan-generated', ticketKey: ticket.key });
		try {
			const workspace = await this._scanWorkspace();
			if (workspace.isMonorepo) {
				this._emit('Detected monorepo structure (multiple package.json files).', { ticketKey: ticket.key });
			}
			const plan = generateWorkflowPlan(ticket, workspace);
			this.interactive.plan = plan;
			this.interactive.phase = 'awaiting_decision';
			this._emit('Workflow plan ready — use Proceed or Decline in chat.', {
				stage: 'workflow-plan-generated',
				ticketKey: ticket.key,
				level: 'success',
			});
			this._createCheckpoint('workflow-plan-generated', `Plan for ${ticket.key}`, plan);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			this.interactive.error = msg;
			this.interactive.phase = 'failed';
			this._emit(msg, { level: 'error' });
		} finally {
			this.interactive.planLoading = false;
			this._notify();
		}
	}

	async acceptWorkflow(): Promise<void> {
		const plan = this.interactive.plan;
		const ticket = this.interactive.selectedTicket;
		if (!plan || !ticket) return;
		this._emit('Workflow accepted by user.', { stage: 'user-accepted-plan', level: 'success', ticketKey: ticket.key });
		this._createCheckpoint('user-accepted-plan', `User accepted plan for ${ticket.key}`, { plan });
		this.interactive.phase = 'executing';
		this._notify();
		await this.executeWorkflow();
	}

	declineWorkflow(): void {
		this._emit('Workflow declined by user.', { stage: 'declined', level: 'warning' });
		this.interactive.phase = 'declined';
		this.interactive.executing = false;
		this._notify();
	}

	async executeWorkflow(): Promise<void> {
		const plan = this.interactive.plan;
		const ticket = this.interactive.selectedTicket;
		if (!plan || !ticket) {
			return;
		}

		this.interactive.executing = true;
		this.interactive.phase = 'executing';
		this.interactive.error = null;
		this.interactive.executionChangedFiles = [];
		this.interactive.jiraSyncResult = null;
		this.interactive.agentExecutionSummary = null;
		this.interactive.agentRunStalled = false;
		this._notify();

		const executionLog: string[] = [];

		try {
			this.startWorkflow(ticket.key);
			const fileSnapshots = await this._snapshotWorkspaceFiles([
				...plan.likelyFiles.filter(p => p && !p.endsWith('/')),
				...this.interactive.executionChangedFiles.map(f => f.path),
			]);
			this._createCheckpoint('before-code-edit', 'Before code changes', { plan, fileSnapshots });

			this._emit('Execution mode — opening planned files in the main editor.', {
				stage: 'code-edit',
				ticketKey: ticket.key,
				level: 'info',
			});
			await this._openPlanFilesInEditor(plan);

			for (const cmd of plan.commandsToRun.slice(0, 4)) {
				this._emit(`Planned validation: ${cmd}`, { stage: 'validation', ticketKey: ticket.key });
				executionLog.push(cmd);
			}

			const prompt = buildExecutionUserPrompt(plan, ticket);
			this._emit('Running agent with approved plan — watch the editor for live diffs.', {
				stage: 'code-edit',
				ticketKey: ticket.key,
			});

			const runResult = await this.instantiationService.invokeFunction(accessor =>
				accessor.get(IAgenticChatThreadService).sendWorkflowExecutionPrompt(prompt, {
					jiraWorkflowIssueKey: ticket.key,
					jiraExecutionRun: true,
				}),
			);

			if (runResult.workflowSummary) {
				this.interactive.agentExecutionSummary = runResult.workflowSummary;
			}
			this.interactive.agentRunStalled =
				runResult.planStall === true
				|| runResult.completionKind === 'stalled';

			if (runResult.status === 'failed') {
				throw new Error(runResult.error ?? 'Agent run failed');
			}
			if (runResult.status === 'stopped') {
				throw new Error('Agent run was stopped');
			}

			this._createCheckpoint('after-code-edit', 'Agent run finished', {
				changedFiles: this.interactive.executionChangedFiles.map(f => f.path),
				completionKind: runResult.completionKind,
				planStall: runResult.planStall,
			});

			if (this.interactive.agentRunStalled) {
				this.interactive.phase = 'failed';
				this.interactive.error =
					'Agent finished without running workspace tools. Use Continue with tools below, then Run again.';
				this._emit('Agent stalled (no tools run) — JIRA was not updated.', {
					stage: 'after-code-edit',
					level: 'warning',
					ticketKey: ticket.key,
				});
				return;
			}

			const toolsRan = runResult.toolsRan === true;
			const filesFromAgent = runResult.workflowSummary?.filesTouched?.length ?? 0;
			const filesFromBridge = this.interactive.executionChangedFiles.length;
			const hasDeliverableWork = toolsRan && (filesFromAgent > 0 || filesFromBridge > 0);

			if (!hasDeliverableWork && runResult.completionKind === 'partial') {
				this.interactive.phase = 'failed';
				this.interactive.error =
					'Agent hit turn limit before completing file changes. Continue with tools or re-run the workflow.';
				this._emit('Agent run partial — no file changes recorded; JIRA not updated.', {
					stage: 'after-code-edit',
					level: 'warning',
					ticketKey: ticket.key,
				});
				return;
			}

			this._emit('Agent finished — syncing JIRA ticket.', {
				stage: 'after-code-edit',
				level: 'success',
				ticketKey: ticket.key,
			});

			const sync: JiraWorkflowSyncResult = {
				commentAdded: false,
				transitionAttempted: false,
				transitionOk: false,
				errors: [],
			};

			const comment = this._buildJiraComment(
				plan,
				ticket,
				executionLog,
				this.interactive.executionChangedFiles,
				this.interactive.agentExecutionSummary ?? undefined,
			);
			this._emit('Posting workflow summary comment to JIRA…', { stage: 'jira-status-updated', ticketKey: ticket.key });
			try {
				await this.agenticMcp.addTicketComment(ticket.key, comment);
				sync.commentAdded = true;
				this._emit('JIRA comment added.', { level: 'success', ticketKey: ticket.key });
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				sync.errors.push(`Comment: ${msg}`);
				this._emit(`JIRA comment failed: ${msg}`, { level: 'warning', ticketKey: ticket.key });
			}

			sync.transitionTarget = plan.recommendedTransitionStatus;
			sync.transitionAttempted = true;
			try {
				await this.agenticMcp.transitionTicketToStatus(ticket.key, plan.recommendedTransitionStatus);
				sync.transitionOk = true;
				this._emit(`JIRA status set to "${plan.recommendedTransitionStatus}".`, {
					stage: 'jira-status-updated',
					level: 'success',
					ticketKey: ticket.key,
				});
				this._createCheckpoint('jira-status-updated', `Transitioned ${ticket.key}`, {
					targetStatus: plan.recommendedTransitionStatus,
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				sync.errors.push(`Transition: ${msg}`);
				this._emit(`JIRA transition failed: ${msg}`, { level: 'warning', ticketKey: ticket.key });
			}

			await this._refreshTicketFromJira(ticket.key);
			sync.refreshedStatus = this.interactive.selectedTicket?.status;
			this.interactive.jiraSyncResult = sync;

			this.interactive.phase = 'completed';
			this._emit('Workflow complete — ticket refreshed from JIRA.', {
				stage: 'complete',
				level: 'success',
				ticketKey: ticket.key,
			});
			this.markStageComplete('complete');
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			this.interactive.error = msg;
			this.interactive.phase = 'failed';
			this._emit(`Workflow failed: ${msg}`, { level: 'error', ticketKey: ticket.key });
		} finally {
			this.interactive.executing = false;
			this._notify();
		}
	}

	private async _openPlanFilesInEditor(plan: JiraWorkflowPlan): Promise<void> {
		const sourceFirst = [
			...plan.likelyFiles.filter(p => p && !/package\.json$/i.test(p)),
			...plan.likelyFiles.filter(p => /package\.json$/i.test(p)),
		];
		const paths = [...new Set(sourceFirst.filter(p => p && !p.endsWith('/')))].slice(0, 8);
		for (const filePath of paths) {
			try {
				await this.editorBridge.openFileInEditor(filePath);
				this.recordExecutionFileChange(filePath, 'opened');
				this._emit(`Opened ${filePath} in editor`, { stage: 'code-edit', level: 'info' });
			} catch {
				// file may not exist until the agent creates it
			}
		}
	}

	private async _refreshTicketFromJira(ticketKey: string): Promise<void> {
		const detailed = await this.agenticMcp.fetchTicketDetails(ticketKey);
		const merged = { ...(this.interactive.selectedTicket ?? { key: ticketKey, summary: ticketKey }), ...detailed };
		this.interactive.selectedTicket = merged;
		const idx = this.interactive.openTickets.findIndex(t => t.key === ticketKey);
		if (idx >= 0) {
			const next = [...this.interactive.openTickets];
			next[idx] = annotateTicketOpenState([merged])[0]!;
			this.interactive.openTickets = next;
		}
		this._emit(`JIRA refreshed: status is now "${detailed.status ?? 'unknown'}".`, {
			stage: 'jira-status-updated',
			level: 'success',
			ticketKey,
		});
	}

	async restoreCheckpoint(checkpointId: string): Promise<void> {
		const cp = this.interactive.checkpoints.find(c => c.id === checkpointId);
		if (!cp) {
			this._emit(`Checkpoint not found: ${checkpointId}`, { level: 'error' });
			return;
		}
		this._emit(`Restoring checkpoint "${cp.summary}" (${cp.stage}).`, { stage: 'restore', ticketKey: cp.ticketKey });

		const payload = cp.payload as {
			plan?: JiraWorkflowPlan;
			fileSnapshots?: { path: string; content: string }[];
		} | undefined;

		if (payload?.fileSnapshots?.length) {
			let restored = 0;
			for (const file of payload.fileSnapshots) {
				try {
					await this.editorBridge.writeFile(file.path, file.content);
					restored++;
				} catch {
					// continue
				}
			}
			if (restored > 0) {
				this._emit(`Restored ${restored} file${restored === 1 ? '' : 's'} from checkpoint.`, {
					stage: 'restore',
					level: 'success',
					ticketKey: cp.ticketKey,
				});
			}
		}

		if (payload?.plan) {
			this.interactive.plan = payload.plan;
			if (cp.stage === 'before-code-edit' || cp.stage === 'workflow-plan-generated') {
				this.interactive.phase = cp.stage === 'before-code-edit' ? 'executing' : 'awaiting_decision';
			}
		} else if (cp.stage === 'workflow-plan-generated' && cp.payload) {
			this.interactive.plan = cp.payload as JiraWorkflowPlan;
			this.interactive.phase = 'awaiting_decision';
		}
		this._notify();
	}

	private async _snapshotWorkspaceFiles(paths: string[]): Promise<{ path: string; content: string }[]> {
		const folder = this.workspaceContext.getWorkspace().folders[0]?.uri.fsPath;
		const unique = [...new Set(paths.map(p => p.trim()).filter(Boolean))].slice(0, 24);
		const snapshots: { path: string; content: string }[] = [];
		for (const filePath of unique) {
			const candidates = folder && !filePath.startsWith(folder)
				? [`${folder}/${filePath.replace(/^[/\\]/, '')}`, filePath]
				: [filePath];
			for (const full of candidates) {
				try {
					const content = (await this.fileService.readFile(URI.file(full))).value.toString();
					snapshots.push({ path: filePath, content });
					break;
				} catch { /* try next */ }
			}
		}
		return snapshots;
	}

	private _buildJiraComment(
		plan: JiraWorkflowPlan,
		ticket: JiraTicket,
		executionLog: string[],
		changedFiles: { path: string }[],
		agentSummary?: WorkflowCompletionSummary,
	): string {
		if (agentSummary) {
			const agentBlock = formatWorkflowSummaryMarkdown(agentSummary)
				.replace(/^## /gm, 'h3. ')
				.replace(/^### /gm, 'h4. ')
				.replace(/\*\*([^*]+)\*\*/g, '*$1*');
			return [
				'*Agentic_MPS JIRA workflow*',
				'',
				`*Ticket:* ${ticket.key} — ${ticket.summary}`,
				'',
				agentBlock,
				'',
				'*Planned validation*',
				...(executionLog.length ? executionLog.map(c => `- ${c}`) : plan.commandsToRun.map(c => `- ${c}`)),
				'',
				`*Recommended JIRA status:* ${plan.recommendedTransitionStatus}`,
				'',
				'_Generated by MPS_AC Agentic JIRA workflow._',
			].join('\n');
		}

		const fileLines = changedFiles.length
			? changedFiles.map(f => `- \`${f.path}\``)
			: ['- _(no file paths recorded — check repo diff)_'];
		return [
			'*Agentic_MPS workflow summary*',
			'',
			`*Ticket:* ${ticket.key} — ${ticket.summary}`,
			'',
			'*Files changed*',
			...fileLines,
			'',
			'*What was done*',
			...plan.implementationSteps.slice(0, 6).map(s => `- ${s}`),
			'',
			'*Validation / commands*',
			...(executionLog.length ? executionLog.map(c => `- ${c}`) : plan.commandsToRun.map(c => `- ${c}`)),
			'',
			`*Status:* ${plan.recommendedTransitionStatus}`,
			'',
			'_Generated by MPS_AC Agentic JIRA workflow._',
		].join('\n');
	}

	private async _scanWorkspace(): Promise<WorkspaceScanHint> {
		const relativePaths: string[] = [];
		const packageJsonScripts: Record<string, string[]> = {};
		let hasFrontend = false;
		let hasBackend = false;
		const folders = this.workspaceContext.getWorkspace().folders;
		const scanRoots = folders.length ? folders.map(f => f.uri) : [];

		for (const root of scanRoots) {
			await this._walkDir(root, '', relativePaths, 0, 4);
		}

		for (const rel of relativePaths) {
			if (/^frontend\//i.test(rel) || /\/frontend\//i.test(rel)) hasFrontend = true;
			if (/^backend\//i.test(rel) || /\/backend\//i.test(rel)) hasBackend = true;
			if (/package\.json$/i.test(rel)) {
				for (const folder of folders) {
					try {
						const uri = URI.joinPath(folder.uri, rel);
						const file = await this.fileService.readFile(uri);
						const pkg = JSON.parse(file.value.toString()) as { scripts?: Record<string, string> };
						if (pkg.scripts) {
							packageJsonScripts[rel] = Object.keys(pkg.scripts);
						}
						break;
					} catch { /* try next folder */ }
				}
			}
		}

		const pkgCount = relativePaths.filter(p => /package\.json$/i.test(p)).length;
		return {
			relativePaths,
			packageJsonScripts,
			hasFrontend,
			hasBackend,
			isMonorepo: pkgCount > 1,
		};
	}

	private async _walkDir(
		base: URI,
		rel: string,
		out: string[],
		depth: number,
		maxDepth: number,
	): Promise<void> {
		if (depth > maxDepth) return;
		try {
			const stat = await this.fileService.resolve(URI.joinPath(base, rel));
			if (!stat.children) return;
			for (const child of stat.children) {
				if (!child.isDirectory) {
					const name = child.name;
					const path = rel ? `${rel}/${name}` : name;
					if (isSourceOrConfigPath(path) && out.length < 1500) {
						out.push(path);
					}
					continue;
				}
				const name = child.name;
				if (/^(node_modules|\.git|out|dist|\.build)$/i.test(name)) continue;
				await this._walkDir(base, rel ? `${rel}/${name}` : name, out, depth + 1, maxDepth);
			}
		} catch { /* skip */ }
	}
}

registerSingleton(IJiraWorkflowService, JiraWorkflowService, InstantiationType.Delayed);
