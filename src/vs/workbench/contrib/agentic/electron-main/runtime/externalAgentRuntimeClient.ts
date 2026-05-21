/*--------------------------------------------------------------------------------------
 *  Agentic AI — external Agent Runtime Gateway client
 *--------------------------------------------------------------------------------------*/

import type { RuntimeRequest } from '../../common/llmMessageTypes.js';
import type { AgentEvent } from '../../common/agenticTypes.js';
import { runLocalAgent } from './localAgentRuntime.js';

export interface ExternalRuntimeClientConfig {
	gatewayUrl: string;
	apiKey?: string;
	apiKeyEnvVar?: string;
	requestTimeoutMs?: number;
}

/**
 * Dev fallback: gateway URL `dev://local` runs the in-process local agent loop.
 */
export class ExternalAgentRuntimeClient {
	constructor(private readonly config: ExternalRuntimeClientConfig) { }

	async startRun(
		request: RuntimeRequest,
		emit: (event: AgentEvent) => void,
		requestId = 'external',
	): Promise<{ ok: boolean; error?: string }> {
		const url = this.config.gatewayUrl.trim();

		if (!url || url === 'dev://local') {
			await runLocalAgent(requestId, request, emit);
			return { ok: true };
		}

		const apiKey = this.config.apiKey
			?? process.env[this.config.apiKeyEnvVar ?? 'AGENTIC_API_KEY']
			?? '';

		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs ?? 120_000);

			const res = await fetch(`${url.replace(/\/$/, '')}/v1/runs`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
				},
				body: JSON.stringify({
					runId: request.runId,
					threadId: request.threadId,
					messages: request.messages,
					context: request.context,
					options: request.options,
				}),
				signal: controller.signal,
			});

			clearTimeout(timeout);

			if (!res.ok) {
				const body = await res.text().catch(() => '');
				return { ok: false, error: `Gateway ${res.status}: ${body.slice(0, 200)}` };
			}

			const contentType = res.headers.get('content-type') ?? '';
			if (contentType.includes('text/event-stream') && res.body) {
				await this._consumeSSE(res.body as unknown as ReadableStream<Uint8Array>, emit, request.runId);
				return { ok: true };
			}

			const json = await res.json() as { events?: AgentEvent[]; finalText?: string };
			for (const event of json.events ?? []) {
				emit(event);
			}
			if (json.finalText) {
				emit({
					type: 'run_completed',
					runId: request.runId,
					timestamp: Date.now(),
					payload: { finalText: json.finalText },
				});
			}
			return { ok: true };
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			// Fallback to local dev loop when gateway unreachable
			if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
				await runLocalAgent(requestId, request, emit);
				return { ok: true };
			}
			return { ok: false, error: `External runtime error: ${msg}` };
		}
	}

	private async _consumeSSE(
		body: ReadableStream<Uint8Array>,
		emit: (event: AgentEvent) => void,
		runId: string,
	): Promise<void> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.startsWith('data: ')) continue;
				const data = line.slice(6).trim();
				if (data === '[DONE]') return;
				try {
					const event = JSON.parse(data) as AgentEvent;
					emit({ ...event, runId: event.runId || runId });
				} catch { /* partial */ }
			}
		}
	}
}
