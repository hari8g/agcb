/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { applyContextBudget, trimTextToBudget } from '../../common/contextBudget.js';
import { emptyCodeGraphContext } from '../../common/contextTypes.js';
import type { TemporalKnowledgeGraph } from '../../common/codebaseKnowledgeGraph.js';

suite('contextBudget', () => {
	test('applyContextBudget compacts large active file when graph present', () => {
		const kg: TemporalKnowledgeGraph = {
			workspaceKey: 'w',
			generatedAt: Date.now(),
			ttlMs: 60_000,
			nodes: [],
			edges: [],
			areas: ['src/'],
			queryRelevantPaths: [{ path: '/p/a.ts', score: 1, hint: 'module' }],
		};
		const ctx = applyContextBudget(
			{
				workspaceFolderUris: ['/p'],
				userMessage: 'x',
				activeFilePath: '/p/a.ts',
				activeFileLanguageId: 'typescript',
				activeFileContent: 'line\n'.repeat(2000),
				selectedCode: null,
				selectionRange: null,
				openTabs: [],
				gitBranch: null,
				recentFiles: [],
				checkpointId: null,
				codeGraph: {
					...emptyCodeGraphContext(),
					semanticMatches: [{ path: '/p/b.ts', snippet: 'code', score: 0.8 }],
				},
				jiraIssues: [],
				collectedAt: Date.now(),
			},
			{ maxContextChars: 14_000, compactActiveFile: true, maxSemanticSnippets: 6, maxSnippetChars: 400 },
			kg,
		);
		assert.ok(ctx.activeFileContent!.length < 5000);
		assert.ok(ctx.codeGraph.knowledgeGraphDigest?.includes('<architecture_graph>'));
	});

	test('trimTextToBudget', () => {
		assert.strictEqual(trimTextToBudget('hello', 10), 'hello');
		assert.ok(trimTextToBudget('x'.repeat(100), 50).includes('truncated'));
	});
});
