/*--------------------------------------------------------------------------------------
 *  Agentic AI — run metrics aggregation for dashboard
 *--------------------------------------------------------------------------------------*/

import type { ChatMessage } from './agenticTypes.js';
export type WorkflowCompletionKind = 'success' | 'partial' | 'failed' | 'stalled';

export type AgentRunMetricStatus = 'running' | 'completed' | 'failed' | 'stopped';

export interface AgentRunMetricRecord {
	runId: string;
	threadId: string;
	startedAt: number;
	endedAt?: number;
	durationMs?: number;
	status: AgentRunMetricStatus;
	intent?: string;
	complexity?: string;
	userMessagePreview?: string;
	toolCalls: number;
	toolErrors: number;
	editAttempts: number;
	successfulEdits: number;
	completionKind?: WorkflowCompletionKind;
	planStall?: boolean;
}

export interface AgentMetricsDashboard {
	totalRuns: number;
	completedRuns: number;
	failedRuns: number;
	successRate: number;
	avgDurationMs: number;
	avgToolCalls: number;
	toolErrorRate: number;
	/** successfulEdits / editAttempts across finished runs (0 when no edit attempts) */
	editSuccessRate: number;
	stallRuns: number;
	avgSuccessfulEdits: number;
	completionKindCounts: { kind: WorkflowCompletionKind; count: number }[];
	recentRuns: AgentRunMetricRecord[];
	toolUsage: { name: string; count: number }[];
	intentCounts: { intent: string; count: number }[];
}

export function createRunMetricRecord(runId: string, threadId: string, opts?: {
	intent?: string;
	complexity?: string;
	userMessage?: string;
}): AgentRunMetricRecord {
	return {
		runId,
		threadId,
		startedAt: Date.now(),
		status: 'running',
		intent: opts?.intent,
		complexity: opts?.complexity,
		userMessagePreview: opts?.userMessage?.slice(0, 120),
		toolCalls: 0,
		toolErrors: 0,
		editAttempts: 0,
		successfulEdits: 0,
	};
}

export function buildRunMetricFromAssistantMessage(
	base: AgentRunMetricRecord,
	assistantMsg: ChatMessage,
	userMessage: string,
	opts: {
		status: AgentRunMetricStatus;
		completionKind?: WorkflowCompletionKind;
		planStall?: boolean;
	},
): AgentRunMetricRecord {
	const endedAt = Date.now();
	const toolCalls = assistantMsg.toolCalls ?? [];
	const toolResults = assistantMsg.toolResults ?? [];
	const editTools = toolCalls.filter(t =>
		t.name === 'write_file' || t.name === 'propose_file_edit' || t.name === 'apply_file_edit',
	);
	const successfulEdits = editTools.filter(tc =>
		toolResults.some(tr => tr.toolCallId === tc.id && !tr.isError),
	).length;

	return {
		...base,
		endedAt,
		durationMs: endedAt - base.startedAt,
		status: opts.status,
		toolCalls: toolCalls.length,
		toolErrors: toolResults.filter(tr => tr.isError).length,
		editAttempts: editTools.length,
		successfulEdits,
		completionKind: opts.completionKind ?? assistantMsg.workflowSummary?.completionKind,
		planStall: opts.planStall ?? assistantMsg.workflowSummary?.completionKind === 'stalled',
		userMessagePreview: userMessage.slice(0, 120) || base.userMessagePreview,
	};
}

export function aggregateMetricsDashboard(runs: AgentRunMetricRecord[]): AgentMetricsDashboard {
	const finished = runs.filter(r => r.status !== 'running' && r.durationMs !== undefined);
	const completed = finished.filter(r => r.status === 'completed');
	const failed = finished.filter(r => r.status === 'failed');
	const totalTools = finished.reduce((s, r) => s + r.toolCalls, 0);
	const totalToolErrors = finished.reduce((s, r) => s + r.toolErrors, 0);
	const totalDuration = finished.reduce((s, r) => s + (r.durationMs ?? 0), 0);

	const intentMap = new Map<string, number>();
	for (const r of runs) {
		if (r.intent) {
			intentMap.set(r.intent, (intentMap.get(r.intent) ?? 0) + 1);
		}
	}

	const recentRuns = [...runs]
		.sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
		.slice(0, 20);

	const totalEditAttempts = finished.reduce((s, r) => s + r.editAttempts, 0);
	const totalSuccessfulEdits = finished.reduce((s, r) => s + r.successfulEdits, 0);
	const stallRuns = finished.filter(r => r.planStall === true || r.completionKind === 'stalled').length;

	const completionKindMap = new Map<WorkflowCompletionKind, number>();
	for (const r of finished) {
		const kind = r.completionKind;
		if (kind) {
			completionKindMap.set(kind, (completionKindMap.get(kind) ?? 0) + 1);
		}
	}

	return {
		totalRuns: runs.length,
		completedRuns: completed.length,
		failedRuns: failed.length,
		successRate: finished.length ? completed.length / finished.length : 0,
		avgDurationMs: finished.length ? Math.round(totalDuration / finished.length) : 0,
		avgToolCalls: finished.length ? totalTools / finished.length : 0,
		toolErrorRate: totalTools ? totalToolErrors / totalTools : 0,
		editSuccessRate: totalEditAttempts ? totalSuccessfulEdits / totalEditAttempts : 0,
		stallRuns,
		avgSuccessfulEdits: finished.length ? totalSuccessfulEdits / finished.length : 0,
		completionKindCounts: [...completionKindMap.entries()]
			.map(([kind, count]) => ({ kind, count }))
			.sort((a, b) => b.count - a.count),
		recentRuns,
		toolUsage: [],
		intentCounts: [...intentMap.entries()].map(([intent, count]) => ({ intent, count })).sort((a, b) => b.count - a.count),
	};
}

export function recordToolUsage(
	toolUsage: Map<string, number>,
	toolName: string,
): Map<string, number> {
	toolUsage.set(toolName, (toolUsage.get(toolName) ?? 0) + 1);
	return toolUsage;
}
