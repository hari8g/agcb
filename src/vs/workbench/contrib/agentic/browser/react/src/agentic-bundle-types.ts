/*--------------------------------------------------------------------------------------
 *  Bundled with agentic-tsx — do not import ../../../common (breaks at runtime in out/agentic-tsx/)
 *--------------------------------------------------------------------------------------*/

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
	isOpen?: boolean;
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

export type JiraChatUiMode = 'list' | 'detail' | 'executing' | 'complete' | 'declined' | 'stalled';

export type WorkflowCompletionKind = 'success' | 'partial' | 'failed' | 'stalled';

export interface WorkflowActionSummary {
	toolName: string;
	label: string;
	outcomePreview?: string;
	status: string;
}

export interface WorkflowCompletionSummary {
	asked: string;
	approach: string[];
	actions: WorkflowActionSummary[];
	filesTouched: { path: string; status: string }[];
	outcome: string;
	completionKind: WorkflowCompletionKind;
	generatedAt: number;
}

export type JiraWorkflowEventLevel = 'info' | 'success' | 'warning' | 'error';

export interface JiraWorkflowEvent {
	id: string;
	timestamp: string;
	ticketKey?: string;
	stage: string;
	level: JiraWorkflowEventLevel;
	message: string;
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

export interface InteractiveJiraWorkflowState {
	phase: string;
	openTickets: JiraTicket[];
	selectedTicket: JiraTicket | null;
	plan: JiraWorkflowPlan | null;
	events: unknown[];
	checkpoints: unknown[];
	error: string | null;
	ticketsLoading: boolean;
	detailsLoading: boolean;
	planLoading: boolean;
	executing: boolean;
	executionChangedFiles: JiraExecutionChangedFile[];
	jiraSyncResult: JiraWorkflowSyncResult | null;
	agentExecutionSummary: WorkflowCompletionSummary | null;
	agentRunStalled: boolean;
	manualIssueKey: string;
	showAdvancedInput: boolean;
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
		events: interactive.events as JiraWorkflowEvent[],
		error: interactive.error,
		executing: interactive.executing,
		executionChangedFiles: interactive.executionChangedFiles ?? [],
		jiraSyncResult: interactive.jiraSyncResult ?? null,
		agentExecutionSummary: interactive.agentExecutionSummary ?? null,
		agentRunStalled: interactive.agentRunStalled ?? false,
	};
}

export interface ChatDecision {
	kind: 'jira_workflow' | 'tool_approval';
	title: string;
	hint?: string;
	actions: { id: string; label: string; variant: 'primary' | 'secondary' | 'ghost' }[];
	approvalId?: string;
	resolved?: boolean;
}

export function buildJiraWorkflowDecision(ui: JiraChatMessageUi): ChatDecision | undefined {
	const show = ui.plan
		&& !ui.planLoading
		&& ui.mode === 'detail'
		&& !ui.executing
		&& ui.selectedTicket;
	if (!show) {
		return undefined;
	}
	return {
		kind: 'jira_workflow',
		title: 'Run plan',
		actions: [
			{ id: 'proceed', label: 'Run', variant: 'primary' },
			{ id: 'decline', label: 'Cancel', variant: 'ghost' },
		],
	};
}
