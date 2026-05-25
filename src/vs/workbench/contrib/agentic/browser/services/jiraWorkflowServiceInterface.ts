/*--------------------------------------------------------------------------------------
 *  Agentic AI — JIRA workflow service interface (no implementation imports; breaks cycles)
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import type { JiraWorkflowStage, JiraWorkflowState } from '../../common/mcp/jiraTypes.js';
import type {
	InteractiveJiraWorkflowState,
	JiraExecutionFileStatus,
	JiraTicket,
	JiraWorkflowEvent,
} from '../../common/mcp/jiraWorkflowTypes.js';
import { extractJiraIssueKeys } from '../../common/mcp/jiraContextExtractor.js';

export const IJiraWorkflowService = createDecorator<IJiraWorkflowService>('jiraWorkflowService');

export interface IJiraWorkflowService {
	readonly _serviceBrand: undefined;
	/** Legacy linear workflow state (chat integration). */
	readonly state: JiraWorkflowState | null;
	readonly interactive: InteractiveJiraWorkflowState;
	readonly onDidChange: import('../../../../../base/common/event.js').Event<void>;
	readonly onDidEmitEvent: import('../../../../../base/common/event.js').Event<JiraWorkflowEvent>;
	startWorkflow(issueKey: string): void;
	advanceStage(): JiraWorkflowStage;
	markStageComplete(stage: JiraWorkflowStage): void;
	setImplementationSummary(text: string): void;
	clear(): void;
	buildWorkflowUserPrompt(issueKey: string): string;
	refreshOpenTickets(projectKey?: string): Promise<void>;
	selectTicket(ticket: JiraTicket): Promise<void>;
	selectTicketByKey(ticketKey: string): Promise<void>;
	regeneratePlan(): Promise<void>;
	acceptWorkflow(): Promise<void>;
	declineWorkflow(): void;
	executeWorkflow(): Promise<void>;
	restoreCheckpoint(checkpointId: string): Promise<void>;
	openMcpConfig(): Promise<void>;
	setManualIssueKey(key: string): void;
	setShowAdvancedInput(show: boolean): void;
	/** Return UI to open-ticket list (keeps fetched tickets). */
	backToTicketList(): void;
	applyOpenTicketsFromChat(tickets: JiraTicket[]): void;
	setChatError(message: string): void;
	/** Clear in-chat workflow state (events, plan, selection) for a fresh workspace. */
	resetChatWorkspace(): void;
	/** Track a file touched during Run (opens in main editor). */
	recordExecutionFileChange(filePath: string, status: JiraExecutionFileStatus): void;
	/** Open a workflow file in the main editor (from JIRA panel file list). */
	openExecutionFileInEditor(filePath: string): Promise<void>;
}

export function detectIssueKeyFromText(text: string): string | undefined {
	return extractJiraIssueKeys(text)[0];
}
