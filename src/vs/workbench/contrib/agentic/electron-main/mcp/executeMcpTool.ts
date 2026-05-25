/*--------------------------------------------------------------------------------------
 *  Agentic AI — execute MCP tools from electron-main agent loop
 *--------------------------------------------------------------------------------------*/

import type { SerializableMcpTool } from '../../common/mcp/agenticMcpTypes.js';
import { isMcpToolName, resolveMcpTool } from '../../common/mcp/agenticMcpTypes.js';
import { agenticCallMcpTool } from './mcpChannelRegistry.js';
import { agenticLog } from '../../common/agenticObservability.js';
import { coerceToolResultContent, stringifyToolResult } from '../../common/toolValidation.js';

export async function executeMcpAgenticTool(
	mcpTools: SerializableMcpTool[] | undefined,
	name: string,
	args: Record<string, unknown>,
	runId: string,
): Promise<{ content: string; isError: boolean }> {
	const tool = resolveMcpTool(mcpTools, name);
	if (!tool) {
		return { content: stringifyToolResult(name, `MCP tool not found: ${name}`, true), isError: true };
	}

	agenticLog({
		kind: 'tool_call_started',
		runId,
		toolName: name,
		meta: { mcpServer: tool.serverName },
	});

	try {
		const raw = await agenticCallMcpTool({
			serverName: tool.serverName,
			toolName: tool.name,
			params: args,
		});
		const text = raw.event === 'error'
			? coerceToolResultContent(raw.text)
			: coerceToolResultContent(raw.text ?? raw);
		const isError = raw.event === 'error';
		agenticLog({ kind: 'tool_call_completed', runId, toolName: name });
		return { content: stringifyToolResult(name, text, isError), isError };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		agenticLog({ kind: 'error', runId, toolName: name, message: msg });
		return { content: stringifyToolResult(name, msg, true), isError: true };
	}
}

export function isAgenticMcpTool(name: string, mcpTools: SerializableMcpTool[] | undefined): boolean {
	return isMcpToolName(name, mcpTools);
}
