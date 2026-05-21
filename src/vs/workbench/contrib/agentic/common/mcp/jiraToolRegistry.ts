/*--------------------------------------------------------------------------------------
 *  Agentic AI — JIRA tool registry: stable virtual tools → MCP backends, intent categories
 *--------------------------------------------------------------------------------------*/

import type { SerializableMcpTool } from './agenticMcpTypes.js';
import type { JiraIssueContext } from './jiraTypes.js';
import {
	buildJiraCommentParams,
	buildJiraIssueToolParams,
	buildJiraSearchParams,
	buildJiraTransitionParams,
	findJiraCommentTool,
	findJiraGetIssueTool,
	findJiraTransitionTool,
	mcpToolBaseName,
} from './jiraContextExtractor.js';

/** High-level capability bucket for routing ticket work. */
export type JiraToolCategory =
	| 'read_issue'
	| 'search_issues'
	| 'comment'
	| 'transition'
	| 'update_issue'
	| 'graph_context';

/** Parsed ticket intent — drives which built-in agent tools to prefer. */
export type JiraTicketIntent =
	| 'bug_fix'
	| 'feature'
	| 'refactor'
	| 'testing'
	| 'devops'
	| 'documentation'
	| 'investigation'
	| 'maintenance'
	| 'unknown';

export interface JiraVirtualToolDef {
	/** Stable name the LLM calls in tool_call JSON */
	name: string;
	category: JiraToolCategory;
	description: string;
	inputSchema: Record<string, unknown>;
	/** Match MCP tool base names (after prefix strip) */
	mcpBaseNamePatterns: RegExp[];
}

export const JIRA_VIRTUAL_TOOLS: readonly JiraVirtualToolDef[] = [
	{
		name: 'fetch_jira_issue',
		category: 'read_issue',
		description: 'Fetch a JIRA issue by key (summary, description, status, type, labels). Use this instead of getJiraIssue.',
		inputSchema: {
			type: 'object',
			properties: { issueKey: { type: 'string', description: 'Issue key e.g. KAN-4' } },
			required: ['issueKey'],
		},
		mcpBaseNamePatterns: [
			/^getJiraIssue$/i,
			/^getTeamworkGraphContext$/i,
			/^getTeamworkGraphObject$/i,
		],
	},
	{
		name: 'search_jira_issues',
		category: 'search_issues',
		description: 'Search JIRA issues using JQL.',
		inputSchema: {
			type: 'object',
			properties: {
				jql: { type: 'string', description: 'JQL query' },
				maxResults: { type: 'number', description: 'Max issues to return (default 20)' },
			},
			required: ['jql'],
		},
		mcpBaseNamePatterns: [/^searchJiraIssuesUsingJql$/i, /^search_jira/i],
	},
	{
		name: 'comment_on_jira_issue',
		category: 'comment',
		description: 'Add a comment to a JIRA issue.',
		inputSchema: {
			type: 'object',
			properties: {
				issueKey: { type: 'string' },
				comment: { type: 'string' },
			},
			required: ['issueKey', 'comment'],
		},
		mcpBaseNamePatterns: [/^addCommentToJiraIssue$/i, /comment.*jira/i],
	},
	{
		name: 'transition_jira_issue',
		category: 'transition',
		description: 'Transition a JIRA issue to a new status.',
		inputSchema: {
			type: 'object',
			properties: {
				issueKey: { type: 'string' },
				transitionId: { type: 'string', description: 'Transition id or name' },
			},
			required: ['issueKey', 'transitionId'],
		},
		mcpBaseNamePatterns: [/^transitionJiraIssue$/i, /transition.*jira/i],
	},
	{
		name: 'update_jira_issue',
		category: 'update_issue',
		description: 'Update fields on a JIRA issue (summary, description, etc.).',
		inputSchema: {
			type: 'object',
			properties: {
				issueKey: { type: 'string' },
				fields: { type: 'object', description: 'Fields to update' },
			},
			required: ['issueKey', 'fields'],
		},
		mcpBaseNamePatterns: [/^editJiraIssue$/i, /^updateJiraIssue$/i],
	},
] as const;

const JIRA_VIRTUAL_READ_TOOLS = new Set(['fetch_jira_issue', 'search_jira_issues']);

export function isJiraVirtualToolName(name: string): boolean {
	return JIRA_VIRTUAL_TOOLS.some(t => t.name === name);
}

export function isJiraVirtualReadTool(name: string): boolean {
	return JIRA_VIRTUAL_READ_TOOLS.has(name);
}

export function getJiraVirtualToolDef(name: string): JiraVirtualToolDef | undefined {
	return JIRA_VIRTUAL_TOOLS.find(t => t.name === name);
}

/** Resolve backing MCP tool for a virtual JIRA tool. */
export function resolveMcpToolForVirtual(
	virtualName: string,
	mcpTools: SerializableMcpTool[],
): { virtual: JiraVirtualToolDef; mcp: SerializableMcpTool } | undefined {
	const virtual = getJiraVirtualToolDef(virtualName);
	if (!virtual) {
		return undefined;
	}
	for (const pattern of virtual.mcpBaseNamePatterns) {
		const mcp = mcpTools.find(t => pattern.test(mcpToolBaseName(t.name)));
		if (mcp) {
			return { virtual, mcp };
		}
	}
	// fetch_jira_issue: reuse shared resolver (includes teamwork fallbacks)
	if (virtualName === 'fetch_jira_issue') {
		const mcp = findJiraGetIssueTool(mcpTools);
		if (mcp) {
			return { virtual, mcp };
		}
	}
	if (virtualName === 'comment_on_jira_issue') {
		const mcp = findJiraCommentTool(mcpTools);
		if (mcp) {
			return { virtual, mcp };
		}
	}
	if (virtualName === 'transition_jira_issue') {
		const mcp = findJiraTransitionTool(mcpTools);
		if (mcp) {
			return { virtual, mcp };
		}
	}
	return undefined;
}

/** List virtual tools that have a connected MCP implementation. */
export function listAvailableJiraVirtualTools(mcpTools: SerializableMcpTool[]): JiraVirtualToolDef[] {
	return JIRA_VIRTUAL_TOOLS.filter(v => !!resolveMcpToolForVirtual(v.name, mcpTools));
}

/** Map virtual tool + LLM args → MCP tool params. */
export function buildVirtualToolMcpParams(
	virtualName: string,
	args: Record<string, unknown>,
	mcpTool: SerializableMcpTool,
	atlassianEnv?: Record<string, string | undefined>,
): Record<string, unknown> {
	const base = mcpToolBaseName(mcpTool.name);

	if (virtualName === 'fetch_jira_issue') {
		const issueKey = String(args.issueKey ?? args.key ?? '').trim().toUpperCase();
		return buildJiraIssueToolParams(mcpTool, issueKey, atlassianEnv);
	}

	if (virtualName === 'search_jira_issues') {
		return buildJiraSearchParams(
			mcpTool,
			String(args.jql ?? ''),
			atlassianEnv,
			typeof args.maxResults === 'number' ? args.maxResults : 25,
		);
	}

	if (virtualName === 'comment_on_jira_issue') {
		return buildJiraCommentParams(
			mcpTool,
			String(args.issueKey ?? ''),
			String(args.comment ?? args.body ?? ''),
			atlassianEnv,
		);
	}

	if (virtualName === 'transition_jira_issue') {
		return buildJiraTransitionParams(
			mcpTool,
			String(args.issueKey ?? ''),
			String(args.transitionId ?? args.transition ?? ''),
			atlassianEnv,
		);
	}

	if (virtualName === 'update_jira_issue') {
		return {
			issueKey: String(args.issueKey ?? ''),
			fields: args.fields ?? {},
		};
	}

	if (base === 'getTeamworkGraphContext' || base === 'getTeamworkGraphObject') {
		return buildJiraIssueToolParams(mcpTool, String(args.issueKey ?? ''), atlassianEnv);
	}

	return args;
}

const INTENT_KEYWORDS: Record<JiraTicketIntent, RegExp[]> = {
	bug_fix: [/bug\b/i, /defect/i, /fix\b/i, /broken/i, /error/i, /regression/i],
	feature: [/feature/i, /story\b/i, /enhancement/i, /new\b/i, /implement/i, /add\b/i],
	refactor: [/refactor/i, /tech debt/i, /cleanup/i, /restructure/i],
	testing: [/test\b/i, /qa\b/i, /e2e/i, /unit test/i, /coverage/i],
	devops: [/deploy/i, /ci\b/i, /cd\b/i, /pipeline/i, /infra/i, /docker/i, /k8s/i],
	documentation: [/doc\b/i, /readme/i, /wiki/i, /document/i],
	investigation: [/spike/i, /research/i, /investigate/i, /poc/i, /analysis/i],
	maintenance: [/chore/i, /maintenance/i, /upgrade/i, /bump/i, /dependency/i],
	unknown: [],
};

/** Classify ticket intent from summary, type, labels, description. */
export function classifyJiraTicketIntent(issue: JiraIssueContext): JiraTicketIntent {
	const hay = [
		issue.summary,
		issue.issueType,
		issue.description?.slice(0, 2000),
		issue.labels?.join(' '),
	].filter(Boolean).join(' ');

	if (!hay.trim()) {
		return 'unknown';
	}

	const scores = new Map<JiraTicketIntent, number>();
	for (const [intent, patterns] of Object.entries(INTENT_KEYWORDS) as [JiraTicketIntent, RegExp[]][]) {
		if (intent === 'unknown') {
			continue;
		}
		let score = 0;
		for (const re of patterns) {
			if (re.test(hay)) {
				score++;
			}
		}
		if (issue.issueType && reMatchIssueType(intent, issue.issueType)) {
			score += 2;
		}
		if (score > 0) {
			scores.set(intent, score);
		}
	}

	let best: JiraTicketIntent = 'unknown';
	let bestScore = 0;
	for (const [intent, score] of scores) {
		if (score > bestScore) {
			best = intent;
			bestScore = score;
		}
	}
	return best;
}

function reMatchIssueType(intent: JiraTicketIntent, issueType: string): boolean {
	const t = issueType.toLowerCase();
	switch (intent) {
		case 'bug_fix': return /bug/.test(t);
		case 'feature': return /story|feature|epic|initiative/.test(t);
		case 'testing': return /test/.test(t);
		case 'documentation': return /doc/.test(t);
		case 'devops': return /task|sub-task/.test(t) && /deploy|ops/.test(t);
		default: return false;
	}
}

/** Recommended built-in tools per intent (for agent routing). */
export function recommendedToolsForIntent(intent: JiraTicketIntent): string[] {
	switch (intent) {
		case 'bug_fix':
			return ['fetch_jira_issue', 'grep', 'read_file', 'search_files', 'propose_file_edit', 'run_terminal_command'];
		case 'feature':
			return ['fetch_jira_issue', 'search_files', 'read_file', 'get_symbols', 'propose_file_edit', 'run_terminal_command'];
		case 'refactor':
			return ['fetch_jira_issue', 'get_symbols', 'grep', 'read_file', 'propose_file_edit', 'run_terminal_command'];
		case 'testing':
			return ['fetch_jira_issue', 'read_file', 'run_terminal_command', 'grep'];
		case 'devops':
			return ['fetch_jira_issue', 'read_file', 'run_terminal_command', 'list_files'];
		case 'documentation':
			return ['fetch_jira_issue', 'read_file', 'propose_file_edit', 'search_files'];
		case 'investigation':
			return ['fetch_jira_issue', 'search_files', 'grep', 'read_file', 'get_symbols'];
		case 'maintenance':
			return ['fetch_jira_issue', 'read_file', 'grep', 'propose_file_edit', 'run_terminal_command'];
		default:
			return ['fetch_jira_issue', 'read_file', 'grep', 'search_files', 'propose_file_edit'];
	}
}

export function intentLabel(intent: JiraTicketIntent): string {
	return intent.replace(/_/g, ' ');
}

/** System prompt block: stable JIRA virtual tools + categories. */
export function buildJiraToolRegistryPromptBlock(mcpTools: SerializableMcpTool[] | undefined): string {
	if (!mcpTools?.length) {
		return '';
	}
	const available = listAvailableJiraVirtualTools(mcpTools);
	if (!available.length) {
		return [
			'<jira_tool_registry>',
			'Atlassian MCP is connected but no JIRA virtual tools could be mapped.',
			'Check API token scopes or use OAuth for the full Jira tool set.',
			'</jira_tool_registry>',
		].join('\n');
	}

	const byCategory = new Map<JiraToolCategory, JiraVirtualToolDef[]>();
	for (const v of available) {
		const list = byCategory.get(v.category) ?? [];
		list.push(v);
		byCategory.set(v.category, list);
	}

	const categoryTitles: Record<JiraToolCategory, string> = {
		read_issue: 'Read / understand tickets',
		search_issues: 'Search tickets',
		comment: 'Update — comments',
		transition: 'Update — workflow',
		update_issue: 'Update — fields',
		graph_context: 'Graph context',
	};

	const lines: string[] = [
		'<jira_tool_registry>',
		'Use these stable tool names in tool_call JSON (do NOT call getJiraIssue or raw MCP names unless listed below).',
		'',
	];

	for (const [cat, title] of Object.entries(categoryTitles) as [JiraToolCategory, string][]) {
		const tools = byCategory.get(cat);
		if (!tools?.length) {
			continue;
		}
		lines.push(`## ${title}`);
		for (const t of tools) {
			const props = Object.keys((t.inputSchema.properties ?? {}) as Record<string, unknown>);
			lines.push(`- **${t.name}**(${props.join(', ')}): ${t.description}`);
		}
		lines.push('');
	}

	lines.push(
		'## Ticket intent categories (set in <jira_context> after pre-fetch)',
		'bug_fix | feature | refactor | testing | devops | documentation | investigation | maintenance | unknown',
		'Pick tools and workflow steps that match the classified intent.',
		'</jira_tool_registry>',
	);
	return lines.join('\n');
}
