/*--------------------------------------------------------------------------------------
 *  Agentic AI — tool registry + execution (electron-main)
 *--------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { getToolDefinition } from '../../common/toolTypes.js';
import { validateToolArgs, stringifyToolResult } from '../../common/toolValidation.js';
import { classifyTool } from '../../common/toolPermission.js';
import { agenticLog } from '../../common/agenticObservability.js';
import { readFileTool, listFilesTool, searchFilesTool, writeFileTool } from './fileTools.js';
import { grepTool } from './searchTools.js';
import { buildEditPreview } from './editTools.js';
import { runTerminalCommandTool } from './terminalTools.js';
import { checkTerminalCommandSafety } from '../runtime/terminalSafety.js';
import { createCheckpoint, restoreCheckpoint } from '../checkpoints/checkpointService.js';
import { extractSymbolsLexical } from '../../common/codeIntelligenceTypes.js';
import type { SerializableMcpTool } from '../../common/mcp/agenticMcpTypes.js';
import { isAgenticMcpTool, executeMcpAgenticTool } from '../mcp/executeMcpTool.js';
import { executeJiraVirtualTool, isJiraVirtualToolName } from '../mcp/jiraVirtualTools.js';
import { readLintErrorsViaRenderer } from '../rendererToolsAccess.js';
import { coerceSearchReplaceBlocks, coerceWriteFileContent } from '../../common/writeFileContent.js';

export interface ToolExecutionContext {
	workspaceRoot: string;
	runId: string;
	mcpTools?: SerializableMcpTool[];
	atlassianEnv?: Record<string, string | undefined>;
}

export async function executeAnyAgenticTool(
	ctx: ToolExecutionContext,
	name: string,
	args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
	if (isJiraVirtualToolName(name)) {
		return executeJiraVirtualTool(name, args, ctx.mcpTools, ctx.atlassianEnv, ctx.runId);
	}
	// Built-in file/terminal tools must win over MCP tools with the same name (MCP read_file often returns garbage).
	if (getToolDefinition(name)) {
		return executeAgenticTool(ctx, name, args);
	}
	if (isAgenticMcpTool(name, ctx.mcpTools)) {
		return executeMcpAgenticTool(ctx.mcpTools, name, args, ctx.runId);
	}
	return executeAgenticTool(ctx, name, args);
}

export async function executeAgenticTool(
	ctx: ToolExecutionContext,
	name: string,
	args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
	const def = getToolDefinition(name);
	if (!def) {
		return { content: stringifyToolResult(name, `Unknown tool: ${name}`, true), isError: true };
	}

	const validation = validateToolArgs(def, args);
	if (!validation.valid) {
		return {
			content: stringifyToolResult(name, validation.errors.join('; '), true),
			isError: true,
		};
	}

	const started = Date.now();
	agenticLog({
		kind: 'tool_call_started',
		runId: ctx.runId,
		toolName: name,
		meta: { permission: classifyTool(name, def) },
	});

	try {
		const content = await runToolImpl(ctx.workspaceRoot, name, args);
		agenticLog({
			kind: 'tool_call_completed',
			runId: ctx.runId,
			toolName: name,
			durationMs: Date.now() - started,
		});
		return { content: stringifyToolResult(name, content), isError: false };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		agenticLog({ kind: 'error', runId: ctx.runId, toolName: name, message: msg });
		return { content: stringifyToolResult(name, msg, true), isError: true };
	}
}

async function runToolImpl(workspaceRoot: string, name: string, args: Record<string, unknown>): Promise<string> {
	switch (name) {
		case 'read_file':
			return readFileTool(workspaceRoot, String(args.path ?? ''));
		case 'list_files':
		case 'list_workspace':
			return listFilesTool(workspaceRoot, String(args.path ?? '.'));
		case 'search_files':
			return searchFilesTool(workspaceRoot, String(args.query ?? ''));
		case 'grep':
			return grepTool(workspaceRoot, String(args.pattern ?? ''));
		case 'get_symbols': {
			const filePath = path.isAbsolute(String(args.path ?? ''))
				? String(args.path)
				: path.join(workspaceRoot, String(args.path ?? ''));
			const content = await fs.promises.readFile(filePath, 'utf8').catch(() => '');
			const ext = path.extname(filePath).slice(1);
			const lang = ext === 'ts' || ext === 'tsx' ? 'typescript'
				: ext === 'js' ? 'javascript' : ext === 'py' ? 'python' : 'plaintext';
			const symbols = extractSymbolsLexical(content.slice(0, 512_000), lang);
			return JSON.stringify(symbols.slice(0, 100), null, 2);
		}
		case 'read_lint_errors':
			return readLintErrorsViaRenderer(String(args.path ?? ''));
		case 'write_file':
			return writeFileTool(workspaceRoot, String(args.path ?? ''), coerceWriteFileContent(args.content));
		case 'propose_file_edit': {
			const blocks = coerceSearchReplaceBlocks(args.searchReplaceBlocks);
			const preview = buildEditPreview(String(args.path ?? ''), blocks);
			return preview.previewSummary;
		}
		case 'apply_file_edit':
			return `Applied edit to ${args.path} (approval ${args.approvalId})`;
		case 'create_checkpoint': {
			const paths = Array.isArray(args.paths)
				? (args.paths as unknown[]).map(p => String(p ?? '')).filter(Boolean)
				: [];
			const { checkpointId, fileCount } = createCheckpoint(
				workspaceRoot,
				String(args.label ?? 'checkpoint'),
				paths,
			);
			return `Checkpoint created: ${checkpointId} (${fileCount} file${fileCount === 1 ? '' : 's'})`;
		}
		case 'restore_checkpoint': {
			const result = restoreCheckpoint(workspaceRoot, String(args.checkpointId ?? ''));
			return result.message;
		}
		case 'run_terminal_command': {
			const command = String(args.command ?? '');
			const safety = checkTerminalCommandSafety(command);
			if (!safety.allowed) {
				return JSON.stringify({ error: safety.reason, exitCode: 1, stdout: '', stderr: safety.reason ?? 'blocked' });
			}
			return JSON.stringify(await runTerminalCommandTool(workspaceRoot, command));
		}
		default:
			return `Unknown tool: ${name}`;
	}
}
