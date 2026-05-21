/*--------------------------------------------------------------------------------------
 *  Agentic AI — checkpoint service (electron-main)
 *--------------------------------------------------------------------------------------*/

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { generateUuid } from '../../../../../base/common/uuid.js';
import type { CheckpointSnapshot } from '../../common/checkpointTypes.js';

const snapshots = new Map<string, CheckpointSnapshot>();

export function createCheckpoint(
	workspaceRoot: string,
	label: string,
	paths: string[],
): { checkpointId: string } {
	const checkpointId = generateUuid();
	const files: { path: string; content: string }[] = [];
	for (const rel of paths) {
		const full = join(workspaceRoot, rel);
		if (existsSync(full)) {
			try {
				files.push({ path: rel, content: readFileSync(full, 'utf8') });
			} catch { /* skip */ }
		}
	}
	snapshots.set(checkpointId, {
		checkpointId,
		files,
		createdAt: Date.now(),
	});
	return { checkpointId };
}

export function restoreCheckpoint(workspaceRoot: string, checkpointId: string): string {
	const snap = snapshots.get(checkpointId);
	if (!snap) return `Checkpoint not found: ${checkpointId}`;
	for (const f of snap.files) {
		const full = join(workspaceRoot, f.path);
		const dir = full.split('/').slice(0, -1).join('/');
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		writeFileSync(full, f.content, 'utf8');
	}
	return `Restored ${snap.files.length} file(s) from checkpoint ${checkpointId}`;
}
