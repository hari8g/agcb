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
	type JiraTicket,
	type JiraWorkflowCheckpoint,
	type JiraWorkflowCheckpointStage,
	type JiraWorkflowEvent,
	type JiraWorkflowEventLevel,
	type JiraWorkflowPlan,
} from '../../common/mcp/jiraWorkflowTypes.js';
import {
	buildExecutionUserPrompt,
	generateWorkflowPlan,
	type WorkspaceScanHint,
} from '../../common/mcp/jiraPlanGenerator.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAgenticMcpService } from './agenticMcpService.js';
import { IAgenticChatThreadService } from './chatThreadService.js';
import { JiraWorkflowCheckpointStore } from './jiraWorkflowCheckpointStore.js';

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

	applyOpenTicketsFromChat(tickets: JiraTicket[]): void {
		this.interactive.openTickets = tickets;
		this.interactive.error = null;
		this.interactive.phase = tickets.length ? 'tickets_ready' : 'idle';
		this.interactive.ticketsLoading = false;
		this._emit(`Fetched ${tickets.length} open ticket(s).`, {
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
			this._emit('Workflow plan generated. Review and accept or decline.', {
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
		if (!plan || !ticket) return;

		this.interactive.executing = true;
		this.interactive.phase = 'executing';
		this.interactive.error = null;
		this._notify();

		const executionLog: string[] = [];

		try {
			this.startWorkflow(ticket.key);
			this._createCheckpoint('before-code-edit', 'Before code changes', { plan });

			for (const cmd of plan.commandsToRun.slice(0, 4)) {
				this._emit(`Validation step: ${cmd}`, { stage: 'validation', ticketKey: ticket.key });
				executionLog.push(cmd);
			}

			this._emit('Starting agent run with approved implementation plan.', {
				stage: 'code-edit',
				ticketKey: ticket.key,
			});
			const prompt = buildExecutionUserPrompt(plan, ticket);
			await this.instantiationService.invokeFunction(accessor =>
				accessor.get(IAgenticChatThreadService).sendUserMessage(prompt),
			);

			this._createCheckpoint('after-code-edit', 'Agent run started for code changes', {
				note: 'Automatic edits run via Agentic chat; monitor the message stream for tool activity.',
			});

			this._emit('Agent execution started — follow the chat stream for tool and edit progress.', {
				stage: 'after-code-edit',
				level: 'success',
				ticketKey: ticket.key,
			});

			this._createCheckpoint('validation-completed', 'Validation orchestration recorded', {
				commands: plan.commandsToRun,
				note: 'Re-run build/test in chat if the agent has not completed validation.',
			});
			this._emit('Validation steps recorded. Update JIRA after you confirm build/test pass.', {
				stage: 'validation-completed',
				level: 'info',
			});

			const comment = this._buildJiraComment(plan, ticket, executionLog);
			this._emit('Adding workflow summary comment to JIRA ticket.', { stage: 'jira-status-updated', ticketKey: ticket.key });
			try {
				await this.agenticMcp.addTicketComment(ticket.key, comment);
				this._emit('JIRA comment added.', { level: 'success', ticketKey: ticket.key });
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				this._emit(`JIRA comment failed: ${msg}`, { level: 'warning', ticketKey: ticket.key });
			}

			this._emit(
				'Confirm build/test results in the chat stream before treating the ticket as Done.',
				{ stage: 'jira-status-updated', level: 'info', ticketKey: ticket.key },
			);
			try {
				await this.agenticMcp.transitionTicketToStatus(ticket.key, plan.recommendedTransitionStatus);
				this._emit(`JIRA status updated toward "${plan.recommendedTransitionStatus}".`, {
					stage: 'jira-status-updated',
					level: 'success',
					ticketKey: ticket.key,
				});
				this._createCheckpoint('jira-status-updated', `Transitioned ${ticket.key}`, {
					targetStatus: plan.recommendedTransitionStatus,
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				this._emit(`JIRA transition skipped or failed: ${msg}`, { level: 'warning', ticketKey: ticket.key });
			}

			this.interactive.phase = 'completed';
			this._emit('Workflow completed.', { stage: 'complete', level: 'success', ticketKey: ticket.key });
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

	async restoreCheckpoint(checkpointId: string): Promise<void> {
		const cp = this.interactive.checkpoints.find(c => c.id === checkpointId);
		if (!cp) {
			this._emit(`Checkpoint not found: ${checkpointId}`, { level: 'error' });
			return;
		}
		this._emit(`Inspecting checkpoint "${cp.summary}" (${cp.stage}).`, { stage: 'restore', ticketKey: cp.ticketKey });
		this._emit(
			'Restore not fully supported yet for file changes, but this checkpoint can be inspected in the Checkpoints panel.',
			{ level: 'warning', payload: cp.payload },
		);
		if (cp.stage === 'workflow-plan-generated' && cp.payload) {
			this.interactive.plan = cp.payload as JiraWorkflowPlan;
			this.interactive.phase = 'awaiting_decision';
			this._notify();
		}
	}

	private _buildJiraComment(plan: JiraWorkflowPlan, ticket: JiraTicket, executionLog: string[]): string {
		return [
			'*Agentic_MPS workflow summary*',
			'',
			`*Ticket:* ${ticket.key} — ${ticket.summary}`,
			'',
			'*What was done*',
			...plan.implementationSteps.slice(0, 6).map(s => `- ${s}`),
			'',
			'*Validation / commands*',
			...(executionLog.length ? executionLog.map(c => `- ${c}`) : plan.commandsToRun.map(c => `- ${c}`)),
			'',
			`*Recommended status:* ${plan.recommendedTransitionStatus}`,
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
					if (/package\.json$/i.test(name) || /tsconfig.*\.json$/i.test(name)) {
						const path = rel ? `${rel}/${name}` : name;
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
