/*--------------------------------------------------------------------------------------
 *  Agentic AI — OpenAI-compatible chat completions (electron-main only)
 *--------------------------------------------------------------------------------------*/

import { parseOpenAICompatibleSSE } from './streamingParser.js';

export interface OpenAICompatibleConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
	temperature: number;
	maxTokens: number;
}

export interface OpenAIStreamCallbacks {
	onDelta: (text: string) => void;
	onDone: () => void;
	onError: (message: string) => void;
}

export async function streamOpenAICompatibleChat(
	config: OpenAICompatibleConfig,
	messages: { role: string; content: string }[],
	signal: AbortSignal,
	callbacks: OpenAIStreamCallbacks,
): Promise<void> {
	const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
	const body = {
		model: config.model,
		messages,
		temperature: config.temperature,
		max_tokens: config.maxTokens,
		stream: true,
	};

	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
			},
			body: JSON.stringify(body),
			signal,
		});

		if (!res.ok) {
			const errText = await res.text().catch(() => res.statusText);
			callbacks.onError(`HTTP ${res.status}: ${errText}`);
			return;
		}

		if (!res.body) {
			callbacks.onError('No response body');
			return;
		}

		for await (const chunk of parseOpenAICompatibleSSE(res.body as ReadableStream<Uint8Array>, signal)) {
			if (signal.aborted) break;
			if (chunk.type === 'delta' && chunk.text) callbacks.onDelta(chunk.text);
			else if (chunk.type === 'error') callbacks.onError(chunk.error ?? 'Stream error');
			else if (chunk.type === 'done') break;
		}
		callbacks.onDone();
	} catch (e) {
		if (signal.aborted) return;
		callbacks.onError(e instanceof Error ? e.message : String(e));
	}
}

export function readOpenAIConfigFromEnv(): Partial<OpenAICompatibleConfig> {
	return {
		baseUrl: process.env.AGENTIC_OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
		apiKey: process.env.AGENTIC_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? '',
		model: process.env.AGENTIC_MODEL ?? 'gpt-4o-mini',
		temperature: Number(process.env.AGENTIC_TEMPERATURE ?? '0.2'),
		maxTokens: Number(process.env.AGENTIC_MAX_TOKENS ?? '4096'),
	};
}
