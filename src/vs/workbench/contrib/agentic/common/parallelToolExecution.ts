/*--------------------------------------------------------------------------------------
 *  Agentic AI — parallel execution of independent read-only tools
 *--------------------------------------------------------------------------------------*/

import type { ParsedToolCall } from './toolCallParser.js';

/** Tools safe to run concurrently in one agent turn (no writes, no approval batching). */
export const PARALLEL_READ_TOOLS = new Set([
	'read_file',
	'read_lint_errors',
	'list_files',
	'list_workspace',
	'search_files',
	'grep',
	'get_symbols',
]);

export function isParallelReadTool(toolName: string): boolean {
	return PARALLEL_READ_TOOLS.has(toolName);
}

export function canExecuteToolsInParallel(
	toolCalls: ParsedToolCall[],
	opts: { parallelToolCallsEnabled: boolean },
): boolean {
	if (!opts.parallelToolCallsEnabled || toolCalls.length < 2) {
		return false;
	}
	return toolCalls.every(tc => isParallelReadTool(tc.name));
}

export function partitionToolCallsForExecution(toolCalls: ParsedToolCall[]): {
	parallel: ParsedToolCall[];
	sequential: ParsedToolCall[];
} {
	const parallel: ParsedToolCall[] = [];
	const sequential: ParsedToolCall[] = [];
	for (const tc of toolCalls) {
		if (isParallelReadTool(tc.name)) {
			parallel.push(tc);
		} else {
			sequential.push(tc);
		}
	}
	return { parallel, sequential };
}
