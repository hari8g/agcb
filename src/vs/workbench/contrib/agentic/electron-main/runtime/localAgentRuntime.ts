/*--------------------------------------------------------------------------------------
 *  Agentic AI — local agent runtime entry (delegates to agentLoop)
 *--------------------------------------------------------------------------------------*/

import type { AgentEvent } from '../../common/agenticTypes.js';
import type { RuntimeRequest } from '../../common/llmMessageTypes.js';
import { runAgentLoop, continueAfterApproval } from './agentLoop.js';

type EmitFn = (event: AgentEvent) => void;

const activeRuns = new Map<string, AbortController>();

export function abortLocalRun(requestId: string): void {
	activeRuns.get(requestId)?.abort();
	activeRuns.delete(requestId);
}

export async function runLocalAgent(
	requestId: string,
	request: RuntimeRequest,
	emit: EmitFn,
): Promise<void> {
	const ac = new AbortController();
	activeRuns.set(requestId, ac);

	const ts = () => Date.now();
	const ev = (type: AgentEvent['type'], payload: Record<string, unknown>) => {
		emit({ type, runId: request.runId, timestamp: ts(), payload });
	};

	const workspaceRoot = request.context.workspaceFolderUris[0] ?? process.cwd();

	try {
		ev('run_started', { threadId: request.threadId });
		ev('context_collected', { contextSummary: summarizeContext(request) });
		await runAgentLoop(requestId, request, workspaceRoot, ac, ev);
	} catch (e) {
		ev('run_failed', { message: e instanceof Error ? e.message : String(e) });
	} finally {
		activeRuns.delete(requestId);
	}
}

export async function resolveApprovalAndContinue(
	requestId: string,
	decision: 'approved' | 'rejected',
): Promise<void> {
	const ac = activeRuns.get(requestId) ?? new AbortController();
	if (!activeRuns.has(requestId)) {
		activeRuns.set(requestId, ac);
	}
	try {
		await continueAfterApproval(requestId, decision, ac);
	} finally {
		activeRuns.delete(requestId);
	}
}

function summarizeContext(request: RuntimeRequest): string {
	const c = request.context;
	return [
		c.workspaceFolderUris.length ? `${c.workspaceFolderUris.length} workspace folder(s)` : '',
		c.activeFilePath ? `active: ${c.activeFilePath}` : '',
		c.openTabs.length ? `${c.openTabs.length} open tab(s)` : '',
		c.codeGraph.semanticMatches.length ? `${c.codeGraph.semanticMatches.length} code match(es)` : '',
	].filter(Boolean).join(', ');
}
