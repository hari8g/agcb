/*--------------------------------------------------------------------------------------
 *  Agentic AI — tool schemas
 *--------------------------------------------------------------------------------------*/

export type ToolRiskLevel = 'low' | 'medium' | 'high';

export interface ToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	requiresApproval: boolean;
	canModifyWorkspace: boolean;
	allowedInBrowser: boolean;
	allowedInMain: boolean;
	riskLevel: ToolRiskLevel;
}

export const AGENTIC_TOOLS: ToolDefinition[] = [
	{
		name: 'read_file',
		description: 'Read file contents from the workspace',
		inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
		requiresApproval: false,
		canModifyWorkspace: false,
		allowedInBrowser: false,
		allowedInMain: true,
		riskLevel: 'low',
	},
	{
		name: 'list_files',
		description: 'List files in a directory',
		inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
		requiresApproval: false,
		canModifyWorkspace: false,
		allowedInBrowser: false,
		allowedInMain: true,
		riskLevel: 'low',
	},
	{
		name: 'list_workspace',
		description: 'List workspace root folders and top-level entries',
		inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
		requiresApproval: false,
		canModifyWorkspace: false,
		allowedInBrowser: false,
		allowedInMain: true,
		riskLevel: 'low',
	},
	{
		name: 'get_symbols',
		description: 'Get symbols (functions, classes) from a file path',
		inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
		requiresApproval: false,
		canModifyWorkspace: false,
		allowedInBrowser: false,
		allowedInMain: true,
		riskLevel: 'low',
	},
	{
		name: 'search_files',
		description: 'Search file paths by query',
		inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
		requiresApproval: false,
		canModifyWorkspace: false,
		allowedInBrowser: false,
		allowedInMain: true,
		riskLevel: 'low',
	},
	{
		name: 'grep',
		description: 'Search file contents for a pattern',
		inputSchema: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
		requiresApproval: false,
		canModifyWorkspace: false,
		allowedInBrowser: false,
		allowedInMain: true,
		riskLevel: 'low',
	},
	{
		name: 'get_active_file',
		description: 'Get the currently active editor file',
		inputSchema: { type: 'object', properties: {} },
		requiresApproval: false,
		canModifyWorkspace: false,
		allowedInBrowser: true,
		allowedInMain: true,
		riskLevel: 'low',
	},
	{
		name: 'get_selected_code',
		description: 'Get the current editor selection',
		inputSchema: { type: 'object', properties: {} },
		requiresApproval: false,
		canModifyWorkspace: false,
		allowedInBrowser: true,
		allowedInMain: true,
		riskLevel: 'low',
	},
	{
		name: 'propose_file_edit',
		description: 'Propose an edit to a file (requires approval before apply)',
		inputSchema: {
			type: 'object',
			properties: {
				path: { type: 'string' },
				searchReplaceBlocks: { type: 'string' },
			},
			required: ['path', 'searchReplaceBlocks'],
		},
		requiresApproval: true,
		canModifyWorkspace: true,
		allowedInBrowser: false,
		allowedInMain: true,
		riskLevel: 'medium',
	},
	{
		name: 'apply_file_edit',
		description: 'Apply an approved file edit',
		inputSchema: {
			type: 'object',
			properties: {
				path: { type: 'string' },
				searchReplaceBlocks: { type: 'string' },
				approvalId: { type: 'string' },
			},
			required: ['path', 'searchReplaceBlocks', 'approvalId'],
		},
		requiresApproval: true,
		canModifyWorkspace: true,
		allowedInBrowser: false,
		allowedInMain: true,
		riskLevel: 'high',
	},
	{
		name: 'create_checkpoint',
		description: 'Create a workspace checkpoint before modifications',
		inputSchema: { type: 'object', properties: { label: { type: 'string' } } },
		requiresApproval: false,
		canModifyWorkspace: false,
		allowedInBrowser: false,
		allowedInMain: true,
		riskLevel: 'low',
	},
	{
		name: 'restore_checkpoint',
		description: 'Restore a previous checkpoint',
		inputSchema: { type: 'object', properties: { checkpointId: { type: 'string' } }, required: ['checkpointId'] },
		requiresApproval: true,
		canModifyWorkspace: true,
		allowedInBrowser: false,
		allowedInMain: true,
		riskLevel: 'high',
	},
	{
		name: 'run_terminal_command',
		description: 'Run a shell command in the workspace',
		inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
		requiresApproval: true,
		canModifyWorkspace: true,
		allowedInBrowser: false,
		allowedInMain: true,
		riskLevel: 'high',
	},
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
	return AGENTIC_TOOLS.find(t => t.name === name);
}
