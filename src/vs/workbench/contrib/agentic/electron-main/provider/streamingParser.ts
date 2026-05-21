/*--------------------------------------------------------------------------------------
 *  Agentic AI — OpenAI-compatible SSE stream parser
 *--------------------------------------------------------------------------------------*/

export interface StreamChunk {
	type: 'delta' | 'done' | 'error';
	text?: string;
	error?: string;
}

/**
 * Parse Server-Sent Events from an OpenAI-compatible chat completions stream.
 */
export async function* parseOpenAICompatibleSSE(
	body: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
	signal?: AbortSignal,
): AsyncIterable<StreamChunk> {
	const reader = 'getReader' in body
		? (body as ReadableStream<Uint8Array>).getReader()
		: null;

	const decoder = new TextDecoder();
	let buffer = '';

	const readNext = async (): Promise<string | null> => {
		if (reader) {
			if (signal?.aborted) return null;
			const { done, value } = await reader.read();
			if (done) return null;
			return decoder.decode(value, { stream: true });
		}
		return new Promise((resolve, reject) => {
			const nodeStream = body as NodeJS.ReadableStream;
			const onData = (chunk: Buffer | string) => {
				nodeStream.off('data', onData);
				nodeStream.off('error', onError);
				resolve(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
			};
			const onError = (err: Error) => reject(err);
			nodeStream.once('data', onData);
			nodeStream.once('error', onError);
			nodeStream.once('end', () => resolve(null));
		});
	};

	try {
		while (true) {
			const chunk = await readNext();
			if (chunk === null) break;
			buffer += chunk;

			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith(':')) continue;
				if (trimmed === 'data: [DONE]') {
					yield { type: 'done' };
					return;
				}
				if (!trimmed.startsWith('data: ')) continue;
				const jsonStr = trimmed.slice(6);
				try {
					const parsed = JSON.parse(jsonStr);
					const delta = parsed?.choices?.[0]?.delta?.content;
					if (typeof delta === 'string' && delta.length > 0) {
						yield { type: 'delta', text: delta };
					}
				} catch {
					// partial JSON — wait for more
				}
			}
			if (signal?.aborted) break;
		}
		yield { type: 'done' };
	} catch (e) {
		yield { type: 'error', error: String(e) };
	} finally {
		reader?.releaseLock();
	}
}
