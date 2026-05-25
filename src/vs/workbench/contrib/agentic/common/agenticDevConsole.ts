/*--------------------------------------------------------------------------------------
 *  Agentic AI — workflow debug output for browser DevTools (Renderer console)
 *--------------------------------------------------------------------------------------*/

import type { AgentEvent } from './agenticTypes.js';
import type { AgenticLogEvent, AgenticLogKind } from './agenticObservability.js';
import { formatAgenticLogLine } from './agenticObservability.js';

const DEVTOOLS_STYLE = 'color:#7c3aed;font-weight:600';
const DEVTOOLS_PREFIX = '[Agentic]';

export interface AgenticDevConsoleOptions {
	enabled: boolean;
	/** Log model/thinking stream deltas (very noisy). */
	verbose: boolean;
}

let _options: AgenticDevConsoleOptions = { enabled: false, verbose: false };
let _bannerShown = false;

export function configureAgenticDevConsole(partial: Partial<AgenticDevConsoleOptions>): void {
	const next = { ..._options, ...partial };
	const turnedOn = next.enabled && !_options.enabled;
	_options = next;
	if (turnedOn && !_bannerShown && typeof console !== 'undefined') {
		_bannerShown = true;
		console.info(
			`%c${DEVTOOLS_PREFIX} Workflow debug logging ON — filter DevTools console by "Agentic"`,
			DEVTOOLS_STYLE,
		);
	}
}

export function isAgenticDevConsoleEnabled(): boolean {
	return _options.enabled;
}

function truncate(value: unknown, max = 1200): unknown {
	if (typeof value === 'string') {
		return value.length > max ? `${value.slice(0, max)}… (${value.length} chars)` : value;
	}
	if (value && typeof value === 'object') {
		try {
			const s = JSON.stringify(value);
			return s.length > max ? `${s.slice(0, max)}…` : value;
		} catch {
			return value;
		}
	}
	return value;
}

function logLevelForEvent(type: AgentEvent['type'], kind?: AgenticLogKind): 'debug' | 'info' | 'warn' | 'error' {
	if (type === 'run_failed' || type === 'tool_call_failed') {
		return 'error';
	}
	if (kind === 'error' || kind === 'thread_failed') {
		return 'error';
	}
	if (type === 'approval_required') {
		return 'warn';
	}
	return 'info';
}

function emit(level: 'debug' | 'info' | 'warn' | 'error', message: string, detail?: Record<string, unknown>): void {
	if (typeof console === 'undefined') {
		return;
	}
	const payload = detail ? { ...detail } : undefined;
	switch (level) {
		case 'error':
			console.error(message, payload ?? '');
			break;
		case 'warn':
			console.warn(message, payload ?? '');
			break;
		case 'debug':
			console.debug(message, payload ?? '');
			break;
		default:
			console.info(message, payload ?? '');
	}
}

/** Log IPC agent events (orchestrator, tools, stream, errors). */
export function logAgentEventToDevConsole(event: AgentEvent): void {
	if (!_options.enabled) {
		return;
	}
	const { type, runId, timestamp, payload } = event;
	if (!_options.verbose && (type === 'model_stream_delta' || type === 'thinking_delta')) {
		return;
	}
	if (type === 'workflow_log') {
		logWorkflowLogPayload(runId, payload);
		return;
	}

	const level = logLevelForEvent(type);
	const shortRun = runId.slice(0, 8);
	const detail: Record<string, unknown> = {
		runId: shortRun,
		ts: timestamp,
		...sanitizePayload(type, payload),
	};

	if (type === 'tool_call_started' || type === 'tool_call_completed') {
		const fromPreview = String(payload.resultPreview ?? '').match(/^\[tool_(?:result|error):(\w+)\]/i)?.[1];
		const toolLabel = String(payload.name ?? fromPreview ?? 'tool');
		emit(level, `${DEVTOOLS_PREFIX} ${type} · ${toolLabel}`, detail);
		return;
	}
	if (type === 'run_completed') {
		const preview = truncate(String(payload.finalText ?? ''), 400);
		emit('info', `${DEVTOOLS_PREFIX} run_completed`, { ...detail, finalText: preview });
		return;
	}
	if (type === 'run_failed') {
		const msg = String(payload.message ?? 'unknown error');
		emit('error', `${DEVTOOLS_PREFIX} run_failed — ${msg}`, detail);
		return;
	}
	if (type === 'approval_required') {
		const title = String(payload.title ?? payload.toolName ?? 'approval');
		emit('warn', `${DEVTOOLS_PREFIX} approval_required — ${title}`, detail);
		return;
	}
	emit(level, `${DEVTOOLS_PREFIX} ${type}`, detail);
}

function logWorkflowLogPayload(runId: string, payload: Record<string, unknown>): void {
	const kind = String(payload.kind ?? 'log') as AgenticLogKind;
	const level = logLevelForEvent('workflow_log', kind);
	const line = formatAgenticLogLine({
		kind,
		threadId: payload.threadId ? String(payload.threadId) : undefined,
		runId,
		toolName: payload.toolName ? String(payload.toolName) : undefined,
		message: payload.message ? String(payload.message) : undefined,
		durationMs: typeof payload.durationMs === 'number' ? payload.durationMs : undefined,
		meta: payload.meta as AgenticLogEvent['meta'],
	});
	emit(level, `${DEVTOOLS_PREFIX} ${line}`, {
		runId: runId.slice(0, 8),
		kind,
		meta: payload.meta,
	});
}

function sanitizePayload(type: AgentEvent['type'], payload: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(payload)) {
		if (type === 'model_stream_delta' && k === 'text') {
			out[k] = truncate(String(v ?? ''), 200);
		} else if (k === 'resultPreview' || k === 'finalText' || k === 'content') {
			out[k] = truncate(v);
		} else if (k === 'arguments' && v && typeof v === 'object') {
			const args = { ...(v as Record<string, unknown>) };
			if (typeof args.content === 'string' && args.content.length > 800) {
				args.content = truncate(args.content, 800);
			}
			out[k] = args;
		} else {
			out[k] = truncate(v, 600);
		}
	}
	return out;
}

/** Runtime / approval / send-path errors. */
export function logAgenticWorkflowError(scope: string, message: string, extra?: Record<string, unknown>): void {
	if (!_options.enabled) {
		return;
	}
	emit('error', `${DEVTOOLS_PREFIX} ${scope}: ${message}`, extra);
}

/** Browser-side structured observability (metrics sink). */
export function logAgenticObservabilityToDevConsole(event: AgenticLogEvent): void {
	if (!_options.enabled) {
		return;
	}
	const level = event.kind === 'error' || event.kind === 'thread_failed' ? 'error' : 'debug';
	emit(level, `${DEVTOOLS_PREFIX} ${formatAgenticLogLine(event)}`, {
		meta: event.meta,
	});
}
