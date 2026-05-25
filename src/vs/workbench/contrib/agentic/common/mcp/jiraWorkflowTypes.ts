/*--------------------------------------------------------------------------------------
 *  Agentic AI — interactive JIRA workflow types
 *--------------------------------------------------------------------------------------*/

import type { WorkflowCompletionSummary } from '../workflowSummary.js';

export type JiraWorkflowEventLevel = 'info' | 'success' | 'warning' | 'error';

export type JiraWorkflowCheckpointStage =
	| 'open-tickets-fetched'
	| 'ticket-selected'
	| 'ticket-details-fetched'
	| 'workflow-plan-generated'
	| 'user-accepted-plan'
	| 'before-code-edit'
	| 'after-code-edit'
	| 'validation-completed'
	| 'jira-status-updated';

export type InteractiveWorkflowPhase =
	| 'idle'
	| 'loading_tickets'
	| 'tickets_ready'
	| 'loading_details'
	| 'details_ready'
	| 'generating_plan'
	| 'plan_ready'
	| 'awaiting_decision'
	| 'executing'
	| 'completed'
	| 'declined'
	| 'failed';

export interface JiraTicket {
	key: string;
	summary: string;
	description?: string;
	status?: string;
	priority?: string;
	assignee?: string;
	issueType?: string;
	project?: string;
	updated?: string;
	labels?: string[];
	components?: string[];
	/** Set when listing tickets — open tickets are actionable */
	isOpen?: boolean;
}

export interface JiraWorkflowEvent {
	id: string;
	timestamp: string;
	ticketKey?: string;
	stage: string;
	level: JiraWorkflowEventLevel;
	message: string;
	payload?: unknown;
}

export interface JiraWorkflowCheckpoint {
	id: string;
	timestamp: string;
	ticketKey: string;
	stage: JiraWorkflowCheckpointStage;
	summary: string;
	payload?: unknown;
}

export interface JiraWorkflowPlan {
	ticketKey: string;
	problemUnderstanding: string;
	scope: string[];
	affectedAreas: string[];
	likelyFiles: string[];
	commandsToRun: string[];
	risks: string[];
	implementationSteps: string[];
	validationCriteria: string[];
	recommendedTransitionStatus: string;
}

export type JiraExecutionFileStatus = 'opened' | 'preview' | 'applied';

export interface JiraExecutionChangedFile {
	path: string;
	status: JiraExecutionFileStatus;
	updatedAt: number;
}

export interface JiraWorkflowSyncResult {
	commentAdded: boolean;
	transitionAttempted: boolean;
	transitionTarget?: string;
	transitionOk: boolean;
	refreshedStatus?: string;
	errors: string[];
}

export interface InteractiveJiraWorkflowState {
	phase: InteractiveWorkflowPhase;
	openTickets: JiraTicket[];
	selectedTicket: JiraTicket | null;
	plan: JiraWorkflowPlan | null;
	events: JiraWorkflowEvent[];
	checkpoints: JiraWorkflowCheckpoint[];
	error: string | null;
	ticketsLoading: boolean;
	detailsLoading: boolean;
	planLoading: boolean;
	executing: boolean;
	/** Files opened or edited during the current Run */
	executionChangedFiles: JiraExecutionChangedFile[];
	/** Result of JIRA comment + transition after agent run */
	jiraSyncResult: JiraWorkflowSyncResult | null;
	/** End-of-run intelligent agent summary from the execution thread */
	agentExecutionSummary: WorkflowCompletionSummary | null;
	/** Agent completed without running workspace tools */
	agentRunStalled: boolean;
	/** Advanced fallback: manual issue key */
	manualIssueKey: string;
	showAdvancedInput: boolean;
}

/** Embedded JIRA UI state on a chat assistant message */
export type JiraChatUiMode = 'list' | 'detail' | 'executing' | 'complete' | 'declined' | 'stalled';

export interface JiraChatMessageUi {
	mode: JiraChatUiMode;
	tickets: JiraTicket[];
	selectedTicket: JiraTicket | null;
	plan: JiraWorkflowPlan | null;
	planLoading: boolean;
	events: JiraWorkflowEvent[];
	error: string | null;
	executing: boolean;
	executionChangedFiles: JiraExecutionChangedFile[];
	jiraSyncResult: JiraWorkflowSyncResult | null;
	agentExecutionSummary: WorkflowCompletionSummary | null;
	agentRunStalled: boolean;
}

export function createEmptyJiraChatUi(): JiraChatMessageUi {
	return {
		mode: 'list',
		tickets: [],
		selectedTicket: null,
		plan: null,
		planLoading: false,
		events: [],
		error: null,
		executing: false,
		executionChangedFiles: [],
		jiraSyncResult: null,
		agentExecutionSummary: null,
		agentRunStalled: false,
	};
}

export function jiraInteractiveToChatUi(interactive: InteractiveJiraWorkflowState): JiraChatMessageUi {
	let mode: JiraChatUiMode = 'list';
	if (interactive.phase === 'declined') {
		mode = 'declined';
	} else if (interactive.agentRunStalled && interactive.agentExecutionSummary) {
		mode = 'stalled';
	} else if (interactive.phase === 'failed' && interactive.selectedTicket) {
		mode = 'detail';
	} else if (interactive.phase === 'completed') {
		mode = 'complete';
	} else if (interactive.executing || interactive.phase === 'executing') {
		mode = 'executing';
	} else if (interactive.selectedTicket) {
		mode = 'detail';
	}
	return {
		mode,
		tickets: interactive.openTickets,
		selectedTicket: interactive.selectedTicket,
		plan: interactive.plan,
		planLoading: interactive.planLoading,
		events: interactive.events,
		error: interactive.error,
		executing: interactive.executing,
		executionChangedFiles: interactive.executionChangedFiles ?? [],
		jiraSyncResult: interactive.jiraSyncResult ?? null,
		agentExecutionSummary: interactive.agentExecutionSummary ?? null,
		agentRunStalled: interactive.agentRunStalled ?? false,
	};
}

export function createEmptyInteractiveState(): InteractiveJiraWorkflowState {
	return {
		phase: 'idle',
		openTickets: [],
		selectedTicket: null,
		plan: null,
		events: [],
		checkpoints: [],
		error: null,
		ticketsLoading: false,
		detailsLoading: false,
		planLoading: false,
		executing: false,
		executionChangedFiles: [],
		jiraSyncResult: null,
		agentExecutionSummary: null,
		agentRunStalled: false,
		manualIssueKey: '',
		showAdvancedInput: false,
	};
}
