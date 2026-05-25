/*---------------------------------------------------------------------------------------------
 *  Agentic AI — symbol impact analysis tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	buildPreflightTargetReadsBlock,
	buildSymbolImpactPromptBlock,
	enrichWorkflowImpactWithSymbols,
} from '../../common/symbolImpactAnalysis.js';

suite('Agentic symbolImpactAnalysis', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('enrichWorkflowImpactWithSymbols adds symbol relation paths', () => {
		const impact = enrichWorkflowImpactWithSymbols(
			{
				primaryTargets: ['src/a.ts'],
				affectedPaths: [{ path: 'src/a.ts', relation: 'direct' }],
				riskLevel: 'medium',
				suggestedVerification: [],
				blastRadiusSummary: '1 direct target.',
			},
			{
				references: [
					{ symbol: 'foo', path: 'src/b.ts', line: 10, source: 'lsp' },
				],
				anchorsByFile: [{ path: 'src/a.ts', symbols: ['foo'] }],
			},
		);
		assert.ok(impact.affectedPaths.some(a => a.relation === 'symbol' && a.path === 'src/b.ts'));
		assert.ok(impact.blastRadiusSummary.includes('Symbol impact'));
	});

	test('buildPreflightTargetReadsBlock includes file snippets', () => {
		const block = buildPreflightTargetReadsBlock([
			{ path: 'pkg.json', content: '{ "name": "x" }', truncated: false },
		]);
		assert.ok(block.includes('<preflight_target_reads>'));
		assert.ok(block.includes('pkg.json'));
	});

	test('buildSymbolImpactPromptBlock lists references', () => {
		const block = buildSymbolImpactPromptBlock({
			references: [{ symbol: 'Auth', path: 'src/util.ts', line: 3, source: 'index' }],
			anchorsByFile: [],
		});
		assert.ok(block.includes('<symbol_impact>'));
		assert.ok(block.includes('Auth'));
	});
});
