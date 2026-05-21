/*---------------------------------------------------------------------------------------------
 *  Agentic AI — tool validation tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { validateToolArgs, stringifyToolResult } from '../../common/toolValidation.js';
import { getToolDefinition } from '../../common/toolTypes.js';

suite('Agentic toolValidation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('validates required fields', () => {
		const def = getToolDefinition('read_file')!;
		const bad = validateToolArgs(def, {});
		assert.strictEqual(bad.valid, false);
		assert.ok(bad.errors.some(e => e.includes('path')));

		const good = validateToolArgs(def, { path: 'src/foo.ts' });
		assert.strictEqual(good.valid, true);
	});

	test('stringifyToolResult', () => {
		const s = stringifyToolResult('grep', 'found 3 matches');
		assert.ok(s.includes('grep'));
		assert.ok(s.includes('found 3 matches'));
	});
});
