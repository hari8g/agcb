/*--------------------------------------------------------------------------------------
 *  Agentic AI — inject orchestrator messages into an active agent loop
 *--------------------------------------------------------------------------------------*/

import type { LLMMessage } from '../../common/llmMessageTypes.js';

const pendingByRequest = new Map<string, LLMMessage[]>();

export function queueRunMessageInject(requestId: string, message: LLMMessage): void {
	const q = pendingByRequest.get(requestId) ?? [];
	q.push(message);
	pendingByRequest.set(requestId, q);
}

export function drainRunMessageInjects(requestId: string): LLMMessage[] {
	const q = pendingByRequest.get(requestId) ?? [];
	pendingByRequest.delete(requestId);
	return q;
}

export function clearRunMessageInjects(requestId: string): void {
	pendingByRequest.delete(requestId);
}
