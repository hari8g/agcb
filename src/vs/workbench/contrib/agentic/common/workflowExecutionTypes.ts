/*--------------------------------------------------------------------------------------
 *  Agentic AI — workflow execution run result (chat + JIRA orchestration)
 *--------------------------------------------------------------------------------------*/

import type { WorkflowCompletionSummary } from './workflowSummary.js';

export interface WorkflowExecutionRunResult {
	status: 'completed' | 'failed' | 'stopped';
	error?: string;
	completionKind?: WorkflowCompletionSummary['completionKind'];
	planStall?: boolean;
	toolsRan?: boolean;
	workflowSummary?: WorkflowCompletionSummary;
}

export interface WorkflowExecutionPromptOptions {
	/** Force JIRA ticket context for agent loop (Composer execution path). */
	jiraWorkflowIssueKey?: string;
	/** Approved JIRA plan execution — require tools, full repo context, no plan-only stall. */
	jiraExecutionRun?: boolean;
}
