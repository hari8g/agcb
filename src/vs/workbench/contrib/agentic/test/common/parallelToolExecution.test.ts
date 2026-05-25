/*---------------------------------------------------------------------------------------------
 *  Agentic AI — parallel tool execution tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	canExecuteToolsInParallel,
	isParallelReadTool,
	partitionToolCallsForExecution,
} from '../../common/parallelToolExecution.js';

suite('Agentic parallelToolExecution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('isParallelReadTool identifies read tools', () => {
		assert.strictEqual(isParallelReadTool('read_file'), true);
		assert.strictEqual(isParallelReadTool('write_file'), false);
	});

	test('canExecuteToolsInParallel requires 2+ parallel reads', () => {
		assert.strictEqual(
			canExecuteToolsInParallel(
				[{ name: 'read_file', arguments: { path: 'a.ts' } }],
				{ parallelToolCallsEnabled: true },
			),
			false,
		);
		assert.strictEqual(
			canExecuteToolsInParallel(
				[
					{ name: 'read_file', arguments: { path: 'a.ts' } },
					{ name: 'grep', arguments: { pattern: 'foo' } },
				],
				{ parallelToolCallsEnabled: true },
			),
			true,
		);
		assert.strictEqual(
			canExecuteToolsInParallel(
				[
					{ name: 'read_file', arguments: { path: 'a.ts' } },
					{ name: 'write_file', arguments: { path: 'b.ts', content: 'x' } },
				],
				{ parallelToolCallsEnabled: true },
			),
			false,
		);
	});

	test('partitionToolCallsForExecution splits read vs write', () => {
		const { parallel, sequential } = partitionToolCallsForExecution([
			{ name: 'read_file', arguments: { path: 'a.ts' } },
			{ name: 'propose_file_edit', arguments: { path: 'a.ts', searchReplaceBlocks: '' } },
			{ name: 'grep', arguments: { pattern: 'x' } },
		]);
		assert.strictEqual(parallel.length, 2);
		assert.strictEqual(sequential.length, 1);
		assert.strictEqual(sequential[0]!.name, 'propose_file_edit');
	});
});
