/*--------------------------------------------------------------------------------------
 *  Agentic AI — stream chat via Void's LLM providers (electron-main)
 *--------------------------------------------------------------------------------------*/

import type { LLMMessage } from '../../common/llmMessageTypes.js';
import type { VoidProviderConfig } from '../../common/voidProviderConfig.js';
import { sendLLMMessageToProviderImplementation } from '../../../void/electron-main/llmMessage/sendLLMMessage.impl.js';
import type { LLMChatMessage } from '../../../void/common/sendLLMMessageTypes.js';

export interface VoidStreamCallbacks {
	onDelta: (text: string, fullText: string) => void;
	onDone: (fullText: string) => void;
	onError: (message: string) => void;
}

function toVoidChatMessages(messages: LLMMessage[]): LLMChatMessage[] {
	return messages.map(m => {
		if (m.role === 'system') {
			return { role: 'system', content: m.content };
		}
		if (m.role === 'assistant') {
			return { role: 'assistant', content: m.content };
		}
		return { role: 'user', content: m.content };
	});
}

const DEFAULT_STREAM_TIMEOUT_MS = 120_000;

export async function streamViaVoidProvider(
	voidProvider: VoidProviderConfig,
	messages: LLMMessage[],
	signal: AbortSignal,
	callbacks: VoidStreamCallbacks,
	timeoutMs: number = DEFAULT_STREAM_TIMEOUT_MS,
): Promise<void> {
	const implementation = sendLLMMessageToProviderImplementation[voidProvider.providerName];
	if (!implementation?.sendChat) {
		callbacks.onError(`Provider "${voidProvider.providerName}" is not supported for Agentic chat.`);
		return;
	}

	let fullTextSoFar = '';
	let settled = false;
	let clearStreamTimeout: (() => void) | undefined;

	const finish = (fn: () => void) => {
		if (settled) return;
		settled = true;
		clearStreamTimeout?.();
		fn();
	};

	await new Promise<void>((resolve) => {
		const onAbort = () => {
			finish(() => {
				callbacks.onDone(fullTextSoFar);
				resolve();
			});
		};
		if (signal.aborted) {
			onAbort();
			return;
		}
		signal.addEventListener('abort', onAbort, { once: true });

		const timeout = setTimeout(() => {
			finish(() => {
				callbacks.onError(`Model request timed out after ${timeoutMs}ms`);
				resolve();
			});
		}, timeoutMs);
		clearStreamTimeout = () => clearTimeout(timeout);

		void implementation.sendChat({
			messages: toVoidChatMessages(messages),
			onText: ({ fullText }) => {
				const delta = fullText.slice(fullTextSoFar.length);
				fullTextSoFar = fullText;
				if (delta) {
					callbacks.onDelta(delta, fullTextSoFar);
				}
			},
			onFinalMessage: ({ fullText }) => {
				fullTextSoFar = fullText;
				finish(() => {
					callbacks.onDone(fullTextSoFar);
					resolve();
				});
			},
			onError: ({ message }) => {
				finish(() => {
					callbacks.onError(message);
					resolve();
				});
			},
			settingsOfProvider: voidProvider.settingsOfProvider,
			modelSelectionOptions: voidProvider.modelSelectionOptions,
			overridesOfModel: undefined,
			modelName: voidProvider.modelName,
			_setAborter: (abortFn) => {
				signal.addEventListener('abort', () => abortFn(), { once: true });
			},
			providerName: voidProvider.providerName,
			separateSystemMessage: undefined,
			chatMode: 'normal',
			mcpTools: undefined,
		});
	});
}
