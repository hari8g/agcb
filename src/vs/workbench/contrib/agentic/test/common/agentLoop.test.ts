/*---------------------------------------------------------------------------------------------
 *  Agentic AI — agent loop parser tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { extractToolCall } from '../../common/toolCallParser.js';

suite('Agentic agentLoop', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('extractToolCall from json fence', () => {
		const text = `I'll read the file.\n\`\`\`json\n{"tool_call":{"name":"read_file","arguments":{"path":"src/a.ts"}}}\n\`\`\``;
		const tc = extractToolCall(text);
		assert.ok(tc);
		assert.strictEqual(tc!.name, 'read_file');
		assert.strictEqual(tc!.arguments.path, 'src/a.ts');
	});

	test('extractToolCall returns null without fence', () => {
		assert.strictEqual(extractToolCall('no tool here'), null);
	});
});
