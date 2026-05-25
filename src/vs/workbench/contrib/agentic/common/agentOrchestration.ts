/*--------------------------------------------------------------------------------------
 *  Agentic AI — progressive orchestration (detect stalls, nudge, bootstrap tools)
 *--------------------------------------------------------------------------------------*/

import type { CodebaseContext } from './contextTypes.js';
import type { LLMMessage } from './llmMessageTypes.js';
import { extractAllToolCalls, type ParsedToolCall } from './toolCallParser.js';
import { expectsDeliverableEdits } from './workflowRunQuality.js';

const PLAN_MARKERS_RE = /\b(plan:|\*\*plan\*\*|systematic approach|following steps|i will (begin|take|start|first|now)|i'll (begin|start|take|review)|let me (begin|start by|review)|next,? i will|to (do|complete) this,? i will)\b/i;
const DEFERRED_ACTION_RE = /\b(for now,? i('|’)ll|i will (review|examine|look|read|check)|after (examining|reviewing|reading)|suggest .+ after|concrete improvements after|i need to know what features)\b/i;
const NUMBERED_PLAN_RE = /^\s*\d+\.\s+/m;
const ASK_USER_RE = /\b(let me know|please confirm|would you like|shall i|do you want me to|what (features|would you like)|need to know what)\b/i;
const CODING_TASK_RE = /\b(file|code|fix|bug|implement|refactor|optimize|improve|enhance|add|remove|update|create|module|integrat|realtime|real-time|\.py|\.js|\.ts|page\.|function|class|component|workspace|project|orchestrat|fleet|api)\b/i;
const SUBSTANTIVE_REPLY_RE = /\b(review|examine|improve|optimize|implement|fix|suggest|analyze|approach|steps|here'?s how|structured as follows|let's proceed|i will create|i'll create)\b/i;
const CREATE_WITHOUT_TOOLS_RE = /\b(i will create|i'll create|let's proceed|proceed by (creating|building)|should be created|will be structured|new module|new file|stub\/mock implementation)\b/i;
const BULLET_OUTLINE_RE = /(?:^|\n)\s*[-*]\s+\w/m;

export const DEFAULT_ORCHESTRATOR_MAX_NUDGES = 5;
export const DEFAULT_ORCHESTRATOR_BOOTSTRAP_TURNS = 4;

/** User message looks like a real coding task (not small talk). */
export function isActionableAgentTask(userMessage: string): boolean {
	const t = userMessage.trim();
	if (t.length < 8) {
		return false;
	}
	if (/^(thanks|thank you|ok|okay|yes|no|hi|hello|hey)\b[!.?\s]*$/i.test(t)) {
		return false;
	}
	return true;
}

export function isCodingTask(userMessage: string): boolean {
	return isActionableAgentTask(userMessage) && CODING_TASK_RE.test(userMessage);
}

/** Model replied with intent to act later but no tool_call blocks yet. */
export function detectPlanOnlyStall(assistantText: string, userMessage: string): boolean {
	if (!isActionableAgentTask(userMessage)) {
		return false;
	}
	const text = assistantText.trim();
	if (text.length < 20) {
		return false;
	}
	if (extractAllToolCalls(text).length > 0) {
		return false;
	}
	if (ASK_USER_RE.test(text) && !PLAN_MARKERS_RE.test(text) && !DEFERRED_ACTION_RE.test(text) && !SUBSTANTIVE_REPLY_RE.test(text)) {
		return false;
	}
	if (PLAN_MARKERS_RE.test(text) || DEFERRED_ACTION_RE.test(text) || CREATE_WITHOUT_TOOLS_RE.test(text)) {
		return true;
	}
	if (NUMBERED_PLAN_RE.test(text) && SUBSTANTIVE_REPLY_RE.test(text)) {
		return true;
	}
	if (BULLET_OUTLINE_RE.test(text) && CREATE_WITHOUT_TOOLS_RE.test(text)) {
		return true;
	}
	return false;
}

/** Any actionable turn that ended without tools (empty, plan-only, or prose-only). */
export function detectNonToolProgress(assistantText: string, userMessage: string): boolean {
	if (!isActionableAgentTask(userMessage)) {
		return false;
	}
	if (extractAllToolCalls(assistantText).length > 0) {
		return false;
	}
	const text = assistantText.trim();
	if (text.length < 8) {
		return true;
	}
	if (detectPlanOnlyStall(text, userMessage)) {
		return true;
	}
	if (isActionableAgentTask(userMessage) && text.length >= 24 && SUBSTANTIVE_REPLY_RE.test(text)) {
		return true;
	}
	if (isActionableAgentTask(userMessage) && CREATE_WITHOUT_TOOLS_RE.test(text)) {
		return true;
	}
	if (isActionableAgentTask(userMessage) && BULLET_OUTLINE_RE.test(text) && text.length >= 80) {
		return true;
	}
	return false;
}

/** Actionable coding/build tasks must not end the run without at least one tool. */
export function mustNotCompleteWithoutTools(userMessage: string, assistantText: string): boolean {
	if (!isActionableAgentTask(userMessage)) {
		return false;
	}
	if (extractAllToolCalls(assistantText).length > 0) {
		return false;
	}
	if (/\b(create|add|implement|build|fix|refactor|module|integrat)\b/i.test(userMessage)) {
		return true;
	}
	return isCodingTask(userMessage) || detectNonToolProgress(assistantText, userMessage);
}

export function buildPlanContinuationNudge(assistantText: string, userMessage: string): string {
	return buildEscalatingNudge(0, assistantText, userMessage);
}

export function isJiraExecutionPrompt(userMessage: string): boolean {
	return /\[JIRA EXECUTION\]/i.test(userMessage);
}

/** JIRA runs fail only after real stall — not after a single read_file + brief prose. */
export function shouldFailJiraExecution(state: {
	consecutiveNoToolTurns: number;
	toolsExecutedInRun: number;
	successfulFileEditsInRun: number;
}): boolean {
	if (state.successfulFileEditsInRun > 0) {
		return false;
	}
	if (state.toolsExecutedInRun === 0 && state.consecutiveNoToolTurns >= 3) {
		return true;
	}
	return state.consecutiveNoToolTurns >= 8;
}

export function buildEscalatingNudge(nudgeIndex: number, assistantText: string, userMessage: string): string {
	const firstStep = assistantText.match(/^\s*\d+\.\s+(.+)$/m)?.[1]?.trim();
	const fileMatch = userMessage.match(/\b([\w./-]+\.(?:js|ts|tsx|jsx|vue|py|css|html))\b/i);
	const fileHint = fileMatch?.[1];
	const createTask = /\b(create|add|new module)\b/i.test(userMessage);
	const jira = isJiraExecutionPrompt(userMessage);
	const readHint = jira
		? 'Use list_workspace, then grep/search_files for seller|onboard|admin, read_file on matches, then write_file'
		: fileHint
			? `Use read_file on "${fileHint}" (and list_workspace if needed)`
			: createTask
				? 'Use list_workspace, list_files in the target package, then write_file (or propose_file_edit with empty ORIGINAL) to CREATE the new module file'
				: 'Use list_workspace or read_file on the relevant path';
	const hint = firstStep
		? `Start now: ${firstStep.slice(0, 100)}`
		: `Start now: ${readHint}`;

	if (nudgeIndex <= 1) {
		return [
			'[Orchestrator] Your last reply described future work but did not call any tools.',
			`${hint}.`,
			'This turn you MUST include at least one ```json tool_call block. No more planning prose.',
		].join(' ');
	}
	if (nudgeIndex <= 3) {
		return [
			'[Orchestrator — strict] STOP writing plans. The user needs execution, not description.',
			`${hint}.`,
			'Reply with ONLY a ```json fenced tool_call block (you may add one short line before it).',
		].join(' ');
	}
	return [
		'[Orchestrator — final] You MUST call a tool now or the run will execute one for you.',
		`Required first action: ${readHint}.`,
		'Output ```json with tool_call immediately.',
	].join(' ');
}

export function planStallUserMessage(assistantText: string, _userMessage: string): string {
	if (ASK_USER_RE.test(assistantText) && !DEFERRED_ACTION_RE.test(assistantText)) {
		return 'Waiting for your reply before continuing.';
	}
	return 'Agent finished without running tools — orchestrator will retry or use Retry.';
}

export function shouldNudgePlanContinuation(opts: {
	assistantText: string;
	userMessage: string;
	nudgesUsed: number;
	maxNudges?: number;
	bootstrapReadDelivered?: boolean;
	/** JIRA execution keeps nudging after read_file until write_file succeeds. */
	jiraExecution?: boolean;
}): boolean {
	const max = opts.maxNudges ?? DEFAULT_ORCHESTRATOR_MAX_NUDGES;
	if (opts.nudgesUsed >= max) {
		return false;
	}
	if (opts.bootstrapReadDelivered && !opts.jiraExecution) {
		return false;
	}
	return detectNonToolProgress(opts.assistantText, opts.userMessage);
}

/** True when read_file returned real file contents (not error placeholder). */
export function isSuccessfulReadFileResult(content: string): boolean {
	const body = content.replace(/^\[tool_result:\w+\]\s*/i, '').trim();
	return body.length > 40 && !body.includes('[object Object]') && !/file not found/i.test(body);
}

export function markReadFileDelivered(loopProgress: { bootstrapReadDelivered: boolean }, content: string): void {
	if (isSuccessfulReadFileResult(content)) {
		loopProgress.bootstrapReadDelivered = true;
	}
}

/** After bootstrap read_file, demand write_file / propose_file_edit once. */
export function buildPostReadEditNudge(filePath: string): string {
	const path = filePath.trim() || 'the target file';
	return [
		`[Orchestrator] read_file succeeded for "${path}".`,
		'Call write_file or propose_file_edit NOW with the actual changes — no more planning or summaries.',
		'Use the file contents from the last read_file tool result.',
	].join(' ');
}

export function shouldBootstrapProgress(opts: {
	assistantText: string;
	userMessage: string;
	nudgesUsed: number;
	maxNudges?: number;
	bootstrapUsed: boolean;
}): boolean {
	if (opts.bootstrapUsed || !isActionableAgentTask(opts.userMessage)) {
		return false;
	}
	if (extractAllToolCalls(opts.assistantText).length > 0) {
		return false;
	}
	const max = opts.maxNudges ?? DEFAULT_ORCHESTRATOR_MAX_NUDGES;
	if (opts.nudgesUsed >= max && detectNonToolProgress(opts.assistantText, opts.userMessage)) {
		return true;
	}
	if (opts.assistantText.trim().length < 8 && isCodingTask(opts.userMessage)) {
		return true;
	}
	return false;
}

function pathBasename(p: string): string {
	return p.split(/[/\\]/).pop() ?? p;
}

/** Prefer workspace-relative paths for read_file / write_file. */
export function relativizeWorkspacePath(filePath: string, workspaceRoot?: string): string {
	if (!filePath?.trim()) {
		return filePath;
	}
	if (!workspaceRoot?.trim()) {
		return filePath;
	}
	const normRoot = workspaceRoot.replace(/\\/g, '/').replace(/\/$/, '');
	const normPath = filePath.replace(/\\/g, '/');
	if (normPath === normRoot) {
		return '.';
	}
	if (normPath.startsWith(normRoot + '/')) {
		return normPath.slice(normRoot.length + 1);
	}
	return filePath;
}

type TaskFilePathContext = Pick<CodebaseContext, 'activeFilePath' | 'openTabs' | 'codeGraph'> & {
	workspaceFolderUris?: string[];
};

/** Resolve @model.py → models.py style typos using workspace context. */
export function resolveTaskFilePath(
	userMessage: string,
	ctx?: TaskFilePathContext,
): string | undefined {
	const workspaceRoot = ctx?.workspaceFolderUris?.[0];
	if (ctx?.activeFilePath) {
		return relativizeWorkspacePath(ctx.activeFilePath, workspaceRoot);
	}
	const mention = userMessage.match(/@([\w./\\-]+\.[\w]+)/)?.[1];
	const fileMatch = userMessage.match(/\b([\w./-]+\.(?:js|ts|tsx|jsx|vue|py|css|html|json|md))\b/i);
	const candidate = mention ?? fileMatch?.[1];
	if (!candidate) {
		return undefined;
	}
	const base = pathBasename(candidate);
	const alternates = new Set<string>([candidate, base]);
	if (/^model\.py$/i.test(base)) {
		alternates.add('models.py');
	}
	if (/\.py$/i.test(base) && !/s\.py$/i.test(base)) {
		alternates.add(base.replace(/\.py$/i, 's.py'));
	}
	const pool: string[] = [];
	if (ctx?.openTabs) {
		for (const t of ctx.openTabs) {
			pool.push(t.path);
		}
	}
	for (const m of ctx?.codeGraph?.semanticMatches ?? []) {
		pool.push(m.path);
	}
	for (const alt of alternates) {
		const hit = pool.find(p => pathBasename(p) === alt || p.endsWith(`/${alt}`) || p.endsWith(`\\${alt}`));
		if (hit) {
			return hit;
		}
	}
	return candidate;
}

/** Run a read-only tool automatically so the loop always advances. */
export function pickBootstrapTool(
	userMessage: string,
	ctx?: TaskFilePathContext,
): ParsedToolCall | null {
	if (!isActionableAgentTask(userMessage)) {
		return null;
	}
	if (isJiraExecutionPrompt(userMessage)) {
		if (/\bseller\b|\bonboard/i.test(userMessage)) {
			return { name: 'grep', arguments: { pattern: 'seller|onboard|vendor', path: '.' } };
		}
		return { name: 'list_workspace', arguments: {} };
	}
	const resolved = resolveTaskFilePath(userMessage, ctx);
	if (resolved) {
		return { name: 'read_file', arguments: { path: resolved } };
	}
	const dirMatch = userMessage.match(/\b((?:[\w-]+\/)+[\w-]+)\b/);
	if (dirMatch?.[1] && !dirMatch[1].includes(' ')) {
		return { name: 'list_files', arguments: { path: dirMatch[1] } };
	}
	if (/\b(create|module|integrat|orchestrat)\b/i.test(userMessage)) {
		return { name: 'list_workspace', arguments: {} };
	}
	if (/\b(workspace|project|codebase|repo)\b/i.test(userMessage)) {
		return { name: 'list_workspace', arguments: {} };
	}
	return { name: 'list_files', arguments: { path: '.' } };
}

export function bootstrapActivityLine(toolName: string): string {
	return `Orchestrator advancing workflow — running ${toolName.replace(/_/g, ' ')}…`;
}

/** User asked for code changes but the agent only read/explored. */
export function buildDeliveryIncompleteNudge(userMessage: string): string {
	const fileHint = resolveTaskFilePath(userMessage) ?? 'the target file from the user request';
	return [
		'[Orchestrator] This task requires file changes. You explored the repo but did not call write_file or propose_file_edit.',
		`Next: for new files use write_file; for existing files use propose_file_edit with valid Void blocks.`,
		`Target: "${fileHint}". Do not list_workspace or re-read the same file repeatedly.`,
	].join(' ');
}

export function mustNotCompleteWithoutEdits(
	userMessage: string,
	assistantText: string,
	opts?: { successfulFileEditsInRun?: number },
): boolean {
	if (!expectsDeliverableEdits(userMessage)) {
		return false;
	}
	if ((opts?.successfulFileEditsInRun ?? 0) > 0) {
		return false;
	}
	if (extractAllToolCalls(assistantText).length > 0) {
		return false;
	}
	const text = assistantText.trim();
	return text.length >= 12;
}

export interface EditFailureNudgeContext {
	targetPath?: string;
	fileHead?: string;
	attemptCount?: number;
}

/** After empty/invalid propose_file_edit blocks — teach correct Void format. */
export function buildEditFailureNudge(
	quality: {
		emptyBlockEditAttempts: number;
		failedEditAttempts: number;
		blockers: string[];
	},
	ctx?: EditFailureNudgeContext,
): string {
	const lines = [
		'[Orchestrator] Your propose_file_edit calls failed because searchReplaceBlocks was empty or invalid.',
		'You MUST use Void search/replace blocks exactly:',
		'',
		'<<<<<<< ORIGINAL',
		'<exact lines from the file>',
		'=======',
		'<replacement lines>',
		'>>>>>>> UPDATED',
		'',
		'For NEW files: use write_file with full content, or propose_file_edit with empty ORIGINAL and full content after =======.',
		'For EXISTING files: read_file first, copy exact ORIGINAL lines, then propose_file_edit.',
		'Do NOT claim files changed until tool results confirm success.',
	];
	if (ctx?.targetPath) {
		lines.push(`Target file: ${ctx.targetPath}`);
	}
	if (quality.emptyBlockEditAttempts >= 2) {
		lines.push('Stop retrying the same malformed block. Read the file again and copy lines verbatim into ORIGINAL.');
	}
	if ((ctx?.attemptCount ?? 0) >= 4) {
		lines.push('If stuck: make ONE small block (3–15 lines) changing only what you need — not the whole file.');
	}
	if (quality.blockers.length) {
		lines.push(`Issues: ${quality.blockers.join('; ')}`);
	}
	if (ctx?.fileHead) {
		const sample = ctx.fileHead.split('\n').slice(0, 10).join('\n');
		lines.push(
			'',
			'Example using the START of the file you already read (copy exact text for ORIGINAL):',
			'',
			'<<<<<<< ORIGINAL',
			sample,
			'=======',
			sample,
			'>>>>>>> UPDATED',
		);
	}
	return lines.join('\n');
}

/** Last successful read_file content in the loop (for edit coaching). */
export function findLastReadFileInMessages(
	messages: LLMMessage[],
	targetPath?: string,
): { path: string; content: string } | undefined {
	const queue: string[] = [];
	const reads: { path: string; content: string }[] = [];
	for (const m of messages) {
		if (m.role === 'assistant') {
			for (const tc of extractAllToolCalls(m.content)) {
				if (tc.name === 'read_file' && tc.arguments.path) {
					queue.push(String(tc.arguments.path));
				}
			}
		} else if (m.role === 'tool' && m.name === 'read_file' && queue.length) {
			const path = queue.shift()!;
			if (!m.content.startsWith('Error:')) {
				reads.push({ path, content: m.content });
			}
		}
	}
	for (let i = reads.length - 1; i >= 0; i--) {
		if (!targetPath || pathsMatch(reads[i].path, targetPath)) {
			return reads[i];
		}
	}
	return reads.length ? reads[reads.length - 1] : undefined;
}

function pathsMatch(a: string, b: string): boolean {
	const na = pathBasename(a).toLowerCase();
	const nb = pathBasename(b).toLowerCase();
	return na === nb || a.endsWith(b) || b.endsWith(a);
}
