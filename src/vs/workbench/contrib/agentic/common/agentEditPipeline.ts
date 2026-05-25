/*--------------------------------------------------------------------------------------
 *  Agentic AI — intent-based tool routing + edit coercion before execution
 *--------------------------------------------------------------------------------------*/

import type { ParsedToolCall } from './toolCallParser.js';
import type { AgentIntent, AgentIntentClassification } from './agentIntentClassifier.js';
import { classifyAgentIntent } from './agentIntentClassifier.js';
import {
	coerceBlocksForNewFile,
	extractCreateFileContent,
	normalizeSearchReplaceBlocks,
	validateSearchReplaceBlocks,
} from './editValidator.js';
import { tryApplyBlocksToFileContent } from './editApplyHeuristic.js';
import { resolveTargetFileFromUserMessage } from './agentRunCompletion.js';
import { coerceSearchReplaceBlocks, coerceWriteFileContent, normalizeWriteToolArguments } from './writeFileContent.js';

export interface EditToolRouteResult {
	toolCall: ParsedToolCall;
	/** Tool name changed (e.g. propose_file_edit → write_file) */
	routed: boolean;
	routeReason?: string;
}

export interface EditToolRouteContext {
	workspaceRoot: string;
	userMessage: string;
	pathExists: (relPath: string) => boolean;
	/** Optional: current file body for fuzzy recovery when blocks are malformed */
	readFileContent?: (relPath: string) => string | undefined;
}

/** Preferred edit tool for intent + file state (prompt guidance). */
export function preferredEditToolForIntent(
	intent: AgentIntent,
	fileExists: boolean,
): 'write_file' | 'propose_file_edit' {
	if (!fileExists) {
		return 'write_file';
	}
	if (intent === 'create_file') {
		return 'write_file';
	}
	return 'propose_file_edit';
}

export function buildToolRouterSystemBlock(classification: AgentIntentClassification): string {
	const target = classification.targetPaths[0] ?? resolveTargetFileFromUserMessage('');
	const lines = [
		'<tool_router>',
		'Before calling edit tools, follow this routing:',
		'- **New file** (path does not exist): use `write_file` with full `content` — never `propose_file_edit` only.',
		'- **Existing file** (small change): use `propose_file_edit` with verbatim ORIGINAL lines from read_file.',
		'- **If search/replace keeps failing**: use `write_file` with the full file content after one `read_file`.',
		'- **Existing file** (replace entire file): `write_file` is acceptable.',
		'- Never paste read_file errors into ORIGINAL. Never call propose_file_edit with empty searchReplaceBlocks.',
	];
	switch (classification.intent) {
		case 'create_file':
			lines.push('- Intent is **create_file**: use `write_file` only; do not retry propose_file_edit after success.');
			lines.push('- **Fast path**: write files immediately (package.json, entry points, README). Skip long plans and extra reads unless a path is unknown.');
			break;
		case 'edit_file':
		case 'improve_code':
		case 'fix_bug':
			lines.push('- Intent is **edit existing code**: read_file once, then propose_file_edit (or write_file for full rewrites).');
			break;
		case 'refactor':
			lines.push('- Intent is **refactor**: read affected files, then propose_file_edit per file (small blocks).');
			break;
		default:
			break;
	}
	if (target) {
		lines.push(`Primary target path: ${target}`);
	}
	lines.push('</tool_router>');
	return lines.join('\n');
}

function extractWriteContentFromToolArgs(toolCall: ParsedToolCall): string | undefined {
	const blocksRaw = coerceSearchReplaceBlocks(
		toolCall.arguments.searchReplaceBlocks
		?? toolCall.arguments.content
		?? toolCall.arguments.newContent
		?? toolCall.arguments.code
		?? '',
	);
	if (!blocksRaw.trim()) {
		return undefined;
	}
	const normalized = normalizeSearchReplaceBlocks(blocksRaw);
	const coerced = coerceBlocksForNewFile(normalized) ?? normalized;
	const fromCreate = extractCreateFileContent(coerced);
	if (fromCreate !== undefined && fromCreate.trim()) {
		return fromCreate;
	}
	const v = validateSearchReplaceBlocks(coerced, { allowCreate: true });
	if (v.ok) {
		const again = extractCreateFileContent(coerced);
		if (again?.trim()) {
			return again;
		}
	}
	if (!blocksRaw.includes('<<<<<<<') && blocksRaw.trim().length > 0) {
		return blocksRaw.trim();
	}
	return undefined;
}

/**
 * Rewrite propose_file_edit → write_file when creating a new file, or normalize blocks before validation.
 */
export function routeEditToolCall(
	toolCall: ParsedToolCall,
	ctx: EditToolRouteContext,
): EditToolRouteResult {
	toolCall = {
		name: toolCall.name,
		arguments: normalizeWriteToolArguments(toolCall.arguments),
	};
	const intent = classifyAgentIntent(ctx.userMessage);
	const targetPath = String(toolCall.arguments.path ?? '').trim();

	if (toolCall.name === 'write_file') {
		const content = coerceWriteFileContent(toolCall.arguments.content);
		if (!content.trim()) {
			const fromBlocks = extractWriteContentFromToolArgs(toolCall);
			if (fromBlocks) {
				return {
					toolCall: {
						name: 'write_file',
						arguments: { path: targetPath, content: fromBlocks },
					},
					routed: true,
					routeReason: 'Filled write_file.content from edit blocks',
				};
			}
		}
		return { toolCall, routed: false };
	}

	if (toolCall.name !== 'propose_file_edit') {
		return { toolCall, routed: false };
	}

	const fileExists = ctx.pathExists(targetPath);
	const blocksRaw = coerceSearchReplaceBlocks(
		toolCall.arguments.searchReplaceBlocks
		?? toolCall.arguments.content
		?? toolCall.arguments.diff
		?? toolCall.arguments.code
		?? '',
	);

	// Missing file → write_file
	if (!fileExists) {
		let content = extractWriteContentFromToolArgs(toolCall);
		if (!content && blocksRaw.trim()) {
			const normalized = normalizeSearchReplaceBlocks(blocksRaw);
			const coerced = coerceBlocksForNewFile(normalized);
			if (coerced) {
				content = extractCreateFileContent(coerced);
			}
		}
		if (content) {
			return {
				toolCall: {
					name: 'write_file',
					arguments: { path: targetPath, content },
				},
				routed: true,
				routeReason: 'Routed propose_file_edit → write_file (new file)',
			};
		}
	}

	// Normalize blocks in place
	let blocks = normalizeSearchReplaceBlocks(blocksRaw);
	if (!fileExists) {
		const coerced = coerceBlocksForNewFile(blocks);
		if (coerced) {
			blocks = coerced;
		}
	}

	// Full-file replace on existing file → write_file when single create-style block
	if (fileExists && intent.intent === 'create_file') {
		const content = extractCreateFileContent(blocks);
		if (content && validateSearchReplaceBlocks(blocks, { allowCreate: true }).ok) {
			return {
				toolCall: {
					name: 'write_file',
					arguments: { path: targetPath, content },
				},
				routed: true,
				routeReason: 'create_file intent on existing path — using write_file',
			};
		}
	}

	// Large single-block rewrite (empty ORIGINAL) on existing file
	if (fileExists) {
		const createContent = extractCreateFileContent(blocks);
		if (createContent !== undefined && validateSearchReplaceBlocks(blocks, { allowCreate: true }).ok) {
			const lineCount = createContent.split('\n').length;
			if (lineCount > 12) {
				return {
					toolCall: {
						name: 'write_file',
						arguments: { path: targetPath, content: createContent },
					},
					routed: true,
					routeReason: 'Full-file content — routed to write_file',
				};
			}
		}
	}

	if (blocks !== blocksRaw) {
		return {
			toolCall: {
				name: 'propose_file_edit',
				arguments: { path: targetPath, searchReplaceBlocks: blocks },
			},
			routed: true,
			routeReason: 'Normalized search/replace blocks',
		};
	}

	return {
		toolCall: {
			name: 'propose_file_edit',
			arguments: { path: targetPath, searchReplaceBlocks: blocks },
		},
		routed: blocks !== blocksRaw,
	};
}

export interface PreparedProposeFileEdit {
	path: string;
	blocks: string;
	fileExists: boolean;
	validation: ReturnType<typeof validateSearchReplaceBlocks>;
	/** When set, agent loop should execute write_file instead of propose (not a format failure). */
	routedWrite?: { path: string; content: string };
}

/** Normalize path, coerce blocks, validate — shared by agent loop. */
export function prepareProposeFileEdit(
	toolCall: ParsedToolCall,
	ctx: EditToolRouteContext,
): PreparedProposeFileEdit {
	const routed = routeEditToolCall(toolCall, ctx);
	if (routed.toolCall.name === 'write_file') {
		const content = coerceWriteFileContent(routed.toolCall.arguments.content);
		return {
			path: String(routed.toolCall.arguments.path ?? ''),
			blocks: '',
			fileExists: ctx.pathExists(String(routed.toolCall.arguments.path ?? '')),
			validation: { ok: true, blockCount: 0 },
			routedWrite: content.trim()
				? { path: String(routed.toolCall.arguments.path ?? ''), content }
				: undefined,
		};
	}
	const targetPath = String(routed.toolCall.arguments.path ?? '').trim();
	const fileExists = ctx.pathExists(targetPath);
	let blocks = coerceSearchReplaceBlocks(routed.toolCall.arguments.searchReplaceBlocks ?? '');
	if (!fileExists) {
		const coerced = coerceBlocksForNewFile(blocks);
		if (coerced) {
			blocks = coerced;
		}
	}
	let validation = validateSearchReplaceBlocks(blocks, { allowCreate: !fileExists });
	if (!validation.ok && fileExists) {
		validation = validateSearchReplaceBlocks(blocks, { allowCreate: false, lenient: true });
	}
	if (!validation.ok && fileExists && ctx.readFileContent) {
		const fileBody = ctx.readFileContent(targetPath);
		if (fileBody !== undefined) {
			const applied = tryApplyBlocksToFileContent(fileBody, blocks);
			if (applied.ok) {
				return {
					path: targetPath,
					blocks,
					fileExists: true,
					validation: { ok: true, blockCount: 1 },
					routedWrite: { path: targetPath, content: applied.content },
				};
			}
		}
	}
	return { path: targetPath, blocks, fileExists, validation };
}

/** Build write_file blocks for orchestrator hints when model should not use propose. */
export function buildWriteFileHint(path: string, content: string): string {
	return JSON.stringify({ tool_call: { name: 'write_file', arguments: { path, content } } }, null, 0);
}
