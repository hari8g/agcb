/*---------------------------------------------------------------------------------------------
 *  Agentic AI — post-edit verify tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	buildPostEditLintNudge,
	hasLintErrors,
	parseLintToolResult,
} from '../../common/postEditVerify.js';

suite('Agentic postEditVerify', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('hasLintErrors detects void lint string', () => {
		const sample = `Error 1:
Lines Affected: 3-3
Error message: ';' expected.`;
		assert.strictEqual(hasLintErrors(sample), true);
		assert.strictEqual(hasLintErrors('No lint errors found.'), false);
	});

	test('parseLintToolResult extracts line and message', () => {
		const sample = `Error 1:
Lines Affected: 10-12
Error message: Type 'string' is not assignable

Error 2:
Lines Affected: 20-20
Error message: Unused variable`;
		const items = parseLintToolResult(sample);
		assert.strictEqual(items.length, 2);
		assert.strictEqual(items[0].startLineNumber, 10);
		assert.ok(items[0].message.includes('not assignable'));
	});

	test('buildPostEditLintNudge includes path and lint body', () => {
		const nudge = buildPostEditLintNudge('src/foo.ts', 'Error 1:\nLines Affected: 1-1\nError message: bad');
		assert.ok(nudge.includes('src/foo.ts'));
		assert.ok(nudge.includes('read_lint_errors'));
	});
});
