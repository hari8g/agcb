/*--------------------------------------------------------------------------------------
 *  Agentic AI — checkpoint service (electron-main)
 *--------------------------------------------------------------------------------------*/

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, normalize } from 'path';
import { generateUuid } from '../../../../../base/common/uuid.js';
import type { CheckpointSnapshot } from '../../common/checkpointTypes.js';

const snapshots = new Map<string, CheckpointSnapshot>();

export interface CreateCheckpointResult {
	checkpointId: string;
	fileCount: number;
}

export function createCheckpoint(
	workspaceRoot: string,
	label: string,
	paths: string[],
): CreateCheckpointResult {
	const checkpointId = generateUuid();
	const files: { path: string; content: string }[] = [];
	const seen = new Set<string>();
	for (const raw of paths) {
		const rel = normalizeRelPath(raw);
		if (!rel || seen.has(rel)) {
			continue;
		}
		seen.add(rel);
		const full = join(workspaceRoot, rel);
		if (existsSync(full)) {
			try {
				files.push({ path: rel, content: readFileSync(full, 'utf8') });
			} catch { /* skip unreadable */ }
		}
	}
	snapshots.set(checkpointId, {
		checkpointId,
		files,
		createdAt: Date.now(),
	});
	void label;
	return { checkpointId, fileCount: files.length };
}

export interface RestoreCheckpointResult {
	ok: boolean;
	message: string;
	restoredPaths: string[];
}

export function restoreCheckpoint(workspaceRoot: string, checkpointId: string): RestoreCheckpointResult {
	const snap = snapshots.get(checkpointId);
	if (!snap) {
		return { ok: false, message: `Checkpoint not found: ${checkpointId}`, restoredPaths: [] };
	}
	const restoredPaths: string[] = [];
	for (const f of snap.files) {
		const full = join(workspaceRoot, f.path);
		const dir = full.split('/').slice(0, -1).join('/');
		if (dir && !existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		writeFileSync(full, f.content, 'utf8');
		restoredPaths.push(f.path);
	}
	return {
		ok: true,
		message: `Restored ${restoredPaths.length} file(s) from checkpoint ${checkpointId}`,
		restoredPaths,
	};
}

export function getCheckpointSnapshot(checkpointId: string): CheckpointSnapshot | undefined {
	return snapshots.get(checkpointId);
}

export function exportCheckpointSnapshot(checkpointId: string): {
	found: boolean;
	checkpointId: string;
	createdAt: number;
	files: { path: string; content: string }[];
} {
	const snap = snapshots.get(checkpointId);
	if (!snap) {
		return { found: false, checkpointId, createdAt: 0, files: [] };
	}
	return {
		found: true,
		checkpointId: snap.checkpointId,
		createdAt: snap.createdAt,
		files: snap.files.map(f => ({ path: f.path, content: f.content })),
	};
}

function normalizeRelPath(p: string): string {
	const trimmed = p.trim().replace(/^[/\\]+/, '');
	if (!trimmed || trimmed.includes('..')) {
		return '';
	}
	return normalize(trimmed).replace(/\\/g, '/');
}
