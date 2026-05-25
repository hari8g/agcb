/*--------------------------------------------------------------------------------------
 *  Agentic AI — tool permission classification
 *--------------------------------------------------------------------------------------*/

import { getToolDefinition, type ToolDefinition } from './toolTypes.js';
import { isJiraVirtualReadTool, isJiraVirtualToolName } from './mcp/jiraToolRegistry.js';

export type ToolPermissionClass = 'read_only' | 'write' | 'terminal' | 'network' | 'dangerous' | 'mcp';

const READ_ONLY_TOOLS = new Set([
	'read_file',
	'read_lint_errors',
	'list_files',
	'list_workspace',
	'search_files',
	'grep',
	'get_symbols',
	'get_active_file',
	'get_selected_code',
	'create_checkpoint',
]);

const WRITE_TOOLS = new Set(['write_file', 'propose_file_edit', 'apply_file_edit', 'restore_checkpoint']);

const TERMINAL_TOOLS = new Set(['run_terminal_command']);

const NETWORK_TOOLS = new Set(['fetch_url', 'http_request']);

export function isJiraVirtualWriteTool(name: string): boolean {
	return isJiraVirtualToolName(name) && !isJiraVirtualReadTool(name);
}

/** Heuristic for raw MCP tool names (Atlassian, etc.) */
export function isLikelyMcpReadTool(name: string): boolean {
	const base = name.replace(/^mcp[_:]/i, '').replace(/^atlassian[_:]/i, '');
	return /^(get|fetch|search|list|read|find|lookup|browse)/i.test(base)
		|| /jira[_-]?(get|search|fetch|list|read)/i.test(base)
		|| /(get|search|fetch|list|read)[_-]?jira/i.test(base);
}

export function classifyTool(name: string, def?: ToolDefinition, isMcp = false): ToolPermissionClass {
	if (isJiraVirtualReadTool(name)) {
		return 'read_only';
	}
	if (isJiraVirtualToolName(name)) {
		return 'mcp';
	}
	if (isMcp) {
		return 'mcp';
	}
	if (NETWORK_TOOLS.has(name)) {
		return 'network';
	}
	if (TERMINAL_TOOLS.has(name)) {
		return 'terminal';
	}
	if (WRITE_TOOLS.has(name) || def?.canModifyWorkspace) {
		return def?.riskLevel === 'high' ? 'dangerous' : 'write';
	}
	if (READ_ONLY_TOOLS.has(name) || (def && !def.canModifyWorkspace && !def.requiresApproval)) {
		return 'read_only';
	}
	if (def?.riskLevel === 'high') {
		return 'dangerous';
	}
	return def?.requiresApproval ? 'write' : 'read_only';
}

export interface ToolApprovalOptions {
	requireApprovalForEdits: boolean;
	autoRunReadOnlyTools: boolean;
	requireApprovalForMcpTools?: boolean;
	requireApprovalForMcpWrites?: boolean;
	/** When false, run_terminal_command proceeds without approval_required pause */
	requireApprovalForTerminal?: boolean;
}

function mcpRequiresApproval(name: string, opts: ToolApprovalOptions): boolean {
	if (isJiraVirtualReadTool(name)) {
		return !opts.autoRunReadOnlyTools;
	}
	if (isJiraVirtualWriteTool(name)) {
		return opts.requireApprovalForMcpWrites !== false;
	}
	const requireAllMcp = opts.requireApprovalForMcpTools ?? true;
	const requireWrites = opts.requireApprovalForMcpWrites ?? true;
	if (!requireAllMcp) {
		if (!requireWrites) {
			return false;
		}
		return !isLikelyMcpReadTool(name);
	}
	return true;
}

export function requiresUserApproval(
	name: string,
	opts: ToolApprovalOptions,
	def?: ToolDefinition,
	isMcp = false,
): boolean {
	if (isJiraVirtualReadTool(name)) {
		return !opts.autoRunReadOnlyTools;
	}
	if (isJiraVirtualWriteTool(name) || isJiraVirtualToolName(name) || isMcp) {
		return mcpRequiresApproval(name, opts);
	}
	const permission = classifyTool(name, def, isMcp);
	if (permission === 'read_only') {
		return !opts.autoRunReadOnlyTools && !!def?.requiresApproval;
	}
	if (permission === 'write') {
		return opts.requireApprovalForEdits;
	}
	if (permission === 'dangerous') {
		return opts.requireApprovalForEdits || !!def?.requiresApproval;
	}
	if (permission === 'terminal') {
		return opts.requireApprovalForTerminal !== false;
	}
	// network
	return true;
}

export function canAutoExecute(
	name: string,
	opts: ToolApprovalOptions,
	def?: ToolDefinition,
	isMcp = false,
): boolean {
	if (isJiraVirtualReadTool(name)) {
		return opts.autoRunReadOnlyTools;
	}
	if (isJiraVirtualWriteTool(name) || isJiraVirtualToolName(name) || isMcp) {
		const requireAllMcp = opts.requireApprovalForMcpTools ?? true;
		const requireWrites = opts.requireApprovalForMcpWrites ?? true;
		if (!requireAllMcp && requireWrites) {
			return isLikelyMcpReadTool(name) && opts.autoRunReadOnlyTools;
		}
		return false;
	}
	const permission = classifyTool(name, def ?? getToolDefinition(name));
	if (permission === 'read_only') {
		return opts.autoRunReadOnlyTools;
	}
	if (permission === 'terminal') {
		return opts.requireApprovalForTerminal === false;
	}
	return false;
}
