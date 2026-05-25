/*--------------------------------------------------------------------------------------
 *  Agentic AI — persisted checkpoint snapshots (workspace storage)
 *--------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import type { Checkpoint } from '../../common/agenticTypes.js';

const STORAGE_KEY = 'agentic.chatCheckpoints.v2';

export interface PersistedCheckpointSnapshot {
	checkpointId: string;
	threadId: string;
	label: string;
	createdAt: number;
	fileCount: number;
	files: { path: string; content: string }[];
}

export class AgentCheckpointStore {
	constructor(private readonly storageService: IStorageService) {}

	loadAll(): PersistedCheckpointSnapshot[] {
		try {
			const raw = this.storageService.get(STORAGE_KEY, StorageScope.WORKSPACE, '[]');
			const parsed = JSON.parse(raw) as PersistedCheckpointSnapshot[];
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	saveAll(all: PersistedCheckpointSnapshot[]): void {
		this.storageService.store(
			STORAGE_KEY,
			JSON.stringify(all.slice(-80)),
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE,
		);
	}

	forThread(threadId: string): PersistedCheckpointSnapshot[] {
		return this.loadAll().filter(c => c.threadId === threadId);
	}

	get(checkpointId: string): PersistedCheckpointSnapshot | undefined {
		return this.loadAll().find(c => c.checkpointId === checkpointId);
	}

	upsert(snapshot: PersistedCheckpointSnapshot): void {
		const all = this.loadAll().filter(c => c.checkpointId !== snapshot.checkpointId);
		all.push(snapshot);
		this.saveAll(all);
	}

	remove(checkpointId: string): void {
		this.saveAll(this.loadAll().filter(c => c.checkpointId !== checkpointId));
	}

	toCheckpointMeta(s: PersistedCheckpointSnapshot): Checkpoint {
		return {
			id: s.checkpointId,
			createdAt: s.createdAt,
			label: s.label,
			snapshotId: s.checkpointId,
			fileCount: s.fileCount,
			paths: s.files.map(f => f.path),
		};
	}

	mergeThreadCheckpoints(threadId: string, threadCheckpoints: Checkpoint[]): Checkpoint[] {
		const persisted = this.forThread(threadId);
		const byId = new Map<string, Checkpoint>();
		for (const p of persisted) {
			byId.set(p.checkpointId, this.toCheckpointMeta(p));
		}
		for (const c of threadCheckpoints) {
			byId.set(c.id, { ...byId.get(c.id), ...c });
		}
		return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
	}
}
