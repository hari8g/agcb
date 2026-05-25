/*--------------------------------------------------------------------------------------
 *  Agentic AI — intent-to-tool routing policy
 *--------------------------------------------------------------------------------------*/

import type { ParsedToolCall } from '../toolCallParser.js';
import { routeEditToolCall, type EditToolRouteContext } from '../agentEditPipeline.js';
import type { StructuredIntent } from './structuredIntent.js';

export type ToolRouteAction = 'allow' | 'block' | 'reroute';

export interface ToolRouteDecision {
	action: ToolRouteAction;
	toolCall: ParsedToolCall;
	reason?: string;
	/** Suggested alternative tool name */
	alternative?: string;
}

const READ_ONLY_TOOLS = new Set([
	'read_file', 'read_lint_errors', 'list_files', 'list_workspace',
	'search_files', 'grep', 'get_symbols', 'get_active_file', 'get_selected_code',
	'create_checkpoint',
]);

const WRITE_TOOLS = new Set(['write_file', 'propose_file_edit', 'apply_file_edit', 'restore_checkpoint']);

export function isReadOnlyTool(name: string): boolean {
	return READ_ONLY_TOOLS.has(name);
}

export function isWriteTool(name: string): boolean {
	return WRITE_TOOLS.has(name);
}

export function isTerminalTool(name: string): boolean {
	return name === 'run_terminal_command';
}

/** Policy routing before tool execution (wraps agentEditPipeline for edits). */
export function routeToolForIntent(
	toolCall: ParsedToolCall,
	intent: StructuredIntent,
	ctx: EditToolRouteContext,
	opts?: { executePhaseGated?: boolean; fileExists?: (p: string) => boolean },
): ToolRouteDecision {
	const name = toolCall.name;
	const gated = opts?.executePhaseGated === true;

	if (intent.intent === 'answer_question' && !isReadOnlyTool(name)) {
		return {
			action: 'block',
			toolCall,
			reason: 'answer_question intent — read/search tools only until user asks for edits',
		};
	}

	if (gated && isWriteTool(name)) {
		return {
			action: 'block',
			toolCall,
			reason: 'Execute phase gated — wait for plan approval',
		};
	}

	if (isTerminalTool(name)) {
		return {
			action: 'allow',
			toolCall,
			reason: 'Terminal commands require user approval at runtime',
		};
	}

	if (isWriteTool(name) || name === 'write_file' || name === 'propose_file_edit') {
		const path = String(toolCall.arguments.path ?? '').trim();
		const exists = path && opts?.fileExists?.(path);
		const routed = routeEditToolCall(toolCall, ctx);
		if (routed.routed) {
			return { action: 'reroute', toolCall: routed.toolCall, reason: routed.routeReason };
		}
		if (!exists && name === 'propose_file_edit') {
			return {
				action: 'reroute',
				toolCall: { ...toolCall, name: 'write_file', arguments: { ...toolCall.arguments } },
				reason: 'Missing file — use write_file for new files',
				alternative: 'write_file',
			};
		}
		if (exists && intent.intent === 'create_file' && name === 'propose_file_edit') {
			return {
				action: 'reroute',
				toolCall: { ...toolCall, name: 'write_file' },
				reason: 'create_file intent on new path',
				alternative: 'write_file',
			};
		}
	}

	if (intent.scope === 'repo' && isWriteTool(name) && intent.complexity === 'complex') {
		// suggest checkpoint — informational only
		return { action: 'allow', toolCall, reason: 'Multi-file change — checkpoint recommended' };
	}

	return { action: 'allow', toolCall };
}

export function buildIntentToolRouterPromptBlock(intent: StructuredIntent): string {
	const lines = [
		'<intent_tool_router>',
		'Routing rules for this run:',
	];
	switch (intent.intent) {
		case 'answer_question':
			lines.push('- Read/search only: read_file, grep, search_files, list_files, get_symbols.');
			break;
		case 'create_file':
			lines.push('- New files: write_file with full content. Do not use propose_file_edit on missing paths.');
			break;
		case 'edit_file':
		case 'fix_bug':
		case 'add_feature':
			lines.push('- Small edits: propose_file_edit with verbatim ORIGINAL lines.');
			lines.push('- Full rewrites: write_file is acceptable.');
			break;
		case 'refactor':
			lines.push('- Multi-file: create_checkpoint before broad edits; propose_file_edit per file.');
			break;
		case 'run_command':
			lines.push('- Terminal: run_terminal_command only when necessary; commands require approval.');
			break;
		default:
			lines.push('- Use the minimal tool set for the classified intent.');
	}
	if (intent.scope === 'repo') {
		lines.push('- Repo-level scope: prefer checkpoint + batched edits.');
	}
	lines.push('</intent_tool_router>');
	return lines.join('\n');
}
