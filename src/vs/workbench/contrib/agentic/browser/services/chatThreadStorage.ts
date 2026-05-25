/*--------------------------------------------------------------------------------------
 *  Agentic AI — chat thread persistence (extracted from chatThreadService)
 *--------------------------------------------------------------------------------------*/

import type { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import type { ChatThread } from '../../common/agenticTypes.js';

export const CHAT_THREADS_STORAGE_KEY = 'agentic.chatThreads.v1';

export interface ChatThreadsStorageSnapshot {
	threads: ChatThread[];
	currentThreadId: string | null;
}

export function loadChatThreads(storageService: IStorageService): ChatThreadsStorageSnapshot {
	const raw = storageService.get(CHAT_THREADS_STORAGE_KEY, StorageScope.WORKSPACE);
	if (!raw) {
		return { threads: [], currentThreadId: null };
	}
	try {
		const data = JSON.parse(raw) as { threads: ChatThread[]; currentThreadId: string | null };
		const threads = (data.threads ?? []).map(t => ({
			...t,
			updatedAt: t.updatedAt ?? t.createdAt,
			status: t.status ?? 'idle',
			currentCheckpointId: t.currentCheckpointId ?? null,
			liveStatus: null,
		}));
		return { threads, currentThreadId: data.currentThreadId ?? null };
	} catch {
		return { threads: [], currentThreadId: null };
	}
}

export function persistChatThreads(
	storageService: IStorageService,
	threads: ChatThread[],
	currentThreadId: string | null,
): void {
	try {
		storageService.store(
			CHAT_THREADS_STORAGE_KEY,
			JSON.stringify({ threads, currentThreadId }),
			StorageScope.WORKSPACE,
			StorageTarget.USER,
		);
	} catch {
		// ignore quota
	}
}
