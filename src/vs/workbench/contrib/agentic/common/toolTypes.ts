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
		name: 'read_lint_errors',
		description: 'Read linter/diagnostic errors for a file after edits',
		inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
		requiresApproval: false,
		canModifyWorkspace: false,
		allowedInBrowser: true,
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
		name: 'write_file',
		description: 'Create or overwrite a file with full content (preferred for new files)',
		inputSchema: {
			type: 'object',
			properties: {
				path: { type: 'string' },
				content: { type: 'string' },
			},
			required: ['path', 'content'],
		},
		requiresApproval: true,
		canModifyWorkspace: true,
		allowedInBrowser: false,
		allowedInMain: true,
		riskLevel: 'medium',
	},
	{
		name: 'propose_file_edit',
		description: 'Propose an edit to an existing file (requires approval before apply)',
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
		description: 'Create a workspace checkpoint before modifications (snapshots file contents)',
		inputSchema: {
			type: 'object',
			properties: {
				label: { type: 'string' },
				paths: { type: 'array', items: { type: 'string' }, description: 'Workspace-relative paths to snapshot; omit to use files touched this run' },
			},
		},
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
