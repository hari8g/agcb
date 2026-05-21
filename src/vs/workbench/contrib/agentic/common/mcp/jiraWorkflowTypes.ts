/*--------------------------------------------------------------------------------------
 *  Agentic AI — interactive JIRA workflow types
 *--------------------------------------------------------------------------------------*/

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
	/** Advanced fallback: manual issue key */
	manualIssueKey: string;
	showAdvancedInput: boolean;
}

/** Embedded JIRA UI state on a chat assistant message */
export type JiraChatUiMode = 'list' | 'detail' | 'executing' | 'complete' | 'declined';

export interface JiraChatMessageUi {
	mode: JiraChatUiMode;
	tickets: JiraTicket[];
	selectedTicket: JiraTicket | null;
	plan: JiraWorkflowPlan | null;
	planLoading: boolean;
	events: JiraWorkflowEvent[];
	error: string | null;
	executing: boolean;
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
	};
}

export function jiraInteractiveToChatUi(interactive: InteractiveJiraWorkflowState): JiraChatMessageUi {
	let mode: JiraChatUiMode = 'list';
	if (interactive.phase === 'declined') {
		mode = 'declined';
	} else if (interactive.phase === 'failed') {
		mode = 'list';
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
		manualIssueKey: '',
		showAdvancedInput: false,
	};
}
