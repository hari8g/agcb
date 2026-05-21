/*--------------------------------------------------------------------------------------
 *  Agentic AI — tool permission classification
 *--------------------------------------------------------------------------------------*/

import { getToolDefinition, type ToolDefinition } from './toolTypes.js';
import { isJiraVirtualReadTool, isJiraVirtualToolName } from './mcp/jiraToolRegistry.js';

export type ToolPermissionClass = 'read_only' | 'write' | 'terminal' | 'network' | 'dangerous' | 'mcp';

const READ_ONLY_TOOLS = new Set([
	'read_file',
	'list_files',
	'list_workspace',
	'search_files',
	'grep',
	'get_symbols',
	'get_active_file',
	'get_selected_code',
	'create_checkpoint',
]);

const WRITE_TOOLS = new Set(['propose_file_edit', 'apply_file_edit', 'restore_checkpoint']);

const TERMINAL_TOOLS = new Set(['run_terminal_command']);

const NETWORK_TOOLS = new Set(['fetch_url', 'http_request']);

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

export function requiresUserApproval(
	name: string,
	opts: { requireApprovalForEdits: boolean; autoRunReadOnlyTools: boolean; requireApprovalForMcpTools?: boolean },
	def?: ToolDefinition,
	isMcp = false,
): boolean {
	if (isJiraVirtualReadTool(name)) {
		return !opts.autoRunReadOnlyTools;
	}
	if (isJiraVirtualToolName(name) || isMcp) {
		return opts.requireApprovalForMcpTools !== false;
	}
	const permission = classifyTool(name, def, isMcp);
	if (permission === 'read_only') {
		return !opts.autoRunReadOnlyTools && !!def?.requiresApproval;
	}
	if (permission === 'write' || permission === 'dangerous') {
		return opts.requireApprovalForEdits || !!def?.requiresApproval;
	}
	// terminal, network
	return true;
}

export function canAutoExecute(
	name: string,
	opts: { autoRunReadOnlyTools: boolean; requireApprovalForMcpTools?: boolean },
	def?: ToolDefinition,
	isMcp = false,
): boolean {
	if (isJiraVirtualReadTool(name)) {
		return opts.autoRunReadOnlyTools;
	}
	if (isJiraVirtualToolName(name) || isMcp) {
		return false;
	}
	const permission = classifyTool(name, def ?? getToolDefinition(name));
	if (permission === 'read_only') {
		return opts.autoRunReadOnlyTools;
	}
	return false;
}
