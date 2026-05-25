/*---------------------------------------------------------------------------------------------
 *  Agentic AI — edit apply heuristic tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { tryApplyBlocksToFileContent } from '../../common/editApplyHeuristic.js';
import { normalizeSearchReplaceBlocks } from '../../common/editValidator.js';

suite('editApplyHeuristic', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('applies block when ORIGINAL matches file', () => {
		const file = 'const x = 1;\nexport {};\n';
		const blocks = `<<<<<<< ORIGINAL
const x = 1;
=======
const x = 2;
>>>>>>> UPDATED`;
		const result = tryApplyBlocksToFileContent(file, blocks);
		assert.strictEqual(result.ok, true);
		if (result.ok) {
			assert.ok(result.content.includes('const x = 2'));
		}
	});

	test('normalize wraps bare file body as create blocks', () => {
		const wrapped = normalizeSearchReplaceBlocks('hello\nworld');
		assert.ok(wrapped.includes('<<<<<<< ORIGINAL'));
		assert.ok(wrapped.includes('hello'));
	});
});
