/*--------------------------------------------------------------------------------------
 *  JIRA / Atlassian MCP — user-facing diagnostics (env, auth, tool errors)
 *--------------------------------------------------------------------------------------*/

import { resolveAtlassianCloudId } from './jiraContextExtractor.js';

export type JiraMcpFailureKind =
	| 'missing_site'
	| 'missing_credentials'
	| 'legacy_token'
	| 'mcp_auth'
	| 'mcp_not_connected'
	| 'mcp_tool_error'
	| 'unknown';

export interface AtlassianEnvSourceProbe {
	label: string;
	ok: boolean;
	keys: string[];
	error?: string;
}

export interface AtlassianEnvDiagnostics {
	sources: AtlassianEnvSourceProbe[];
	mergedKeys: string[];
	cloudId?: string;
	hasEmail: boolean;
	hasToken: boolean;
	workspaceMcpPaths: string[];
	homeConfigHint: string;
}

/** Classify raw MCP / pre-fetch error text for accurate user guidance. */
export function classifyJiraMcpErrorMessage(text: string): JiraMcpFailureKind {
	const t = text.toLowerCase();
	if (/legacy api token|api token with scopes|not supported.*scopes/i.test(t)) {
		return 'legacy_token';
	}
	if (/atlassian_site|missing.*site|cloudid|cloud id/i.test(t) && /not set|could not be loaded|missing/i.test(t)) {
		return 'missing_site';
	}
	if (/401|403|unauthorized|forbidden|slauth/i.test(t)) {
		return 'mcp_auth';
	}
	if (!/atlassian_site/i.test(t) && /atlassian_email|atlassian_api_token|credentials/i.test(t) && /missing|not set/i.test(t)) {
		return 'missing_credentials';
	}
	if (/not connected|mcp is not ready|no tools were listed/i.test(t)) {
		return 'mcp_not_connected';
	}
	if (/input validation error|invalid arguments|mcp error -32602/i.test(t)) {
		return 'mcp_tool_error';
	}
	if (/failed to call tool|tool call error|isError|twg request failed/i.test(t)) {
		return 'mcp_tool_error';
	}
	return 'unknown';
}

export function buildAtlassianEnvDiagnostics(
	env: Record<string, string | undefined> | undefined,
	opts: {
		sources: AtlassianEnvSourceProbe[];
		workspaceMcpPaths: string[];
		homeConfigHint?: string;
	},
): AtlassianEnvDiagnostics {
	const merged = env ?? {};
	return {
		sources: opts.sources,
		mergedKeys: Object.keys(merged),
		cloudId: resolveAtlassianCloudId(merged),
		hasEmail: !!merged['ATLASSIAN_EMAIL']?.trim(),
		hasToken: !!merged['ATLASSIAN_API_TOKEN']?.trim(),
		workspaceMcpPaths: opts.workspaceMcpPaths,
		homeConfigHint: opts.homeConfigHint ?? '~/.void-editor-dev/mcp.json',
	};
}

export function formatAtlassianEnvDiagnosticsBlock(diag: AtlassianEnvDiagnostics): string {
	const lines: string[] = [
		'<jira_mcp_diagnostics>',
		`ATLASSIAN_SITE resolved: ${diag.cloudId ? 'yes → ' + diag.cloudId : 'NO (missing or empty)'}`,
		`ATLASSIAN_EMAIL: ${diag.hasEmail ? 'set' : 'MISSING'}`,
		`ATLASSIAN_API_TOKEN: ${diag.hasToken ? 'set' : 'MISSING'}`,
		`Merged env keys: ${diag.mergedKeys.length ? diag.mergedKeys.join(', ') : '(none)'}`,
		`Home MCP config: ${diag.homeConfigHint}`,
		`Workspace mcp.json: ${diag.workspaceMcpPaths.length ? diag.workspaceMcpPaths.join('; ') : '(no folder open)'}`,
		'Env sources:',
	];
	for (const s of diag.sources) {
		lines.push(`  - ${s.label}: ${s.ok ? 'ok' : 'failed'} keys=[${s.keys.join(', ') || 'none'}]${s.error ? ` (${s.error})` : ''}`);
	}
	lines.push('</jira_mcp_diagnostics>');
	return lines.join('\n');
}

export function formatJiraFetchFailureMessage(
	kind: JiraMcpFailureKind,
	diag: AtlassianEnvDiagnostics,
	detail?: string,
): string {
	const lines: string[] = [
		`<jira_fetch_status>FAILED</jira_fetch_status>`,
		formatAtlassianEnvDiagnosticsBlock(diag),
		'',
		`<jira_fetch_failure kind="${kind}">`,
	];

	switch (kind) {
		case 'missing_site':
			lines.push(
				'ATLASSIAN_SITE is not loaded. Add it under mcpServers.atlassian.env in your OPEN workspace mcp.json or ~/.void-editor-dev/mcp.json, then toggle atlassian in Agentic_MPS Settings → MCP.',
			);
			break;
		case 'missing_credentials':
			lines.push(
				'ATLASSIAN_EMAIL and/or ATLASSIAN_API_TOKEN are missing. Use a **Rovo MCP** scoped API token (not a legacy Jira token).',
			);
			break;
		case 'legacy_token':
			lines.push(
				'Your API token is a legacy token without MCP scopes. Atlassian → Create API token → app **Rovo MCP** → select all scopes, then update ATLASSIAN_API_TOKEN in ~/.void-editor-dev/mcp.json.',
				'https://id.atlassian.com/manage-profile/security/api-tokens?appId=mcp&selectedScopes=all',
			);
			break;
		case 'mcp_auth':
			lines.push(
				'MCP connected but Jira/Teamwork Graph rejected the request (401/403). Check token app=**Rovo MCP**, scopes, and site admin allows API token auth.',
			);
			break;
		case 'mcp_not_connected':
			lines.push(
				'Atlassian MCP is not connected. Agentic_MPS Settings → MCP → enable atlassian until Status is Success.',
			);
			break;
		case 'mcp_tool_error':
			lines.push(
				'MCP tool call failed. See MCP error below — do NOT assume ATLASSIAN_SITE is missing if diagnostics above show it is resolved.',
			);
			break;
		default:
			lines.push('JIRA fetch failed. See details below.');
	}

	if (detail?.trim()) {
		lines.push('', 'MCP detail:', detail.trim().slice(0, 4000));
	}
	lines.push('</jira_fetch_failure>');
	return lines.join('\n');
}

/** Tell the model how to interpret diagnostics in jira_context. */
export const JIRA_MCP_DIAGNOSTICS_LLM_HINT = [
	'CRITICAL: Read <jira_env_status> and <jira_mcp_diagnostics> in this system prompt before replying.',
	'When ATLASSIAN_SITE resolved: yes or <jira_env_status>READY, NEVER tell the user to add ATLASSIAN_SITE to mcp.json.',
	'When fetch fails, quote <jira_fetch_failure kind="..."> (legacy_token, mcp_auth, missing_credentials) — do not invent missing ATLASSIAN_SITE.',
	'If kind="legacy_token", user must create API token with app **Rovo MCP** and all scopes.',
].join('\n');
