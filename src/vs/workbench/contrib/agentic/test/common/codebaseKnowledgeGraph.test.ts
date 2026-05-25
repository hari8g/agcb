/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	extractImportTargets,
	inferFileRole,
	isKnowledgeGraphFresh,
	serializeKnowledgeGraphForPrompt,
	type TemporalKnowledgeGraph,
} from '../../common/codebaseKnowledgeGraph.js';

suite('codebaseKnowledgeGraph', () => {
	test('extractImportTargets finds relative imports', () => {
		const src = `import { x } from './foo.js';\nconst y = require("../bar");`;
		const targets = extractImportTargets(src);
		assert.ok(targets.includes('./foo.js'));
		assert.ok(targets.includes('../bar'));
	});

	test('serializeKnowledgeGraphForPrompt stays bounded', () => {
		const kg: TemporalKnowledgeGraph = {
			workspaceKey: 'ws',
			generatedAt: Date.now(),
			ttlMs: 3600_000,
			nodes: [],
			edges: [],
			areas: Array.from({ length: 50 }, (_, i) => `area-${i}`),
			queryRelevantPaths: Array.from({ length: 30 }, (_, i) => ({
				path: `/proj/file-${i}.ts`,
				score: 0.9,
				hint: 'module',
			})),
		};
		const text = serializeKnowledgeGraphForPrompt(kg, 3000);
		assert.ok(text.length <= 3100);
		assert.ok(text.includes('<architecture_graph>'));
	});

	test('isKnowledgeGraphFresh respects ttl', () => {
		const kg: TemporalKnowledgeGraph = {
			workspaceKey: 'a',
			generatedAt: 1000,
			ttlMs: 5000,
			nodes: [],
			edges: [],
			areas: [],
			queryRelevantPaths: [],
		};
		assert.strictEqual(isKnowledgeGraphFresh(kg, 2000), true);
		assert.strictEqual(isKnowledgeGraphFresh(kg, 7000), false);
	});

	test('inferFileRole', () => {
		assert.strictEqual(inferFileRole('src/foo.service.ts'), 'service');
		assert.strictEqual(inferFileRole('src/foo.test.ts'), 'test');
	});
});
