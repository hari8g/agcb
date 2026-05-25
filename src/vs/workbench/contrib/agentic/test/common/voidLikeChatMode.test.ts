/*---------------------------------------------------------------------------------------------
 *  Void-like chat mode tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { resolveAgentRunUiMode, voidLikeMaxPlanNudges } from '../../common/voidLikeChatMode.js';

suite('voidLikeChatMode', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('simple agent mode uses void-simple UI', () => {
		assert.strictEqual(
			resolveAgentRunUiMode({
				complexity: 'simple',
				planOnlyMode: false,
				agentModeId: 'agent',
			}),
			'void-simple',
		);
	});

	test('plan mode stays orchestrated', () => {
		assert.strictEqual(
			resolveAgentRunUiMode({
				complexity: 'simple',
				planOnlyMode: false,
				agentModeId: 'plan',
			}),
			'orchestrated',
		);
	});

	test('void-simple caps plan nudges', () => {
		assert.strictEqual(voidLikeMaxPlanNudges('void-simple'), 1);
		assert.strictEqual(voidLikeMaxPlanNudges('orchestrated'), 5);
	});
});
