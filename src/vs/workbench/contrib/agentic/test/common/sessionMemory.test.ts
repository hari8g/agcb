/*---------------------------------------------------------------------------------------------
 *  Agentic AI — session memory tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	buildSessionMemoryPromptBlock,
	extractExplicitUserMemory,
	factsFromProjectScan,
	inferMemoryFromRun,
	mergeFacts,
	createMemoryFact,
} from '../../common/sessionMemory.js';

suite('Agentic sessionMemory', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('extractExplicitUserMemory parses remember and prefer', () => {
		const facts = extractExplicitUserMemory('remember: always run tests with pnpm');
		assert.ok(facts.some(f => f.text.includes('always run tests')));
		const prefer = extractExplicitUserMemory('I prefer functional components in React');
		assert.ok(prefer.some(f => f.text.toLowerCase().includes('prefer')));
	});

	test('factsFromProjectScan captures stack hints', () => {
		const facts = factsFromProjectScan({
			packageName: 'my-app',
			packageManager: 'pnpm',
			hasTypeScript: true,
			monorepo: true,
			testScript: 'vitest run',
		});
		assert.ok(facts.some(f => f.text.includes('pnpm')));
		assert.ok(facts.some(f => f.text.includes('TypeScript')));
	});

	test('mergeFacts dedupes by kind and text', () => {
		const a = createMemoryFact('user_preference', 'Use pnpm', 'user', 1);
		const b = createMemoryFact('user_preference', 'use pnpm', 'user', 2);
		const merged = mergeFacts([a], [b], 10);
		assert.strictEqual(merged.length, 1);
		assert.strictEqual(merged[0]!.weight, 2);
	});

	test('buildSessionMemoryPromptBlock includes project and user sections', () => {
		const block = buildSessionMemoryPromptBlock(
			{
				workspaceKey: 'ws',
				tags: ['pnpm', 'typescript'],
				facts: [createMemoryFact('stack', 'TypeScript project', 'project_scan', 1)],
				updatedAt: Date.now(),
			},
			{
				workspaceKey: 'ws',
				facts: [createMemoryFact('user_preference', 'Prefer small PRs', 'user', 1)],
				updatedAt: Date.now(),
			},
		);
		assert.ok(block.includes('<session_memory>'));
		assert.ok(block.includes('Project model'));
		assert.ok(block.includes('User preferences'));
		assert.ok(block.includes('Prefer small PRs'));
	});

	test('inferMemoryFromRun records edit paths', () => {
		const facts = inferMemoryFromRun({
			userMessage: 'fix auth',
			intent: 'fix_bug',
			targetPaths: ['src/auth.ts'],
			successfulEditPaths: ['src/auth.ts'],
		});
		assert.ok(facts.some(f => f.text.includes('src/auth.ts')));
	});
});
