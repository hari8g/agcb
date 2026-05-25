/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { classifyQueryComplexity, selectAgentPipelineStrategy } from '../../common/agentPipeline.js';

suite('agentPipeline', () => {
	test('classifyQueryComplexity detects long architectural asks', () => {
		assert.strictEqual(
			classifyQueryComplexity('Refactor the entire agent orchestration layer across multiple services'),
			'complex',
		);
		assert.strictEqual(classifyQueryComplexity('fix typo'), 'simple');
	});

	test('selectAgentPipelineStrategy skips blocking KG preflight for simple queries', () => {
		const s = selectAgentPipelineStrategy('create a package.json file', {
			enableKnowledgeGraph: true,
			baseHistoryLimit: 56,
			baseSemanticMatches: 14,
			profile: 'pro',
		});
		assert.strictEqual(s.complexity, 'simple');
		assert.strictEqual(s.preflightKnowledgeGraph, false);
	});

	test('classifyQueryComplexity keeps scaffold app creation simple', () => {
		const msg = [
			'Create a simple React todo app with package.json, vite.config.ts, src/main.tsx,',
			'src/App.tsx, and a short README. Use TypeScript.',
		].join(' ');
		assert.strictEqual(classifyQueryComplexity(msg), 'simple');
	});

	test('selectAgentPipelineStrategy enables KG preflight for complex queries', () => {
		const s = selectAgentPipelineStrategy('Migrate the monorepo workflow orchestration', {
			enableKnowledgeGraph: true,
			baseHistoryLimit: 56,
			baseSemanticMatches: 14,
			profile: 'pro',
		});
		assert.strictEqual(s.complexity, 'complex');
		assert.strictEqual(s.preflightKnowledgeGraph, true);
		assert.ok(s.historyMessageLimit! <= 36);
	});
});
