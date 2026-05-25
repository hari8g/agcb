/*--------------------------------------------------------------------------------------
 *  Agentic AI — turn budget tests
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	resolveEffectiveMaxAgentTurns,
	shouldGrantProgressExtension,
	applyProgressExtension,
	createLoopProgressState,
	recordModelTurnOutcome,
} from '../../common/agentLoopBudget.js';

suite('agentLoopBudget', () => {
	test('migrates legacy maxAgentTurns 12 to profile budget', () => {
		const turns = resolveEffectiveMaxAgentTurns({
			maxAgentTurns: 12,
			capabilityProfile: 'pro',
		});
		assert.ok(turns >= 40);
	});

	test('pro profile at least 40 turns', () => {
		assert.ok(resolveEffectiveMaxAgentTurns({
			maxAgentTurns: 40,
			capabilityProfile: 'pro',
		}) >= 40);
	});

	test('grants progress extension when tools ran', () => {
		const state = createLoopProgressState();
		recordModelTurnOutcome(state, 2);
		assert.strictEqual(shouldGrantProgressExtension(state, 40, 40), true);
	});

	test('applyProgressExtension increases limit', () => {
		const state = createLoopProgressState();
		const next = applyProgressExtension(state, 40);
		assert.ok(next > 40);
		assert.strictEqual(state.progressExtensionsGranted, 1);
	});
});
