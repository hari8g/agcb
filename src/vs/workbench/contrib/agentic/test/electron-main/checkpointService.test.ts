/*---------------------------------------------------------------------------------------------
 *  Agentic AI — checkpoint service tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createCheckpoint, restoreCheckpoint } from '../../electron-main/checkpoints/checkpointService.js';

suite('Agentic checkpointService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('create and restore round-trip', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-cp-'));
		const file = path.join(root, 'hello.txt');
		fs.writeFileSync(file, 'v1', 'utf8');

		const { checkpointId, fileCount } = createCheckpoint(root, 'before edit', ['hello.txt']);
		assert.strictEqual(fileCount, 1);

		fs.writeFileSync(file, 'v2', 'utf8');
		const restored = restoreCheckpoint(root, checkpointId);
		assert.strictEqual(restored.ok, true);
		assert.strictEqual(fs.readFileSync(file, 'utf8'), 'v1');

		fs.rmSync(root, { recursive: true, force: true });
	});

	test('restore unknown checkpoint fails', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-cp-'));
		const result = restoreCheckpoint(root, 'missing-id');
		assert.strictEqual(result.ok, false);
		fs.rmSync(root, { recursive: true, force: true });
	});
});
