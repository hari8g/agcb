/*--------------------------------------------------------------------------------------
 *  Agentic AI — JIRA workflow types
 *--------------------------------------------------------------------------------------*/

export type JiraWorkflowStage =
	| 'fetch'
	| 'read'
	| 'identify'
	| 'understand'
	| 'query'
	| 'propose'
	| 'test'
	| 'branch_pr'
	| 'update_jira'
	| 'complete';

export interface JiraIssueContext {
	issueKey: string;
	summary?: string;
	description?: string;
	status?: string;
	issueType?: string;
	assignee?: string;
	labels?: string[];
	rawText?: string;
	/** Structured MCP/env diagnostics (also duplicated in rawText for the model). */
	diagnostics?: string;
	fetchedAt: number;
}

export interface JiraWorkflowState {
	issueKey: string;
	currentStage: JiraWorkflowStage;
	startedAt: number;
	completedStages: JiraWorkflowStage[];
	implementationSummary?: string;
}

export const JIRA_ISSUE_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
