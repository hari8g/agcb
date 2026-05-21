/*--------------------------------------------------------------------------------------
 *  Agentic AI — execute stable JIRA virtual tools via MCP backends
 *--------------------------------------------------------------------------------------*/

import type { SerializableMcpTool } from '../../common/mcp/agenticMcpTypes.js';
import {
	buildVirtualToolMcpParams,
	getJiraVirtualToolDef,
	resolveMcpToolForVirtual,
} from '../../common/mcp/jiraToolRegistry.js';
import { agenticCallMcpTool } from './mcpChannelRegistry.js';
import { agenticLog } from '../../common/agenticObservability.js';
import { stringifyToolResult } from '../../common/toolValidation.js';
import { mergeAtlassianEnv } from '../../../void/electron-main/atlassianMcpEnv.js';
import { resolveAtlassianCloudId } from '../../common/mcp/jiraContextExtractor.js';
import {
	buildAtlassianEnvDiagnostics,
	classifyJiraMcpErrorMessage,
	formatAtlassianEnvDiagnosticsBlock,
	formatJiraFetchFailureMessage,
	type AtlassianEnvSourceProbe,
} from '../../common/mcp/jiraMcpDiagnostics.js';

export { isJiraVirtualToolName, isJiraVirtualReadTool } from '../../common/mcp/jiraToolRegistry.js';

export async function executeJiraVirtualTool(
	name: string,
	args: Record<string, unknown>,
	mcpTools: SerializableMcpTool[] | undefined,
	atlassianEnv: Record<string, string | undefined> | undefined,
	runId: string,
): Promise<{ content: string; isError: boolean }> {
	const resolved = resolveMcpToolForVirtual(name, mcpTools ?? []);
	if (!resolved) {
		const def = getJiraVirtualToolDef(name);
		const hint = def
			? `No MCP backend for "${name}" (${def.category}). Enable Atlassian MCP with Jira scopes or OAuth.`
			: `Unknown JIRA tool: ${name}`;
		return { content: stringifyToolResult(name, hint, true), isError: true };
	}

	const { virtual, mcp } = resolved;
	const effectiveEnv = mergeAtlassianEnv(atlassianEnv);
	const envSources: AtlassianEnvSourceProbe[] = [
		{
			label: 'main process ~/.void-editor-dev + ~/.void-editor + MCP client entry',
			ok: Object.keys(effectiveEnv).length > 0,
			keys: Object.keys(effectiveEnv),
		},
	];
	if (atlassianEnv && Object.keys(atlassianEnv).length > 0) {
		envSources.push({
			label: 'browser IPC (mcpServerEnv.atlassian)',
			ok: true,
			keys: Object.keys(atlassianEnv),
		});
	} else {
		envSources.push({
			label: 'browser IPC (mcpServerEnv.atlassian)',
			ok: false,
			keys: [],
			error: 'empty — using main-process home mcp.json only',
		});
	}
	const diag = buildAtlassianEnvDiagnostics(effectiveEnv, {
		sources: envSources,
		workspaceMcpPaths: [],
	});
	const diagBlock = formatAtlassianEnvDiagnosticsBlock(diag);

	let mcpParams: Record<string, unknown>;
	try {
		mcpParams = buildVirtualToolMcpParams(virtual.name, args, mcp, effectiveEnv);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		const kind = classifyJiraMcpErrorMessage(msg);
		const body = formatJiraFetchFailureMessage(kind, diag, msg);
		return { content: stringifyToolResult(name, body, true), isError: true };
	}

	agenticLog({
		kind: 'tool_call_started',
		runId,
		toolName: name,
		meta: { mcpServer: mcp.serverName, mcpTool: mcp.name },
	});

	try {
		const raw = await agenticCallMcpTool({
			serverName: mcp.serverName,
			toolName: mcp.name,
			params: mcpParams,
		});
		const text = raw.event === 'error' ? raw.text : (raw.text ?? JSON.stringify(raw));
		const isError = raw.event === 'error' || /legacy api token|twg request failed|"error":\s*true/i.test(text);
		agenticLog({ kind: 'tool_call_completed', runId, toolName: name });
		const prefix = `[${virtual.name} → ${mcpToolLabel(mcp.name)}] cloudId=${resolveAtlassianCloudId(effectiveEnv) ?? '(missing)'}\n`;
		if (isError) {
			const kind = classifyJiraMcpErrorMessage(text);
			const body = formatJiraFetchFailureMessage(kind, diag, prefix + text);
			return { content: stringifyToolResult(name, body, true), isError: true };
		}
		return {
			content: stringifyToolResult(name, `${diagBlock}\n\n${prefix}${text}`, false),
			isError: false,
		};
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		const kind = classifyJiraMcpErrorMessage(msg);
		const body = formatJiraFetchFailureMessage(kind, diag, msg);
		agenticLog({ kind: 'error', runId, toolName: name, message: msg });
		return { content: stringifyToolResult(name, body, true), isError: true };
	}
}

function mcpToolLabel(prefixedName: string): string {
	const i = prefixedName.indexOf('_');
	return i >= 0 ? prefixedName.slice(i + 1) : prefixedName;
}
