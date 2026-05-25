/*--------------------------------------------------------------------------------------
 *  Agentic AI — extract JIRA keys and build LLM context blocks
 *--------------------------------------------------------------------------------------*/

import type { JiraIssueContext } from './jiraTypes.js';
import { JIRA_ISSUE_KEY_RE } from './jiraTypes.js';
import type { SerializableMcpTool } from './agenticMcpTypes.js';
import type { MCPServerOfName } from '../../../void/common/mcpServiceTypes.js';
import {
	classifyJiraTicketIntent,
	intentLabel,
	recommendedToolsForIntent,
} from './jiraToolRegistry.js';

/** MCP tool names use a server prefix: `{prefix}_{toolName}` */
export function mcpToolBaseName(name: string): string {
	const i = name.indexOf('_');
	return i >= 0 ? name.slice(i + 1) : name;
}

const JIRA_GET_ISSUE_BASE_NAMES = [
	/^getJiraIssue$/i,
	/^get_jira_issue$/i,
	/^jira_get_issue$/i,
];

/** Teamwork Graph tools used when getJiraIssue is not exposed (common with API-token auth). */
const JIRA_TEAMWORK_FETCH_BASE_NAMES = [
	/^getTeamworkGraphContext$/i,
	/^getTeamworkGraphObject$/i,
];

export function extractJiraIssueKeys(text: string): string[] {
	const keys = new Set<string>();
	let m: RegExpExecArray | null;
	const re = new RegExp(JIRA_ISSUE_KEY_RE.source, 'g');
	while ((m = re.exec(text)) !== null) {
		keys.add(m[1].toUpperCase());
	}
	return [...keys];
}

export function buildJiraContextBlock(issues: JiraIssueContext[]): string {
	if (!issues.length) {
		return '';
	}
	const parts: string[] = ['<jira_context>'];
	for (const issue of issues) {
		const intent = classifyJiraTicketIntent(issue);
		parts.push(`Issue: ${issue.issueKey}`);
		parts.push(`Intent: ${intent} (${intentLabel(intent)})`);
		parts.push(`Recommended tools: ${recommendedToolsForIntent(intent).join(', ')}`);
		if (issue.summary) parts.push(`Summary: ${issue.summary}`);
		if (issue.status) parts.push(`Status: ${issue.status}`);
		if (issue.issueType) parts.push(`Type: ${issue.issueType}`);
		if (issue.assignee) parts.push(`Assignee: ${issue.assignee}`);
		if (issue.labels?.length) parts.push(`Labels: ${issue.labels.join(', ')}`);
		if (issue.diagnostics) {
			parts.push(issue.diagnostics);
		}
		if (issue.description) {
			parts.push(`Description:\n${issue.description.slice(0, 8000)}`);
		} else if (issue.rawText) {
			parts.push(`Details:\n${issue.rawText.slice(0, 8000)}`);
		}
		parts.push('');
	}
	parts.push('</jira_context>');
	return parts.join('\n');
}

function isAtlassianServerTool(t: SerializableMcpTool): boolean {
	return /atlassian|jira|rovo/i.test(t.serverName);
}

function atlassianTools(tools: SerializableMcpTool[]): SerializableMcpTool[] {
	return tools.filter(isAtlassianServerTool);
}

/**
 * Cloud id for Teamwork Graph / Rovo MCP tools.
 * Atlassian docs expect the site URL, e.g. https://yoursite.atlassian.net (not bare hostname).
 */
export function resolveAtlassianCloudId(env: Record<string, string | undefined> | undefined): string | undefined {
	const raw = env?.['ATLASSIAN_CLOUD_ID'] ?? env?.['ATLASSIAN_SITE'] ?? env?.['ATLASSIAN_DOMAIN'];
	if (!raw?.trim()) {
		return undefined;
	}
	const t = raw.trim().replace(/\/$/, '');
	if (/^https?:\/\//i.test(t)) {
		return t;
	}
	// Atlassian cloud UUID (from admin / getAccessibleAtlassianResources)
	if (/^[a-f0-9-]{36}$/i.test(t)) {
		return t;
	}
	if (/\.atlassian\.net/i.test(t)) {
		const host = t.replace(/^https?:\/\//i, '');
		return `https://${host}`;
	}
	return t;
}

export function hasFullJiraMcpTools(tools: SerializableMcpTool[]): boolean {
	return atlassianTools(tools).some(t => /^getJiraIssue$/i.test(mcpToolBaseName(t.name)));
}

/** Find an MCP tool that can load a JIRA issue by key (getJiraIssue or Teamwork Graph fallback). */
export function findJiraGetIssueTool(tools: SerializableMcpTool[]): SerializableMcpTool | undefined {
	const candidates = atlassianTools(tools);

	for (const pattern of JIRA_GET_ISSUE_BASE_NAMES) {
		const hit = candidates.find(t => pattern.test(mcpToolBaseName(t.name)));
		if (hit) {
			return hit;
		}
	}

	const generic = candidates.find(t => {
		const base = mcpToolBaseName(t.name);
		return /get|fetch|read|load/i.test(base) && /jira.*issue|issue.*jira|getissue|fetchissue/i.test(`${base} ${t.description}`);
	});
	if (generic) {
		return generic;
	}

	for (const pattern of JIRA_TEAMWORK_FETCH_BASE_NAMES) {
		const hit = candidates.find(t => pattern.test(mcpToolBaseName(t.name)));
		if (hit) {
			return hit;
		}
	}

	return undefined;
}

/** Actionable message when JIRA issue pre-fetch cannot run. */
export function describeJiraMcpUnavailableMessage(
	mcpConfigPath: string,
	servers: MCPServerOfName,
	globalMcpError: string | undefined,
	tools: SerializableMcpTool[],
	atlassianEnv?: Record<string, string | undefined>,
	workspaceMcpPath?: string,
): string {
	const lines: string[] = [
		'JIRA MCP is not ready — the agent cannot fetch ticket details yet.',
		'',
		`Active MCP config (use "Open MCP config" in Agentic): ${mcpConfigPath}`,
	];
	if (workspaceMcpPath) {
		lines.push(`Workspace override (merged for ATLASSIAN_* env): ${workspaceMcpPath}`);
	}

	if (globalMcpError) {
		lines.push(`Config parse error: ${globalMcpError}`);
	}

	const atlassian = servers['atlassian'];
	const atlassianToolCount = atlassian && atlassian.status === 'success' ? (atlassian.tools?.length ?? 0) : 0;

	if (!atlassian) {
		lines.push('', 'No "atlassian" server in mcp.json. Add the Atlassian Rovo MCP entry under mcpServers.');
	} else if (atlassian.status === 'loading') {
		lines.push('', 'Atlassian MCP is still connecting. Wait a few seconds and try again.');
	} else if (atlassian.status === 'offline') {
		lines.push('', 'Atlassian MCP is disabled. Turn it on in Agentic_MPS Settings → MCP.');
	} else if (atlassian.status === 'error') {
		lines.push('', `Atlassian MCP error: ${atlassian.error}`);
		lines.push('For API token auth, set ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN in mcp.json.');
		lines.push('Org admin must allow API token auth for the Rovo MCP server.');
	} else if (!findJiraGetIssueTool(tools)) {
		if (atlassianToolCount === 0) {
			lines.push('', 'Atlassian shows Success but no tools were listed. Toggle the server off/on in Agentic_MPS Settings → MCP.');
		} else {
			lines.push('', `Atlassian connected with ${atlassianToolCount} tool(s) but none can fetch issues by key.`);
		}
	} else if (!hasFullJiraMcpTools(tools) && !resolveAtlassianCloudId(atlassianEnv)) {
		lines.push('', 'Using Teamwork Graph tools for JIRA. Add ATLASSIAN_SITE to env in the active MCP config (and/or workspace mcp.json):');
		lines.push('  "ATLASSIAN_SITE": "https://your-site.atlassian.net"');
		const keys = atlassianEnv ? Object.keys(atlassianEnv).join(', ') : '(none loaded)';
		lines.push(`Env keys currently loaded: ${keys}`);
		lines.push('Also ensure ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN are set for API token auth.');
	}

	if (atlassian?.status === 'success' && atlassianToolCount > 0 && !hasFullJiraMcpTools(tools)) {
		lines.push(
			'',
			'Your token only exposes Teamwork Graph tools (not getJiraIssue).',
			'Create an MCP API token with all scopes: https://id.atlassian.com/manage-profile/security/api-tokens?appId=mcp&selectedScopes=all',
			'Or use OAuth via mcp-remote + https://mcp.atlassian.com/v1/mcp/authv2 for the full Jira tool set.',
		);
	}

	lines.push(
		'',
		'Steps:',
		'1. Open MCP config and verify atlassian + ATLASSIAN_SITE.',
		'2. Agentic_MPS Settings → MCP: atlassian must show Success.',
		'3. Retry the workflow (e.g. KAN-4).',
	);
	return lines.join('\n');
}

const ISSUE_KEY_PARAM_NAMES = ['issueIdOrKey', 'issue_key', 'issueKey', 'key', 'issueId', 'id'] as const;

function requireAtlassianCloudId(env?: Record<string, string | undefined>): string {
	const cloudId = resolveAtlassianCloudId(env);
	if (!cloudId) {
		throw new Error('Set ATLASSIAN_SITE (e.g. https://yoursite.atlassian.net) in mcp.json env for the atlassian server.');
	}
	return cloudId;
}

/** Map issue key + env onto MCP params using the tool's JSON Schema (required + properties). */
export function buildMcpParamsFromInputSchema(
	schema: Record<string, unknown> | undefined,
	issueKey: string,
	env?: Record<string, string | undefined>,
): Record<string, unknown> {
	const properties = (schema?.properties ?? {}) as Record<string, unknown>;
	const propNames = Object.keys(properties);
	const required = Array.isArray(schema?.required) ? (schema.required as string[]) : [];
	const params: Record<string, unknown> = {};

	if (propNames.includes('cloudId')) {
		params.cloudId = requireAtlassianCloudId(env);
	}

	const issueParam = ISSUE_KEY_PARAM_NAMES.find(n => propNames.includes(n));
	if (issueParam) {
		params[issueParam] = issueKey;
	} else if (propNames.includes('objectIdentifier')) {
		params.objectIdentifier = issueKey;
		if (propNames.includes('objectType') && params.objectType === undefined) {
			params.objectType = 'JiraWorkItem';
		}
	} else if (propNames.includes('objects')) {
		params.objects = [issueKey];
	}

	if (propNames.includes('detailLevel') && params.detailLevel === undefined) {
		params.detailLevel = 'full';
	}

	for (const r of required) {
		if (params[r] !== undefined) {
			continue;
		}
		if (r === 'cloudId') {
			params.cloudId = requireAtlassianCloudId(env);
		} else if (ISSUE_KEY_PARAM_NAMES.includes(r as typeof ISSUE_KEY_PARAM_NAMES[number])) {
			params[r] = issueKey;
		} else if (r === 'objectType') {
			params.objectType = 'JiraWorkItem';
		} else if (r === 'objectIdentifier') {
			params.objectIdentifier = issueKey;
		} else if (r === 'objects') {
			params.objects = [issueKey];
		}
	}

	const missing = required.filter(r => params[r] === undefined);
	if (missing.length) {
		throw new Error(`MCP tool requires ${missing.join(', ')} but could not build them from env/issue key.`);
	}

	return params;
}

/** Build MCP params for a JIRA issue fetch tool from its input schema. */
export function buildJiraIssueToolParams(
	tool: SerializableMcpTool,
	issueKey: string,
	env?: Record<string, string | undefined>,
): Record<string, unknown> {
	const base = mcpToolBaseName(tool.name);

	if (base === 'getTeamworkGraphContext') {
		const cloudId = requireAtlassianCloudId(env);
		return {
			cloudId,
			objectType: 'JiraWorkItem',
			objectIdentifier: issueKey,
			detailLevel: 'full',
		};
	}

	if (base === 'getTeamworkGraphObject') {
		const cloudId = requireAtlassianCloudId(env);
		return { cloudId, objects: [issueKey] };
	}

	return buildMcpParamsFromInputSchema(tool.inputSchema, issueKey, env);
}

export function findJiraSearchTool(tools: SerializableMcpTool[]): SerializableMcpTool | undefined {
	return atlassianTools(tools).find(t =>
		/searchJiraIssuesUsingJql|search.*jira.*jql/i.test(mcpToolBaseName(t.name)),
	);
}

export function findJiraGetTransitionsTool(tools: SerializableMcpTool[]): SerializableMcpTool | undefined {
	return atlassianTools(tools).find(t =>
		/getTransitionsForJiraIssue/i.test(mcpToolBaseName(t.name)),
	);
}

/** Recent window required — Atlassian MCP rejects unbounded JQL (no project/time filter). */
export const JIRA_LIST_RECENT_DAYS = 90;

/** Read optional default project from mcp.json env (e.g. ATLASSIAN_PROJECT=KAN). */
export function inferJiraProjectKeyFromEnv(env?: Record<string, string | undefined>): string | undefined {
	const raw = env?.['ATLASSIAN_PROJECT'] ?? env?.['JIRA_PROJECT'] ?? env?.['JIRA_PROJECT_KEY'];
	const key = raw?.trim().toUpperCase();
	return key && /^[A-Z][A-Z0-9]+$/.test(key) ? key : undefined;
}

function recentUpdatedClause(days = JIRA_LIST_RECENT_DAYS): string {
	return `updated >= -${days}d`;
}

function normalizeJiraProjectKey(projectKey?: string): string | undefined {
	const key = projectKey?.trim().toUpperCase();
	return key && /^[A-Z][A-Z0-9]+$/.test(key) ? key : undefined;
}

/** Default JQL for open / not-done tickets. */
export function buildOpenTicketsJql(projectKey?: string, recentDays = JIRA_LIST_RECENT_DAYS): string {
	const recent = recentUpdatedClause(recentDays);
	const project = normalizeJiraProjectKey(projectKey);
	if (project) {
		return `project = ${project} AND statusCategory != Done AND ${recent} ORDER BY updated DESC`;
	}
	return `statusCategory != Done AND ${recent} ORDER BY updated DESC`;
}

/** Open + closed tickets for a project (or recent issues site-wide if no project). */
export function buildAllTicketsJql(projectKey?: string, recentDays = JIRA_LIST_RECENT_DAYS): string {
	const recent = recentUpdatedClause(recentDays);
	const project = normalizeJiraProjectKey(projectKey);
	if (project) {
		return `project = ${project} AND ${recent} ORDER BY updated DESC`;
	}
	return `${recent} ORDER BY updated DESC`;
}

export function buildJiraSearchParams(
	tool: SerializableMcpTool,
	jql: string,
	env: Record<string, string | undefined> | undefined,
	maxResults = 25,
): Record<string, unknown> {
	const params: Record<string, unknown> = { jql, maxResults };
	const props = Object.keys((tool.inputSchema?.properties ?? {}) as Record<string, unknown>);
	if (props.includes('cloudId')) {
		params.cloudId = requireAtlassianCloudId(env);
	}
	return params;
}

export function buildJiraCommentParams(
	tool: SerializableMcpTool,
	issueKey: string,
	commentBody: string,
	env?: Record<string, string | undefined>,
): Record<string, unknown> {
	const props = Object.keys((tool.inputSchema?.properties ?? {}) as Record<string, unknown>);
	const params: Record<string, unknown> = {};
	if (props.includes('cloudId')) {
		params.cloudId = requireAtlassianCloudId(env);
	}
	if (props.includes('issueIdOrKey')) {
		params.issueIdOrKey = issueKey;
	} else if (props.includes('issueKey')) {
		params.issueKey = issueKey;
	}
	if (props.includes('commentBody')) {
		params.commentBody = commentBody;
	} else {
		params.comment = commentBody;
		params.body = commentBody;
	}
	return params;
}

export function buildJiraTransitionParams(
	tool: SerializableMcpTool,
	issueKey: string,
	transitionId: string,
	env?: Record<string, string | undefined>,
): Record<string, unknown> {
	const props = Object.keys((tool.inputSchema?.properties ?? {}) as Record<string, unknown>);
	const params: Record<string, unknown> = {};
	if (props.includes('cloudId')) {
		params.cloudId = requireAtlassianCloudId(env);
	}
	if (props.includes('issueIdOrKey')) {
		params.issueIdOrKey = issueKey;
	} else if (props.includes('issueKey')) {
		params.issueKey = issueKey;
	}
	if (props.includes('transition')) {
		params.transition = { id: transitionId };
	} else {
		params.transitionId = transitionId;
		params.transition = transitionId;
	}
	return params;
}

export function findJiraCommentTool(tools: SerializableMcpTool[]): SerializableMcpTool | undefined {
	return atlassianTools(tools).find(t =>
		/addCommentToJiraIssue|add_jira_comment|jira.*comment|comment.*jira/i.test(mcpToolBaseName(t.name)),
	);
}

export function findJiraTransitionTool(tools: SerializableMcpTool[]): SerializableMcpTool | undefined {
	return atlassianTools(tools).find(t =>
		/transitionJiraIssue|transition_jira|jira.*transition|transition.*jira/i.test(mcpToolBaseName(t.name)),
	);
}

export function parseIssueFromMcpText(text: string, issueKey: string): JiraIssueContext {
	// Delegate to shared parser (handles Jira REST `fields` shape).
	return parseIssueContextFromMcpText(text, issueKey);
}

function parseIssueContextFromMcpText(text: string, issueKey: string): JiraIssueContext {
	const ctx: JiraIssueContext = {
		issueKey,
		rawText: text,
		fetchedAt: Date.now(),
	};
	try {
		const json = JSON.parse(text) as Record<string, unknown>;
		if (json.error === true && typeof json.message === 'string') {
			ctx.rawText = json.message;
			return ctx;
		}
		const fields = (json.fields ?? json) as Record<string, unknown>;
		ctx.summary = str(json.summary ?? fields.summary ?? json.title ?? json.name);
		ctx.description = str(fields.description ?? json.description ?? json.body);
		ctx.status = str(fields.status ?? json.status);
		ctx.issueType = str(fields.issuetype ?? fields.issueType ?? json.issueType ?? json.type);
		ctx.assignee = str(
			(fields.assignee as Record<string, unknown>)?.displayName ?? fields.assignee ?? json.assignee,
		);
		if (Array.isArray(fields.labels)) {
			ctx.labels = fields.labels.map(String);
		}
	} catch {
		const summaryMatch = text.match(/summary[:\s]+(.+)/i);
		if (summaryMatch) ctx.summary = summaryMatch[1].trim();
	}
	return ctx;
}

function str(v: unknown): string | undefined {
	if (v == null) return undefined;
	if (typeof v === 'string') return v;
	if (typeof v === 'object' && v !== null && 'name' in v) {
		return String((v as { name: unknown }).name);
	}
	return String(v);
}
