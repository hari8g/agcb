/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { coerceWriteFileContent, normalizeWriteToolArguments } from '../../common/writeFileContent.js';

suite('writeFileContent', () => {
	test('coerces object content to JSON string', () => {
		const out = coerceWriteFileContent({ name: 'test-app', version: '1.0.0' });
		assert.ok(out.includes('"name": "test-app"'));
		assert.ok(!out.includes('[object Object]'));
	});

	test('passes through string content', () => {
		assert.strictEqual(coerceWriteFileContent('{\n  "a": 1\n}'), '{\n  "a": 1\n}');
	});

	test('normalizeWriteToolArguments coerces content field', () => {
		const args = normalizeWriteToolArguments({ path: 'package.json', content: { version: '2.0.0' } });
		assert.strictEqual(typeof args.content, 'string');
		assert.ok(String(args.content).includes('"version": "2.0.0"'));
	});

	test('normalizeWriteToolArguments coerces searchReplaceBlocks object', () => {
		const args = normalizeWriteToolArguments({
			path: 'package.json',
			searchReplaceBlocks: { scripts: { build: 'vite build' } },
		});
		assert.strictEqual(typeof args.searchReplaceBlocks, 'string');
		assert.ok(String(args.searchReplaceBlocks).includes('vite build'));
		assert.ok(!String(args.searchReplaceBlocks).includes('[object Object]'));
	});
});
