/*--------------------------------------------------------------------------------------
 *  Agentic AI — JIRA ticket workflow (read → identify → … → update JIRA)
 *--------------------------------------------------------------------------------------*/

import type { JiraWorkflowStage } from './jiraTypes.js';

export const JIRA_WORKFLOW_STAGES: JiraWorkflowStage[] = [
	'fetch',
	'read',
	'identify',
	'understand',
	'query',
	'propose',
	'test',
	'branch_pr',
	'update_jira',
	'complete',
];

export const JIRA_STAGE_LABELS: Record<JiraWorkflowStage, string> = {
	fetch: 'Fetch JIRA ticket',
	read: 'Read ticket details',
	identify: 'Identify scope & acceptance criteria',
	understand: 'Understand codebase impact',
	query: 'Clarify open questions',
	propose: 'Propose implementation plan & edits',
	test: 'Run tests',
	branch_pr: 'Create branch / commit / PR',
	update_jira: 'Update JIRA with summary & transition',
	complete: 'Workflow complete',
};

export const JIRA_WORKFLOW_SYSTEM_PROMPT = `You are executing a JIRA-driven engineering workflow inside an AI-native IDE.

When a JIRA issue key is present, follow these stages in order (skip only when clearly not applicable):

1. **Fetch & read** — Call **fetch_jira_issue** with issueKey set to the ticket key (e.g. KAN-4). Do not call getJiraIssue or raw MCP names unless listed in jira_tool_registry.
2. **Identify** — Extract requirements, constraints, and definition of done from the ticket.
3. **Understand** — Search the codebase (read_file, grep, search_files, get_symbols) to locate relevant modules.
4. **Query** — If requirements are ambiguous, state concise questions in your reply (do not block on human input unless critical).
5. **Propose** — Outline the implementation plan, then use propose_file_edit for code changes (approval required).
6. **Test** — Run the project's test command via run_terminal_command (approval required).
7. **Branch / PR** — When changes are ready, create a git branch, commit, and open a PR via terminal (approval required).
8. **Update JIRA** — Use MCP JIRA tools to:
   - Add a comment with an implementation summary (what changed, how to verify, PR link if any).
   - Transition the issue to the appropriate status (e.g. In Progress → In Review → Done) when warranted.

Use registry tools: **fetch_jira_issue**, **search_jira_issues**, **comment_on_jira_issue**, **transition_jira_issue**. Match workflow to the **Intent** in &lt;jira_context&gt;.
Use built-in workspace tools for code and terminal operations.
Never invent ticket content — fetch it first.`;

export function nextWorkflowStage(current: JiraWorkflowStage): JiraWorkflowStage {
	const idx = JIRA_WORKFLOW_STAGES.indexOf(current);
	if (idx < 0 || idx >= JIRA_WORKFLOW_STAGES.length - 1) {
	 return 'complete';
	}
	return JIRA_WORKFLOW_STAGES[idx + 1];
}

export function narrateWorkflowStage(stage: JiraWorkflowStage, issueKey?: string): string {
	const label = JIRA_STAGE_LABELS[stage];
	return issueKey ? `${label} for ${issueKey}…` : `${label}…`;
}
