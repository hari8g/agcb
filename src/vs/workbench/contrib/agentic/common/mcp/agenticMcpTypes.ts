/*--------------------------------------------------------------------------------------
 *  Agentic AI — MCP tool descriptors (serializable for RuntimeRequest IPC)
 *--------------------------------------------------------------------------------------*/

/** MCP tool snapshot passed from browser → electron-main with each agent run */
export interface SerializableMcpTool {
	/** Prefixed tool name as registered by Void MCPChannel (e.g. abc123_get_issue) */
	name: string;
	description: string;
	serverName: string;
	inputSchema?: Record<string, unknown>;
	/** When true, agent loop pauses for user approval before calling */
	requiresApproval: boolean;
}

export interface McpToolCallMeta {
	serverName: string;
	toolName: string;
}

export function resolveMcpTool(
	tools: SerializableMcpTool[] | undefined,
	toolName: string,
): (SerializableMcpTool & McpToolCallMeta) | undefined {
	if (!tools?.length) {
		return undefined;
	}
	const hit = tools.find(t => t.name === toolName);
	if (!hit) {
		return undefined;
	}
	return { ...hit, toolName: hit.name };
}

export function isMcpToolName(name: string, tools: SerializableMcpTool[] | undefined): boolean {
	return !!tools?.some(t => t.name === name);
}

/** Example Atlassian Rovo MCP entry for ~/.void-editor-dev/mcp.json (dev) or ~/.void-editor/mcp.json */
export const ATLASSIAN_MCP_CONFIG_EXAMPLE = {
	mcpServers: {
		// API token (no browser OAuth). Org admin must enable "Allow API token authentication".
		// Create token: https://id.atlassian.com/manage-profile/security/api-tokens?appId=mcp&selectedScopes=all
		atlassian: {
			url: 'https://mcp.atlassian.com/v1/mcp',
			env: {
				ATLASSIAN_EMAIL: 'your.email@example.com',
				ATLASSIAN_API_TOKEN: 'paste-api-token-here',
				ATLASSIAN_SITE: 'https://your-site.atlassian.net',
			},
		},
		// OAuth via mcp-remote (browser consent):
		// atlassian: {
		//   command: 'npx',
		//   args: ['-y', 'mcp-remote@latest', 'https://mcp.atlassian.com/v1/mcp/authv2'],
		// },
	},
} as const;
