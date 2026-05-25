/*--------------------------------------------------------------------------------------
 *  Agentic AI — structured observability (no secrets / full file bodies)
 *--------------------------------------------------------------------------------------*/

export type AgenticLogKind =
	| 'thread_started'
	| 'thread_completed'
	| 'thread_failed'
	| 'runtime_request_started'
	| 'first_token_received'
	| 'tool_call_started'
	| 'tool_call_completed'
	| 'agent_turn'
	| 'error';

export interface AgenticLogEvent {
	kind: AgenticLogKind;
	threadId?: string;
	runId?: string;
	toolName?: string;
	message?: string;
	durationMs?: number;
	meta?: Record<string, string | number | boolean>;
}

export type AgenticLogSink = (event: AgenticLogEvent) => void;

let _sink: AgenticLogSink | undefined;
const _runSinks: AgenticLogSink[] = [];

export function setAgenticLogSink(sink: AgenticLogSink | undefined): void {
	_sink = sink;
}

/** Per-run sink (e.g. forward main-process logs to renderer via IPC). */
export function pushAgenticLogSink(sink: AgenticLogSink): { dispose(): void } {
	_runSinks.push(sink);
	return {
		dispose: () => {
			const i = _runSinks.indexOf(sink);
			if (i >= 0) {
				_runSinks.splice(i, 1);
			}
		},
	};
}

export function agenticLog(event: AgenticLogEvent): void {
	_sink?.(event);
	for (const s of _runSinks) {
		try {
			s(event);
		} catch {
			// never break agent loop on logging
		}
	}
}

export function formatAgenticLogLine(event: AgenticLogEvent): string {
	const parts = [`[agentic:${event.kind}]`];
	if (event.threadId) {
		parts.push(`thread=${event.threadId}`);
	}
	if (event.runId) {
		parts.push(`run=${event.runId.slice(0, 8)}`);
	}
	if (event.toolName) {
		parts.push(`tool=${event.toolName}`);
	}
	if (event.durationMs !== undefined) {
		parts.push(`ms=${event.durationMs}`);
	}
	if (event.message) {
		parts.push(event.message.slice(0, 200));
	}
	return parts.join(' ');
}
