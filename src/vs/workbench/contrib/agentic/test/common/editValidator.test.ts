/*---------------------------------------------------------------------------------------------
 *  Agentic AI — edit validator tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	buildCreateFileBlocks,
	coerceBlocksForNewFile,
	extractCreateFileContent,
	normalizeSearchReplaceBlocks,
	validateSearchReplaceBlocks,
} from '../../common/editValidator.js';

suite('Agentic editValidator', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts valid Void search/replace block', () => {
		const blocks = `<<<<<<< ORIGINAL
const x = 1;
=======
const x = 2;
>>>>>>> UPDATED`;
		const r = validateSearchReplaceBlocks(blocks);
		assert.strictEqual(r.ok, true);
		assert.strictEqual(r.blockCount, 1);
	});

	test('rejects empty blocks', () => {
		const r = validateSearchReplaceBlocks('   ');
		assert.strictEqual(r.ok, false);
	});

	test('rejects missing divider', () => {
		const blocks = `<<<<<<< ORIGINAL
code
>>>>>>> UPDATED`;
		const r = validateSearchReplaceBlocks(blocks);
		assert.strictEqual(r.ok, false);
	});

	test('normalizes <<<<<<< without ORIGINAL label', () => {
		const raw = `<<<<<<<
from datetime import datetime
=======
from datetime import datetime, timezone
>>>>>>>`;
		const r = validateSearchReplaceBlocks(raw);
		assert.strictEqual(r.ok, true, r.error);
	});

	test('normalizes divider-only two-part block', () => {
		const raw = `from datetime import datetime
=======
from datetime import datetime, timezone`;
		const r = validateSearchReplaceBlocks(raw);
		assert.strictEqual(r.ok, true, r.error);
	});

	test('rejects empty ORIGINAL section after normalize for existing files', () => {
		const raw = `=======
only updated
>>>>>>> UPDATED`;
		const r = validateSearchReplaceBlocks(raw);
		assert.strictEqual(r.ok, false);
	});

	test('accepts create-file blocks with empty ORIGINAL', () => {
		const blocks = buildCreateFileBlocks('{\n  "name": "demo"\n}');
		const r = validateSearchReplaceBlocks(blocks, { allowCreate: true });
		assert.strictEqual(r.ok, true, r.error);
		assert.strictEqual(r.blockCount, 1);
	});

	test('coerces read_file error out of ORIGINAL for new files', () => {
		const bad = `<<<<<<< ORIGINAL
Error: file not found: package.json
=======
{
  "name": "demo"
}
>>>>>>> UPDATED`;
		const fixed = coerceBlocksForNewFile(bad);
		assert.ok(fixed);
		const r = validateSearchReplaceBlocks(fixed!, { allowCreate: true });
		assert.strictEqual(r.ok, true, r.error);
		assert.ok(extractCreateFileContent(fixed!)?.includes('"name"'));
	});

	test('normalize unwraps escaped newlines', () => {
		const raw = '<<<<<<< ORIGINAL\\nline\\n=======\\nline2\\n>>>>>>> UPDATED';
		const n = normalizeSearchReplaceBlocks(raw);
		assert.ok(n.includes('\n'));
	});
});
