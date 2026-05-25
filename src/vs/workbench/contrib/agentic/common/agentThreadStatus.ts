/*--------------------------------------------------------------------------------------
 *  Agentic AI — mission-control style thread status (Cursor dashboard parity)
 *--------------------------------------------------------------------------------------*/

import type { ChatThread } from './agenticTypes.js';

export type AgentMissionStatus =
	| 'idle'
	| 'in_progress'
	| 'waiting_approval'
	| 'ready_for_review'
	| 'failed';

export interface AgentMissionRow {
	threadId: string;
	title: string;
	status: AgentMissionStatus;
	statusLabel: string;
	updatedAt: number;
	preview?: string;
	fileDelta?: string;
}

export function deriveMissionStatus(thread: ChatThread): AgentMissionStatus {
	if (thread.status === 'running') {
		return 'in_progress';
	}
	if (thread.status === 'waiting_approval') {
		return 'waiting_approval';
	}
	if (thread.status === 'failed') {
		return 'failed';
	}
	const last = thread.messages[thread.messages.length - 1];
	if (last?.role === 'assistant') {
		if (last.workflowSummary?.completionKind === 'success') {
			return 'ready_for_review';
		}
		if (last.workflowSummary?.completionKind === 'partial' || last.workflowSummary?.completionKind === 'stalled') {
			return 'ready_for_review';
		}
		if (last.workflowSummary?.completionKind === 'failed') {
			return 'failed';
		}
		if (last.decision && !last.decision.resolved) {
			return 'waiting_approval';
		}
	}
	if (thread.status === 'completed') {
		return 'ready_for_review';
	}
	return 'idle';
}

export function missionStatusLabel(status: AgentMissionStatus): string {
	switch (status) {
		case 'in_progress': return 'In progress';
		case 'waiting_approval': return 'Needs approval';
		case 'ready_for_review': return 'Ready for review';
		case 'failed': return 'Failed';
		default: return 'Idle';
	}
}

export function buildMissionRows(threads: ChatThread[]): AgentMissionRow[] {
	return [...threads]
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.map(t => {
			const status = deriveMissionStatus(t);
			const lastAssistant = [...t.messages].reverse().find(m => m.role === 'assistant');
			const touched = lastAssistant?.touchedFiles ?? [];
			const applied = touched.filter(f => f.status === 'applied').length;
			const failed = touched.filter(f => f.status === 'failed').length;
			let fileDelta: string | undefined;
			if (applied > 0 || failed > 0) {
				fileDelta = failed > 0 ? `+${applied} -${failed} files` : `+${applied} files`;
			}
			return {
				threadId: t.id,
				title: t.title || 'New chat',
				status,
				statusLabel: missionStatusLabel(status),
				updatedAt: t.updatedAt,
				preview: lastAssistant?.content?.slice(0, 120) || lastAssistant?.workflowSummary?.outcome?.slice(0, 120),
				fileDelta,
			};
		});
}
