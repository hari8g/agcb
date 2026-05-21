/*--------------------------------------------------------------------------------------
 *  Agentic AI — format MCP tools for agent system prompt
 *--------------------------------------------------------------------------------------*/

import type { SerializableMcpTool } from './agenticMcpTypes.js';

export function buildMcpToolsPromptBlock(tools: SerializableMcpTool[] | undefined): string {
	if (!tools?.length) {
		return '';
	}
	const lines: string[] = [
		'<mcp_tools>',
		'Raw MCP tools (advanced). For JIRA, prefer stable names in <jira_tool_registry> such as fetch_jira_issue.',
	];
	for (const t of tools) {
		const approval = t.requiresApproval ? ' [requires approval]' : '';
		lines.push(`- ${t.name} (server: ${t.serverName})${approval}: ${t.description}`);
		if (t.inputSchema?.properties) {
			const props = Object.keys(t.inputSchema.properties as Record<string, unknown>);
			if (props.length) {
				lines.push(`  params: ${props.join(', ')}`);
			}
		}
	}
	lines.push('</mcp_tools>');
	return lines.join('\n');
}
