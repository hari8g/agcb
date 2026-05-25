/*--------------------------------------------------------------------------------------
 *  Agentic AI — in-memory run metrics + dashboard (P3 observability)
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import type { AgenticLogEvent } from '../../common/agenticObservability.js';
import type { ChatMessage } from '../../common/agenticTypes.js';
import {
	aggregateMetricsDashboard,
	buildRunMetricFromAssistantMessage,
	createRunMetricRecord,
	recordToolUsage,
	type AgentMetricsDashboard,
	type AgentRunMetricRecord,
	type AgentRunMetricStatus,
} from '../../common/agentRunMetrics.js';

const MAX_RUNS = 80;

export const IAgentMetricsService = createDecorator<IAgentMetricsService>('agenticMetricsService');

export interface IAgentMetricsService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getDashboard(): AgentMetricsDashboard;
	ingestLog(event: AgenticLogEvent): void;
	beginRun(runId: string, threadId: string, opts?: { intent?: string; complexity?: string; userMessage?: string }): void;
	finishRun(
		runId: string,
		assistantMsg: ChatMessage,
		userMessage: string,
		status: AgentRunMetricStatus,
	): void;
	clear(): void;
}

class AgentMetricsService extends Disposable implements IAgentMetricsService {
	declare readonly _serviceBrand: undefined;

	private readonly _runs: AgentRunMetricRecord[] = [];
	private readonly _active = new Map<string, AgentRunMetricRecord>();
	private readonly _toolUsage = new Map<string, number>();
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	getDashboard(): AgentMetricsDashboard {
		const dash = aggregateMetricsDashboard(this._runs);
		dash.toolUsage = [...this._toolUsage.entries()]
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 12);
		return dash;
	}

	ingestLog(event: AgenticLogEvent): void {
		if (!event.runId) {
			return;
		}
		if (event.kind === 'tool_call_started' && event.toolName) {
			recordToolUsage(this._toolUsage, event.toolName);
			const active = this._active.get(event.runId);
			if (active) {
				active.toolCalls++;
			}
			this._onDidChange.fire();
		}
		if (event.kind === 'tool_call_completed' && event.runId) {
			const active = this._active.get(event.runId);
			if (active && event.meta?.isError === true) {
				active.toolErrors++;
			}
		}
		if (event.kind === 'thread_completed' || event.kind === 'thread_failed') {
			this._active.delete(event.runId);
		}
	}

	beginRun(
		runId: string,
		threadId: string,
		opts?: { intent?: string; complexity?: string; userMessage?: string },
	): void {
		const rec = createRunMetricRecord(runId, threadId, opts);
		this._active.set(runId, rec);
		this._pushRun(rec);
		this._onDidChange.fire();
	}

	finishRun(
		runId: string,
		assistantMsg: ChatMessage,
		userMessage: string,
		status: AgentRunMetricStatus,
	): void {
		const base = this._active.get(runId) ?? this._runs.find(r => r.runId === runId);
		if (!base) {
			return;
		}
		const finished = buildRunMetricFromAssistantMessage(base, assistantMsg, userMessage, {
			status,
			completionKind: assistantMsg.workflowSummary?.completionKind,
			planStall: assistantMsg.workflowSummary?.completionKind === 'stalled',
		});
		this._replaceRun(finished);
		this._active.delete(runId);
		this._onDidChange.fire();
	}

	clear(): void {
		this._runs.length = 0;
		this._active.clear();
		this._toolUsage.clear();
		this._onDidChange.fire();
	}

	private _pushRun(rec: AgentRunMetricRecord): void {
		this._runs.push(rec);
		while (this._runs.length > MAX_RUNS) {
			this._runs.shift();
		}
	}

	private _replaceRun(rec: AgentRunMetricRecord): void {
		const idx = this._runs.findIndex(r => r.runId === rec.runId);
		if (idx >= 0) {
			this._runs[idx] = rec;
		} else {
			this._pushRun(rec);
		}
	}
}

registerSingleton(IAgentMetricsService, AgentMetricsService, InstantiationType.Delayed);
