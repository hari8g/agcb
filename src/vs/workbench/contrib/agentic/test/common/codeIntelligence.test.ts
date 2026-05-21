/*---------------------------------------------------------------------------------------------
 *  Agentic AI — lexical symbol extraction tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { extractSymbolsLexical } from '../../common/codeIntelligenceTypes.js';

suite('Agentic codeIntelligence', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('extracts TypeScript symbols', () => {
		const content = `export function foo() {}\nclass Bar {}\ninterface Baz {}`;
		const symbols = extractSymbolsLexical(content, 'typescript');
		const names = symbols.map(s => s.name);
		assert.ok(names.includes('foo'));
		assert.ok(names.includes('Bar'));
		assert.ok(names.includes('Baz'));
	});
});
